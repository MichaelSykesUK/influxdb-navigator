import akka.actor.ActorSystem
import akka.http.scaladsl.Http
// To avoid ambiguity with Spark's concat function, we alias the Akka HTTP concat directive.
import akka.http.scaladsl.server.Directives.{concat => routeConcat, _}
import akka.http.scaladsl.server.Route
import akka.stream.Materializer
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import spray.json._
import spray.json.DefaultJsonProtocol._
import org.apache.spark.sql.{SparkSession, DataFrame}
import scala.jdk.CollectionConverters._
import scala.concurrent.ExecutionContextExecutor
import com.influxdb.v3.client.InfluxDBClient
import com.influxdb.v3.client.query.{QueryOptions, QueryType}
import io.github.cdimascio.dotenv.Dotenv

// --- Request/Response Models ---
case class QueryParams(table: String, start_time: String, end_time: String)
case class SQLTransformParams(sql: String, data: List[Map[String, String]])
case class SQLJoinParams(
  left_data: List[Map[String, String]],
  right_data: List[Map[String, String]],
  left_join_column: String,
  right_join_column: String,
  join_type: String
)
case class ApiResponse(data: List[JsValue], columns: List[String])

// --- JSON support for our case classes ---
trait JsonSupport {
  implicit val queryParamsFormat: RootJsonFormat[QueryParams] = jsonFormat3(QueryParams)
  implicit val sqlTransformParamsFormat: RootJsonFormat[SQLTransformParams] = jsonFormat2(SQLTransformParams)
  implicit val sqlJoinParamsFormat: RootJsonFormat[SQLJoinParams] = jsonFormat5(SQLJoinParams)
  implicit val apiResponseFormat: RootJsonFormat[ApiResponse] = jsonFormat2(ApiResponse)
}

object InfluxSparkApi extends App with JsonSupport {

  // Load environment variables (from the parent directory, adjust as needed)
  val dotenv: Dotenv = Dotenv.configure().directory("../").load()
  val token: String = Option(dotenv.get("TOKEN")).getOrElse("my-token")
  val host: String = Option(dotenv.get("HOST")).getOrElse("http://localhost:8086")
  val database: String = Option(dotenv.get("DATABASE")).getOrElse("my-database")
  println(s"Connecting to InfluxDB at host: $host, database: $database, token starts with: ${token.take(4)}...")

  // Create the InfluxDB client
  val influxDBClient: InfluxDBClient =
    InfluxDBClient.getInstance(host, token.toCharArray, database)

  // Set up Akka and Spark
  implicit val system: ActorSystem = ActorSystem("influx-spark-api")
  implicit val materializer: Materializer = Materializer(system)
  implicit val executionContext: ExecutionContextExecutor = system.dispatcher

  val spark: SparkSession = SparkSession.builder()
    .appName("InfluxSparkApi")
    .master("local[*]")
    .getOrCreate()

  // --- Business Logic Functions ---

  // Measurements endpoint (using InfluxQL)
  def getMeasurements: List[String] = {
    val query = "SHOW MEASUREMENTS"
    try {
      val options = new QueryOptions(QueryType.InfluxQL)
      val javaStream = influxDBClient.query(query, options)
      val rows = javaStream.iterator().asScala.toList
      rows.foreach(arr => println(arr.mkString("Array(", ", ", ")")))
      // Assuming measurement name is in index 1
      val measurements = rows.collect {
        case arr: Array[Any] if arr.length > 1 => arr(1).toString
      }
      println(s"Parsed measurements: $measurements")
      measurements.distinct
    } catch {
      case e: Exception =>
        println(s"getMeasurements error: ${e.getMessage}")
        e.printStackTrace()
        throw e
    }
  }

  // Query a measurement using the SQL query type.
  // This version first issues SHOW FIELD KEYS and SHOW TAG KEYS,
  // then constructs a SQL query that explicitly selects those columns.
  def queryMeasurementData(measurement: String, startTime: String, endTime: String): DataFrame = {
    // Get field keys and tag keys
    val fieldKeysQuery = s"""SHOW FIELD KEYS FROM "$measurement""""
    val tagKeysQuery = s"""SHOW TAG KEYS FROM "$measurement""""
    val optionsInfluxQL = new QueryOptions(QueryType.InfluxQL)

    val fieldRows = influxDBClient.query(fieldKeysQuery, optionsInfluxQL).iterator().asScala.toList
    val tagRows = influxDBClient.query(tagKeysQuery, optionsInfluxQL).iterator().asScala.toList

    // Assume the column name is at index 1 in each returned row.
    val fieldKeys = fieldRows.collect {
      case arr: Array[Any] if arr.length > 1 => arr(1).toString
    }
    val tagKeys = tagRows.collect {
      case arr: Array[Any] if arr.length > 1 => arr(1).toString
    }

    // Build the column list: "time" plus all tags and fields.
    val columns: List[String] = "time" :: (tagKeys ++ fieldKeys).toList

    // Build a SQL query that explicitly selects these columns (wrap non-"time" columns in double quotes)
    val columnsSQL = columns.map {
      case "time" => "time"
      case col    => s""""$col""""
    }.mkString(", ")

    val sql = s"""SELECT $columnsSQL FROM "$measurement" WHERE time >= '$startTime' AND time <= '$endTime'"""
    println(s"Constructed SQL: $sql")

    // Query using the SQL query type:
    val options = new QueryOptions(QueryType.SQL)
    val javaStream = influxDBClient.query(sql, options)
    val rows = javaStream.iterator().asScala.toList
    println("First two rows from Influx query (raw):")
    rows.take(2).foreach(row => println(row.mkString("[", ", ", "]")))

    // Map each row (an Array[Any]) to a Map with header names as keys.
    // Here we force conversion by mapping over the pairs.
    val data: List[Map[String, String]] = rows.map { arr =>
      columns.zip(arr).toMap.map { case (k, v) => (k, v.toString) }
    }
    import spark.implicits._
    val jsonDS = spark.createDataset(data.map(_.toJson.toString()))
    val df = spark.read.json(jsonDS)
    df
  }

  // SQL transformation endpoint: run a given SQL statement on data.
  def sqlTransform(sql: String, data: List[Map[String, String]]): DataFrame = {
    import spark.implicits._
    val jsonDS = spark.createDataset(data.map(_.toJson.toString()))
    val df = spark.read.json(jsonDS)
    df.createOrReplaceTempView("data")
    spark.sql(sql)
  }

  // SQL join endpoint: join two datasets.
  def sqlJoin(
      leftData: List[Map[String, String]],
      rightData: List[Map[String, String]],
      leftJoinColumn: String,
      rightJoinColumn: String,
      joinType: String
  ): DataFrame = {
    import spark.implicits._
    val leftDS = spark.createDataset(leftData.map(_.toJson.toString()))
    val rightDS = spark.createDataset(rightData.map(_.toJson.toString()))
    val dfLeft = spark.read.json(leftDS)
    val dfRight = spark.read.json(rightDS)
    dfLeft.join(dfRight, dfLeft(leftJoinColumn) === dfRight(rightJoinColumn), joinType)
  }

  // --- API Routes ---
  val apiRoutes: Route = routeConcat(
    // Measurements endpoint (returns JSON with "measurements")
    path("api" / "measurements") {
      get {
        val measurements = getMeasurements
        complete(Map("measurements" -> measurements))
      }
    },
    // Query table endpoint: uses our new header–mapping approach.
    path("api" / "query_table") {
      post {
        entity(as[QueryParams]) { qp =>
          val df = queryMeasurementData(qp.table, qp.start_time, qp.end_time)
          val data: List[JsValue] = df.toJSON.collect().toList.map(_.parseJson)
          complete(ApiResponse(data, df.columns.toList))
        }
      }
    },
    // SQL transformation endpoint
    path("api" / "sql_transform") {
      post {
        entity(as[SQLTransformParams]) { params =>
          val transformedDF = sqlTransform(params.sql, params.data)
          val data: List[JsValue] = transformedDF.toJSON.collect().toList.map(_.parseJson)
          complete(ApiResponse(data, transformedDF.columns.toList))
        }
      }
    },
    // SQL join endpoint
    path("api" / "sql_join") {
      post {
        entity(as[SQLJoinParams]) { params =>
          val joinedDF = sqlJoin(
            params.left_data,
            params.right_data,
            params.left_join_column,
            params.right_join_column,
            params.join_type
          )
          val filledDF = joinedDF.na.fill("NaN")
          val data: List[JsValue] = filledDF.toJSON.collect().toList.map(_.parseJson)
          complete(ApiResponse(data, filledDF.columns.toList))
        }
      }
    }
  )

  // Serve static files (frontend)
  val staticRoutes: Route = get {
    pathSingleSlash {
      getFromFile("../frontend/index.html")
    } ~
    pathPrefix("") {
      getFromDirectory("../frontend")
    }
  }

  val allRoutes: Route = routeConcat(apiRoutes, staticRoutes)

  // Start the HTTP server
  val bindingFuture = Http().newServerAt("0.0.0.0", 8080).bind(allRoutes)
  println("Server online at http://localhost:8080/\nPress Ctrl+C to stop...")

  sys.addShutdownHook {
    bindingFuture.flatMap(_.unbind()).onComplete { _ =>
      spark.stop()
      influxDBClient.close()
      system.terminate()
    }
  }

  while (true) {
    Thread.sleep(60000)
  }
}

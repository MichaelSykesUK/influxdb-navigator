import logging
import os
import uuid
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pyspark.sql import SparkSession, DataFrame
import backend.tools as tools

# ------------------------------------------------------------------------------
# Logging setup
# ------------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, force=True)
logger = logging.getLogger(__name__)

# ------------------------------------------------------------------------------
# Load environment variables
# ------------------------------------------------------------------------------
load_dotenv()

TOKEN = os.getenv("TOKEN")
HOST = os.getenv("HOST")
DATABASE = os.getenv("DATABASE")

# ------------------------------------------------------------------------------
# Initialize FastAPI app
# ------------------------------------------------------------------------------
app = FastAPI(title="InfluxDB PySpark Query API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------------------
# Initialize SparkSession (configurable for cluster)
# ------------------------------------------------------------------------------
spark = SparkSession.builder \
    .appName("InfluxDBQueryAPI") \
    .master("local[*]") \
    .getOrCreate()
# For cluster usage, change .master("yarn") or your preferred config

# ------------------------------------------------------------------------------
# Global in-memory store for Spark DataFrames
# ------------------------------------------------------------------------------
dataframe_store = {}


def store_dataframe(df: DataFrame) -> str:
    """
    Store a Spark DataFrame in the global dictionary and return a unique dataset_id.
    """
    dataset_id = str(uuid.uuid4())
    dataframe_store[dataset_id] = df
    return dataset_id


def get_dataframe(dataset_id: str) -> DataFrame:
    """
    Retrieve a Spark DataFrame from the global store by its dataset_id.
    Raises ValueError if not found.
    """
    df = dataframe_store.get(dataset_id)
    if df is None:
        raise ValueError(f"No DataFrame found for dataset_id: {dataset_id}")
    return df


# ------------------------------------------------------------------------------
# Helper function to convert Spark DataFrame to API response
# ------------------------------------------------------------------------------
def df_to_api_response(df: DataFrame, limit: int = None) -> dict:
    """
    Collect rows from the Spark DataFrame into a JSON-serializable format,
    ensuring the total number of cells (rows * columns) does not exceed 100,000.

    If a row limit is provided, the function will use the smaller value between
    the provided limit and the maximum rows allowed by the cell limit.

    Returns a dict with "data" and "columns".
    """
    columns = df.columns
    num_columns = len(columns)

    # Calculate the maximum rows allowed given the 100,000 cell cap.
    max_rows_allowed = 10000000 // num_columns if num_columns > 0 else 0

    # Use the provided limit if it is lower; otherwise, use the cell limit.
    effective_limit = min(limit, max_rows_allowed) if limit is not None else max_rows_allowed

    limited_df = df.limit(effective_limit)
    data = [row.asDict() for row in limited_df.collect()]
    return {"data": data, "columns": columns}


# ------------------------------------------------------------------------------
# Pydantic models
# ------------------------------------------------------------------------------
class QueryParams(BaseModel):
    table: str
    start_time: str
    end_time: str


class SQLTransformParams(BaseModel):
    parent_dataset_id: str
    sql: str


class SQLJoinParams(BaseModel):
    left_dataset_id: str
    right_dataset_id: str
    left_join_column: str
    right_join_column: str
    join_type: str


# ------------------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------------------
@app.get("/api/measurements")
def get_measurements():
    """
    Return a list of measurements from InfluxDB.
    """
    try:
        cert = tools.read_certificate()
        client = tools.create_influxdb_client(
            token=TOKEN, host=HOST, database=DATABASE, cert=cert
        )
        measurements = tools.query_influx_measurements(client)
        logger.info(f"Measurements: {measurements}")
        return {"measurements": measurements}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/query_table")
async def query_table_endpoint(query_params: QueryParams):
    """
    Query data from InfluxDB, convert it to a Spark DataFrame, store it in the
    backend, and return a dataset_id plus a preview.
    """
    try:
        cert = tools.read_certificate()
        client = tools.create_influxdb_client(
            token=TOKEN, host=HOST, database=DATABASE, cert=cert
        )
        # Query InfluxDB -> Pandas DataFrame
        table, df_pandas = tools.query_table_with_retries(
            client, query_params.table, query_params.start_time, query_params.end_time
        )

        # Convert Pandas DataFrame to Spark DataFrame
        df_spark = spark.createDataFrame(df_pandas)

        # Example: create an extra column if needed
        if "time" in df_spark.columns:
            df_spark = df_spark.withColumn("time_ns", df_spark["time"].cast("long"))

        logger.info(f"Original Spark DataFrame schema: {df_spark.schema}")

        # Store the DataFrame in memory and get a unique ID
        dataset_id = store_dataframe(df_spark)

        # Return a preview with a dynamic row limit (default preview limit is 100 rows or fewer)
        preview = df_to_api_response(df_spark)

        return {
            "dataset_id": dataset_id,
            "preview": preview
        }

    except Exception as e:
        logger.error(f"Error querying data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sql_transform")
async def sql_transform_endpoint(params: SQLTransformParams):
    """
    Perform a SQL transform on a previously stored DataFrame, producing a new DataFrame.
    The parent DataFrame is referenced by parent_dataset_id. We store the resulting
    DataFrame and return a new dataset_id plus a preview.
    """
    try:
        # 1. Get the parent DataFrame from the store
        parent_df = get_dataframe(params.parent_dataset_id)

        # 2. Create or replace a temp view to run Spark SQL
        parent_df.createOrReplaceTempView("df")

        logger.info(f"Running SQL transform on dataset {params.parent_dataset_id}:\n{params.sql}")

        # 3. Execute the SQL query
        result_df = spark.sql(params.sql)

        # 4. Store the result as a new DataFrame
        new_dataset_id = store_dataframe(result_df)

        # 5. Return a preview of the new DataFrame
        preview = df_to_api_response(result_df)

        return {
            "dataset_id": new_dataset_id,
            "preview": preview
        }

    except Exception as e:
        logger.error(f"Error in SQL transform: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sql_join")
async def sql_join_endpoint(params: SQLJoinParams):
    """
    Join two previously stored DataFrames by their dataset IDs, produce a new
    DataFrame, store it, and return a new dataset_id plus a preview.
    Now includes a check for a 'time' column to sort the results.
    """
    try:
        # 1. Retrieve DataFrames from store
        df_left = get_dataframe(params.left_dataset_id)
        df_right = get_dataframe(params.right_dataset_id)

        logger.info(f"Performing {params.join_type} join on columns "
                    f"'{params.left_join_column}' and '{params.right_join_column}'")

        # 2. (Optional) Rename columns in df_right to avoid conflicts
        #    except for the join column, if you want "side-by-side" merges.
        for col in df_right.columns:
            if col != params.right_join_column:
                df_right = df_right.withColumnRenamed(col, f"{col}_right")

        # 3. Perform the join
        result_df = df_left.join(
            df_right,
            df_left[params.left_join_column] == df_right[params.right_join_column],
            how=params.join_type
        ).na.fill("NaN")

        # 4. Check if 'time' column exists, then order by 'time'
        if "time" in result_df.columns:
            result_df = result_df.orderBy("time")

        # 5. Store and return preview
        new_dataset_id = store_dataframe(result_df)
        preview = df_to_api_response(result_df)

        return {
            "dataset_id": new_dataset_id,
            "preview": preview
        }

    except Exception as e:
        logger.error(f"Error in SQL join: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/dataset/{dataset_id}")
def get_stored_dataset(dataset_id: str, limit: int = 100):
    """
    Retrieve a preview of a stored dataset by its ID.
    """
    try:
        df = get_dataframe(dataset_id)
        return df_to_api_response(df)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------------------------------------------------
# Mount static files (if you have a frontend build to serve)
# ------------------------------------------------------------------------------
app.mount("/", StaticFiles(directory="frontend", html=True), name="static")


# ------------------------------------------------------------------------------
# Shutdown hook (optional)
# ------------------------------------------------------------------------------
@app.on_event("shutdown")
def shutdown_event():
    spark.stop()

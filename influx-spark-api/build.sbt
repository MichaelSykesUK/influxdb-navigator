name := "InfluxSparkApi"

version := "0.1"

scalaVersion := "2.13.11"

libraryDependencies ++= Seq(
  "com.typesafe.akka" %% "akka-http"            % "10.2.9",
  "com.typesafe.akka" %% "akka-stream"          % "2.6.19",
  "com.typesafe.akka" %% "akka-actor-typed"     % "2.6.19",
  "com.typesafe.akka" %% "akka-http-spray-json" % "10.2.9",
  "org.apache.spark"  %% "spark-core"           % "3.3.0" exclude("org.apache.logging.log4j", "log4j-slf4j-impl")
                        exclude("org.slf4j", "slf4j-log4j12")
                        exclude("com.fasterxml.jackson.core", "jackson-databind"),
  "org.apache.spark"  %% "spark-sql"            % "3.3.0" exclude("org.apache.logging.log4j", "log4j-slf4j-impl")
                        exclude("org.slf4j", "slf4j-log4j12")
                        exclude("com.fasterxml.jackson.core", "jackson-databind"),
  "com.influxdb"      %  "influxdb3-java"       % "1.0.0" exclude("org.apache.logging.log4j", "log4j-slf4j-impl")
                        exclude("org.slf4j", "slf4j-log4j12")
                        exclude("com.fasterxml.jackson.core", "jackson-databind"),
  // "com.influxdb"    %  "influxdb3-java-arrow" % "1.0.0-SNAPSHOT", // Remove or comment out this dependency
  "org.slf4j"         %  "slf4j-api"            % "1.7.36",
  "ch.qos.logback"    %  "logback-classic"      % "1.4.14",
  "org.slf4j"         %  "slf4j-simple"         % "1.7.36",
  "io.github.cdimascio" % "dotenv-java"         % "3.0.0",
  "io.netty"          %  "netty-all"            % "4.1.108.Final",
  "io.netty"          %  "netty-transport-native-epoll" % "4.1.108.Final" classifier "linux-x86_64",
  "com.fasterxml.jackson.core" % "jackson-databind" % "2.13.5",
  "com.fasterxml.jackson.core" % "jackson-core" % "2.13.5",
  "com.fasterxml.jackson.core" % "jackson-annotations" % "2.13.5",
  "com.fasterxml.jackson.module" %% "jackson-module-scala" % "2.13.5"
)

resolvers ++= Resolver.sonatypeOssRepos("releases") ++ Seq(
  "sonatype-snapshots" at "https://oss.sonatype.org/content/repositories/snapshots"
)

scalacOptions += "-deprecation"

Compile / fork := true

Compile / javaOptions ++= Seq(
  "--add-opens=java.base/java.nio=ALL-UNNAMED",
  "--add-opens=java.base/sun.nio.ch=ALL-UNNAMED",
  "-Dio.netty.transport.noNative=true", // Force NIO to avoid native library issues
  "-Dio.netty.debug=true"               // Enable Netty debug logging
)

Compile / fullClasspath := (Compile / fullClasspath).value

Global / onChangedBuildSource := ReloadOnSourceChanges

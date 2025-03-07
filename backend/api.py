import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import query_tools
import pandas as pd
from collections import OrderedDict
from pandasql import sqldf
from typing import List

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="InfluxDB Query API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CREDENTIALS_PATH = os.path.join(os.getcwd(), "influxdb_credentials.txt")


class QueryParams(BaseModel):
    table: str
    start_time: str
    end_time: str


class SQLTransformParams(BaseModel):
    sql: str
    data: list


class SQLJoinParams(BaseModel):
    left_data: List[dict]
    right_data: List[dict]
    left_join_column: str
    right_join_column: str
    join_type: str


@app.get("/measurements")
def get_measurements():
    try:
        client = query_tools.read_certificate()
        client = query_tools.create_influxdb_client(
            token=query_tools.read_influxdb_credentials(CREDENTIALS_PATH)[
                "token"],
            host=query_tools.read_influxdb_credentials(CREDENTIALS_PATH)[
                "host"],
            database=query_tools.read_influxdb_credentials(CREDENTIALS_PATH)[
                "database"],
            cert=query_tools.read_certificate()
        )
        measurements = query_tools.query_influx_measurements(client)
        logger.info(f"Measurements: {measurements}")
        return {"measurements": measurements}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query_table")
async def query_table_endpoint(query_params: QueryParams):
    try:
        client = query_tools.read_certificate()
        client = query_tools.create_influxdb_client(
            token=query_tools.read_influxdb_credentials(CREDENTIALS_PATH)[
                "token"],
            host=query_tools.read_influxdb_credentials(CREDENTIALS_PATH)[
                "host"],
            database=query_tools.read_influxdb_credentials(CREDENTIALS_PATH)[
                "database"],
            cert=query_tools.read_certificate()
        )
        table, df = query_tools.query_table_with_retries(
            client, query_params.table, query_params.start_time, query_params.end_time)
        if "time" in df.columns:
            df["time_ns"] = df["time"].view("int64")
        dict_data = [OrderedDict((col, row[col])
                                 for col in df.columns) for _, row in df.iterrows()]
        return {"data": dict_data, "columns": list(df.columns)}
    except Exception as e:
        logger.error(f"Error querying data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sql_transform")
async def sql_transform_endpoint(params: SQLTransformParams):
    try:
        df = pd.DataFrame(params.data)
        result_df = sqldf(params.sql, {'df': df})
        dict_data = [OrderedDict((col, row[col]) for col in result_df.columns)
                     for _, row in result_df.iterrows()]
        return {"data": dict_data, "columns": list(result_df.columns)}
    except Exception as e:
        logger.error(f"Error in SQL transform: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sql_join")
async def sql_join_endpoint(params: SQLJoinParams):
    try:
        df_left = pd.DataFrame(params.left_data)
        df_right = pd.DataFrame(params.right_data)

        # Perform the join
        result_df = pd.merge(df_left, df_right, left_on=params.left_join_column,
                             right_on=params.right_join_column, how=params.join_type)

        # Replace NaN values with the string "NAN"
        result_df = result_df.fillna("NaN")

        # Convert to JSON-serializable format
        dict_data = [OrderedDict((col, row[col]) for col in result_df.columns)
                     for _, row in result_df.iterrows()]

        return {"data": dict_data, "columns": list(result_df.columns)}
    except Exception as e:
        logger.error(f"Error in SQL join: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# query_tools.py

import influxdb_client_3 as InfluxDBClient3
from influxdb_client_3 import flight_client_options
import certifi
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from itertools import islice
import sys
import os
import time


def read_certificate():
    """Read the certificate file."""
    with open(certifi.where(), "r") as fh:
        return fh.read()


def read_influxdb_credentials(credentials_path):
    """Read InfluxDB credentials from a file."""
    if not os.path.exists(credentials_path):
        raise FileNotFoundError(
            f"Credentials file '{credentials_path}' not found")

    with open(credentials_path, "r") as f:
        lines = f.read().splitlines()
        return {
            "host": lines[0].strip(),
            "token": lines[1].strip(),
            "database": lines[2].strip(),
        }


def create_influxdb_client(token, host, database, cert):
    """Create and return an InfluxDB client."""
    return InfluxDBClient3.InfluxDBClient3(
        token=token,
        host=host,
        database=database,
        flight_client_options=flight_client_options(tls_root_certs=cert),
    )


def query_influx_measurements(client):
    """Query and return InfluxDB measurements."""
    query = "SHOW MEASUREMENTS"
    result = client.query(query=query, language="influxql")
    result_df = result.to_pandas()
    found_tables_list = result_df["name"].to_list()

    return found_tables_list


def query_table_with_retries(client, table, start_time, end_time):
    """Query a single InfluxDB table with retry on failure."""
    max_retries = 3
    retry_delay = 5

    for attempt in range(max_retries):
        try:
            return query_table_by_row(client, table, start_time, end_time, attempt)
        except Exception as e:
            print(f"Error querying table {table}: {e}")
            if attempt < max_retries - 1:
                print(
                    f"Retrying table {table}: (Attempt {attempt + 2}/{max_retries}) "
                    f"after {retry_delay} seconds..."
                )
                time.sleep(retry_delay)
            else:
                print(
                    f"Critical Error: Max retries reached for table {table}: {e}")
                raise


def query_table_by_row(client, table, start_time, end_time, attempt):
    """Query a table in batches by time and LIMIT, adjusting batch size on retries."""
    initial_batch_size = 100000
    batch_size = initial_batch_size // (2**attempt)
    start_time_cursor = start_time
    all_data_dfs = []

    while True:
        query = (
            f"SELECT * FROM \"{table}\" WHERE time >= '{start_time_cursor}' "
            f"AND time <= '{end_time}' ORDER BY time LIMIT {batch_size}"
        )

        try:
            print(f"Executing query: {query} with batch size {batch_size}")
            table_data = client.query(query=query, language="sql")
            table_data_df = table_data.to_pandas()

            if table_data_df.empty:
                break

            all_data_dfs.append(table_data_df)
            start_time_cursor = table_data_df["time"].iloc[-1] + pd.Timedelta(
                nanoseconds=1
            )

            if len(table_data_df) < batch_size:
                break

        except Exception as e:
            print(
                f"WARNING: Error querying table '{table}' with start time {start_time_cursor}: {e}"
            )
            raise

    if all_data_dfs:
        combined_df = pd.concat(all_data_dfs, ignore_index=True)
    else:
        combined_df = pd.DataFrame()

    return table, combined_df


def query_table(client, table, start_time, end_time):
    """Query a single InfluxDB table."""
    try:
        query = f"SELECT * FROM '{table}' WHERE time >= '{start_time}' AND time <= '{end_time}'"
        table_data = client.query(query=query, language="sql").to_pandas()
        return table, table_data
    except Exception as e:
        print(f"Critical Error: Error querying table {table}: {e}")
        sys.exit(1)


def chunked(iterable, n):
    """Yield successive n-sized chunks from an iterable."""
    it = iter(iterable)
    while True:
        chunk = list(islice(it, n))
        if not chunk:
            break
        yield chunk


def query_influx_normal(client, tables_list, start_time, end_time):
    """Query InfluxDB for timestamps and categorize tables based on data presence."""
    print("Method: 'normal'")
    tables_w_data_dict = {}
    tables_w_data_list = []
    tables_wo_data_list = []

    total_tables = len(tables_list)
    for index, table in enumerate(tables_list):
        print(f"Querying {index + 1}/{total_tables}: '{table}'")
        query = f"SELECT * FROM \"{table}\" WHERE time >= '{start_time}' AND time <= '{end_time}'"
        try:
            table_data = client.query(query=query, language="sql")
            table_data_df = table_data.to_pandas()

            if not table_data_df.empty:
                tables_w_data_dict[table] = table_data_df
                tables_w_data_list.append(table)
            else:
                tables_wo_data_list.append(table)
        except Exception as e:
            print(f"Critical Error: Error querying table {table}: {e}")
            sys.exit(1)

    print(f"Number of tables with data: {len(tables_w_data_dict)}")
    for table, df in tables_w_data_dict.items():
        print(f"Table: {table}, DataFrame Shape: {df.shape}")

    return tables_w_data_dict, tables_w_data_list, tables_wo_data_list


def query_influx_thread_map(client, tables_list, start_time, end_time):
    """Query InfluxDB for timestamps and categorize tables based on data presence."""
    print("Method: ThreadPoolExecutor.map()")

    tables_w_data_dict = {}
    tables_w_data_list = []
    tables_wo_data_list = []

    num_cores = os.cpu_count()
    num_workers = max(num_cores - 1, 1)
    total_tables = len(tables_list)

    try:
        completed = 0
        chunk_size = 100
        chunks = list(chunked(tables_list, chunk_size))
        num_chunks = len(chunks)

        for chunk_index, chunk in enumerate(chunks, start=1):
            print(
                f"Processing chunk {chunk_index}/{num_chunks} with {len(chunk)} tables."
            )
            with ThreadPoolExecutor(max_workers=num_workers) as executor:
                results = executor.map(
                    lambda table: query_table_with_retries(
                        client, table, start_time, end_time
                    ),
                    chunk,
                )

                for table, table_data_df in results:
                    if not table_data_df.empty:
                        tables_w_data_dict[table] = table_data_df
                        tables_w_data_list.append(table)
                    else:
                        tables_wo_data_list.append(table)

                    completed += 1
                    print(
                        f"Finished querying {completed}/{total_tables}: '{table}' "
                        f"(Chunk {chunk_index}/{num_chunks} of chunk size: {chunk_size})"
                    )

        return tables_w_data_dict, tables_w_data_list, tables_wo_data_list

    except Exception as e:
        print(f"Critical error: {e}")
        raise


def query_influx_thread_submit(client, tables_list, start_time, end_time):
    """Query InfluxDB for timestamps and categorize tables based on data presence."""
    print("Method: ThreadPoolExecuter.submit()")
    tables_w_data_dict = {}
    tables_w_data_list = []
    tables_wo_data_list = []

    num_cores = os.cpu_count()
    num_workers = max(num_cores - 1, 1)
    total_tables = len(tables_list)

    try:
        with ThreadPoolExecutor(max_workers=num_workers) as executor:
            futures = {
                executor.submit(
                    query_table_with_retries, client, table, start_time, end_time
                ): table
                for table in tables_list
            }

            completed = 0
            for future in as_completed(futures):
                table = futures[future]
                try:
                    table, table_data_df = future.result()

                    if not table_data_df.empty:
                        tables_w_data_dict[table] = table_data_df
                        tables_w_data_list.append(table)
                    else:
                        tables_wo_data_list.append(table)

                    completed += 1
                    print(
                        f"Finished querying {completed}/{total_tables}: '{table}'")

                except Exception as e:
                    print(f"Error processing table {table}: {e}")
                    raise

        ordered_tables_w_data_dict = {
            table: tables_w_data_dict[table]
            for table in tables_list
            if table in tables_w_data_dict
        }

        return ordered_tables_w_data_dict, tables_w_data_list, tables_wo_data_list

    except Exception as e:
        print(f"Critical error: {e}")
        raise

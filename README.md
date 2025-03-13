# Vertical Data Navigator

Vertical Data Navigator is a web-based visual data workflow tool that lets you query, transform, join, and plot data interactively. Built with a modern frontend and a FastAPI–powered backend, it was designed to work with InfluxDB, enabling you to visually create and link query and transformation steps.

## Overview

The tool provides a canvas (or "whiteboard") where you can create draggable boxes representing different operations:
- **InfluxDB Query:** Fetch available measurements and data from InfluxDB.
- **Table Query:** Define query parameters (table, start/end time) to retrieve data.
- **SQL Transform:** Use either a basic or advanced SQL editor (powered by CodeMirror) to transform your data.
- **Plot:** Configure plots using Chart.js to visualize query or transformed data.
- **Join:** Combine data from multiple sources using SQL join operations.

Each box can be connected with others via dynamic SVG connectors, forming an intuitive visual workflow. The interface also supports inline renaming, dark mode toggling, and configuration save/load for persistence.

## Features

- **InfluxDB Integration:** Quickly list available measurements and run queries against your InfluxDB instance.
- **Visual Workflow Builder:** Create, move, and connect boxes representing different data operations.
- **SQL Transformation:** Offers a basic mode (with dropdown selections for columns and conditions) and an advanced SQL editor.
- **Data Join Capabilities:** Combine results from multiple SQL transforms with customizable join conditions.
- **Interactive Plotting:** Configure x/y axis selections and additional Y-series to generate line charts using Chart.js.
- **Dark Mode:** Toggle between light and dark themes for comfortable viewing.
- **Config Save/Load:** Export your current workspace as a JSON configuration file and reload it later.

## Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript, CodeMirror, Chart.js, FontAwesome, jQuery, and Moment.js.
- **Backend:** Python, FastAPI, and Pandas (with PandasQL for SQL-like transformations).
- **Database:** InfluxDB (accessed via custom helper functions in `query_tools`).

## Installation

### Prerequisites

- **Python 3.7+**
- **Node.js** (optional, if you wish to serve the frontend via a local HTTP server)
- An **InfluxDB** instance with credentials set in a file named `influxdb_credentials.txt` at the project root.

### Process

- Create environment
python -m venv venv
source venv/bin/activate   # On Windows use: venv\Scripts\activate

- Install the python dependencies
pip install -r requirements.txt

- Configure InfluxDB Credentials:
Ensure that your influxdb_credentials.txt file exists in the project root and contains the necessary details (token, host, database).

- install node modules
npm install

- Run the FastAPI Backend Server:
uvicorn main:app --reload

- Serve via a Local HTTP Server:
npx http-server .

## Usage

### Startup:
The application opens with an InfluxDB box that automatically fetches available measurements.

### Building a Workflow:

Click the buttons on any box (e.g., query, transform, plot, or join) to add a new box to your workflow.
Drag boxes around on the whiteboard to adjust layout. Boxes are automatically connected to indicate data flow.
Editing Queries and Transformations:

In Table Query boxes, select the measurement, start time, and end time.
In SQL Transform boxes, choose between basic mode (using dropdowns for SELECT/WHERE clauses) and advanced mode (with a CodeMirror SQL editor).
In Plot boxes, choose columns for the x-axis and one or more y-axes to render interactive charts.
In Join boxes, configure join type and select join columns from parent boxes.
Running Queries:
Click the Run button to execute the query or transformation for the currently selected box. Results and any generated visualizations are displayed in the results panel.

### Saving and Loading Configurations:
Use the Save Config button to download your workflow as a JSON file, and the Load Config button to restore a saved configuration.




### Running the App with Local Credentials

1. Prepare an `influxdb_credentials.txt` file with your InfluxDB credentials:

token=your-influxdb-token
host=your-influxdb-host
database=your-database-name


2. Run the Docker container, mounting your credentials file:
```
docker run -it --rm -p 8000:8000 -v C:\path\influxdb_credentials.txt:/app/backend/influxdb_credentials.txt my-vertical-navigator-app
```

Replace /path/ with the actual path to your file.
On Windows, use C:\path\ (e.g., C:\Users\YourName\credentials\influxdb_credentials.txt).

Access the app at http://localhost:8000/.

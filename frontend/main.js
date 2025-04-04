"use strict";

// ============================================================
// Global Variables
// ============================================================
let connectors = [];
let tableQueryCounter = 1;
let sqlTransformCounter = 1;
let plotCounter = 1;
let joinCounter = 1;
let selectedBox = null;
let boxState = {}; // Stores each box's settings, including query parameters, dataset_id, preview, etc.
let boxIdCounter = 0;
let measurementsData = [];
let currentChart = null;
let boxes = [];
let sqlEditorCM;
let joinLinkingSource = null;
let plotYState = {};     // For dynamic Y-axis rows in plot boxes.
let transWhereState = {}; // For dynamic additional WHERE rows in SQL boxes.

// ============================================================
// Dark Mode Toggle Functionality
// ============================================================
function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
}

// ============================================================
// Save the state of the currently selected box before switching
// ============================================================
function saveCurrentBoxState() {
  if (!selectedBox) return;
  const boxId = selectedBox.id;
  const type = selectedBox.dataset.type;
  const state = boxState[boxId] || {};

  if (type === "table") {
    state.table = document.getElementById("tableQueryDisplay").textContent.trim();
    state.start_time = document.getElementById("startTime").value.trim();
    state.end_time = document.getElementById("endTime").value.trim();
  } else if (type === "sql") {
    state.selectClause = document.getElementById("selectDisplay").textContent.trim();
    state.whereClause = document.getElementById("whereDisplay").textContent.trim();
    state.whereOperator = document.getElementById("operatorDisplay").textContent.trim();
    state.whereValue = document.getElementById("whereValue").value.trim();
    const container = document.getElementById("additionalWhereContainer");
    const conditions = [];
    Array.from(container.getElementsByClassName("where-condition")).forEach(row => {
      const colElem = row.querySelector(".where-button span");
      const opElem = row.querySelector(".operator-button span");
      const valElem = row.querySelector(".whereValue");
      const logicElem = row.querySelector(".where-operator-label");
      const col = colElem ? colElem.textContent.trim() : "";
      const operator = opElem ? opElem.textContent.trim() : "=";
      const value = valElem ? valElem.value.trim() : "";
      const logic = logicElem ? logicElem.textContent.trim() : "";
      conditions.push({ column: col, operator, value, logic });
    });
    state.additionalWhere = conditions;
    state.basicSQL = document.getElementById("basicSQLPreview").innerText;
    state.advancedSQL = sqlEditorCM.getValue();
    state.sqlMode = state.sqlMode || "basic";
  } else if (type === "plot") {
    let xVal = document.getElementById("xSelectDisplay").textContent.trim();
    state.xField = (xVal && xVal !== "Select a column") ? xVal : "";
    let yVal = document.getElementById("ySelectDisplay").textContent.trim();
    state.yField = (yVal && yVal !== "Select a column") ? yVal : "";
    let additionalYFields = [];
    document.querySelectorAll("#ySelectContainer .form-group").forEach(group => {
      let btn = group.querySelector("button");
      let val = btn.dataset.selected || btn.querySelector("span").textContent.trim();
      additionalYFields.push(val);
    });
    state.additionalYFields = additionalYFields;
  } else if (type === "join") {
    state.joinType = document.getElementById("joinTypeDisplay").textContent.trim();
    state.leftJoinColumn = document.getElementById("leftJoinColumnDisplay").textContent.trim();
    state.rightJoinColumn = document.getElementById("rightJoinColumnDisplay").textContent.trim();
  }
  boxState[boxId] = state;
  console.log("Saved state for", boxId, boxState[boxId]);
}

// ============================================================
// Utility Functions for Dropdowns
// ============================================================
function updateDropdownMenu(menuID, buttonID, searchClass, optionClass, options, callback) {
  let menu = document.getElementById(menuID);
  if (!menu) {
    console.error("Menu element is null for button:", buttonID);
    return;
  }
  addDropdownSearch(menu, searchClass, optionClass);
  addClearOption(menu, optionClass, buttonID);
  populateDropdown(menu, options, optionClass, buttonID, callback);
}

function updateDropdownMenuMulti(menuID, buttonID, searchClass, optionClass, options, callback) {
  let menu = document.getElementById(menuID);
  if (!menu) {
    console.error("Menu element is null for button:", buttonID);
    return;
  }
  addDropdownSearch(menu, searchClass, optionClass);
  addClearOption(menu, optionClass, buttonID);
  populateDropdownMulti(menu, options, optionClass, buttonID, callback);
}

// ============================================================
// Update Transform/Plot/Join Dropdowns Using Parent's Preview Columns
// ============================================================
function updateTransformDropdowns(boxId) {
  const state = boxState[boxId] || {};
  let cols = getParentColumns(boxId);
  updateDropdownMenuMulti("selectDropdownMenu", "selectButton", "dropdown-search", "select-option", cols, function(selectedOptions) {
    state.selectClause = selectedOptions.join(", ");
  });
  updateDropdownMenu("whereDropdownMenu", "whereButton", "dropdown-search", "where-option", cols, function(selectedOption) {
    state.whereClause = selectedOption;
  });
  for (let i = 1; i <= (state.additionalWhere || []).length; i++) {
    updateDropdownMenu(
      `additionalWhereDropdownMenu_${i}`,
      `additionalWhereButton_${i}`,
      "dropdown-search",
      "where-option",
      cols,
      function(selectedOption) {
        state.additionalWhere[i-1].column = selectedOption;
      }
    );
  }
  updateSQLFromBasic();
}

function updatePlotDropdowns(boxId) {
  const state = boxState[boxId];
  const cols = getParentColumns(boxId);
  updateDropdownMenu("xSelectDropdownMenu", "xSelectButton", "dropdown-search", "plot-option", cols, (selected) => {
    state.xField = selected;
    document.getElementById("xSelectDisplay").textContent = selected;
  });
  updateDropdownMenu("ySelectDropdownMenu", "ySelectButton", "dropdown-search", "plot-option", cols, (selected) => {
    state.yField = selected;
    document.getElementById("ySelectDisplay").textContent = selected;
  });
  state.additionalYFields.forEach((yVal, i) => {
    const menu = document.getElementById(`ySelectDropdownMenu_${i}`);
    if (menu) {
      updateDropdownMenu(menu, `ySelectButton_${i}`, "dropdown-search", "plot-option", cols, (selected) => {
        state.additionalYFields[i - 1] = selected;
        document.getElementById(`ySelectDisplay_${i}`).textContent = selected;
      });
    }
  });
}

function updateJoinDropdowns(joinBoxId) {
  let joinStateObj = boxState[joinBoxId];
  if (!joinStateObj) return;
  if (!joinStateObj.leftParent || !joinStateObj.rightParent) {
    console.warn("Join box", joinBoxId, "is missing leftParent or rightParent.");
    return;
  }
  let leftParentState = boxState[joinStateObj.leftParent];
  let rightParentState = boxState[joinStateObj.rightParent];
  if (!leftParentState || !leftParentState.columns || !rightParentState || !rightParentState.columns) {
    console.warn("Parent columns not available yet for join box:", joinBoxId);
    return;
  }
  let leftJoinMenu = document.getElementById("leftJoinDropdownMenu");
  let rightJoinMenu = document.getElementById("rightJoinDropdownMenu");
  addDropdownSearch(leftJoinMenu, "dropdown-search", "join-option");
  populateDropdown(leftJoinMenu, leftParentState.columns, "join-option", "leftJoinColumnButton", function(selectedOption) {
    boxState[selectedBox.id].leftJoinColumn = selectedOption;
  });
  addDropdownSearch(rightJoinMenu, "dropdown-search", "join-option");
  populateDropdown(rightJoinMenu, rightParentState.columns, "join-option", "rightJoinColumnButton", function(selectedOption) {
    boxState[selectedBox.id].rightJoinColumn = selectedOption;
  });
}

// ============================================================
// Helper to Get Parent Columns from Stored Preview
// ============================================================
function getParentColumns(boxId) {
  let currState = boxState[boxId];
  if (!currState) return [];
  let parentState = boxState[currState.parent];
  if (parentState && parentState.columns && parentState.columns.length > 0) {
    return parentState.columns;
  }
  return [];
}

function loadSQLBoxState(boxId) {
  const state = boxState[boxId];
  if (!state) return;
  document.getElementById("selectDisplay").textContent = state.selectClause || "Select columns";
  document.getElementById("whereDisplay").textContent = state.whereClause || "Select columns";
  document.getElementById("operatorDisplay").textContent = state.whereOperator || "=";
  document.getElementById("whereValue").value = state.whereValue || "";
  const container = document.getElementById("additionalWhereContainer");
  container.innerHTML = "";
  if (state.additionalWhere && state.additionalWhere.length > 0) {
    state.additionalWhere.forEach(cond => addWhereRow(cond.logic, null, cond));
  }
}

// ============================================================
// addWhereRow: Dynamically Add an Additional WHERE Row
// ============================================================
function addWhereRow(operatorLabel, e, rowData = null) {
  if (e) e.preventDefault();
  const currentCount = transWhereState[selectedBox.id] || 0;
  const newCount = currentCount + 1;
  transWhereState[selectedBox.id] = newCount;
  const index = newCount;
  const container = document.getElementById("additionalWhereContainer");
  const groupDiv = document.createElement("div");
  groupDiv.className = "sql-row where-condition";
  const savedColumn = rowData && rowData.column ? rowData.column : "Select columns";
  const savedOperator = rowData && rowData.operator ? rowData.operator : "=";
  const savedValue = rowData && rowData.value ? rowData.value : "";
  const savedLogic = rowData && rowData.logic ? rowData.logic : operatorLabel;
  groupDiv.innerHTML = `
    <label class="where-operator-label">${savedLogic}</label>
    <div class="custom-dropdown where-dropdown">
      <button id="additionalWhereButton_${index}" class="where-button" aria-haspopup="true" aria-expanded="false">
        <span id="additionalWhereDisplay_${index}">${savedColumn}</span>
      </button>
      <div id="additionalWhereDropdownMenu_${index}" class="where-dropdown-menu"></div>
    </div>
    <div class="custom-dropdown operator-dropdown">
      <button id="additionalOperatorButton_${index}" class="operator-button" aria-haspopup="true" aria-expanded="false">
        <span id="additionalOperatorDisplay_${index}">${savedOperator}</span>
      </button>
      <div class="operator-dropdown-menu">
        <div class="operator-option" data-value="="><div class="operator-name">=</div></div>
        <div class="operator-option" data-value="<"><div class="operator-name">&lt;</div></div>
        <div class="operator-option" data-value=">"><div class="operator-name">&gt;</div></div>
      </div>
    </div>
    <input type="text" class="whereValue" id="additionalWhereValue_${index}" placeholder="e.g. BAT1" value="${savedValue}">
    <button class="remove-where-btn" title="Remove condition"><i class="fas fa-times-circle"></i></button>
  `;
  groupDiv.querySelectorAll(".whereValue, .where-button, .operator-button, .where-operator-label")
    .forEach(el => {
      el.addEventListener("change", updateSQLFromBasic);
      el.addEventListener("input", updateSQLFromBasic);
      el.addEventListener("click", updateSQLFromBasic);
    });
  container.appendChild(groupDiv);
  const extraWhereButton = groupDiv.querySelector(`#additionalWhereButton_${index}`);
  extraWhereButton.addEventListener("click", function (e) {
    e.stopPropagation();
    const dropdown = groupDiv.querySelector(`#additionalWhereDropdownMenu_${index}`);
    dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
  });
  document.addEventListener("click", function () {
    const dd = document.getElementById(`additionalWhereDropdownMenu_${index}`);
    if (dd) dd.style.display = "none";
  });
  const operatorBtn = groupDiv.querySelector(`#additionalOperatorButton_${index}`);
  operatorBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    const dropdownMenu = groupDiv.querySelector(".operator-dropdown-menu");
    const isExpanded = operatorBtn.getAttribute("aria-expanded") === "true";
    dropdownMenu.style.display = isExpanded ? "none" : "block";
    operatorBtn.setAttribute("aria-expanded", isExpanded ? "false" : "true");
    updateSQLFromBasic();
  });
  groupDiv.querySelectorAll(".operator-option").forEach(function (option) {
    option.addEventListener("click", function () {
      const text = option.querySelector(".operator-name").textContent;
      groupDiv.querySelector(`#additionalOperatorDisplay_${index}`).textContent = text;
      groupDiv.querySelector(".operator-dropdown-menu").style.display = "none";
      operatorBtn.setAttribute("aria-expanded", "false");
      updateSQLFromBasic();
    });
  });
  groupDiv.querySelector(".remove-where-btn").addEventListener("click", function (e) {
    e.preventDefault();
    container.removeChild(groupDiv);
    updateSQLFromBasic();
  });
  let additWhereMenu = document.getElementById(`additionalWhereDropdownMenu_${index}`);
  addDropdownSearch(additWhereMenu, "dropdown-search", "where-option");
  addClearOption(additWhereMenu, "where-option", `additionalWhereButton_${index}`);
  let cols = getParentColumns(selectedBox.id);
  populateDropdown(additWhereMenu, cols, "where-option", `additionalWhereButton_${index}`);
  updateSQLFromBasic();
}

// ============================================================
// addYRow: Dynamically add a Y-axis row for plot boxes.
// ============================================================
function addYRow(e, rowData = null) {
  if (e) e.preventDefault();
  const yContainer = document.getElementById("ySelectContainer");
  let newIndex = yContainer.querySelectorAll(".form-group").length + 1;
  const savedValue = rowData && rowData.value ? rowData.value : "";
  const groupDiv = document.createElement("div");
  groupDiv.className = "form-group";
  groupDiv.innerHTML = `
    <label for="ySelectDisplay_${newIndex}">Y Values:</label>
    <div class="plot-row">
      <div class="custom-dropdown plot-dropdown">
        <button id="ySelectButton_${newIndex}" aria-haspopup="true" aria-expanded="false" data-selected="${savedValue}">
          <span id="ySelectDisplay_${newIndex}">${savedValue || "Select a column"}</span>
        </button>
        <div class="plot-dropdown-menu" id="ySelectDropdownMenu_${newIndex}"></div>
      </div>
      <button class="remove-y-btn" title="Remove Y Value"><i class="fas fa-times-circle"></i></button>
    </div>`;
  yContainer.appendChild(groupDiv);
  const extraButton = groupDiv.querySelector(`#ySelectButton_${newIndex}`);
  extraButton.addEventListener("click", function(e) {
    e.stopPropagation();
    const menu = groupDiv.querySelector(`#ySelectDropdownMenu_${newIndex}`);
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  });
  document.addEventListener("click", function () {
    const dd = document.getElementById(`ySelectDropdownMenu_${newIndex}`);
    if (dd) dd.style.display = "none";
  });
  groupDiv.querySelector(".remove-y-btn").addEventListener("click", function(e) {
    e.preventDefault();
    groupDiv.remove();
    let newYFields = [];
    yContainer.querySelectorAll(".custom-dropdown button").forEach(btn => {
      let val = btn.dataset.selected || btn.querySelector("span").textContent.trim();
      if(val && val !== "Select a column") newYFields.push(val);
    });
    boxState[selectedBox.id].additionalYFields = newYFields;
  });
  let menu = document.getElementById(`ySelectDropdownMenu_${newIndex}`);
  addDropdownSearch(menu, "dropdown-search", "plot-option");
  addClearOption(menu, "plot-option", `ySelectButton_${newIndex}`);
  let cols = getParentColumns(selectedBox.id);
  populateDropdown(menu, cols, "plot-option", `ySelectButton_${newIndex}`, function(selectedOption) {
    extraButton.dataset.selected = selectedOption;
    let state = boxState[selectedBox.id];
    if (!state.additionalYFields) state.additionalYFields = [];
    state.additionalYFields[newIndex - 1] = selectedOption;
  });
}

// ============================================================
// runQuery: Execute query/transform/join/plot based on box type
// ============================================================
function runQuery() {
  if (!selectedBox) {
    alert("Select a box first.");
    return;
  }
  boxState[selectedBox.id].task_running = true;
  setRunButtonLoading(true);
  const state = boxState[selectedBox.id];

  if (selectedBox.dataset.type === "influx") {
    fetch("/api/measurements")
      .then(response => response.json())
      .then(data => {
        measurementsData = data.measurements || [];
        updateDropdownMenu("tableDropdownMenu", "tableQueryButton", "dropdown-search", "table-option", measurementsData, function(selectedOption) {
          state.table = selectedOption;
        });
        if (measurementsData.length === 0) {
          const noDataMessage = "InfluxDB returned no measurements.";
          document.getElementById("tableContainer").innerHTML = noDataMessage;
          state.result = noDataMessage;
          state.data = [];
        } else {
          let resultArray = measurementsData.map(m => ({ "InfluxDB Tables": m }));
          resultArray._columns = Object.keys(resultArray[0] || {});
          displayTable(resultArray);
          state.result = document.getElementById("tableContainer").innerHTML;
          state.data = resultArray;
        }
        state.header = document.getElementById("tableHeader").textContent;
        boxState[selectedBox.id].task_running = false;
        setRunButtonLoading(false);
      })
      .catch(err => {
        console.error("Error fetching measurements:", err);
        alert("Error fetching measurements.");
        boxState[selectedBox.id].task_running = false;
        setRunButtonLoading(false);
      });
  } else if (selectedBox.dataset.type === "table") {
    let tableVal = document.getElementById("tableQueryDisplay").textContent;
    let startTimeVal = document.getElementById("startTime").value;
    let endTimeVal = document.getElementById("endTime").value;
    if (!tableVal || tableVal === "Select a table") {
      alert("Please select a table.");
      boxState[selectedBox.id].task_running = false;
      setRunButtonLoading(false);
      return;
    }
    state.table = tableVal;
    state.start_time = startTimeVal;
    state.end_time = endTimeVal;
    let payload = { table: tableVal, start_time: startTimeVal, end_time: endTimeVal };
    fetch("/api/query_table", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(response => response.json())
      .then(data => {
        if (!data.dataset_id) {
          alert("No dataset_id returned from /api/query_table.");
          boxState[selectedBox.id].task_running = false;
          setRunButtonLoading(false);
          return;
        }
        state.dataset_id = data.dataset_id;
        let preview = data.preview || {};
        let resultArray = preview.data || [];
        let columns = preview.columns || [];
        resultArray._columns = columns;
        displayTable(resultArray);
        state.result = document.getElementById("tableContainer").innerHTML;
        state.data = resultArray;
        state.columns = columns;
        state.header = document.getElementById("tableHeader").textContent;
        boxState[selectedBox.id].task_running = false;
        setRunButtonLoading(false);
      })
      .catch(err => {
        console.error("Error running query:", err);
        alert("Error running query.");
        boxState[selectedBox.id].task_running = false;
        setRunButtonLoading(false);
      });
  } else if (selectedBox.dataset.type === "sql") {
    let parentState = boxState[state.parent];
    if (!parentState || !parentState.dataset_id) {
      alert("Parent dataset not ready. Run the parent query first.");
      boxState[selectedBox.id].task_running = false;
      setRunButtonLoading(false);
      return;
    }
    let finalSQL = "";
    if (state.sqlMode === "basic" || !state.sqlMode) {
      let selectClause = document.getElementById("selectDisplay").textContent.trim();
      if (!selectClause || selectClause === "Select columns") {
        selectClause = "*";
      } else {
        selectClause = selectClause.split(",").map(col => `"${col.trim()}"`).join(", ");
      }
      let whereClauseCombined = "";
      let whereClause = document.getElementById("whereDisplay").textContent.trim();
      let opText = document.getElementById("operatorDisplay").textContent.trim();
      const opMap = { "=": "=", "<": "<", ">": ">" };
      let whereOperator = opMap[opText] || "=";
      let whereValue = document.getElementById("whereValue").value.trim();
      if (whereClause && whereClause !== "Select columns" && whereValue) {
        whereClauseCombined = `${whereClause} ${whereOperator} '${whereValue}'`;
      }
      document.querySelectorAll("#additionalWhereContainer .where-condition").forEach(cond => {
        let col = cond.querySelector(".where-button span").textContent.trim();
        let opTxt = cond.querySelector(".operator-button span").textContent.trim();
        let opSym = opMap[opTxt] || "=";
        let val = cond.querySelector(".whereValue").value.trim();
        let operatorLabelElem = cond.querySelector(".where-operator-label");
        let opLabel = (operatorLabelElem && operatorLabelElem.textContent.trim()) || "AND";
        if (col && col !== "Select columns" && val) {
          if (whereClauseCombined !== "") { whereClauseCombined += " " + opLabel + " "; }
          whereClauseCombined += `${col} ${opSym} '${val}'`;
        }
      });
      if (whereClauseCombined) {
        finalSQL = `SELECT ${selectClause} FROM df\nWHERE ${whereClauseCombined.replace(/ (AND|OR) /g, "\n$1 ")}`;
      } else {
        finalSQL = `SELECT ${selectClause} FROM df`;
      }
      state.basicSQL = finalSQL;
    } else {
      finalSQL = sqlEditorCM.getValue();
      state.advancedSQL = finalSQL;
    }
    let payload = { parent_dataset_id: parentState.dataset_id, sql: finalSQL };
    fetch("/api/sql_transform", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(response => response.json())
      .then(data => {
        if (!data.dataset_id) {
          alert("No dataset_id returned from /api/sql_transform.");
          boxState[selectedBox.id].task_running = false;
          setRunButtonLoading(false);
          return;
        }
        state.dataset_id = data.dataset_id;
        let preview = data.preview || {};
        let resultArray = preview.data || [];
        let columns = preview.columns || [];
        resultArray._columns = columns;
        displayTable(resultArray);
        state.result = document.getElementById("tableContainer").innerHTML;
        state.data = resultArray;
        state.columns = columns;
        state.header = document.getElementById("tableHeader").textContent;
        boxState[selectedBox.id].task_running = false;
        setRunButtonLoading(false);
      })
      .catch(err => {
        console.error("Error running SQL transform:", err);
        alert("Error running SQL transform.");
        boxState[selectedBox.id].task_running = false;
        setRunButtonLoading(false);
      });
  } else if (selectedBox.dataset.type === "plot") {
    let xButton = document.getElementById("xSelectButton");
    let xField = xButton.dataset.selected || xButton.querySelector("span").textContent.trim();
    let yButton = document.getElementById("ySelectButton");
    let yField = yButton.dataset.selected || yButton.querySelector("span").textContent.trim();
    let additionalYFields = [];
    let additionalY = document.querySelectorAll("#ySelectContainer .form-group");
    additionalY.forEach((group) => {
      let val = group.querySelector("button").dataset.selected || group.querySelector("button span").textContent.trim();
      if (val && val !== "Select a column") { 
        additionalYFields.push(val); 
      }
    });
    if (!xField || xField === "Select a column" || !yField || yField === "Select a column") {
      alert("Please select an X field and at least one Y value.");
      boxState[selectedBox.id].task_running = false;
      setRunButtonLoading(false);
      return;
    }
    state.xField = xField;
    state.yField = yField;
    state.additionalYFields = additionalYFields;
    let parentState = boxState[state.parent];
    if (!parentState || !parentState.data) {
      alert("Parent data not available. Run the parent query/transform first.");
      boxState[selectedBox.id].task_running = false;
      setRunButtonLoading(false);
      return;
    }
    let rawData = parentState.data;
    const colorPalette = ['#00008B','#FF0000','#008000','#800080','#FFA500','#00CED1','#DC143C','#006400','#8B008B','#FF1493'];
    let allYFields = [yField, ...additionalYFields];
    let datasets = allYFields.map((theYField, index) => {
      const parseFieldValue = (value, field) => {
        if (field.toLowerCase().includes("time")) {
          const normalized = String(value).replace(/(\.\d{3})\d+/, '$1');
          return new Date(normalized).getTime();
        } else {
          return parseFloat(value);
        }
      };
      let chartData = rawData.map(item => ({
        x: parseFieldValue(item[xField], xField),
        y: parseFieldValue(item[theYField], theYField)
      }));
      return {
        label: theYField,
        data: chartData,
        borderColor: colorPalette[index % colorPalette.length],
        backgroundColor: colorPalette[index % colorPalette.length],
        fill: false,
        tension: 0,
        borderWidth: 1.5,
        pointRadius: 0
      };
    });
    let xScaleType = xField.toLowerCase().includes("time") ? "time" : "linear";
    let yScaleType = yField.toLowerCase().includes("time") ? "time" : "linear";
    let config = {
      type: 'line',
      data: { datasets: datasets },
      options: {
        animation: false,
        plugins: { legend: { display: true, position: 'top', labels: { font: { size: 12 } } } },
        scales: {
          x: { type: xScaleType, position: 'bottom', title: { display: true, text: xField, font: { size: 12 } }, ticks: { font: { size: 12 } } },
          y: { type: yScaleType, position: 'left', title: { display: false, text: yField, font: { size: 12 } }, ticks: { font: { size: 12 } } }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    };
    state.chartConfig = config;
    renderChart(config);
    state.result = document.getElementById("tableContainer").innerHTML;
    state.header = "Results: " + selectedBox.querySelector(".box-title").textContent;
    document.getElementById("tableHeader").textContent = state.header;
    boxState[selectedBox.id].task_running = false;
    setRunButtonLoading(false);
  } else if (selectedBox.dataset.type === "join") {
    let joinType = document.getElementById("joinTypeDisplay").textContent || "Left Join";
    let leftVal = document.getElementById("leftJoinColumnButton").dataset.selected || "";
    let rightVal = document.getElementById("rightJoinColumnButton").dataset.selected || "";
    const joinTypeMap = { "Left Join": "left", "Right Join": "right", "Inner Join": "inner", "Outer Join": "outer", "Cross Join": "cross" };
    let formattedJoinType = joinTypeMap[joinType] || joinType;
    state.joinType = formattedJoinType;
    state.leftJoinColumn = leftVal;
    state.rightJoinColumn = rightVal;
    let leftState = boxState[state.leftParent];
    let rightState = boxState[state.rightParent];
    if (!leftState || !leftState.dataset_id || !rightState || !rightState.dataset_id) {
      alert("Both parent boxes must have dataset IDs. Run them first if not done.");
      boxState[selectedBox.id].task_running = false;
      setRunButtonLoading(false);
      return;
    }
    let payload = {
      left_dataset_id: leftState.dataset_id,
      right_dataset_id: rightState.dataset_id,
      left_join_column: leftVal,
      right_join_column: rightVal,
      join_type: formattedJoinType
    };
    console.log("Join payload:", payload);
    fetch("/api/sql_join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(response => response.json())
      .then(data => {
        if (!data.dataset_id) {
          alert("No dataset_id returned from /api/sql_join.");
          boxState[selectedBox.id].task_running = false;
          setRunButtonLoading(false);
          return;
        }
        state.dataset_id = data.dataset_id;
        let preview = data.preview || {};
        let resultArray = preview.data || [];
        let columns = preview.columns || [];
        resultArray._columns = columns;
        displayTable(resultArray);
        state.result = document.getElementById("tableContainer").innerHTML;
        state.data = resultArray;
        state.columns = columns;
        state.header = document.getElementById("tableHeader").textContent;
        boxState[selectedBox.id].task_running = false;
        setRunButtonLoading(false);
      })
      .catch(err => {
        console.error("Error running join:", err);
        alert("Error running join.");
        boxState[selectedBox.id].task_running = false;
        setRunButtonLoading(false);
      });
  }
}

// ============================================================
// Box Creation and Selection
// ============================================================
function createBox(title, type, parentId = null, configState = null) {
  const whiteboard = document.getElementById("whiteboard");
  const box = document.createElement("div");
  box.dataset.type = type;
  box.className = "box";
  let boxTitle = title || "";
  if (configState && configState.id) {
    box.id = configState.id;
  } else {
    box.id = "box-" + boxIdCounter;
    boxIdCounter++;
  }
  if (configState) {
    boxState[box.id] = Object.assign({}, configState);
    delete boxState[box.id].result;
    delete boxState[box.id].data;
  } else {
    if (type === "table") {
      boxState[box.id] = { table: "", start_time: "", end_time: "", result: "" };
    } else if (type === "sql") {
      boxState[box.id] = {
        basicSQL: "",
        advancedSQL: "SELECT * FROM df",
        sqlMode: "basic",
        selectClause: "",
        whereClause: "",
        whereOperator: "=",
        whereValue: "",
        additionalWhere: []
      };
      transWhereState[box.id] = 0;
    } else if (type === "join") {
      boxState[box.id] = { joinType: "Left Join", leftJoinColumn: "", rightJoinColumn: "" };
    } else if (type === "influx") {
      boxState[box.id] = { code: "Run to show available tables", header: "Results: InfluxDB" };
    } else if (type === "plot") {
      boxState[box.id] = { xField: "", yField: "", additionalYFields: [], chartConfig: null, result: "" };
    }
  }
  let buttonsHTML = "";
  switch (type) {
    case "influx":
      boxTitle = "InfluxDB";
      buttonsHTML = `<button class="query-btn" title="Create Table Query"><i class="fas fa-database"></i></button>`;
      break;
    case "table":
      boxTitle = "Query " + tableQueryCounter;
      tableQueryCounter++;
      boxState[box.id].header = `Results: Query ${tableQueryCounter - 1}`;
      boxState[box.id].parent = parentId;
      buttonsHTML = `<button class="transform-btn" title="Create SQL Transform"><i class="fas fa-code"></i></button>
                     <button class="plot-btn" title="Create Plot"><i class="fas fa-chart-line"></i></button>
                     <button class="minus-btn" title="Delete Box"><i class="fas fa-times-circle"></i></button>`;
      break;
    case "sql":
      boxTitle = "Transform " + sqlTransformCounter;
      sqlTransformCounter++;
      boxState[box.id].header = `Results: Transform ${sqlTransformCounter - 1}`;
      boxState[box.id].parent = parentId;
      buttonsHTML = `<button class="plot-btn" title="Create Plot"><i class="fas fa-chart-line"></i></button>
                     <button class="join-btn" title="Create Join"><i class="fas fa-code-branch"></i></button>
                     <button class="minus-btn" title="Delete Box"><i class="fas fa-times-circle"></i></button>`;
      break;
    case "plot":
      boxTitle = "Plot " + plotCounter;
      plotCounter++;
      boxState[box.id].header = `Results: Plot ${plotCounter - 1}`;
      boxState[box.id].parent = parentId;
      buttonsHTML = `<button class="minus-btn" title="Delete Box"><i class="fas fa-times-circle"></i></button>`;
      break;
    case "join":
      boxTitle = title || "Join " + joinCounter;
      joinCounter++;
      boxState[box.id].joinType = boxState[box.id].joinType || "Left Join";
      boxState[box.id].header = `Results: Join ${joinCounter - 1}`;
      buttonsHTML = `<button class="plot-btn" title="Create Plot"><i class="fas fa-chart-line"></i></button>
                     <button class="minus-btn" title="Delete Box"><i class="fas fa-times-circle"></i></button>`;
      break;
  }
  box.innerHTML = `<div class="box-title">${boxTitle}</div>${buttonsHTML}`;
  // Positioning (use your existing positioning logic)
  if (configState && configState.left && configState.top) {
    box.style.left = configState.left;
    box.style.top = configState.top;
  } else if (parentId && type !== "join") {
    let parentBox = document.getElementById(parentId);
    let newLeft = parentBox.offsetLeft + parentBox.offsetWidth + 50;
    let newTop = parentBox.offsetTop;
    if (newLeft + 150 > document.getElementById("whiteboard").offsetWidth) {
      newLeft = parentBox.offsetLeft;
      newTop = parentBox.offsetTop + parentBox.offsetHeight + 50;
    }
    let overlap = true;
    while (overlap) {
      overlap = false;
      boxes.forEach(b => {
        if (b === parentBox) return;
        let rect = { left: newLeft, top: newTop, right: newLeft + 150, bottom: newTop + 100 };
        if (!(rect.right < b.offsetLeft || rect.left > b.offsetLeft + b.offsetWidth ||
              rect.bottom < b.offsetTop || rect.top > b.offsetTop + b.offsetHeight)) {
          overlap = true;
        }
      });
      if (overlap) {
        newTop += 20;
        if (newTop + 100 > document.getElementById("whiteboard").offsetHeight) {
          newTop = parentBox.offsetTop;
          newLeft += 20;
        }
      }
    }
    box.style.left = newLeft + "px";
    box.style.top = newTop + "px";
  } else if (type === "join" && configState && configState.leftParent && configState.rightParent) {
    let leftBox = document.getElementById(configState.leftParent);
    let rightBox = document.getElementById(configState.rightParent);
    if (leftBox && rightBox) {
      let rightmost = Math.max(leftBox.offsetLeft + leftBox.offsetWidth, rightBox.offsetLeft + rightBox.offsetWidth);
      let newLeft = rightmost + 50;
      let newTop = (leftBox.offsetTop + rightBox.offsetTop) / 2;
      box.style.left = newLeft + "px";
      box.style.top = newTop + "px";
    } else {
      const wbRect = document.getElementById("whiteboard").getBoundingClientRect();
      box.style.left = (Math.random() * (wbRect.width - 150)) + "px";
      box.style.top = (Math.random() * (wbRect.height - 100)) + "px";
    }
  } else if (type === "influx") {
    box.style.left = "300px";
    box.style.top = "200px";
  } else {
    const wbRect = document.getElementById("whiteboard").getBoundingClientRect();
    box.style.left = (Math.random() * (wbRect.width - 150)) + "px";
    box.style.top = (Math.random() * (wbRect.height - 100)) + "px";
  }
  box.dataset.type = type;
  document.getElementById("whiteboard").appendChild(box);
  boxes.push(box);
  makeDraggable(box);
  box.addEventListener("click", (e) => {
    if (joinLinkingSource && box.dataset.type === "sql" && joinLinkingSource !== box) {
      let newJoinBox = createJoinBox("Join " + joinCounter, joinLinkingSource, box);
      connectBoxes(joinLinkingSource, newJoinBox, "#008000");
      connectBoxes(box, newJoinBox, "#008000");
      let sourceJoinButton = joinLinkingSource.querySelector(".join-btn");
      if (sourceJoinButton) { sourceJoinButton.classList.remove("active"); }
      joinLinkingSource = null;
      selectBox(newJoinBox);
      return;
    }
    if (e.target.classList.contains("plot-btn") ||
        e.target.classList.contains("minus-btn") ||
        e.target.classList.contains("join-btn")) {
      return;
    }
    if (e.detail === 2) {
      enableInlineRename(box);
    } else {
      saveCurrentBoxState();
      selectBox(box);
    }
  });
  let queryButton = box.querySelector(".query-btn");
  if (queryButton) {
    queryButton.addEventListener("click", (e) => {
      e.stopPropagation();
      let newBox = createBox("Query", "table", box.id);
      connectBoxes(box, newBox);
      updateDropdownMenu("tableDropdownMenu", "tableQueryButton", "dropdown-search", "table-option", measurementsData, function(selectedOption) {
        boxState[selectedBox.id].table = selectedOption;
      });
    });
  }
  let transformButton = box.querySelector(".transform-btn");
  if (transformButton) {
    transformButton.addEventListener("click", (e) => {
      e.stopPropagation();
      let newBox = createBox("Transform", "sql", box.id);
      connectBoxes(box, newBox);
      updateTransformDropdowns(newBox.id);
    });
  }
  let plotButton = box.querySelector(".plot-btn");
  if (plotButton) {
    plotButton.addEventListener("click", (e) => {
      e.stopPropagation();
      let newBox = createBox("Plot", "plot", box.id);
      connectBoxes(box, newBox);
      updatePlotDropdowns(newBox.id);
    });
  }
  let joinButton = box.querySelector(".join-btn");
  if (joinButton) {
    joinButton.addEventListener("click", (e) => {
      e.stopPropagation();
      if (joinLinkingSource === box) {
        joinLinkingSource = null;
        joinButton.classList.remove("active");
      } else {
        if (joinLinkingSource) {
          let prev = joinLinkingSource.querySelector(".join-btn");
          if (prev) prev.classList.remove("active");
        }
        joinLinkingSource = box;
        joinButton.classList.add("active");
      }
    });
  }
  let minusButton = box.querySelector(".minus-btn");
  if (minusButton) {
    minusButton.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteBox(box);
    });
  }
  boxState[box.id].header = `Results: ${boxTitle}`;
  document.getElementById("navigatorHeader").textContent = "Navigator: " + boxTitle;
  if (box.dataset.type === "plot") {
    document.getElementById("tableContainer").innerHTML = "";
  } else {
    document.getElementById("tableContainer").innerHTML = boxState[box.id].result || "";
  }
  document.getElementById("tableHeader").textContent =
    boxState[box.id].header || ("Results: " + box.querySelector(".box-title").textContent);
  selectBox(box);
  return box;
}

function selectBox(box) {
  saveCurrentBoxState();
  boxes.forEach(b => b.classList.remove("selected"));
  box.classList.add("selected");
  selectedBox = box;
  const boxId = box.id;
  const state = boxState[boxId] || {};
  const title = box.querySelector(".box-title").textContent;
  document.getElementById("navigatorHeader").textContent = "Navigator: " + title;
  const panels = {
    codeEditorText: document.getElementById("codeEditorText"),
    queryForm: document.getElementById("queryForm"),
    sqlEditor: document.getElementById("sqlEditor"),
    plotForm: document.getElementById("plotForm"),
    joinForm: document.getElementById("joinForm")
  };
  for (let key in panels) {
    panels[key].style.display = "none";
  }
  if (box.dataset.type === "influx") {
    panels.codeEditorText.style.display = "block";
    panels.codeEditorText.value = state.code || "Run to show available tables";
  } else if (box.dataset.type === "table") {
    panels.queryForm.style.display = "block";
    updateDropdownMenu("tableDropdownMenu", "tableQueryButton", "dropdown-search", "table-option", measurementsData, function(selectedOption) {
      state.table = selectedOption;
    });
    document.getElementById("tableQueryDisplay").textContent = state.table || "batspk__4_2_0__ethernet__65400";
    document.getElementById("startTime").value = state.start_time || "2024-07-25T16:47:00Z";
    document.getElementById("endTime").value = state.end_time || "2024-07-25T16:47:10Z";
  } else if (box.dataset.type === "sql") {
    panels.sqlEditor.style.display = "block";
    document.getElementById("selectDisplay").textContent = state.selectClause || "Select columns";
    document.getElementById("whereDisplay").textContent = state.whereClause || "Select columns";
    document.getElementById("operatorDisplay").textContent = state.whereOperator || "=";
    document.getElementById("whereValue").value = state.whereValue || "";
    const container = document.getElementById("additionalWhereContainer");
    container.innerHTML = "";
    if (state.additionalWhere && state.additionalWhere.length > 0) {
      state.additionalWhere.forEach(cond => addWhereRow(cond.logic, null, cond));
    }
    updateTransformDropdowns(box.id);
    state.sqlMode = state.sqlMode || "basic";
    if (state.sqlMode === "basic") {
      document.getElementById("sqlBasicEditor").style.display = "block";
      document.getElementById("sqlAdvancedEditor").style.display = "none";
      document.getElementById("toggleAdvanced").textContent = "Advanced";
      updateSQLFromBasic();
    } else {
      document.getElementById("sqlBasicEditor").style.display = "none";
      document.getElementById("sqlAdvancedEditor").style.display = "block";
      document.getElementById("toggleAdvanced").textContent = "Basic";
      sqlEditorCM.setValue(state.advancedSQL || "SELECT * FROM df");
    }
  } else if (box.dataset.type === "plot") {
    panels.plotForm.style.display = "block";
    document.getElementById("xSelectDisplay").textContent = state.xField || "Select a column";
    document.getElementById("ySelectDisplay").textContent = state.yField || "Select a column";
    state.additionalYFields = Array.isArray(state.additionalYFields) ? state.additionalYFields : [];
    const yContainer = document.getElementById("ySelectContainer");
    if (yContainer) {
      yContainer.innerHTML = "";
      state.additionalYFields.forEach((yVal, i) => {
        const groupDiv = document.createElement("div");
        groupDiv.className = "form-group";
        groupDiv.innerHTML = `
          <label for="ySelectDisplay_${i}">Y Values:</label>
          <div class="plot-row">
            <div class="custom-dropdown plot-dropdown">
              <button id="ySelectButton_${i}" data-selected="${yVal || ''}">
                <span id="ySelectDisplay_${i}">${yVal || "Select a column"}</span>
              </button>
              <div class="plot-dropdown-menu" id="ySelectDropdownMenu_${i}"></div>
            </div>
            <button class="remove-y-btn"><i class="fas fa-times-circle"></i></button>
          </div>
        `;
        yContainer.appendChild(groupDiv);
        let extraButton = groupDiv.querySelector(`#ySelectButton_${i}`);
        extraButton.addEventListener("click", function(e) {
          e.stopPropagation();
          const menu = groupDiv.querySelector(`#ySelectDropdownMenu_${i}`);
          menu.style.display = menu.style.display === "block" ? "none" : "block";
        });
        document.addEventListener("click", function() {
          const dd = document.getElementById(`ySelectDropdownMenu_${i}`);
          if (dd) dd.style.display = "none";
        });
        groupDiv.querySelector(".remove-y-btn").addEventListener("click", function(e) {
          e.preventDefault();
          groupDiv.remove();
          let newYFields = [];
          yContainer.querySelectorAll(".custom-dropdown button").forEach(btn => {
            let val = btn.dataset.selected || btn.querySelector("span").textContent.trim();
            if (val && val !== "Select a column") newYFields.push(val);
          });
          state.additionalYFields = newYFields;
        });
        let menu = document.getElementById(`ySelectDropdownMenu_${i}`);
        addDropdownSearch(menu, "dropdown-search", "plot-option");
        addClearOption(menu, "plot-option", `ySelectButton_${i}`);
        let cols = getParentColumns(selectedBox.id);
        populateDropdown(menu, cols, "plot-option", `ySelectButton_${i}`, function(selectedOption) {
          extraButton.dataset.selected = selectedOption;
          state.additionalYFields[i] = selectedOption;
        });
      });
      updatePlotDropdowns(box.id);
    }
  } else if (box.dataset.type === "join") {
    panels.joinForm.style.display = "block";
    updateJoinDropdowns(box.id);
    document.getElementById("joinTypeDisplay").textContent = state.joinType || "Left Join";
    document.getElementById("leftJoinColumnDisplay").textContent = state.leftJoinColumn || "Select column";
    document.getElementById("rightJoinColumnDisplay").textContent = state.rightJoinColumn || "Select column";
    if (state.leftJoinColumn) {
      const leftBtn = document.getElementById("leftJoinColumnButton");
      leftBtn.dataset.selected = state.leftJoinColumn;
      leftBtn.querySelector("span").textContent = state.leftJoinColumn;
    }
    if (state.rightJoinColumn) {
      const rightBtn = document.getElementById("rightJoinColumnButton");
      rightBtn.dataset.selected = state.rightJoinColumn;
      rightBtn.querySelector("span").textContent = state.rightJoinColumn;
    }
  }
  if (box.dataset.type !== "plot") {
    document.getElementById("tableContainer").innerHTML = state.result || "";
  }
  document.getElementById("tableHeader").textContent =
    state.header || ("Results: " + box.querySelector(".box-title").textContent);
}

// ============================================================
// Initialization and Event Listeners
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const influxBox = createBox("InfluxDB", "influx");
  selectBox(influxBox);
  runQuery();
  document.getElementById("dark-mode-toggle").addEventListener("click", toggleDarkMode);
  document.getElementById("runButton").addEventListener("click", runQuery);
  document.getElementById("exportBtn").addEventListener("click", exportCSV);
  document.getElementById("maximizeBtn").addEventListener("click", toggleMaximize);
  document.getElementById("saveConfigBtn").addEventListener("click", saveConfig);
  document.getElementById("loadConfigBtn").addEventListener("click", () => {
    document.getElementById("loadConfigInput").click();
  });
  document.getElementById("loadConfigInput").addEventListener("change", loadConfig);
  document.getElementById("horizontalDivider").addEventListener("mousedown", startResizeHorizontal);
  document.getElementById("verticalDivider").addEventListener("mousedown", startResizeVertical);
  window.addEventListener("resize", updateConnectors);
  const resetBtn = document.getElementById("resetBasicBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", function() {
      const state = boxState[selectedBox.id];
      if (state.sqlMode === "basic") {
        resetBasicSQL();
      } else if (state.sqlMode === "advanced") {
        resetAdvancedSQL();
      }
    });
  }
  function setupDropdownToggle(buttonIds, menuIds) {
    buttonIds.forEach((buttonId, index) => {
      const button = document.getElementById(buttonId);
      const menu = document.getElementById(menuIds[index]);
      if (button && menu) {
        button.addEventListener("click", function (e) {
          e.stopPropagation();
          menu.style.display = menu.style.display === "block" ? "none" : "block";
        });
      }
    });
    document.addEventListener("click", function () {
      menuIds.forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (menu) menu.style.display = "none";
      });
    });
  }
  setupDropdownToggle(
    ["tableQueryButton", "xSelectButton", "ySelectButton", "selectButton", "whereButton", "joinTypeButton", "leftJoinColumnButton", "rightJoinColumnButton"],
    ["tableDropdownMenu", "xSelectDropdownMenu", "ySelectDropdownMenu", "selectDropdownMenu", "whereDropdownMenu", "joinTypeDropdownMenu", "leftJoinDropdownMenu", "rightJoinDropdownMenu"]
  );
  document.addEventListener("click", function(e) {
    const opButton = document.getElementById("operatorButton");
    const opMenu = document.querySelector(".operator-dropdown-menu");
    if (opButton && (e.target === opButton || opButton.contains(e.target))) {
      opMenu.style.display = opMenu.style.display === "block" ? "none" : "block";
    } else {
      if (!e.target.closest(".operator-dropdown")) opMenu.style.display = "none";
    }
  });
  document.querySelectorAll(".operator-dropdown-menu .operator-option").forEach(option => {
    option.addEventListener("click", function() {
      const text = option.querySelector(".operator-name").textContent;
      document.getElementById("operatorDisplay").textContent = text;
      document.querySelector(".operator-dropdown-menu").style.display = "none";
      updateSQLFromBasic();
    });
  });
  document.getElementById("toggleAdvanced").addEventListener("click", function() {
    let state = boxState[selectedBox.id];
    if (state.sqlMode !== "advanced") {
      document.getElementById("sqlBasicEditor").style.display = "none";
      document.getElementById("sqlAdvancedEditor").style.display = "block";
      this.textContent = "Basic";
      state.sqlMode = "advanced";
      sqlEditorCM.setValue(state.advancedSQL || "SELECT * FROM df");
    } else {
      document.getElementById("sqlBasicEditor").style.display = "block";
      document.getElementById("sqlAdvancedEditor").style.display = "none";
      this.textContent = "Advanced";
      state.sqlMode = "basic";
    }
  });
  let importBtn = document.getElementById("importBasicBtn");
  document.getElementById("sqlAdvancedEditor").appendChild(importBtn);
  importBtn.addEventListener("click", function() {
    let state = boxState[selectedBox.id];
    state.advancedSQL = state.basicSQL || "SELECT * FROM df";
    sqlEditorCM.setValue(state.advancedSQL);
  });
  document.getElementById("addWhereAnd").addEventListener("click", function(e) {
    e.preventDefault();
    addWhereRow("AND", e);
  });
  document.getElementById("addWhereOr").addEventListener("click", function(e) {
    e.preventDefault();
    addWhereRow("OR", e);
  });
  document.getElementById("addYBtn").addEventListener("click", function(e) {
    e.preventDefault();
    addYRow(e);
  });
  const sqlTextarea = document.getElementById("sqlEditorText");
  sqlEditorCM = CodeMirror.fromTextArea(sqlTextarea, {
    mode: "text/x-sql",
    lineNumbers: false,
    theme: "default",
    extraKeys: { "Ctrl-Space": "autocomplete" },
    hintOptions: { tables: {} },
    autofocus: false
  });
  sqlEditorCM.on("inputRead", function(cm, change) {
    if (change.text[0] === " ") {
      let cursor = cm.getCursor();
      let token = cm.getTokenAt(cursor);
      const sqlKeywords = ["select", "from", "where", "limit", "group", "order", "by", "having", "insert", "update", "delete"];
      if (sqlKeywords.includes(token.string.toLowerCase())) {
        cm.replaceRange(token.string.toUpperCase(), { line: cursor.line, ch: token.start }, { line: cursor.line, ch: token.end });
      }
    }
    if (change.text[0] && change.text[0].match(/\w/)) {
      CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
    }
  });
  sqlEditorCM.on("change", function(cm) {
    if (selectedBox && selectedBox.dataset.type === "sql") {
      boxState[selectedBox.id].advancedSQL = cm.getValue();
    }
  });
  const basicElements = ["selectDisplay", "whereDisplay", "operatorDisplay", "whereValue"];
  basicElements.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", updateSQLFromBasic);
      el.addEventListener("input", updateSQLFromBasic);
      el.addEventListener("click", updateSQLFromBasic);
    }
  });
});

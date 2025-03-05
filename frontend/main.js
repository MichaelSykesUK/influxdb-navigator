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
let boxState = {}; // Object keyed by box id
let boxIdCounter = 0;
let measurementsData = [];
let currentChart = null;
let boxes = [];
let sqlEditorCM;
let joinLinkingSource = null;
let plotYState = {};     // For dynamic Y-axis rows in plot boxes.
let transWhereState = {}; // For dynamic additional WHERE rows in SQL boxes.

// ============================================================
// Dark Mode Toggle Functionality using FontAwesome icons
// ============================================================
function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
  // (Icon update code commented out)
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
    // Save base SQL transform fields
    state.selectClause = document.getElementById("selectDisplay").textContent.trim();
    state.baseColumn = document.getElementById("whereDisplay").textContent.trim();
    state.baseOperator = document.getElementById("operatorDisplay").textContent.trim();
    state.baseValue = document.getElementById("whereValue").value.trim();
    // Save additional WHERE rows using a new helper that saves even empty values
    state.additionalWhere = getWhereConditionsFromUI();
    state.basicSQL = document.getElementById("basicSQLPreview").innerText;
    state.advancedSQL = sqlEditorCM.getValue();
    state.sqlMode = state.sqlMode || "basic";
  } else if (type === "plot") {
    state.xField = document.getElementById("xSelectDisplay").textContent.trim();
    let yFields = [];
    let baseY = document.getElementById("ySelectButton_1").dataset.selected ||
                document.getElementById("ySelectButton_1").querySelector("span").textContent.trim();
    // Even if baseY is empty, store it as ""
    yFields.push(baseY || "");
    document.querySelectorAll("#ySelectContainer .y-select-group").forEach(group => {
      let btn = group.querySelector("button");
      let val = btn.dataset.selected || btn.querySelector("span").textContent.trim();
      // Store the value (or empty string) for each additional field
      yFields.push(val || "");
    });
    state.yFields = yFields;
  } else if (type === "join") {
    state.joinType = document.getElementById("joinTypeDisplay").textContent.trim();
    state.leftJoinColumn = document.getElementById("leftJoinColumnDisplay").textContent.trim();
    state.rightJoinColumn = document.getElementById("rightJoinColumnDisplay").textContent.trim();
  }
  boxState[boxId] = state;
}

// ============================================================
// Utility Functions (Dropdowns, etc.)
// ============================================================
function updateDropdownMenu(menuID, buttonID, searchClass, optionClass, options, callback) {
  let menu = document.getElementById(menuID);
  addDropdownSearch(menu, searchClass, optionClass);
  addClearOption(menu, optionClass, buttonID);
  populateDropdown(menu, options, optionClass, buttonID, callback);
}

function updateDropdownMenuMulti(menuID, buttonID, searchClass, optionClass, options, callback) {
  let menu = document.getElementById(menuID);
  addDropdownSearch(menu, searchClass, optionClass);
  addClearOption(menu, optionClass, buttonID);
  populateDropdownMulti(menu, options, optionClass, buttonID, callback);
}

function updateTransformDropdowns(boxId) { 
  let cols = getParentColumns(boxId);
  updateDropdownMenuMulti("selectDropdownMenu", "selectButton", "dropdown-search", "select-option", cols, function(selectedOptions) {
    boxState[selectedBox.id].selectClause = selectedOptions.join(", ");
    updateSQLFromBasic();
  });
  updateDropdownMenu("whereDropdownMenu", "whereButton", "dropdown-search", "where-option", cols, function(selectedOption) {
    boxState[selectedBox.id].baseColumn = selectedOption;
    updateSQLFromBasic();
  });
  updateSQLFromBasic();
}

function updatePlotDropdowns(boxId) {
  let cols = getParentColumns(boxId);
  updateDropdownMenu("xSelectDropdownMenu", "xSelectButton", "dropdown-search", "plot-option", cols, function(selectedOption) {
    boxState[selectedBox.id].xField = selectedOption;
  });
  // Update the base Y field dropdown (using fixed IDs for the base row)
  updateDropdownMenu("ySelectDropdownMenu_1", "ySelectButton_1", "dropdown-search", "plot-option", cols, function(selectedOption) {
    let state = boxState[selectedBox.id];
    if (!state.yFields || state.yFields.length === 0) {
      state.yFields = [""];
    }
    state.yFields[0] = selectedOption;
  });
}

function updateJoinDropdowns(joinBoxId) {
  let joinStateObj = boxState[joinBoxId];
  if (!joinStateObj) return;
  let leftJoinMenu = document.getElementById("leftJoinDropdownMenu");
  addDropdownSearch(leftJoinMenu, "dropdown-search", "join-option");
  let parentStateLeft = boxState[joinStateObj.leftParent];
  if (parentStateLeft && parentStateLeft.data && parentStateLeft.data.length > 0) {
    let cols = Object.keys(parentStateLeft.data[0]);
    populateDropdown(leftJoinMenu, cols, "join-option", "leftJoinColumnButton", function(selectedOption) {
      boxState[selectedBox.id].leftJoinColumn = selectedOption;
    });
  }
  let rightJoinMenu = document.getElementById("rightJoinDropdownMenu");
  addDropdownSearch(rightJoinMenu, "dropdown-search", "join-option");
  let parentStateRight = boxState[joinStateObj.rightParent];
  if (parentStateRight && parentStateRight.data && parentStateRight.data.length > 0) {
    let cols = Object.keys(parentStateRight.data[0]);
    populateDropdown(rightJoinMenu, cols, "join-option", "rightJoinColumnButton", function(selectedOption) {
      boxState[selectedBox.id].rightJoinColumn = selectedOption;
    });
  }
}

function getWhereConditionsFromUI() {
  const container = document.getElementById("additionalWhereContainer");
  const conditions = [];
  Array.from(container.getElementsByClassName("where-condition")).forEach(row => {
    const colElem = row.querySelector(".where-button span");
    const opElem = row.querySelector(".operator-button span");
    const valElem = row.querySelector(".whereValue");
    const logicElem = row.querySelector(".where-operator-label");
    // Save even if blank (using empty string)
    const col = colElem ? colElem.textContent.trim() : "";
    const operator = opElem ? opElem.textContent.trim() : "=";
    const value = valElem ? valElem.value.trim() : "";
    const logic = logicElem ? logicElem.textContent.trim() : "";
    conditions.push({ column: col, operator: operator, value: value, logic: logic });
  });
  return conditions;
}

function loadSQLBoxState(boxId) {
  const state = boxState[boxId];
  if (!state) return;
  document.getElementById("selectDisplay").textContent = state.selectClause || "Select columns";
  document.getElementById("whereDisplay").textContent = state.baseColumn || "Select columns";
  document.getElementById("operatorDisplay").textContent = state.baseOperator || "=";
  document.getElementById("whereValue").value = state.baseValue || "";
  // Clear and rebuild additional WHERE rows
  const container = document.getElementById("additionalWhereContainer");
  container.innerHTML = "";
  if (state.additionalWhere && state.additionalWhere.length > 0) {
    state.additionalWhere.forEach(cond => {
      addWhereRow(cond.logic, null, cond);
    });
  }
}


// ============================================================
// updateSQLFromBasic: Rebuild SQL preview from the transform box’s fields
// ============================================================
function updateSQLFromBasic() { 
  if (!selectedBox || selectedBox.dataset.type !== "sql") { 
    return;
  }
  const state = boxState[selectedBox.id];
  let selectClause = document.getElementById("selectDisplay").textContent.trim();
  if (!selectClause || selectClause === "Select columns") {
    selectClause = "*";
  } else {
    selectClause = selectClause.split(",").map(col => `"${col.trim()}"`).join(", ");
  }
  
  let baseColumn = document.getElementById("whereDisplay").textContent.trim();
  let opText = document.getElementById("operatorDisplay").textContent.trim();
  const opMap = { "=": "=", "<": "<", ">": ">" };
  let baseOperator = opMap[opText] || "=";
  let baseValue = document.getElementById("whereValue").value.trim();
  
  state.baseColumn = baseColumn;
  state.baseOperator = baseOperator;
  state.baseValue = baseValue;
  
  let whereClause = "";
  if (baseColumn && baseColumn !== "Select columns" && baseValue) {
    whereClause = `"${baseColumn}" ${baseOperator} "${baseValue}"`;
  }
  
  let additionalWhereRows = document.querySelectorAll("#additionalWhereContainer .where-condition");
  state.additionalWhere = [];
  additionalWhereRows.forEach(row => {
    let col = row.querySelector(".where-button span").textContent.trim();
    let opTxt = row.querySelector(".operator-button span").textContent.trim();
    let opSym = opMap[opTxt] || "=";
    let val = row.querySelector(".whereValue").value.trim();
    let operatorLabelElem = row.querySelector(".where-operator-label");
    let opLabel = (operatorLabelElem && operatorLabelElem.textContent.trim()) || "AND";
    state.additionalWhere.push({ column: col, operator: opSym, value: val, logic: opLabel });
    if (col && col !== "Select columns" && val) {
      if (whereClause !== "") { whereClause += " " + opLabel + " "; }
      whereClause += `"${col}" ${opSym} "${val}"`;
    }
  });
  
  let formattedSQL = "";
  if (whereClause) {
    formattedSQL = "SELECT " + selectClause + " FROM df\nWHERE " + whereClause.replace(/ (AND|OR) /g, "\n$1 ");
  } else {
    formattedSQL = "SELECT " + selectClause + " FROM df";
  }
  state.basicSQL = formattedSQL;
  const previewEl = document.getElementById("basicSQLPreview");
  let labelEl = document.getElementById("generatedSQLLabel");
  if (!labelEl) {
    labelEl = document.createElement("label");
    labelEl.id = "generatedSQLLabel";
    labelEl.textContent = "Generated SQL Statement:";
    previewEl.parentNode.insertBefore(labelEl, previewEl);
  }
  previewEl.innerHTML = "<pre>" + formattedSQL + "</pre>";
}

// ============================================================
// addWhereRow: Dynamically add an additional WHERE row.
// Accepts an optional rowData object for rehydration.
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
      <button id="whereButton_${index}" class="where-button" aria-haspopup="true" aria-expanded="false">
        <span id="whereDisplay_${index}">${savedColumn}</span>
      </button>
      <div id="whereDropdownMenu_${index}" class="where-dropdown-menu"></div>
    </div>
    <div class="custom-dropdown operator-dropdown">
      <button id="operatorButton_${index}" class="operator-button" aria-haspopup="true" aria-expanded="false">
        <span id="operatorDisplay_${index}">${savedOperator}</span>
      </button>
      <div class="operator-dropdown-menu">
        <div class="operator-option" data-value="=">
          <div class="operator-name">=</div>
        </div>
        <div class="operator-option" data-value="<">
          <div class="operator-name">&lt;</div>
        </div>
        <div class="operator-option" data-value=">">
          <div class="operator-name">&gt;</div>
        </div>
      </div>
    </div>
    <input type="text" class="whereValue" id="whereValue_${index}" placeholder="e.g. BAT1" value="${savedValue}">
    <button class="remove-where-btn" title="Remove condition">
      <i class="fas fa-times-circle"></i>
    </button>
  `;

  groupDiv.querySelectorAll(".whereValue, .where-button, .operator-button, .where-operator-label")
    .forEach(el => {
      el.addEventListener("change", updateSQLFromBasic);
      el.addEventListener("input", updateSQLFromBasic);
      el.addEventListener("click", updateSQLFromBasic);
    });

  container.appendChild(groupDiv);

  const extraWhereButton = groupDiv.querySelector(`#whereButton_${index}`);
  extraWhereButton.addEventListener("click", function (e) {
    e.stopPropagation();
    const dropdown = groupDiv.querySelector(`#whereDropdownMenu_${index}`);
    dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
  });

  document.addEventListener("click", function () {
    const dd = document.getElementById(`whereDropdownMenu_${index}`);
    if (dd) dd.style.display = "none";
  });

  const operatorBtn = groupDiv.querySelector(`#operatorButton_${index}`);
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
      groupDiv.querySelector(`#operatorDisplay_${index}`).textContent = text;
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

  let additWhereMenu = document.getElementById(`whereDropdownMenu_${index}`);
  addDropdownSearch(additWhereMenu, "dropdown-search", "where-option");
  addClearOption(additWhereMenu, "where-option", `whereButton_${index}`);
  let cols = getParentColumns(selectedBox.id);
  populateDropdown(additWhereMenu, cols, "where-option", `whereButton_${index}`);
  updateSQLFromBasic();
}

// ============================================================
// addYRow: Dynamically add a Y-axis row for plot boxes.
// Accepts an optional rowData object for rehydration.
// ============================================================
function addYRow(e, rowData = null) {
  if (e) e.preventDefault();
  
  // For additional Y rows, add entries beyond the base field.
  const yContainer = document.getElementById("ySelectContainer");
  const yValuesWrapper = yContainer.querySelector(".y-values-wrapper");
  let newIndex = yValuesWrapper.querySelectorAll(".y-select-group").length + 1; // newIndex ≥ 2
  const savedValue = rowData && rowData.value ? rowData.value : "";
  const groupDiv = document.createElement("div");
  groupDiv.className = "form-group y-select-group";
  groupDiv.innerHTML = `
    <label for="ySelectDisplay_${newIndex}">Y Values:</label>
    <div class="plot-row">
      <div class="custom-dropdown plot-dropdown">
        <button id="ySelectButton_${newIndex}" aria-haspopup="true" aria-expanded="false" data-selected="${savedValue}">
          <span id="ySelectDisplay_${newIndex}">${savedValue || "Select a column"}</span>
        </button>
        <div class="plot-dropdown-menu" id="ySelectDropdownMenu_${newIndex}"></div>
      </div>
      <button class="remove-y-btn" title="Remove Y Value">
        <i class="fas fa-times-circle"></i>
      </button>
    </div>`;

  yValuesWrapper.appendChild(groupDiv);
  
  updatePlotDropdowns(selectedBox.id);

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
    yValuesWrapper.querySelectorAll(".custom-dropdown button").forEach(btn => {
      let val = btn.dataset.selected || btn.querySelector("span").textContent.trim();
      if(val && val !== "Select a column") newYFields.push(val);
    });
    boxState[selectedBox.id].yFields = newYFields;
  });

  let menu = document.getElementById(`ySelectDropdownMenu_${newIndex}`);
  addDropdownSearch(menu, "dropdown-search", "plot-option");
  addClearOption(menu, "plot-option", `ySelectButton_${newIndex}`);
  let cols = getParentColumns(selectedBox.id);
  populateDropdown(menu, cols, "plot-option", `ySelectButton_${newIndex}`, function(selectedOption) {
    extraButton.dataset.selected = selectedOption;
    state = boxState[selectedBox.id];
    if (!state.yFields) { state.yFields = []; }
    state.yFields[newIndex - 1] = selectedOption;
  });
}

// ============================================================
// runQuery: Execute query based on the selected box type.
// ============================================================
function runQuery() {
  if (!selectedBox) {
    alert("Select a box first.");
    return;
  }
  setRunButtonLoading(true);
  const state = boxState[selectedBox.id];

  if (selectedBox.dataset.type === "influx") {
    fetch("http://127.0.0.1:8000/measurements")
      .then(response => response.json())
      .then(data => {
        measurementsData = data.measurements || [];
        updateDropdownMenu("tableDropdownMenu", "tableQueryButton", "dropdown-search", "table-option", measurementsData, function(selectedOption) {
          state.table = selectedOption;
        });
        if (measurementsData.length === 0) {
          const noDataMessage = "InfluxDB returned no data for this query.";
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
        setRunButtonLoading(false);
      })
      .catch(err => {
        console.error("Error fetching measurements:", err);
        alert("Error fetching measurements.");
        setRunButtonLoading(false);
      });
  } else if (selectedBox.dataset.type === "table") {
    let tableVal = document.getElementById("tableQueryDisplay").textContent;
    let startTimeVal = document.getElementById("startTime").value;
    let endTimeVal = document.getElementById("endTime").value;
    if (!tableVal || tableVal === "Select a table") {
      alert("Please select a table.");
      setRunButtonLoading(false);
      return;
    }
    state.table = tableVal;
    state.start_time = startTimeVal;
    state.end_time = endTimeVal;
    let payload = { table: tableVal, start_time: startTimeVal, end_time: endTimeVal };
    fetch("http://127.0.0.1:8000/query_table", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(response => response.json())
      .then(data => {
        let resultArray = data.data;
        if (!resultArray || resultArray.length === 0) {
          const noDataMessage = "InfluxDB returned no data for this query.";
          document.getElementById("tableContainer").innerHTML = noDataMessage;
          state.result = noDataMessage;
          state.data = [];
        } else {
          resultArray._columns = data.columns || Object.keys(resultArray[0] || {});
          displayTable(resultArray);
          state.result = document.getElementById("tableContainer").innerHTML;
          state.data = resultArray;
        }
        state.header = document.getElementById("tableHeader").textContent;
        setRunButtonLoading(false);
      })
      .catch(err => {
        console.error("Error running query:", err);
        alert("Error running query.");
        setRunButtonLoading(false);
      });
  } else if (selectedBox.dataset.type === "sql") {
    if (state.sqlMode === "basic" || !state.sqlMode) {
      let selectClause = document.getElementById("selectDisplay").textContent.trim();
      if (!selectClause || selectClause === "Select columns") {
        selectClause = "*";
      } else {
        selectClause = selectClause.split(",").map(col => `"${col.trim()}"`).join(", ");
      }
      let whereClause = "";
      let baseColumn = document.getElementById("whereDisplay").textContent.trim();
      let opText = document.getElementById("operatorDisplay").textContent.trim();
      const opMap = { "=": "=", "<": "<", ">": ">" }; 
      let baseOperator = opMap[opText] || "=";
      let baseValue = document.getElementById("whereValue").value.trim();
      if (baseColumn && baseColumn !== "Select columns" && baseValue) {
        whereClause = `"${baseColumn}" ${baseOperator} "${baseValue}"`;
      }
      document.querySelectorAll("#additionalWhereContainer .where-condition").forEach(cond => {
        let col = cond.querySelector(".where-button span").textContent.trim();
        let opTxt = cond.querySelector(".operator-button span").textContent.trim();
        let opSym = opMap[opTxt] || "=";
        let val = cond.querySelector(".whereValue").value.trim();
        let operatorLabelElem = cond.querySelector(".where-operator-label");
        let opLabel = (operatorLabelElem && operatorLabelElem.textContent.trim()) || "AND";
        if (col && col !== "Select columns" && val) {
          if (whereClause !== "") { whereClause += " " + opLabel + " "; }
          whereClause += `"${col}" ${opSym} "${val}"`;
        }
      });
      let sql = "";
      if (whereClause) {
        sql = "SELECT " + selectClause + " FROM df\nWHERE " + whereClause.replace(/ (AND|OR) /g, "\n$1 ");
      } else {
        sql = "SELECT " + selectClause + " FROM df";
      }
      state.basicSQL = sql;
      let parentState = boxState[state.parent];
      if (!parentState || !parentState.data) {
        setTimeout(() => { runQuery(); }, 1500);
        return;
      }
      let payload = { sql: state.basicSQL, data: parentState.data };
      fetch("http://127.0.0.1:8000/sql_transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(response => response.json())
        .then(data => {
          let resultArray = data.data;
          resultArray._columns = data.columns || Object.keys(resultArray[0] || {});
          displayTable(resultArray);
          state.result = document.getElementById("tableContainer").innerHTML;
          state.data = resultArray;
          state.header = document.getElementById("tableHeader").textContent;
          setRunButtonLoading(false);
        })
        .catch(err => {
          console.error("Error running SQL transform:", err);
          alert("Error running SQL transform.");
          setRunButtonLoading(false);
        });
    } else {
      state.advancedSQL = sqlEditorCM.getValue();
      let parentState = boxState[state.parent];
      if (!parentState || !parentState.data) {
        setTimeout(() => { runQuery(); }, 1500);
        return;
      }
      let payload = { sql: state.advancedSQL, data: parentState.data };
      fetch("http://127.0.0.1:8000/sql_transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(response => response.json())
        .then(data => {
          let resultArray = data.data;
          resultArray._columns = data.columns || Object.keys(resultArray[0] || {});
          displayTable(resultArray);
          state.result = document.getElementById("tableContainer").innerHTML;
          state.data = resultArray;
          state.header = document.getElementById("tableHeader").textContent;
          setRunButtonLoading(false);
        })
        .catch(err => {
          console.error("Error running SQL transform:", err);
          alert("Error running SQL transform.");
          setRunButtonLoading(false);
        });
    }
  } else if (selectedBox.dataset.type === "plot") {
    let xButton = document.getElementById("xSelectButton");
    let xField = xButton.dataset.selected || xButton.querySelector("span").textContent.trim();
    let yFields = [];
    let baseY = document.getElementById("ySelectButton_1").dataset.selected ||
                document.getElementById("ySelectButton_1").querySelector("span").textContent.trim();
    if (baseY && baseY !== "Select a column") { yFields.push(baseY); }
    let additionalY = document.querySelectorAll("#ySelectContainer .y-select-group");
    additionalY.forEach((group, idx) => {
      if (idx === 0) return; // Skip the base row
      let val = group.querySelector("button").dataset.selected || group.querySelector("button span").textContent.trim();
      if (val && val !== "Select a column") { yFields.push(val); }
    });
    if (!xField || xField === "Select a column" || yFields.length === 0) {
      alert("Please select an X field and at least one Y value.");
      setRunButtonLoading(false);
      return;
    }
    state.xField = xField;
    state.yFields = yFields;
    let parentState = boxState[state.parent];
    if (!parentState || !parentState.data) {
      setTimeout(() => { runQuery(); }, 1500);
      return;
    }
    let rawData = parentState.data;
    const colorPalette = ['#00008B', '#FF0000', '#008000', '#800080', '#FFA500',
                          '#00CED1', '#DC143C', '#006400', '#8B008B', '#FF1493'];
    let datasets = yFields.map((yField, index) => {
      let chartData = rawData.map(item => ({
        x: parseFloat(item[xField]),
        y: parseFloat(item[yField])
      }));
      return {
        label: yField,
        data: chartData,
        borderColor: colorPalette[index % colorPalette.length],
        backgroundColor: colorPalette[index % colorPalette.length],
        fill: false,
        tension: 0,
        borderWidth: 1.5,
        pointRadius: 0
      };
    });
    let config = {
      type: 'line',
      data: { datasets: datasets },
      options: {
        animation: false,
        plugins: { legend: { display: true, position: 'top', labels: { font: { size: 12 } } } },
        scales: {
          x: { type: 'linear', position: 'bottom', title: { display: true, text: xField, font: { size: 12 } }, ticks: { font: { size: 12 } } },
          y: { ticks: { font: { size: 12 } } }
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
    setRunButtonLoading(false);
  } else if (selectedBox.dataset.type === "join") {
    let joinType = document.getElementById("joinTypeDisplay").textContent || "Left Join";
    let leftVal = document.getElementById("leftJoinColumnButton").dataset.selected || "";
    let rightVal = document.getElementById("rightJoinColumnButton").dataset.selected || "";
    const joinTypeMap = {
      "Left Join": "left  ",
      "Right Join": "right",
      "Inner Join": "inner",
      "Outer Join": "outer",
      "Cross Join": "cross"
    };
    let formattedJoinType = joinTypeMap[joinType] || joinType;
    state.joinType = formattedJoinType;
    state.leftJoinColumn = leftVal;
    state.rightJoinColumn = rightVal;
    let leftState = boxState[state.leftParent];
    let rightState = boxState[state.rightParent];
    if (!leftState || !leftState.data || !rightState || !rightState.data) {
      alert("Both parent SQL transform boxes must have data to join.");
      setRunButtonLoading(false);
      return;
    }
    let payload = {
      left_data: leftState.data,
      right_data: rightState.data,
      left_join_column: leftVal,
      right_join_column: rightVal,
      join_type: formattedJoinType
    };
    fetch("http://127.0.0.1:8000/sql_join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(response => response.json())
      .then(data => {
        let resultArray = data.data;
        resultArray._columns = data.columns || Object.keys(resultArray[0] || {});
        displayTable(resultArray);
        state.result = document.getElementById("tableContainer").innerHTML;
        state.data = resultArray;
        state.header = document.getElementById("tableHeader").textContent;
        setRunButtonLoading(false);
      })
      .catch(err => {
        console.error("Error running join:", err);
        alert("Error running join.");
        setRunButtonLoading(false);
      });
  }
}

// ============================================================
// Box Creation: Create a new box and initialize its state.
// ============================================================
function createBox(title, type, parentId = null, configState = null) {
  const whiteboard = document.getElementById("whiteboard");
  const box = document.createElement("div");
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
      // Initialize SQL box state with its own defaults.
      boxState[box.id] = {
        basicSQL: "",
        advancedSQL: "SELECT * FROM df",
        sqlMode: "basic",
        selectClause: "",
        baseColumn: "",
        baseOperator: "=",
        baseValue: "",
        additionalWhere: []
      };
    } else if (type === "join") {
      boxState[box.id] = { joinType: "Left Join", leftJoinColumn: "", rightJoinColumn: "" };
    } else if (type === "influx") {
      boxState[box.id] = { code: "Run to show available tables", header: "Results: InfluxDB" };
    } else if (type === "plot") {
      // For plot boxes, do not preinitialize a removable base Y field.
      boxState[box.id] = { xField: "", yFields: [], chartConfig: null, result: "" };
    }
  }
  
  let buttonsHTML = "";
  switch (type) {
    case "influx":
      boxTitle = "InfluxDB";
      buttonsHTML = `<button class="query-btn" title="Create Table Query">
                        <i class="fas fa-database"></i>
                     </button>`;
      break;
    case "table":
      boxTitle = "Query " + tableQueryCounter;
      tableQueryCounter++;
      boxState[box.id].header = `Results: Query ${tableQueryCounter - 1}`;
      boxState[box.id].parent = (parentId && document.getElementById(parentId).dataset.type !== "influx") ? parentId : box.id;
      buttonsHTML = `<button class="transform-btn" title="Create SQL Transform">
                        <i class="fas fa-code"></i>
                     </button>
                     <button class="plot-btn" title="Create Plot">
                        <i class="fas fa-chart-line"></i>
                     </button>
                     <button class="minus-btn" title="Delete Box">
                        <i class="fas fa-times-circle"></i>
                     </button>`;
      break;
    case "sql":
      boxTitle = "Transform " + sqlTransformCounter;
      sqlTransformCounter++;
      boxState[box.id].header = `Results: Transform ${sqlTransformCounter - 1}`;
      boxState[box.id].parent = parentId;
      buttonsHTML = `<button class="plot-btn" title="Create Plot">
                        <i class="fas fa-chart-line"></i>
                     </button>
                     <button class="join-btn" title="Create Join">
                        <i class="fas fa-code-branch"></i>
                     </button>
                     <button class="minus-btn" title="Delete Box">
                        <i class="fas fa-times-circle"></i>
                     </button>`;
      break;
    case "plot":
      boxTitle = "Plot " + plotCounter;
      plotCounter++;
      boxState[box.id].header = `Results: Plot ${plotCounter - 1}`;
      boxState[box.id].parent = parentId;
      buttonsHTML = `<button class="minus-btn" title="Delete Box">
                        <i class="fas fa-times-circle"></i>
                     </button>`;
      break;
    case "join":
      boxTitle = title || "Join " + joinCounter;
      joinCounter++;
      boxState[box.id].joinType = boxState[box.id].joinType || "Inner";
      boxState[box.id].leftJoinColumn = "";
      boxState[box.id].rightJoinColumn = "";
      boxState[box.id].header = `Results: Join ${joinCounter - 1}`;
      buttonsHTML = `<button class="plot-btn" title="Create Plot">
                        <i class="fas fa-chart-line"></i>
                     </button>
                     <button class="minus-btn" title="Delete Box">
                        <i class="fas fa-times-circle"></i>
                     </button>`;
      break;
  }
  
  box.innerHTML = `<div class="box-title">${boxTitle}</div>${buttonsHTML}`;
  
  // Positioning logic
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
  
  // Box click event
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
  
  // Button event listeners for creating new boxes from this box.
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

// ============================================================
// selectBox: Set the given box as selected and rehydrate its UI from its state.
// ============================================================
function selectBox(box) {
  // Save current box state before switching
  saveCurrentBoxState();

  // Remove "selected" class from all boxes and mark the new box as selected
  boxes.forEach(b => b.classList.remove("selected"));
  box.classList.add("selected");
  selectedBox = box;

  // Retrieve state for this box
  const boxId = box.id;
  const state = boxState[boxId] || {};
  const title = box.querySelector(".box-title").textContent;
  document.getElementById("navigatorHeader").textContent = "Navigator: " + title;

  // Hide all panels
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

  // Show and populate the correct panel based on the box type
  if (box.dataset.type === "influx") {
    panels.codeEditorText.style.display = "block";
    panels.codeEditorText.value = state.code || "Run to show available tables";
  } else if (box.dataset.type === "table") {
    panels.queryForm.style.display = "block";
    updateDropdownMenu("tableDropdownMenu", "tableQueryButton", "dropdown-search", "table-option", measurementsData, function(selectedOption) {
      state.table = selectedOption;
    });
    document.getElementById("tableQueryDisplay").textContent = state.table || "Select a table";
    document.getElementById("startTime").value = state.start_time || "";
    document.getElementById("endTime").value = state.end_time || "";
  } else if (box.dataset.type === "sql") {
    panels.sqlEditor.style.display = "block";
    // Ensure default values are set if not already stored
    state.selectClause = state.selectClause || "";
    state.baseColumn = state.baseColumn || "";
    state.baseOperator = state.baseOperator || "=";
    state.baseValue = state.baseValue || "";
    state.additionalWhere = state.additionalWhere || [];
    updateTransformDropdowns(boxId);
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
    document.getElementById("selectDisplay").textContent = state.selectClause || "Select columns";
    document.getElementById("whereDisplay").textContent = state.baseColumn || "Select columns";
    document.getElementById("operatorDisplay").textContent = state.baseOperator || "=";
    document.getElementById("whereValue").value = state.baseValue || "";
    // Rebuild additional WHERE rows from state
    const additionalContainer = document.getElementById("additionalWhereContainer");
    additionalContainer.innerHTML = "";
    if (state.additionalWhere.length > 0) {
      state.additionalWhere.forEach(rowData => {
        addWhereRow(rowData.logic, null, rowData);
      });
    }
  } else if (box.dataset.type === "plot") {
    panels.plotForm.style.display = "block";
    updatePlotDropdowns(boxId);
    if (!state.yFields || state.yFields.length === 0) {
      state.yFields = [""];
    }
    const yContainer = document.getElementById("ySelectContainer");
    const yValuesWrapper = yContainer.querySelector(".y-values-wrapper");
    yValuesWrapper.innerHTML = "";
    // Rebuild Y field rows
    {
      // Base Y field row
      let baseY = state.yFields[0] || "";
      let groupDiv = document.createElement("div");
      groupDiv.className = "form-group y-select-group";
      groupDiv.innerHTML = `
          <label for="ySelectDisplay_1">Y Values:</label>
          <div class="plot-row">
            <div class="custom-dropdown plot-dropdown">
              <button id="ySelectButton_1" aria-haspopup="true" aria-expanded="false" data-selected="${baseY}">
                <span id="ySelectDisplay_1">${baseY || "Select a column"}</span>
              </button>
              <div class="plot-dropdown-menu" id="ySelectDropdownMenu_1"></div>
            </div>
          </div>`;
      yValuesWrapper.appendChild(groupDiv);
      let baseButton = groupDiv.querySelector("#ySelectButton_1");
      baseButton.addEventListener("click", function(e) {
         e.stopPropagation();
         const menu = groupDiv.querySelector("#ySelectDropdownMenu_1");
         menu.style.display = menu.style.display === "block" ? "none" : "block";
      });
      document.addEventListener("click", function() {
         const dd = document.getElementById("ySelectDropdownMenu_1");
         if (dd) dd.style.display = "none";
      });
      let baseMenu = document.getElementById("ySelectDropdownMenu_1");
      addDropdownSearch(baseMenu, "dropdown-search", "plot-option");
      populateDropdown(baseMenu, getParentColumns(selectedBox.id), "plot-option", "ySelectButton_1", function(selectedOption) {
         baseButton.dataset.selected = selectedOption;
         state.yFields[0] = selectedOption;
      });
    }
    // Additional Y field rows
    for (let i = 1; i < state.yFields.length; i++) {
      let yVal = state.yFields[i] || "";
      let newIndex = i + 1;
      let groupDiv = document.createElement("div");
      groupDiv.className = "form-group y-select-group";
      groupDiv.innerHTML = `
          <label for="ySelectDisplay_${newIndex}">Y Values:</label>
          <div class="plot-row">
            <div class="custom-dropdown plot-dropdown">
              <button id="ySelectButton_${newIndex}" aria-haspopup="true" aria-expanded="false" data-selected="${yVal}">
                <span id="ySelectDisplay_${newIndex}">${yVal || "Select a column"}</span>
              </button>
              <div class="plot-dropdown-menu" id="ySelectDropdownMenu_${newIndex}"></div>
            </div>
            <button class="remove-y-btn" title="Remove Y Value">
              <i class="fas fa-times-circle"></i>
            </button>
          </div>`;
      yValuesWrapper.appendChild(groupDiv);
      let extraButton = groupDiv.querySelector(`#ySelectButton_${newIndex}`);
      extraButton.addEventListener("click", function(e) {
         e.stopPropagation();
         const menu = groupDiv.querySelector(`#ySelectDropdownMenu_${newIndex}`);
         menu.style.display = menu.style.display === "block" ? "none" : "block";
      });
      document.addEventListener("click", function(){
         const dd = document.getElementById(`ySelectDropdownMenu_${newIndex}`);
         if (dd) dd.style.display = "none";
      });
      groupDiv.querySelector(".remove-y-btn").addEventListener("click", function(e) {
         e.preventDefault();
         groupDiv.remove();
         let newYFields = [];
         yValuesWrapper.querySelectorAll(".custom-dropdown button").forEach(btn => {
           let val = btn.dataset.selected || btn.querySelector("span").textContent.trim();
           if (val && val !== "Select a column") newYFields.push(val);
         });
         state.yFields = newYFields;
      });
      let menu = document.getElementById(`ySelectDropdownMenu_${newIndex}`);
      addDropdownSearch(menu, "dropdown-search", "plot-option");
      addClearOption(menu, "plot-option", `ySelectButton_${newIndex}`);
      let cols = getParentColumns(selectedBox.id);
      populateDropdown(menu, cols, "plot-option", `ySelectButton_${newIndex}`, function(selectedOption) {
         extraButton.dataset.selected = selectedOption;
         state.yFields[newIndex - 1] = selectedOption;
      });
    }
    document.getElementById("tableContainer").innerHTML = state.result || "";
    if (state.chartConfig) { renderChart(state.chartConfig); }
    document.getElementById("xSelectDisplay").textContent = state.xField || "Select a column";
  } else if (box.dataset.type === "join") {
    panels.joinForm.style.display = "block";
    updateJoinDropdowns(box.id);
    document.getElementById("joinTypeDisplay").textContent = state.joinType || "Left Join";
    document.getElementById("leftJoinColumnDisplay").textContent = state.leftJoinColumn || "Select column";
    document.getElementById("rightJoinColumnDisplay").textContent = state.rightJoinColumn || "Select column";
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
  // Create the Influx box immediately and select it.
  const influxBox = createBox("InfluxDB", "influx");
  selectBox(influxBox);
  runQuery();

  // Dark mode toggle.
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
    ["tableQueryButton", "xSelectButton", "ySelectButton_1", "selectButton", "whereButton", "joinTypeButton", "leftJoinColumnButton", "rightJoinColumnButton"],
    ["tableDropdownMenu", "xSelectDropdownMenu", "ySelectDropdownMenu_1", "selectDropdownMenu", "whereDropdownMenu", "joinTypeDropdownMenu", "leftJoinDropdownMenu", "rightJoinDropdownMenu"]
  );
  
  let condCount = 5;
  for (let index = 0; index < condCount; index++) {
    const buttonId = `additionalWhereButton_${index}`;
    const menuId = `whereDropdownMenu_${index}`;
    setupDropdownToggle([buttonId], [menuId]);
  }

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
    extraKeys: { "Ctrl-Space": "autocomplete" },
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
    if (change.text[0].match(/\w/)) {
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

  document.querySelectorAll("#joinTypeDropdownMenu .join-option").forEach(option => {
    option.addEventListener("click", function(e) {
      const selected = option.dataset.value;
      const joinTypeDisplay = document.getElementById("joinTypeDisplay");
      joinTypeDisplay.textContent = selected + " Join";
      if (selectedBox && selectedBox.dataset.type === "join") {
        boxState[selectedBox.id].joinType = selected;
      }
      document.getElementById("joinTypeDropdownMenu").style.display = "none";
    });
  });
});

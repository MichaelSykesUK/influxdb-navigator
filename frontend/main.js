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
    state.whereClause = document.getElementById("whereDisplay").textContent.trim();
    state.whereOperator = document.getElementById("operatorDisplay").textContent.trim();
    state.whereValue = document.getElementById("whereValue").value.trim();
    // Save additional WHERE rows using a new helper that saves even empty values
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
    state.basicSQL = document.getElementById("basicSQLPreview").innerText;
    state.advancedSQL = sqlEditorCM.getValue();
    state.sqlMode = state.sqlMode || "basic";
    console.log("State.additionalWhere", state.additionalWhere)
  } else if (type === "plot") {
    let xVal = document.getElementById("xSelectDisplay").textContent.trim();
    state.xField = (xVal && xVal !== "Select a column") ? xVal : "";
    let yVal = document.getElementById("ySelectDisplay").textContent.trim();
    state.yField = (yVal && yVal !== "Select a column") ? yVal : "";
    let additionalYFields = [];
    document.querySelectorAll("#ySelectContainer .form-group").forEach(group => {
        let btn = group.querySelector("button");
        let val = btn.dataset.selected || btn.querySelector("span").textContent.trim();
        additionalYFields.push(val); // Save all values, including "Select a column"
    });
    state.additionalYFields = additionalYFields;
  } else if (type === "join") {
    state.joinType = document.getElementById("joinTypeDisplay").textContent.trim();
    state.leftJoinColumn = document.getElementById("leftJoinColumnDisplay").textContent.trim();
    state.rightJoinColumn = document.getElementById("rightJoinColumnDisplay").textContent.trim();
  }
  boxState[boxId] = state;
  console.log('Saved state for', boxId, boxState[boxId]);
}

// ============================================================
// Utility Functions (Dropdowns, etc.)
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

function updateTransformDropdowns(boxId) { 
  const state = boxState[boxId] || {};
  let cols = getParentColumns(boxId);

  updateDropdownMenuMulti("selectDropdownMenu", "selectButton", "dropdown-search", "select-option", cols, function(selectedOptions) {
    state.selectClause = selectedOptions.join(", ");
  });
  updateDropdownMenu("whereDropdownMenu", "whereButton", "dropdown-search", "where-option", cols, function(selectedOption) {
    state.whereClause = selectedOption;
  });

  for (let i = 1; i <= state.additionalWhere.length; i++) {
    updateDropdownMenu(
      `additionalWhereDropdownMenu_${i}`,
      `additionalWhereButton_${i}`,
      "dropdown-search",
      "where-option",
      cols,
      function(selectedOption) {
        state.additionalWhere[i-1] = selectedOption;
      }
    );
  }
  updateSQLFromBasic();
}

function updatePlotDropdowns(boxId) {
  const state = boxState[boxId];
  const cols = getParentColumns(boxId);

  // Update main X dropdown
  updateDropdownMenu("xSelectDropdownMenu", "xSelectButton", "dropdown-search", "plot-option", cols, (selected) => {
      state.xField = selected;
      document.getElementById("xSelectDisplay").textContent = selected;
  });

  // Update main Y dropdown
  updateDropdownMenu("ySelectDropdownMenu", "ySelectButton", "dropdown-search", "plot-option", cols, (selected) => {
      state.yField = selected;
      document.getElementById("ySelectDisplay").textContent = selected;
  });

  // Update additional Y dropdowns
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

function loadSQLBoxState(boxId) {
  const state = boxState[boxId];
  console.log('Loaded state for', boxId, state);
  if (!state) return;
  document.getElementById("selectDisplay").textContent = state.selectClause || "Select columns";
  document.getElementById("whereDisplay").textContent = state.whereClause || "Select columns";
  document.getElementById("operatorDisplay").textContent = state.whereOperator || "=";
  document.getElementById("whereValue").value = state.whereValue || "";
  // Clear and rebuild additional WHERE rows
  const container = document.getElementById("additionalWhereContainer");
  container.innerHTML = "";
  if (state.additionalWhere && state.additionalWhere.length > 0) {
    state.additionalWhere.forEach(cond => {
      console.log("Restoring condition:", cond);
      addWhereRow(cond.logic, null, cond);
    });
  }
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
    <input type="text" class="whereValue" id="additionalWhereValue_${index}" placeholder="e.g. BAT1" value="${savedValue}">
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
// Accepts an optional rowData object for rehydration.
// ============================================================
function addYRow(e, rowData = null) {
  if (e) e.preventDefault();
  
  // For additional Y rows, add entries beyond the base field.
  const yContainer = document.getElementById("ySelectContainer");
  const yValuesWrapper = yContainer;
  let newIndex = yValuesWrapper.querySelectorAll(".form-group").length + 1;
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
      <button class="remove-y-btn" title="Remove Y Value">
        <i class="fas fa-times-circle"></i>
      </button>
    </div>`;

  yValuesWrapper.appendChild(groupDiv);
  
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
    boxState[selectedBox.id].additionalYFields = newYFields;
  });

  // Create dropdown features
  let menu = document.getElementById(`ySelectDropdownMenu_${newIndex}`);
  addDropdownSearch(menu, "dropdown-search", "plot-option");
  addClearOption(menu, "plot-option", `ySelectButton_${newIndex}`);
  let cols = getParentColumns(selectedBox.id);
  
  populateDropdown(menu, cols, "plot-option", `ySelectButton_${newIndex}`, function(selectedOption) {
    extraButton.dataset.selected = selectedOption;
    state = boxState[selectedBox.id];
    if (!state.additionalYFields) { state.additionalYFields = []; }
    state.additionalYFields[newIndex - 1] = selectedOption;
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
      let whereClauseCombined = "";
      let whereClause = document.getElementById("whereDisplay").textContent.trim();
      let opText = document.getElementById("operatorDisplay").textContent.trim();
      const opMap = { "=": "=", "<": "<", ">": ">" }; 
      let whereOperator = opMap[opText] || "=";
      let whereValue = document.getElementById("whereValue").value.trim();
      if (whereClause && whereClause !== "Select columns" && whereValue) {
        whereClause = `"${whereClause}" ${whereOperator} "${whereValue}"`;
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
          whereClauseCombined += `"${col}" ${opSym} "${val}"`;
        }
      });
      let sql = "";
      if (whereClauseCombined) {
        sql = "SELECT " + selectClause + " FROM df\nWHERE " + whereClauseCombined.replace(/ (AND|OR) /g, "\n$1 ");
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
      setRunButtonLoading(false);
      return;
    }

    state.xField = xField;
    state.yField = yField;
    state.additionalYFields = additionalYFields;
    let parentState = boxState[state.parent];
    if (!parentState || !parentState.data) {
      setTimeout(() => { runQuery(); }, 1500);
      return;
    }
    let rawData = parentState.data;
    const colorPalette = ['#00008B', '#FF0000', '#008000', '#800080', '#FFA500',
                          '#00CED1', '#DC143C', '#006400', '#8B008B', '#FF1493'];

    // Combine the primary yField with additionalYFields into a single array.
    let allYFields = [yField, ...additionalYFields];

    let datasets = allYFields.map((yField, index) => {
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
      "Left Join": "left",
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
        whereClause: "",
        whereOperator: "=",
        whereValue: "",
        additionalWhere: []
      };
    } else if (type === "join") {
      boxState[box.id] = { joinType: "Left Join", leftJoinColumn: "", rightJoinColumn: "" };
    } else if (type === "influx") {
      boxState[box.id] = { code: "Run to show available tables", header: "Results: InfluxDB" };
    } else if (type === "plot") {
      // For plot boxes, do not preinitialize a removable base Y field.
      boxState[box.id] = { xField: "", yField: "", additionalYFields: [], chartConfig: null, result: "" };
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
      boxState[box.id].joinType = boxState[box.id].joinType || "Left Join";
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
    document.getElementById("tableQueryDisplay").textContent = state.table || "batspk__4_2_0__ethernet__65400";
    document.getElementById("startTime").value = state.start_time || "2024-07-25T16:47:00Z";
    document.getElementById("endTime").value = state.end_time || "2024-07-25T16:47:10Z";
  } else if (box.dataset.type === "sql") {

    // Show sqlEditor
    panels.sqlEditor.style.display = "block";

    // Reset the UI to defaults first
    document.getElementById("selectDisplay").textContent = state.selectClause || "Select columns";
    document.getElementById("whereDisplay").textContent = state.whereClause || "Select columns";
    document.getElementById("operatorDisplay").textContent = state.whereOperator || "=";
    document.getElementById("whereValue").value = state.whereValue || "";
    state.additionalYFields = Array.isArray(state.additionalWhere) ? state.additionalWhere : [];
    const whereContainer = document.getElementById("additionalWhereContainer")

    if (whereContainer) {
      whereContainer.innerHTML = "";
      state.additionalWhere.forEach(rowData => {
        addWhereRow(rowData.logic, null, rowData);
      })
    }
    // Continue with your existing logic to update dropdowns and rebuild additional WHERE rows
    updateTransformDropdowns(boxId);
    // Recall sql mode
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
              const index = i;
              const groupDiv = document.createElement("div");
              groupDiv.className = "form-group";
              groupDiv.innerHTML = `
                  <label for="ySelectDisplay_${index}">Y Values:</label>
                  <div class="plot-row">
                      <div class="custom-dropdown plot-dropdown">
                          <button id="ySelectButton_${index}" data-selected="${yVal || ''}">
                              <span id="ySelectDisplay_${index}">${yVal || "Select a column"}</span>
                          </button>
                          <div class="plot-dropdown-menu" id="ySelectDropdownMenu_${index}"></div>
                      </div>
                      <button class="remove-y-btn"><i class="fas fa-times-circle"></i></button>
                  </div>
              `;
              yContainer.appendChild(groupDiv);
  
              let extraButton = groupDiv.querySelector(`#ySelectButton_${index}`);
              extraButton.addEventListener("click", function(e) {
                  e.stopPropagation();
                  const menu = groupDiv.querySelector(`#ySelectDropdownMenu_${index}`);
                  menu.style.display = menu.style.display === "block" ? "none" : "block";
              });
  
              document.addEventListener("click", function() {
                  const dd = document.getElementById(`ySelectDropdownMenu_${index}`);
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
  
              let menu = document.getElementById(`ySelectDropdownMenu_${index}`);
              addDropdownSearch(menu, "dropdown-search", "plot-option");
              addClearOption(menu, "plot-option", `ySelectButton_${index}`);
              let cols = getParentColumns(selectedBox.id);
              populateDropdown(menu, cols, "plot-option", `ySelectButton_${index}`, function(selectedOption) {
                  extraButton.dataset.selected = selectedOption;
                  state.additionalYFields[i-1] = selectedOption;
              });
          });
          updatePlotDropdowns(boxId);
          console.log('UI values:', {
              x: document.getElementById("xSelectDisplay").textContent,
              y: document.getElementById("ySelectDisplay").textContent,
              additional: Array.from(yContainer.querySelectorAll(".form-group button span")).map(span => span.textContent)
          });
      }
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

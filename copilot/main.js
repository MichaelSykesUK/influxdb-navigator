"use strict";

// ============================================================
// Global State Management
// ============================================================
const AppState = {
  connectors: [],
  tableQueryCounter: 1,
  sqlTransformCounter: 1,
  plotCounter: 1,
  joinCounter: 1,
  selectedBox: null,
  boxState: {},
  boxIdCounter: 0,
  measurementsData: [],
  currentChart: null,
  boxes: [],
  sqlEditorCM: null,
  joinLinkingSource: null,
  plotYState: {},
  transWhereState: {},
  incrementCounter(type) {
    this[`${type}Counter`]++;
    return this[`${type}Counter`];
  }
};

// ============================================================
// Utility Functions
// ============================================================

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function toggleDropdown(dropdown) {
  dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
}

function closeAllDropdowns() {
  document.querySelectorAll(".where-dropdown-menu, .operator-dropdown-menu, .plot-dropdown-menu").forEach(menu => {
    menu.style.display = "none";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".where-dropdown, .operator-dropdown, .plot-dropdown")) {
      closeAllDropdowns();
    }
  });
});

function addEventListenersToGroupDiv(groupDiv, index) {
  groupDiv.querySelectorAll(".whereValue, .where-button, .operator-button, .where-operator-label").forEach(el => {
    el.addEventListener("change", debounce(updateSQLFromBasic, 300));
    el.addEventListener("input", debounce(updateSQLFromBasic, 300));
    el.addEventListener("click", debounce(updateSQLFromBasic, 300));
  });

  const extraWhereButton = groupDiv.querySelector(`#whereButton_${index}`);
  extraWhereButton.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleDropdown(groupDiv.querySelector(`#whereDropdownMenu_${index}`));
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
    groupDiv.remove();
    updateSQLFromBasic();
  });
}

function addWhereRow(operatorLabel, e) {
  if (e) e.preventDefault();
  const currentCount = AppState.transWhereState[AppState.selectedBox.id] || 0;
  const newCount = currentCount + 1;
  AppState.transWhereState[AppState.selectedBox.id] = newCount;
  const index = newCount;
  const container = document.getElementById("additionalWhereContainer");
  const groupDiv = document.createElement("div");
  groupDiv.className = "sql-row where-condition";
  groupDiv.innerHTML = `
    <label class="where-operator-label">${operatorLabel}</label>
    <div class="custom-dropdown where-dropdown">
      <button id="whereButton_${index}" class="where-button" aria-haspopup="true" aria-expanded="false">
        <span id="whereDisplay_${index}">Select columns</span>
      </button>
      <div id="whereDropdownMenu_${index}" class="where-dropdown-menu"></div>
    </div>
    <div class="custom-dropdown operator-dropdown">
      <button id="operatorButton_${index}" class="operator-button" aria-haspopup="true" aria-expanded="false">
        <span id="operatorDisplay_${index}">=</span>
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
    <input type="text" class="whereValue" id="whereValue_${index}" placeholder='e.g. BAT1'>
    <button class="remove-where-btn" title="Remove condition">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#ffffff" viewBox="0 0 24 24">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    </button>
  `;

  addEventListenersToGroupDiv(groupDiv, index);

  container.appendChild(groupDiv);

  let additWhereMenu = document.getElementById(`whereDropdownMenu_${index}`);
  addDropdownSearch(additWhereMenu, "dropdown-search", ".where-option");
  addClearOption(additWhereMenu, ".where-option", `whereButton_${index}`);
  let cols = getParentColumns(AppState.selectedBox.id);
  populateDropdown(additWhereMenu, cols, "where-option", `whereButton_${index}`);
  updateSQLFromBasic();
}

function addYRow(e) {
  if (e) e.preventDefault();
  AppState.plotYState[AppState.selectedBox.id] = (AppState.plotYState[AppState.selectedBox.id] || 1) + 1;
  const yContainer = document.getElementById("ySelectContainer");
  const yValuesWrapper = yContainer.querySelector(".y-values-wrapper");
  let newIndex = document.querySelectorAll("#ySelectContainer .y-select-group").length + 1;

  const groupDiv = document.createElement("div");
  groupDiv.className = "form-group y-select-group";
  groupDiv.innerHTML = `
    <label for="ySelectDisplay_${newIndex}">Y Values:</label>
    <div class="plot-row">
      <div class="custom-dropdown plot-dropdown">
        <button id="ySelectButton_${newIndex}" aria-haspopup="true" aria-expanded="false">
          <span id="ySelectDisplay_${newIndex}">Select a column</span>
        </button>
        <div class="plot-dropdown-menu" id="ySelectDropdownMenu_${newIndex}"></div>
      </div>
      <button class="remove-y-btn" title="Remove Y Value">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#ffffff" viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </div>`;

  yValuesWrapper.appendChild(groupDiv);
  updatePlotDropdowns(AppState.selectedBox.id);

  const extraYButton = groupDiv.querySelector(`#ySelectButton_${newIndex}`);
  extraYButton.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleDropdown(groupDiv.querySelector(`#ySelectDropdownMenu_${newIndex}`));
  });

  groupDiv.querySelector(".remove-y-btn").addEventListener("click", function (e) {
    e.preventDefault();
    yValuesWrapper.removeChild(groupDiv);
  });

  let menu = document.getElementById(`ySelectDropdownMenu_${newIndex}`);
  addDropdownSearch(menu, "dropdown-search", ".where-option");
  addClearOption(menu, ".plot-option", `ySelectButton_${newIndex}`);
  let cols = getParentColumns(AppState.selectedBox.id);
  populateDropdown(menu, cols, "plot-option", `ySelectButton_${newIndex}`);
}

// ============================================================
// runQuery Function
// ============================================================

function runQuery() {
  if (!AppState.selectedBox) {
    alert("Select a box first.");
    return;
  }
  setRunButtonLoading(true);
  const state = AppState.boxState[AppState.selectedBox.id];

  if (AppState.selectedBox.dataset.type === "influx") {
    fetch("http://127.0.0.1:8000/measurements")
      .then(response => response.json())
      .then(data => {
        AppState.measurementsData = data.measurements || [];
        updateTableMenu();
        let resultArray = AppState.measurementsData.map(m => ({ "InfluxDB Tables": m }));
        resultArray._columns = Object.keys(resultArray[0] || {});
        displayTable(resultArray);
        state.result = document.getElementById("tableContainer").innerHTML;
        state.data = resultArray;
        state.header = document.getElementById("tableHeader").textContent;
        setRunButtonLoading(false);
      })
      .catch(err => {
        console.error("Error fetching measurements:", err);
        alert("Error fetching measurements.");
        setRunButtonLoading(false);
      });
  } else if (AppState.selectedBox.dataset.type === "table") {
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
        resultArray._columns = data.columns || Object.keys(resultArray[0] || {});
        displayTable(resultArray);
        state.result = document.getElementById("tableContainer").innerHTML;
        state.data = resultArray;
        state.header = document.getElementById("tableHeader").textContent;
        setRunButtonLoading(false);
      })
      .catch(err => {
        console.error("Error running query:", err);
        alert("Error running query.");
        setRunButtonLoading(false);
      });
  } else if (AppState.selectedBox.dataset.type === "sql") {
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
      const opMap = { "=": "=", "<": "<", ">": ">"};
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
      let parentState = AppState.boxState[state.parent];
      if (!parentState || !parentState.data) {
        setTimeout(() => { runQueryForBox(AppState.selectedBox); }, 1500);
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
      state.advancedSQL = AppState.sqlEditorCM.getValue();
      let parentState = AppState.boxState[state.parent];
      if (!parentState || !parentState.data) {
        setTimeout(() => { runQueryForBox(AppState.selectedBox); }, 1500);
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
  } else if (AppState.selectedBox.dataset.type === "plot") {
    let xButton = document.getElementById("xSelectButton");
    let xField = xButton.dataset.selected || xButton.querySelector("span").textContent.trim();
    let yFields = [];
    let yButtons = document.querySelectorAll("#ySelectContainer .custom-dropdown button");
    yButtons.forEach(btn => {
      let val = btn.dataset.selected || btn.querySelector("span").textContent.trim();
      if (val && val !== "Select a column") { yFields.push(val); }
    });
    if (!xField || xField === "Select a column" || yFields.length === 0) {
      alert("Please select an X field and at least one Y value.");
      setRunButtonLoading(false);
      return;
    }
    state.xField = xField;
    state.yFields = yFields;
    let parentState = AppState.boxState[state.parent];
    if (!parentState || !parentState.data) {
      setTimeout(() => { runQueryForBox(AppState.selectedBox); }, 1500);
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
    state.header = "Results: " + AppState.selectedBox.querySelector(".box-title").textContent;
    document.getElementById("tableHeader").textContent = state.header;
    setRunButtonLoading(false);
  } else if (AppState.selectedBox.dataset.type === "join") {
    let joinType = document.getElementById("joinTypeDisplay").textContent || "Inner";
    let leftVal = document.getElementById("leftJoinColumnButton").dataset.selected || "";
    let rightVal = document.getElementById("rightJoinColumnButton").dataset.selected || "";
    state.joinType = joinType;
    state.leftJoinColumn = leftVal;
    state.rightJoinColumn = rightVal;
    let leftState = AppState.boxState[state.leftParent];
    let rightState = AppState.boxState[state.rightParent];
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
      join_type: joinType
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
// Initialization and Event Listeners
// ============================================================

document.addEventListener("DOMContentLoaded", () => {

  // Create the InfluxDB box on startup.
  createBox("InfluxDB", "influx");
  runQuery();

  // Navigator and header button event listeners.
  document.getElementById("runButton").addEventListener("click", runQuery);
  document.getElementById("exportBtn").addEventListener("click", exportCSV);
  document.getElementById("maximizeBtn").addEventListener("click", toggleMaximize);
  document.getElementById("saveConfigBtn").addEventListener("click", saveConfig);
  document.getElementById("loadConfigBtn").addEventListener("click", () => {
    document.getElementById("loadConfigInput").click();
  });
  document.getElementById("loadConfigInput").addEventListener("change", loadConfig);

  // Window resize events.
  document.getElementById("horizontalDivider").addEventListener("mousedown", startResizeHorizontal);
  document.getElementById("verticalDivider").addEventListener("mousedown", startResizeVertical);
  window.addEventListener("resize", updateConnectors);

  // Reset SQL editors.
  const resetBtn = document.getElementById("resetBasicBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", function() {
      const state = AppState.boxState[AppState.selectedBox.id];
      if (state.sqlMode === "basic") {
        resetBasicSQL();
      } else if (state.sqlMode === "advanced") {
        resetAdvancedSQL();
      }
    });
  }

  // Listening function for dropdowns
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
  
    // Click off to close all menus when clicking elsewhere
    document.addEventListener("click", function () {
      menuIds.forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (menu) menu.style.display = "none";
      });
    });
  }
  
  // Define button IDs and corresponding dropdown menu IDs
  setupDropdownToggle(
    ["tableQueryButton", "xSelectButton", "ySelectButton_1", "selectButton", "whereButton", "joinTypeButton", "leftJoinColumnButton", "rightJoinColumnButton"],
    ["tableDropdownMenu", "xSelectDropdownMenu", "ySelectDropdownMenu_1", "selectDropdownMenu", "whereDropdownMenu", "joinTypeDropdownMenu", "leftJoinDropdownMenu", "rightJoinDropdownMenu"]
  );
  
  // Additional WHERE condition buttons
  let condCount = 5;
  for (let index = 0; index < condCount; index++) {
    const buttonId = `additionalWhereButton_${index}`;
    const menuId = `whereDropdownMenu_${index}`;
  
    setupDropdownToggle([buttonId], [menuId]);
  }

  // Operator dropdown logic.
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

  // Toggle Advanced/Basic mode.
  document.getElementById("toggleAdvanced").addEventListener("click", function() {
    let state = AppState.boxState[AppState.selectedBox.id];
    if (state.sqlMode !== "advanced") {
      document.getElementById("sqlBasicEditor").style.display = "none";
      document.getElementById("sqlAdvancedEditor").style.display = "block";
      this.textContent = "Basic";
      state.sqlMode = "advanced";
      AppState.sqlEditorCM.setValue(state.advancedSQL || "SELECT * FROM df");
    } else {
      document.getElementById("sqlBasicEditor").style.display = "block";
      document.getElementById("sqlAdvancedEditor").style.display = "none";
      this.textContent = "Advanced";
      state.sqlMode = "basic";
    }
  });

  // Add Import Basic button to advanced tab.
  let importBtn = document.getElementById("importBasicBtn");
  document.getElementById("sqlAdvancedEditor").appendChild(importBtn);
  importBtn.addEventListener("click", function() {
    let state = AppState.boxState[AppState.selectedBox.id];
    state.advancedSQL = state.basicSQL || "SELECT * FROM df";
    AppState.sqlEditorCM.setValue(state.advancedSQL);
  });

  // AND/OR buttons.
  document.getElementById("addWhereAnd").addEventListener("click", function(e) {
    e.preventDefault();
    addWhereRow("AND", e);
  });
  document.getElementById("addWhereOr").addEventListener("click", function(e) {
    e.preventDefault();
    addWhereRow("OR", e);
  });

  // Add Y Values button.
  document.getElementById("addYBtn").addEventListener("click", function(e) {
    e.preventDefault();
    addYRow(e);
  });

  // Initialize CodeMirror for Advanced SQL editor.
  const sqlTextarea = document.getElementById("sqlEditorText");
  AppState.sqlEditorCM = CodeMirror.fromTextArea(sqlTextarea, {
    mode: "text/x-sql",
    lineNumbers: false,
    extraKeys: { "Ctrl-Space": "autocomplete" },
    autofocus: false
  });
  AppState.sqlEditorCM.on("inputRead", function(cm, change) {
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
  AppState.sqlEditorCM.on("change", function(cm) {
    if (AppState.selectedBox && AppState.selectedBox.dataset.type === "sql") {
      AppState.boxState[AppState.selectedBox.id].advancedSQL = cm.getValue();
    }
  });

  // Make changes to basic SQL editor on field changes.
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

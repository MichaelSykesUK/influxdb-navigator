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
let boxState = {};
let boxIdCounter = 0;
let measurementsData = [];
let currentChart = null;
let boxes = [];
let sqlEditorCM;
let joinLinkingSource = null;
let plotYState = {};
let transWhereState = {};

// ============================================================
// Utility Functions
// ============================================================

function updateTableMenu() {  
  let tableMenu = document.getElementById("tableDropdownMenu");
  addDropdownSearch(tableMenu, "dropdown-search", "table-option");
  addClearOption(tableMenu, "table-option", "tableQueryButton");
  populateDropdown(tableMenu, measurementsData, "table-option", "tableQueryButton");
}

function updateDropdownMenu(menuID, buttonID, searchClass, optionClass, options) {
  let menu = document.getElementById(menuID);
  addDropdownSearch(menu, searchClass, optionClass);
  addClearOption(menu, optionClass, buttonID);
  populateDropdown(menu, options, optionClass, buttonID);
}

function updateDropdownMenuMulti(menuID, buttonID, searchClass, optionClass, options) {
  let menu = document.getElementById(menuID);
  addDropdownSearch(menu, searchClass, optionClass);
  addClearOption(menu, optionClass, buttonID);
  populateDropdownMulti(menu, options, optionClass, buttonID);
}

function updateTransformDropdowns(plotBoxId) { 
  let cols = getParentColumns(plotBoxId);
  updateDropdownMenuMulti("selectDropdownMenu", "selectButton", "dropdown-search", ".select-option", cols);
  updateDropdownMenu("whereDropdownMenu", "whereButton", "dropdown-search", ".where-option", cols);
  updateSQLFromBasic();
}

function updatePlotDropdowns(plotBoxId) {
  let cols = getParentColumns(plotBoxId);
  updateDropdownMenu("xSelectDropdownMenu", "xSelectButton", "dropdown-search", ".plot-option", cols);
  updateDropdownMenu("ySelectDropdownMenu_1", "ySelectButton_1", "dropdown-search", ".plot-option", cols);
}

function updateJoinDropdowns(joinBoxId) {
  let joinState = boxState[joinBoxId];
  if (!joinState) return;

  // Left search
  let leftJoinMenu = document.getElementById("leftJoinDropdownMenu");
  addDropdownSearch(leftJoinMenu, "dropdown-search", ".join-option");
  // Populate Left Join Column dropdown.
  let parentStateLeft = boxState[joinState.leftParent];
  if (parentStateLeft && parentStateLeft.data && parentStateLeft.data.length > 0) {
    let cols = Object.keys(parentStateLeft.data[0]);
    populateDropdown(leftJoinMenu, cols, "join-option", "leftJoinColumnButton");
  }

  // Right search
  let rightJoinMenu = document.getElementById("rightJoinDropdownMenu");
  addDropdownSearch(rightJoinMenu, "dropdown-search", ".join-option");
  // Populate Right Join Column dropdown.
  let parentStateRight = boxState[joinState.rightParent];
  if (parentStateRight && parentStateRight.data && parentStateRight.data.length > 0) {
    let cols = Object.keys(parentStateRight.data[0]);
    populateDropdown(rightJoinMenu, cols, "join-option", "rightJoinColumnButton");
  }
}

// ============================================================
// Box Creation
// ============================================================

function createBox(title, type, parentId = null, configState = null) {
  const whiteboard = document.getElementById("whiteboard");
  const box = document.createElement("div");
  box.className = "box";
  
  if (configState && configState.id) {
    box.id = configState.id;
  } else {
    box.id = "box-" + boxIdCounter;
    boxIdCounter++;
  }
  
  let boxTitle = title;
  if (configState) {
    boxTitle = configState.title || title;
    boxState[box.id] = Object.assign({}, configState);
    delete boxState[box.id].result;
    delete boxState[box.id].data;
  } else {
    boxState[box.id] = {};
  }
  
  let buttonsHTML = "";
  switch (type) {
    case "influx":
      boxTitle = "InfluxDB";
      boxState[box.id].code = "Run to show available tables";
      boxState[box.id].header = `Results: InfluxDB`;
      buttonsHTML = `<button class="query-btn" title="Create Table Query">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#ffffff" viewBox="0 0 24 24">
            <circle cx="10" cy="10" r="6" stroke="#ffffff" stroke-width="2" fill="none"/>
            <line x1="14" y1="14" x2="20" y2="20" stroke="#ffffff" stroke-width="2"/>
          </svg>
        </button>`;
      break;
    case "table":
      boxTitle = "Query " + tableQueryCounter;
      tableQueryCounter++;
      boxState[box.id].table = "batspk__4_2_0__ethernet__65400";
      boxState[box.id].start_time = "2024-07-25T16:47:00Z";
      boxState[box.id].end_time = "2024-07-25T16:47:30Z";
      boxState[box.id].header = `Results: Query ${tableQueryCounter - 1}`;
      if (parentId && document.getElementById(parentId).dataset.type !== "influx") {
        boxState[box.id].parent = parentId;
      } else {
        boxState[box.id].parent = box.id;
      }
      buttonsHTML = `<button class="transform-btn" title="Create SQL Transform">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#ffffff" viewBox="0 0 24 24">
            <rect x="4" y="6" width="16" height="2"/>
            <rect x="4" y="11" width="16" height="2"/>
            <rect x="4" y="16" width="16" height="2"/>
          </svg>
        </button>
        <button class="plot-btn" title="Create Plot">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#ffffff" viewBox="0 0 24 24">
            <line x1="4" y1="20" x2="20" y2="20" stroke="#ffffff" stroke-width="2"/>
            <line x1="4" y1="20" x2="4" y2="4" stroke="#ffffff" stroke-width="2"/>
            <polyline points="6,20 8,12 12,16 16,8 20,8" fill="none" stroke="#ffffff" stroke-width="1.5"/>
          </svg>
        </button>
        <button class="minus-btn" title="Delete Box">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#ffffff" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>`;
      break;
    case "sql":
      boxTitle = "Transform " + sqlTransformCounter;
      sqlTransformCounter++;
      boxState[box.id].basicSQL = "";
      boxState[box.id].advancedSQL = "SELECT * FROM df";
      boxState[box.id].header = `Results: Transform ${sqlTransformCounter - 1}`;
      boxState[box.id].parent = parentId;
      boxState[box.id].sqlMode = "basic";
      buttonsHTML = `<button class="plot-btn" title="Create Plot">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#ffffff" viewBox="0 0 24 24">
            <line x1="4" y1="20" x2="20" y2="20" stroke="#ffffff" stroke-width="2"/>
            <line x1="4" y1="20" x2="4" y2="4" stroke="#ffffff" stroke-width="2"/>
            <polyline points="6,20 8,12 12,16 16,8 20,8" fill="none" stroke="#ffffff" stroke-width="1.5"/>
          </svg>
        </button>
        <button class="join-btn" title="Create Join">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="#ffffff" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="9" cy="12" r="6" stroke="#ffffff" stroke-width="1.5"/>
            <circle cx="15" cy="12" r="6" stroke="#ffffff" stroke-width="1.5"/>
          </svg>
        </button>
        <button class="minus-btn" title="Delete Box">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#ffffff" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>`;
      break;
    case "plot":
      boxTitle = "Plot " + plotCounter;
      plotCounter++;
      boxState[box.id].xField = "";
      boxState[box.id].yFields = [];
      boxState[box.id].header = `Results: Plot ${plotCounter - 1}`;
      boxState[box.id].parent = parentId;
      buttonsHTML = `<button class="minus-btn" title="Delete Box">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#ffffff" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>`;
      break;
    case "join":
      boxTitle = title || "Join " + joinCounter;
      joinCounter++;
      boxState[box.id].joinType = boxState[box.id].joinType || "Inner";
      boxState[box.id].leftJoinColumn = boxState[box.id].leftJoinColumn || "";
      boxState[box.id].rightJoinColumn = boxState[box.id].rightJoinColumn || "";
      boxState[box.id].header = `Results: Join ${joinCounter - 1}`;
      buttonsHTML = `<button class="plot-btn" title="Create Plot">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#ffffff" viewBox="0 0 24 24">
            <line x1="4" y1="20" x2="20" y2="20" stroke="#ffffff" stroke-width="2"/>
            <line x1="4" y1="20" x2="4" y2="4" stroke="#ffffff" stroke-width="2"/>
            <polyline points="6,20 8,12 12,16 16,8 20,8" fill="none" stroke="#ffffff" stroke-width="1.5"/>
          </svg>
        </button>
        <button class="minus-btn" title="Delete Box">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#ffffff" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
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
    if (newLeft + 150 > whiteboard.offsetWidth) {
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
        if (newTop + 100 > whiteboard.offsetHeight) {
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
      const wbRect = whiteboard.getBoundingClientRect();
      box.style.left = (Math.random() * (wbRect.width - 150)) + "px";
      box.style.top = (Math.random() * (wbRect.height - 100)) + "px";
    }
  } else if (type === "influx") {
    const wbRect = whiteboard.getBoundingClientRect();
    box.style.left = (wbRect.width / 10) + "px";
    box.style.top = (wbRect.height / 3) + "px";
  } else {
    const wbRect = whiteboard.getBoundingClientRect();
    box.style.left = (Math.random() * (wbRect.width - 150)) + "px";
    box.style.top = (Math.random() * (wbRect.height - 100)) + "px";
  }
  
  box.dataset.type = type;
  whiteboard.appendChild(box);
  boxes.push(box);
  makeDraggable(box);
  
  // Box click events.
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
      selectBox(box);
    }
  });
  
  // Button event listeners.
  let queryButton = box.querySelector(".query-btn");
  if (queryButton) {
    queryButton.addEventListener("click", (e) => {
      e.stopPropagation();
      let newBox = createBox("Query", "table", box.id);
      connectBoxes(box, newBox);
      // updateDropdownMenu("tableDropdownMenu", "tableQueryButton", "dropdown-search", "table-option", measurementsData);
      updateTableMenu();
    });
  }
  let transformButton = box.querySelector(".transform-btn");
  if (transformButton) {
    transformButton.addEventListener("click", (e) => {
      e.stopPropagation();
      let newBox = createBox("Transform", "sql", box.id);
      connectBoxes(box, newBox);
      updateTransformDropdowns(box.id);
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
// Box Selection
// ============================================================

function selectBox(box) {
  boxes.forEach(b => b.classList.remove("selected"));
  box.classList.add("selected");
  selectedBox = box;
  const title = box.querySelector(".box-title").textContent;
  document.getElementById("navigatorHeader").textContent = "Navigator: " + title;
  const state = boxState[box.id];
  
  const panels = {
    codeEditorText: document.getElementById("codeEditorText"),
    queryForm: document.getElementById("queryForm"),
    sqlEditor: document.getElementById("sqlEditor"),
    plotForm: document.getElementById("plotForm"),
    joinForm: document.getElementById("joinForm")
  };
  for (let key in panels) { panels[key].style.display = "none"; }
  
  switch (box.dataset.type) {
    case "influx":
      panels.codeEditorText.style.display = "block";
      panels.codeEditorText.value = state.code || "Run to show available tables";
      break;
    case "table":
      panels.queryForm.style.display = "block";
      // updateDropdownMenu("tableDropdownMenu", "tableQueryButton", "dropdown-search", "table-option", measurementsData);
      updateTableMenu();
      document.getElementById("startTime").value = state.start_time || "2024-07-25T16:47:00Z";
      document.getElementById("endTime").value = state.end_time || "2024-07-25T16:47:10Z";
      break;
    case "sql":
      panels.sqlEditor.style.display = "block";
      updateTransformDropdowns(boxState[selectedBox.id].parent);
      if (!state.sqlMode) { state.sqlMode = "basic"; }
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
      break;
    case "plot":
      panels.plotForm.style.display = "block";
      updatePlotDropdowns(boxState[selectedBox.id].parent);
      let parentState = boxState[state.parent];
      state.yFields = state.yFields || [];
      document.getElementById("tableContainer").innerHTML = "";
      if (state.chartConfig) { renderChart(state.chartConfig); }
      break;
    case "join":
      panels.joinForm.style.display = "block";
      updateJoinDropdowns(selectedBox.id);
      document.getElementById("joinTypeDisplay").textContent = state.joinType || "Inner";
      break;
    default:
      console.warn("Unknown box type:", box.dataset.type);
  }
  
  if (box.dataset.type !== "plot") {
    document.getElementById("tableContainer").innerHTML = state.result || "";
  }
  document.getElementById("tableHeader").textContent =
    state.header || ("Results: " + box.querySelector(".box-title").textContent);
}

// -------------------------------------------------------------------
// Additional WHERE Row Function
// -------------------------------------------------------------------

function addWhereRow(operatorLabel, e) {
  if (e) e.preventDefault();
  const currentCount = transWhereState[selectedBox.id] || 0;
  const newCount = currentCount + 1;
  transWhereState[selectedBox.id] = newCount;
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

  // Attach event listeners
  groupDiv.querySelectorAll(".whereValue, .where-button, .operator-button, .where-operator-label").forEach(el => {
    el.addEventListener("change", updateSQLFromBasic);
    el.addEventListener("input", updateSQLFromBasic);
    el.addEventListener("click", updateSQLFromBasic);
  });

  container.appendChild(groupDiv);

  // Selecting elements with IDs correctly using #
  const extraWhereButton = groupDiv.querySelector(`#whereButton_${index}`);
  extraWhereButton.addEventListener("click", function (e) {
    e.stopPropagation();
    const dropdown = groupDiv.querySelector(`#whereDropdownMenu_${index}`);
    dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
  });

  // Close dropdown when clicking elsewhere
  document.addEventListener("click", function () {
    document.getElementById(`whereDropdownMenu_${newIndex}`).style.display = "none";
  });

  // Define operatorBtn before using it
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

  // Additional where dropdown search
  let additWhereMenu = document.getElementById(`whereDropdownMenu_${index}`);
  addDropdownSearch(additWhereMenu, "dropdown-search", ".where-option");

  // Add a "Clear" option
  addClearOption(additWhereMenu, ".where-option", `whereButton_${index}`);

  // Populate WHERE dropdown with columns
  let cols = getParentColumns(selectedBox.id);
  populateDropdown(additWhereMenu, cols, "where-option", `whereButton_${index}`);

  // Update SQL
  updateSQLFromBasic();
}

// -------------------------------------------------------------------
// Additional Y Values Row Function
// -------------------------------------------------------------------

function addYRow(e) {
  if (e) e.preventDefault();
  
  plotYState[selectedBox.id] = (plotYState[selectedBox.id] || 1) + 1;
  const yContainer = document.getElementById("ySelectContainer");
  const yValuesWrapper = yContainer.querySelector(".y-values-wrapper"); // Find the wrapper where the Y groups go
  let newIndex = document.querySelectorAll("#ySelectContainer .y-select-group").length + 1;

  // Create new Y-value group
  const groupDiv = document.createElement("div");
  groupDiv.className = "form-group y-select-group"; // inline-block
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

  // Insert new group into the y-values-wrapper
  yValuesWrapper.appendChild(groupDiv); // This inserts inside the wrapper, not ySelectContainer
  
  updatePlotDropdowns(selectedBox.id);

  // Selecting elements
  const extraYButton = groupDiv.querySelector(`#ySelectButton_${newIndex}`);
  extraYButton.addEventListener("click", function (e) {
    e.stopPropagation();
    const menu = groupDiv.querySelector(`#ySelectDropdownMenu_${newIndex}`);
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  });

  // Close dropdown when clicking elsewhere
  document.addEventListener("click", function () {
    document.getElementById(`ySelectDropdownMenu_${newIndex}`).style.display = "none";
  });

  groupDiv.querySelector(".remove-y-btn").addEventListener("click", function(e) {
    e.preventDefault();
    yValuesWrapper.removeChild(groupDiv); // Remove from y-values-wrapper
  });

  // Additional where dropdown search
  let menu = document.getElementById(`ySelectDropdownMenu_${newIndex}`);
  addDropdownSearch(menu, "dropdown-search", ".where-option");

  // Add a "Clear" option
  addClearOption(menu, ".plot-option", `ySelectButton_${newIndex}`);

  // Populate WHERE dropdown with columns
  let cols = getParentColumns(selectedBox.id);
  populateDropdown(menu, cols, "plot-option", `ySelectButton_${newIndex}`);
};

// ============================================================
// runQuery Function
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
        // updateDropdownMenu("tableDropdownMenu", "tableQueryButton", "dropdown-search", "table-option", measurementsData);
        updateTableMenu();
        let resultArray = measurementsData.map(m => ({ "InfluxDB Tables": m }));
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
      // Adjust operator mapping to accept both words and symbol values
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
      let parentState = boxState[state.parent];
      if (!parentState || !parentState.data) {
        setTimeout(() => { runQueryForBox(selectedBox); }, 1500);
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
        setTimeout(() => { runQueryForBox(selectedBox); }, 1500);
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
    let parentState = boxState[state.parent];
    if (!parentState || !parentState.data) {
      setTimeout(() => { runQueryForBox(selectedBox); }, 1500);
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
    let joinType = document.getElementById("joinTypeDisplay").textContent || "Inner";
    let leftVal = document.getElementById("leftJoinColumnButton").dataset.selected || "";
    let rightVal = document.getElementById("rightJoinColumnButton").dataset.selected || "";
    state.joinType = joinType;
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
      const state = boxState[selectedBox.id];
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

  // Add Import Basic button to advanced tab.
  let importBtn = document.getElementById("importBasicBtn");
  document.getElementById("sqlAdvancedEditor").appendChild(importBtn);
  importBtn.addEventListener("click", function() {
    let state = boxState[selectedBox.id];
    state.advancedSQL = state.basicSQL || "SELECT * FROM df";
    sqlEditorCM.setValue(state.advancedSQL);
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

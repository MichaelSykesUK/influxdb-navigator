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
// Utility Functions for Dropdowns and WHERE Rows
// ============================================================
function updateTableDropdown() {
  const menu = document.getElementById("tableDropdownMenu");
  menu.innerHTML = "";
  measurementsData.forEach(m => {
    let optionDiv = document.createElement("div");
    optionDiv.className = "table-option";
    optionDiv.textContent = m;
    optionDiv.addEventListener("click", () => {
      document.getElementById("tableQueryDisplay").textContent = m;
      menu.style.display = "none";
    });
    menu.appendChild(optionDiv);
  });
}

function updateTransformDropdowns(parentId) {
  let parentState = boxState[parentId];
  if (parentState && parentState.data && parentState.data.length > 0) {
    let cols = Object.keys(parentState.data[0]);
    // Populate SELECT dropdown.
    let selectMenu = document.getElementById("selectDropdownMenu");
    selectMenu.innerHTML = "";
    cols.forEach(col => {
      let opt = document.createElement("div");
      opt.className = "select-option";
      opt.textContent = col;
      opt.dataset.value = col;
      opt.addEventListener("click", function () {
        let btn = document.getElementById("selectButton");
        let current = btn.dataset.selected ? btn.dataset.selected.split(",") : [];
        if (current.includes(col)) {
          current = current.filter(v => v !== col);
        } else {
          current.push(col);
        }
        btn.dataset.selected = current.join(",");
        btn.querySelector("span").textContent = current.length ? current.join(", ") : "*";
      });
      selectMenu.appendChild(opt);
    });
    // Populate WHERE dropdown.
    let whereMenu = document.getElementById("whereDropdownMenu");
    whereMenu.innerHTML = "";
    cols.forEach(col => {
      let opt = document.createElement("div");
      opt.className = "where-option";
      opt.textContent = col;
      opt.dataset.value = col;
      opt.addEventListener("click", function () {
        let btn = document.getElementById("whereButton");
        let current = btn.dataset.selected ? btn.dataset.selected.split(",") : [];
        if (current.includes(col)) {
          current = current.filter(v => v !== col);
        } else {
          current.push(col);
        }
        btn.dataset.selected = current.join(",");
        btn.querySelector("span").textContent = current.length ? current.join(", ") : "*";
      });
      whereMenu.appendChild(opt);
    });
  }
}

function updatePlotDropdowns(plotBoxId) {
  let plotBoxState = boxState[plotBoxId];
  if (!plotBoxState) return;
  
  let parentState = boxState[plotBoxState.parent];
  if (parentState && parentState.data && parentState.data.length > 0) {
    let cols = Object.keys(parentState.data[0]);
    
    // Populate X dropdown menu.
    let xSelectMenu = document.getElementById("xSelectDropdownMenu");
    xSelectMenu.innerHTML = "";
    cols.forEach(col => {
      let opt = document.createElement("div");
      opt.className = "plot-option";
      opt.textContent = col;
      opt.dataset.value = col;
      opt.addEventListener("click", function () {
        let btn = document.getElementById("xSelectButton");
        let current = btn.dataset.selected ? btn.dataset.selected.split(",") : [];
        if (current.includes(col)) {
          current = current.filter(v => v !== col);
        } else {
          current.push(col);
        }
        btn.dataset.selected = current.join(",");
        btn.querySelector("span").textContent = current.length ? current.join(", ") : "*";
      });
      xSelectMenu.appendChild(opt);
    });
    
    // Populate Y dropdown menus.
    let yCount = plotYState[plotBoxId] || 1;
    for (let index = 1; index <= yCount; index++) {
      let ySelectMenu = document.getElementById(`ySelectDropdownMenu_${index}`);
      if (ySelectMenu) {
        ySelectMenu.innerHTML = "";
        cols.forEach(col => {
          let opt = document.createElement("div");
          opt.className = "plot-option";
          opt.textContent = col;
          opt.dataset.value = col;
          opt.addEventListener("click", function () {
            let btn = document.getElementById(`ySelectButton_${index}`);
            let current = btn.dataset.selected ? btn.dataset.selected.split(",") : [];
            if (current.includes(col)) {
              current = current.filter(v => v !== col);
            } else {
              current.push(col);
            }
            btn.dataset.selected = current.join(",");
            btn.querySelector("span").textContent = current.length ? current.join(", ") : "*";
          });
          ySelectMenu.appendChild(opt);
        });
      }
    }
  }
}

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
      <div id="whereDropdownMenu_${index}" class="where-dropdown-menu" style="display:none;">
      </div>
    </div>
    <div class="custom-dropdown operator-dropdown">
      <button id="operatorButton_${index}" class="operator-button" aria-haspopup="true" aria-expanded="false">
        <span id="operatorDisplay_${index}">=</span>
      </button>
      <div class="operator-dropdown-menu" style="display:none;">
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
      <input type="text" class="whereValue" id="whereValue_${index}" placeholder='e.g. "BAT1"'>
    </div>
    <button class="removeWhereBtn" title="Remove condition">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#ffffff" viewBox="0 0 24 24">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    </button>
  `;
  container.appendChild(groupDiv);
  
  const operatorBtn = groupDiv.querySelector(".operator-button");
  operatorBtn.addEventListener("click", function(e) {
    e.stopPropagation();
    const dropdownMenu = groupDiv.querySelector(".operator-dropdown-menu");
    const isExpanded = operatorBtn.getAttribute("aria-expanded") === "true";
    if (isExpanded) {
      dropdownMenu.style.display = "none";
      operatorBtn.setAttribute("aria-expanded", "false");
    } else {
      dropdownMenu.style.display = "block";
      operatorBtn.setAttribute("aria-expanded", "true");
    }
  });
  
  groupDiv.querySelectorAll(".operator-option").forEach(function(option) {
    option.addEventListener("click", function() {
      const text = option.querySelector(".operator-name").textContent;
      groupDiv.querySelector(`#operatorDisplay_${index}`).textContent = text;
      const dropdownMenu = groupDiv.querySelector(".operator-dropdown-menu");
      dropdownMenu.style.display = "none";
      operatorBtn.setAttribute("aria-expanded", "false");
    });
  });
  
  groupDiv.querySelector(".removeWhereBtn").addEventListener("click", function(e) {
    e.preventDefault();
    container.removeChild(groupDiv);
  });
}

// ============================================================
// Box Management Functions
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
      boxState[box.id].parent = parentId;
      buttonsHTML = `<button class="transform-btn" title="Create SQL Transform" style="position:absolute; top:5px; right:5px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#ffffff" viewBox="0 0 24 24">
            <rect x="4" y="6" width="16" height="2"/>
            <rect x="4" y="11" width="16" height="2"/>
            <rect x="4" y="16" width="16" height="2"/>
          </svg>
        </button>
        <button class="plot-btn" title="Create Plot" style="position:absolute; bottom:5px; right:5px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#ffffff" viewBox="0 0 24 24">
            <line x1="4" y1="20" x2="20" y2="20" stroke="#ffffff" stroke-width="2"/>
            <line x1="4" y1="20" x2="4" y2="4" stroke="#ffffff" stroke-width="2"/>
            <polyline points="6,20 8,12 12,16 16,8 20,8" fill="none" stroke="#ffffff" stroke-width="1.5"/>
          </svg>
        </button>
        <button class="minus-btn" title="Delete Box" style="position:absolute; bottom:5px; left:5px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#ffffff" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>`;
      break;
    case "sql":
      boxTitle = "Transform " + sqlTransformCounter;
      sqlTransformCounter++;
      boxState[box.id].sql = "SELECT * FROM df";
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
  
  // Position the box.
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
      updateTableDropdown();
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
    document.getElementById("tableContainer").innerHTML = (boxState[box.id].result) || "";
  }
  document.getElementById("tableHeader").textContent =
    (boxState[box.id].header) || ("Results: " + box.querySelector(".box-title").textContent);
  
  selectBox(box);
  return box;
}

function createJoinBox(title, leftSQLBox, rightSQLBox) {
  const joinState = {
    leftParent: leftSQLBox.id,
    rightParent: rightSQLBox.id,
    joinType: "Inner",
    leftJoinColumn: "",
    rightJoinColumn: "",
    title: title
  };
  return createBox(title, "join", null, joinState);
}

function deleteBox(box) {
  let nextSelectedId = null;
  if (selectedBox === box && boxState[box.id] && boxState[box.id].parent) {
    nextSelectedId = boxState[box.id].parent;
  }
  let toDelete = [box];
  let found = true;
  while (found) {
    found = false;
    connectors.forEach(conn => {
      if (toDelete.includes(conn.box1) && !toDelete.includes(conn.box2)) {
        toDelete.push(conn.box2);
        found = true;
      }
    });
  }
  connectors = connectors.filter(conn => {
    if (toDelete.includes(conn.box1) || toDelete.includes(conn.box2)) {
      conn.line.remove();
      return false;
    }
    return true;
  });
  toDelete.forEach(b => {
    let idx = boxes.indexOf(b);
    if (idx > -1) boxes.splice(idx, 1);
    if (boxState[b.id]) delete boxState[b.id];
    b.remove();
  });
  updateConnectors();
  if (toDelete.includes(selectedBox)) {
    let parentEl = nextSelectedId ? document.getElementById(nextSelectedId) : (boxes.length > 0 ? boxes[0] : null);
    if (parentEl) {
      selectBox(parentEl);
    } else {
      selectedBox = null;
      document.getElementById("navigatorHeader").textContent = "Navigator:";
      document.getElementById("tableHeader").textContent = "Results:";
      document.getElementById("tableContainer").innerHTML = "";
    }
  }
}

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
      updateTableDropdown();
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
      } else {
        document.getElementById("sqlBasicEditor").style.display = "none";
        document.getElementById("sqlAdvancedEditor").style.display = "block";
        document.getElementById("toggleAdvanced").textContent = "Basic";
      }
      if (state.sqlMode === "advanced" && state.sql) { sqlEditorCM.setValue(state.sql); }
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
      document.getElementById("leftJoinColumn").value = state.leftJoinColumn || "";
      document.getElementById("rightJoinColumn").value = state.rightJoinColumn || "";
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

// ============================================================
// Query Handling Functions
// ============================================================
function runQuery() {
  if (!selectedBox) { alert("Select a box first."); return; }
  setRunButtonLoading(true);
  const state = boxState[selectedBox.id];
  
  if (selectedBox.dataset.type === "influx") {
    fetch("http://127.0.0.1:8000/measurements")
      .then(response => response.json())
      .then(data => {
        measurementsData = data.measurements || [];
        updateTableDropdown();
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
      let whereClause = "";
      let baseColumn = document.getElementById("whereDisplay").textContent.trim();
      let opText = document.getElementById("operatorDisplay").textContent;
      const opMap = { "Equal": "=", "Less Than": "<", "Greater Than": ">" };
      let baseOperator = opMap[opText] || "=";
      let baseValue = document.getElementById("whereValue").value.trim();
      if (baseColumn && baseColumn !== "Select columns" && baseValue) {
        whereClause = baseColumn + " " + baseOperator + " " + baseValue;
      }
      document.querySelectorAll("#additionalWhereContainer .where-condition").forEach(cond => {
        let col = cond.querySelector(".where-button span").textContent.trim();
        let opTxt = cond.querySelector(".operator-button").textContent.trim();
        let opSym = opMap[opTxt] || "=";
        let val = cond.querySelector(".whereValue").value.trim();
        let operatorLabelElem = cond.querySelector(".where-operator-label");
        let opLabel = (operatorLabelElem && operatorLabelElem.textContent.trim()) || "AND";
        if (col && col !== "Select columns" && val) {
          if (whereClause !== "") { whereClause += " " + opLabel + " "; }
          whereClause += col + " " + opSym + " " + val;
        }
      });
      let sql;
      if (selectClause && selectClause !== "Select columns") {
        sql = "SELECT " + selectClause + " FROM df";
      } else {
        sql = "SELECT * FROM df";
      }
      if (whereClause) { sql += " WHERE " + whereClause; }
      state.sql = sql;
    } else {
      state.sql = sqlEditorCM.getValue();
    }
    let parentState = boxState[state.parent];
    if (!parentState || !parentState.data) {
      setTimeout(() => { runQueryForBox(selectedBox); }, 1500);
      return;
    }
    let payload = { sql: state.sql, data: parentState.data };
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
  } else if (selectedBox.dataset.type === "plot") {
    let xButton = document.getElementById("xSelectButton");
    let xField = xButton.dataset.selected || xButton.querySelector("span").textContent.trim();
    let yFields = [];
    let yButtons = document.querySelectorAll("#ySelectContainer .custom-dropdown button");
    yButtons.forEach(btn => {
      let val = btn.dataset.selected || btn.querySelector("span").textContent.trim();
      if(val && val !== "Select a column") { yFields.push(val); }
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
    let leftJoinColumn = document.getElementById("leftJoinColumn").value;
    let rightJoinColumn = document.getElementById("rightJoinColumn").value;
    state.joinType = joinType;
    state.leftJoinColumn = leftJoinColumn;
    state.rightJoinColumn = rightJoinColumn;
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
      left_join_column: leftJoinColumn,
      right_join_column: rightJoinColumn,
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

function runQueryForBox(box) {
  selectBox(box);
  runQuery();
}

function displayTable(dataArray) {
  const container = document.getElementById("tableContainer");
  if (!dataArray || dataArray.length === 0) {
    container.innerHTML = "";
    updateTableHeader(dataArray, "");
    return;
  }
  let columns = dataArray._columns || Object.keys(dataArray[0]);
  let totalCells = dataArray.length * columns.length;
  let maxRows = dataArray.length;
  if (totalCells > 100000) {
    if (100 * columns.length <= 100000) { maxRows = 100; }
    else if (50 * columns.length <= 100000) { maxRows = 50; }
    else if (10 * columns.length <= 100000) { maxRows = 10; }
    else { maxRows = 0; }
  }
  let displayData = dataArray.slice(0, maxRows);
  let note = (maxRows < dataArray.length) ? "Showing first " + maxRows + " rows" : "";
  let table = `<table style="font-size:12px; width:100%; border-collapse:collapse;"><thead><tr>`;
  columns.forEach(key => { table += `<th style="border:1px solid #ddd; padding:4px; white-space: nowrap;">${key}</th>`; });
  table += `</tr></thead><tbody>`;
  displayData.forEach(row => {
    table += `<tr>`;
    columns.forEach(key => { table += `<td style="border:1px solid #ddd; padding:4px; white-space: nowrap;">${row[key]}</td>`; });
    table += `</tr>`;
  });
  table += `</tbody></table>`;
  if (note) {
    table += `<div style="font-style: italic; padding-top:5px;">${note}</div>`;
  }
  container.innerHTML = table;
  updateTableHeader(dataArray, note);
}

function updateTableHeader(dataArray, note = "") {
  const header = document.getElementById("tableHeader");
  const currentBox = document.querySelector(".box.selected");
  if (!currentBox) {
    header.textContent = "Results: No selection";
    return;
  }
  const boxTitle = currentBox.querySelector(".box-title").textContent;
  header.textContent = dataArray && dataArray.length > 0 ?
    `Results: ${boxTitle} (${dataArray.length} Rows x ${Object.keys(dataArray[0]).length} Columns) ${note}` :
    `Results: ${boxTitle}`;
  boxState[currentBox.id].header = header.textContent;
}

// ============================================================
// Configuration Functions
// ============================================================
function saveConfig() {
  const config = {
    boxes: boxes.map(box => {
      const state = boxState[box.id] || {};
      let runArgs = {};
      if (box.dataset.type === "influx") {
        runArgs = { code: state.code || "" };
      } else if (box.dataset.type === "table") {
        runArgs = { table: state.table || "", start_time: state.start_time || "", end_time: state.end_time || "", parent: state.parent || null };
      } else if (box.dataset.type === "sql") {
        runArgs = { sql: state.sql || "", parent: state.parent || null, sqlMode: state.sqlMode || "basic" };
      } else if (box.dataset.type === "plot") {
        runArgs = { xField: state.xField || "", yFields: state.yFields || [], parent: state.parent || null };
      } else if (box.dataset.type === "join") {
        runArgs = { joinType: state.joinType || "", leftJoinColumn: state.leftJoinColumn || "", rightJoinColumn: state.rightJoinColumn || "", leftParent: state.leftParent || null, rightParent: state.rightParent || null };
      }
      return { id: box.id, type: box.dataset.type, title: box.querySelector(".box-title").innerText, runArgs: runArgs, left: box.style.left, top: box.style.top };
    }),
    counters: { tableQueryCounter, sqlTransformCounter, plotCounter, joinCounter, boxIdCounter }
  };
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "config.json";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function loadConfig(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const config = JSON.parse(e.target.result);
      boxes.forEach(box => box.remove());
      boxes = [];
      connectors.forEach(conn => conn.line.remove());
      connectors = [];
      boxState = {};
      tableQueryCounter = config.counters.tableQueryCounter;
      sqlTransformCounter = config.counters.sqlTransformCounter;
      plotCounter = config.counters.plotCounter;
      joinCounter = config.counters.joinCounter;
      boxIdCounter = config.counters.boxIdCounter;
      
      const typeOrder = { influx: 1, table: 2, sql: 3, join: 4, plot: 5 };
      const sortedConfigs = config.boxes.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
      let loadedBoxes = {};
      
      sortedConfigs.forEach(boxConf => {
         let parentId = (boxConf.runArgs && boxConf.runArgs.parent) || null;
         let newBox = createBox(boxConf.title, boxConf.type, parentId,
           Object.assign({}, boxConf.runArgs, { left: boxConf.left, top: boxConf.top, title: boxConf.title, id: boxConf.id }));
         loadedBoxes[newBox.id] = newBox;
         if (parentId && loadedBoxes[parentId] && boxConf.type !== "join") {
           connectBoxes(loadedBoxes[parentId], newBox);
         }
         if (boxConf.type === "join") {
           if (boxConf.runArgs.leftParent && loadedBoxes[boxConf.runArgs.leftParent]) {
             connectBoxes(loadedBoxes[boxConf.runArgs.leftParent], newBox, "#008000");
           }
           if (boxConf.runArgs.rightParent && loadedBoxes[boxConf.runArgs.rightParent]) {
             connectBoxes(loadedBoxes[boxConf.runArgs.rightParent], newBox, "#008000");
           }
         }
      });
      updateConnectors();
      
    } catch (err) {
      console.error("Error loading config:", err);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

// ============================================================
// Initialization
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  // Create the InfluxDB box (it should appear on initialization) and run its query.
  createBox("InfluxDB", "influx");
  runQuery();

  // Header button event listeners.
  document.getElementById("runButton").addEventListener("click", runQuery);
  document.getElementById("exportBtn").addEventListener("click", exportCSV);
  document.getElementById("maximizeBtn").addEventListener("click", toggleMaximize);
  document.getElementById("saveConfigBtn").addEventListener("click", saveConfig);
  document.getElementById("loadConfigBtn").addEventListener("click", () => {
    document.getElementById("loadConfigInput").click();
  });
  document.getElementById("loadConfigInput").addEventListener("change", loadConfig);

  // Window resize events (these use functions in utils.js).
  document.getElementById("horizontalDivider").addEventListener("mousedown", startResizeHorizontal);
  document.getElementById("verticalDivider").addEventListener("mousedown", startResizeVertical);
  window.addEventListener("resize", updateConnectors);

  // Table query dropdown with search filtering.
  document.addEventListener("click", function(e) {
    const tqButton = document.getElementById("tableQueryButton");
    const tqMenu = document.getElementById("tableDropdownMenu");
    if (tqButton && (e.target === tqButton || tqButton.contains(e.target))) {
      tqMenu.style.display = tqMenu.style.display === "block" ? "none" : "block";
      if (tqMenu.style.display === "block" && !tqMenu.querySelector(".dropdown-search")) {
        let searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.className = "dropdown-search";
        searchInput.placeholder = "Search...";
        tqMenu.insertBefore(searchInput, tqMenu.firstChild);
        searchInput.addEventListener("keyup", function() {
          let filter = searchInput.value.toLowerCase();
          tqMenu.querySelectorAll(".table-option").forEach(option => {
            option.style.display = option.textContent.toLowerCase().indexOf(filter) > -1 ? "" : "none";
          });
        });
      }
    } else {
      if (!e.target.closest(".table-dropdown")) tqMenu.style.display = "none";
    }
  });

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
    });
  });

  // Join dropdown logic.
  document.addEventListener("click", function(e) {
    const joinBtn = document.getElementById("joinTypeButton");
    const joinMenu = document.querySelector(".join-dropdown-menu");
    if (joinBtn && (e.target === joinBtn || joinBtn.contains(e.target))) {
      joinMenu.style.display = joinMenu.style.display === "block" ? "none" : "block";
    } else {
      if (!e.target.closest(".join-dropdown")) joinMenu.style.display = "none";
    }
  });
  document.querySelectorAll(".join-dropdown-menu .join-option").forEach(option => {
    option.addEventListener("click", function() {
      const text = option.querySelector(".join-name").textContent;
      document.getElementById("joinTypeDisplay").textContent = text;
      document.querySelector(".join-dropdown-menu").style.display = "none";
    });
  });

  // Transform Box editor dropdown toggles.
  document.getElementById("selectButton").addEventListener("click", function(e) {
    e.stopPropagation();
    const menu = document.getElementById("selectDropdownMenu");
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  });
  document.getElementById("whereButton").addEventListener("click", function(e) {
    e.stopPropagation();
    const menu = document.getElementById("whereDropdownMenu");
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  });
  
  let condCount = 5;
  for (let index = 0; index < condCount; index++) {
    const button = document.getElementById(`additionalWhereButton_${index}`);
    if (button) {
      button.addEventListener("click", function (e) {
        e.stopPropagation();
        const menu = document.getElementById(`whereDropdownMenu_${index}`);
        if (menu) {
          menu.style.display = menu.style.display === "block" ? "none" : "block";
        }
      });
    }
  }
  
  document.addEventListener("click", function() {
    document.getElementById("selectDropdownMenu").style.display = "none";
    document.getElementById("whereDropdownMenu").style.display = "none";
    for (let index = 0; index < condCount; index++) {
      let btn = document.getElementById(`additionalWhereButton_${index}`);
      if (btn) btn.style.display = "none";
    }
  });
  
  // Toggle advanced mode.
  document.getElementById("toggleAdvanced").addEventListener("click", function() {
    let state = boxState[selectedBox.id];
    if (state.sqlMode !== "advanced") {
      let selectClause = document.getElementById("selectDisplay").textContent;
      let whereClause = "";
      let mainWhere = document.getElementById("whereDisplay").textContent;
      let selValues = mainWhere ? mainWhere.split(",") : [];
      if (selValues.length > 0) { whereClause = selValues.join(", "); }
      document.querySelectorAll("#additionalWhereContainer .where-condition").forEach(cond => {
        let col = cond.querySelector(".where-button span").textContent.trim();
        let opTxt = cond.querySelector(".operator-button").textContent;
        let opSym = { "Equal": "=", "Less Than": "<", "Greater Than": ">" }[opTxt] || "=";
        let val = cond.querySelector(".whereValue").value.trim();
        let operatorLabelElem = cond.querySelector(".where-operator-label");
        let opLabel = (operatorLabelElem && operatorLabelElem.textContent.trim()) || "AND";
        if(col && val) {
          if (whereClause !== "") { whereClause += " " + opLabel + " "; }
          whereClause += col + " " + opSym + " " + val;
        }
      });
      let sql = "SELECT " + (selectClause || "*") + " FROM df";
      if(whereClause) { sql += " WHERE " + whereClause; }
      state.sql = sql;
      sqlEditorCM.setValue(sql);
      sqlEditorCM.focus();
      document.getElementById("sqlBasicEditor").style.display = "none";
      document.getElementById("sqlAdvancedEditor").style.display = "block";
      this.textContent = "Basic";
      state.sqlMode = "advanced";
      setTimeout(() => { sqlEditorCM.refresh(); }, 0);
    } else {
      document.getElementById("sqlBasicEditor").style.display = "block";
      document.getElementById("sqlAdvancedEditor").style.display = "none";
      this.textContent = "Advanced";
      state.sqlMode = "basic";
    }
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
  
  // Plot Box editor dropdown toggles.
  document.getElementById("xSelectButton").addEventListener("click", function(e) {
    e.stopPropagation();
    const menu = document.getElementById("xSelectDropdownMenu");
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  });
  document.getElementById("ySelectButton_1").addEventListener("click", function(e) {
    e.stopPropagation();
    const menu = document.getElementById("ySelectDropdownMenu_1");
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  });
  document.addEventListener("click", function() {
    document.getElementById("xSelectDropdownMenu").style.display = "none";
    document.getElementById("ySelectDropdownMenu_1").style.display = "none";
  });
  
  // Y values plus button.
  document.getElementById("addYBtn").addEventListener("click", function(e) {
    e.preventDefault();
    plotYState[selectedBox.id] = (plotYState[selectedBox.id] || 1) + 1;
    const yContainer = document.getElementById("ySelectContainer");
    let newIndex = document.querySelectorAll("#ySelectContainer .y-select-group").length + 1;
    const groupDiv = document.createElement("div");
    groupDiv.className = "form-group y-select-group";
    groupDiv.innerHTML = `<label for="ySelectDisplay_${newIndex}">Y Values:</label>
                          <div class="custom-dropdown plot-dropdown">
                            <button id="ySelectButton_${newIndex}" aria-haspopup="true" aria-expanded="false">
                              <span id="ySelectDisplay_${newIndex}">Select a column</span>
                            </button>
                            <div class="plot-dropdown-menu" id="ySelectDropdownMenu_${newIndex}">
                            </div>
                          </div>`;
    const addBtn = document.getElementById("addYBtn");
    yContainer.insertBefore(groupDiv, addBtn);
    let currentPlotState = boxState[selectedBox.id];
    let parentState = boxState[currentPlotState.parent];
    if (!parentState || !parentState.data || parentState.data.length === 0) {
      alert("Parent data not available for Y values.");
      return;
    }
    document.getElementById(`ySelectButton_${newIndex}`).addEventListener("click", function(e) {
      e.stopPropagation();
      const menu = document.getElementById(`ySelectDropdownMenu_${newIndex}`);
      menu.style.display = menu.style.display === "block" ? "none" : "block";
    });
    document.addEventListener("click", function() {
      document.getElementById(`ySelectDropdownMenu_${newIndex}`).style.display = "none";
    });
  });
  
  // Initialize CodeMirror for SQL autocomplete.
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
});

function enableInlineRename(box) {
  const titleDiv = box.querySelector(".box-title");
  const currentName = titleDiv.textContent;
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentName;
  input.style.fontSize = "12px";
  titleDiv.replaceWith(input);
  input.focus();
  input.select();
  input.addEventListener("blur", () => finishRename(box, input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
}

function finishRename(box, newName) {
  const newTitle = document.createElement("div");
  newTitle.className = "box-title";
  newTitle.textContent = newName;
  box.querySelector("input").replaceWith(newTitle);
  if (box === selectedBox) document.getElementById("navigatorHeader").textContent = "Navigator: " + newName;
}

function makeDraggable(el) {
  let isDragging = false, offsetX = 0, offsetY = 0;
  el.addEventListener("mousedown", function(e) {
    if (e.target.classList.contains("plot-btn") || e.target.classList.contains("minus-btn") ||
        e.target.classList.contains("join-btn") || e.target.tagName === "INPUT") return;
    isDragging = true;
    offsetX = e.clientX - el.offsetLeft;
    offsetY = e.clientY - el.offsetTop;
    function onMouseMove(e) {
      if (!isDragging) return;
      el.style.left = (e.clientX - offsetX) + "px";
      el.style.top = (e.clientY - offsetY) + "px";
      updateConnectors();
    }
    function onMouseUp() {
      isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}

function connectBoxes(box1, box2, color = "#007acc") {
  const svg = document.getElementById("canvasSVG");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("stroke", color);
  line.setAttribute("stroke-width", "1.5");
  svg.appendChild(line);
  connectors.push({ line, box1, box2 });
  updateConnectors();
}

function updateConnectors() {
  connectors.forEach(conn => {
    const rect1 = conn.box1.getBoundingClientRect();
    const rect2 = conn.box2.getBoundingClientRect();
    if (rect2.left >= rect1.left + rect1.width / 2) {
      conn.line.setAttribute("x1", rect1.right - 1);
      conn.line.setAttribute("y1", rect1.top + rect1.height / 2);
      conn.line.setAttribute("x2", rect2.left + 1);
      conn.line.setAttribute("y2", rect2.top + rect2.height / 2);
    } else {
      conn.line.setAttribute("x1", rect1.left + 1);
      conn.line.setAttribute("y1", rect1.top + rect1.height / 2);
      conn.line.setAttribute("x2", rect2.right - 1);
      conn.line.setAttribute("y2", rect2.top + rect2.height / 2);
    }
  });
}

function startResizeHorizontal(e) {
  e.preventDefault();
  let startY = e.clientY;
  const whiteboard = document.getElementById("whiteboard");
  const terminal = document.getElementById("terminal");
  const minWhiteboardHeight = 100;
  const minTerminalHeight = 100;
  function doDrag(e) {
    const dy = e.clientY - startY;
    let newWhiteboardHeight = whiteboard.offsetHeight + dy;
    let newTerminalHeight = terminal.offsetHeight - dy;
    if (newWhiteboardHeight < minWhiteboardHeight) {
      newWhiteboardHeight = minWhiteboardHeight;
      newTerminalHeight = whiteboard.offsetHeight + terminal.offsetHeight - minWhiteboardHeight;
    }
    if (newTerminalHeight < minTerminalHeight) {
      newTerminalHeight = minTerminalHeight;
      newWhiteboardHeight = whiteboard.offsetHeight + terminal.offsetHeight - minTerminalHeight;
    }
    whiteboard.style.height = newWhiteboardHeight + "px";
    terminal.style.height = newTerminalHeight + "px";
    startY = e.clientY;
  }
  function stopDrag() {
    document.removeEventListener("mousemove", doDrag);
    document.removeEventListener("mouseup", stopDrag);
  }
  document.addEventListener("mousemove", doDrag);
  document.addEventListener("mouseup", stopDrag);
}

function startResizeVertical(e) {
  e.preventDefault();
  let startX = e.clientX;
  const terminal = document.getElementById("terminal");
  const leftTerminal = document.getElementById("leftTerminal");
  const rightTerminal = document.getElementById("rightTerminal");
  const totalWidth = terminal.offsetWidth;
  function doDrag(e) {
    const dx = e.clientX - startX;
    leftTerminal.style.width = (leftTerminal.offsetWidth + dx) + "px";
    rightTerminal.style.width = (totalWidth - leftTerminal.offsetWidth - 5) + "px";
    document.getElementById("verticalDivider").style.left = leftTerminal.offsetWidth + "px";
    startX = e.clientX;
  }
  function stopDrag() {
    document.removeEventListener("mousemove", doDrag);
    document.removeEventListener("mouseup", stopDrag);
  }
  document.addEventListener("mousemove", doDrag);
  document.addEventListener("mouseup", stopDrag);
}

function setRunButtonLoading(isLoading) {
  const runButton = document.getElementById("runButton");
  runButton.disabled = isLoading;
  runButton.innerHTML = isLoading ? '<div class="spinner"></div>' :
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#007acc" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z"/>
    </svg>`;
}

function exportCSV() {
  if (!selectedBox) { alert("No box selected."); return; }
  const state = boxState[selectedBox.id];
  if (!state.data || state.data.length === 0) { alert("No data to export."); return; }
  const columns = state.data._columns || Object.keys(state.data[0]);
  let csv = [columns.map(key => `"${key.replace(/"/g, '""')}"`).join(",")];
  state.data.forEach(row => { csv.push(columns.map(key => `"${String(row[key]).replace(/"/g, '""')}"`).join(",")); });
  const blob = new Blob([csv.join("\n")], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "table_results.csv";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function renderChart(config) {
  const container = document.getElementById("tableContainer");
  container.innerHTML = '<canvas id="chartCanvas"></canvas>';
  const ctx = document.getElementById("chartCanvas").getContext("2d");
  if (currentChart) { currentChart.destroy(); }
  currentChart = new Chart(ctx, config);
}

function toggleMaximize() {
  const rt = document.getElementById("rightTerminal");
  const mtBtn = document.getElementById("maximizeBtn");
  const whiteboard = document.getElementById("whiteboard");
  if (!rt.classList.contains("maximized")) {
    rt.dataset.originalWidth = rt.style.width || window.getComputedStyle(rt).width;
    rt.classList.add("maximized");
    rt.style.position = "fixed";
    rt.style.top = "0";
    rt.style.left = "0";
    rt.style.width = "100%";
    rt.style.height = "100%";
    rt.style.zIndex = "10000";
    mtBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#007acc" viewBox="0 0 24 24">
      <path d="M3 3h24v24H3V3z" fill="none"/>
      <path d="M19 13H5v-2h14v2z"/>
    </svg>`;
    mtBtn.title = "Minimize";
    whiteboard.style.display = "none";
  } else {
    rt.classList.remove("maximized");
    rt.style.position = "";
    rt.style.top = "";
    rt.style.left = "";
    rt.style.width = rt.dataset.originalWidth || "50%";
    rt.style.height = "";
    rt.style.zIndex = "";
    mtBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#007acc" viewBox="0 0 24 24">
      <path d="M3 3h18v18H3V3zm2 2v14h14V5H5z"/>
    </svg>`;
    mtBtn.title = "Maximize";
    delete rt.dataset.originalWidth;
    whiteboard.style.display = "block";
  }
}

function getParentColumns(plotBoxId) {
  let plotBoxState = boxState[plotBoxId];
  if (!plotBoxState) return;
  let parentState = boxState[plotBoxState.parent];
  if (parentState && parentState.data && parentState.data.length > 0) {    
    return Object.keys(parentState.data[0]);
  }
  return [];
}

function addDropdownSearch(menu, searchInputClass, optionSelector) {
  menu.innerHTML = "";
  if (!menu.querySelector(`.${searchInputClass}`)) {
    let searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = searchInputClass;
    searchInput.placeholder = "Search...";
    searchInput.addEventListener("click", e => e.stopPropagation());
    searchInput.addEventListener("keyup", function () {
      let filter = searchInput.value.toLowerCase();
      menu.querySelectorAll(optionSelector).forEach(opt => {
        opt.style.display = opt.textContent.toLowerCase().includes(filter) // toLowerCase().indexOf(filter) > -1 ? "" : "none";
          ? ""
          : "none";
      });
    });
    menu.insertBefore(searchInput, menu.firstChild);
  }
}

function populateDropdown(menu, options, optionClass, button) {
  options.forEach(option => {
    let opt = document.createElement("div");
    opt.className = optionClass;
    opt.textContent = option;
    opt.dataset.value = option;
    opt.addEventListener("click", function () {
      let btn = document.getElementById(button);
      btn.dataset.selected = option;
      btn.querySelector("span").textContent = option;
    });
    menu.appendChild(opt);
  });
}

function populateDropdownMulti(menu, options, optionClass, button) {
  options.forEach(option => {
    let opt = document.createElement("div");
    opt.className = optionClass;
    opt.textContent = option;
    opt.dataset.value = option;
    opt.addEventListener("click", function () {
      let btn = document.getElementById(button);
      let current = btn.dataset.selected ? btn.dataset.selected.split(",") : [];
      if (current.includes(option)) {
        current = current.filter(v => v !== option);
      } else {
        current.push(option);
      }
      btn.dataset.selected = current.join(",");
      btn.querySelector("span").textContent = current.length ? current.join(", ") : "Select columns";
    });
    menu.appendChild(opt);
  });
}

function addClearOption(menu, optionClass, button) {
  let clearOpt = document.createElement("div");
  clearOpt.className = optionClass;
  clearOpt.textContent = "Clear";
  clearOpt.dataset.value = "";
  clearOpt.addEventListener("click", function() {
    let btn = document.getElementById(button);
    btn.dataset.selected = "";
    btn.querySelector("span").textContent = "Select columns";
    menu.style.display = "none";
  });
  menu.appendChild(clearOpt);
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
        runArgs = { basicSQL: state.basicSQL || "", advancedSQL: state.advancedSQL || "", parent: state.parent || null, sqlMode: state.sqlMode || "basic" };
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

function setRunButtonLoading(isLoading) {
  const runButton = document.getElementById("runButton");
  runButton.disabled = isLoading;
  if (isLoading) {
    runButton.innerHTML = '<div class="spinner"></div>';
  } else {
    runButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#007acc" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z"/>
    </svg>`;
  }
}

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

function resetBasicSQL() {
  if (!selectedBox || selectedBox.dataset.type !== "sql") return;
  document.getElementById("selectDisplay").textContent = "Select columns";
  document.getElementById("selectButton").dataset.selected = "";
  document.getElementById("whereDisplay").textContent = "Select columns";
  document.getElementById("whereButton").dataset.selected = "";
  document.getElementById("operatorDisplay").textContent = "=";
  document.getElementById("whereValue").value = "";
  document.getElementById("additionalWhereContainer").innerHTML = "";
  updateSQLFromBasic();
}

function resetAdvancedSQL() {
  if (!selectedBox || selectedBox.dataset.type !== "sql") return;
  sqlEditorCM.setValue("SELECT * FROM df");
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
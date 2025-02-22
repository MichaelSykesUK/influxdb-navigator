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
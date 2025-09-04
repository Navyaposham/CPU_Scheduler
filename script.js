let processes = [];
let colors = {};

function addProcess() {
  const pid = document.getElementById("pid").value.trim();
  const burst = parseInt(document.getElementById("burst").value);
  const arrival = parseInt(document.getElementById("arrival").value);
  const priority = parseInt(document.getElementById("priority").value);

  if (!pid || isNaN(burst) || isNaN(arrival)) {
    alert("Please enter valid inputs!");
    return;
  }

  // ✅ Prevent duplicate process IDs
  if (processes.some(p => p.pid === pid)) {
    alert("Process ID already exists!");
    return;
  }

  processes.push({ pid, burst, arrival, priority });
  updateTable();
}

function updateTable() {
  const table = document.getElementById("processTable");
  table.innerHTML = `
    <tr>
      <th>PID</th>
      <th>Burst Time</th>
      <th>Arrival Time</th>
      <th>Priority</th>
    </tr>`;

  processes.forEach(p => {
    let row = `<tr>
      <td>${p.pid}</td>
      <td>${p.burst}</td>
      <td>${p.arrival}</td>
      <td>${p.priority ?? "-"}</td>
    </tr>`;
    table.innerHTML += row;
  });
}

function resetAll() {
  processes = [];
  document.getElementById("processTable").innerHTML = `
    <tr>
      <th>PID</th>
      <th>Burst Time</th>
      <th>Arrival Time</th>
      <th>Priority</th>
    </tr>`;
  document.getElementById("gantt").innerHTML = "";
  document.getElementById("timeMarkers").innerHTML = "";
}

function getColor(pid) {
  if (!colors[pid]) {
    const palette = ["#4ea8de", "#80ed99", "#c77dff", "#ffd166", "#ff6b6b"];
    colors[pid] = palette[Object.keys(colors).length % palette.length];
  }
  return colors[pid];
}

function drawGanttChart(schedule) {
  const gantt = document.getElementById("gantt");
  const markers = document.getElementById("timeMarkers");
  gantt.innerHTML = "";
  markers.innerHTML = "";

  schedule.forEach((slot, i) => {
    // Gantt block
    const block = document.createElement("div");
    block.className = "gantt-block";
    block.style.width = (slot.end - slot.start) * 50 + "px"; // scale
    block.style.backgroundColor = getColor(slot.name);
    block.innerText = slot.name;
    gantt.appendChild(block);

    // Start time marker
    const start = document.createElement("span");
    start.className = "time-marker";
    start.style.width = (slot.end - slot.start) * 50 + "px";
    start.innerText = slot.start;
    markers.appendChild(start);

    // Last end time marker
    if (i === schedule.length - 1) {
      const end = document.createElement("span");
      end.className = "time-marker end";
      end.innerText = slot.end;
      markers.appendChild(end);
    }
  });
}

/* ---------------- Algorithms ---------------- */

function runFCFS() {
  let time = 0;
  let schedule = [];
  processes
    .slice()
    .sort((a, b) => a.arrival - b.arrival)
    .forEach(p => {
      if (time < p.arrival) time = p.arrival;
      schedule.push({ name: p.pid, start: time, end: time + p.burst });
      time += p.burst;
    });
  drawGanttChart(schedule);
}

function runSJF(preemptive) {
  let time = 0, schedule = [], completed = 0;
  let ready = [];
  let procs = processes.map(p => ({ ...p, remaining: p.burst }));

  while (completed < procs.length) {
    procs.forEach(p => {
      if (p.arrival <= time && p.remaining > 0 && !ready.includes(p)) ready.push(p);
    });

    if (ready.length === 0) { time++; continue; }

    ready.sort((a, b) => a.remaining - b.remaining);
    let current = ready[0];

    if (preemptive) {
      schedule.push({ name: current.pid, start: time, end: time + 1 });
      current.remaining--;
      if (current.remaining === 0) { completed++; ready.shift(); }
      time++;
    } else {
      schedule.push({ name: current.pid, start: time, end: time + current.remaining });
      time += current.remaining;
      current.remaining = 0;
      completed++;
      ready.shift();
    }
  }

  // Merge consecutive same processes
  let merged = [];
  schedule.forEach(slot => {
    if (merged.length && merged[merged.length - 1].name === slot.name) {
      merged[merged.length - 1].end = slot.end;
    } else merged.push(slot);
  });

  drawGanttChart(merged);
}

function runRR() {
  let quantum = 2; // default
  let time = 0, queue = [], schedule = [];
  let procs = processes.map(p => ({ ...p, remaining: p.burst }));

  while (procs.some(p => p.remaining > 0)) {
    procs.forEach(p => { if (p.arrival <= time && !queue.includes(p) && p.remaining > 0) queue.push(p); });

    if (queue.length === 0) { time++; continue; }

    let current = queue.shift();
    let exec = Math.min(quantum, current.remaining);
    schedule.push({ name: current.pid, start: time, end: time + exec });
    current.remaining -= exec;
    time += exec;
    if (current.remaining > 0) queue.push(current);
  }

  drawGanttChart(schedule);
}

function runPriority() {
  let time = 0, schedule = [], completed = 0;
  let procs = processes.map(p => ({ ...p, remaining: p.burst }));

  while (completed < procs.length) {
    let ready = procs.filter(p => p.arrival <= time && p.remaining > 0);
    if (ready.length === 0) { time++; continue; }

    ready.sort((a, b) => a.priority - b.priority);
    let current = ready[0];
    schedule.push({ name: current.pid, start: time, end: time + current.remaining });
    time += current.remaining;
    current.remaining = 0;
    completed++;
  }

  drawGanttChart(schedule);
}

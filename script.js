/* =========================
   State
========================= */
let processes = []; // { name, arrival, burst, priority }
let colors = {};
let chartInstance = null;

// px per CPU time unit for the Gantt chart
const PX_PER_TU = 48;

/* =========================
   Helpers
========================= */

// Distinct color per process
function colorFor(id) {
  if (!colors[id]) {
    const hue = (Object.keys(colors).length * 137) % 360;
    colors[id] = `hsl(${hue}, 70%, 50%)`;
  }
  return colors[id];
}

// Render process table
function renderProcList() {
  const box = document.getElementById("procList");
  if (!processes.length) { box.innerHTML = "<p class='hint'>No processes yet.</p>"; return; }
  let html = `<table>
    <thead><tr><th>ID</th><th>Arrival</th><th>Burst</th><th>Priority</th></tr></thead><tbody>`;
  processes.forEach(p=>{
    html += `<tr><td>${p.name}</td><td>${p.arrival}</td><td>${p.burst}</td><td>${p.priority}</td></tr>`;
  });
  html += "</tbody></table>";
  box.innerHTML = html;
}

// Merge adjacent slots with the same name
function mergeAdjacent(schedule) {
  if (!schedule.length) return [];
  schedule.sort((a,b)=> a.start - b.start || a.end - b.end);
  const out = [ {...schedule[0]} ];
  for (let i=1;i<schedule.length;i++){
    const prev = out[out.length-1];
    const cur = schedule[i];
    if (prev.name === cur.name && prev.end === cur.start) {
      prev.end = cur.end;
    } else {
      out.push({...cur});
    }
  }
  return out;
}

// Insert IDLE gaps (including leading gap from 0)
function withIdle(schedule) {
  if (!schedule.length) return [];
  schedule.sort((a,b)=> a.start - b.start || a.end - b.end);
  const out = [];
  let cursor = 0;
  for (const s of schedule) {
    if (s.start > cursor) out.push({ name: "IDLE", start: cursor, end: s.start });
    out.push(s);
    cursor = s.end;
  }
  return out;
}

// Build unique time boundaries from schedule
function buildBoundaries(schedule) {
  const times = new Set();
  schedule.forEach(s => { times.add(s.start); times.add(s.end); });
  return Array.from(times).sort((a,b)=>a-b);
}

/* =========================
   Form & Controls
========================= */

// Add process (unique ID)
document.getElementById("procForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("pName").value.trim();
  const arrival = parseInt(document.getElementById("pArrival").value, 10);
  const burst = parseInt(document.getElementById("pBurst").value, 10);
  const priority = parseInt(document.getElementById("pPriority").value, 10);

  if (!name) { alert("Enter a Process ID"); return; }
  if (processes.some(p => p.name === name)) { alert("Process ID must be unique."); return; }
  if (isNaN(arrival) || arrival < 0) { alert("Arrival must be ≥ 0."); return; }
  if (isNaN(burst) || burst <= 0) { alert("Burst must be ≥ 1."); return; }

  processes.push({ name, arrival, burst, priority: isNaN(priority) ? 0 : priority });
  e.target.reset();
  renderProcList();
});

// Sample
document.getElementById("addSample").addEventListener("click", () => {
  processes = [
    { name: "A", arrival: 0, burst: 5, priority: 2 },
    { name: "B", arrival: 2, burst: 3, priority: 1 },
    { name: "C", arrival: 4, burst: 6, priority: 3 },
    { name: "D", arrival: 6, burst: 4, priority: 2 }
  ];
  colors = {};
  renderProcList();
});

// Clear only list
document.getElementById("clearAll").addEventListener("click", () => {
  processes = [];
  renderProcList();
});

// Reset everything
document.getElementById("resetBtn").addEventListener("click", () => {
  processes = [];
  colors = {};
  renderProcList();
  document.getElementById("gantt").innerHTML = "";
  document.getElementById("timeMarkers").innerHTML = "";
  document.getElementById("stats").innerHTML = "";
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
});

// Show/hide quantum row for RR
function updateQuantumRow() {
  const algo = document.getElementById("algorithm").value;
  document.getElementById("quantumRow").classList.toggle("hidden", algo !== "rr");
}
document.getElementById("algorithm").addEventListener("change", updateQuantumRow);
updateQuantumRow();

// Run
document.getElementById("runBtn").addEventListener("click", () => {
  if (!processes.length) { alert("Add at least one process."); return; }

  const algo = document.getElementById("algorithm").value;
  const quantum = parseInt(document.getElementById("quantum").value || "2", 10);

  let schedule = [];
  switch (algo) {
    case "fcfs":      schedule = fcfs(); break;
    case "sjf-np":    schedule = sjfNP(); break;
    case "srtf":      schedule = srtf(); break;
    case "rr":        schedule = rr(quantum); break;
    case "priority":  schedule = priorityNP(); break;
  }

  schedule = mergeAdjacent(schedule);
  schedule = withIdle(schedule);
  drawGantt(schedule);
  drawStats(schedule);
});

/* =========================
   Algorithms
========================= */

// FCFS
function fcfs() {
  const list = [...processes].sort((a,b)=> a.arrival - b.arrival);
  const schedule = [];
  let t = 0;
  for (const p of list) {
    if (t < p.arrival) t = p.arrival; // idle implicit; added later
    schedule.push({ name: p.name, start: t, end: t + p.burst });
    t += p.burst;
  }
  return schedule;
}

// SJF Non-preemptive
function sjfNP() {
  const n = processes.length;
  const done = new Set();
  const schedule = [];
  let t = 0;

  while (done.size < n) {
    const ready = processes.filter(p => !done.has(p.name) && p.arrival <= t);
    if (!ready.length) {
      // jump to next arrival; idle will be inserted later
      const next = Math.min(...processes.filter(p => !done.has(p.name)).map(p => p.arrival));
      t = next;
      continue;
    }
    ready.sort((a,b)=> a.burst - b.burst || a.arrival - b.arrival);
    const p = ready[0];
    schedule.push({ name: p.name, start: t, end: t + p.burst });
    t += p.burst;
    done.add(p.name);
  }
  return schedule;
}

// SRTF (preemptive SJF)
function srtf() {
  const procs = processes.map(p => ({...p, rem: p.burst, first: null}));
  const schedule = [];
  let t = 0;
  let current = null;

  const allDone = () => procs.every(p => p.rem === 0);

  while (!allDone()) {
    const ready = procs.filter(p => p.arrival <= t && p.rem > 0);
    if (!ready.length) {
      // jump to next arrival
      const next = Math.min(...procs.filter(p => p.rem>0).map(p => p.arrival));
      // mark idle segment
      schedule.push({ name: "IDLE", start: t, end: next });
      t = next;
      current = null;
      continue;
    }
    ready.sort((a,b)=> a.rem - b.rem || a.arrival - b.arrival);
    const p = ready[0];

    if (current?.name !== p.name) {
      // close previous if needed
      if (schedule.length && schedule[schedule.length-1].end === undefined) {
        schedule[schedule.length-1].end = t;
      }
      schedule.push({ name: p.name, start: t, end: undefined });
      current = p;
      if (p.first === null) p.first = t;
    }
    // run 1 TU
    p.rem -= 1;
    t += 1;
    if (p.rem === 0) {
      // close segment
      if (schedule.length && schedule[schedule.length-1].end === undefined) {
        schedule[schedule.length-1].end = t;
      }
      current = null;
    }
  }
  // close any open segment
  if (schedule.length && schedule[schedule.length-1].end === undefined) {
    schedule[schedule.length-1].end = t;
  }
  // merge & remove internal IDLE holes (we keep leading/explicit idle already present)
  return schedule.filter(s => s.end > s.start);
}

// Round Robin
function rr(q = 2) {
  const byArr = [...processes].sort((a,b)=> a.arrival - b.arrival);
  const procs = byArr.map(p => ({...p, rem: p.burst}));
  const schedule = [];
  const ready = [];
  let t = 0;
  let i = 0; // index into procs for arrivals

  while (i < procs.length || ready.length) {
    // bring in arrivals
    while (i < procs.length && procs[i].arrival <= t) ready.push(procs[i++]);

    if (!ready.length) {
      // idle until next arrival
      const next = procs[i].arrival;
      schedule.push({ name: "IDLE", start: t, end: next });
      t = next;
      while (i < procs.length && procs[i].arrival <= t) ready.push(procs[i++]);
      continue;
    }

    const p = ready.shift();
    const exec = Math.min(q, p.rem);
    schedule.push({ name: p.name, start: t, end: t + exec });
    t += exec;
    p.rem -= exec;

    // bring new arrivals during exec
    while (i < procs.length && procs[i].arrival <= t) ready.push(procs[i++]);
    if (p.rem > 0) ready.push(p);
  }
  return schedule;
}

// Priority Non-preemptive (lower number = higher priority)
function priorityNP() {
  const n = processes.length;
  const done = new Set();
  const schedule = [];
  let t = 0;

  while (done.size < n) {
    const ready = processes.filter(p => !done.has(p.name) && p.arrival <= t);
    if (!ready.length) {
      const next = Math.min(...processes.filter(p => !done.has(p.name)).map(p => p.arrival));
      t = next;
      continue;
    }
    ready.sort((a,b)=> a.priority - b.priority || a.arrival - b.arrival);
    const p = ready[0];
    schedule.push({ name: p.name, start: t, end: t + p.burst });
    t += p.burst;
    done.add(p.name);
  }
  return schedule;
}

/* =========================
   Gantt Rendering
========================= */
function drawGantt(schedule) {
  const gantt = document.getElementById("gantt");
  const markers = document.getElementById("timeMarkers");
  gantt.innerHTML = "";
  markers.innerHTML = "";

  // Ensure continuous timeline from 0
  let s = schedule.slice().sort((a,b)=> a.start - b.start);
  if (s[0]?.start > 0) {
    s.unshift({ name: "IDLE", start: 0, end: s[0].start });
  }
  s = mergeAdjacent(s);

  // Draw blocks
  s.forEach(slot => {
    const w = Math.max(1, (slot.end - slot.start) * PX_PER_TU);
    const block = document.createElement("div");
    block.className = "gantt-block" + (slot.name === "IDLE" ? " idle" : "");
    block.style.width = w + "px";
    block.style.background = slot.name === "IDLE" ? "" : colorFor(slot.name);
    block.textContent = slot.name;
    gantt.appendChild(block);
  });

  // Draw aligned time markers at each boundary
  const times = buildBoundaries(s);
  for (let i=0; i<times.length-1; i++) {
    const span = document.createElement("span");
    span.className = "time-marker";
    span.style.width = Math.max(1, (times[i+1] - times[i]) * PX_PER_TU) + "px";
    span.textContent = times[i];
    markers.appendChild(span);
  }
  // final end marker
  const last = document.createElement("span");
  last.className = "time-marker";
  last.style.width = "0px";
  last.textContent = times[times.length - 1];
  markers.appendChild(last);
}

/* =========================
   Stats + Chart
========================= */
function drawStats(schedule) {
  const statsDiv = document.getElementById("stats");

  // Build maps for first start (response) & last end (completion)
  const firstStart = {};
  const lastEnd = {};
  const totalBurst = {};
  processes.forEach(p => { totalBurst[p.name] = p.burst; });

  schedule.forEach(s => {
    if (s.name === "IDLE") return;
    if (!(s.name in firstStart)) firstStart[s.name] = s.start;
    lastEnd[s.name] = Math.max(lastEnd[s.name] ?? 0, s.end);
  });

  // Table
  let rows = "";
  let sumCT=0, sumTAT=0, sumWT=0, sumRT=0;
  const labels = [];
  const arrWT = [], arrTAT = [], arrRT = [];

  processes.forEach(p => {
    const ct = lastEnd[p.name] ?? 0;
    const tat = ct - p.arrival;
    const wt  = tat - p.burst;
    const rt  = (firstStart[p.name] ?? 0) - p.arrival;

    rows += `<tr>
      <td>${p.name}</td>
      <td>${p.arrival}</td>
      <td>${p.burst}</td>
      <td>${ct}</td>
      <td>${tat}</td>
      <td>${wt}</td>
      <td>${rt}</td>
      <td>✅</td>
    </tr>`;

    sumCT += ct; sumTAT += tat; sumWT += wt; sumRT += rt;
    labels.push(p.name);
    arrWT.push(wt); arrTAT.push(tat); arrRT.push(rt);
  });

  const n = processes.length || 1;
  const table = `
    <table>
      <thead>
        <tr>
          <th>ID</th><th>AT</th><th>BT</th>
          <th>CT</th><th>TAT</th><th>WT</th><th>RT</th><th>Indicator</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="avg">
      Avg CT: ${(sumCT/n).toFixed(2)} &nbsp;|&nbsp;
      Avg TAT: ${(sumTAT/n).toFixed(2)} &nbsp;|&nbsp;
      Avg WT: ${(sumWT/n).toFixed(2)} &nbsp;|&nbsp;
      Avg RT: ${(sumRT/n).toFixed(2)}
    </div>
  `;
  statsDiv.innerHTML = table;

  // Chart.js bars for TAT, WT, RT
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  const ctx = document.getElementById("chartCanvas").getContext("2d");
  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "TAT", data: arrTAT, backgroundColor: "rgba(59,130,246,0.75)" },
        { label: "WT",  data: arrWT,  backgroundColor: "rgba(239,68,68,0.75)" },
        { label: "RT",  data: arrRT,  backgroundColor: "rgba(34,197,94,0.75)" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, ticks: { precision:0 } } },
      plugins: { legend: { position: "top" } }
    }
  });
}

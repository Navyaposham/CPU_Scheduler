/* script.js - full implementation for 5 algorithms
   - Unique IDs enforced
   - FCFS, SJF (NP), SRTF, RRS (RR), Priority (NP)
   - Gantt chart with aligned timestamps
   - Stats: CT, TAT, WT, RT, indicator, Avg CT, Avg TAT
   - Chart.js graph for CT/TAT/WT/RT
*/

const procForm = document.getElementById('procForm');
const procListEl = document.getElementById('procList');
const algorithmEl = document.getElementById('algorithm');
const quantumRow = document.getElementById('quantumRow');
const quantumEl = document.getElementById('quantum');
const runBtn = document.getElementById('runBtn');
const resetBtn = document.getElementById('resetBtn');
const clearListBtn = document.getElementById('clearListBtn');

const ganttEl = document.getElementById('gantt');
const timeMarkersEl = document.getElementById('timeMarkers');
const statsEl = document.getElementById('stats');
const chartCanvas = document.getElementById('chartCanvas');

let processes = []; // { id, arrival, burst, priority }
let colorMap = {};
let chartInstance = null;
const PX_PER_UNIT = 48; // px per time unit (scale)

// Ensure quantum visibility
algorithmEl.addEventListener('change', () => {
  quantumRow.classList.toggle('hidden', algorithmEl.value !== 'rr');
});

// Add process
procForm.addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('pId').value.trim();
  const arrival = parseInt(document.getElementById('pArrival').value, 10);
  const burst = parseInt(document.getElementById('pBurst').value, 10);
  const priority = parseInt(document.getElementById('pPriority').value, 10);

  if (!id) { alert('Enter a process ID'); return; }
  if (processes.some(p => p.id.toLowerCase() === id.toLowerCase())) {
    alert('Duplicate process ID not allowed');
    return;
  }
  if (isNaN(arrival) || arrival < 0) { alert('Arrival must be >= 0'); return; }
  if (isNaN(burst) || burst <= 0) { alert('Burst must be >= 1'); return; }

  processes.push({ id, arrival, burst, priority: isNaN(priority) ? 0 : priority });
  assignColor(id);
  renderProcList();
  procForm.reset();
});

// assign a distinct color per process id (consistent)
function assignColor(id) {
  if (colorMap[id]) return;
  const hue = Math.floor(Math.random() * 360);
  colorMap[id] = `hsl(${hue} 75% 70%)`;
}

// render list with delete button
function renderProcList() {
  procListEl.innerHTML = '';
  processes.sort((a,b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  processes.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'proc-row';
    row.innerHTML = `<div class="left"><strong>${p.id}</strong><div class="meta">AT: ${p.arrival} • BT: ${p.burst} • P: ${p.priority}</div></div>`;
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      processes.splice(i,1);
      renderProcList();
    });
    row.appendChild(del);
    procListEl.appendChild(row);
  });
}

// reset all
resetBtn.addEventListener('click', () => {
  processes = [];
  colorMap = {};
  renderProcList();
  clearOutputs();
});

// clear list only
clearListBtn.addEventListener('click', () => {
  processes = [];
  renderProcList();
});

// run visualization
runBtn.addEventListener('click', () => {
  if (!processes.length) { alert('Add one or more processes first'); return; }
  const algo = algorithmEl.value;
  const q = Math.max(1, parseInt(quantumEl.value, 10) || 2);
  const copied = processes.map(p => ({ ...p })); // don't mutate original list
  let result = { gantt: [], procs: [] };

  if (algo === 'fcfs') result = scheduleFCFS(copied);
  else if (algo === 'sjf-np') result = scheduleSJFNonPreemptive(copied);
  else if (algo === 'srtf') result = scheduleSRTF(copied);
  else if (algo === 'rr') result = scheduleRR(copied, q);
  else if (algo === 'priority') result = schedulePriorityNP(copied);

  // Render outputs
  renderGantt(result.gantt);
  renderStats(result.procs);
});

// clear output helpers
function clearOutputs() {
  ganttEl.innerHTML = '';
  timeMarkersEl.innerHTML = '';
  statsEl.innerHTML = '';
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
}

/* =========================
   Scheduling algorithms
   Each returns: { gantt: [ {id,start,end}... ], procs: [processes with ct,tat,wt,rt] }
   Note: procs are the array passed in (mutated with ct/tat/wt/rt where possible).
   ========================= */

// FCFS
function scheduleFCFS(procs) {
  procs.sort((a,b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  const gantt = [];
  let t = 0;
  procs.forEach(p => {
    t = Math.max(t, p.arrival);
    gantt.push({ id: p.id, start: t, end: t + p.burst });
    p.ct = t + p.burst;
    p.tat = p.ct - p.arrival;
    p.wt = p.tat - p.burst;
    p.rt = (p.ct - p.burst) - p.arrival; // first start - arrival ; in FCFS first start = ct - burst
    t += p.burst;
  });
  return { gantt: mergeAdjacent(gantt), procs };
}

// SJF non-preemptive
function scheduleSJFNonPreemptive(procs) {
  const gantt = [];
  const n = procs.length;
  let t = 0;
  const done = new Set();
  while (done.size < n) {
    const ready = procs.filter(p => !done.has(p.id) && p.arrival <= t);
    if (ready.length === 0) {
      // jump to next arrival
      const next = Math.min(...procs.filter(p => !done.has(p.id)).map(p => p.arrival));
      t = Math.max(t, next);
      continue;
    }
    ready.sort((a,b) => a.burst - b.burst || a.arrival - b.arrival || a.id.localeCompare(b.id));
    const p = ready[0];
    gantt.push({ id: p.id, start: t, end: t + p.burst });
    p.ct = t + p.burst;
    p.tat = p.ct - p.arrival;
    p.wt = p.tat - p.burst;
    p.rt = t - p.arrival; // first start is t
    t += p.burst;
    done.add(p.id);
  }
  return { gantt: mergeAdjacent(gantt), procs };
}

// SRTF (preemptive)
function scheduleSRTF(procs) {
  // initialize
  const gantt = [];
  procs.forEach(p => { p.rem = p.burst; p.first = null; p.ct = null; });
  let t = 0, finished = 0, lastId = null;
  procs.sort((a,b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  while (finished < procs.length) {
    const ready = procs.filter(p => p.rem > 0 && p.arrival <= t);
    if (ready.length === 0) {
      // idle to next arrival
      const next = Math.min(...procs.filter(p => p.rem>0).map(p => p.arrival));
      // add idle gap
      if (next > t) {
        gantt.push({ id: 'IDLE', start: t, end: next });
        t = next;
        lastId = null;
        continue;
      }
    } else {
      // pick shortest remaining
      ready.sort((a,b) => a.rem - b.rem || a.arrival - b.arrival || a.id.localeCompare(b.id));
      const p = ready[0];
      if (p.first === null) p.first = t;
      // run one unit
      if (lastId === p.id && gantt.length && gantt[gantt.length -1].id === p.id) {
        gantt[gantt.length - 1].end += 1;
      } else {
        gantt.push({ id: p.id, start: t, end: t+1 });
      }
      p.rem -= 1;
      t += 1;
      if (p.rem === 0) {
        p.ct = t;
        p.tat = p.ct - p.arrival;
        p.wt = p.tat - p.burst;
        p.rt = p.first - p.arrival;
        finished++;
      }
      lastId = p.id;
    }
  }
  return { gantt: mergeAdjacent(gantt), procs };
}

// Round Robin (RRS)
function scheduleRR(procs, quantum=2) {
  // sort by arrival
  const gantt = [];
  const queue = [];
  procs.forEach(p => { p.rem = p.burst; p.first = null; p.ct = null; });
  const list = procs.slice().sort((a,b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  let t = 0, idx = 0, completed = 0;
  while (completed < procs.length) {
    // enqueue arrived
    while (idx < list.length && list[idx].arrival <= t) {
      queue.push(list[idx]);
      idx++;
    }
    if (queue.length === 0) {
      if (idx < list.length) {
        const next = list[idx].arrival;
        // idle gap
        gantt.push({ id: 'IDLE', start: t, end: next });
        t = next;
        continue;
      } else break;
    }
    const p = queue.shift();
    if (p.first === null) p.first = t;
    const exec = Math.min(quantum, p.rem);
    // append segment
    if (gantt.length && gantt[gantt.length-1].id === p.id) {
      gantt[gantt.length-1].end += exec;
    } else {
      gantt.push({ id: p.id, start: t, end: t + exec });
    }
    p.rem -= exec;
    t += exec;
    // enqueue any new arrivals during exec
    while (idx < list.length && list[idx].arrival <= t) {
      queue.push(list[idx]);
      idx++;
    }
    if (p.rem > 0) queue.push(p);
    else {
      p.ct = t;
      p.tat = p.ct - p.arrival;
      p.wt = p.tat - p.burst;
      p.rt = p.first - p.arrival;
      completed++;
    }
  }
  return { gantt: mergeAdjacent(gantt), procs };
}

// Priority non-preemptive (lower number = higher priority)
function schedulePriorityNP(procs) {
  const gantt = [];
  const n = procs.length;
  let t = 0;
  const done = new Set();
  while (done.size < n) {
    const ready = procs.filter(p => !done.has(p.id) && p.arrival <= t);
    if (ready.length === 0) {
      const next = Math.min(...procs.filter(p => !done.has(p.id)).map(p => p.arrival));
      t = Math.max(t, next);
      continue;
    }
    ready.sort((a,b) => a.priority - b.priority || a.arrival - b.arrival || a.id.localeCompare(b.id));
    const p = ready[0];
    gantt.push({ id: p.id, start: t, end: t + p.burst });
    p.ct = t + p.burst;
    p.tat = p.ct - p.arrival;
    p.wt = p.tat - p.burst;
    p.rt = t - p.arrival;
    t += p.burst;
    done.add(p.id);
  }
  return { gantt: mergeAdjacent(gantt), procs };
}

/* =========================
   Helpers for schedule & rendering
   ========================= */

// merge adjacent segments belonging to same id
function mergeAdjacent(arr) {
  if (!arr.length) return [];
  const out = [ {...arr[0]} ];
  for (let i = 1; i < arr.length; i++) {
    const cur = arr[i];
    const prev = out[out.length - 1];
    if (prev.id === cur.id && prev.end === cur.start) {
      prev.end = cur.end;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/* =========================
   Gantt rendering (aligned timestamps)
   ========================= */

function renderGantt(timeline) {
  clearGantt();
  if (!timeline || !timeline.length) return;

  // ensure includes leading 0 marker
  timeline = timeline.slice();

  // compute overall start and end
  const overallStart = Math.min(...timeline.map(s => s.start));
  const overallEnd = Math.max(...timeline.map(s => s.end));
  const total = Math.max(1, overallEnd - overallStart);
  const scale = PX_PER_UNIT; // px per unit time

  // If first segment doesn't start at 0, include IDLE at start (handled by algorithms but double-check)
  if (timeline[0].start > overallStart) {
    timeline.unshift({ id: 'IDLE', start: overallStart, end: timeline[0].start });
  }

  // Draw each wrapper (bar + marker row)
  timeline.forEach((seg, idx) => {
    const widthPx = Math.max(6, Math.round((seg.end - seg.start) * scale));

    const wrapper = document.createElement('div');
    wrapper.className = 'gantt-item';
    wrapper.style.width = widthPx + 'px';
    wrapper.style.marginRight = '6px';

    // Bar
    const bar = document.createElement('div');
    bar.className = 'gantt-block';
    bar.style.width = '100%';
    bar.style.background = seg.id === 'IDLE' ? '' : (colorMap[seg.id] || assignOnTheFly(seg.id));
    bar.textContent = seg.id === 'IDLE' ? '' : seg.id;
    if (seg.id === 'IDLE') bar.classList.add('idle');
    wrapper.appendChild(bar);

    // Marker row
    const markers = document.createElement('div');
    markers.className = 'gantt-marker-row';
    // start label (always)
    const startLabel = document.createElement('span');
    startLabel.className = 'marker-start';
    startLabel.textContent = seg.start;
    markers.appendChild(startLabel);
    // last segment end label
    if (idx === timeline.length - 1) {
      const endLabel = document.createElement('span');
      endLabel.className = 'marker-end';
      endLabel.textContent = seg.end;
      markers.appendChild(endLabel);
    }
    wrapper.appendChild(markers);

    ganttEl.appendChild(wrapper);
  });

  // final: if last segment doesn't show final end because of merging, ensure last end marker exists:
  // (we added end marker on last segment above)
}

// ensure color exists for id, create if missing
function assignOnTheFly(id) {
  if (!colorMap[id]) {
    const hue = Math.floor(Math.random() * 360);
    colorMap[id] = `hsl(${hue} 70% 70%)`;
  }
  return colorMap[id];
}

function clearGantt() {
  ganttEl.innerHTML = '';
  timeMarkersEl.innerHTML = '';
}

/* =========================
   Stats rendering & Chart
   ========================= */

function renderStats(procs) {
  // compute sums & averages; procs should have ct,tat,wt,rt where possible
  const n = procs.length;
  let sumCT = 0, sumTAT = 0, sumWT = 0, sumRT = 0;
  // build table
  let table = `<table><thead><tr>
    <th>ID</th><th>AT</th><th>BT</th><th>P</th><th>CT</th><th>TAT</th><th>WT</th><th>RT</th><th>Indicator</th>
  </tr></thead><tbody>`;
  procs.forEach(p => {
    const ct = p.ct ?? '-';
    const tat = p.tat ?? '-';
    const wt = p.wt ?? '-';
    const rt = p.rt ?? '-';
    if (typeof ct === 'number') sumCT += ct;
    if (typeof tat === 'number') sumTAT += tat;
    if (typeof wt === 'number') sumWT += wt;
    if (typeof rt === 'number') sumRT += rt;
    table += `<tr>
      <td>${p.id}</td><td>${p.arrival}</td><td>${p.burst}</td><td>${p.priority}</td>
      <td>${ct}</td><td>${tat}</td><td>${wt}</td><td>${rt}</td>
      <td>${(typeof ct === 'number') ? '✅' : '–'}</td>
    </tr>`;
  });
  const avgCT = (sumCT / n) || 0;
  const avgTAT = (sumTAT / n) || 0;
  table += `</tbody></table>
    <div style="margin-top:8px;color:var(--muted);">
      <strong>Avg CT:</strong> ${avgCT.toFixed(2)} &nbsp; | &nbsp;
      <strong>Avg TAT:</strong> ${avgTAT.toFixed(2)}
    </div>`;
  statsEl.innerHTML = table;

  // build chart for CT, TAT, WT, RT
  const labels = procs.map(p => p.id);
  const dataCT = procs.map(p => p.ct ?? 0);
  const dataTAT = procs.map(p => p.tat ?? 0);
  const dataWT = procs.map(p => p.wt ?? 0);
  const dataRT = procs.map(p => p.rt ?? 0);

  if (chartInstance) chartInstance.destroy();
  const ctx = chartCanvas.getContext('2d');
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'CT', data: dataCT, backgroundColor: 'rgba(96,165,250,0.9)' },
        { label: 'TAT', data: dataTAT, backgroundColor: 'rgba(125,211,252,0.9)' },
        { label: 'WT', data: dataWT, backgroundColor: 'rgba(250,204,21,0.9)' },
        { label: 'RT', data: dataRT, backgroundColor: 'rgba(244,114,182,0.9)' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

/* =========================
   End of script
   ========================= */

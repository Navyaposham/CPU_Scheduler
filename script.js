/* script.js - full implementation for 5 algorithms (FCFS, SJF-NP, SRTF, RR, Priority)
   - Unique IDs enforced
   - Gantt chart with aligned timestamps
   - Stats: CT, TAT, WT, RT, indicator, Avg CT/TAT
   - Chart.js bar chart for CT/TAT/WT/RT
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
const statsEl = document.getElementById('stats');
const chartCanvas = document.getElementById('chartCanvas');

let processes = [];           // user-entered list (order of input)
let colorMap = {};            // id -> color
let chartInstance = null;
const DEFAULT_SCALE = 48;     // baseline px per time unit (will be adjusted if needed)

// Show/hide quantum when RR selected
algorithmEl.addEventListener('change', () => {
  quantumRow.classList.toggle('hidden', algorithmEl.value !== 'rr');
});

// assign stable color
function assignColor(id) {
  if (colorMap[id]) return colorMap[id];
  const hue = Math.floor(Math.random() * 360);
  const color = `hsl(${hue} 70% 70%)`;
  colorMap[id] = color;
  return color;
}

// add process
procForm.addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('pId').value.trim();
  const arrival = Number(document.getElementById('pArrival').value);
  const burst = Number(document.getElementById('pBurst').value);
  const priority = Number(document.getElementById('pPriority').value);

  if (!id) { alert('Please enter a Process ID'); return; }
  if (processes.some(p => p.id.toLowerCase() === id.toLowerCase())) {
    alert('Duplicate Process ID not allowed (case-insensitive).'); return;
  }
  if (!Number.isFinite(arrival) || arrival < 0) { alert('Arrival must be >= 0'); return; }
  if (!Number.isFinite(burst) || burst <= 0) { alert('Burst must be >= 1'); return; }

  processes.push({ id, arrival, burst, priority: Number.isFinite(priority) ? priority : 0 });
  assignColor(id);
  renderProcList();
  procForm.reset();
  document.getElementById('pArrival').value = '0';
  document.getElementById('pBurst').value = '1';
  document.getElementById('pPriority').value = '0';
});

// render process list with delete
function renderProcList() {
  procListEl.innerHTML = '';
  // show in arrival order
  const list = processes.slice().sort((a,b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  list.forEach(p => {
    const el = document.createElement('div');
    el.className = 'proc-row';
    el.innerHTML = `<div class="left"><strong>${p.id}</strong><div class="meta">AT: ${p.arrival} • BT: ${p.burst} • P: ${p.priority}</div></div>`;
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      const idx = processes.findIndex(x => x.id === p.id);
      if (idx !== -1) processes.splice(idx,1);
      renderProcList();
    });
    el.appendChild(del);
    procListEl.appendChild(el);
  });
}

// clear list
clearListBtn.addEventListener('click', () => {
  processes = [];
  renderProcList();
  clearOutputs();
});

// reset all (clear list + outputs)
resetBtn.addEventListener('click', () => {
  processes = [];
  colorMap = {};
  renderProcList();
  clearOutputs();
});

// run visualization
runBtn.addEventListener('click', () => {
  if (!processes.length) { alert('Add at least one process'); return; }
  const algo = algorithmEl.value;
  const q = Math.max(1, Number(quantumEl.value) || 2);

  // use a deep copy so we don't mutate the input list stored in `processes`
  const procsCopy = processes.map(p => ({ ...p }));

  let result;
  if (algo === 'fcfs') result = scheduleFCFS(procsCopy);
  else if (algo === 'sjf-np') result = scheduleSJFNonPreemptive(procsCopy);
  else if (algo === 'srtf') result = scheduleSRTF(procsCopy);
  else if (algo === 'rr') result = scheduleRR(procsCopy, q);
  else if (algo === 'priority') result = schedulePriorityNP(procsCopy);
  else result = { gantt: [], procs: procsCopy };

  // Render
  renderGantt(result.gantt);
  renderStats(result.procs);
});

/* ----------------------------
   Scheduling algorithms
   Each returns { gantt: [ {id,start,end}... ], procs: arrayWithMetrics }
   procs array entries are the copied procs (mutated to add ct,tat,wt,rt)
   ---------------------------- */

// Merge adjacent segments with same id & contiguous
function mergeAdjacent(arr) {
  if (!arr.length) return [];
  const out = [ { ...arr[0] } ];
  for (let i=1;i<arr.length;i++){
    const cur = arr[i];
    const prev = out[out.length-1];
    if (prev.id === cur.id && prev.end === cur.start) prev.end = cur.end;
    else out.push({ ...cur });
  }
  return out;
}

// FCFS
function scheduleFCFS(procs) {
  procs.sort((a,b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  const gantt = [];
  let t = 0;
  procs.forEach(p => {
    const start = Math.max(t, p.arrival);
    const end = start + p.burst;
    gantt.push({ id: p.id, start, end });
    p.ct = end;
    p.tat = p.ct - p.arrival;
    p.wt = p.tat - p.burst;
    p.rt = start - p.arrival;
    t = end;
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
      const nextArrival = Math.min(...procs.filter(p => !done.has(p.id)).map(p => p.arrival));
      t = Math.max(t, nextArrival);
      continue;
    }
    ready.sort((a,b) => a.burst - b.burst || a.arrival - b.arrival || a.id.localeCompare(b.id));
    const p = ready[0];
    const start = t;
    const end = t + p.burst;
    gantt.push({ id: p.id, start, end });
    p.ct = end;
    p.tat = p.ct - p.arrival;
    p.wt = p.tat - p.burst;
    p.rt = start - p.arrival;
    t = end;
    done.add(p.id);
  }
  return { gantt: mergeAdjacent(gantt), procs };
}

// SRTF (preemptive SJF)
function scheduleSRTF(procs) {
  const gantt = [];
  procs.forEach(p => { p.rem = p.burst; p.first = null; p.ct = null; });
  procs.sort((a,b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  let t = 0, finished = 0, lastId = null;
  while (finished < procs.length) {
    const ready = procs.filter(p => p.rem > 0 && p.arrival <= t);
    if (ready.length === 0) {
      const nextArr = Math.min(...procs.filter(p => p.rem > 0).map(p => p.arrival));
      if (nextArr > t) {
        // idle gap
        gantt.push({ id: 'IDLE', start: t, end: nextArr });
        t = nextArr;
        lastId = null;
        continue;
      }
    } else {
      ready.sort((a,b) => a.rem - b.rem || a.arrival - b.arrival || a.id.localeCompare(b.id));
      const p = ready[0];
      if (p.first === null) p.first = t;
      // run one unit
      if (lastId === p.id && gantt.length && gantt[gantt.length-1].id === p.id) {
        gantt[gantt.length-1].end += 1;
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
  const gantt = [];
  const list = procs.slice().sort((a,b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  list.forEach(p => { p.rem = p.burst; p.first = null; p.ct = null; });
  const queue = [];
  let t = 0, idx = 0, completed = 0;
  while (completed < list.length) {
    // enqueue arrivals
    while (idx < list.length && list[idx].arrival <= t) { queue.push(list[idx]); idx++; }
    if (queue.length === 0) {
      if (idx < list.length) {
        const next = list[idx].arrival;
        gantt.push({ id:'IDLE', start: t, end: next });
        t = next;
        continue;
      } else break;
    }
    const p = queue.shift();
    if (p.first === null) p.first = t;
    const run = Math.min(quantum, p.rem);
    if (gantt.length && gantt[gantt.length-1].id === p.id) gantt[gantt.length-1].end += run;
    else gantt.push({ id: p.id, start: t, end: t + run });
    p.rem -= run; t += run;
    // enqueue any new arrivals during this run
    while (idx < list.length && list[idx].arrival <= t) { queue.push(list[idx]); idx++; }
    if (p.rem > 0) queue.push(p);
    else {
      p.ct = t;
      p.tat = p.ct - p.arrival;
      p.wt = p.tat - p.burst;
      p.rt = p.first - p.arrival;
      completed++;
    }
  }
  // Map computed metrics back to procs (input copy)
  // Note: list contains same objects as procs where mutated; procs param holds references to same objects if created earlier
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
    const start = t, end = t + p.burst;
    gantt.push({ id: p.id, start, end });
    p.ct = end;
    p.tat = p.ct - p.arrival;
    p.wt = p.tat - p.burst;
    p.rt = start - p.arrival;
    t = end;
    done.add(p.id);
  }
  return { gantt: mergeAdjacent(gantt), procs };
}

/* ----------------------------
   Rendering: Gantt + Stats + Chart
   ---------------------------- */

function clearOutputs() {
  ganttEl.innerHTML = '';
  statsEl.innerHTML = '';
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
}

function renderGantt(timeline) {
  // Clear previous
  ganttEl.innerHTML = '';

  if (!timeline || !timeline.length) return;

  // Merge adjacency already done; compute scale
  const overallStart = Math.min(...timeline.map(s => s.start));
  const overallEnd = Math.max(...timeline.map(s => s.end));
  const total = Math.max(1, overallEnd - overallStart);

  // scale: keep bars readable and the chart not ridiculously wide
  const pxPerUnit = Math.max(20, Math.min(80, 800 / total));

  // If first segment doesn't start at 0 and no 'IDLE' included, add IDLE at start
  if (timeline[0].start > overallStart) {
    timeline.unshift({ id: 'IDLE', start: overallStart, end: timeline[0].start });
  }

  timeline.forEach((seg, idx) => {
    const widthPx = Math.max(8, Math.round((seg.end - seg.start) * pxPerUnit));

    const wrapper = document.createElement('div');
    wrapper.className = 'gantt-item';
    wrapper.style.width = widthPx + 'px';
    wrapper.style.marginRight = '6px';

    // Bar
    const bar = document.createElement('div');
    bar.className = 'gantt-block';
    bar.style.width = '100%';
    if (seg.id === 'IDLE') {
      bar.classList.add('idle');
      bar.textContent = '';
    } else {
      const color = colorMap[seg.id] || assignColor(seg.id);
      bar.style.background = color;
      bar.textContent = seg.id;
    }
    wrapper.appendChild(bar);

    // Marker row
    const markers = document.createElement('div');
    markers.className = 'gantt-marker-row';
    const startLabel = document.createElement('span');
    startLabel.className = 'marker-start';
    startLabel.textContent = seg.start;
    markers.appendChild(startLabel);
    if (idx === timeline.length - 1) {
      const endLabel = document.createElement('span');
      endLabel.className = 'marker-end';
      endLabel.textContent = seg.end;
      markers.appendChild(endLabel);
    }
    wrapper.appendChild(markers);

    ganttEl.appendChild(wrapper);
  });
}

function renderStats(resultProcs) {
  // Map metrics by ID
  const metrics = {};
  resultProcs.forEach(p => { metrics[p.id] = p; });

  // Render rows in the order the user added processes (processes array)
  let html = `<table><thead><tr>
    <th>ID</th><th>AT</th><th>BT</th><th>P</th><th>CT</th><th>TAT</th><th>WT</th><th>RT</th><th>Indicator</th>
  </tr></thead><tbody>`;

  let sumCT = 0, sumTAT = 0, count = 0;
  const labels = [], dataCT = [], dataTAT = [], dataWT = [], dataRT = [];

  processes.forEach(p => {
    const m = metrics[p.id] || {};
    const ct = (typeof m.ct === 'number') ? m.ct : '-';
    const tat = (typeof m.tat === 'number') ? m.tat : '-';
    const wt = (typeof m.wt === 'number') ? m.wt : '-';
    const rt = (typeof m.rt === 'number') ? m.rt : '-';
    const indicator = (typeof m.ct === 'number') ? '✅' : '–';

    html += `<tr>
      <td>${p.id}</td><td>${p.arrival}</td><td>${p.burst}</td><td>${p.priority}</td>
      <td>${ct}</td><td>${tat}</td><td>${wt}</td><td>${rt}</td><td>${indicator}</td>
    </tr>`;

    // for averages / chart only include numeric values
    labels.push(p.id);
    dataCT.push(typeof m.ct === 'number' ? m.ct : 0);
    dataTAT.push(typeof m.tat === 'number' ? m.tat : 0);
    dataWT.push(typeof m.wt === 'number' ? m.wt : 0);
    dataRT.push(typeof m.rt === 'number' ? m.rt : 0);

    if (typeof m.ct === 'number') { sumCT += m.ct; sumTAT += (typeof m.tat === 'number' ? m.tat : 0); count++; }
  });

  html += `</tbody></table>`;

  const avgCT = count ? (sumCT / count).toFixed(2) : '0.00';
  const avgTAT = count ? (sumTAT / count).toFixed(2) : '0.00';

  html += `<div style="margin-top:8px;color:var(--muted);">
    <strong>Avg CT:</strong> ${avgCT} &nbsp; | &nbsp;
    <strong>Avg TAT:</strong> ${avgTAT}
  </div>`;

  statsEl.innerHTML = html;

  // Chart.js
  if (chartInstance) chartInstance.destroy();
  const ctx = chartCanvas.getContext('2d');
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'CT',  data: dataCT, backgroundColor: 'rgba(96,165,250,0.9)' },
        { label: 'TAT', data: dataTAT, backgroundColor: 'rgba(125,211,252,0.9)' },
        { label: 'WT',  data: dataWT, backgroundColor: 'rgba(250,204,21,0.9)' },
        { label: 'RT',  data: dataRT, backgroundColor: 'rgba(244,114,182,0.9)' }
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

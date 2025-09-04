/* script.js - algorithms + UI glue
   Supports:
   - FCFS
   - SJF non-preemptive
   - SRTF (SJF preemptive)
   - Round Robin
   - Priority (non-preemptive)
*/

(() => {
  // UI elements
  const procForm = document.getElementById('procForm');
  const pName = document.getElementById('pName');
  const pArrival = document.getElementById('pArrival');
  const pBurst = document.getElementById('pBurst');
  const pPriority = document.getElementById('pPriority');
  const procListEl = document.getElementById('procList');
  const algorithmEl = document.getElementById('algorithm');
  const quantumRow = document.getElementById('quantumRow');
  const quantumEl = document.getElementById('quantum');
  const runBtn = document.getElementById('runBtn');
  const addSample = document.getElementById('addSample');
  const clearAll = document.getElementById('clearAll');
  const ganttEl = document.getElementById('gantt');
  const timeMarkersEl = document.getElementById('timeMarkers');
  const statsEl = document.getElementById('stats');
  const exportBtn = document.getElementById('exportBtn');

  let processes = [];

  function uid() {
    return Math.random().toString(36).slice(2, 7).toUpperCase();
  }

  // Render processes
  function renderProcs() {
    procListEl.innerHTML = '';
    processes.forEach((p, i) => {
      const div = document.createElement('div');
      div.className = 'proc-item';
      div.innerHTML = `<div>
          <strong>${p.name}</strong>
          <div class="meta">Arr: ${p.arrival} &nbsp; Burst: ${p.burst} &nbsp; Pri: ${p.priority}</div>
        </div>
        <div>
          <button data-i="${i}" class="delBtn secondary">Delete</button>
        </div>`;
      procListEl.appendChild(div);
    });
    procListEl.querySelectorAll('.delBtn').forEach(b => {
      b.addEventListener('click', e => {
        const i = +e.target.dataset.i;
        processes.splice(i, 1);
        renderProcs();
      });
    });
  }

  // Add sample processes
  addSample.addEventListener('click', () => {
    processes = [
      { name: 'A', arrival: 0, burst: 5, priority: 2 },
      { name: 'B', arrival: 1, burst: 3, priority: 1 },
      { name: 'C', arrival: 2, burst: 8, priority: 3 },
      { name: 'D', arrival: 3, burst: 6, priority: 2 }
    ];
    renderProcs();
  });

  clearAll.addEventListener('click', () => {
    processes = [];
    renderProcs();
    clearOutput();
  });

  procForm.addEventListener('submit', e => {
    e.preventDefault();
    const name = pName.value.trim() || uid();
    const arrival = Math.max(0, parseInt(pArrival.value, 10) || 0);
    const burst = Math.max(1, parseInt(pBurst.value, 10) || 1);
    const priority = parseInt(pPriority.value, 10) || 0;
    processes.push({ name: name.toString(), arrival, burst, priority });
    pName.value = '';
    pArrival.value = '0';
    pBurst.value = '1';
    pPriority.value = '0';
    renderProcs();
  });

  algorithmEl.addEventListener('change', () => {
    quantumRow.classList.toggle('hidden', algorithmEl.value !== 'rr');
  });

  // Export current processes to JSON
  exportBtn.addEventListener('click', () => {
    const data = JSON.stringify(processes, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'processes.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  runBtn.addEventListener('click', () => {
    if (!processes.length) {
      alert('Add at least one process first.');
      return;
    }
    const alg = algorithmEl.value;
    const q = Math.max(1, parseInt(quantumEl.value, 10) || 1);
    // deep copy processes to avoid mutation
    const procs = processes.map(p => ({
      name: p.name,
      arrival: Number(p.arrival),
      burst: Number(p.burst),
      priority: Number(p.priority)
    }));
    let result;
    if (alg === 'fcfs') result = runFCFS(procs);
    else if (alg === 'sjf-np') result = runSJFNonPreemptive(procs);
    else if (alg === 'srtf') result = runSRTF(procs);
    else if (alg === 'rr') result = runRR(procs, q);
    else if (alg === 'priority') result = runPriorityNonPreemptive(procs);
    else result = { gantt: [], procs: [] };

    renderGantt(result.gantt);
    renderStats(result.procs);
  });

  // Clear output
  function clearOutput() {
    ganttEl.innerHTML = '';
    timeMarkersEl.innerHTML = '';
    statsEl.innerHTML = '';
  }

  // Rendering gantt chart
  function renderGantt(gantt) {
    ganttEl.innerHTML = '';
    timeMarkersEl.innerHTML = '';
    if (!gantt || !gantt.length) return;
    // compute timeline length
    const start = Math.min(...gantt.map(s => s.start));
    const end = Math.max(...gantt.map(s => s.end));
    const total = end - start || 1;
    // choose scale
    const scale = Math.max(30, 600 / total); // px per unit time (bounded)
    gantt.forEach(seg => {
      const w = (seg.end - seg.start) * scale;
      const div = document.createElement('div');
      div.className = 'seg';
      div.style.width = (w < 6 ? 6 : w) + 'px';
      div.style.background = colorFor(seg.name);
      div.title = `${seg.name} [${seg.start} → ${seg.end}]`;
      div.textContent = seg.name;
      ganttEl.appendChild(div);
    });
    // time markers
    for (let t = start; t <= end; t++) {
      const m = document.createElement('div');
      m.style.minWidth = '24px';
      m.style.textAlign = 'left';
      m.textContent = t;
      timeMarkersEl.appendChild(m);
    }
  }

  // color generator for names
  const colorMap = {};
  function colorFor(name) {
    if (colorMap[name]) return colorMap[name];
    const hues = [200, 160, 280, 40, 320, 200, 120, 10];
    const h = hues[Object.keys(colorMap).length % hues.length];
    const color = `hsl(${h} 70% 70%)`;
    colorMap[name] = color;
    return color;
  }

  // Render statistics table
  function renderStats(procArr) {
    if (!procArr || !procArr.length) {
      statsEl.innerHTML = '';
      return;
    }
    // table with completion, turnaround, waiting
    const lines = [];
    lines.push('<table>');
    lines.push('<thead><tr><th>Process</th><th>Arrival</th><th>Burst</th><th>Completion</th><th>Turnaround</th><th>Waiting</th></tr></thead>');
    lines.push('<tbody>');
    let totalTurn = 0, totalWait = 0;
    procArr.forEach(p => {
      const tat = p.completion - p.arrival;
      const wait = tat - p.burst;
      totalTurn += tat;
      totalWait += wait;
      lines.push(`<tr><td>${p.name}</td><td>${p.arrival}</td><td>${p.burst}</td><td>${p.completion}</td><td>${tat}</td><td>${wait}</td></tr>`);
    });
    const avgT = (totalTurn / procArr.length).toFixed(2);
    const avgW = (totalWait / procArr.length).toFixed(2);
    lines.push('</tbody></table>');
    lines.push(`<p style="margin-top:10px;color:var(--muted)">Average Turnaround: <strong style="color:var(--white)">${avgT}</strong> · Average Waiting: <strong style="color:var(--white)">${avgW}</strong></p>`);
    statsEl.innerHTML = lines.join('');
  }

  /********************
   * Algorithms
   ********************/

  // Utility: sort by arrival, then name
  function byArrival(a,b){ return a.arrival - b.arrival || (a.name > b.name ? 1 : -1); }

  // FCFS (non-preemptive)
  function runFCFS(procs) {
    procs.sort(byArrival);
    const gantt = [];
    let time = 0;
    procs.forEach(p => {
      if (time < p.arrival) time = p.arrival;
      const start = time;
      const end = time + p.burst;
      gantt.push({ name: p.name, start, end });
      p.completion = end;
      time = end;
    });
    return { gantt, procs };
  }

  // SJF - non-preemptive
  function runSJFNonPreemptive(procs) {
    // maintain ready queue by shortest burst
    const gantt = [];
    const n = procs.length;
    let time = 0;
    const done = [];
    // sort by arrival
    procs.sort(byArrival);
    const list = procs.slice();
    while (done.length < n) {
      const ready = list.filter(p => p.arrival <= time && !p.done);
      if (!ready.length) {
        // idle to next arrival
        const next = list.find(p => !p.done);
        time = Math.max(time, next.arrival);
        continue;
      }
      // pick shortest burst; tie-break by arrival then name
      ready.sort((a,b)=> a.burst - b.burst || a.arrival - b.arrival || (a.name>b.name?1:-1));
      const p = ready[0];
      p.done = true;
      const start = time;
      const end = time + p.burst;
      gantt.push({ name: p.name, start, end });
      p.completion = end;
      time = end;
      done.push(p);
    }
    return { gantt, procs };
  }

  // SRTF (preemptive SJF)
  function runSRTF(procs) {
    const gantt = [];
    // init remaining
    procs.forEach(p => { p.remaining = p.burst; p.completion = null; p.started = false; });
    procs.sort(byArrival);
    let time = 0;
    const n = procs.length;
    let finished = 0;
    let lastProc = null;
    while (finished < n) {
      // find ready with smallest remaining >0
      const ready = procs.filter(p => p.arrival <= time && p.remaining > 0);
      if (!ready.length) {
        // idle to next arrival
        const next = procs.find(p => p.remaining > 0);
        time = Math.max(time, next.arrival);
        lastProc = null;
        continue;
      }
      ready.sort((a,b)=> a.remaining - b.remaining || a.arrival - b.arrival || (a.name>b.name?1:-1));
      const p = ready[0];
      // run 1 unit (time quantum = 1)
      const segStart = time;
      time += 1;
      p.remaining -= 1;
      const segEnd = time;
      // append or extend last segment if same process
      if (lastProc && lastProc.name === p.name && gantt.length) {
        gantt[gantt.length-1].end = segEnd;
      } else {
        gantt.push({ name: p.name, start: segStart, end: segEnd });
      }
      lastProc = p;
      if (p.remaining === 0) {
        p.completion = time;
        finished++;
      }
    }
    return { gantt, procs };
  }

  // Round Robin
  function runRR(procs, quantum = 2) {
    const gantt = [];
    // prepare queue: sort by arrival
    procs.forEach(p => { p.remaining = p.burst; p.completion = null; });
    procs.sort(byArrival);
    const q = [];
    let time = 0;
    let i = 0; // index for arrivals
    while (true) {
      // enqueue arrivals at current time
      while (i < procs.length && procs[i].arrival <= time) {
        q.push(Object.assign({}, procs[i]));
        // but we should reference original to store completion, so keep original ref
        // we'll manage by mapping names to originals later
        i++;
      }
      if (!q.length) {
        if (i < procs.length) {
          time = procs[i].arrival;
          continue;
        } else break;
      }
      const cur = q.shift();
      // find original process object to update completion
      const orig = procs.find(p => p.name === cur.name && p.remaining === cur.remaining);
      const run = Math.min(quantum, cur.remaining);
      const start = time;
      time += run;
      const end = time;
      // push segment; merge if same as last
      if (gantt.length && gantt[gantt.length-1].name === cur.name) {
        gantt[gantt.length-1].end = end;
      } else {
        gantt.push({ name: cur.name, start, end });
      }
      cur.remaining -= run;
      // enqueue any arrivals that occurred during this time slice
      while (i < procs.length && procs[i].arrival <= time) {
        q.push(Object.assign({}, procs[i]));
        i++;
      }
      if (cur.remaining > 0) {
        // push back with updated remaining
        q.push(cur);
      } else {
        // completed: set completion for original process with same name but careful if duplicate names exist
        // find an original with no completion yet
        const origUnfinished = procs.find(p => p.name === cur.name && (p.completion == null));
        if (origUnfinished) origUnfinished.completion = end;
      }
    }
    // fill completion for any remaining not set (should be set)
    procs.forEach(p => { if (p.completion == null) p.completion = p.arrival; });
    return { gantt, procs };
  }

  // Priority non-preemptive (lower number = higher priority)
  function runPriorityNonPreemptive(procs) {
    const gantt = [];
    const n = procs.length;
    let time = 0;
    procs.sort(byArrival);
    while (procs.some(p => !p.done)) {
      const ready = procs.filter(p => p.arrival <= time && !p.done);
      if (!ready.length) {
        const next = procs.find(p => !p.done);
        time = Math.max(time, next.arrival);
        continue;
      }
      ready.sort((a,b)=> a.priority - b.priority || a.arrival - b.arrival || (a.name>b.name?1:-1));
      const p = ready[0];
      p.done = true;
      const start = time;
      const end = time + p.burst;
      gantt.push({ name: p.name, start, end });
      p.completion = end;
      time = end;
    }
    return { gantt, procs };
  }

// Reset button functionality
document.getElementById("resetBtn").addEventListener("click", () => {
  processes = []; // clear process list
  document.getElementById("gantt").innerHTML = "";
  document.getElementById("results").innerHTML = "";
});

// Example drawGanttChart function with aligned markers
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

    // Start time marker (aligned to block's left)
    const start = document.createElement("span");
    start.className = "time-marker";
    start.style.width = (slot.end - slot.start) * 50 + "px"; // same width as block
    start.innerText = slot.start;
    markers.appendChild(start);

    // Last block → add end time marker at the right
    if (i === schedule.length - 1) {
      const end = document.createElement("span");
      end.className = "time-marker end";
      end.innerText = slot.end;
      markers.appendChild(end);
    }
  });
}
  
  // init
  renderProcs();
  clearOutput();

})();

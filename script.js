// script.js - CPU Scheduling Visualizer (All algorithms)

// Global data
let processes = [];
let chartInstance = null;

// Add process
document.getElementById("procForm").addEventListener("submit", e => {
  e.preventDefault();
  const id = document.getElementById("pName").value.trim();
  const arrival = parseInt(document.getElementById("pArrival").value);
  const burst = parseInt(document.getElementById("pBurst").value);
  const priority = parseInt(document.getElementById("pPriority").value);

  // prevent duplicate IDs
  if (processes.some(p => p.id === id)) {
    alert("Process ID must be unique!");
    return;
  }

  processes.push({ id, arrival, burst, priority });
  renderProcList();
  e.target.reset();
});

// Clear all
document.getElementById("clearAll").addEventListener("click", () => {
  processes = [];
  renderProcList();
  document.getElementById("gantt").innerHTML = "";
  document.getElementById("timeMarkers").innerHTML = "";
  document.getElementById("stats").innerHTML = "";
  if (chartInstance) chartInstance.destroy();
});

// Reset
document.getElementById("resetBtn").addEventListener("click", () => {
  processes = [];
  renderProcList();
  document.getElementById("gantt").innerHTML = "";
  document.getElementById("timeMarkers").innerHTML = "";
  document.getElementById("stats").innerHTML = "";
  if (chartInstance) chartInstance.destroy();
});

// Show quantum only for RR
document.getElementById("algorithm").addEventListener("change", e => {
  document.getElementById("quantumRow").classList.toggle("hidden", e.target.value !== "rr");
});

// Run
document.getElementById("runBtn").addEventListener("click", () => {
  const algo = document.getElementById("algorithm").value;
  const quantum = parseInt(document.getElementById("quantum").value);
  if (processes.length === 0) {
    alert("Add processes first!");
    return;
  }
  runScheduler(algo, quantum);
});

// Render process list
function renderProcList() {
  const wrap = document.getElementById("procList");
  wrap.innerHTML = "";
  processes.forEach(p => {
    const div = document.createElement("div");
    div.className = "proc-item";
    div.innerHTML = `<strong>${p.id}</strong>
      <span class="meta">AT:${p.arrival} BT:${p.burst} P:${p.priority}</span>`;
    wrap.appendChild(div);
  });
}

// Main scheduler
function runScheduler(algo, quantum) {
  let timeline = [];
  let time = 0;
  let procs = processes.map(p => ({ ...p, burstLeft: p.burst }));

  if (algo === "fcfs") {
    procs.sort((a,b) => a.arrival - b.arrival);
    procs.forEach(p => {
      time = Math.max(time, p.arrival);
      timeline.push({ id:p.id, start:time, end:time+p.burst });
      p.ct = time+p.burst;
      p.tat = p.ct - p.arrival;
      p.wt = p.tat - p.burst;
      p.rt = p.wt;
      time += p.burst;
    });
  }

  if (algo === "sjf-np") {
    let completed = [];
    while (completed.length < procs.length) {
      let avail = procs.filter(p => !completed.includes(p) && p.arrival <= time);
      if (avail.length === 0) { time++; continue; }
      let p = avail.reduce((a,b) => a.burst < b.burst ? a : b);
      timeline.push({ id:p.id, start:time, end:time+p.burst });
      p.ct = time+p.burst;
      p.tat = p.ct - p.arrival;
      p.wt = p.tat - p.burst;
      p.rt = p.wt;
      time += p.burst;
      completed.push(p);
    }
  }

  if (algo === "srtf") {
    let completed = 0;
    let last = null;
    while (completed < procs.length) {
      let avail = procs.filter(p => p.burstLeft > 0 && p.arrival <= time);
      if (avail.length === 0) { time++; continue; }
      let p = avail.reduce((a,b) => a.burstLeft < b.burstLeft ? a : b);
      if (last && last.id === p.id) {
        timeline[timeline.length-1].end++;
      } else {
        timeline.push({ id:p.id, start:time, end:time+1 });
      }
      if (p.burstLeft === p.burst) p.rt = time - p.arrival;
      p.burstLeft--; time++;
      if (p.burstLeft === 0) {
        p.ct = time;
        p.tat = p.ct - p.arrival;
        p.wt = p.tat - p.burst;
        completed++;
      }
      last = p;
    }
  }

  if (algo === "rr") {
    let q = quantum || 2;
    let queue = [];
    let ready = [...procs].sort((a,b) => a.arrival - b.arrival);
    let idx = 0, completed = 0;
    while (completed < procs.length) {
      while (idx < ready.length && ready[idx].arrival <= time) {
        queue.push(ready[idx++]);
      }
      if (queue.length === 0) { time++; continue; }
      let p = queue.shift();
      let run = Math.min(q, p.burstLeft);
      timeline.push({ id:p.id, start:time, end:time+run });
      if (p.burstLeft === p.burst) p.rt = time - p.arrival;
      p.burstLeft -= run; time += run;
      while (idx < ready.length && ready[idx].arrival <= time) {
        queue.push(ready[idx++]);
      }
      if (p.burstLeft > 0) queue.push(p);
      else {
        p.ct = time;
        p.tat = p.ct - p.arrival;
        p.wt = p.tat - p.burst;
        completed++;
      }
    }
  }

  if (algo === "priority") {
    let completed = [];
    while (completed.length < procs.length) {
      let avail = procs.filter(p => !completed.includes(p) && p.arrival <= time);
      if (avail.length === 0) { time++; continue; }
      let p = avail.reduce((a,b) => a.priority < b.priority ? a : b);
      timeline.push({ id:p.id, start:time, end:time+p.burst });
      p.ct = time+p.burst;
      p.tat = p.ct - p.arrival;
      p.wt = p.tat - p.burst;
      p.rt = p.wt;
      time += p.burst;
      completed.push(p);
    }
  }

  renderGantt(timeline);
  renderStats(procs);
}

// Render Gantt
function renderGantt(timeline) {
  const gantt = document.getElementById("gantt");
  const markers = document.getElementById("timeMarkers");
  gantt.innerHTML = "";
  markers.innerHTML = "";

  timeline.forEach(seg => {
    const div = document.createElement("div");
    div.className = "seg";
    div.style.width = (seg.end - seg.start)*40 + "px";
    div.textContent = seg.id;
    gantt.appendChild(div);
  });

  timeline.forEach((seg, i) => {
    const mark = document.createElement("div");
    mark.className = "time-marker";
    mark.style.width = (seg.end - seg.start)*40 + "px";
    mark.textContent = (i === 0 ? seg.start+" | "+seg.end : seg.end);
    markers.appendChild(mark);
  });
}

// Render stats
function renderStats(procs) {
  const wrap = document.getElementById("stats");
  let avgCT=0, avgTAT=0, avgWT=0, avgRT=0;
  wrap.innerHTML = `<table><tr>
    <th>ID</th><th>AT</th><th>BT</th><th>P</th>
    <th>CT</th><th>TAT</th><th>WT</th><th>RT</th></tr></table>`;
  let tbl = wrap.querySelector("table");
  procs.forEach(p => {
    avgCT+=p.ct; avgTAT+=p.tat; avgWT+=p.wt; avgRT+=p.rt;
    let row = tbl.insertRow();
    row.innerHTML = `<td>${p.id}</td><td>${p.arrival}</td><td>${p.burst}</td>
      <td>${p.priority}</td><td>${p.ct}</td><td>${p.tat}</td>
      <td>${p.wt}</td><td>${p.rt}</td>`;
  });
  let n=procs.length;
  let row = tbl.insertRow();
  row.innerHTML = `<td colspan="4"><b>Average</b></td>
    <td>${(avgCT/n).toFixed(2)}</td>
    <td>${(avgTAT/n).toFixed(2)}</td>
    <td>${(avgWT/n).toFixed(2)}</td>
    <td>${(avgRT/n).toFixed(2)}</td>`;

  // Chart.js
  const ctx = document.getElementById("chartCanvas");
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: procs.map(p => p.id),
      datasets: [
        { label:"CT", data:procs.map(p=>p.ct), backgroundColor:"#60a5fa" },
        { label:"TAT", data:procs.map(p=>p.tat), backgroundColor:"#7dd3fc" },
        { label:"WT", data:procs.map(p=>p.wt), backgroundColor:"#fbbf24" },
        { label:"RT", data:procs.map(p=>p.rt), backgroundColor:"#f87171" }
      ]
    },
    options: { responsive:true, plugins:{ legend:{ position:"bottom" } } }
  });
}

const processForm = document.getElementById("processForm");
const resultsTable = document.querySelector("#resultsTable tbody");
const ganttChart = document.getElementById("ganttChart");
const runBtn = document.getElementById("runBtn");

let processes = [];

processForm.addEventListener("submit", e => {
  e.preventDefault();
  const pid = document.getElementById("pid").value;
  const arrival = parseInt(document.getElementById("arrival").value);
  const burst = parseInt(document.getElementById("burst").value);
  const priority = parseInt(document.getElementById("priority").value);

  processes.push({ pid, arrival, burst, priority, remaining: burst });
  alert(`Process ${pid} added!`);
  processForm.reset();
});

runBtn.addEventListener("click", () => {
  const algo = document.getElementById("algorithm").value;
  const quantum = parseInt(document.getElementById("quantum").value);
  runScheduling(algo, quantum);
});

function runScheduling(algo, quantum) {
  let timeline = [];
  let proc = JSON.parse(JSON.stringify(processes));
  let currentTime = 0;
  let completed = [];

  if (algo === "FCFS") proc.sort((a, b) => a.arrival - b.arrival);
  if (algo === "SJF") proc.sort((a, b) => a.burst - b.burst || a.arrival - b.arrival);
  if (algo === "PRIORITY") proc.sort((a, b) => a.priority - b.priority || a.arrival - b.arrival);

  if (algo === "FCFS" || algo === "SJF" || algo === "PRIORITY") {
    proc.forEach(p => {
      currentTime = Math.max(currentTime, p.arrival);
      p.start = currentTime;
      p.ct = currentTime + p.burst;
      p.tat = p.ct - p.arrival;
      p.wt = p.tat - p.burst;
      p.rt = p.start - p.arrival;
      currentTime = p.ct;
      timeline.push({ pid: p.pid, start: p.start, end: p.ct });
      completed.push(p);
    });
  } else if (algo === "SRTF") {
    let ready = [];
    while (proc.length > 0 || ready.length > 0) {
      proc = proc.filter(p => {
        if (p.arrival <= currentTime) {
          ready.push(p);
          return false;
        }
        return true;
      });
      if (ready.length === 0) {
        currentTime++;
        continue;
      }
      ready.sort((a, b) => a.remaining - b.remaining);
      let p = ready[0];
      if (!p.start) p.start = currentTime;
      p.remaining--;
      currentTime++;
      timeline.push({ pid: p.pid, start: currentTime - 1, end: currentTime });
      if (p.remaining === 0) {
        p.ct = currentTime;
        p.tat = p.ct - p.arrival;
        p.wt = p.tat - p.burst;
        p.rt = p.start - p.arrival;
        completed.push(p);
        ready.shift();
      }
    }
  } else if (algo === "RR") {
    let queue = [];
    proc.sort((a, b) => a.arrival - b.arrival);
    currentTime = proc[0].arrival;
    queue.push(proc.shift());
    while (queue.length > 0) {
      let p = queue.shift();
      if (!p.start) p.start = currentTime;
      let exec = Math.min(quantum, p.remaining);
      timeline.push({ pid: p.pid, start: currentTime, end: currentTime + exec });
      currentTime += exec;
      p.remaining -= exec;
      proc = proc.filter(pr => {
        if (pr.arrival <= currentTime) {
          queue.push(pr);
          return false;
        }
        return true;
      });
      if (p.remaining > 0) {
        queue.push(p);
      } else {
        p.ct = currentTime;
        p.tat = p.ct - p.arrival;
        p.wt = p.tat - p.burst;
        p.rt = p.start - p.arrival;
        completed.push(p);
      }
    }
  }

  renderResults(completed);
  renderGantt(timeline);
}

function renderResults(completed) {
  resultsTable.innerHTML = "";
  let avgCT = 0, avgTAT = 0, avgWT = 0, avgRT = 0;

  completed.forEach(p => {
    avgCT += p.ct;
    avgTAT += p.tat;
    avgWT += p.wt;
    avgRT += p.rt;

    resultsTable.innerHTML += `<tr>
      <td>${p.pid}</td>
      <td>${p.arrival}</td>
      <td>${p.burst}</td>
      <td>${p.ct}</td>
      <td>${p.tat}</td>
      <td>${p.wt}</td>
      <td>${p.rt}</td>
    </tr>`;
  });

  let n = completed.length;
  document.getElementById("avgCT").innerText = `Average Completion Time: ${(avgCT/n).toFixed(2)}`;
  document.getElementById("avgTAT").innerText = `Average Turnaround Time: ${(avgTAT/n).toFixed(2)}`;
  document.getElementById("avgWT").innerText = `Average Waiting Time: ${(avgWT/n).toFixed(2)}`;
  document.getElementById("avgRT").innerText = `Average Response Time: ${(avgRT/n).toFixed(2)}`;
}

function renderGantt(timeline) {
  ganttChart.innerHTML = "";
  const colors = {};
  let colorPool = ["#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6", "#bcf60c", "#fabebe"];
  let colorIndex = 0;

  timeline.forEach(block => {
    if (!colors[block.pid]) {
      colors[block.pid] = colorPool[colorIndex % colorPool.length];
      colorIndex++;
    }
    const div = document.createElement("div");
    div.className = "gantt-block";
    div.style.background = colors[block.pid];
    div.style.flexBasis = `${(block.end - block.start) * 40}px`;
    div.innerText = block.pid;
    const span = document.createElement("span");
    span.innerText = block.end;
    div.appendChild(span);
    ganttChart.appendChild(div);
  });
}

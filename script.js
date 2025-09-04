let processes = [];
let colors = {};
let chartInstance = null;

// Generate distinct colors
function getColor(id) {
  if (!colors[id]) {
    const hue = Object.keys(colors).length * 137 % 360;
    colors[id] = `hsl(${hue},70%,50%)`;
  }
  return colors[id];
}

// Add process
document.getElementById("procForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = document.getElementById("pName").value.trim();
  const arrival = parseInt(document.getElementById("pArrival").value);
  const burst = parseInt(document.getElementById("pBurst").value);
  const priority = parseInt(document.getElementById("pPriority").value);

  if (processes.some(p => p.name === name)) {
    alert("Process ID must be unique!");
    return;
  }

  processes.push({ name, arrival, burst, priority });
  renderProcList();
  e.target.reset();
});

// Render process list
function renderProcList() {
  const list = document.getElementById("procList");
  if (processes.length === 0) {
    list.innerHTML = "<p>No processes added.</p>";
    return;
  }

  let html = "<table><tr><th>ID</th><th>Arrival</th><th>Burst</th><th>Priority</th></tr>";
  processes.forEach(p => {
    html += `<tr><td>${p.name}</td><td>${p.arrival}</td><td>${p.burst}</td><td>${p.priority}</td></tr>`;
  });
  html += "</table>";
  list.innerHTML = html;
}

// Clear processes
document.getElementById("clearAll").addEventListener("click", () => {
  processes = [];
  renderProcList();
});

// Reset all
document.getElementById("resetBtn").addEventListener("click", () => {
  processes = [];
  colors = {};
  document.getElementById("gantt").innerHTML = "";
  document.getElementById("timeMarkers").innerHTML = "";
  document.getElementById("stats").innerHTML = "";
  if (chartInstance) chartInstance.destroy();
  renderProcList();
});

// Run scheduling
document.getElementById("runBtn").addEventListener("click", () => {
  const algo = document.getElementById("algorithm").value;
  const quantum = parseInt(document.getElementById("quantum").value);

  let schedule = [];
  if (algo === "fcfs") schedule = fcfs();
  else if (algo === "sjf-np") schedule = sjfNP();
  else if (algo === "srtf") schedule = srtf();
  else if (algo === "rr") schedule = roundRobin(quantum);
  else if (algo === "priority") schedule = priorityNP();

  drawGanttChart(schedule);
  computeStats(schedule);
});

// Toggle quantum field
document.getElementById("algorithm").addEventListener("change", e => {
  document.getElementById("quantumRow").classList.toggle("hidden", e.target.value !== "rr");
});

// Scheduling Algorithms
function fcfs() {
  let time = 0, result = [];
  let sorted = [...processes].sort((a,b)=>a.arrival-b.arrival);
  sorted.forEach(p=>{
    if (time < p.arrival) time = p.arrival;
    result.push({name:p.name,start:time,end:time+p.burst});
    time+=p.burst;
  });
  return result;
}

function sjfNP() {
  let time=0, result=[], done=[];
  let ready=[];
  while(done.length<processes.length){
    processes.filter(p=>!done.includes(p)&&p.arrival<=time).forEach(p=>{
      if(!ready.includes(p)) ready.push(p);
    });
    if(ready.length===0){time++;continue;}
    ready.sort((a,b)=>a.burst-b.burst);
    let p=ready.shift();
    result.push({name:p.name,start:time,end:time+p.burst});
    time+=p.burst;
    done.push(p);
  }
  return result;
}

function srtf() {
  let time=0, result=[], procs=processes.map(p=>({...p,rem:p.burst,first:null}));
  let running=null;
  while(procs.some(p=>p.rem>0)){
    let ready=procs.filter(p=>p.arrival<=time&&p.rem>0);
    if(ready.length===0){time++;continue;}
    ready.sort((a,b)=>a.rem-b.rem);
    let p=ready[0];
    if(running!==p){
      if(running) result[result.length-1].end=time;
      result.push({name:p.name,start:time});
      running=p;
    }
    if(p.first===null) p.first=time;
    p.rem--;
    time++;
  }
  result[result.length-1].end=time;
  return result;
}

function roundRobin(q) {
  let time=0,result=[];
  let queue=[...processes].sort((a,b)=>a.arrival-b.arrival).map(p=>({...p,rem:p.burst}));
  let ready=[];
  while(queue.length>0||ready.length>0){
    while(queue.length>0&&queue[0].arrival<=time){
      ready.push(queue.shift());
    }
    if(ready.length===0){time++;continue;}
    let p=ready.shift();
    let start=time;
    let exec=Math.min(q,p.rem);
    time+=exec;
    p.rem-=exec;
    result.push({name:p.name,start:start,end:time});
    while(queue.length>0&&queue[0].arrival<=time){
      ready.push(queue.shift());
    }
    if(p.rem>0) ready.push(p);
  }
  return result;
}

function priorityNP() {
  let time=0,result=[],done=[];
  while(done.length<processes.length){
    let ready=processes.filter(p=>!done.includes(p)&&p.arrival<=time);
    if(ready.length===0){time++;continue;}
    ready.sort((a,b)=>a.priority-b.priority);
    let p=ready[0];
    result.push({name:p.name,start:time,end:time+p.burst});
    time+=p.burst;
    done.push(p);
  }
  return result;
}

// Draw Gantt Chart
function drawGanttChart(schedule) {
  const gantt = document.getElementById("gantt");
  const markers = document.getElementById("timeMarkers");
  gantt.innerHTML="";
  markers.innerHTML="";

  schedule.forEach((slot,i)=>{
    const block=document.createElement("div");
    block.className="gantt-block";
    block.style.width=(slot.end-slot.start)*50+"px";
    block.style.backgroundColor=getColor(slot.name);
    block.innerText=slot.name;
    gantt.appendChild(block);

    const start=document.createElement("span");
    start.className="time-marker";
    start.style.width=(slot.end-slot.start)*50+"px";
    start.innerText=slot.start;
    markers.appendChild(start);

    if(i===schedule.length-1){
      const end=document.createElement("span");
      end.className="time-marker";
      end.innerText=slot.end;
      markers.appendChild(end);
    }
  });
}

// Compute Stats
function computeStats(schedule){
  let statsDiv=document.getElementById("stats");
  let table="<table><tr><th>ID</th><th>AT</th><th>BT</th><th>CT</th><th>TAT</th><th>WT</th><th>RT</th></tr>";
  let totals={ct:0,tat:0,wt:0,rt:0};

  processes.forEach(p=>{
    let slots=schedule.filter(s=>s.name===p.name);
    let ct=slots[slots.length-1].end;
    let tat=ct-p.arrival;
    let wt=tat-p.burst;
    let rt=slots[0].start-p.arrival;

    table+=`<tr><td>${p.name}</td><td>${p.arrival}</td><td>${p.burst}</td><td>${ct}</td><td>${tat}</td><td>${wt}</td><td>${rt}</td></tr>`;

    totals.ct+=ct;totals.tat+=tat;totals.wt+=wt;totals.rt+=rt;
  });

  let n=processes.length;
  table+=`</table><p><b>Average CT:</b> ${(totals.ct/n).toFixed(2)} |
           <b>Avg TAT:</b> ${(totals.tat/n).toFixed(2)} |
           <b>Avg WT:</b> ${(totals.wt/n).toFixed(2)} |
           <b>Avg RT:</b> ${(totals.rt/n).toFixed(2)}</p>`;
  statsDiv.innerHTML=table;

  // Draw Chart.js graph
  if(chartInstance) chartInstance.destroy();
  const ctx=document.getElementById("chartCanvas").getContext("2d");
  chartInstance=new Chart(ctx,{
    type:"bar",
    data:{
      labels:processes.map(p=>p.name),
      datasets:[
        {label:"TAT",data:processes.map(p=>{
          let ct=schedule.filter(s=>s.name===p.name).slice(-1)[0].end;
          return ct-p.arrival;
        }),backgroundColor:"rgba(54,162,235,0.7)"},
        {label:"WT",data:processes.map(p=>{
          let slots=schedule.filter(s=>s.name===p.name);
          let ct=slots[slots.length-1].end;
          let tat=ct-p.arrival;
          return tat-p.burst;
        }),backgroundColor:"rgba(255,99,132,0.7)"},
        {label:"RT",data:processes.map(p=>{
          let slots=schedule.filter(s=>s.name===p.name);
          return slots[0].start-p.arrival;
        }),backgroundColor:"rgba(75,192,192,0.7)"}
      ]
    },
    options:{
      responsive:true,
      scales:{y:{beginAtZero:true}}
    }
  });
}

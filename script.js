const processes = [];
const colors = {};

document.getElementById("processForm").addEventListener("submit", e => {
  e.preventDefault();
  const pid = document.getElementById("pid").value;
  const at = parseInt(document.getElementById("arrival").value);
  const bt = parseInt(document.getElementById("burst").value);
  const pr = parseInt(document.getElementById("priority").value);

  processes.push({ pid, at, bt, pr });
  document.getElementById("processForm").reset();
});

document.getElementById("runBtn").addEventListener("click", () => {
  const algo = document.getElementById("algorithm").value;
  const quantum = parseInt(document.getElementById("quantum").value);
  runScheduling(algo, quantum);
});

function runScheduling(algo, quantum) {
  const procs = processes.map(p => ({ ...p }));
  let timeline = [];

  if (algo === "FCFS") timeline = fcfs(procs);
  else if (algo === "SJF") timeline = sjf(procs);
  else if (algo === "SRTF") timeline = srtf(procs);
  else if (algo === "PRIORITY") timeline = priority(procs);
  else if (algo === "RR") timeline = roundRobin(procs, quantum);

  renderResults(procs);
  renderGantt(timeline);
}

function fcfs(procs) {
  procs.sort((a,b)=> a.at-b.at);
  let time=0; const timeline=[];
  procs.forEach(p=>{
    if(time<p.at) time=p.at;
    p.start=(time);
    time+=p.bt;
    p.ct=time;
    p.tat=p.ct-p.at;
    p.wt=p.tat-p.bt;
    p.rt=p.start-p.at;
    timeline.push({pid:p.pid, start:p.start, end:p.ct});
  });
  return timeline;
}

function sjf(procs) {
  let time=0, done=0, n=procs.length, timeline=[];
  const completed=[];
  while(done<n){
    const available=procs.filter(p=>!p.ct && p.at<=time);
    if(available.length===0){ time++; continue;}
    available.sort((a,b)=>a.bt-b.bt);
    const p=available[0];
    p.start=time;
    time+=p.bt;
    p.ct=time;
    p.tat=p.ct-p.at;
    p.wt=p.tat-p.bt;
    p.rt=p.start-p.at;
    timeline.push({pid:p.pid,start:p.start,end:p.ct});
    done++;
  }
  return timeline;
}

function srtf(procs){
  let time=0,completed=0,n=procs.length;
  procs.forEach(p=>p.remaining=p.bt);
  const timeline=[];
  while(completed<n){
    const available=procs.filter(p=>p.at<=time && p.remaining>0);
    if(available.length===0){time++;continue;}
    available.sort((a,b)=>a.remaining-b.remaining);
    const p=available[0];
    if(p.start===undefined) p.start=time;
    time++;
    p.remaining--;
    if(p.remaining===0){
      p.ct=time;
      p.tat=p.ct-p.at;
      p.wt=p.tat-p.bt;
      p.rt=p.start-p.at;
      completed++;
    }
    if(timeline.length===0 || timeline[timeline.length-1].pid!==p.pid){
      timeline.push({pid:p.pid,start:time-1,end:time});
    }else{
      timeline[timeline.length-1].end=time;
    }
  }
  return timeline;
}

function priority(procs){
  let time=0,done=0,n=procs.length,timeline=[];
  while(done<n){
    const available=procs.filter(p=>!p.ct && p.at<=time);
    if(available.length===0){time++;continue;}
    available.sort((a,b)=>a.pr-b.pr);
    const p=available[0];
    p.start=time;
    time+=p.bt;
    p.ct=time;
    p.tat=p.ct-p.at;
    p.wt=p.tat-p.bt;
    p.rt=p.start-p.at;
    timeline.push({pid:p.pid,start:p.start,end:p.ct});
    done++;
  }
  return timeline;
}

function roundRobin(procs, quantum){
  let time=0, queue=[],timeline=[],completed=0,n=procs.length;
  procs.forEach(p=>p.remaining=p.bt);
  procs.sort((a,b)=>a.at-b.at);
  queue.push(procs[0]);
  let idx=1;
  while(completed<n){
    if(queue.length===0 && idx<n && procs[idx].at>time){
      time=procs[idx].at;
      queue.push(procs[idx++]);
    }
    const p=queue.shift();
    if(p.start===undefined) p.start=time;
    const exec=Math.min(quantum,p.remaining);
    timeline.push({pid:p.pid,start:time,end:time+exec});
    time+=exec;
    p.remaining-=exec;
    if(p.remaining===0){
      p.ct=time;
      p.tat=p.ct-p.at;
      p.wt=p.tat-p.bt;
      p.rt=p.start-p.at;
      completed++;
    }
    while(idx<n && procs[idx].at<=time){ queue.push(procs[idx++]); }
    if(p.remaining>0) queue.push(p);
  }
  return timeline;
}

function renderResults(procs){
  const tbody=document.querySelector("#resultsTable tbody");
  tbody.innerHTML=\"\";
  let totalCT=0,totalTAT=0,totalWT=0,totalRT=0;
  procs.forEach(p=>{
    totalCT+=p.ct; totalTAT+=p.tat; totalWT+=p.wt; totalRT+=p.rt;
    const row=`<tr>
      <td>${p.pid}</td>
      <td>${p.at}</td>
      <td>${p.bt}</td>
      <td>${p.ct}</td>
      <td>${p.tat}</td>
      <td>${p.wt}</td>
      <td>${p.rt}</td>
    </tr>`;
    tbody.innerHTML+=row;
  });
  document.getElementById(\"avgCT\").innerText=`Average Completion Time: ${(totalCT/procs.length).toFixed(2)}`;
  document.getElementById(\"avgTAT\").innerText=`Average Turnaround Time: ${(totalTAT/procs.length).toFixed(2)}`;
  document.getElementById(\"avgWT\").innerText=`Average Waiting Time: ${(totalWT/procs.length).toFixed(2)}`;
  document.getElementById(\"avgRT\").innerText=`Average Response Time: ${(totalRT/procs.length).toFixed(2)}`;
}

function renderGantt(timeline){
  const gantt=document.getElementById(\"ganttChart\");
  gantt.innerHTML=\"\";
  timeline.forEach(block=>{
    if(!colors[block.pid]) colors[block.pid]='#'+Math.floor(Math.random()*16777215).toString(16);
    const div=document.createElement(\"div\");
    div.className=\"gantt-block\";
    div.style.background=colors[block.pid];
    div.style.flex=`${block.end-block.start}`;
    div.innerText=block.pid;
    const time=document.createElement(\"div\");
    time.className=\"gantt-time\";
    time.innerText=block.start;
    div.appendChild(time);
    gantt.appendChild(div);
  });
  // Add final time
  if(timeline.length>0){
    const end=document.createElement(\"div\");
    end.className=\"gantt-time\";
    end.style.position=\"relative\";
    end.style.left=\"-10px\";
    end.innerText=timeline[timeline.length-1].end;
    gantt.appendChild(end);
  }
}

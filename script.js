// ---------- Utilities ----------
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function genColor(i, total){
  const hue = (i * 360/Math.max(total, 6)) % 360;
  return `hsl(${hue} 70% 60%)`;
}

// ---------- Data helpers ----------
function readProcesses(){
  return $$('#ptable tbody tr').map(tr=>{
    const cells = tr.querySelectorAll('td');
    return {
      pid: cells[0].querySelector('input').value.trim(),
      arrival: parseInt(cells[1].querySelector('input').value),
      burst: parseInt(cells[2].querySelector('input').value),
      priority: parseInt(cells[3].querySelector('input').value),
      color: cells[4].querySelector('input').value,
      remaining: parseInt(cells[2].querySelector('input').value)
    };
  });
}

function addRow(pid, at=0, bt=1, pr=1, color="#6aa6ff"){
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" value="${pid}" size="4"></td>
    <td><input type="number" value="${at}" min="0"></td>
    <td><input type="number" value="${bt}" min="1"></td>
    <td><input type="number" value="${pr}" min="1"></td>
    <td><input type="color" value="${color}"></td>
    <td class="row-actions"><button class="ghost del">✕</button></td>
  `;
  tr.querySelector('.del').addEventListener('click', ()=> tr.remove());
  $('#ptable tbody').appendChild(tr);
}

// ---------- Scheduling algorithms ----------
function fcfs(processes){
  processes.sort((a,b)=> a.arrival-b.arrival);
  let t=0, timeline=[];
  processes.forEach(p=>{
    t = Math.max(t, p.arrival);
    p.start = t;
    t += p.burst;
    p.ct = t;
    p.tat = p.ct - p.arrival;
    p.wt = p.tat - p.burst;
    p.rt = p.start - p.arrival;
    timeline.push({pid:p.pid,start:p.start,end:p.ct,color:p.color});
  });
  return {procs: processes, timeline};
}

function sjf(processes){
  let time=0, done=0, n=processes.length, timeline=[];
  let ready=[];
  while(done<n){
    processes.filter(p=> !p.done && p.arrival<=time && !ready.includes(p)).forEach(p=> ready.push(p));
    if(ready.length===0){ time++; continue; }
    ready.sort((a,b)=> a.burst-b.burst);
    let p=ready.shift();
    p.start=time;
    time+=p.burst;
    p.ct=time;
    p.tat=p.ct-p.arrival;
    p.wt=p.tat-p.burst;
    p.rt=p.start-p.arrival;
    p.done=true;
    done++;
    timeline.push({pid:p.pid,start:p.start,end:p.ct,color:p.color});
  }
  return {procs: processes, timeline};
}

function prioritySchedule(processes){
  let time=0, done=0, n=processes.length, timeline=[];
  let ready=[];
  while(done<n){
    processes.filter(p=> !p.done && p.arrival<=time && !ready.includes(p)).forEach(p=> ready.push(p));
    if(ready.length===0){ time++; continue; }
    ready.sort((a,b)=> a.priority-b.priority);
    let p=ready.shift();
    p.start=time;
    time+=p.burst;
    p.ct=time;
    p.tat=p.ct-p.arrival;
    p.wt=p.tat-p.burst;
    p.rt=p.start-p.arrival;
    p.done=true;
    done++;
    timeline.push({pid:p.pid,start:p.start,end:p.ct,color:p.color});
  }
  return {procs: processes, timeline};
}

function srtf(processes){
  let time = Math.min(...processes.map(p=>p.arrival));
  let n = processes.length, done=0;
  let timeline=[], current=null;
  while(done<n){
    let avail=processes.filter(p=>!p.done && p.arrival<=time);
    if(avail.length===0){ time++; continue; }
    avail.sort((a,b)=> a.remaining-b.remaining);
    let p=avail[0];
    if(current!==p){
      if(current && timeline[timeline.length-1].end===time){
        timeline[timeline.length-1].end=time;
      }
      timeline.push({pid:p.pid,start:time,end:time+1,color:p.color});
      if(p.start===undefined) p.start=time;
      current=p;
    }else{
      timeline[timeline.length-1].end++;
    }
    p.remaining--;
    time++;
    if(p.remaining===0){
      p.done=true; done++;
      p.ct=time;
      p.tat=p.ct-p.arrival;
      p.wt=p.tat-p.burst;
      p.rt=p.start-p.arrival;
    }
  }
  return {procs: processes, timeline};
}

function rr(processes, q){
  let time=Math.min(...processes.map(p=>p.arrival)), n=processes.length;
  let queue=[], timeline=[];
  processes.sort((a,b)=> a.arrival-b.arrival);
  while(processes.length>0 || queue.length>0){
    while(processes.length>0 && processes[0].arrival<=time) queue.push(processes.shift());
    if(queue.length===0){ time++; continue; }
    let p=queue.shift();
    if(p.start===undefined) p.start=time;
    let run=Math.min(q, p.remaining);
    timeline.push({pid:p.pid,start:time,end:time+run,color:p.color});
    p.remaining-=run;
    time+=run;
    while(processes.length>0 && processes[0].arrival<=time) queue.push(processes.shift());
    if(p.remaining>0){
      queue.push(p);
    }else{
      p.ct=time;
      p.tat=p.ct-p.arrival;
      p.wt=p.tat-p.burst;
      p.rt=p.start-p.arrival;
    }
  }
  return {procs:[...queue,...processes].concat().filter(p=>p.ct), timeline};
}

// ---------- Rendering ----------
function renderResults(procs){
  const tb=$('#rtable tbody');
  tb.innerHTML='';
  let sumCT=0,sumTAT=0,sumWT=0,sumRT=0;
  procs.forEach(p=>{
    sumCT+=p.ct; sumTAT+=p.tat; sumWT+=p.wt; sumRT+=p.rt;
    tb.innerHTML+=`
      <tr>
        <td>${p.pid}</td>
        <td>${p.arrival}</td>
        <td>${p.burst}</td>
        <td>${p.priority}</td>
        <td>${p.start}</td>
        <td>${p.ct}</td>
        <td>${p.tat}</td>
        <td>${p.wt}</td>
        <td>${p.rt}</td>
      </tr>`;
  });
  const n=procs.length;
  $('#avgCT').textContent=(sumCT/n).toFixed(2);
  $('#avgTAT').textContent=(sumTAT/n).toFixed(2);
  $('#avgWT').textContent=(sumWT/n).toFixed(2);
  $('#throughput').textContent=(n/(Math.max(...procs.map(p=>p.ct)) - Math.min(...procs.map(p=>p.arrival)))).toFixed(2);
}

function renderGantt(timeline){
  $('#gantt').innerHTML='';
  $('#ticks').innerHTML='';
  let scale=parseInt($('#scale').value);
  let maxT=Math.max(...timeline.map(b=>b.end));
  timeline.forEach(b=>{
    const div=document.createElement('div');
    div.className='block';
    div.style.background=b.color;
    div.style.minWidth=(b.end-b.start)*scale+'px';
    div.textContent=b.pid;
    $('#gantt').appendChild(div);
  });
  timeline.forEach(b=>{
    const tick=document.createElement('div');
    tick.className='tick';
    tick.style.minWidth=(b.end-b.start)*scale+'px';
    const label=document.createElement('div');
    label.className='tlabel';
    label.textContent=b.end;
    tick.appendChild(label);
    $('#ticks').appendChild(tick);
  });
}

// ---------- Main compute ----------
function compute(){
  const algo=$('#algo').value;
  let processes=readProcesses();
  if(processes.length===0){ $('#err').textContent="No processes!"; return; }
  $('#err').textContent='';
  let res;
  if(algo==='FCFS') res=fcfs(processes);
  if(algo==='SJF') res=sjf(processes);
  if(algo==='PR') res=prioritySchedule(processes);
  if(algo==='SRTF') res=srtf(processes);
  if(algo==='RR') res=rr(processes, parseInt($('#quantum').value));
  renderResults(res.procs);
  renderGantt(res.timeline);
}

// ---------- Misc ----------
function seedSample(){
  resetAll();
  addRow('P1',0,5,2,genColor(0,6));
  addRow('P2',1,3,1,genColor(1,6));
  addRow('P3',2,8,3,genColor(2,6));
  addRow('P4',3,6,2,genColor(3,6));
}

function resetAll(){
  $('#ptable tbody').innerHTML='';
  $('#rtable tbody').innerHTML='';
  $('#gantt').innerHTML='';
  $('#ticks').innerHTML='';
  $('#metrics .v').forEach?$('#metrics .v').forEach(v=>v.textContent='—'):null;
}

function updateQuantumVisibility(){
  if($('#algo').value==='RR') $('#qField').style.display='block';
  else $('#qField').style.display='none';
}

// ---------- Init ----------
(function(){
  updateQuantumVisibility();
  $('#algo').addEventListener('change', updateQuantumVisibility);
  $('#scale').addEventListener('input', e=> $('#scaleLabel').textContent=e.target.value);
  $('#compute').addEventListener('click', compute);
  $('#addRow').addEventListener('click', ()=>{
    const idx=$$('#ptable tbody tr').length+1;
    addRow('P'+idx,0,1,1,genColor(idx-1,10));
  });
  $('#seed').addEventListener('click', seedSample);
  $('#reset').addEventListener('click', resetAll);
  seedSample();
})();

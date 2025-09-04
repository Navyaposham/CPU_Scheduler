// Utility and color settings
const COLORS = ["#72c8fa","#6ee974","#f9d464","#fc8a7a","#dcc6f3","#f4a460","#01cdfe","#b6ff6a","#ffa3a3","#c9a5ff"];
function getColor(idx) { return COLORS[idx%COLORS.length]; }

document.getElementById("algorithm").addEventListener('change', function() {
    const showQuantum = this.value === "rr";
    document.getElementById("quantum-label").style.display = showQuantum ? "inline" : "none";
    document.getElementById("quantum").style.display = showQuantum ? "inline" : "none";
});

// Dynamically generate inputs
function generateInputs() {
    const num = Number(document.getElementById("num-procs").value);
    let html = `<table><tr>
    <th>Process ID</th>
    <th>Arrival Time</th>
    <th>Burst Time</th>
    <th${document.getElementById("algorithm").value=='priority'?'>Priority':' style="display:none;">Priority'}</th>
    </tr>`;
    for(let i=1;i<=num;i++){
        html+=`<tr>
        <td>P${i}</td>
        <td><input type="number" id="arrival${i}" min="0" value="${i-1}"></td>
        <td><input type="number" id="burst${i}" min="1" value="${Math.max(1,(i+2)%7)}"></td>
        <td${document.getElementById("algorithm").value=='priority'?'':' style="display:none;"'}>
            <input type="number" id="priority${i}" min="1" value="${i}">
        </td>
        </tr>`;
    }
    html+="</table>";
    document.getElementById("process-data").innerHTML = html;
}

// Main simulation runner
function runScheduling() {
    const num = Number(document.getElementById("num-procs").value);
    const algorithm = document.getElementById("algorithm").value;
    const quantum = Number(document.getElementById("quantum").value)||2;
    let processList = [];
    for(let i=1;i<=num;i++){
        processList.push({
            pid: `P${i}`,
            arrival: Number(document.getElementById(`arrival${i}`).value),
            burst: Number(document.getElementById(`burst${i}`).value),
            originalBurst: Number(document.getElementById(`burst${i}`).value),
            remaining: Number(document.getElementById(`burst${i}`).value),
            completed: false,
            priority: document.getElementById(`priority${i}`)?
                Number(document.getElementById(`priority${i}`).value):1,
            color: getColor(i-1),
            startTime: null
        });
    }
    let result;
    if(algorithm==="fcfs") result = simulateFCFS(processList);
    else if(algorithm==="sjf") result = simulateSJF(processList);
    else if(algorithm==="rr") result = simulateRR(processList,quantum);
    else if(algorithm==="priority") result = simulatePriority(processList);
    else if(algorithm==="srtf") result = simulateSRTF(processList);
    showResults(result,algorithm);
}

// Algorithm implementations
function simulateFCFS(plist) {
    let gantt=[], time=0, stats=[];
    plist.sort((a,b)=>a.arrival-b.arrival);
    for(const p of plist){
        if(time<p.arrival) time = p.arrival;
        p.startTime = time;
        gantt.push({pid:p.pid, from: time, to: time+p.burst, color:p.color});
        stats.push({pid:p.pid, arrival:p.arrival, burst:p.burst, ct:time+p.burst,
            tat:time+p.burst-p.arrival, wt:time-p.arrival,
            rt:time-p.arrival // FCFS Response at start
        });
        time += p.burst;
    }
    return {stats,gantt};
}
function simulateSJF(plist) {
    let gantt=[], time=0, done=0, stats=[], n=plist.length;
    let ready=[];
    let seen={}, startMap={};
    while(done<n){
        ready = plist.filter((p)=>!p.completed && p.arrival<=time);
        if(ready.length==0) {
            time++;
            continue;
        }
        ready.sort((a,b)=>a.burst-b.burst);
        const p = ready;
        p.startTime = time;
        gantt.push({pid:p.pid, from: time, to: time+p.burst, color:p.color});
        stats.push({pid:p.pid, arrival:p.arrival, burst:p.burst, ct:time+p.burst,
            tat:time+p.burst-p.arrival, wt:time-p.arrival, rt:time-p.arrival
        });
        time += p.burst;
        p.completed=true;
        done++;
    }
    return {stats,gantt};
}
function simulatePriority(plist){
    let gantt=[], time=0, done=0, stats=[], n=plist.length;
    while(done<n){
        let ready = plist.filter(p=>!p.completed && p.arrival<=time);
        if(ready.length==0){time++;continue;}
        ready.sort((a,b)=>a.priority-b.priority);
        let p = ready;
        p.startTime = time;
        gantt.push({pid:p.pid, from:time, to:time+p.burst, color:p.color});
        stats.push({pid:p.pid,arrival:p.arrival, burst:p.burst, ct:time+p.burst, tat:time+p.burst-p.arrival, wt:time-p.arrival, rt:time-p.arrival});
        time+=p.burst; p.completed=true; done++;
    }
    return {stats,gantt};
}
function simulateRR(plist, q){
    let gantt=[], time=0, done=0, n=plist.length, stats = [], queue = [];
    let rem = plist.map(p=>({...p}));
    let firstResponse={};
    while(done<n){
        // fetch new arrivals
        for(let i=0;i<n;i++) if(rem[i].arrival==time) queue.push(rem[i]);
        if(queue.length==0){
            time++;
            continue;
        }
        let p=queue.shift();
        if(firstResponse[p.pid]===undefined) firstResponse[p.pid]=time-p.arrival;
        let exec = Math.min(q,p.remaining);
        gantt.push({pid:p.pid,from:time,to:time+exec,color:p.color});
        p.remaining-=exec; time+=exec;
        for(let i=0;i<n;i++){
            if(rem[i].arrival>p.arrival && rem[i].arrival<=time && !rem[i].completed) queue.push(rem[i]);
        }
        if(p.remaining>0) queue.push(p);
        else{
            p.completed=true;done++;
            stats.push({pid:p.pid,arrival:p.arrival,burst:p.originalBurst, ct:time,
                tat:time-p.arrival, wt:time-p.arrival-p.originalBurst, rt:firstResponse[p.pid]
            });
        }
    }
    return {stats,gantt};
}
function simulateSRTF(plist){
    let gantt=[], time = 0, done = 0, n = plist.length, stats = [], queue = [];
    let rem = plist.map(p=>({...p}));
    let lastExec = {}, firstResponse = {};
    while(done<n){
        queue = rem.filter(p=>!p.completed&&p.arrival<=time&&p.remaining>0);
        if(queue.length==0) {time++;continue;}
        queue.sort((a,b)=>a.remaining-b.remaining);
        let p = queue;
        if(firstResponse[p.pid]===undefined) firstResponse[p.pid]=time-p.arrival;
        let dur=1;
        gantt.push({pid:p.pid,from:time,to:time+dur,color:p.color});
        p.remaining-=dur; time+=dur;
        if(p.remaining==0){
            p.completed=true; done++;
            stats.push({pid:p.pid,arrival:p.arrival, burst:p.originalBurst, ct:time,
                tat:time-p.arrival, wt:time-p.arrival-p.originalBurst, rt:firstResponse[p.pid]
            });
        }
    }
    // Merge same-process consecutive gantt segments
    let gmerge=[];
    for(let i=0;i<gantt.length;i++){
        if(gmerge.length>0 && gmerge[gmerge.length-1].pid==gantt[i].pid && gmerge[gmerge.length-1].to==gantt[i].from){
            gmerge[gmerge.length-1].to=gantt[i].to;
        }else{
            gmerge.push({...gantt[i]});
        }
    }
    return {stats,gantt:gmerge};
}

// Render results and stats
function showResults({stats,gantt},algorithm){
    let colClass = {
      fcfs:"process-fcfs", sjf:"process-sjf", rr:"process-rr",
      priority:"process-priority", srtf:"process-srtf"
    };
    let html = `<table><tr><th>PID</th><th>Arrival</th><th>Burst</th>
    ${algorithm==='priority'?'<th>Priority</th>':''}
    <th>CT</th><th>TAT</th><th>WT</th><th>RT</th></tr>`;
    let sum_ct=0, sum_tat=0, sum_wt=0;
    for(const p of stats){
        html+=`<tr class="${colClass[algorithm]}">
            <td>${p.pid}</td>
            <td>${p.arrival}</td>
            <td>${p.burst}</td>
            ${algorithm==='priority'?`<td>${p.priority||''}</td>`:''}
            <td>${p.ct}</td>
            <td>${p.tat}</td>
            <td>${p.wt}</td>
            <td>${p.rt}</td>
        </tr>`;
        sum_ct+=p.ct; sum_tat+=p.tat; sum_wt+=p.wt;
    }
    html+=`</table>`;
    document.getElementById("result-table").innerHTML = html;
    // draw Gantt
    drawGanttChart(gantt,algorithm);
    // stats
    let avg_ct = +(sum_ct/stats.length).toFixed(2),
        avg_tat = +(sum_tat/stats.length).toFixed(2),
        avg_wt = +(sum_wt/stats.length).toFixed(2),
        min_rt = Math.min(...stats.map(p=>p.rt)),
        max_rt = Math.max(...stats.map(p=>p.rt));
    document.getElementById("stats").innerHTML = `
    <ul>
        <li>Average Completion Time (CT): <span class="highlight">${avg_ct}</span></li>
        <li>Average Turn Around Time (TAT): <span class="highlight">${avg_tat}</span></li>
        <li>Average Waiting Time (WT): <span class="highlight">${avg_wt}</span></li>
        <li>Response Time range: <span class="highlight">${min_rt}...${max_rt}</span></li>
    </ul>`;
    drawAvgChart(avg_ct,avg_tat);
}

// Simple Gantt chart
function drawGanttChart(gantt,algorithm){
    const canvas = document.getElementById("gantt");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let start = Math.min(...gantt.map(g=>g.from)), end = Math.max(...gantt.map(g=>g.to));
    let px_per_unit = canvas.width/(end-start+1);
    gantt.forEach((seg,i)=>{
        ctx.fillStyle=seg.color;
        let x = (seg.from-start)*px_per_unit;
        let w = (seg.to-seg.from)*px_per_unit;
        ctx.fillRect(x,20,w,30);
        ctx.strokeRect(x,20,w,30);
        ctx.fillStyle="#222";
        ctx.font="16px Arial";
        ctx.fillText(seg.pid,x+3,40);
        ctx.font="12px Arial";
        ctx.fillText(seg.from,x,60);
        ctx.fillText(seg.to,x+w-25,60);
    });
}

// Avg TAT/CT chart
function drawAvgChart(avg_ct,avg_tat){
    let canvas = document.getElementById("avg-chart");
    let ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="#72c8fa";
    ctx.fillRect(50,80,70,-avg_ct*10);
    ctx.fillStyle="#fc8a7a";
    ctx.fillRect(180,80,70,-avg_tat*10);
    ctx.fillStyle="#333";
    ctx.font='15px Arial';
    ctx.fillText('Avg CT',50,100);
    ctx.fillText('Avg TAT',180,100);
    ctx.font='13px Arial';
    ctx.fillText(avg_ct,80,75-avg_ct*10);
    ctx.fillText(avg_tat,210,75-avg_tat*10);
}

/* Display recorded evidence. No scorer, interpolation, or persistence writes. */
(function(root){
  const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  function decimalSum(values){
    const parts=values.map(value=>{
      const [m,e='0']=String(value).toLowerCase().split('e'),[a,b='']=m.split('.');
      let n=BigInt(a+b),s=b.length-Number(e);
      if(s<0){n*=10n**BigInt(-s);s=0;}return {n,s};
    });
    const scale=Math.max(0,...parts.map(p=>p.s));
    let n=parts.reduce((v,p)=>v+p.n*10n**BigInt(scale-p.s),0n),negative=n<0n;
    if(negative)n=-n;
    let s=n.toString().padStart(scale+1,'0');
    if(scale)s=s.slice(0,-scale)+'.'+s.slice(-scale);
    return (negative&&n?'-':'')+s.replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
  }
  const labels={'Pregame context carried into play':'Pregame context','Underdog won outright':'Underdog victory','Erased a large deficit':'Comeback','Recent late lead change':'Late lead change','Sustained competitive game':'Sustained competitiveness','Big win-chance swing':'Win-probability swing','Current Tension':'Current competitiveness','Generic Leverage':'Game-time urgency'};
  function calculationIdentity(game){return JSON.stringify([game.sport,String(game.id),game.state,game.modelVersion,game.score,game.baseScore,game.factors?.map(f=>[f.label,f.points]),game.live?.bonus,game.momentumPoints,game.trajectoryScoring?.adjustment,game.teams?.map(t=>t[2]),game.liveRawStatus?.period,game.liveRawStatus?.displayClock]);}
  function calculation(game){
    if(game.summaryLifecycleRejected||game.scoringHistoryRejected||game.staleEnrichment)return null;
    let c=game.scoreCalculation;
    if(c&&(c.total!==game.score||c.state!==game.state||c.modelVersion!==game.modelVersion || c.identity && c.identity!==calculationIdentity(game)))return null;
    if(!c){
      // Older additive records need no inferred adjustment. Anything else fails closed.
      if(game.scoringPartial||game.live?.bonus||!game.factors?.length)return null;
      c={rows:game.factors.map(f=>({label:f.label,points:String(f.points),kind:'factor'})),total:game.score};
    }
    if(!Array.isArray(c.rows)||!c.rows.length||c.rows.some(r=>!r.label||!Number.isFinite(Number(r.points))||!/^[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?$/i.test(String(r.points))))return null;
    return decimalSum(c.rows.map(r=>r.points))===String(game.score)?c:null;
  }
  function scoringMarkup(game,provided=null){
    const c=calculation(provided?{...game,scoreCalculation:provided}:game);
    if(!c)return '<p class="score-calculation-unavailable">An exact calculation is not available for this saved rating.</p>';
    return `<div class="score-calculation" role="group" aria-label="Rating calculation"><dl>${c.rows.filter(r=>Number(r.points)!==0).map((r,i)=>`<div class="score-calculation-row" data-kind="${escape(r.kind||'factor')}"><dt>${escape(labels[r.label]||r.label)}</dt><dd>${Number(r.points)>0&&i?'+':''}${escape(r.points)}</dd></div>`).join('')}</dl><div class="score-calculation-total"><span>Total</span><strong>${escape(c.total)}</strong></div></div>`;
  }
  function format(game,summary){
    const f=summary?.header?.competitions?.[0]?.format||game.format||{},sport=game.sport;
    const periods=sport==='NCAAB'?(Number(f.regulation?.periods)||2):({NFL:4,CFB:4,NBA:4,NHL:3})[sport];
    const regulation=({NBA:2880,NCAAB:2400,NFL:3600,CFB:3600,NHL:3600,Soccer:5400})[sport];
    const postseason=Number(summary?.header?.season?.type||game.sourceEvent?.season?.type)===3;
    const clock=String(f.overtime?.clock?.displayValue||f.overtime?.duration||'').match(/^(\d+):(\d+)$/);
    const supplied=Number(f.overtime?.durationSeconds||f.overtime?.periodLengthSeconds)||(clock?Number(clock[1])*60+Number(clock[2]):0);
    return {sport,periods,regulation,postseason,regularSeason:Number(summary?.header?.season?.type||game.sourceEvent?.season?.type)===2,shootout:sport==='NHL'&&/shootout|\bSO\b/i.test([game.status,game.live?.phase,game.liveRawStatus?.type?.detail].join(' ')),periodLength:regulation/periods,overtime:supplied|| (sport==='NFL'?(postseason?900:600):sport==='NHL'?(postseason?1200:300):300)};
  }
  function position(period,clock,f){
    period=Number(period);if(!Number.isInteger(period)||period<1)return null;
    if(f.sport==='CFB'&&period>f.periods || f.sport==='NHL'&&period===5&&(f.shootout||f.regularSeason))return null; // Overtime is untimed.
    const value=String(clock??'').trim();
    if(f.sport==='Soccer'){
      const m=value.match(/^(\d+)'?(?:\+(\d+)'?)?$/),c=value.match(/^(\d+):(\d+(?:\.\d+)?)$/);
      return m?(Number(m[1])+Number(m[2]||0))*60:c?Number(c[1])*60+Number(c[2]):null;
    }
    if(!f.periods)return null; // Innings and sets are not elapsed-time estimates.
    const c=value.match(/^(\d+):(\d+(?:\.\d+)?)$/);
    const remaining=c?Number(c[1])*60+Number(c[2]):/^\d+(?:\.\d+)?$/.test(value)?Number(value):null;
    const length=period>f.periods?f.overtime:f.periodLength;
    if(remaining===null||remaining<0||remaining>length||(c&&Number(c[2])>=60))return null;
    return (period>f.periods?f.regulation+(period-f.periods-1)*length:(period-1)*length)+length-remaining;
  }
  function phase(period,clock,f,fallback=''){
    const n=Number(period);
    if(f.sport==='NHL'&&n===5&&(f.shootout||f.regularSeason))return 'Shootout';
    const p=f.periods?(n>f.periods?(n-f.periods===1?'OT':`${n-f.periods}OT`):`${f.sport==='NHL'?'P':f.periods===2?'H':'Q'}${n}`):'';
    return p?[p,clock].filter(Boolean).join(' '):fallback||[f.sport==='MLB'?'Inning':f.sport==='Tennis'?'Set':'Period',period,clock].filter(Boolean).join(' ');
  }
  const timestamp=at=>new Date(at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'});
  function reliable(p){
    return Boolean(p)&&p.ratingKind==='live'&&p.evidenceQuality==='verified'&&!p.invalid&&!p.incomplete&&
      Number.isFinite(p.score)&&p.score>=0&&p.score<=100&&Number.isFinite(p.x)&&Number.isFinite(p.observedAt);
  }
  function comparable(p,previous){
    return reliable(p)&&reliable(previous)&&p.axis===previous.axis;
  }
  // Monotone cubic Hermite geometry: bounded control values cannot overshoot
  // either recorded endpoint. These controls are drawing coordinates, never
  // observations, tooltips, or stored ratings. Equal/reversed clocks stay exact.
  function curve(points,px,py){
    if(!points.length)return '';
    let path=`M ${px(points[0])} ${py(points[0])}`,start=0;
    while(start<points.length-1){
      let end=start;
      while(end+1<points.length&&px(points[end+1])>px(points[end]))end++;
      if(end===start){path+=` L ${px(points[start+1])} ${py(points[start+1])}`;start++;continue;}
      const run=points.slice(start,end+1),xs=run.map(px),ys=run.map(py),h=[],d=[],m=[];
      for(let i=0;i<run.length-1;i++){h[i]=xs[i+1]-xs[i];d[i]=(ys[i+1]-ys[i])/h[i];}
      m[0]=d[0];m[run.length-1]=d.at(-1);
      for(let i=1;i<run.length-1;i++){
        const a=d[i-1],b=d[i],w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];
        m[i]=a*b<=0?0:(w1+w2)/(w1/a+w2/b);
      }
      for(let i=0;i<run.length-1;i++){
        const low=Math.min(ys[i],ys[i+1]),high=Math.max(ys[i],ys[i+1]),bound=y=>Math.max(low,Math.min(high,y));
        path+=` C ${xs[i]+h[i]/3} ${bound(ys[i]+m[i]*h[i]/3)} ${xs[i+1]-h[i]/3} ${bound(ys[i+1]-m[i+1]*h[i]/3)} ${xs[i+1]} ${ys[i+1]}`;
      }
      start=end;
    }
    return path;
  }
  function observations(game,summary,local=[]){
    const f=format(game,summary),records=(summary?.sportsRadarHistory?.snapshots||[]).map((p,i)=>({...p,recordIndex:i,recorded:true}));
    const last=Math.max(-Infinity,...records.map(p=>Number(p.observedAt)));
    if(game.state==='live')for(const [i,p]of local.entries())if(p.state!=='completed'&&p.at>last+5000)records.push({...p,observedAt:p.at,rating:p.score,phaseLabel:p.phase,recordIndex:records.length,local:true});
    // Preserve the provider's observation order, including corrections and duplicates.
    const timed=records.filter(p=>p.state==='live'&&p.evidenceQuality==='verified'&&!p.integrityIssue&&p.rating!=null&&Number.isFinite(Number(p.rating))&&Number(p.rating)>=0&&Number(p.rating)<=100);
    const useGameTime=Boolean(timed.length)&&timed.every(p=>position(p.period,p.clock,f)!==null);
    const axis=useGameTime?'game':'observed';
    const points=records.map(p=>({
      x:useGameTime?position(p.period,p.clock,f):p.observedAt==null?null:Number(p.observedAt),axis,
      score:p.rating==null||p.rating===''?NaN:Number(p.rating),scoreA:p.scoreA,scoreB:p.scoreB,period:p.period,clock:p.clock,
      ratingKind:p.state==='completed'?'final':p.state,observedAt:p.observedAt==null?null:Number(p.observedAt),
      label:phase(p.period,p.clock,f,p.phaseLabel),text:p.local?'Browser observation':'Recorded by Sports Radar',
      modelVersion:p.modelVersion||'legacy',evidenceQuality:p.evidenceQuality,
      incomplete:p.evidenceQuality==='partial',invalid:p.evidenceQuality==='invalid'||p.integrityIssue===true,
      recorded:p.recorded,local:p.local,original:p,
    }));
    return {points,axis,format:f,source:records.length?'recorded snapshots':'unavailable'};
  }
  function timeline(game,summary,local=[],historyRenderer=()=> ''){
    if(game.state==='upcoming')return '<section class="detail-section timeline-section"><h3>Excitement timeline</h3><p class="detail-empty">The chart starts when the game begins.</p></section>';
    const data=observations(game,summary,local),f=data.format;
    const points=data.points.filter(reliable),last=points.at(-1);
    const pending=game.scoringPartial||game.summaryLifecycleRejected||game.scoringHistoryRejected;
    const heading=`<div class="timeline-heading"><h3>Excitement timeline</h3><span class="timeline-key"><i></i> Recorded live ratings</span></div>`;
    const ratings=`<div class="timeline-ratings"><div class="timeline-rating-current"><span>${game.state==='completed'?'Final rating':'Current live rating'}</span><strong>${pending?'Pending':escape(game.score)}</strong><small>${game.state==='completed'?'Whole-game quality':'Watchability now'}</small></div><div class="timeline-rating-last"><span>Last reliable live rating</span><strong>${last?last.score:'—'}</strong><small>${last?escape(last.label):'No reliable live record'}</small></div></div>`;
    const rawHistory=`<details class="timeline-observations"><summary>Original observation history (${data.points.length})</summary><div class="timeline-table-scroll"><table><thead><tr><th>Observed</th><th>Game time</th><th>Rating</th><th>Evidence</th></tr></thead><tbody>${data.points.map(p=>`<tr><td>${Number.isFinite(p.observedAt)?escape(timestamp(p.observedAt)):'Time unavailable'}</td><td>${escape(p.label)}</td><td>${escape(p.score)}</td><td>${escape(p.ratingKind)} · ${escape(p.evidenceQuality||'Legacy, unclassified')}<br><small>${escape(p.modelVersion)}</small></td></tr>`).join('')}</tbody></table></div></details>`;
    const history=historyRenderer(data)+rawHistory;
    if(!points.length)return `<section class="detail-section timeline-section">${heading}${ratings}<p class="detail-empty">Not enough reliable live history to draw the chart. Scoring plays cannot reconstruct recorded ratings.</p>${history}</section>`;
    const events=(summary?.scoringPlays?.length?summary.scoringPlays:(summary?.plays||[]).filter(p=>p.scoringPlay)).map(p=>({
      x:data.axis==='game'?position(p.period?.number??p.period,p.clock?.displayValue,f):Date.parse(p.wallclock||p.occurredAt||''),
      label:phase(p.period?.number??p.period,p.clock?.displayValue,f,p.period?.displayValue),text:p.text||p.shortText||p.type?.text||'Scoring play'
    })).filter(p=>Number.isFinite(p.x));
    const start=data.axis==='game'?0:Math.min(...points.map(p=>p.x));
    const end=Math.max(start+1,data.axis==='game'?f.regulation||0:0,...points.map(p=>p.x),...events.map(p=>p.x));
    const late=data.axis==='game'?Math.max(start,(f.regulation||end)-300):Math.max(start,end-15*60*1000);
    const views=[{key:'full',label:'Full game',start,end}];
    if(late>start&&points.some(p=>p.x>=late))views.push({key:'late',label:data.axis==='game'?'Late game + OT':'Last 15 minutes',start:late,end});
    if(data.axis==='game'&&f.periods&&end>f.regulation)views.push({key:'ot',label:'Overtime',start:f.regulation,end});
    const id=`timeline-${String(game.sport+game.id).replace(/[^\w-]/g,'')}`;
    const helpId=id+'-help';
    const marker=(p,x,y,description,event=false)=>`<g class="timeline-point${event?' timeline-event-marker':''}" data-timeline-explanation="${escape(description)}" role="button" tabindex="0" aria-expanded="false" aria-controls="${helpId}" aria-label="${escape(description)}">${event?`<path d="M ${x} ${y-4} l 4 4 -4 4 -4 -4 Z"/>`:`<circle cx="${x}" cy="${y}" r="${p===last?3.5:2}"/>`}<circle class="timeline-hit-target" cx="${x}" cy="${y}" r="11"/><title>${escape(description)}</title></g>`;
    const chart=(v,mobile=false)=>{
      const width=mobile?360:940,left=34,right=12,top=14,bottom=170;
      const px=p=>left+(p.x-v.start)/(v.end-v.start)*(width-left-right),py=p=>top+(100-p.score)*(bottom-top)/100;
      const visible=points.filter(p=>p.x>=v.start&&p.x<=v.end),shownEvents=events.filter(p=>p.x>=v.start&&p.x<=v.end);
      const path=curve(visible,px,py);
      const guides=[0,25,50,75,100].map(score=>`<line class="timeline-reference" x1="${left}" x2="${width-right}" y1="${py({score})}" y2="${py({score})}"/>${score%50===0?`<text x="25" y="${py({score})+4}" text-anchor="end">${score}</text>`:''}`).join('');
      const ticks=[];
      if(data.axis==='game'&&f.periods){
        for(let n=1;n<=f.periods+Math.ceil(Math.max(0,end-f.regulation)/f.overtime);n++){
          const x=n<=f.periods?(n-1)*f.periodLength:f.regulation+(n-f.periods-1)*f.overtime;
          if(x>=v.start&&x<v.end)ticks.push({x,label:phase(n,'',f)});
        }
        if(v.key==='late')ticks.unshift({x:v.start,label:phase(f.periods,'5:00',f)});
        if(v.key==='ot'){
          const steps=f.overtime>=600?120:60;
          for(let x=v.start+steps;x<v.end;x+=steps)if(!ticks.some(t=>t.x===x))ticks.push({x,label:`${Math.floor((f.overtime-(x-f.regulation)%f.overtime)/60)}:00`});
        }
      }else{
        for(let i=0;i<4;i++){const x=v.start+(v.end-v.start)*i/3;ticks.push({x,label:data.axis==='observed'?new Date(x).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):`${Math.floor(x/60)}′`});}
      }
      const axis=ticks.sort((a,b)=>a.x-b.x).map(t=>`<text x="${px(t)}" y="190" text-anchor="${t.x===v.start?'start':'middle'}">${escape(t.label)}</text>`).join('');
      const periodLabels=[];
      if(data.axis==='observed'){
        let priorPeriod=null,lastLabel=-Infinity;
        for(const p of visible){
          if(p.period===priorPeriod)continue;
          priorPeriod=p.period;
          if(!Number(p.period)||px(p)-lastLabel<(mobile?55:80))continue;
          const label=phase(p.period,'',f,p.original.phaseLabel).replace(/\s*\d+:\d+.*$/,'');
          periodLabels.push(`<text x="${px(p)}" y="${top+12}" text-anchor="start"><title>First recorded observation in this period</title>${escape(label)}</text>`);lastLabel=px(p);
        }
      }
      const groups=new Map();
      for(const [i,p]of visible.entries()){
        // Identical geometry shares a control; every timestamp remains in its description and history.
        const key=p.x+':'+p.score;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({p,i});
      }
      const dots=[...groups.values()].map(group=>{
        const {p,i}=group.at(-1),prior=visible[i-1],next=visible[i+1];
        const important=p===last||!comparable(p,prior)||!comparable(next||{},p)||Math.abs(p.score-(prior?.score??p.score))>=5;
        if(!important)return ''; // The curve passes through every anchor; the original-history table retains each observation.
        const description=`${p.label}. Recorded rating: ${p.score}. ${group.map(({p})=>`${timestamp(p.observedAt)} (${p.evidenceQuality||'legacy evidence unclassified'})`).join('; ')}. ${p===last?'Last reliable live rating.':''}`;
        return marker(p,px(p),py(p),description);
      }).join('');
      const eventGroups=new Map();
      for(const p of shownEvents){if(!eventGroups.has(p.x))eventGroups.set(p.x,[]);eventGroups.get(p.x).push(p);}
      const eventDots=[...eventGroups.values()].map((group,i)=>marker(group[0],px(group[0]),230+(i%2)*14,group.map(p=>`${p.label}: ${p.text}`).join(' • '),true)).join('');
      return `<svg class="timeline-chart ${mobile?'timeline-mobile':'timeline-desktop'}" viewBox="0 0 ${width} 260" role="group" aria-label="Recorded live ratings, ${escape(v.label)}"><g>${guides}<path class="timeline-line" d="${path}"/>${dots}${axis}${periodLabels.join('')}</g><g class="timeline-event-strip"><rect x="${left}" y="207" width="${width-left-right}" height="51" rx="5"/><text x="${left+8}" y="220">SCORING PLAYS</text>${eventDots}</g></svg>`;
    };
    return `<section class="detail-section timeline-section">${heading}${ratings}<div class="timeline-controls" role="group" aria-label="Timeline range">${views.map(v=>`<button type="button" data-timeline-range="${v.key}" aria-pressed="${v.key==='full'}">${v.label}</button>`).join('')}</div>${views.map(v=>`<div class="timeline-view" data-timeline-view="${v.key}"${v.key!=='full'?' hidden':''}>${chart(v)}${chart(v,true)}</div>`).join('')}<p class="timeline-note">The line connects recorded ratings. Scores between observations were not individually recorded.</p><div class="timeline-point-help" id="${helpId}" role="status" aria-live="polite" aria-hidden="true"></div>${history}</section>`;
  }
  const api={calculation,scoringMarkup,decimalSum,format,position,phase,reliable,curve,comparable,observations,timeline};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.SportsRadarGameCenter=api;
})(globalThis);

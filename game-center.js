/* Display recorded evidence. Estimated connections are SVG geometry only.
   No scorer, synthetic observations, or persistence writes. */
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
    return Boolean(p)&&p.ratingKind==='live'&&p.evidenceQuality==='verified'&&!p.invalid&&!p.incomplete&&!p.compatibilityIssue&&
      Number.isFinite(p.score)&&p.score>=0&&p.score<=100&&Number.isFinite(p.x)&&Number.isFinite(p.observedAt);
  }
  function comparable(p,previous){
    return reliable(p)&&reliable(previous)&&p.axis===previous.axis&&p.segment===previous.segment&&
      p.x>previous.x&&p.observedAt>previous.observedAt&&p.modelVersion===previous.modelVersion;
  }
  const numeric=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&
    /^(?:\d+(?:\.\d+)?)$/.test(String(value))&&Number.isFinite(Number(value));
  const ended=p=>/\b(end of|halftime|intermission)\b/i.test(p.original.phaseLabel||'');
  const softReasons=new Set(['ledger-behind-scoreboard','historical-coverage-unavailable','ahead-summary-aggregates-deferred']);
  function integrityFailure(p){
    const r=p.original;
    return p.invalid||p.compatibilityIssue||r.timingUncertain||r.timingIssue||r.liveUpdateRejected||
      r.basketballUpdateRejected||r.summaryLifecycleRejected||r.scoringHistoryRejected||
      ['rejected','revised'].includes(r.observationIntegrity?.status)||
      (r.evidenceReasons!=null&&(!Array.isArray(r.evidenceReasons)||r.evidenceReasons.some(reason=>!softReasons.has(reason))));
  }
  // Canonical phase numbers stay sport-specific. Untimed sports use actual
  // observation timestamps on the x axis, never invented elapsed game time.
  function progression(p,f){
    if(!numeric(p.period)||!Number.isInteger(Number(p.period))||Number(p.period)<1)return {error:'missing-period'};
    const period=Number(p.period),label=String(p.original.phaseLabel||'');
    if(/\b(final|pregame|scheduled)\b/i.test(label))return {error:'conflicting-phase'};
    const named=label.match(/\b([QHP])(\d+)\b/i)||label.match(/\b(\d+)(?:st|nd|rd|th)?\s+(quarter|period|half|set)\b/i);
    if(named){const n=Number(/^\d/.test(named[1])?named[1]:named[2]);if(n!==period)return {error:'conflicting-phase'};}
    const word=label.match(/\b(first|second|third|fourth)\s+(half|quarter|period|set)\b/i);
    if(word&&['first','second','third','fourth'].indexOf(word[1].toLowerCase())+1!==period)return {error:'conflicting-phase'};
    const ot=label.match(/\b(?:(\d+)(?:st|nd|rd|th)?\s*)?(?:OT|overtime)\b/i);
    if(ot&&f.periods&&period!==f.periods+Number(ot[1]||1))return {error:'conflicting-phase'};
    if(/\bhalftime\b/i.test(label)&&period!==(f.periods===2?1:2))return {error:'conflicting-phase'};
    if(f.sport==='MLB'){
      const top=/\btop\b/i.test(label),bottom=/\bbottom\b|\bbot\b/i.test(label);
      if(top===bottom)return {error:'missing-inning-half'};
      const inning=label.match(/\b(?:top|bottom|bot)\s+(?:of\s+)?(?:the\s+)?(\d+)/i);
      if(inning&&Number(inning[1])!==period)return {error:'conflicting-phase'};
      return {order:(period-1)*2+Number(bottom),period,kind:'inning'};
    }
    if(f.sport==='Tennis')return {order:period,period,kind:'set'};
    if(f.sport==='NHL'&&/\bSO\b|shootout/i.test(label)&&!(period===5&&(f.regularSeason||f.shootout)))return {error:'conflicting-phase'};
    if(f.sport==='NHL'&&period>=5&&!f.postseason&&!f.regularSeason&&!f.shootout)return {error:'unknown-overtime-format'};
    if(f.sport==='NHL'&&(f.regularSeason||f.shootout)&&period>5||f.sport==='NFL'&&f.regularSeason&&period>5)return {error:'unsupported-period'};
    if(f.sport==='CFB'&&period>4||f.sport==='NHL'&&period===5&&(f.regularSeason||f.shootout))return {order:period,period,kind:'untimed'};
    const elapsed=position(period,p.clock,f);
    if(elapsed===null)return {error:String(p.clock??'').trim()?'invalid-clock':'missing-clock',order:period,period};
    const zero=/^0+(?:(?::0+(?:\.0+)?)|(?:\.0+))?$/.test(String(p.clock));
    // Preserve the final-period zero safeguard; earlier verified quarter-end
    // dots can connect when the surrounding chronology remains consistent.
    if(zero&&!ended(p)&&period>=f.periods)return {error:'unconfirmed-zero-clock',order:period,period};
    return {order:period,period,elapsed,kind:'clock'};
  }
  function identityFailure(game,summary,p){
    const r=p.original,key=game.sport+':'+game.id;
    for(const value of [summary?.sportsRadarHistory?.gameKey,r.gameKey,r.game_key])if(value!=null&&String(value)!==key)return true;
    for(const value of [r.gameId,r.eventId])if(value!=null&&String(value)!==String(game.id))return true;
    if(r.sport&&r.sport!==game.sport)return true;
    const expected=game.teams?.map(t=>String(t[8]??t[1]));
    for(const teams of [r.teams,summary?.sportsRadarGame?.teams])if(teams&&expected&&
      JSON.stringify(teams.map(t=>String(t[8]??t[1])))!==JSON.stringify(expected))return true;
    const context=summary?.sportsRadarGame;
    return Boolean(context&&(context.id!=null&&String(context.id)!==String(game.id)||context.sport&&context.sport!==game.sport));
  }
  function establishedPhase(point,data,game,summary){
    // A second verified, forward observation corroborates the active phase.
    // A lone transitional zero never establishes a new period.
    const index=data.points.indexOf(point),phase=progression(point,data.format);
    for(const candidate of data.points.slice(index+1)){
      if(candidate.observedAt-point.observedAt>180000||candidate.observedAt<=point.observedAt||!numeric(candidate.original.observedAt)||
        integrityFailure(candidate)||identityFailure(game,summary,candidate)||candidate.ratingKind!=='live'||candidate.modelVersion!==point.modelVersion)return false;
      const next=progression(candidate,data.format);
      if(next.error||next.order!==phase.order)return false;
      if(phase.elapsed!=null&&next.elapsed<phase.elapsed||['scoreA','scoreB'].some(k=>numeric(candidate[k])&&Number(candidate[k])<Number(point[k])))return false;
      if(reliable(candidate)&&candidate.observedAt>point.observedAt&&candidate.modelVersion===point.modelVersion&&
        (phase.elapsed==null||next.elapsed>=phase.elapsed)&&['scoreA','scoreB'].every(k=>numeric(candidate[k])&&Number(candidate[k])>=Number(point[k])))return true;
    }
    return false;
  }
  function connectionReason(game,summary,data,from,to,between){
    const f=data.format,interval=[from,...between,to];
    if(!reliable(from)||!reliable(to))return 'unverified-endpoint';
    if(from.axis!==to.axis)return 'different-axis';
    if(interval.some(p=>identityFailure(game,summary,p)))return 'conflicting-identity';
    if(interval.some(integrityFailure))return 'unresolved-integrity';
    if(interval.some(p=>p.ratingKind!=='live'))return 'non-live-transition';
    if(interval.some(p=>!numeric(p.original.observedAt)))return 'invalid-timestamp';
    if(interval.some((p,i)=>i&&p.observedAt<=interval[i-1].observedAt))return 'timestamp-order';
    if(!from.original.modelVersion||from.modelVersion==='legacy'||interval.some(p=>!p.original.modelVersion||p.modelVersion!==from.modelVersion))return 'model-version';
    if(['scoreA','scoreB'].some(k=>!numeric(from[k])||!numeric(to[k])))return 'missing-team-scores';
    for(const k of ['scoreA','scoreB']){
      let prior=null;
      for(const p of interval){
        if(p[k]==null||p[k]==='')continue;
        if(!numeric(p[k])||!Number.isInteger(Number(p[k])))return 'invalid-team-score';
        if(prior!==null&&Number(p[k])<prior)return 'score-decrease';
        prior=Number(p[k]);
      }
    }
    let previous=null,previousPoint=null,lastOrder=null;
    for(const p of interval){
      const next=progression(p,f);
      if(next.order!=null){
        if(lastOrder!==null&&next.order<lastOrder)return 'phase-reversal';
        if(lastOrder!==null&&next.order>lastOrder+1)return 'unobserved-phase';
        lastOrder=next.order;
      }
      // Absent intermediate metadata is not affirmative contradictory evidence.
      // Both anchors still need a known position and all supplied evidence is checked.
      if(next.error){
        if(p!==from&&p!==to&&['missing-period','missing-clock','missing-inning-half'].includes(next.error)&&
          !(next.error==='missing-period'&&p.original.phaseLabel)){
          if(next.order!=null&&previous&&next.order<previous.order)return 'phase-reversal';
          continue;
        }
        return next.error;
      }
      if(previous){
        if(next.order<previous.order)return 'phase-reversal';
        if(next.order>previous.order+1)return 'unobserved-phase';
        if(next.order===previous.order&&next.elapsed!=null&&previous.elapsed!=null&&next.elapsed<previous.elapsed)return 'clock-reversal';
        if(next.order>previous.order){
          const setWon=f.sport==='Tennis'&&['scoreA','scoreB'].reduce((n,k)=>n+Number(p[k])-Number(previousPoint[k]),0)===1;
          const confirmedEnd=reliable(previousPoint)&&ended(previousPoint)&&!next.error;
          if(next.kind!=='inning'&&!setWon&&!confirmedEnd&&!(reliable(p)&&(p===to||establishedPhase(p,data,game,summary))))return 'unconfirmed-phase-transition';
        }
      }
      previous=next;previousPoint=p;
    }
    const a=progression(from,f),b=progression(to,f);
    // The current snapshot contract has set counts but no ordered tennis
    // games/points. Do not infer within-set events from a rating or wall clock.
    if(f.sport==='Tennis'&&a.order===b.order)return 'missing-tennis-event-order';
    if(f.sport==='Tennis'&&['scoreA','scoreB'].reduce((n,k)=>n+Number(to[k])-Number(from[k]),0)!==b.period-a.period)return 'conflicting-set-score';
    if(to.x<from.x)return 'axis-reversal';
    if(to.x===from.x&&to.score!==from.score)return 'same-clock-changed-rating';
    // Long gaps are visual connections between recorded endpoints, never new history.
    return null;
  }
  function connections(game,summary,data=observations(game,summary)){
    const edges=[];let from=null,between=[];
    for(const point of data.points){
      if(!reliable(point)){if(from)between.push(point);continue;}
      if(from){
        const reason=connectionReason(game,summary,data,from,point,between);
        edges.push({from,to:point,allowed:reason===null,reason,bridged:between.length,coincident:point.x===from.x&&point.score===from.score});
      }
      from=point;between=[];
    }
    return edges;
  }
  // Monotone cubic Hermite geometry: bounded control values cannot overshoot
  // either recorded endpoint. These controls are drawing coordinates, never
  // observations, tooltips, or stored ratings. Equal/reversed clocks start a gap.
  function curve(points,px,py){
    if(!points.length)return '';
    let path=`M ${px(points[0])} ${py(points[0])}`,start=0;
    while(start<points.length-1){
      let end=start;
      while(end+1<points.length&&px(points[end+1])>px(points[end]))end++;
      if(end===start){path+=` M ${px(points[start+1])} ${py(points[start+1])}`;start++;continue;}
      const run=points.slice(start,end+1),xs=run.map(px),ys=run.map(py),h=[],d=[],m=[];
      for(let i=0;i<run.length-1;i++){h[i]=xs[i+1]-xs[i];d[i]=(ys[i+1]-ys[i])/h[i];}
      m[0]=d[0];m[run.length-1]=d.at(-1);
      for(let i=1;i<run.length-1;i++){
        const a=d[i-1],b=d[i],w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];
        m[i]=a*b<=0?0:(w1+w2)/(w1/a+w2/b);
      }
      for(let i=0;i<run.length-1;i++){
        const low=Math.min(ys[i],ys[i+1]),high=Math.max(ys[i],ys[i+1]),bound=y=>Math.max(low,Math.min(high,y));
        const c1=bound(ys[i]+m[i]*h[i]/3),c2=bound(ys[i+1]-m[i+1]*h[i]/3);
        path+=(c2-c1)*(ys[i+1]-ys[i])<0
          ?` L ${xs[i+1]} ${ys[i+1]}`
          :` C ${xs[i]+h[i]/3} ${c1} ${xs[i+1]-h[i]/3} ${c2} ${xs[i+1]} ${ys[i+1]}`;
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
    const finalPeriod=game.sport==='NBA'?4:game.sport==='NCAAB'?2:null;
    for(let i=0;i<records.length;i++){
      const p=records[i];
      if(!finalPeriod||p.state!=='live'||Number(p.period)!==finalPeriod||!/^0+(?:(?::0+(?:\.0+)?)|(?:\.0+))?$/.test(String(p.clock||'')))continue;
      const previous=records[i-1];
      const later=records.slice(i+1).some(next=>next.state==='live'&&Number(next.period)===finalPeriod&&
        Number.isFinite(position(next.period,next.clock,f))&&position(next.period,next.clock,f)<position(p.period,p.clock,f)-2);
      if(later||previous?.state==='live'&&Number(previous.period)<finalPeriod)p.compatibilityIssue=true;
    }
    const timed=records.filter(p=>p.state==='live'&&p.evidenceQuality==='verified'&&!p.integrityIssue&&!p.compatibilityIssue&&p.rating!=null&&Number.isFinite(Number(p.rating))&&Number(p.rating)>=0&&Number(p.rating)<=100);
    const untimedExtra=['CFB','NHL'].includes(game.sport)&&timed.some(p=>Number(p.period)>f.periods&&position(p.period,p.clock,f)===null);
    const useGameTime=!untimedExtra&&Boolean(timed.length)&&timed.some(p=>position(p.period,p.clock,f)!==null);
    const axis=useGameTime?'game':'observed';
    const points=records.map(p=>({
      x:useGameTime?position(p.period,p.clock,f):p.observedAt==null?null:Number(p.observedAt),axis,
      score:p.rating==null||p.rating===''?NaN:Number(p.rating),scoreA:p.scoreA,scoreB:p.scoreB,period:p.period,clock:p.clock,
      ratingKind:p.state==='completed'?'final':p.state,observedAt:p.observedAt==null?null:Number(p.observedAt),
      label:phase(p.period,p.clock,f,p.phaseLabel),text:p.local?'Browser observation':'Recorded by SlateMeter',
      modelVersion:p.modelVersion||'legacy',evidenceQuality:p.evidenceQuality,
      incomplete:p.evidenceQuality==='partial',invalid:p.evidenceQuality==='invalid'||p.integrityIssue===true,
      compatibilityIssue:p.compatibilityIssue===true,
      recorded:p.recorded,local:p.local,original:p,
    }));
    let segment=0,lastEligible=null;
    for(const point of points){
      if(!reliable(point)){segment++;point.segment=segment;continue;}
      if(lastEligible&&(point.x<lastEligible.x||point.observedAt<=lastEligible.observedAt)){
        point.compatibilityIssue=true;segment++;point.segment=segment;continue;
      }
      if(lastEligible&&(point.modelVersion!==lastEligible.modelVersion||point.x===lastEligible.x&&point.score!==lastEligible.score))segment++;
      point.segment=segment;lastEligible=point;
    }
    return {points,axis,format:f,source:records.length?'recorded snapshots':'unavailable'};
  }
  function timeline(game,summary,local=[]){
    if(game.state==='upcoming')return '<section class="detail-section timeline-section"><h3>Excitement history</h3><p class="detail-empty">Excitement history begins when the game starts.</p></section>';
    const data=observations(game,summary,local),f=data.format;
    const points=data.points.filter(reliable),last=points.at(-1);
    const edges=connections(game,summary,data),edgeByEnd=new Map(edges.map(edge=>[edge.to,edge]));
    const pending=game.score==null||!Number.isFinite(Number(game.score));
    const heading=`<div class="timeline-heading"><h3>Excitement timeline</h3><span class="timeline-key"><i></i> Recorded ratings <span class="timeline-key-line"></span> Estimated line</span></div>`;
    const currentLabel=game.timingUncertain?(game.heldRatingProvisional?'Last observed rating':'Last confirmed rating'):game.scoringPartial?'Provisional live rating':game.state==='completed'?'Final rating':'Current live rating';
    const opening=game.pregameBaseline?.source==='observed'&&Number.isFinite(game.pregameBaseline.score)?game.pregameBaseline.score:null;
    const openingCard=opening===null?'':`<div class="timeline-rating-opening"><span>Opening rating</span><strong>${opening}</strong><small>Before play</small></div>`;
    const currentCard=game.state==='completed'?'':`<div class="timeline-rating-current"><span>${currentLabel}</span><strong>${pending?'Pending':escape(game.score)}</strong><small>${game.timingUncertain?'Clock updating':game.scoringPartial?'Awaiting confirmation':'Watchability now'}</small></div>`;
    const ratings=`<div class="timeline-ratings">${openingCard}${currentCard}<div class="timeline-rating-last"><span>Latest recorded live rating</span><strong>${last?last.score:'—'}</strong><small>${last?escape(last.label):'No confirmed live record'}</small></div></div>`;
    const finalPending=pending||game.scoringPartial||game.summaryLifecycleRejected||game.scoringHistoryRejected;
    const lastDescription=last?` ${points.length<2?'The only verified live rating is':'The live graph ends at'} ${last.score} (${escape(last.label)}).`:'';
    const outcome=game.state!=='completed'?'':`<aside class="timeline-outcome" aria-label="Retrospective final game quality"><div class="timeline-outcome-value"><span aria-hidden="true">◇</span><strong>${finalPending?'Pending':escape(game.score)}</strong></div><div><h4>Final game quality · After the game</h4><p>${finalPending?'The whole-game assessment is awaiting complete game data.':`This rates the whole game and its finish.${lastDescription} It is a separate assessment, not another live observation.`}</p></div></aside>`;
    if(points.length<2){
      const message=game.state==='completed'
        ? points.length?'Only one verified live rating is available; there is not enough history to draw a line.':'No verified live ratings are available for this game.'
        : 'Excitement history will appear as the game unfolds.';
      return `<section class="detail-section timeline-section"><h3>Excitement history</h3>${ratings}<p class="detail-empty">${message}</p>${outcome}</section>`;
    }
    const scoringPlays=summary?.scoringPlays?.length?summary.scoringPlays:(summary?.plays||[]).filter(p=>p.scoringPlay);
    const events=scoringPlays.map((p,i)=>({
      x:data.axis==='game'?position(p.period?.number??p.period,p.clock?.displayValue,f):Date.parse(p.wallclock||p.occurredAt||''),
      label:phase(p.period?.number??p.period,p.clock?.displayValue,f,p.period?.displayValue),text:p.text||p.shortText||p.type?.text||'Scoring play',
      important:Number.isFinite(Number(p.homeScore))&&Number.isFinite(Number(p.awayScore))&&
        (Number(p.homeScore)===Number(p.awayScore)||i>0&&Number.isFinite(Number(scoringPlays[i-1].homeScore))&&Number.isFinite(Number(scoringPlays[i-1].awayScore))&&
          Math.sign(Number(p.homeScore)-Number(p.awayScore))!==Math.sign(Number(scoringPlays[i-1].homeScore)-Number(scoringPlays[i-1].awayScore)))
    })).filter(p=>Number.isFinite(p.x));
    const start=data.axis==='game'?0:Math.min(...points.map(p=>p.x));
    const end=Math.max(start+1,data.axis==='game'?f.regulation||0:0,...points.map(p=>p.x),...events.map(p=>p.x));
    const late=data.axis==='game'?Math.max(start,(f.regulation||end)-300):Math.max(start,end-15*60*1000);
    const views=[{key:'full',label:'Full game',start,end}];
    if(late>start&&points.some(p=>p.x>=late))views.push({key:'late',label:data.axis==='game'?'Late game + OT':'Last 15 minutes',start:late,end});
    if(data.axis==='game'&&f.periods&&end>f.regulation)views.push({key:'ot',label:'Overtime',start:f.regulation,end});
    const id=`timeline-${String(game.sport+game.id).replace(/[^\w-]/g,'')}`;
    const helpId=id+'-help';
    const marker=(p,x,y,description,event=false,highlight=false)=>`<g class="timeline-point${event?' timeline-event-marker':''}${highlight?' timeline-event-highlight':''}" data-timeline-explanation="${escape(description)}" role="button" tabindex="0" aria-expanded="false" aria-controls="${helpId}" aria-label="${escape(description)}">${event?`<path d="M ${x} ${y-4} l 4 4 -4 4 -4 -4 Z"/>`:`<circle cx="${x}" cy="${y}" r="${p===last?3.5:1.4}"/>`}<circle class="timeline-hit-target" cx="${x}" cy="${y}" r="${event?11:6}"/><title>${escape(description)}</title></g>`;
    const chart=(v,mobile=false)=>{
      const width=mobile?360:940,left=34,right=12,top=14,bottom=170;
      const px=p=>left+(p.x-v.start)/(v.end-v.start)*(width-left-right),py=p=>top+(100-p.score)*(bottom-top)/100;
      const visible=points.filter(p=>p.x>=v.start&&p.x<=v.end),shownEvents=events.filter(p=>p.x>=v.start&&p.x<=v.end);
      const runs=[];let run=[];
      for(const point of visible){
        const edge=edgeByEnd.get(point);
        if(!run.length||!edge?.allowed||edge.from!==run.at(-1)){
          run=[];runs.push(run);
        }
        if(run.length&&point.x===run.at(-1).x&&point.score===run.at(-1).score)run[run.length-1]=point;
        else run.push(point);
      }
      let lines='',connectionTargets='';
      for(const anchors of runs){
        const commands=curve(anchors,px,py).match(/[MLC] [^MLC]+/g)||[];
        for(let i=1;i<anchors.length;i++){
          const a=anchors[i-1],b=anchors[i],d=`M ${px(a)} ${py(a)} ${commands[i]}`;
          const explanation=`Estimated connection between recorded ratings: ${a.score} (${a.label}; ${timestamp(a.observedAt)}) and ${b.score} (${b.label}; ${timestamp(b.observedAt)}). The line does not represent an additional recorded rating or game event.`;
          lines+=`<path class="timeline-line timeline-estimated${edgeByEnd.get(b)?.bridged?' timeline-bridged':''}" d="${d}"/>`;
          connectionTargets+=`<g class="timeline-point timeline-connection" data-timeline-explanation="${escape(explanation)}" role="button" tabindex="0" aria-expanded="false" aria-controls="${helpId}" aria-label="${escape(explanation)}"><path class="timeline-connection-target" d="${d}"/><title>${escape(explanation)}</title></g>`;
        }
      }
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
          periodLabels.push(`<text x="${px(p)}" y="${top+12}" text-anchor="start"><title>First rating in this period</title>${escape(label)}</text>`);lastLabel=px(p);
        }
      }
      const groups=new Map();
      for(const [i,p]of visible.entries()){
        // Identical geometry shares a control; the tooltip describes only the latest record.
        const key=p.x+':'+p.score;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({p,i});
      }
      const dots=[...groups.values()].map(group=>{
        const {p}=group.at(-1);
        const description=`${p.label}. Recorded rating: ${p.score}. ${timestamp(p.observedAt)}.${numeric(p.scoreA)&&numeric(p.scoreB)?` Score: ${p.scoreA}–${p.scoreB}.`:''}`;
        return marker(p,px(p),py(p),description);
      }).join('');
      const eventGroups=new Map(),spacing=mobile?26:24;
      for(const p of shownEvents){const bucket=Math.floor((px(p)-left)/spacing);if(!eventGroups.has(bucket))eventGroups.set(bucket,[]);eventGroups.get(bucket).push(p);}
      const eventDots=[...eventGroups].map(([bucket,group],i)=>{
        const x=left+(bucket+.5)*spacing,description=group.map(p=>`${p.label}: ${p.text}`).join(' • ');
        const important=group.some(p=>p.important);
        return marker(group[0],x,230+(i%2)*14,`${group.length} scoring ${group.length===1?'play':'plays'}. ${description}`,true,important);
      }).join('');
      return `<svg class="timeline-chart ${mobile?'timeline-mobile':'timeline-desktop'}" viewBox="0 0 ${width} 260" role="group" aria-label="Recorded live ratings, ${escape(v.label)}"><g>${guides}${lines}${connectionTargets}${dots}${axis}${periodLabels.join('')}</g><g class="timeline-event-strip"><rect x="${left}" y="207" width="${width-left-right}" height="51" rx="5"/><text x="${left+8}" y="220">SCORING PLAYS</text>${eventDots}</g></svg>`;
    };
    const playList=scoringPlays.length?`<details class="timeline-play-details"><summary>Browse scoring plays (${scoringPlays.length})</summary><ol>${scoringPlays.map(p=>
      `<li>${escape(phase(p.period?.number??p.period,p.clock?.displayValue,f,p.period?.displayValue))}: ${escape(p.text||p.shortText||p.type?.text||'Scoring play')}</li>`).join('')}</ol></details>`:'';
    return `<section class="detail-section timeline-section">${heading}${ratings}<div class="timeline-controls" role="group" aria-label="Timeline range">${views.map(v=>`<button type="button" data-timeline-range="${v.key}" aria-pressed="${v.key==='full'}">${v.label}</button>`).join('')}</div>${views.map(v=>`<div class="timeline-view" data-timeline-view="${v.key}"${v.key!=='full'?' hidden':''}>${chart(v)}${chart(v,true)}</div>`).join('')}<div class="timeline-point-help" id="${helpId}" role="status" aria-live="polite" aria-hidden="true"></div>${outcome}${playList}</section>`;
  }
  const api={calculation,scoringMarkup,decimalSum,format,position,phase,reliable,curve,comparable,observations,progression,connections,timeline};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.SportsRadarGameCenter=api;
})(globalThis);

/* Descriptive game-shape telemetry. This module never awards scoring points. */
(function (root) {
  const {gameProgress,eventPosition,normalizedTime} = typeof module !== 'undefined' && module.exports
    ? require('./time.js')
    : root.SportsRadarScoring.shared_time;
  const {winProbabilityObservations} = typeof module !== 'undefined' && module.exports
    ? require('./probability.js')
    : root.SportsRadarScoring.shared_probability;

  const unit = value => Math.max(0,Math.min(1,Number(value) || 0));
  const nonnegative = value => Math.max(0,Number(value) || 0);
  const uncertainty = probability => unit(1-2*Math.abs(probability-.5));

  const emptyTelemetry = () => ({
    competitiveShare:null,uncertaintyShare:null,dominantShare:null,
    marginContinuity:null,genuineContinuity:null,genuineContinuitySource:null,
    lateMovementShare:null,lastCompetitivePosition:null,
    trajectoryEndPosition:null,wpCoverageStart:null,wpCoverageEnd:null,
    wpCoverageShare:0,wpObservationCount:0,
    observedCoverageStart:null,observedCoverageEnd:null,observedCoverageSpan:0,
    observedCoverageShare:0,scoreObservationCount:0,hasObservedHistory:false
  });

  function scoringMoments(sport,summary) {
    const plays = summary?.scoringPlays?.length
      ? summary.scoringPlays
      : (summary?.plays || []).filter(play => play?.scoringPlay === true);
    return plays.map((play,index) => {
      const home = Number(play?.homeScore);
      const away = Number(play?.awayScore);
      const period = Number(play?.period?.number || play?.period || 0);
      const rawPosition = period ? eventPosition(sport,{status:{
        period,
        displayClock:play?.clock?.displayValue || '',
        clock:play?.clock?.value,
        // Provider NHL play clocks count up, as in chronological replay.
        ...(sport === 'NHL' ? {clockMode:'elapsed'} : {}),
        type:{detail:play?.period?.displayValue || ''}
      }}) : null;
      return play?.homeScore != null && play?.awayScore != null &&
        Number.isFinite(home) && Number.isFinite(away) && Number.isFinite(rawPosition)
        ? {home,away,position:nonnegative(rawPosition),play,index}
        : null;
    }).filter(Boolean).sort((a,b) => a.position-b.position || a.index-b.index);
  }

  function trajectoryAnalysis(sport,summary,progress=null,state='completed',model={}) {
    if (state === 'upcoming') return emptyTelemetry();
    const competition = summary?.header?.competitions?.[0] || {};
    const observedProgress = progress == null ? gameProgress(sport,competition) : Number(progress);
    const observations = winProbabilityObservations(sport,summary)
      .filter(item => item.position !== null)
      .sort((a,b) => a.position-b.position || a.index-b.index);
    const rawGamePosition = eventPosition(sport,competition);
    // The displayed observation owns the boundary. Later summary events must
    // never lengthen an older live checkpoint (including overtime).
    const elapsed = state === 'live' && Number(competition.status?.period)>0 && Number.isFinite(rawGamePosition)
      ? rawGamePosition
      : Math.max(state === 'completed' ? 1 : 0,
          Number.isFinite(observedProgress) ? observedProgress : 0,
          Number.isFinite(rawGamePosition) ? rawGamePosition : 0);
    if (!elapsed) return emptyTelemetry();

    const threshold = Math.max(1,Number(model?.history?.threshold) || 1);
    function closeness(gap,position,moment=null) {
      let value = null;
      if (typeof model?.trajectoryCloseness === 'function') {
        value = model.trajectoryCloseness({sport,gap,progress:position,summary,competition,moment});
      } else if (typeof model?.gameState === 'function') {
        // Historical snapshots rarely include possession/timeouts. An empty
        // status lets the existing sport curve use normalized progress without
        // leaking the final game's clock or situation backward through time.
        const historicalCompetition = {...competition,status:{},competitors:[
          {homeAway:'home',score:String(moment?.home ?? 0),team:{id:'home'}},
          {homeAway:'away',score:String(moment?.away ?? 0),team:{id:'away'}}
        ]};
        const result = model.gameState({sport,gameState:'live',gap,progress:position,
          context:{competition:historicalCompetition,summary}}) || {};
        value = result.marginClose ?? result.footballState?.close ?? result.basketballState?.close;
      }
      return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
        ? unit(value)
        : Math.exp(-Math.pow(Math.max(0,gap)/threshold,2));
    }

    // A hypothetical opening tie is not an observation. Include actual
    // non-scoring score markers so a genuinely observed scoreless game is
    // supported without requiring a goal, run or basket.
    const records = [...(summary?.plays || []),
      ...(summary?.drives?.previous || []).flatMap(d=>d.plays || []),
      ...(summary?.drives?.current?.plays || []),...(summary?.scoringPlays || []).map(p=>({...p,scoringPlay:true}))];
    const unique = [...new Map(records.map(p=>[p?.id != null ? `id:${p.id}` : JSON.stringify(p),p])).values()];
    const timed=unique.filter(p=>{
      const status={period:p?.period?.number || p?.period,displayClock:p?.clock?.displayValue || '',clock:p?.clock?.value};
      if(sport==='MLB')return /top|bottom|bot\b/i.test(p?.period?.displayValue || '');
      // A set number does not locate the time of a point within that set.
      if(sport==='Tennis')return false;
      return normalizedTime(sport,{status}).elapsedSeconds !== null;
    });
    const scoreStates = scoringMoments(sport,{scoringPlays:timed})
      .filter(moment => moment.position <= elapsed+1e-9);
    const currentScores = Object.fromEntries((competition.competitors || [])
      .filter(t=>t.score != null && t.score !== '' && Number.isFinite(Number(t.score)))
      .map(t=>[t.homeAway,Number(t.score)]));
    const lastScore = scoreStates.at(-1);
    // A matching current scoreboard can close a real observed interval. A
    // mismatching score cannot invent the time of a missing scoring event.
    if (lastScore && Number.isFinite(currentScores.home) && Number.isFinite(currentScores.away) &&
        lastScore.home===currentScores.home && lastScore.away===currentScores.away && lastScore.position<elapsed)
      scoreStates.push({home:currentScores.home,away:currentScores.away,position:elapsed,play:null});
    const scoreCoverageEnd = scoreStates.at(-1)?.position ?? null;
    const maxIncrement=({NFL:8,CFB:8,MLB:4,NHL:1,NBA:4,NCAAB:4,Soccer:1,Tennis:1})[sport] || Infinity;
    const scoreIntervals=[];
    for(let index=1;index<scoreStates.length;index++) {
      const before=scoreStates[index-1],after=scoreStates[index];
      const home=after.home-before.home,away=after.away-before.away;
      const unchanged=home===0 && away===0;
      const timedScoring=after.play?.scoringPlay===true && home>=0 && away>=0 &&
        Math.max(home,away)<=maxIncrement && (home===0 || away===0);
      // A score-changing non-scoring marker only proves that something is
      // missing; it cannot say when those points were scored or who led between.
      if(after.position>before.position && (unchanged || timedScoring)) scoreIntervals.push([before.position,after.position]);
    }
    const hasScoreCoverage=scoreIntervals.length>0;
    function scoreStateAt(position) {
      if (!scoreIntervals.some(([start,end])=>position>=start && position<=end)) return null;
      let current = scoreStates[0];
      for (const moment of scoreStates) {
        if (moment.position > position) break;
        current = moment;
      }
      return current;
    }
    function competitiveAt(position) {
      const moment = scoreStateAt(position);
      return moment ? closeness(Math.abs(moment.home-moment.away),position,moment) : null;
    }

    const wp = [];
    for (const item of observations.filter(item => item.position <= elapsed+.000001)) {
      if (wp.length && Math.abs(wp.at(-1).position-item.position) < 1e-9) wp[wp.length-1] = item;
      else wp.push(item);
    }
    const wpCoverageStart = wp.length ? wp[0].position : null;
    const wpCoverageEnd = wp.length ? wp.at(-1).position : null;
    const wpCoverageSpan = wp.length > 1 ? wpCoverageEnd-wpCoverageStart : 0;
    const wpCoverageShare = elapsed ? unit(wpCoverageSpan/elapsed) : 0;
    const hasWpCoverage = wpCoverageSpan > 0;
    function probabilityAt(position) {
      if (!hasWpCoverage || position < wpCoverageStart || position > wpCoverageEnd) return null;
      if (position === wpCoverageStart) return wp[0].probability;
      if (position === wpCoverageEnd) return wp.at(-1).probability;
      for (let i=1;i<wp.length;i++) {
        if (wp[i].position < position) continue;
        const left = wp[i-1], right = wp[i];
        const span = right.position-left.position;
        const weight = span ? (position-left.position)/span : 1;
        return left.probability+(right.probability-left.probability)*weight;
      }
      return wp.at(-1).probability;
    }

    const bins = 240;
    const competitive = [];
    const margins = [];
    const uncertainties = [];
    for (let i=0;i<bins;i++) {
      const position = elapsed*(i+.5)/bins;
      const close = competitiveAt(position);
      const probability = probabilityAt(position);
      const uncertain = probability === null ? null : uncertainty(probability);
      margins.push(close);
      // Positioned WP is real evidence of competitive uncertainty even when
      // the historical score is unavailable. It does not create a score state.
      competitive.push(close ?? uncertain);
      uncertainties.push(uncertain);
    }
    const mean = values => values.length
      ? values.reduce((sum,value) => sum+value,0)/values.length
      : null;
    const supportedUncertainties = uncertainties.filter(value => value !== null);
    const supportedCompetitive = competitive.filter(value=>value !== null);
    const competitiveShare = mean(supportedCompetitive);
    const uncertaintyShare = mean(supportedUncertainties);
    const dominantShare = mean(hasWpCoverage
      ? supportedUncertainties.map(value => Math.pow(1-value,2))
      : supportedCompetitive.map(value => Math.pow(1-value,2)));

    const radius = Math.max(1,Math.round(bins*.1));
    function continuityFor(values) {
      const contributions = [];
      for (let index=0;index<values.length;index++) {
        const value = values[index];
        if (value === null) continue;
        const local = values
          .slice(Math.max(0,index-radius),Math.min(bins,index+radius+1))
          .filter(item => item !== null);
        if (local.length) contributions.push(Math.sqrt(value*mean(local)));
      }
      return mean(contributions);
    }
    const marginContinuity = continuityFor(margins);
    const genuineTension = competitive.map((close,index) => uncertainties[index] === null || close === null
      ? null
      : Math.sqrt(close*uncertainties[index]));
    const genuineContinuity = hasWpCoverage
      ? continuityFor(genuineTension)
      : marginContinuity;
    const genuineContinuitySource = hasWpCoverage
      ? 'positioned-win-probability'
      : hasScoreCoverage ? 'margin-fallback' : 'unavailable';

    const drama = [];
    for (let i=1;i<scoreStates.length;i++) {
      const before = scoreStates[i-1], after = scoreStates[i];
      if(after.play?.scoringPlay!==true) continue;
      const beforeClose = closeness(Math.abs(before.home-before.away),after.position,after);
      const afterClose = closeness(Math.abs(after.home-after.away),after.position,after);
      const weight = Math.abs(afterClose-beforeClose);
      if (weight) drama.push({position:after.position,weight});
    }
    for (let i=1;i<wp.length;i++) {
      const weight = Math.abs(wp[i].probability-wp[i-1].probability);
      if (weight) drama.push({position:wp[i].position,weight});
    }
    const totalDrama = drama.reduce((sum,item) => sum+item.weight,0);
    const lateMovementShare = totalDrama
      ? drama.filter(item => item.position >= elapsed*.8)
          .reduce((sum,item) => sum+item.weight,0)/totalDrama
      : null;

    function genuinelyCompetitive(position) {
      const close = competitiveAt(position);
      const probability = probabilityAt(position);
      return probability === null
        ? (hasWpCoverage ? null : close)
        : close === null ? uncertainty(probability) : Math.sqrt(close*uncertainty(probability));
    }
    let lastCompetitivePosition = null;
    const searchEnd = hasWpCoverage ? wpCoverageEnd : scoreCoverageEnd;
    if (searchEnd !== null && genuinelyCompetitive(searchEnd) >= .5) lastCompetitivePosition = searchEnd;
    else {
      for (let i=bins-1;i>=0;i--) {
        const position = elapsed*(i+.5)/bins;
        const tension = genuinelyCompetitive(position);
        if (tension !== null && tension >= .5) {
          lastCompetitivePosition = position;
          break;
        }
      }
    }

    // Union of observed intervals, not elapsed game time or a fabricated
    // connection between two disjoint evidence windows.
    const intervals = [...scoreIntervals,
      hasWpCoverage ? [wpCoverageStart,wpCoverageEnd] : null].filter(Boolean).sort((a,b)=>a[0]-b[0]);
    const covered = [];
    for (const interval of intervals) {
      if (covered.length && interval[0]<=covered.at(-1)[1]) covered.at(-1)[1]=Math.max(covered.at(-1)[1],interval[1]);
      else covered.push([...interval]);
    }
    const observedCoverageSpan=covered.reduce((sum,[start,end])=>sum+end-start,0);
    return {
      competitiveShare,uncertaintyShare,dominantShare,
      marginContinuity,genuineContinuity,genuineContinuitySource,
      lateMovementShare,lastCompetitivePosition,trajectoryEndPosition:elapsed,
      wpCoverageStart,wpCoverageEnd,wpCoverageShare,wpObservationCount:wp.length,
      observedCoverageStart:covered[0]?.[0] ?? null,observedCoverageEnd:covered.at(-1)?.[1] ?? null,
      observedCoverageSpan,observedCoverageShare:unit(observedCoverageSpan/elapsed),
      scoreObservationCount:scoreStates.filter(s=>s.play).length,hasObservedHistory:observedCoverageSpan>0
    };
  }

  const api = {scoringMoments,trajectoryAnalysis};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SportsRadarScoring ||= {}).shared_trajectory = api;
})(globalThis);

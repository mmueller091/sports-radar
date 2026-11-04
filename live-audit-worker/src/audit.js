// Independent plausibility rules. Never imports or calls the production scorer.
export const SPORTS = new Set(['NFL','CFB','MLB','NHL','NBA','NCAAB','Soccer','Tennis']);
export const AUDIT_VERSION = '2026-11-03.quality.1';
const REGULATION = {NFL:4,CFB:4,NBA:4,NCAAB:2,NHL:3,MLB:9,Soccer:2,Tennis:3};
const WIDE = {NFL:21,CFB:28,MLB:5,NHL:3,NBA:25,NCAAB:20,Soccer:3,Tennis:2};

export function clockSeconds(value) {
  const match = /^(\d{1,3}):(\d{2})$/.exec(String(value || ''));
  if (!match || Number(match[2]) >= 60) return null;
  return Number(match[1])*60+Number(match[2]);
}
export function gameState(game) {
  const raw=game.liveRawStatus || {};
  const scores=(game.teams || []).slice(0,2).map(team=>Number(team?.[2]));
  const period=Number(raw.period);
  return {key:`${game.sport}:${game.id}`,sport:game.sport,rating:Number(game.score),
    scores,margin:Math.abs(scores[0]-scores[1]),period:Number.isInteger(period)?period:null,
    clock:clockSeconds(raw.displayClock),phase:String(game.live?.phase || game.status || ''),
    scoreState:String(raw.type?.state || ''),sourceState:game.state};
}
export function stateBucket(state) {
  const stage=state.period==null?'unknown':state.period>REGULATION[state.sport]?'ot':
    state.period>=REGULATION[state.sport]?'late':'early';
  const margin=state.margin===0?'tied':state.margin<=Math.max(1,Math.floor(WIDE[state.sport]/3))?'close':
    state.margin>=WIDE[state.sport]?'wide':'middle';
  return `${stage}:${margin}`;
}
export function auditTimeline(summary,sport) {
  const plays=Array.isArray(summary?.plays)?summary.plays:[];
  if (plays.length<3 || !['NFL','CFB','NBA','NCAAB','NHL','MLB','Soccer'].includes(sport)) return {checks:0,findings:[]};
  let sequenceConflicts=0,clockReversals=0,scoreRollbacks=0;
  const examples=[];
  for(let i=1;i<plays.length;i++) {
    const a=plays[i-1],b=plays[i],pa=Number(a.period?.number),pb=Number(b.period?.number),
      ca=clockSeconds(a.clock?.displayValue),cb=clockSeconds(b.clock?.displayValue),
      wa=Date.parse(a.wallclock || ''),wb=Date.parse(b.wallclock || '');
    if (!Number.isFinite(wa) || !Number.isFinite(wb) || wb<wa) continue;
    const forward=pa===pb && ca!==null && cb!==null && ca-cb>=10;
    if (forward && Number(b.sequenceNumber)<Number(a.sequenceNumber)) {
      sequenceConflicts++;if(examples.length<3)examples.push({before:a.id,after:b.id,clock:[a.clock?.displayValue,b.clock?.displayValue]});
    }
    if (pa===pb && ca!==null && cb!==null && cb-ca>90) clockReversals++;
    if (['NFL','CFB','NBA','NCAAB','NHL','Soccer'].includes(sport) &&
        (Number(b.homeScore)<Number(a.homeScore) || Number(b.awayScore)<Number(a.awayScore)) &&
        !/correct|overturn|review/i.test(String(b.text || '')+' '+String(b.type?.text || ''))) scoreRollbacks++;
  }
  const findings=[];
  if (sequenceConflicts>=2) findings.push(candidate('TIMELINE_SEQUENCE_CONFLICT','low',.68,'history',
    {sequenceConflicts,examples},'replay should use source chronology, not sequence sort',
    'Play sequence IDs disagree with forward clock and wall-clock order'));
  if (clockReversals>=2) findings.push(candidate('TIMELINE_CLOCK_ORDER','medium',.75,'provider data',
    {clockReversals},'play clock normally advances chronologically','Cached play timeline contains backward intervals'));
  if (scoreRollbacks) findings.push(candidate('TIMELINE_SCORE_ROLLBACK','medium',.72,'provider data',
    {scoreRollbacks},'scoring totals do not decrease without correction','Cached play timeline has unexplained score decreases'));
  return {checks:3,findings};
}
const candidate=(reasonCode,severity,confidence,failureLayer,observed,expected,detail,deterministic=false)=>
  ({reasonCode,severity,confidence,failureLayer,observed,expected,detail,deterministic});
function comparableMedian(peers) {
  const values=peers.map(row=>Number(row.rating)).filter(Number.isFinite).sort((a,b)=>a-b);
  return values.length>=5 ? values[Math.floor(values.length/2)] : null;
}
export function auditGame(game,previous=[],peers=[],now=Date.now(),nhlCrosscheck=null,summary=null) {
  const s=gameState(game), p=previous[0] || null, findings=[];
  const rawRef={feedGame:s.key,providerPath:game.providerPath || null,
    priorSnapshot:p ? {gameKey:s.key,observedAt:p.observed_at,modelVersion:p.model_version} : null};
  let checks=0;
  const add=(...args)=>findings.push(candidate(...args));
  checks++;
  if (!Number.isInteger(s.rating) || s.rating<1 || s.rating>99)
    add('RATING_OUT_OF_RANGE','critical',1,'scoring model',{rating:s.rating},'integer 1..99','Published rating is outside the scale',true);
  checks++;
  if (s.scores.length!==2 || s.scores.some(n=>!Number.isInteger(n) || n<0))
    add('INVALID_SCORE','critical',1,'provider data',{scores:s.scores},'two nonnegative integer scores','Published team scores are malformed',true);
  checks++;
  if (s.scoreState && s.scoreState!=='in')
    add('LIVE_STATE_CONFLICT','high',1,'provider data',{state:s.scoreState,sourceState:s.sourceState},'in','Published live game conflicts with provider state',true);
  checks++;
  if (s.period!==null && (s.period<1 || s.period>20))
    add('INVALID_PERIOD','high',1,'clock reconciliation',{period:s.period},'period 1..20','Provider period is outside a plausible live range',true);
  checks++;
  const regulation=REGULATION[s.sport];
  if (s.period>regulation && /\b\d+(?:st|nd|rd|th)\s+(?:quarter|half|period)\b/i.test(s.phase))
    add('OVERTIME_LABEL','high',.99,'UI',{phase:s.phase,period:s.period},'OT or later overtime label','Overtime is presented as regulation',true);
  checks++;
  if (game.scoreboard?.teams?.length===2) {
    const raw=game.scoreboard.teams.map(team=>Number(team?.[2]));
    if (raw.some((n,i)=>Number.isFinite(n) && n!==s.scores[i]))
      add('SCOREBOARD_ENRICHMENT_CONFLICT','high',.95,'provider data',{published:s.scores,scoreboard:raw},'scores agree','Canonical enriched and raw scoreboard scores differ',true);
  }
  checks++;
  if (nhlCrosscheck && s.sport==='NHL' && nhlCrosscheck.ageMs<=90000 && nhlCrosscheck.scores.every(Number.isFinite) &&
      nhlCrosscheck.scores.some((n,i)=>n!==s.scores[i]))
    add('NHL_SOURCE_SCORE_CONFLICT','high',.8,'provider data',{published:s.scores,official:nhlCrosscheck.scores,ageMs:nhlCrosscheck.ageMs},'ESPN and cached NHL scores agree','Independent cached NHL play-by-play differs; allow for propagation lag');
  checks++;
  if (p) {
    let prior;
    try {prior=JSON.parse(p.normalized_state || '{}')} catch {
      add('HISTORY_JSON_CORRUPT','critical',1,'history',{observedAt:p.observed_at},'parseable stored state','Stored prior state cannot be parsed',true);
    }
    if (prior) {
    const ps=gameState(prior), age=now-Number(p.observed_at);
    if (Number(p.observed_at)>now+30000 || age<0)
      add('HISTORY_FUTURE_TIMESTAMP','critical',1,'history',{priorAt:p.observed_at,now},'snapshot time at or before scan','Stored observation is from the future',true);
    if (p.state==='completed')
      add('FINAL_TO_LIVE','critical',1,'history',{priorState:p.state,currentState:'live'},'completed state does not resume','Final game became live again',true);
    const delta=s.rating-ps.rating;
    if (p.state==='upcoming' && s.period===1 && s.scores.every(n=>n===0) && delta>28 &&
        !String(game.moment || game.momentumText || game.upsetText || ''))
      add('KICKOFF_JUMP','medium',.72,'scoring model',{pregame:ps.rating,live:s.rating},
        'opening live rating follows observed state and context','Large opening rise before a score or known event');
    if (age>=0 && age<=600000) {
      if (ps.period!==null && s.period!==null && s.period<ps.period)
        add('PERIOD_ROLLBACK','high',.85,'clock reconciliation',{previous:ps.period,current:s.period},'period does not decrease','Provider period moved backward; possible correction');
      if (ps.period===s.period && ps.clock!==null && s.clock!==null && s.clock-ps.clock>90 && s.sport!=='Tennis')
        add('CLOCK_ROLLBACK','medium',.75,'clock reconciliation',{previous:ps.clock,current:s.clock},'clock normally counts down','Clock gained over 90 seconds within a period');
      const scoreChanged=s.scores.some((n,i)=>n!==ps.scores[i]), phaseChanged=s.period!==ps.period;
      const event=String(game.moment || game.momentumText || game.upsetText || '');
      if (Math.abs(delta)>=24 && !scoreChanged && !phaseChanged && !event && !game.detailStale)
        add(delta>0?'UNEXPLAINED_RISE':'UNEXPLAINED_DROP','medium',.67,'scoring model',
          {previousRating:ps.rating,rating:s.rating,scores:s.scores,period:s.period},
          'large same-state change has an event, pressure, or context explanation','No visible scoring or phase change explains the rating move');
    }
    }
  }
  checks++;
  if (!game.detailStale && s.period>=regulation && s.margin>=WIDE[s.sport]) {
    const bound={NFL:78,CFB:76,MLB:78,NHL:79,NBA:77,NCAAB:75,Soccer:76,Tennis:75}[s.sport];
    if (s.rating>bound && !/championship|final|playoff|overtime|hat trick|record|milestone/i.test(String(game.context || '')+' '+String(game.moment || '')))
      add('LATE_WIDE_MARGIN_HIGH','low',.58,'scoring model',{rating:s.rating,margin:s.margin,period:s.period},
        `usually below ${bound} absent exceptional stakes or events`,'Wide late margin has unusually high excitement; review context before changing score');
  }
  checks++;
  if (/\b(?:currently tied|tie game|one.point game|one.goal game)\b/i.test(String(game.why || '')) && s.margin>2)
    add('MISLEADING_EXPLANATION','medium',.72,'UI',{why:game.why,margin:s.margin},'explanation agrees with current score','Displayed explanation may describe an earlier game state');
  checks++;
  const median=comparableMedian(peers);
  if (median!==null && Math.abs(s.rating-median)>=27 && !game.detailStale)
    add('SIMILAR_STATE_OUTLIER','low',.54,'scoring model',{rating:s.rating,bucket:stateBucket(s),peerMedian:median,peerCount:peers.length},
      'inspect stakes and events before interpreting peer spread','Rating differs substantially from similar observed states');
  const timeline=auditTimeline(summary,s.sport);
  checks+=timeline.checks;findings.push(...timeline.findings);
  return {state:s,stateBucket:stateBucket(s),checks,findings,rawRef,peerMedian:median};
}

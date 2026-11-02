// Bounded, verified evidence only. No provider requests or score smoothing.
const {normalizedTime}=require('./shared/time.js');
const {hockeyOnIceState,hockeyElapsed,hockeyPlayClockMode,hockeyOvertime}=require('./sports/nhl.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const identity=g=>`${g.sport}:${g.id}:${(g.teams||[]).map(t=>String(t[8])).sort().join(',')}`;
const scores=c=>Object.fromEntries((c?.competitors||[]).map(t=>[String(t.team?.id||t.id),Number(t.score)]));
const elapsed=(g,c)=>normalizedTime(g.sport,c).elapsedSeconds;
const lower=(a,b)=>Object.keys(b||{}).some(id=>!Number.isFinite(a[id])||a[id]<b[id]);
function preserveLiveEvidence(game,previous){
 if(game.state!=='live'||!previous||identity(game)!==identity(previous))return;
 for(const key of ['verifiedLiveEvidence','manpowerEvidence','recoveredUnderdog'])if(previous[key])game[key]=clone(previous[key]);
 const prior=Object.fromEntries(previous.teams.map(t=>[String(t[8]),Number(t[2])])),current=Object.fromEntries(game.teams.map(t=>[String(t[8]),Number(t[2])]));
 if(lower(current,prior)){delete game.verifiedLiveEvidence;delete game.manpowerEvidence;game.liveEvidenceReset='score-correction';}
}
function compatible(game,c,e,now){
 const t=elapsed(game,c),period=Number(c?.status?.period),regulation=({NFL:4,CFB:4,NBA:4,NCAAB:2,NHL:3,Soccer:2})[game.sport]||99;
 return e?.identity===identity(game)&&now-e.observedAt>=0&&now-e.observedAt<=120000&&
  t!==null&&t>=e.elapsed&&t-e.elapsed<=120&&period>=e.period&&period<=e.period+1&&
  (period===e.period||period<=regulation)&&!lower(scores(c),e.scores);
}
function compactPlay(p){return {...Object.fromEntries(['id','sequenceNumber','period','clock','homeScore','awayScore','text','type','scoringPlay','extraAttacker'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]])),...(p.team?{team:{id:p.team.id}}:{})};}
function historicalSummary(summary){
 const scoring=summary.scoringPlays?.length?summary.scoringPlays:(summary.plays||[]).filter(p=>p.scoringPlay);
 if(scoring.length>100||(summary.winprobability||[]).length>1024)return null;
 const plays=[...new Map([...scoring,...(summary.plays||[]).slice(-16)].map(p=>[String(p.id||JSON.stringify(p)),compactPlay(p)])).values()];
 return {scoringPlays:scoring.map(compactPlay),plays,winprobability:(summary.winprobability||[]).map(p=>({homeWinPercentage:p.homeWinPercentage??p.homeWinProbability??p.homeWinPct??p.value}))};
}
function validLedger(summary,c,sport=''){
 const totals=Object.fromEntries((c.competitors||[]).map(t=>[t.homeAway,Number(t.score)]));let home=0,away=0;
 const scoring=summary.scoringPlays?.length?summary.scoringPlays:(summary.plays||[]).filter(p=>p.scoringPlay);
 const shootout=sport==='NHL'&&hockeyOvertime(null,c,summary).shootout;
 for(const p of scoring){if(shootout&&Number(p.period?.number)>4)continue;if(p.homeScore==null||p.awayScore==null)continue;
  const h=Number(p.homeScore),a=Number(p.awayScore);if(!Number.isFinite(h)||!Number.isFinite(a)||h<home||a<away||h>totals.home||a>totals.away)return false;home=h;away=a;}
 return true;
}
function historyFor(game,c,accepted,now=Date.now()){
 const e=game.verifiedLiveEvidence;
 const incomplete=e?.summary?.scoringPlays?.length && !accepted?.scoringPlays?.length &&
  (accepted?.plays||[]).filter(p=>p.scoringPlay).length<e.summary.scoringPlays.length;
 if(accepted && !incomplete && (accepted.scoringPlays?.length||accepted.plays?.length||accepted.winprobability?.length))return null;
 if(!compatible(game,c,e,now)){delete game.verifiedLiveEvidence;return null;}
 return {summary:{...clone(e.summary),header:{competitions:[c]}},trajectory:clone(e.trajectory)};
}
function rememberHistory(game,c,summary,result,now=Date.now()){
 if(!summary || !(summary.scoringPlays?.length||summary.plays?.length||summary.winprobability?.length))return;
 if(!validLedger(summary,c,game.sport)){delete game.verifiedLiveEvidence;return;}
 const compact=historicalSummary(summary),t=elapsed(game,c);if(!compact||t===null)return;
 const evidence={identity:identity(game),observedAt:now,elapsed:t,period:Number(c.status?.period),scores:scores(c),summary:compact,trajectory:result.trajectory};
 // Do not grow snapshots without a hard bound or silently truncate a ledger.
 if(JSON.stringify(evidence).length<=24000)game.verifiedLiveEvidence=evidence;
 else delete game.verifiedLiveEvidence;
}
function currentManpower(game,c,accepted,now=Date.now()){
 if(game.sport!=='NHL')return accepted;
 const previous=game.manpowerEvidence,t=elapsed(game,c),period=Number(c.status?.period),current=scores(c);
 const sameScores=previous&&Object.keys(current).length===Object.keys(previous.scores).length&&Object.keys(current).every(id=>current[id]===previous.scores[id]);
 const goalieBlocks=accepted?.boxscore?.players?.filter(b=>(b.statistics||[]).some(s=>/goalie/i.test(s.name||s.displayName||'')));
 let effective=accepted;
 if(accepted?.onIce?.length===2&&!goalieBlocks?.length&&previous&&sameScores&&period===previous.period&&now-previous.observedAt<=120000)
  effective={...accepted,boxscore:{...accepted.boxscore,players:previous.goalies}};
 const state=effective&&hockeyOnIceState(effective,game.teams);
 const known=state?.sides?.length===2&&new Set(state.sides.map(s=>s.id)).size===2&&state.sides.every(s=>s.goalieKnown&&s.count>=4&&s.count<=7&&game.teams.some(t=>String(t[8])===s.id));
 if(known){
  const mode=hockeyPlayClockMode(effective),penalties=(effective.plays||[]).filter(p=>Number(p.type?.penaltyMinutes)>0);
  const expires=penalties.map(p=>({p,time:hockeyElapsed({period:p.period?.number,displayClock:p.clock?.displayValue,clockMode:mode},false)}))
   .filter(x=>x.time!==null&&x.time<=t&&t<x.time+Number(x.p.type.penaltyMinutes)*60&&String(x.p.team?.id)!==state.powerPlayTeamId)
   .reduce((end,x)=>Math.max(end,x.time+Number(x.p.type.penaltyMinutes)*60),t+15);
  const goalies=(effective.boxscore?.players||[]).map(b=>({team:{id:b.team?.id},statistics:(b.statistics||[]).filter(s=>/goalie/i.test(s.name||s.displayName||'')).map(s=>({name:s.name,athletes:(s.athletes||[]).map(a=>({athlete:{id:a.athlete?.id||a.athleteid||a.athleteId}}))}))}));
  const onIce=effective.onIce.map(s=>({teamId:s.teamId||s.team?.id,entries:(s.entries||[]).map(e=>({athleteid:e.athleteid||e.athleteId||e.athlete?.id}))}));
  game.manpowerEvidence={identity:identity(game),observedAt:now,elapsed:t,period,scores:current,onIce,goalies,powerPlay:Boolean(state.powerPlayTeamId),expires,
   playIds:(effective.plays||[]).slice(-16).map(p=>String(p.id))};return effective;
 }
 if(!previous||!previous.powerPlay||!compatible(game,c,previous,now)||!sameScores||period!==previous.period||t>=previous.expires||now-previous.observedAt>120000){delete game.manpowerEvidence;return accepted;}
 const mode=hockeyPlayClockMode(accepted||{});
 const fresh=(accepted?.plays||[]).filter(p=>{const at=hockeyElapsed({period:p.period?.number,displayClock:p.clock?.displayValue,clockMode:mode},false);
  return !previous.playIds.includes(String(p.id))&&at!==null&&at>=previous.elapsed&&at<=t;});
 if(fresh.some(p=>Number(p.type?.penaltyMinutes)>0||/penalty (?:end|expir)|penalty[- ]over/i.test(p.type?.text||p.text||'')||(/shot|goal|save/i.test(p.type?.text||'')&&/even.strength|short.handed/i.test(p.strength?.text||'')))){delete game.manpowerEvidence;return accepted;}
 game.manpowerRetained=true;
 return {...accepted,header:accepted?.header||{competitions:[c]},onIce:clone(previous.onIce),boxscore:{...accepted?.boxscore,players:clone(previous.goalies)}};
}
module.exports={preserveLiveEvidence,historyFor,rememberHistory,currentManpower,validLedger};

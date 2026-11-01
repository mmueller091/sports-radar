// Reconcile independent ESPN resources by event identity. A missing array is
// not a retraction. This evidence belongs to the current feed, not snapshots.
const {normalizedTime}=require('./shared/time.js');
const {normalizeWinProbability}=require('./shared/probability.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const supports=g=>['NCAAB','NBA'].includes(g.sport);
const identity=g=>`${g.sport}:${g.id}:${g.teams.map(t=>String(t[8])).sort().join(',')}`;
const position=(g,c)=>normalizedTime(g.sport,c).elapsedSeconds;
const seq=(p,eventId='')=>{
 const id=String(p?.id||'');
 return String(p?.sequenceNumber || (eventId&&id.startsWith(String(eventId))?id.slice(String(eventId).length):id)).replace(/^0+/,'');
};
const compare=(a,b)=>a.length-b.length || a.localeCompare(b);
const scoreMap=c=>Object.fromEntries((c?.competitors||[]).map(t=>[String(t.team?.id || t.id),Number(t.score)]));
const sameScores=(a,b)=>Object.keys(a).length===2&&Object.keys(b).length===2&&Object.keys(a).every(id=>a[id]===b[id]);
const fingerprint=c=>{
 const {lastPlay,...situation}=c.situation||{};
 return JSON.stringify({period:c.status?.period,clock:c.status?.displayClock,
  teams:(c.competitors||[]).map(t=>[t.team?.id,t.score,t.possession,t.fouls,t.timeoutsRemaining]),situation,
  lastPlay:lastPlay?{id:lastPlay.id,type:lastPlay.type?.text,text:lastPlay.text,team:lastPlay.team?.id,scoreValue:lastPlay.scoreValue}:null});
};
function compactCompetition(c) {
 return clone({status:c.status,situation:c.situation,competitors:(c.competitors||[]).map(t=>({team:{id:t.team?.id,displayName:t.team?.displayName},homeAway:t.homeAway,score:t.score,possession:t.possession,fouls:t.fouls,timeoutsRemaining:t.timeoutsRemaining}))});
}
function preserveBasketballState(game,previous) {
 if(supports(game)&&game.state==='live'&&previous?.basketballEvidence?.identity===identity(game)){
  game.basketballEvidence=clone(previous.basketballEvidence);
  if(previous.recoveredCollegeUnderdog)game.recoveredCollegeUnderdog=clone(previous.recoveredCollegeUnderdog);
 }
}
function reconcileBasketball(game,c,summary) {
 if(!supports(game)||game.state!=='live'||!c)return {competition:c,summary};
 let e=game.basketballEvidence;
 if(e?.identity!==identity(game))e=null;
 const prior=e?.competition,at=position(game,c),before=prior&&position(game,prior);
 const nextId=seq(c.situation?.lastPlay,game.id),priorId=seq(prior?.situation?.lastPlay,game.id);
 const olderEvent=nextId&&priorId&&compare(nextId,priorId)<0;
 const newerEvent=nextId&&priorId&&compare(nextId,priorId)>0;
 const backward=at!==null&&before!==null&&at<before;
 // A small scoreboard clock correction is valid. A larger reset needs a new
 // provider event; a delayed earlier event can never roll back the game.
 const lowerScore=prior&&Object.keys(scoreMap(c)).some(id=>scoreMap(c)[id]<scoreMap(prior)[id]);
 const corroboratedCorrection=summary?.header?.competitions?.[0]&&sameScores(scoreMap(summary.header.competitions[0]),scoreMap(c));
 const explicitScoreCorrection=lowerScore&&corroboratedCorrection&&at!==null&&before!==null&&Math.abs(at-before)<=2;
 const stale=prior&&(olderEvent&&!explicitScoreCorrection||(backward&&before-at>2&&!newerEvent)||lowerScore&&!newerEvent&&!corroboratedCorrection);
 if(stale){c={...c,...clone(prior)};game.basketballUpdateRejected=true;}
 else delete game.basketballUpdateRejected;
 const explicitPossession=Object.prototype.hasOwnProperty.call(c.situation||{},'possession');
 const totals=scoreMap(c),oldTotals=scoreMap(prior),unchanged=sameScores(totals,oldTotals);
 const corrected=prior&&Object.keys(totals).some(id=>totals[id]<oldTotals[id]);
 if(prior&&unchanged&&!newerEvent&&Math.abs((position(game,c)??0)-(before??0))<=2){
  // Preserve omitted situation fields only for the same observation. Explicit
  // false, zero and null values remain corrections, never missing values.
  c={...c,situation:{...prior.situation,...c.situation}};
  const oldPlay=prior.situation?.lastPlay,newPlay=c.situation?.lastPlay;
  if(oldPlay?.id&&String(oldPlay.id)===String(newPlay?.id))c.situation.lastPlay={...oldPlay,...newPlay,type:{...oldPlay.type,...newPlay.type}};
  c.competitors=c.competitors.map(t=>({...prior.competitors.find(p=>String(p.team?.id)===String(t.team?.id)),...t}));
 }
 const holders=(c.competitors||[]).filter(t=>t.possession===true);
 if(!explicitPossession&&holders.length===1)c={...c,situation:{...c.situation,possession:String(holders[0].team?.id||holders[0].id)}};
 const header=summary?.header?.competitions?.[0];
 const headerMatches=header&&sameScores(scoreMap(header),totals)&&
  Number(header.status?.period)===Number(c.status?.period)&&
  Math.abs((position(game,header)??-9999)-(position(game,c)??0))<=2;
 const ids=new Set(Object.keys(totals));
 const compatibleHeader=header&&(header.competitors||[]).length===2&&header.competitors.every(t=>ids.has(String(t.team?.id||t.id)));
 const currentKey=fingerprint(c);
 const playerPoints=new Map((e?.playerPoints||[]).map(p=>[p.id,p]));
 if(headerMatches&&!stale)for(const block of summary?.boxscore?.players||[])for(const group of block.statistics||[]){
  const index=(group.labels||[]).findIndex(l=>/^PTS$|^POINTS$/i.test(l));if(index<0)continue;
  for(const player of group.athletes||[]){const value=player.stats?.[index],points=Number(value),id=player.athlete?.id;
   if(id&&value!=null&&value!==''&&Number.isFinite(points))playerPoints.set(String(id),{id:String(id),name:player.athlete.displayName,points});
  }
 }
 const previousPlays=corrected ? (e?.plays||[]).filter(p=>withinScore(p,c)) : e?.plays||[];
 const incoming=compatibleHeader&&!stale ? [...(summary?.scoringPlays||[]),...(summary?.plays||[])] : [];
 const playsById=new Map(previousPlays.map(p=>[String(p.id),p]));
 const end=position(game,c);
 for(const p of incoming){
  const time=position(game,{status:{period:p.period?.number,displayClock:p.clock?.displayValue}});
  if(p.id==null||time===null||end===null||time>end+2||!withinScore(p,c))continue;
  // A conflicting revision to a known event needs a synchronized header.
  if(playsById.has(String(p.id))&&!headerMatches)continue;
  playsById.set(String(p.id),{...playsById.get(String(p.id)),...compactPlay(p)});
 }
 let home=0,away=0;
 const playTime=p=>position(game,{status:{period:p.period?.number,displayClock:p.clock?.displayValue}})??0;
 const plays=[...playsById.values()].sort((a,b)=>playTime(a)-playTime(b)||
  (Date.parse(a.wallclock||'')-Date.parse(b.wallclock||'') || compare(seq(a,game.id),seq(b,game.id)))).filter(p=>{
  if(p.homeScore==null||p.awayScore==null)return true;
  if(Number(p.homeScore)<home||Number(p.awayScore)<away)return false;
  home=Number(p.homeScore);away=Number(p.awayScore);return true;
 });
 const known=new Set(plays.map(p=>String(p.id)));
 const priorById=new Map((e?.plays||[]).map(p=>[String(p.id),p]));
 const changedScoreIds=new Set(plays.filter(p=>{const old=priorById.get(String(p.id));return old&&(old.homeScore!==p.homeScore||old.awayScore!==p.awayScore);}).map(p=>String(p.id)));
 const probabilities=new Map((e?.probabilities||[]).filter(p=>known.has(String(p.playId))&&!changedScoreIds.has(String(p.playId))).map(p=>[String(p.playId),p]));
 if(compatibleHeader&&!stale)for(const p of summary?.winprobability||[]){
  const probability=normalizeWinProbability(p.homeWinPercentage??p.homeWinProbability??p.homeWinPct??p.value);
  if(known.has(String(p.playId))&&probability!==null)probabilities.set(String(p.playId),{playId:p.playId,homeWinPercentage:probability});
 }
 const orderedProbabilities=plays.flatMap(p=>probabilities.has(String(p.id))?[probabilities.get(String(p.id))]:[]);
 const historical={header:{competitions:[c]},plays,scoringPlays:plays.filter(p=>p.scoringPlay),winprobability:orderedProbabilities};
 // A probability for an unchanged, verified observation survives an optional
 // field omission. A new possession/foul/play invalidates that current estimate.
 const last=orderedProbabilities.at(-1),lastPlay=last&&plays.find(p=>String(p.id)===String(last.playId));
 const currentProbability=headerMatches&&lastPlay&&withinScore(lastPlay,c)&&
  Number(lastPlay.homeScore)===Number(c.competitors.find(t=>t.homeAway==='home')?.score)&&
  Number(lastPlay.awayScore)===Number(c.competitors.find(t=>t.homeAway==='away')?.score)&&
  (!nextId||compare(seq(lastPlay,game.id),nextId)>=0);
 let current=headerMatches ? {...summary,header:{...summary.header,competitions:[c]},plays,scoringPlays:historical.scoringPlays,winprobability:currentProbability?orderedProbabilities:[]} : null;
 const correctedClockOnly=prior&&unchanged&&!newerEvent&&!olderEvent&&Math.abs((position(game,c)??0)-(before??0))<=2&&
  fingerprint({...c,status:{...c.status,displayClock:prior.status?.displayClock}})===e.currentKey;
 if(!currentProbability&&(e?.currentKey===currentKey||correctedClockOnly)&&e.currentProbability){
  current={...current,header:{competitions:[c]},plays,scoringPlays:historical.scoringPlays,winprobability:clone(e.currentProbability)};
 }
 if(playerPoints.size){
  // Historical player totals are facts. Missing blocks do not retract them;
  // explicit later point totals (including corrections downward) replace them.
  current={...current,header:current?.header||{competitions:[c]},boxscore:{...current?.boxscore,players:[{statistics:[{labels:['PTS'],athletes:[...playerPoints.values()].map(p=>({athlete:{id:p.id,displayName:p.name},stats:[String(p.points)]}))}]}]}};
 }
 const evidence={identity:identity(game),competition:compactCompetition(c),plays,probabilities:orderedProbabilities,currentKey,
  playerPoints:[...playerPoints.values()],currentProbability:current?.winprobability?.length?current.winprobability:null};
 // Plenty of room for a complete regulation/OT basketball ledger, bounded per
 // game. On overflow retain the last verified ledger rather than a false prefix.
 if(plays.length<=3000&&JSON.stringify(evidence).length<=750000)game.basketballEvidence=evidence;
 game.basketballFacts=basketballFacts(plays,c,game.sport);
 game.historicalEvidenceRetained=Boolean(e?.plays?.length&&(!headerMatches||incoming.length<e.plays.length));
 // The legacy validator sees the reconciled scoreboard too, including valid
 // clock corrections. Its WeakMap must not resurrect the previous clock.
 game.liveRawStatus=c.status;game.liveRawSituation=c.situation;
 game.teams.forEach(t=>{if(Number.isFinite(totals[String(t[8])]))t[2]=String(totals[String(t[8])]);});
 delete game.summaryState;
 return {competition:c,summary:current,history:historical,rawCurrent:Boolean(headerMatches&&!stale)};
}
function withinScore(p,c){
 const home=Number(c.competitors?.find(t=>t.homeAway==='home')?.score),away=Number(c.competitors?.find(t=>t.homeAway==='away')?.score);
 return (p.homeScore==null||Number(p.homeScore)<=home)&&(p.awayScore==null||Number(p.awayScore)<=away);
}
function compactPlay(p){return Object.fromEntries(['id','sequenceNumber','period','clock','homeScore','awayScore','text','type','scoringPlay','team','wallclock'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));}
function basketballFacts(plays,c,sport){
 const deepest={home:0,away:0};let comeback=null,leader=0,lateLeadChanges=0;
 for(const p of plays.filter(p=>p.scoringPlay)){
  const margin=Number(p.homeScore)-Number(p.awayScore);
  deepest.home=Math.max(deepest.home,-margin);deepest.away=Math.max(deepest.away,margin);
  for(const side of ['home','away'])if(deepest[side]>=8&&(side==='home'?margin>=0:margin<=0)&&(!comeback||deepest[side]>comeback.deficit))
   comeback={team:c.competitors.find(t=>t.homeAway===side)?.team?.displayName,deficit:deepest[side]};
  const sign=Math.sign(margin),clock=String(p.clock?.displayValue||'').split(':').map(Number),remaining=clock[0]*60+clock[1];
  if(sign&&leader&&sign!==leader&&Number(p.period?.number)>=(sport==='NBA'?4:2)&&remaining<=300)lateLeadChanges++;
  if(sign)leader=sign;
 }
 return {comeback,lateLeadChanges};
}
module.exports={supports,preserveBasketballState,reconcileBasketball};

// Reconcile observations, never average ratings or limit legitimate score swings.
const {normalizedTime}=require('./shared/time.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const supported=g=>['NFL','CFB'].includes(g.sport);
const identity=g=>`${g.sport}:${g.id}:${g.teams.map(t=>String(t[8])).sort().join(',')}`;
function competitionFor(g){return {status:g.liveRawStatus,situation:g.liveRawSituation,
 competitors:g.teams.map((t,i)=>({team:{id:String(t[8])},homeAway:i?'home':'away',score:t[2]}))};}
function stateKey(c){
 const s=c?.situation||{},p=s.lastPlay;
 return JSON.stringify({period:c?.status?.period,clock:c?.status?.displayClock,state:c?.status?.type?.state,
  scores:(c?.competitors||[]).map(t=>[String(t.team?.id),String(t.score)]).sort(),
  situation:Object.fromEntries(['possession','down','distance','yardLine','isRedZone','homeTimeouts','awayTimeouts','outs','onFirst','onSecond','onThird'].map(k=>[k,s[k]??null])),
  play:p?{id:p.id,text:p.text,type:p.type?.text,scoreValue:p.scoreValue,team:p.team?.id}:null});
}
function sequence(p,event){const id=String(p?.id||'');return /^\d+$/.test(id)&&id.startsWith(String(event))?Number(id.slice(String(event).length)):null;}
function preserveObservation(game,previous){
 if(!supported(game)||game.state!=='live'||previous?.state!=='live'||identity(game)!==identity(previous))return;
 game.priorObservation={identity:identity(game),competition:competitionFor(previous)};
 if(previous.liveInputEvidence)game.liveInputEvidence=clone(previous.liveInputEvidence);
}
function reconcileObservation(game,c,summary){
 if(!supported(game)||game.state!=='live'||!c)return c;
 const prior=game.priorObservation?.identity===identity(game)?game.priorObservation.competition:null;
 if(!prior)return c;
 const at=normalizedTime(game.sport,c).elapsedSeconds,before=normalizedTime(game.sport,prior).elapsedSeconds;
 const seq=sequence(c.situation?.lastPlay,game.id),old=sequence(prior.situation?.lastPlay,game.id);
 const older=seq!==null&&old!==null&&seq<old,newer=seq!==null&&old!==null&&seq>old;
 const header=summary?.header?.competitions?.[0];
 const agrees=header&&(c.competitors||[]).every(t=>String(header.competitors?.find(x=>String(x.team?.id)===String(t.team?.id))?.score)===String(t.score));
 const lower=(c.competitors||[]).some(t=>Number(t.score)<Number(prior.competitors.find(x=>String(x.team?.id)===String(t.team?.id))?.score));
 const correction=lower&&agrees&&at!==null&&before!==null;
 // Without ordered provider IDs, a small clock correction remains legitimate.
 // A score correction corroborated by the independent summary also wins.
 const rejected=!correction&&((older&&at!==null&&before!==null&&at<=before)||
  (at!==null&&before!==null&&before-at>2&&!newer));
 game.liveUpdateRejected=rejected;
 if(rejected)c={...c,...clone(prior)};
 // The legacy validator's local WeakMap must see this same accepted clock.
 game.liveRawStatus=c.status;game.liveRawSituation=c.situation;
 for(const t of game.teams){const score=c.competitors?.find(x=>String(x.team?.id)===String(t[8]))?.score;if(score!=null)t[2]=String(score);}
 if(!rejected&&at!==null&&before!==null&&at<before)delete game.summaryState;
 return c;
}
function compactSummary(summary,c){
 const spot=s=>s&&({...s,team:s.team&&{id:s.team.id}});
 const play=p=>({...Object.fromEntries(['id','sequenceNumber','period','clock','homeScore','awayScore','text','shortText','type','scoringPlay','scoreValue','statYardage'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]])),
  ...(p.team?{team:{id:p.team.id}}:{}),...(p.start?{start:spot(p.start)}:{}),...(p.end?{end:spot(p.end)}:{})});
 const drive=d=>d&&({id:d.id,result:d.result,description:d.description,start:spot(d.start),end:spot(d.end),plays:(d.plays||[]).map(play)});
 const header={season:summary.header?.season,competitions:[{...c,competitors:(c.competitors||[]).map(t=>({...t,team:{id:t.team?.id,displayName:t.team?.displayName,abbreviation:t.team?.abbreviation}}))}]};
 return {header,scoringPlays:summary.scoringPlays?.map(play),plays:summary.plays?.map(play),
  winprobability:summary.winprobability,boxscore:summary.boxscore,onIce:summary.onIce,
  drives:summary.drives&&{previous:summary.drives.previous?.map(drive),current:drive(summary.drives.current)}};
}
function sameStateSummary(game,c,summary,now=Date.now()){
 game.sameStateEvidenceRetained=false;
 const e=game.liveInputEvidence;
 if(!supported(game)||!e||e.identity!==identity(game)||stateKey(c)!==e.key||now<e.observedAt||now-e.observedAt>120000)return summary;
 if(!summary){game.sameStateEvidenceRetained=true;return clone(e.summary);}
 const merged={...summary};
 for(const key of ['scoringPlays','plays','winprobability'])if(!summary[key]?.length&&e.summary[key]?.length){merged[key]=clone(e.summary[key]);game.sameStateEvidenceRetained=true;}
 for(const key of ['scoringPlays','plays','winprobability']){
  const old=e.summary[key],incoming=summary[key],id=key==='winprobability'?'playId':'id';
  if(!incoming?.length||!old?.length||incoming.length>=old.length||!incoming.every(p=>p[id]!=null)||!old.every(p=>p[id]!=null))continue;
  const revisions=new Map(incoming.map(p=>[String(p[id]),p]));
  // A shortened resource is not a retraction. Only merge a subset of known
  // events; new events or a changed scoreboard require fresh evaluation.
  if(!incoming.every(p=>old.some(q=>String(q[id])===String(p[id]))))continue;
  merged[key]=old.map(p=>clone(revisions.get(String(p[id]))||p));game.sameStateEvidenceRetained=true;
 }
 for(const key of ['drives','boxscore','onIce'])if(summary[key]==null&&e.summary[key]!=null){merged[key]=clone(e.summary[key]);game.sameStateEvidenceRetained=true;}
 return merged;
}
function rememberInputs(game,c,summary,now=Date.now()){
 if(!supported(game)||!summary||game.sameStateEvidenceRetained||game.liveUpdateRejected)return;
 const compact=compactSummary(summary,c);
 if(JSON.stringify(compact).length<=180000)game.liveInputEvidence={identity:identity(game),key:stateKey(c),observedAt:now,summary:compact};
 else delete game.liveInputEvidence;
}
module.exports={preserveObservation,reconcileObservation,stateKey,competitionFor,sameStateSummary,rememberInputs};

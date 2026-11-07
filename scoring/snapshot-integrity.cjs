// Reconcile observations, never average ratings or limit legitimate score swings.
const {normalizedTime}=require('./shared/time.js');
const {revisionTime}=require('./provider-evidence.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const supported=g=>['NFL','CFB'].includes(g.sport);
const reconciles=g=>supported(g)||g.sport==='NHL';
const zeroClock=status=>/^0+(?:(?::0+(?:\.0+)?)|(?:\.0+))?$/.test(String(status?.displayClock||''));
const identity=g=>`${g.sport}:${g.id}:${g.teams.map(t=>String(t[8])).sort().join(',')}`;
function competitionFor(g){return {status:g.liveRawStatus,situation:g.liveRawSituation,
 competitors:g.teams.map((t,i)=>({team:{id:String(t[8])},homeAway:i?'home':'away',score:t[2]}))};}
function sameClockState(a,b){
 return Number(a?.status?.period)===Number(b?.status?.period)&&
  String(a?.status?.displayClock)===String(b?.status?.displayClock)&&
  a?.competitors?.length===2&&b?.competitors?.length===2&&a.competitors.every(t=>
   String(t.score)===String(b.competitors.find(x=>String(x.team?.id)===String(t.team?.id))?.score));
}
function stateKey(c){
 const s=c?.situation||{},p=s.lastPlay;
 return JSON.stringify({period:c?.status?.period,clock:c?.status?.displayClock,state:c?.status?.type?.state,
  scores:(c?.competitors||[]).map(t=>[String(t.team?.id),String(t.score)]).sort(),
  situation:Object.fromEntries(['possession','down','distance','yardLine','isRedZone','homeTimeouts','awayTimeouts','outs','onFirst','onSecond','onThird'].map(k=>[k,s[k]??null])),
  play:p?{id:p.id,text:p.text,type:p.type?.text,scoreValue:p.scoreValue,team:p.team?.id,start:p.start,end:p.end,revision:revisionTime(p)}:null});
}
function sequence(p,event){const id=String(p?.id||'');return /^\d+$/.test(id)&&id.startsWith(String(event))?Number(id.slice(String(event).length)):null;}
function preserveObservation(game,previous){
 if(!reconciles(game)||game.state!=='live'||previous?.state!=='live'||identity(game)!==identity(previous))return;
 const previousCompetition=competitionFor(previous);
 const sameAcceptedState=previous.priorObservation?.identity===identity(game)&&
  sameClockState(previous.priorObservation.competition,previousCompetition);
 game.priorObservation=previous.timingUncertain&&previous.priorObservation?.identity===identity(game)?clone(previous.priorObservation):
  {identity:identity(game),competition:previousCompetition,
   observedAt:sameAcceptedState&&Number.isFinite(previous.priorObservation.observedAt)
    ?previous.priorObservation.observedAt:null};
 game.timedLastTrusted=clone(previous.timedLastTrusted || (!previous.timingUncertain&&!previous.scoringPartial&&Number.isFinite(previous.score)?
  Object.fromEntries(['score','baseScore','openingScore','rawPregameScore','factors','live','momentumPoints','trajectoryScoring','historyOwnership','why','upsetText','upsetPoints','modelVersion','scoringPolicy'].map(key=>[key,previous[key]]).filter(([,value])=>value!==undefined)):null));
 if(previous.observationEvidence)game.observationEvidence=clone(previous.observationEvidence);
 if(previous.liveInputEvidence)game.liveInputEvidence=clone(previous.liveInputEvidence);
}
function corroboratedRevision(c,prior,header,at,before){
 const p=c.situation?.lastPlay,old=prior.situation?.lastPlay;
 if(p?.id==null||String(p.id)!==String(old?.id)||stateKey(c)===stateKey(prior))return null;
 const revisedPlay=JSON.stringify(p)!==JSON.stringify(old);
 if(!revisedPlay)return null;
 const nextRevision=revisionTime(p),oldRevision=revisionTime(old);
 if(nextRevision!==null&&oldRevision!==null&&nextRevision>oldRevision)return 'provider-revision-time';
 const sameScores=header&&(c.competitors||[]).every(t=>String(header.competitors?.find(x=>String(x.team?.id)===String(t.team?.id))?.score)===String(t.score));
 const sameClock=header&&Number(header.status?.period)===Number(c.status?.period)&&
  String(header.status?.displayClock)===String(c.status?.displayClock)&&header.status?.type?.state==='in';
 const fields=['possession','down','distance','yardLine','homeTimeouts','awayTimeouts'];
 if(sameScores&&sameClock&&fields.every(k=>header.situation?.[k]==null||String(header.situation[k])===String(c.situation?.[k])))return 'matching-summary-revision';
 // ESPN may revise a timeout in the scoreboard before summary catches up.
 // A bare changed ID/text or clock is insufficient: the revised event must
 // explicitly name the current clock and corroborate a changed field/timeout.
 const text=String(p.text||''),named=text.match(/\bat\s+(\d+):(\d{2})/i),clock=String(c.status?.displayClock||'').match(/^(\d+):(\d{2})$/);
 const namedClock=named&&clock&&Number(named[1])*60+Number(named[2])===Number(clock[1])*60+Number(clock[2]);
 const spot=c.situation?.yardLine,changedSpot=spot!=null&&Number(spot)!==Number(prior.situation?.yardLine)&&Number(p.end?.yardLine)===Number(spot);
 const timeoutChanged=['homeTimeouts','awayTimeouts'].some(k=>c.situation?.[k]!=null&&prior.situation?.[k]!=null&&Number(c.situation[k])<Number(prior.situation[k]));
 if(at!==null&&before!==null&&Number(c.status?.period)===Number(prior.status?.period)&&namedClock&&
  /timeout|runoff|clock.*(?:correct|reset)|after review/i.test(`${p.type?.text||''} ${text}`)&&(changedSpot||timeoutChanged))return 'scoreboard-event-corroboration';
 return null;
}
function reconcileObservation(game,c,summary){
 if(!reconciles(game)||game.state!=='live'||!c)return c;
 const prior=game.priorObservation?.identity===identity(game)?game.priorObservation.competition:null;
 const status=c.status||{},period=Number(status.period),finalPeriod=game.sport==='NHL'?3:4;
 const zero=zeroClock(status);
 // ESPN can label an in-progress transition "End of 4th" while the last
 // actual play is only the end of the third. The label is not a final whistle.
 const terminal=status.type?.completed===true||status.type?.state==='post';
 const play=c.situation?.lastPlay,lastId=String(play?.id||'');
 const zeroPlay=lastId&&[...(summary?.plays||[]),...(summary?.scoringPlays||[])].some(p=>
  String(p.id||'')===lastId&&Number(p.period?.number)===period&&
  /^0+(?:(?::0+(?:\.0+)?)|(?:\.0+))?$/.test(String(p.clock?.displayValue||''))&&
  (c.competitors||[]).every(t=>String(t.score)===String(p[t.homeAway==='home'?'homeScore':'awayScore'])));
 const transition=prior&&Number(prior.status?.period)<period&&
  (period===finalPeriod||game.sport==='NHL'&&period===4);
 if(zero&&transition&&!terminal&&!zeroPlay){
  game.timingUncertain=true;game.scoringPartial=true;game.evidenceQuality='partial';
  game.evidenceReasons=[...new Set([...(game.evidenceReasons||[]),'unconfirmed-clock'])];
  game.liveRawStatus={...status,displayClock:'',timingUncertain:true};
  if(game.timedLastTrusted)Object.assign(game,clone(game.timedLastTrusted));else game.score=null;
  return c;
 }
 delete game.timingUncertain;
 if(!prior){
  // Timestamp the first observation when it arrives, not at the next refresh.
  game.priorObservation={identity:identity(game),competition:clone(c),observedAt:Date.now()};
  return c;
 }
 const at=normalizedTime(game.sport,c).elapsedSeconds,before=normalizedTime(game.sport,prior).elapsedSeconds;
 // Game time cannot advance faster than real elapsed time. A provider's
 // premature "End of 4th Quarter" is not proof of a completed live game.
 const priorObservedAt=game.priorObservation?.observedAt;
 const elapsedWallSeconds=Number.isFinite(priorObservedAt)?(Date.now()-priorObservedAt)/1000:null;
 const explicitClockCorrection=/\b(clock correction|official review|clock reset)\b/i.test(String(c.situation?.lastPlay?.text||''))&&
  sameClockState(c,summary?.header?.competitions?.[0])&&
  corroboratedRevision(c,prior,summary.header.competitions[0],at,before);
 const fastForward=Number(status.period)===Number(prior.status?.period)&&
  at!==null&&before!==null&&elapsedWallSeconds!==null&&elapsedWallSeconds>=0&&
  elapsedWallSeconds<=3600&&at-before>Math.max(180,elapsedWallSeconds+90)&&
  status.type?.completed!==true&&status.type?.state!=='post'&&!explicitClockCorrection;
 if(fastForward){
  game.timingUncertain=true;game.scoringPartial=true;game.evidenceQuality='partial';
  game.liveUpdateRejected=true;
  game.observationIntegrity={status:'rejected',reason:'implausible-clock-advance'};
  game.evidenceReasons=[...new Set([...(game.evidenceReasons||[]),'implausible-clock-advance'])];
  game.liveRawStatus={...status,displayClock:'',timingUncertain:true};
  if(game.timedLastTrusted)Object.assign(game,clone(game.timedLastTrusted));else game.score=null;
  return c;
 }
 const seq=sequence(c.situation?.lastPlay,game.id),old=sequence(prior.situation?.lastPlay,game.id);
 const older=seq!==null&&old!==null&&seq<old,newer=seq!==null&&old!==null&&seq>old;
 const header=summary?.header?.competitions?.[0];
 const agrees=header&&(c.competitors||[]).every(t=>String(header.competitors?.find(x=>String(x.team?.id)===String(t.team?.id))?.score)===String(t.score));
 const lower=(c.competitors||[]).some(t=>Number(t.score)<Number(prior.competitors.find(x=>String(x.team?.id)===String(t.team?.id))?.score));
 const revision=corroboratedRevision(c,prior,header,at,before);
 const samePlay=c.situation?.lastPlay?.id!=null&&String(c.situation.lastPlay.id)===String(prior.situation?.lastPlay?.id);
 const matchingClock=header&&String(header.status?.displayClock)===String(c.status?.displayClock)&&Number(header.status?.period)===Number(c.status?.period);
 // Recover previously stored false Q4 zeroes without admitting ordinary clock
 // rollbacks. A later numbered play proves the game moved past the Q3 boundary.
 const recoveredFourthQuarter=supported(game)&&Number(prior.status?.period)===4&&zeroClock(prior.status)&&
  prior.status?.type?.state==='in'&&prior.status?.type?.completed!==true&&
  /end of 4th/i.test(String(prior.status?.type?.detail||''))&&
  /end of 3rd quarter/i.test(String(prior.situation?.lastPlay?.text||''))&&
  period===4&&!zero&&status.type?.state==='in'&&newer&&!lower;
 const correction=lower&&agrees&&!older&&at!==null&&before!==null&&
  Number(c.status?.period)===Number(prior.status?.period)&&(Math.abs(at-before)<=2||samePlay&&matchingClock);
 const priorKey=stateKey(prior),nextKey=stateKey(c),e=game.observationEvidence;
 const superseded=e?.identity===identity(game)?e.superseded||[]:[];
 const replay=superseded.includes(nextKey)&&nextKey!==priorKey;
 const nextRevision=revisionTime(c.situation?.lastPlay),oldRevision=revisionTime(prior.situation?.lastPlay);
 const olderRevision=String(c.situation?.lastPlay?.id)===String(prior.situation?.lastPlay?.id)&&nextRevision!==null&&oldRevision!==null&&nextRevision<oldRevision;
 // Without ordered provider IDs, a small clock correction remains legitimate.
 // A score correction corroborated by the independent summary also wins.
 const officialClockCorrection=at!==null&&before!==null&&before-at>2&&before-at<=120&&
  Number(c.status?.period)===Number(prior.status?.period)&&agrees&&matchingClock&&
  /\b(clock correction|official review|clock reset)\b/i.test(String(c.situation?.lastPlay?.text||''));
 const rejected=replay||olderRevision||!correction&&!revision&&!recoveredFourthQuarter&&((older&&at!==null&&before!==null&&at<=before)||
  (at!==null&&before!==null&&before-at>2&&!officialClockCorrection));
 game.liveUpdateRejected=rejected;
 if(nextKey!==priorKey||rejected||!game.observationIntegrity)
  game.observationIntegrity={status:rejected?'rejected':revision?'revised':'accepted',reason:rejected?(replay?'superseded-observation':olderRevision?'older-provider-revision':'out-of-order-observation'):revision||null};
 if(rejected)c={...c,...clone(prior)};
 else if(nextKey!==priorKey)game.observationEvidence={identity:identity(game),superseded:[...new Set([...superseded,priorKey])].slice(-16)};
 // The legacy validator's local WeakMap must see this same accepted clock.
 game.liveRawStatus=c.status;game.liveRawSituation=c.situation;
 for(const t of game.teams){const score=c.competitors?.find(x=>String(x.team?.id)===String(t[8]))?.score;if(score!=null)t[2]=String(score);}
 if(!rejected&&at!==null&&before!==null&&at<before)delete game.summaryState;
 // Repeated polls and rejected older inputs do not refresh the age of the
 // accepted provider state. A delayed catch-up can legitimately consume the
 // real time since that state was first observed.
 game.priorObservation={identity:identity(game),competition:clone(c),
  observedAt:(rejected||sameClockState(c,prior))&&Number.isFinite(priorObservedAt)?priorObservedAt:Date.now()};
 return c;
}
function compactSummary(summary,c){
 const spot=s=>s&&({...s,team:s.team&&{id:s.team.id}});
 const play=p=>({...Object.fromEntries(['id','sequenceNumber','period','clock','homeScore','awayScore','text','shortText','type','scoringPlay','scoreValue','statYardage','modified','lastModified','updatedAt'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]])),
  ...(p.team?{team:{id:p.team.id}}:{}),...(p.start?{start:spot(p.start)}:{}),...(p.end?{end:spot(p.end)}:{})});
 const drive=d=>d&&({id:d.id,result:d.result,description:d.description,start:spot(d.start),end:spot(d.end),plays:(d.plays||[]).map(play)});
 const header={season:summary.header?.season,competitions:[{...c,competitors:(c.competitors||[]).map(t=>({...t,team:{id:t.team?.id,displayName:t.team?.displayName,abbreviation:t.team?.abbreviation}}))}]};
 return {header,scoringPlays:summary.scoringPlays?.map(play),plays:summary.plays?.map(play),
  ...Object.fromEntries(['playsComplete','scoringPlaysComplete','hasMore','pagination','sportsRadarEvidence'].filter(k=>summary[k]!==undefined).map(k=>[k,summary[k]])),
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
 if(JSON.stringify(compact).length<=200000)game.liveInputEvidence={identity:identity(game),key:stateKey(c),observedAt:now,summary:compact};
 else delete game.liveInputEvidence;
}
module.exports={preserveObservation,reconcileObservation,stateKey,competitionFor,sameStateSummary,rememberInputs};

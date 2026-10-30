// Offline ESPN replay reconstruction. No production/scoring module imports this file.
import {readJson,contextOverridesPath,applyContextOverride} from '../calibration/helpers.mjs';
import {statusFor,periodFor,playPosition,situationFor,historicalCompetition,availableFields,
  situationUsable,copyDefined,checkpointSignature} from './replay-inputs.historical.mjs';

export const INPUT_PIPELINE_VERSION='espn-causal-replay-v2';
const overrides=readJson(contextOverridesPath,{events:{}});
const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const id=p=>String(p.id);
const wall=p=>Number.isFinite(Date.parse(p?.wallclock))?Date.parse(p.wallclock):null;
const football=s=>['NFL','CFB'].includes(s);
const score=p=>['homeScore','awayScore'].map(k=>numeric(p[k])?Number(p[k]):null);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const chronologicalDifference=(a,b)=>periodFor(a.play)-periodFor(b.play)||a.position-b.position;

function sourceEntries(fixture) {
  const s=fixture.summary||{},drives=[...(s.drives?.previous||[]),...(s.drives?.current?[s.drives.current]:[])];
  const driven=football(fixture.modelSport)?drives.flatMap((drive,driveIndex)=>
    (drive.plays||[]).map(play=>({play,drive,driveIndex,origin:'drive'}))):[];
  const entries=driven.length?driven:(s.plays||[]).map(play=>({play,origin:'plays'}));
  const byId=new Map(),conflicts=[];
  const add=entry=>{
    const p=entry.play,existing=p.id==null?null:byId.get(id(p));
    if(existing) {
      // Duplicate views may enrich flags, but conflicting state is never overwritten.
      const keys=['period','clock','homeScore','awayScore','start','end'];
      if(keys.some(k=>p[k]!=null&&existing.play[k]!=null&&!same(p[k],existing.play[k])))
        conflicts.push({playId:id(p),reason:'conflicting-duplicate-state'});
      return;
    }
    const item={...entry,sourceIndex:byId.size,play:{...p}};
    result.push(item);
    if(p.id!=null)byId.set(id(p),item);
  };
  const result=[];
  entries.forEach(add);
  if(driven.length)(s.plays||[]).forEach(play=>add({play,origin:'supplement'}));
  (s.scoringPlays||[]).forEach(play=>{
    const existing=byId.get(id(play));
    if(existing) existing.play.scoringPlay=existing.play.scoringPlay===true||play.scoringPlay===true;
    else add({play,origin:'supplement'});
  });
  return {entries:result,conflicts};
}

// Clock semantics are provider/sport specific: NHL elapsed; basketball/football
// remaining; MLB inning/half plus the retained pitch ledger (sequence restarts).
// For source inversions, clock needs independent wall-time OR sequence support.
// A clock/source disagreement with neither support is quarantined, not guessed.
// Sequence never breaks equal-clock source ties or overrides clock+source agreement.
export function chronologicalStream(fixture) {
  const {entries,conflicts}=sourceEntries(fixture),sport=fixture.modelSport;
  const exclusions=[...conflicts],repairs=[],unsupported=new Set(conflicts.map(x=>x.playId));
  const exclude=(e,reason,other)=>{
    exclusions.push({playId:id(e.play),reason,...(other?{conflictsWith:id(other.play)}:{})});
    unsupported.add(id(e.play));
  };
  for(const e of entries) {
    e.position=playPosition(sport,e.play);
    if(e.play.id==null)exclude(e,'missing-stable-play-identity');
    if(e.position===null)exclude(e,'unpositioned-event');
  }
  for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++) {
    const a=entries[i],b=entries[j];
    if(a.position===null||b.position===null)continue;
    const difference=chronologicalDifference(a,b);
    if(difference>0) {
      const w1=wall(a.play),w2=wall(b.play);
      const clockWall=w1!==null&&w2!==null&&w2<w1;
      // Retained NFL/NHL sequences support a game-wide order; basketball/CFB
      // contain counterexamples. Sequence fallback needs absent (not opposing)
      // wall evidence and agreement with the sport clock.
      const clockSequence=['NFL','NHL'].includes(sport)&&(w1===null||w2===null)&&numeric(a.play.sequenceNumber)&&numeric(b.play.sequenceNumber)&&
        Number(b.play.sequenceNumber)<Number(a.play.sequenceNumber);
      if(clockWall||clockSequence) repairs.push({playId:id(b.play),before:id(a.play),reason:'clock-corroborated-source-reorder',evidence:clockWall?'clock+wall':'clock+sequence'});
      else {exclude(a,'unresolved-clock-source-conflict',b);exclude(b,'unresolved-clock-source-conflict',a);}
    } else if(sport!=='MLB'&&difference<0&&numeric(a.play.sequenceNumber)&&numeric(b.play.sequenceNumber)&&
      Number(a.play.sequenceNumber)>Number(b.play.sequenceNumber)) {
      repairs.push({playId:id(b.play),after:id(a.play),reason:'sequence-conflicts-with-clock-and-source'});
    }
  }
  const ordered=entries.filter(e=>!unsupported.has(id(e.play)))
    .sort((a,b)=>chronologicalDifference(a,b)||a.sourceIndex-b.sourceIndex);
  // Never clamp a score to its previous maximum. Quarantine the contradictory
  // interval until an independent complete scoring snapshot is consistent again.
  // This does not resolve the omitted history; downstream reviews disclose it.
  let previous=[null,null],ambiguousScore=false;
  const stream=[];
  for(const e of ordered) {
    const current=score(e.play);
    const rollback=current.some((v,i)=>v!==null&&previous[i]!==null&&v<previous[i]);
    const explicitCorrection=e.play.scoreCorrection===true||/^score correction$/i.test(e.play.type?.text||'');
    if(explicitCorrection)ambiguousScore=false;
    if(rollback&&!explicitCorrection)ambiguousScore=true;
    if(ambiguousScore&&!rollback&&current.every(v=>v!==null)&&e.play.scoringPlay===true) {
      repairs.push({playId:id(e.play),reason:'score-snapshot-resynchronization-history-still-incomplete'});
      ambiguousScore=false;
    }
    if(ambiguousScore) {exclude(e,rollback?'unresolved-score-rollback':'depends-on-unresolved-score-rollback');continue;}
    if(rollback)repairs.push({playId:id(e.play),reason:'explicit-score-correction',before:previous,after:current});
    previous=current.map((v,i)=>v??previous[i]);
    stream.push(e);
  }
  return {stream,repairs,exclusions,sourceCount:entries.length};
}

const endpointKeys=['down','distance','yardsToEndzone'];
function scrimmage(source,teams) {
  if(!source||![1,2,3,4].includes(Number(source.down))||!numeric(source.distance)||Number(source.distance)<0||
    !numeric(source.yardsToEndzone)||Number(source.yardsToEndzone)<=0||Number(source.yardsToEndzone)>100||
    !teams.has(String(source.team?.id)))return null;
  const s=copyDefined(source,['down','distance','yardLine','yardsToEndzone','downDistanceText','shortDownDistanceText',
    'possessionText','homeTimeouts','awayTimeouts']);
  for(const k of endpointKeys)s[k]=Number(s[k]);
  s.possession=String(source.team.id);
  if(/&\s*goal\b/i.test(`${s.downDistanceText||''} ${s.shortDownDistanceText||''}`))s.isGoalToGo=true;
  if(s.yardsToEndzone<=20)s.isRedZone=true;
  return s;
}
function endpointConflicts(source,situation) {
  if(!source)return false;
  if(source.team?.id!=null&&String(source.team.id)!==situation.possession)return true;
  return endpointKeys.some(k=>numeric(source[k])&&Number(source[k])!==situation[k]);
}

// One reusable offline validation boundary; no scoring formulas live here.
export function validateFootballSituation(play,previous,teamIds,driveId=null) {
  const teams=new Set(teamIds.map(String)),type=play.type?.text||'',end=play.end;
  const empty=(state,reason)=>({state,situation:{},reason,driveId});
  // An explicit after-record pending-try flag is authoritative independently of
  // scrimmage down. Merely mentioning a PAT in retrospective TD prose is not.
  const pending=play.situation?.isTwoPointAttempt===true||end?.isTwoPointAttempt===true;
  if(pending) {
    const possession=play.situation?.possession??end?.team?.id;
    if(!teams.has(String(possession)))return empty('unresolved-try','explicit-try-missing-possession');
    return {state:'try',situation:{possession:String(possession),isTwoPointAttempt:true},reason:'explicit-pending-two-point',driveId};
  }
  if(/touchdown|field goal good|safety/i.test(type)||play.scoringPlay===true)
    return empty('scoring','scoring-record-is-not-current-scrimmage');
  if(/extra point|two.point|2pt|try\b|conversion/i.test(type))return empty('try-event','completed-try-not-pending');
  if(/kickoff|punt|intercept|opponent|opp fumble|muffed|field goal|fumble$/i.test(type)||play.isTurnover===true)
    return empty('transition','possession-transition-needs-new-scrimmage');
  if(/end|period|half|regulation/i.test(type))return empty('period-end','period-boundary');
  if(/timeout|two-minute warning/i.test(type)) {
    if(previous?.state!=='scrimmage'||(driveId!=null&&previous.driveId!=null&&driveId!==previous.driveId))
      return empty('unresolved-timeout','timeout-without-continuing-possession');
    if(endpointConflicts(play.start,previous.situation)||endpointConflicts(end,previous.situation))
      return empty('unresolved-timeout','timeout-endpoint-conflicts-with-continuity');
    return {state:'scrimmage',situation:{...previous.situation},reason:'timeout-supported-continuity',driveId};
  }
  const situation=scrimmage(end,teams);
  if(!situation)return empty('unresolved','missing-or-invalid-scrimmage-endpoint');
  // End.team alone is not ownership evidence. Require a matching start team
  // on a continuing scrimmage event, or an explicit after-play possession.
  const explicit=play.situation?.possession!=null&&String(play.situation.possession)===situation.possession;
  const start=play.start?.team?.id;
  const continuing=/^(Rush|Pass Reception|Pass Incompletion|Sack|Penalty|Fumble Recovery \(Own\))$/i.test(type)&&
    start!=null&&String(start)===situation.possession;
  if(!explicit&&!continuing)return empty('unresolved','endpoint-team-not-supported-possession');
  return {state:'scrimmage',situation,reason:explicit?'explicit-after-play-possession':'scrimmage-start-end-agree',driveId};
}

function partialDrives(accepted,entry) {
  if(!accepted.some(e=>e.drive))return undefined;
  const grouped=new Map();
  for(const e of accepted)if(e.drive) {
    if(!grouped.has(e.driveIndex))grouped.set(e.driveIndex,{...copyDefined(e.drive,['id','team']),plays:[]});
    grouped.get(e.driveIndex).plays.push(e.play);
  }
  const current=grouped.get(entry.driveIndex),previous=[],incomplete=[];
  const acceptedIds=new Set(accepted.map(e=>id(e.play)));
  for(const [index,drive] of grouped)if(index!==entry.driveIndex) {
    const source=accepted.find(e=>e.driveIndex===index).drive;
    const complete=(source.plays||[]).every(p=>acceptedIds.has(id(p)));
    const last=drive.plays.filter(p=>!/timeout|two-minute/i.test(p.type?.text||'')).at(-1);
    const type=last?.type?.text||'';
    // Derive only an observed terminal result; never copy eventual drive prose.
    // Incomplete groups stay separate so missing results cannot become zero punts.
    const result=/touchdown/i.test(type)?'Touchdown':/^punt(?: return)?$/i.test(type)?'Punt':
      /field goal good/i.test(type)?'Field Goal':/field goal missed|blocked field goal/i.test(type)?'Missed Field Goal':
      /intercept|opponent|opp fumble/i.test(type)||last?.isTurnover===true?'Turnover':
      /safety/i.test(type)?'Safety':/end of half|end of game|end of regulation/i.test(type)?type:
      /^end period$/i.test(type)&&[2,4].includes(periodFor(last))?'End of Half':null;
    if(complete&&result)previous.push({...drive,result});
    else incomplete.push(drive);
  }
  return {previous,...(current?{current}:{}),...(incomplete.length?{incomplete}:{})};
}

function wpThrough(fixture,accepted,entry) {
  const ids=new Map(accepted.map((e,i)=>[id(e.play),i]));
  return (fixture.summary?.winprobability||[]).flatMap((item,sourceIndex)=>{
    const p=playPosition(fixture.modelSport,item),w=wall(item),cw=wall(entry.play);
    if(w!==null&&(cw===null||w>cw))return [];
    if(item.playId!=null) {
      if(!ids.has(String(item.playId)))return [];
      if(p!==null&&(p>entry.position||periodFor(item)>periodFor(entry.play)))return [];
      return [{item,index:ids.get(String(item.playId)),sourceIndex}];
    }
    // A clock alone cannot locate an observation inside an equal-clock group.
    // Defer until strictly past that clock, independent of future group length.
    if(p===null||p>=entry.position)return [];
    let index=-1;
    for(let i=0;i<accepted.length;i++)if(accepted[i].position<=p)index=i;
    return index<0?[]:[{item,index:index+.5,sourceIndex}];
  }).sort((a,b)=>a.index-b.index||a.sourceIndex-b.sourceIndex).map(x=>x.item);
}

export function replayCheckpoints(fixture) {
  const audit=chronologicalStream(fixture),checkpoints=[],accepted=[],rolling={home:null,away:null};
  const sourceIndices=new Map(sourceEntries(fixture).entries.map(e=>[id(e.play),e.sourceIndex]));
  const sourcePositions=new Map(sourceEntries(fixture).entries.map(e=>[id(e.play),playPosition(fixture.modelSport,e.play)]));
  const sourcePeriods=new Map(sourceEntries(fixture).entries.map(e=>[id(e.play),periodFor(e.play)]));
  const source=fixture.event?.competitions?.[0],sport=fixture.modelSport;
  if(!source)return {...audit,checkpoints,situations:[]};
  const teams=(source.competitors||[]).map(t=>String(t.team?.id)),situations=[];
  const scoringIds=new Set((fixture.summary?.scoringPlays||[]).map(id));
  let previousSituation=null,previousEntry=null,previousSignature=null;
  for(const entry of audit.stream) {
    const play=entry.play;
    accepted.push(entry);
    for(const side of ['home','away'])if(numeric(play[`${side}Score`]))rolling[side]=Number(play[`${side}Score`]);
    // An omitted record between these source entries breaks possession continuity.
    if(previousEntry&&audit.exclusions.some(x=>{
      const excludedSource=sourceIndices.get(x.playId);
      return excludedSource>previousEntry.sourceIndex&&excludedSource<entry.sourceIndex;
    }))previousSituation=null;
    const validated=football(sport)?validateFootballSituation(play,previousSituation,teams,entry.drive?.id??null):null;
    if(validated) {situations.push({playId:id(play),...validated});previousSituation=validated;}
    previousEntry=entry;
    if(!periodFor(play)||!Object.values(rolling).every(numeric))continue;
    const competition=historicalCompetition(source);
    competition.status=statusFor(sport,play);
    competition.situation=validated?.situation??situationFor(sport,play);
    for(const t of competition.competitors||[])t.score=String(rolling[t.homeAway]);
    const injected=applyContextOverride(fixture.event,competition,String(fixture.eventId||fixture.event.id),overrides);
    const event={...injected.event,status:competition.status,competitions:[injected.competition]};
    const plays=accepted.map(e=>e.play),wp=wpThrough(fixture,accepted,entry);
    const summary={header:{...copyDefined(fixture.summary?.header,['id','uid','season','week','league']),competitions:[injected.competition]},
      plays,scoringPlays:plays.filter(p=>p.scoringPlay===true||scoringIds.has(id(p))),winprobability:wp};
    const drives=partialDrives(accepted,entry);if(drives)summary.drives=drives;
    if(/end (?:of (?:the )?)?game|game (?:over|end)|final score/i.test(`${play.type?.text||''} ${play.text||''}`))continue;
    const usable=validated?['scrimmage','try'].includes(validated.state):situationUsable(sport,competition,summary);
    const missing=[];
    const excludedHistory=[...new Set(audit.exclusions.filter(e=>{
      const p=sourcePositions.get(e.playId);
      return p!==null&&p<=entry.position&&sourcePeriods.get(e.playId)<=periodFor(entry.play)&&sourceIndices.get(e.playId)<entry.sourceIndex;
    }).map(e=>e.playId))];
    if(excludedHistory.length)missing.push('unresolved earlier records excluded; historical evidence incomplete');
    if(!usable)missing.push('usable sport situation');
    if(['NBA','NCAAB'].includes(sport)&&!competition.situation.possession)missing.push('possession');
    if(sport==='NHL')missing.push('historical skaters/goalie state');
    if(sport==='MLB'&&!competition.situation.count)missing.push('count');
    const signature=checkpointSignature(competition,summary,play);
    if(signature===previousSignature)continue;
    previousSignature=signature;
    checkpoints.push({view:'high-fidelity',event,competition:injected.competition,summary,play,
      fullStreamAvailable:Boolean(fixture.summary?.plays?.length||fixture.summary?.drives),
      wpSourceAvailable:Boolean(fixture.summary?.winprobability?.length),wpHistoryPositioned:true,latestWpPositioned:Boolean(wp.length),
      missingSituationFields:missing,availableSituationFields:availableFields(competition,summary),sportSpecificSituationUsable:usable,
      inputPipelineVersion:INPUT_PIPELINE_VERSION,excludedHistory,...(validated?{situationValidation:validated}:{})});
  }
  return {...audit,checkpoints,situations};
}

export function highFidelityCheckpoints(fixture) {
  return replayCheckpoints(fixture).checkpoints;
}

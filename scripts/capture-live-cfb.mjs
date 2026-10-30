// Local observation only. No production policy selection or weight updates.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {repoRoot,loadCore} from '../calibration/helpers.mjs';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/game-model.js';
import {LIVE_FEEDS,summaryUrl} from '../alerts-worker/src/providers/espn.js';
import {chronologicalStream,validateFootballSituation} from './replay-inputs.mjs';
import shadow from '../calibration/shadow-candidate.cjs';
import policies from '../calibration/trajectory-live-policy.cjs';
import sourceHelper from '../test/helpers/scoring-source.cjs';

const baseline=policies.LIVE_NHL_ALLOCATION_POLICY,candidate=policies.LIVE_CFB_CONTEXT_POLICY;
export const policyNames=['production',baseline.id,candidate.id];
const hash=value=>createHash('sha256').update(value).digest('hex');
const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const num=v=>numeric(v)?Number(v):null;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const append=(file,value)=>fs.appendFileSync(file,JSON.stringify(value)+'\n');
const currentDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','');

export function scoreCaptured(core,rawEvent,rawSummary,capturedAt=new Date().toISOString()) {
  const event=structuredClone(rawEvent),c=event.competitions?.[0],issues=[];
  if(!c||c.competitors?.length!==2||c.competitors.some(t=>!numeric(t.score))||
      !numeric(c.status?.period)||!numeric(core.clockSeconds(c.status)))
    return {gameId:String(event.id??''),capturedAt,evaluated:false,issues:['missing-score-clock-or-teams'],ratings:null};
  if(c.status?.type?.state!=='in'||c.status?.type?.completed)
    return {gameId:String(event.id??''),capturedAt,evaluated:false,issues:['not-live'],ratings:null};
  const originalSituation=structuredClone(c.situation??{});
  c.situation={}; // Restore only validated current state, never drive-end defaults.
  const probe=normalizeEvent(event,'CFB');
  let summary=rawSummary ? structuredClone(rawSummary) : null;
  let audit=null,validation={state:'unresolved',situation:{},reason:'no-aligned-summary'},latest=null;
  if(summary) {
    const sc=summary.header?.competitions?.[0];
    const aligned=sc&&globalThis.SportsRadarDetail.validateLiveSummary(probe,c,summary)&&
      num(sc.status?.period)===num(c.status.period)&&core.clockSeconds(sc.status)===core.clockSeconds(c.status);
    if(!aligned) {issues.push('summary-not-aligned-with-scoreboard');summary=null;}
  } else issues.push('summary-capture-unavailable');
  if(summary) {
    audit=chronologicalStream({modelSport:'CFB',summary});
    const position=core.eventPosition('CFB',c);
    // Never attach later action to an earlier scoreboard capture. Do not repair
    // ambiguous ledgers here; disclose and omit the entire enrichment instead.
    if(audit.exclusions.length||audit.stream.some(e=>e.position>position+1e-9)) {
      issues.push(audit.exclusions.length?'ambiguous-summary-ledger':'summary-has-future-action');summary=null;
    } else {
      const ids=c.competitors.map(t=>String(t.team?.id??t.id));
      let previous=null;
      for(const entry of audit.stream)previous=validateFootballSituation(entry.play,previous,ids,entry.drive?.id??null);
      latest=audit.stream.at(-1);
      const scores=Object.fromEntries(c.competitors.map(t=>[t.homeAway,Number(t.score)]));
      const matches=latest&&Math.abs(latest.position-position)<1e-9&&
        num(latest.play.homeScore)===scores.home&&num(latest.play.awayScore)===scores.away;
      if(matches)validation=previous;
      if(originalSituation.isTwoPointAttempt===true)validation=validateFootballSituation({situation:originalSituation},null,ids);
      const possession=originalSituation.possession?.id??originalSituation.possession;
      const conflict=(possession!=null&&String(possession)!==validation.situation.possession)||
        ['down','distance','yardsToEndzone'].some(k=>numeric(originalSituation[k])&&Number(originalSituation[k])!==validation.situation[k]);
      if(conflict&&originalSituation.isTwoPointAttempt!==true)validation={state:'unresolved',situation:{},reason:'scoreboard-play-situation-conflict'};
      c.situation=structuredClone(validation.situation);
      // Explicit scoreboard timeouts are available context, not inferred counts.
      for(const k of ['homeTimeouts','awayTimeouts'])if(numeric(originalSituation[k]))c.situation[k]=Number(originalSituation[k]);
      summary.header.competitions[0].situation=structuredClone(c.situation);
      // The adapter's fallback to last.end predates validated current state.
      // Suppress it locally while retaining every historical play/score/clock.
      const end=summary.drives?.current?.plays?.at(-1);
      if(end)delete end.end;
    }
  }
  if(!['scrimmage','try'].includes(validation.state))issues.push('current-possession-unavailable');
  if(summary&&!summary.winprobability?.length)issues.push('win-probability-unavailable');
  const game=normalizeEvent(event,'CFB');enrichGame(game,summary);
  if(summary&&!game.lastSummaryAccepted)throw new Error('Shared snapshot validation rejected prepared summary');
  const before=JSON.stringify([event,summary]);
  const results=shadow.candidateTrajectoryRatings(core,game,c,summary,[baseline,candidate]);
  if(before!==JSON.stringify([event,summary]))throw new Error('Scoring mutated captured inputs');
  const compact=r=>({score:r.score,base:r.baseScore,live:r.liveBonus,history:r.momentumPoints,
    factors:r.factors,liveComponents:r.live.components,liveAggregation:r.live.aggregation,
    competitiveFloor:r.live.sportImpact.competitiveFloor??0,historyFactors:r.historyOwnership.combinedFactors,
    signedTrajectory:r.trajectoryScoring.adjustment,negativeTrajectory:r.trajectoryScoring.negativeAfterFloor,
    retainedHistory:r.historyOwnership.combinedPoints,currentTension:r.currentTensionPoints,
    genericLeverage:r.genericLeveragePoints,context:r.state.cfbContextRetention??{ordinaryWeight:r.state.retainedContextWeight},
    feasibility:r.state.comebackViability,historyRetention:r.historyOwnership.relevance.eventRetention});
  const ratings={production:{score:game.score,base:game.baseScore,live:game.live?.bonus??0,
    history:game.momentumPoints??0,factors:game.factors,liveComponents:game.live?.components??null},
    [baseline.id]:compact(results[0]),[candidate.id]:compact(results[1])};
  const latestWall=latest?.play.wallclock;
  const sourceAgeMs=latestWall&&Number.isFinite(Date.parse(latestWall))?Math.max(0,Date.parse(capturedAt)-Date.parse(latestWall)):null;
  if(sourceAgeMs===null)issues.push('source-age-unknown');
  if(!summary)issues.push('history-and-wp-unavailable');
  return {gameId:String(event.id),name:event.name??game.teams.map(t=>t[0]).join(' vs '),capturedAt,evaluated:true,
    inputSha256:hash(before),score:c.competitors.map(t=>({teamId:String(t.team?.id??t.id),side:t.homeAway,score:num(t.score)})),
    period:num(c.status.period),clock:c.status.displayClock??null,
    situation:{possession:c.situation.possession??null,down:num(c.situation.down),distance:num(c.situation.distance),
      yardsToEndzone:num(c.situation.yardsToEndzone),fieldPosition:results[1].state.footballState?.fieldPosition??null,
      isTwoPointAttempt:c.situation.isTwoPointAttempt??null},situationValidation:validation.reason,
    currentWinProbability:results[1].currentWinProbability,context:{opening:game.openingScore,openingFactors:game.openingFactors,
      teams:c.competitors.map(t=>({teamId:String(t.team?.id??t.id),rank:core.rankFor(t,'CFB')??null,records:t.records??null})),
      odds:c.odds??null,verifiedFactors:event.sportsRadarContextFactors??c.sportsRadarContextFactors??null},
    summaryAccepted:Boolean(summary),sourceAgeMs,issues,ratings};
}

export async function captureCycle({core,readJson,date=currentDate(),signal}) {
  const startedAt=new Date().toISOString(),found=new Map(),feeds=[],failures=[],games=[];
  for(const feed of LIVE_FEEDS.filter(f=>f.sport==='CFB')) {
    if(signal?.aborted)break;
    const url=new URL(feed.url);url.searchParams.set('dates',date);url.searchParams.set('limit',String(feed.limit));
    try {
      const board=await readJson(url.href);
      if(!Array.isArray(board.events))throw new Error('scoreboard missing events array');
      const potentiallyTruncated=board.events.length>=feed.limit;
      feeds.push({division:feed.division,ok:true,eventCount:board.events.length,potentiallyTruncated});
      for(const event of board.events) {
        if(!['pre','in','post'].includes(event.competitions?.[0]?.status?.type?.state))
          failures.push({gameId:String(event.id??''),division:feed.division,error:'unknown-event-state'});
        if(event.competitions?.[0]?.status?.type?.state!=='in')continue;
        if(!event.id){failures.push({division:feed.division,error:'live-event-missing-id'});continue;}
        found.set(String(event.id),event);
      }
    } catch(error) {feeds.push({division:feed.division,ok:false,error:error.message});}
  }
  for(const event of found.values()) {
    if(signal?.aborted)break;
    let summary=null,summaryFailure=null;
    try {summary=await readJson(summaryUrl({sport:'CFB',id:event.id}));}
    catch(error) {summaryFailure=error.message;failures.push({gameId:String(event.id),error:summaryFailure});}
    try {games.push({...scoreCaptured(core,event,summary),summaryFailure});}
    catch(error) {failures.push({gameId:String(event.id),error:error.message});
      games.push({gameId:String(event.id),evaluated:false,ratings:null,issues:['evaluation-failed'],error:error.message});}
  }
  const evaluated=games.filter(g=>g.evaluated),coverage={scope:'ESPN FBS + FCS live events returned for requested date',
    feeds,discovered:found.size,evaluated:evaluated.length,summaryAccepted:evaluated.filter(g=>g.summaryAccepted).length,
    incomplete:feeds.length!==2||feeds.some(f=>!f.ok||f.potentiallyTruncated)||failures.length>0||evaluated.length!==found.size||evaluated.some(g=>!g.summaryAccepted),
    missingGameIds:[...found.keys()].filter(id=>!evaluated.some(g=>g.gameId===id)),failures};
  const ranked=Object.fromEntries(policyNames.map(p=>[p,evaluated.slice().sort((a,b)=>b.ratings[p].score-a.ratings[p].score||a.gameId.localeCompare(b.gameId))
    .map((g,i)=>({rank:i+1,gameId:g.gameId,name:g.name,rating:g.ratings[p].score,score:Object.fromEntries(g.score.map(t=>[t.side,t.score])),
      period:g.period,clock:g.clock,issues:g.issues}))]));
  return {startedAt,finishedAt:new Date().toISOString(),date,coverage,games,ranked};
}

export function createReader({rawFile,signal,fetchImpl=fetch,retries=1,timeoutMs=12000}) {
  return async url=>{
    for(let attempt=0;attempt<=retries;attempt++) {
      signal?.throwIfAborted();const startedAt=new Date().toISOString();let response,body;
      try {
        response=await fetchImpl(url,{headers:{accept:'application/json'},signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(timeoutMs)])});
        body=await response.text();
        append(rawFile,{url,attempt,startedAt,capturedAt:new Date().toISOString(),status:response.status,
          date:response.headers.get('date'),cacheAgeSeconds:num(response.headers.get('age')),body});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        return JSON.parse(body);
      } catch(error) {
        append(rawFile,{url,attempt,startedAt,capturedAt:new Date().toISOString(),failure:error.message,cause:error.cause?.code??error.cause?.message??null});
        if(signal?.aborted||attempt===retries)throw error;
        await delay(500,undefined,{signal});
      }
    }
  };
}

async function main() {
  const args=process.argv.slice(2),value=flag=>{const i=args.indexOf(flag);return i<0?null:args[i+1];};
  const root=path.join(repoRoot,'work','live-cfb');
  if(args.includes('--latest')) {
    const latest=JSON.parse(fs.readFileSync(path.join(root,'latest.json')));
    console.log(JSON.stringify({run:latest.run,finishedAt:latest.finishedAt,coverage:latest.coverage,ranked:latest.ranked},null,2));return;
  }
  const seconds=Number(value('--interval-seconds')??60),date=value('--date')??currentDate();
  if(process.env.RATING_CORE_PATH)throw new Error('Live capture requires the repository core; unset RATING_CORE_PATH');
  if(!Number.isFinite(seconds)||seconds<30||seconds>3600)throw new Error('interval-seconds must be 30..3600');
  if(!/^\d{8}$/.test(date))throw new Error('date must be YYYYMMDD');
  const core=await loadCore(),run=`${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}`;
  const dir=path.join(root,run);fs.mkdirSync(dir,{recursive:true});
  const controller=new AbortController(),stop=()=>controller.abort();
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  const identityFiles=['calibration/shadow-candidate.cjs','calibration/trajectory-live-policy.cjs','calibration/trajectory-policy.cjs',
    'alerts-worker/src/game-model.js','alerts-worker/src/providers/espn.js','scripts/replay-inputs.mjs','scripts/replay-inputs.historical.mjs',
    'scripts/capture-live-cfb.mjs'];
  append(path.join(dir,'run.jsonl'),{run,startedAt:new Date().toISOString(),mode:'actual-provider',date,intervalSeconds:seconds,
    node:process.version,gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim(),
    gitStatus:execFileSync('git',['--no-pager','status','--short'],{cwd:repoRoot,encoding:'utf8'}).trim(),
    policies:{production:'preserved pre-upgrade production baseline (rating-core.js)',baseline,candidate},productionSourceSha256:hash(sourceHelper.scoringSource()),
    sources:Object.fromEntries(identityFiles.map(file=>[file,hash(fs.readFileSync(path.join(repoRoot,file)))])),
    note:'Observation only. Each cycle uses only its captured responses. Missing fields remain unavailable. Cadence is delay after cycle completion.'});
  const readJson=createReader({rawFile:path.join(dir,'raw.jsonl'),signal:controller.signal});
  console.log(`Capturing to ${dir}; Ctrl+C to stop. Keep this process running and computer awake.`);
  try {
    do {
      const cycle={run,...await captureCycle({core,readJson,date,signal:controller.signal})};
      append(path.join(dir,'scored.jsonl'),cycle);
      fs.writeFileSync(path.join(root,'latest.json'),JSON.stringify(cycle,null,2));
      console.log(JSON.stringify({at:cycle.finishedAt,coverage:cycle.coverage,ranked:cycle.ranked}));
      if(args.includes('--once')&&cycle.coverage.incomplete)process.exitCode=2;
      if(args.includes('--once')||controller.signal.aborted)break;
      await delay(seconds*1000,undefined,{signal:controller.signal});
    } while(!controller.signal.aborted);
  } catch(error) {if(!controller.signal.aborted)throw error;}
  finally {
    append(path.join(dir,'run.jsonl'),{stoppedAt:new Date().toISOString(),reason:controller.signal.aborted?'signal':'one-shot-complete'});
    process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});

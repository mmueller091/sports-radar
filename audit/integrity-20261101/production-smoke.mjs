// Public GET verification. /feed may schedule its existing background refresh;
// this script makes no explicit cron, refresh, check-games or push calls.
import fs from 'node:fs';
import {currentAlertGame,ALERT_DELIVERY_VERSION} from '../../alerts-worker/src/alert-delivery.js';
import runtime from '../../scoring/live-runtime.cjs';
const base='https://sports-radar-alerts.mmueller918.workers.dev';
const artifact=new URL('./production-smoke.json',import.meta.url);
const previous=fs.existsSync(artifact)?JSON.parse(fs.readFileSync(artifact,'utf8')):null;
const rolloutObservations=[...(previous?.rolloutObservations||[]),...(previous?[{executedAt:previous.executedAt,outcome:previous.outcome,healthModel:previous.health?.modelVersion,feedModel:previous.feed?.modelVersion,feedUpdatedAt:previous.feed?.updatedAt,freshness:previous.feed?.freshness}]:[])];
const requests=[];
async function get(path){
  if(!/^\/(health|feed|config)$/.test(path) && !/^\/game\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/.test(path))throw new Error('Disallowed route');
  const startedAt=new Date().toISOString();
  const response=await fetch(base+path,{headers:{Origin:'https://mmueller091.github.io'},signal:AbortSignal.timeout(25000)});
  requests.push({path,status:response.status,startedAt,receivedAt:new Date().toISOString(),cacheControl:response.headers.get('cache-control'),allowOrigin:response.headers.get('access-control-allow-origin')});
  if(!response.ok)throw new Error(`${path}: ${response.status}`);
  return response.json();
}
const result={executedAt:new Date().toISOString(),base,mode:'public GET routes only; /feed may schedule its normal background refresh; no explicit refresh/check-games or notification calls',rolloutObservations,requests,failures:[]};
const check=(condition,label)=>{if(!condition)result.failures.push(label);};
try{
  const health=await get('/health');
  result.health=health;
  check(health.ok===true,'Health not ok');
  check(health.modelVersion===runtime.MODEL_VERSION,'Health model mismatch');
  check(health.notificationVersion===ALERT_DELIVERY_VERSION,'Notification version mismatch');
  check(health.alertDelivery?.canonicalRevalidation===true && health.alertDelivery?.atomicClaim===true && health.alertDelivery?.maxQueueAgeMs===120000 && health.alertDelivery?.ambiguousRetry===false,'Delivery safeguard mismatch');
  const feed=await get('/feed');
  const games=feed.games||[],now=Date.now();
  result.feed={updatedAt:feed.updatedAt,modelVersion:feed.modelVersion,scoringPolicy:feed.scoringPolicy,freshness:feed.freshness,sourceErrors:feed.sourceErrors,gameCount:games.length};
  check(feed.modelVersion===runtime.MODEL_VERSION,'Feed model awaiting canonical publication');
  check(!feed.freshness?.stale,'Feed marked stale');
  if(feed.modelVersion!==runtime.MODEL_VERSION){result.outcome='awaiting-normal-cron';}
  else {
    const counts={};
    for(const game of games){const count=counts[game.sport] ||= {total:0,live:0,upcoming:0,completed:0,partial:0,invalid:0,complete:0,unclassified:0,alertEligible:0};
      count.total++;count[game.state]=(count[game.state]||0)+1;count[game.evidenceQuality||'unclassified']=(count[game.evidenceQuality||'unclassified']||0)+1;
      if(currentAlertGame(feed,game,now))count.alertEligible++;
      check(game.modelVersion===runtime.MODEL_VERSION,`Game model mismatch ${game.sport}:${game.id}`);
      check(game.score==null || Number.isFinite(Number(game.score)) && Number(game.score)>=0 && Number(game.score)<=100,`Out-of-range rating ${game.sport}:${game.id}`);
      if(['partial','invalid'].includes(game.evidenceQuality))check(!currentAlertGame(feed,game,now),`Incomplete game alert-eligible ${game.sport}:${game.id}`);
    }
    const forbidden=[];
    function inspect(value,path){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){if(['providerEventRevisions','observationEvidence'].includes(key))forbidden.push(path+'.'+key);else inspect(child,path+'.'+key);}}
    inspect(feed,'feed');check(forbidden.length===0,'Internal evidence caches exposed');
    result.feed.counts=counts;result.feed.internalCacheLeaks=forbidden;
    result.feed.liveGames=games.filter(g=>g.state==='live').map(g=>({sport:g.sport,id:g.id,status:g.status,teams:g.teams.map(t=>({name:t[0],score:t[2]})),rating:g.score,evidenceQuality:g.evidenceQuality,evidenceReasons:g.evidenceReasons,scoringPartial:g.scoringPartial,alertEligible:currentAlertGame(feed,g,now)}));
    const tennis=games.filter(g=>g.sport==='Tennis');
    result.tennis={count:tennis.length,states:counts.Tennis||{},scoreboardCoverageCount:tennis.filter(g=>g.tennisCoverage?.source==='scoreboard').length,unverifiedHistoryCount:tennis.filter(g=>g.tennisCoverage?.pointByPoint===false&&g.tennisCoverage?.history===false).length,startedPartialCount:tennis.filter(g=>g.state!=='upcoming'&&g.scoringPartial).length};
    check(tennis.length>0,'Tennis collection missing');
    for(const game of tennis){check(game.tennisCoverage?.pointByPoint===false&&game.tennisCoverage?.history===false,`Invented Tennis history ${game.id}`);check(game.state==='upcoming'||game.scoringPartial===true,`Tennis limits missing ${game.id}`);const provider=game.tennisMatch?.status?.type;const expected=provider?.completed||provider?.state==='post'?'completed':provider?.state==='in'?'live':provider?.state==='pre'?'upcoming':null;check(game.state===expected,`Tennis status disagrees with match ${game.id}`);}
    const selected=new Map();const pick=g=>{if(g)selected.set(`${g.sport}:${g.id}`,g);};
    games.filter(g=>g.state==='live').forEach(pick);
    for(const sport of Object.keys(counts))pick(games.find(g=>g.sport===sport&&g.state==='completed')||games.find(g=>g.sport===sport));
    pick(tennis.find(g=>g.state==='upcoming'));
    result.details=[];
    for(const canonical of selected.values()){
      const body=await get(`/game/${canonical.sport}/${canonical.id}`),game=body.sportsRadarGame;
      const samePublication=body.sportsRadarFreshness?.canonicalUpdatedAt===feed.updatedAt;
      const header=body.header?.competitions?.[0];
      const detail={sport:canonical.sport,id:canonical.id,state:game?.state,status:game?.status,rating:game?.score,modelVersion:game?.modelVersion,freshness:body.sportsRadarFreshness,coverage:body.sportsRadarCoverage,evidenceQuality:game?.evidenceQuality,scoringPartial:game?.scoringPartial,historySnapshots:body.sportsRadarHistory?.snapshots?.length||0,samePublication,canonicalRatingMatches:game?.score===canonical.score,canonicalTeamsMatch:JSON.stringify(game?.teams)===JSON.stringify(canonical.teams),headerPresent:Boolean(header)};
      check(game?.modelVersion===runtime.MODEL_VERSION,`Detail model mismatch ${canonical.sport}:${canonical.id}`);
      if(samePublication){check(detail.canonicalRatingMatches,`Same-publication rating mismatch ${canonical.sport}:${canonical.id}`);check(detail.canonicalTeamsMatch,`Same-publication teams mismatch ${canonical.sport}:${canonical.id}`);}
      if(canonical.sport==='Tennis')check(body.sportsRadarCoverage?.source==='scoreboard'&&body.sportsRadarCoverage?.pointByPoint===false,`Tennis detail coverage mismatch ${canonical.id}`);
      result.details.push(detail);
    }
    const config=await get('/config');result.config={hasPublicKey:typeof config.publicKey==='string'&&config.publicKey.length>0,pollSeconds:config.pollSeconds};
    check(result.config.hasPublicKey&&config.pollSeconds===60,'Config contract mismatch');
    result.outcome=result.failures.length?'failed':'passed';
  }
}catch(error){result.outcome='error';result.failures.push(String(error));}
fs.writeFileSync(artifact,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({outcome:result.outcome,healthModel:result.health?.modelVersion,feed:result.feed,tennis:result.tennis,detailCount:result.details?.length,requests:requests.length,failures:result.failures},null,2));
if(result.outcome!=='passed')process.exitCode=2;

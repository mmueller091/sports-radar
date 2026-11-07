// One-night, read-only observer. It never writes to SlateMeter or ESPN.
// Normal GET /feed requests may trigger SlateMeter's existing on-demand refresh.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';

const ESPN_BASE='https://site.api.espn.com/apis/site/v2/sports';
const FEED_URL='https://sports-radar-alerts.mmueller918.workers.dev/feed';
const SPORTS=[
  {sport:'NBA',path:'basketball/nba'},
  {sport:'NHL',path:'hockey/nhl'},
  {sport:'NCAAB',path:'basketball/mens-college-basketball'}
];
const SAMPLE_MS=5000;
const durationArgIndex=process.argv.indexOf('--duration-minutes');
const requestedMinutes=durationArgIndex>=0?Number(process.argv[durationArgIndex+1]):20;
if(!Number.isInteger(requestedMinutes)||requestedMinutes<1||requestedMinutes>30) {
  throw new Error('--duration-minutes must be an integer from 1 to 30');
}
const DURATION_MS=requestedMinutes*60*1000;
const MAX_GAMES_PER_SPORT=3;
const iso=ms=>new Date(ms).toISOString();
const scoreValue=value=>String(value?.displayValue ?? value?.value ?? value ?? '');
const gameKey=game=>`${game.sport}:${game.id}`;
const scoreKey=game=>`${gameKey(game)}:${game.awayScore}|${game.homeScore}`;
const csvCell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const csvRow=cells=>cells.map(csvCell).join(',');

function espnGames(sport,payload) {
  return (payload?.events||[]).flatMap(event=>{
    const competition=event.competitions?.[0];
    const competitors=competition?.competitors||[];
    const away=competitors.find(c=>c.homeAway==='away');
    const home=competitors.find(c=>c.homeAway==='home');
    if(!away||!home||!event.id)return [];
    const status=event.status||competition?.status||{};
    const state=status.type?.state||competition?.status?.type?.state||'';
    return [{sport,id:String(event.id),name:event.name||`${away.team?.displayName} at ${home.team?.displayName}`,
      state:state==='in'?'live':state==='post'?'completed':'upcoming',
      period:status.period||competition?.status?.period||null,
      clock:status.displayClock||competition?.status?.displayClock||'',
      awayScore:scoreValue(away.score),homeScore:scoreValue(home.score)}];
  });
}

function workerGames(feed) {
  return (feed?.games||[]).filter(g=>SPORTS.some(s=>s.sport===g.sport)).map(g=>({
    sport:g.sport,id:String(g.id),name:(g.teams||[]).map(t=>t[0]).join(' at '),
    state:g.state||'',period:g.period??null,clock:g.clock??'',
    awayScore:scoreValue(g.teams?.[0]?.[2]),homeScore:scoreValue(g.teams?.[1]?.[2]),
    excitement:g.score??null,feedUpdatedAt:feed.updatedAt||null,
    feedStale:feed.freshness?.stale===true,feedDegraded:feed.freshness?.degraded===true
  }));
}

function percentile(values,fraction) {
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.max(0,Math.ceil(fraction*sorted.length)-1)];
}

function pairChanges(changes) {
  const worker=new Map();
  for(const item of changes.filter(c=>c.source==='worker')) {
    const key=scoreKey(item);
    if(!worker.has(key))worker.set(key,item);
  }
  return changes.filter(c=>c.source==='espn').map(item=>{
    const match=worker.get(scoreKey(item));
    return {...item,workerSeenAt:match?.seenAt??null,
      workerFeedUpdatedAt:match?.feedUpdatedAt??null,
      delaySeconds:match?Number(((match.seenAt-item.seenAt)/1000).toFixed(3)):null};
  });
}

if(process.argv.includes('--self-test')) {
  const event={sport:'NBA',id:'123',awayScore:'12',homeScore:'10',seenAt:10000};
  assert.equal(espnGames('NHL',{events:[{id:'8',name:'A at B',competitions:[{competitors:[
    {homeAway:'home',score:'2',team:{displayName:'B'}},
    {homeAway:'away',score:'1',team:{displayName:'A'}}]}],status:{type:{state:'in'}}}]} )[0].awayScore,'1');
  assert.equal(workerGames({games:[{sport:'NBA',id:'123',state:'live',teams:[['A','A',12],['B','B',10]],score:73}]} )[0].homeScore,'10');
  assert.equal(pairChanges([{...event,source:'espn'}, {...event,source:'worker',seenAt:18000}])[0].delaySeconds,8);
  assert.equal(percentile([3,1,2],0.95),3);
  console.log('latency observer self-test passed');
  process.exit(0);
}

const smoke=process.argv.includes('--smoke');
const interval=smoke?1500:SAMPLE_MS;
const duration=smoke?3300:DURATION_MS;
const slateDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const parts=slateDate.formatToParts(new Date());
const byType=Object.fromEntries(parts.map(p=>[p.type,p.value]));
const dateKey=`${byType.year}${byType.month}${byType.day}`;
const destination=path.join(process.env.RUNNER_TEMP||process.cwd(),'latency-observation');
const errors=[];
const samples=[];
const rawEvidence=[];
const changes=[];
const selected=new Map();
const previous=new Map();
const counts={espn:0,worker:0};
const beganAt=Date.now();

async function getJson(url,source) {
  const started=performance.now();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),source==='worker'?18000:12000);
  try {
    const response=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const payload=await response.json();
    counts[source]++;
    return {payload,seenAt:Date.now(),requestMs:Math.round(performance.now()-started)};
  } catch(error) {
    errors.push({source,at:iso(Date.now()),message:String(error.message||error)});
    return null;
  } finally {clearTimeout(timer);}
}

const started=performance.now();
let nextTick=started;
while(performance.now()-started<duration) {
  await delay(Math.max(0,nextTick-performance.now()));
  nextTick+=interval;
  const responses=await Promise.all([
    ...SPORTS.map(({path})=>getJson(`${ESPN_BASE}/${path}/scoreboard?dates=${dateKey}&limit=100`,'espn')),
    getJson(FEED_URL,'worker')
  ]);
  const workerResponse=responses.at(-1);
  const workerById=new Map(workerResponse?workerGames(workerResponse.payload).map(game=>[gameKey(game),game]):[]);
  const rawWorkerById=new Map((workerResponse?.payload?.games||[]).map(game=>[`${game.sport}:${game.id}`,game]));
  for(let i=0;i<SPORTS.length;i++) {
    const {sport}=SPORTS[i],result=responses[i];
    if(!result)continue;
    const games=espnGames(sport,result.payload);
    const rawById=new Map((result.payload.events||[]).map(event=>[String(event.id),event]));
    if(!selected.has(sport)) {
      const ids=games.filter(game=>game.state==='live')
        .sort((a,b)=>Number(workerById.has(gameKey(b)))-Number(workerById.has(gameKey(a))))
        .slice(0,MAX_GAMES_PER_SPORT).map(g=>g.id);
      if(ids.length)selected.set(sport,new Set(ids));
    }
    for(const game of games) {
      if(!selected.get(sport)?.has(game.id))continue;
      observe('espn',game,result,rawById.get(game.id));
    }
  }
  if(workerResponse) {
    for(const game of workerById.values()) {
      if(!selected.get(game.sport)?.has(game.id))continue;
      observe('worker',game,workerResponse,rawWorkerById.get(gameKey(game)));
    }
  }
  // Slower requests skip a tick rather than creating overlapping fetches.
  nextTick=Math.max(nextTick,performance.now());
}

function observe(source,game,result,raw) {
  const stamp={source,sport:game.sport,id:game.id,name:game.name,seenAt:result.seenAt,
    score:`${game.awayScore}-${game.homeScore}`,awayScore:game.awayScore,homeScore:game.homeScore,
    state:game.state,period:game.period,clock:game.clock,
    requestMs:result.requestMs,feedUpdatedAt:game.feedUpdatedAt||null,
    feedStale:game.feedStale||false,feedDegraded:game.feedDegraded||false,
    excitement:game.excitement??null};
  samples.push(stamp);
  if(raw)rawEvidence.push({source,sport:game.sport,id:game.id,seenAt:iso(result.seenAt),raw});
  const key=`${source}:${gameKey(game)}`;
  const old=previous.get(key);
  const current=`${game.awayScore}|${game.homeScore}`;
  previous.set(key,current);
  if(old!==undefined && old!==current)changes.push(stamp);
}

const paired=pairChanges(changes);
const matched=paired.filter(p=>p.delaySeconds!==null);
const delays=matched.map(p=>p.delaySeconds);
const endedAt=Date.now();
const fmt=v=>v===null?'n/a':`${v.toFixed(1)}s`;
const selectedList=[...selected].flatMap(([sport,ids])=>[...ids].map(id=>`${sport}:${id}`));
const lines=[
  '# SlateMeter live latency observation',
  '',
  `- Window: ${iso(beganAt)} to ${iso(endedAt)} (${smoke?'smoke test':`${requestedMinutes}-minute target`})`,
  `- Poll interval: ${interval/1000} seconds; requests were simultaneous and non-overlapping`,
  `- Games: ${selectedList.join(', ')||'none live in sampled sports'}`,
  `- Successful fetches: ESPN ${counts.espn}; SlateMeter ${counts.worker}; errors ${errors.length}`,
  `- ESPN score changes: ${paired.length}; matched in SlateMeter: ${matched.length}; unmatched: ${paired.length-matched.length}`,
  `- Observed ESPN-to-Worker latency: median ${fmt(percentile(delays,0.5))}, 95th percentile ${fmt(percentile(delays,0.95))}, maximum ${fmt(delays.length?Math.max(...delays):null)}`,
  '',
  '| Sport | ESPN score changes | Matched | Median | P95 |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...SPORTS.map(({sport})=>{const all=paired.filter(p=>p.sport===sport),seen=all.filter(p=>p.delaySeconds!==null),ds=seen.map(p=>p.delaySeconds);return `| ${sport} | ${all.length} | ${seen.length} | ${fmt(percentile(ds,0.5))} | ${fmt(percentile(ds,0.95))} |`;}),
  '',
  'The first observed update in the public ESPN API is the baseline, not the exact time ESPN published it. Sampling uncertainty and varying request durations apply. Negative values can occur when the two public paths cache differently.',
  'This measures ESPN API to SlateMeter Worker. Browser rendering is not directly measured; the current visible-site poll interval is seven seconds.',
  'No changes were made to either service. The normal GET /feed endpoint can trigger its existing refresh and database writes when due.',
  '',
  '## Errors',
  ...(errors.length?errors.slice(0,20).map(e=>`- ${e.at}: ${e.source}: ${e.message}`):['- None']),
  ''
];
await mkdir(destination,{recursive:true});
await Promise.all([
  writeFile(path.join(destination,'report.md'),lines.join('\n')),
  writeFile(path.join(destination,'events.csv'),[
    csvRow(['sport','game_id','game','period','away_score','home_score','espn_first_seen_utc','worker_first_seen_utc','worker_feed_updated_utc','delay_seconds']),
    ...paired.map(p=>csvRow([p.sport,p.id,p.name,p.period,p.awayScore,p.homeScore,iso(p.seenAt),p.workerSeenAt?iso(p.workerSeenAt):'',p.workerFeedUpdatedAt,p.delaySeconds]))
  ].join('\n')+'\n'),
  writeFile(path.join(destination,'samples.jsonl'),samples.map(s=>JSON.stringify({...s,seenAt:iso(s.seenAt)})).join('\n')+'\n'),
  writeFile(path.join(destination,'raw-evidence.jsonl'),rawEvidence.map(e=>JSON.stringify(e)).join('\n')+'\n'),
  writeFile(path.join(destination,'errors.json'),JSON.stringify(errors,null,2)+'\n')
]);
console.log(lines.join('\n'));
console.log(`Report files: ${destination}`);

// Offline independent review of migration use of a stale, still-live cache.
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {refreshSportsData,MODEL_VERSION} from '../../alerts-worker/src/sports-feed.js';
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../../alerts-worker/schema.sql',import.meta.url),'utf8'));
const env={DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}}};
const now=Date.now();
const providerStillStale=process.argv.includes('--provider-still-stale');
const providerFails=process.argv.includes('--provider-fails');
const missingCache=process.argv.includes('--missing-cache');
const competition={status:{type:{state:'post',completed:true,shortDetail:'Final'},period:4,displayClock:'0:00'},competitors:[{homeAway:'away',team:{id:'1',displayName:'Away',abbreviation:'AWY'},score:'20'},{homeAway:'home',team:{id:'2',displayName:'Home',abbreviation:'HME'},score:'14'}]};
const event={id:'migration-stale-final',date:new Date(now-3*3600000).toISOString(),name:'Away at Home',competitions:[competition]};
const liveCompetition=structuredClone(competition);liveCompetition.status={type:{state:'in',completed:false,shortDetail:'Q4'},period:4,displayClock:'6:00'};
liveCompetition.competitors[0].score='14';
const cached={header:{competitions:[liveCompetition]},plays:[],scoringPlays:[],winprobability:[]};
db.prepare('INSERT INTO sports_feed VALUES (1,?)').run(JSON.stringify({modelVersion:'previous-model',updatedAt:new Date(now-60000).toISOString(),games:[]}));
const url='https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=migration-stale-final';
if(!missingCache)db.prepare('INSERT INTO sports_resources VALUES (?,?,?)').run(url,JSON.stringify(cached),now-5*60000);
const original=globalThis.fetch;let publication,metrics;
globalThis.fetch=async value=>{const url=new URL(value);if(url.pathname.endsWith('/summary')&&providerFails)throw new Error('Mock provider unavailable');return Response.json(url.pathname.endsWith('/summary')?(providerStillStale?cached:{header:{competitions:[competition]},plays:[],scoringPlays:[],winprobability:[]}):{events:url.pathname.includes('/college-football/')&&url.searchParams.get('groups')==='80'?[event]:[]});};
try{
  const feed=await refreshSportsData(env,now,{onPublished:value=>publication=structuredClone(value),log:value=>metrics=value});
  const game=publication?.games.find(g=>g.id===event.id);
  const result={case:'five-minute-old live summary must not become completed historical evidence during model migration',providerStillStale,providerFails,missingCache,published:Boolean(feed),model:game?.modelVersion,expectedModel:MODEL_VERSION,state:game?.state,score:game?.score,scoringPartial:game?.scoringPartial??null,evidenceQuality:game?.evidenceQuality??null,enrichmentPending:game?.enrichmentPending??null,scoreboard:{scoringPartial:game?.scoreboard?.scoringPartial??null,evidenceQuality:game?.scoreboard?.evidenceQuality??null,enrichmentPending:game?.scoreboard?.enrichmentPending??null},detailStale:game?.detailStale,summaryState:game?.summaryState,completedSnapshots:db.prepare("SELECT COUNT(*) n FROM sports_snapshots WHERE game_key=? AND state='completed'").get('CFB:'+event.id).n,metrics};
  const suffix=providerStillStale?'provider-stale':providerFails?'provider-fails':'provider-recovers';
  console.log(JSON.stringify(result,null,2));fs.writeFileSync(new URL(`./migration-review-${suffix}-after.json`,import.meta.url),JSON.stringify(result,null,2)+'\n');
}finally{globalThis.fetch=original;db.close();}

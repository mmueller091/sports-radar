import fs from 'node:fs';
import zlib from 'node:zlib';
const base='https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/';
const sources={scoreboard:base+'scoreboard?dates=20261101&limit=100',summary:base+'summary?event=401920982',history:'https://sports-radar-alerts.mmueller918.workers.dev/game/NCAAB/401920982',feed:'https://sports-radar-alerts.mmueller918.workers.dev/feed'};
fs.mkdirSync('test/fixtures/basketball-audit',{recursive:true});
const manifest={capturedAt:new Date().toISOString(),sources:{}};
for(const [name,url] of Object.entries(sources)) {
 const response=await fetch(url);if(!response.ok)throw Error(`${response.status} ${url}`);
 const payload=await response.json();
 fs.writeFileSync(`test/fixtures/basketball-audit/${name}.json.gz`,zlib.gzipSync(JSON.stringify(payload)));
 manifest.sources[name]={url};
 console.log(name,name==='summary'?{keys:Object.keys(payload),plays:payload.plays?.length,scoring:payload.scoringPlays?.length,wp:payload.winprobability?.length}:name==='history'?{keys:Object.keys(payload),history:payload.sportsRadarHistory}:name==='feed'?{model:payload.modelVersion,games:payload.games?.length}:payload.events?.map(e=>({id:e.id,name:e.name})));
}
fs.writeFileSync('test/fixtures/basketball-audit/manifest.json',JSON.stringify(manifest,null,2)+'\n');

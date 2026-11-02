import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
const base='https://sports-radar-alerts.mmueller918.workers.dev';
const dir='test/fixtures/production-integrity';fs.mkdirSync(dir,{recursive:true});
const feed=JSON.parse(fs.readFileSync('work/feed-before.json'));
const ids=['401856847','401858282','401873033','401920982','401873028','401909903','401873034','401892627','401873024'];
async function get(url){const r=await fetch(url);if(!r.ok)throw Error(`${r.status} ${url}`);return r.json();}
for(const id of ids){
 const game=feed.games.find(g=>String(g.id)===id);if(!game)throw Error('Missing '+id);
 const [summary,detail]=await Promise.all([get(`https://site.api.espn.com/apis/site/v2/sports/${game.providerPath}/summary?event=${id}`),get(`${base}/game/${game.sport}/${id}`)]);
 const event={...summary.header,date:game.startTime,competitions:summary.header.competitions};
 const fixture={sport:game.sport,event,summary,detail,game,capturedAt:new Date().toISOString()};
 fs.writeFileSync(`${dir}/${game.sport}-${id}.json.gz`,gzipSync(JSON.stringify(fixture)));
 console.log(JSON.stringify({id,sport:game.sport,teams:game.teams.map(t=>t[1]),rating:game.score,snapshots:detail.sportsRadarHistory?.snapshots?.length,lastScore:game.lastScore}));
}

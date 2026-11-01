import fs from 'node:fs';import {gzipSync} from 'node:zlib';
const dir='test/fixtures/live-sync';fs.mkdirSync(dir,{recursive:true});fs.mkdirSync('work/live-sync',{recursive:true});
const base='https://sports-radar-alerts.mmueller918.workers.dev';
async function get(url){const r=await fetch(url);if(!r.ok)throw Error(`${r.status} ${url}`);return r.json();}
const feed=await get(base+'/feed');fs.writeFileSync('work/live-sync/feed.json',JSON.stringify(feed));
const boards=await Promise.all([['football/college-football','80'],['football/college-football','81'],['hockey/nhl',''],['basketball/nba','']].map(async([p,g])=>get(`https://site.api.espn.com/apis/site/v2/sports/${p}/scoreboard?dates=20261031&limit=1000${g?'&groups='+g:''}`)));
for(const [sport,first,second]of [['CFB','Oklahoma State','Iowa State'],['CFB','Eastern Kentucky','Tarleton'],['NHL','Toronto','Vancouver'],['NBA','Minnesota','San Antonio']]){
 const g=feed.games.find(g=>g.sport===sport&&g.teams.some(t=>t[0].includes(first))&&g.teams.some(t=>t[0].includes(second)));if(!g)throw Error('Missing '+first);
 const detail=await get(`${base}/game/${sport}/${g.id}`),p=g.providerPath;
 const summary=await get(`https://site.api.espn.com/apis/site/v2/sports/${p}/summary?event=${g.id}`);
 const event=boards.flatMap(b=>b.events||[]).find(e=>e.id===g.id)||{...summary.header,date:g.startTime,competitions:summary.header.competitions};
 fs.writeFileSync(`${dir}/${sport}-${g.id}.json.gz`,gzipSync(JSON.stringify({sport,event,summary,game:g,history:detail.sportsRadarHistory,capturedAt:new Date().toISOString()})));
 console.log({sport,id:g.id,teams:g.teams.map(t=>t[0]),score:g.score,snapshots:detail.sportsRadarHistory?.snapshots?.length});
}

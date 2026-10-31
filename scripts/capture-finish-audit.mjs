import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
const dir='test/fixtures/finish-audit';fs.mkdirSync(dir,{recursive:true});
const worker='https://sports-radar-alerts.mmueller918.workers.dev';
async function get(url){const r=await fetch(url);if(!r.ok)throw Error(`${r.status} ${url}`);return r.json();}
const feed=await get(worker+'/feed');
fs.mkdirSync('work/finish-audit',{recursive:true});fs.writeFileSync('work/finish-audit/observed-feed.json',JSON.stringify(feed));
const targets=[['CFB','VMI'],['CFB','Indiana State'],['CFB','Arizona Wildcats'],['CFB','Northwestern'],['NHL','Buffalo'],['NHL','St. Louis'],['NHL','Nashville'],['NHL','Chicago']];
const boards=await Promise.all([
 ['football/college-football','20261031','80'],['football/college-football','20261031','81'],['hockey/nhl','20261030','']
].map(async([p,date,group])=>get(`https://site.api.espn.com/apis/site/v2/sports/${p}/scoreboard?dates=${date}&limit=1000${group?'&groups='+group:''}`)));
const events=[];
for(const [sport,needle] of targets){
 let game=feed.games.find(g=>g.sport===sport&&JSON.stringify(g.teams).includes(needle));
 const path=sport==='CFB'?'football/college-football':'hockey/nhl';
 if(!game){for(const date of ['20261031','20261030']){
  const board=await get(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${date}&limit=1000${sport==='CFB'?'&groups=81':''}`);
  const e=board.events?.find(e=>e.name.includes(needle));if(e){game={id:e.id,sourceEvent:e};break;}
 }}
 if(!game){console.log('MISSING',sport,needle);continue;}
 const summary=await get(`https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${game.id}`);
 const event=boards.flatMap(b=>b.events||[]).find(e=>String(e.id)===String(game.id))||game.sourceEvent||{...summary.header,competitions:summary.header.competitions};
 if(!event.date)event.date=game.startTime;
 const fixture={modelSport:sport,event,summary,capturedAt:new Date().toISOString()};
 fs.writeFileSync(`${dir}/${sport}-${game.id}.json.gz`,gzipSync(JSON.stringify(fixture)));events.push({sport,id:game.id,name:event.name||needle,score:game.score});
 console.log(events.at(-1),summary.header.competitions[0].status);
}
for(const {sport,id} of events){
 const detail=await get(`${worker}/game/${sport}/${id}`);
 fs.writeFileSync(`${dir}/history-${sport}-${id}.json`,JSON.stringify(detail.sportsRadarHistory||{}));
}
console.log(events);

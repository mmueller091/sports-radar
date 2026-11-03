// Local GET-only visual QA server. Captured/replayed data; never production writes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/live-game-model.js';
const require=createRequire(import.meta.url),fixtures=require('../test/helpers/live-sync.cjs');
const feed=JSON.parse(fs.readFileSync('work/final-quality/feed.json'));
const report=JSON.parse(fs.readFileSync('audit/final-quality-20261103/examples.json'));
const selected=new Map(report.rows.map(r=>[`${r.game.sport}:${r.id}`,r.game]));
const summaries=new Map();
for(const r of report.rows){const game=r.game;summaries.set(`${game.sport}:${game.id}`,{
 header:{id:game.id,competitions:[game.sourceCompetition||{status:{type:{state:'pre'}},competitors:[]}]},sportsRadarGame:game,sportsRadarHistory:{snapshots:[]}});}
for(const name of ['NBA-401909901','CFB-401856847','NHL-401892621']){
 const f=fixtures.read(name),game=normalizeEvent(structuredClone(f.event),f.sport);
 if(f.game.pregameBaseline)game.pregameBaseline=structuredClone(f.game.pregameBaseline);
 enrichGame(game,structuredClone(f.summary));selected.set(`${game.sport}:${game.id}`,game);
 summaries.set(`${game.sport}:${game.id}`,{...f.summary,sportsRadarGame:game,sportsRadarHistory:f.history});
}
const games=new Map(feed.games.map(g=>[`${g.sport}:${g.id}`,g]));for(const [key,g]of selected)games.set(key,g);
const root=path.resolve('dist'),port=4173,types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
 const url=new URL(req.url,'http://127.0.0.1:'+port),json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 if(url.pathname==='/api/feed')return json({...feed,games:[...games.values()],updatedAt:new Date().toISOString(),freshness:{stale:false,degraded:false}});
 const match=/^\/api\/game\/([A-Za-z]+)\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
 if(match){const summary=summaries.get(`${match[1]}:${match[2]}`);if(!summary){res.writeHead(404);return json({error:'Not in visual audit fixture'});}
   return json({...summary,sportsRadarFreshness:{updatedAt:new Date().toISOString(),stale:false}});}
 if(url.pathname.startsWith('/api/metadata/'))return json({teams:{}});
 if(url.pathname.startsWith('/api/')){res.writeHead(404);return json({error:'Local audit has no mutating API'});}
 if(url.pathname==='/alert-config.js'){res.setHeader('Content-Type','text/javascript');return res.end("globalThis.SPORTS_RADAR_ALERTS_URL='/api';");}
 if(url.pathname==='/sw.js'){res.setHeader('Content-Type','text/javascript');return res.end("self.addEventListener('install',()=>self.skipWaiting()); self.addEventListener('activate',e=>e.waitUntil(self.registration.unregister()));");}
 let file;try{file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));}catch{res.writeHead(400);return res.end();}
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
server.listen(port,'127.0.0.1',()=>console.log(`Audit replay at http://127.0.0.1:${port}/ — ${games.size} captured games, no production writes`));

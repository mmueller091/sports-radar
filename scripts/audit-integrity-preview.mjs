// Local-only visual QA of the actual built frontend with explicit synthetic
// audit cases. No provider requests, subscriptions or notification transports.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/live-game-model.js';
import runtime from '../scoring/live-runtime.cjs';
const port=Number(process.env.AUDIT_PORT||8179),origin=`http://127.0.0.1:${port}`;
const kneels=JSON.parse(fs.readFileSync('test/fixtures/audit-20261101/cfb-legal-kneels.json')).inputs;
const inputs=[structuredClone(kneels[1])];
function make(sport,id,home,away,period,clock,detail,situation={}){
 const c={id,status:{period,displayClock:clock,type:{state:'in',completed:false,detail}},situation,competitors:[{homeAway:'away',score:String(away),team:{id:'a',displayName:'Audit Away',abbreviation:'AWY'}},{homeAway:'home',score:String(home),team:{id:'h',displayName:'Audit Home',abbreviation:'HME'}}]};
 return {sport,event:{id,date:new Date().toISOString(),competitions:[c]},summary:{header:{competitions:[c]},plays:[]}};
}
inputs.push(make('MLB','audit-mlb',3,7,9,'','Bottom 9th',{outs:0,onFirst:true,onSecond:true,onThird:true}));
inputs.push(make('NHL','audit-nhl',3,3,2,'0:41','2nd period'));
const cases=inputs.map(i=>{
 i.event.date=new Date().toISOString();const game=normalizeEvent(i.event,i.sport);enrichGame(game,i.summary);return {game,summary:i.summary};
});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{
 const url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
 const json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
 if(req.method!=='GET'){res.writeHead(405);return json({error:'Visual QA is read-only'});}
 if(url.pathname==='/mobile'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>Sports Radar mobile audit: 390 x 844</title><style>body{margin:12px;background:#111;color:#eee;font:16px sans-serif}iframe{width:390px;height:844px;border:1px solid #555;display:block}</style><p>Actual candidate frontend at 390 x 844 CSS pixels. Synthetic audit cases.</p><iframe title="Sports Radar mobile preview" src="/"></iframe>');}
 if(url.pathname==='/alert-config.js'){res.setHeader('Content-Type','text/javascript');return res.end(`globalThis.SPORTS_RADAR_ALERTS_URL=${JSON.stringify(origin+'/api')};`);}
 if(url.pathname==='/api/feed')return json({modelVersion:runtime.MODEL_VERSION,updatedAt:new Date().toISOString(),sourceErrors:[],freshness:{stale:false},games:cases.map(x=>x.game)});
 if(url.pathname.startsWith('/api/game/')){const c=cases.find(x=>url.pathname===`/api/game/${x.game.sport}/${x.game.id}`);return json(c?{...c.summary,sportsRadarGame:c.game,sportsRadarFreshness:{stale:false},sportsRadarHistory:{snapshots:[]}}:{});}
 if(url.pathname.startsWith('/api/'))return json({configured:false,enabled:false,modelVersion:runtime.MODEL_VERSION,contexts:[]});
 const file=path.resolve('dist','.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(path.resolve('dist')+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
}).listen(port,'127.0.0.1',()=>console.log(`Synthetic local QA: ${origin} (mobile ${origin}/mobile); model ${runtime.MODEL_VERSION}`));

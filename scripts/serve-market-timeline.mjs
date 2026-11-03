// Local-only replay and visual QA. Never shipped in dist.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
const root=path.resolve('dist'),audit=path.resolve('audit/market-timeline-20261103');
const read=n=>JSON.parse(gunzipSync(fs.readFileSync(`test/fixtures/market-timeline/${n}.json.gz`)));
const feed=read('production-games'),pelicans=read('pelicans-grizzlies');
const replay=JSON.parse(gunzipSync(fs.readFileSync('test/fixtures/timeline-clarity/NBA-401909903.json.gz'))).detail;
const live=JSON.parse(read('pelicans-stored-rows').find(r=>r.state==='live').normalized_state);live.id='replay-live';
// Serve archived live state only through its detail route: its original model
// version must not masquerade as a current canonical-feed observation.
const versions=new Map(['app.js','game-center.js','styles.css'].map(p=>[p,execFileSync('git',['show',`75c39cc:${p}`],{maxBuffer:8e6})]));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
const presets=[['NBA','401909914','Pelicans–Grizzlies'],['NHL','401892634','Jets–Canadiens'],['NHL','401892636','Oilers–Devils'],['NBA','replay-live','Archived live replay'],['NBA','401909903','Celtics–Magic']];
const telemetry=[];
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1:5537'),before=u.pathname.startsWith('/before/'),pathname=before?u.pathname.slice(7):u.pathname;
 const send=(body,type='application/json')=>{res.setHeader('Content-Type',type+'; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(body);};
 if(u.pathname==='/qa-event'&&req.method==='POST'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{telemetry.push(JSON.parse(body));fs.writeFileSync(path.join(audit,'browser-checks.json'),JSON.stringify(telemetry,null,2));send('{}');});return;}
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 if(pathname==='/api/feed')return send(JSON.stringify({...feed,updatedAt:new Date().toISOString()}));
 if(pathname.startsWith('/api/game/')){const id=pathname.split('/').at(-1),g=feed.games.find(g=>g.id===id);return send(JSON.stringify(id==='401909914'?pelicans:id==='401909903'?replay:id==='replay-live'?{...pelicans,sportsRadarGame:live,sportsRadarHistory:{snapshots:pelicans.sportsRadarHistory.snapshots.filter(p=>p.state!=='completed')}}:{sportsRadarGame:g}));}
 if(pathname.startsWith('/api/'))return send('{}');
 if(pathname==='/alert-config.js')return send("globalThis.SPORTS_RADAR_ALERTS_URL='/api';",'text/javascript');
 if(pathname==='/sw.js'){res.writeHead(404);return res.end();}
 if(u.pathname==='/qa'){
  const width=['1440','390','320'].includes(u.searchParams.get('width'))?Number(u.searchParams.get('width')):1440;
  const selected=presets.find(p=>p[1]===u.searchParams.get('id'))||presets[0],version=['before','production'].includes(u.searchParams.get('version'))?u.searchParams.get('version'):'after';
  const query=(w=width,id=selected[1],v=version)=>`/qa?width=${w}&id=${id}&version=${v}`;
  return send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>SlateMeter market / timeline QA</title><style>body{margin:0;background:#e9e4da;font:14px/1.4 system-ui;color:#202527}nav{padding:9px}a{display:inline-block;margin:3px 10px}iframe{border:1px solid #777;display:block;width:${width}px;height:1050px;${width===1440?'zoom:.82':''}}</style><nav><b>${version.toUpperCase()} · ${width}px · ${version==='production'?'actual live website':'captured production replay'}</b><br>${[1440,390,320].map(w=>`<a href="${query(w)}">${w}px</a>`).join('')}<a href="${query(width,selected[1],version==='before'?'after':'before')}">Switch before / after</a><br>${presets.map(p=>`<a href="${query(width,p[1])}">${p[2]}</a>`).join('')}</nav><iframe title="SlateMeter QA ${width}px" src="${version==='production'?'https://slatemeter.app/':version==='before'?'/before/':'/'}#game/${selected[0]}/${selected[1]}"></iframe></html>`,'text/html');
 }
 if(before&&versions.has(pathname.slice(1)))return send(versions.get(pathname.slice(1)),types[path.extname(pathname)]);
 const file=path.resolve(root,'.'+(pathname==='/'||pathname===''?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 let content=fs.readFileSync(file);
 if(path.extname(file)==='.html')content=content.toString().replace('<head>',`<head><script>window.qaErrors=[];addEventListener('error',e=>qaErrors.push(e.message||'Resource error'));addEventListener('unhandledrejection',e=>qaErrors.push(String(e.reason)));setInterval(()=>{if(!document.querySelector('.timeline-section')&&!document.querySelector('.detail-pregame'))return;const body={url:location.href,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,errors:qaErrors,dialog:!!document.querySelector('[open]'),at:new Date().toISOString()};fetch('/qa-event',{method:'POST',body:JSON.stringify(body)});},4000);</script>`);
 send(content,types[path.extname(file)]||'application/octet-stream');
});
server.listen(5537,'127.0.0.1',()=>console.log('Local replay QA: http://127.0.0.1:5537/qa'));

// Read-only QA host. Frozen evidence, local API overrides, no production writes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('dist'),audit=path.resolve('audit/pregame-editorial-20261103');
const corpus=JSON.parse(fs.readFileSync('test/fixtures/pregame-corpus-20261103.json'));
const feed={updatedAt:corpus.capturedAt,modelVersion:corpus.modelVersion,games:corpus.games.map(r=>r.game)};
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
const presets=[['CFB','401856743','Texas–Missouri'],['NHL','401892644','Ottawa–Buffalo'],['NHL','401892635','Detroit–Tampa Bay'],['CFB','401856849','BYU–Utah'],['NFL','401873038','Cincinnati–Atlanta'],['NBA','401909922','Philadelphia–Detroit'],['NCAAB','401906848','Wofford–Tennessee'],['CFB','401867964','SC State–Howard']];
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:5532');
 const send=(body,type='application/json')=>{res.setHeader('content-type',type+'; charset=utf-8');res.setHeader('cache-control','no-store');res.end(body);};
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 if(url.pathname==='/api/feed')return send(JSON.stringify(feed));
 if(url.pathname.startsWith('/api/game/')){const parts=url.pathname.split('/'),game=feed.games.find(g=>g.sport===parts[3]&&String(g.id)===parts[4]);return send(JSON.stringify({sportsRadarGame:game}));}
 if(url.pathname.startsWith('/api/'))return send('{}');
 if(url.pathname==='/alert-config.js')return send("globalThis.SPORTS_RADAR_ALERTS_URL='/api';",'text/javascript');
 if(url.pathname==='/sw.js'){res.writeHead(404);return res.end();}
 if(url.pathname==='/qa'){
   const width=['1440','390','320'].includes(url.searchParams.get('width'))?Number(url.searchParams.get('width')):1440;
   const chosen=presets.find(p=>p[1]===url.searchParams.get('id'))||presets[0];
   const route=url.searchParams.get('view')==='slate'?'/':`/#game/${chosen[0]}/${chosen[1]}`;
   const target=w=>`/qa?width=${w}&id=${chosen[1]}`;
   return send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SlateMeter candidate QA</title><style>body{margin:0;background:#dce4e9;color:#17232a;font:14px/1.5 system-ui}nav{padding:12px;max-width:1100px}nav a{display:inline-block;margin:3px 10px 3px 0}iframe{display:block;border:1px solid #6a7e88;width:${width}px;height:900px;${width===1440?'zoom:.8':''}}</style><nav><b>Local candidate QA — frozen November 3 evidence — ${width}px frame</b><br><a href="${target(1440)}">Desktop 1440</a><a href="${target(390)}">Phone 390</a><a href="${target(320)}">Phone 320</a><a href="${target(width)}&view=slate">Slate</a><a href="/examples.html">24 editorial comparisons</a><br>${presets.map(p=>`<a href="/qa?width=${width}&id=${p[1]}">${p[2]}</a>`).join('')}</nav><iframe title="Actual SlateMeter candidate" src="${route}"></iframe></html>`,'text/html');
 }
 const base=url.pathname==='/examples.html'?audit:root;
 const file=path.resolve(base,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 send(fs.readFileSync(file),types[path.extname(file)]||'application/octet-stream');
});
server.listen(5532,'127.0.0.1',()=>console.log('Read-only candidate preview: http://127.0.0.1:5532/qa'));

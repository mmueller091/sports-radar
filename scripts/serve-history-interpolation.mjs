// Local-only visual regression harness; never enters the site build allowlist.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
const baseline='ce8200e74c2346b7678a8956e4469f746e147358';
const root=path.resolve('dist'),audit=path.resolve('audit/history-interpolation-20261103');
const read=file=>JSON.parse(gunzipSync(fs.readFileSync(`test/fixtures/${file}.json.gz`)));
const transition=JSON.parse(fs.readFileSync('test/fixtures/nba-production-transition.json')).games[0];
const samples={
  pelicans:read('market-timeline/pelicans-grizzlies'),
  nfl:read('history-interpolation/NFL-401873024'),
  cfb:read('history-interpolation/CFB-401856847'),
  nhl:read('history-interpolation/NHL-401892629'),
  regulation:read('history-interpolation/NBA-401909903'),
  clock:{sportsRadarGame:transition.game,sportsRadarHistory:{gameKey:'NBA:'+transition.id,snapshots:transition.snapshots},scoringPlays:transition.scoringPlays},
  sparse:read('timeline-clarity/NFL-401873033').detail,
};
const feed=read('market-timeline/production-games');
for(const d of Object.values(samples)){
  const g=d.sportsRadarGame,index=feed.games.findIndex(p=>p.id===g.id&&p.sport===g.sport);
  if(index<0)feed.games.push(g);else feed.games[index]=g;
}
const versions=new Map(['game-center.js','styles.css'].map(p=>[p,execFileSync('git',['show',`${baseline}:${p}`],{maxBuffer:8e6})]));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
const telemetry=fs.existsSync(path.join(audit,'browser-checks.json'))?JSON.parse(fs.readFileSync(path.join(audit,'browser-checks.json'))):[];
fs.mkdirSync(audit,{recursive:true});
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1:5541'),before=u.pathname.startsWith('/before/'),pathname=before?u.pathname.slice(7):u.pathname;
  const send=(body,type='application/json')=>{res.setHeader('Content-Type',type+'; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(body);};
  if(u.pathname==='/qa-event'&&req.method==='POST'){
    let body='';req.on('data',c=>body+=c);req.on('end',()=>{telemetry.push(JSON.parse(body));fs.writeFileSync(path.join(audit,'browser-checks.json'),JSON.stringify(telemetry,null,2));send('{}');});return;
  }
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  if(pathname==='/api/feed')return send(JSON.stringify({...feed,updatedAt:new Date().toISOString()}));
  if(pathname.startsWith('/api/game/')){
    const id=pathname.split('/').at(-1),d=Object.values(samples).find(d=>String(d.sportsRadarGame.id)===id);
    return send(JSON.stringify(d||{}));
  }
  if(pathname.startsWith('/api/'))return send('{}');
  if(pathname==='/alert-config.js')return send("globalThis.SPORTS_RADAR_ALERTS_URL='/api';",'text/javascript');
  if(pathname==='/sw.js'){res.writeHead(404);return res.end();}
  if(u.pathname==='/qa'){
    const width=[1440,390,320].includes(Number(u.searchParams.get('width')))?Number(u.searchParams.get('width')):1440;
    const sample=Object.hasOwn(samples,u.searchParams.get('sample'))?u.searchParams.get('sample'):'pelicans';
    const version=['before','production'].includes(u.searchParams.get('version'))?u.searchParams.get('version'):'after';
    const g=samples[sample].sportsRadarGame;
    const query=(w=width,s=sample,v=version)=>`/qa?width=${w}&sample=${s}&version=${v}`;
    return send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>SlateMeter history QA</title><style>body{margin:0;background:#e9e4da;font:14px/1.4 system-ui;color:#202527}nav{padding:9px}a{display:inline-block;margin:3px 10px}iframe{border:1px solid #777;display:block;width:${width}px;height:1000px;${width===1440?'zoom:.82':''}}</style><nav><b>${version.toUpperCase()} · ${width}px · ${g.teams.map(t=>t[0]).join(' vs. ')}${sample==='sparse'?' · archived sparse history':''}</b><br>${[1440,390,320].map(w=>`<a href="${query(w)}">${w}px</a>`).join('')}<a href="${query(width,sample,version==='before'?'after':'before')}">Switch before / after</a><br>${Object.keys(samples).map(s=>`<a href="${query(width,s)}">${s}</a>`).join('')}</nav><iframe title="SlateMeter QA ${width}px" src="${version==='production'?'https://slatemeter.app/':version==='before'?'/before/':'/'}?qa-chart=1#game/${g.sport}/${g.id}"></iframe></html>`,'text/html');
  }
  if(before&&versions.has(pathname.slice(1)))return send(versions.get(pathname.slice(1)),types[path.extname(pathname)]);
  const file=path.resolve(root,'.'+(pathname==='/'||pathname===''?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  let content=fs.readFileSync(file);
  if(path.extname(file)==='.html')content=content.toString().replace('<head>',`<head><script>
    window.qaErrors=[];addEventListener('error',e=>qaErrors.push(e.message||'Resource error'));addEventListener('unhandledrejection',e=>qaErrors.push(String(e.reason)));
    let positioned=false,last='';setInterval(()=>{const section=document.querySelector('.timeline-section');if(!section)return;
      if(!positioned){section.scrollIntoView({block:'start'});positioned=true;}
      const body={url:location.href,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,dialogOverflow:[...document.querySelectorAll('dialog[open]')].some(d=>d.scrollWidth>d.clientWidth+1),errors:qaErrors,svgWidths:[...section.querySelectorAll('svg')].filter(s=>s.getBoundingClientRect().width).map(s=>s.getBoundingClientRect().width),text:section.querySelector('.timeline-point-help')?.textContent,selectedRange:section.querySelector('[aria-pressed="true"]')?.dataset.timelineRange,final:section.querySelector('.timeline-outcome')?.textContent};
      const encoded=JSON.stringify(body);if(encoded!==last){fetch('/qa-event',{method:'POST',body:encoded});last=encoded;}
    },1200);</script>`);
  send(content,types[path.extname(file)]||'application/octet-stream');
});
server.listen(5541,'127.0.0.1',()=>console.log('http://127.0.0.1:5541/qa'));

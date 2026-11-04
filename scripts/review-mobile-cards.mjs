// Local-only visual review. Open the gallery in a browser; no browser automation.
// Each iframe is a real CSS viewport and runs the complete built application.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
const root = process.cwd();
const dir = 'audit/mobile-cards-20261103';
fs.mkdirSync(dir,{recursive:true});
const frozen = JSON.parse(gunzipSync(fs.readFileSync('test/fixtures/ui-corrections-feed.json.gz')));
const clone = sport => structuredClone(frozen.games.find(g=>g.sport===sport));
const cases = [];
const add = (game,label) => {game.id='review-'+cases.length; game.reviewLabel=label; cases.push(game); return game;};
let g=clone('NHL');
g.teams=[['Colorado Avalanche','COL','','','https://a.espncdn.com/i/teamlogos/nhl/500/col.png','9-5-1',null,'Avalanche','17'],['Columbus Blue Jackets','CBJ','','','https://a.espncdn.com/i/teamlogos/nhl/500/cbj.png','5-7-0',null,'Blue Jackets','29']];
Object.assign(g,{state:'upcoming',status:'11/3 - 7:00 PM EST',score:42,channel:'ESPN+ · Altitude Sports',line:{spread:'COL -1.5',moneyline:'COL -125',total:6.5},live:null});
add(g,'Colorado / Columbus — pregame reproduction');
g=clone('NBA'); Object.assign(g,{state:'live',score:92,status:'Live',live:{phase:'2:14 · 4th quarter'},liveRawStatus:{period:4,displayClock:'2:14'},timingUncertain:false,scoringPartial:false});g.teams[0][0]='Minnesota Timberwolves';g.teams[0][4]='https://a.espncdn.com/i/teamlogos/nba/500/min.png';g.teams[0][2]='108';g.teams[1][0]='Portland Trail Blazers';g.teams[1][4]='https://a.espncdn.com/i/teamlogos/nba/500/por.png';g.teams[1][2]='110';g.channel='ESPN · ABC · NBA League Pass';add(g,'NBA — live, multiple broadcasts');
g=clone('NFL');Object.assign(g,{state:'live',score:67,status:'Halftime',live:{phase:'Halftime'},liveRawStatus:{period:2,displayClock:'',type:{name:'STATUS_HALFTIME'}},timingUncertain:false,scoringPartial:false});g.teams[0][0]='Washington Commanders';g.teams[0][4]='https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png';g.teams[0][5]='10-2-1';add(g,'NFL — halftime, long record');
g=clone('CFB');Object.assign(g,{state:'live',score:84,status:'OT',live:{phase:'Overtime'},liveRawStatus:{period:5,displayClock:'',type:{name:'STATUS_IN_PROGRESS'}},timingUncertain:false,scoringPartial:false});g.teams[0][0]='Massachusetts Minutemen';g.teams[1][0]='Central Michigan Chippewas';add(g,'CFB — overtime, long names');
g=clone('NCAAB');Object.assign(g,{state:'live',score:51,status:'Live',live:{phase:'6:31 · 2nd half'},liveRawStatus:{period:2,displayClock:'6:31'},timingUncertain:false,scoringPartial:false});g.teams[0][0]='Arkansas-Pine Bluff Golden Lions';g.teams[0][4]='';g.teams[0][5]='12-10 (7-4 SWAC)';g.teams[1][0]='UT Rio Grande Valley Vaqueros';g.teams[1][4]='';add(g,'NCAAM — long names, records, missing logos');
g=clone('MLB');Object.assign(g,{state:'completed',status:'Final / 12',score:28});g.teams[0][0]='Los Angeles Dodgers';g.teams[0][5]='102-60';g.teams[1][0]='San Francisco Giants';g.teams[1][5]='89-73';add(g,'MLB — final, long records');
g=clone('NHL');Object.assign(g,{state:'live',status:'Intermission',score:74,live:{phase:'1st intermission'},liveRawStatus:{period:1,displayClock:'',type:{name:'STATUS_END_PERIOD'}},timingUncertain:false,scoringPartial:false});add(g,'NHL — intermission, Capitals light artwork');
g=clone('NHL');g.teams[0][0]='Tampa Bay Lightning';g.teams[0][4]='https://a.espncdn.com/i/teamlogos/nhl/500/tb.png';Object.assign(g,{state:'live',status:'OT',score:99,live:{phase:'1:20 · OT'},liveRawStatus:{period:4,displayClock:'1:20'},timingUncertain:false,scoringPartial:false});add(g,'NHL — overtime, dark artwork, peak rating');
g=clone('NBA');Object.assign(g,{state:'completed',status:'Final',score:8});g.teams[0][0]='Miami Heat';g.teams[1][0]='Utah Jazz';add(g,'NBA — final, short names, low rating');
// All altered cases are simulations, not provider evidence or scoring calibration.
const teams=JSON.parse(fs.readFileSync('teams.json','utf8'));
for(const game of cases) for(const team of game.teams){
 const canonical=teams[game.sport]?.find(t=>t.name===team[0]);
 if(canonical){team[8]=canonical.id;if(game.id!=='review-4')team[4]=canonical.logo;}
 team[7]=team[0];
}
cases[4].teams[0][1]='APB';cases[4].teams[1][1]='UTRGV';
fs.writeFileSync(dir+'/cases.json',JSON.stringify({kind:'presentation-only simulations from frozen provider fixture',cases},null,2));
for(const file of ['styles.css','mobile-readability.css','app.js']) fs.writeFileSync('work/card-review/reference-'+file,execFileSync('git',['show','dd530e4:'+file]));
const injected = `
const reviewCases=${JSON.stringify(cases)};
const reviewQuery=new URLSearchParams(location.search);
const reviewGroup=Number(reviewQuery.get('group')||0);
const reviewSelected=reviewCases.slice(reviewGroup*3,reviewGroup*3+3);
games=reviewCases;
const normalRender=render;
render=function(){normalRender();document.querySelector('#game-list').innerHTML=reviewSelected.map(gameCard).join('');};
render();
document.querySelectorAll('#game-list img').forEach(img=>img.loading='eager');
async function reportLayout(){
 await document.fonts.ready;
 const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
 const checks=[...document.querySelectorAll('.game-card')].map(card=>{
  const records=[...card.querySelectorAll('.team-record')];
  const rating=card.querySelector('.score-circle');
  const teams=[...card.querySelectorAll('.team-name-text')].map(e=>({text:e.innerText,rect:rect(e),font:getComputedStyle(e).font}));
  const overlaps=[...card.querySelectorAll('.team-row')].some(row=>{
   const name=row.querySelector('.team-name-copy'),score=row.querySelector('.team-score'),record=row.querySelector('.team-record');
   return (score.innerText&&rect(name).right>rect(score).x+1)||(record&&rect(row.querySelector('.team-name-text')).bottom>rect(record).y+1)||rect(row).right>rect(card.querySelector('.excitement')).x+1;
  });
  return {id:card.dataset.id,rect:rect(card),teams,overlaps,records:records.map(e=>({text:e.textContent,display:getComputedStyle(e).display,rect:rect(e)})),rating:rating.textContent,stroke:getComputedStyle(rating).webkitTextStrokeWidth,overflow:card.scrollWidth>card.clientWidth+1,logos:[...card.querySelectorAll('.team-logo')].map(e=>({loaded:e.complete&&e.naturalWidth>0,hidden:e.hidden})),lastScoreHidden:[...card.querySelectorAll('[data-moment-kind="last-score"]')].every(e=>innerWidth>600||getComputedStyle(e).display==='none')};
 });
 const result={width:innerWidth,group:reviewGroup,mode:reviewQuery.get('mode')||'after',pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,checks};
 parent.postMessage(result,'*');
 fetch('/report',{method:'POST',body:JSON.stringify(result)});
}
window.addEventListener('load',()=>setTimeout(reportLayout,1200));
`;
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 // Read-only local proxy: production CORS intentionally excludes localhost.
 if(u.pathname.startsWith('/provider/')&&req.method==='GET'){
  try{const response=await fetch('https://sports-radar-alerts.mmueller918.workers.dev/'+u.pathname.slice(10)+u.search);
   res.writeHead(response.status,{'Content-Type':response.headers.get('Content-Type')||'application/json'});res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(502).end();}return;
 }
 if(u.pathname==='/'){
  const boot=`<script>const localFetch=fetch;window.fetch=(url,options)=>String(url).startsWith('https://sports-radar-alerts.mmueller918.workers.dev/')&&(!options?.method||options.method==='GET')?localFetch('/provider/'+new URL(url).pathname.slice(1)+new URL(url).search,options):localFetch(url,options);</script>`;
  res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('dist/index.html','utf8').replace('</head>',boot+'</head>'));return;
 }
 if(u.pathname==='/live'){
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>SlateMeter live UI review</title><style>body{background:#191c1f;color:#f0e8d4;font:14px Arial}iframe{border:0;width:390px;height:720px}</style><p>390px · complete application · live feed</p><iframe src="/"></iframe>');return;
 }
 if(u.pathname==='/report'&&req.method==='POST'){let body='';for await(const c of req)body+=c;const report=JSON.parse(body);fs.writeFileSync(dir+'/layout-'+report.mode+'-'+report.width+'-'+report.group+'.json',body);res.end('ok');return;}
 if(u.pathname==='/gallery'){
  const widths=(u.searchParams.get('widths')||'320,375,390').split(',').map(Number);const group=u.searchParams.get('group')||0;const modes=(u.searchParams.get('modes')||'after').split(',');
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><title>SlateMeter card review</title><style>body{background:#191c1f;color:#f0e8d4;font:13px Arial;margin:12px}main{display:flex;gap:14px;align-items:start}iframe{border:0;height:665px;background:#191c1f}h2{font-size:14px;font-weight:400;margin:8px 0}#results{font:12px Arial;color:#a8c9b0}</style><h1 style="font-size:18px">SlateMeter · presentation simulations · group ${group}</h1><main>${modes.flatMap(mode=>widths.map(w=>`<section><h2>${mode} · ${w}px</h2><iframe width="${w}" src="/review?mode=${mode}&group=${group}"></iframe></section>`)).join('')}</main><div id="results"></div><script>addEventListener('message',e=>{const d=e.data;if(d.checks)document.querySelector('#results').textContent+=d.mode+' '+d.width+'px: '+(d.pageOverflow||d.checks.some(c=>c.overflow)?'OVERFLOW':'no overflow')+' · ';});</script>`);return;
 }
 if(u.pathname==='/review'){
  const mode=u.searchParams.get('mode');const folder=mode==='before'?'work/card-review/before':'dist';
  let html=fs.readFileSync(folder+'/index.html','utf8');
  const boot=`<script>const originalFetch=fetch;window.fetch=(url,options)=>String(url).endsWith('/feed')?Promise.resolve(new Response(JSON.stringify(${JSON.stringify({...frozen,games:cases})}),{headers:{'Content-Type':'application/json'}})):originalFetch(url,options);</script>`;
  html=html.replace('</head>',`<style>.topbar,.control-row,.controls,.data-status,.mobile-sport-filter-toggle,.section-label,.footer,.sport-specific-filters{display:none!important}body main{margin-top:0!important}.app-shell{padding-top:0!important}.game-list{margin:0!important}</style>${boot}</head>`);
  if(mode==='before')html=html.replaceAll('src="app.js','src="/before/app.js').replaceAll('href="styles.css','href="/before/styles.css').replaceAll('href="mobile-readability.css','href="/before/mobile-readability.css');
  if(mode==='reference')html=html.replaceAll('src="app.js','src="/reference/app.js').replaceAll('href="styles.css','href="/reference/styles.css').replaceAll('href="mobile-readability.css','href="/reference/mobile-readability.css');
  html=html.replace('</body>',`<script>${injected}</script></body>`);res.setHeader('Content-Type','text/html');res.end(html);return;
 }
 let file=u.pathname.startsWith('/before/')?'work/card-review/before/'+u.pathname.slice(8):u.pathname.startsWith('/reference/')?'work/card-review/reference-'+u.pathname.slice(11):'dist'+(u.pathname==='/'?'/index.html':u.pathname);
 file=path.resolve(file);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
server.listen(4173,'127.0.0.1',()=>console.log('Review http://127.0.0.1:4173/gallery'));

import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import vm from 'node:vm';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
import * as active from '../alerts-worker/src/live-game-model.js';import runtime from '../scoring/live-runtime.cjs';import {basketballBoxScore} from '../alerts-worker/src/display-model.js';
import {frame,evaluate,read} from '../test/helpers/basketball-audit.mjs';
const require=createRequire(import.meta.url),{chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const production=process.argv.includes('--production'),site='https://mmueller091.github.io/sports-radar/',worker='https://sports-radar-alerts.mmueller918.workers.dev',dir='work/basketball';
fs.mkdirSync(dir,{recursive:true});
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
async function get(url){const r=await fetch(url,{cache:'no-store'});assert.ok(r.ok,`${r.status} ${url}`);return r;}
const asset=async name=>production?(await get(site+name+'?audit='+Date.now())).text():fs.readFileSync('dist/'+name,'utf8');
const bundle=await asset('scoring-runtime.js'),browserCore=vm.runInNewContext(bundle+';SportsRadarScore');assert.equal(browserCore.MODEL_VERSION,runtime.MODEL_VERSION);
const input=frame(),game=evaluate(active,input),browserGame=active.normalizeEvent(structuredClone(input.event),'NCAAB');browserCore.applyLiveSnapshot(browserGame,browserGame.sourceCompetition,structuredClone(input.summary));assert.equal(browserGame.score,game.score);
const results={production,revision,model:runtime.MODEL_VERSION,browserWorkerReplayRating:game.score,checks:[]};
if(production){
 const health=await(await get(worker+'/health')).json(),feed=await(await get(worker+'/feed')).json();
 assert.equal(health.modelVersion,runtime.MODEL_VERSION);assert.equal(feed.modelVersion,runtime.MODEL_VERSION);
 assert.ok((await asset('index.html')).includes('scoring-runtime.js?rev='+revision));assert.ok((await asset('sw.js')).includes(revision));
 assert.ok(feed.games.every(g=>!g.basketballEvidence&&!g.scoreboard?.basketballEvidence));
 const detail=await(await get(worker+'/game/NCAAB/401920982')).json();
 const current=detail.sportsRadarGame;
 for(const t of current.teams){const raw=detail.header.competitions[0].competitors.find(c=>String(c.team?.id)===String(t[8]));assert.equal(String(raw.score),String(t[2]));const box=detail.basketballBoxScore?.teams?.find(b=>b.teamId===String(t[8]));if(box)assert.equal(String(box.totals.points),String(t[2]));}
 results.live={updatedAt:feed.updatedAt,score:current.score,gameScore:current.teams.map(t=>t[2]),model:current.modelVersion};
}
let server;
if(!production){server=http.createServer((req,res)=>{const pathname=req.url.split('?')[0],file=path.resolve('dist','.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(path.resolve('dist')+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));}
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const [label,width,height]of [['desktop',1440,1100],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',isMobile:label==='mobile'});
  if(!production)await context.route(worker+'/**',async route=>{
   const u=new URL(route.request().url());let json={};
   if(u.pathname==='/feed')json={modelVersion:runtime.MODEL_VERSION,updatedAt:new Date().toISOString(),games:[game]};
   else if(u.pathname.startsWith('/game/'))json={...input.summary,basketballBoxScore:basketballBoxScore(input.summary,'NCAAB'),sportsRadarGame:game};
   await route.fulfill({json,headers:{'Access-Control-Allow-Origin':'*'}});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto((production?site:`http://127.0.0.1:${server.address().port}/`)+'#game/NCAAB/401920982',{waitUntil:'domcontentloaded'});
  await page.locator('.detail-why-text').waitFor({timeout:45000});await page.waitForTimeout(500);
  const explanation=await page.locator('.detail-why-text').textContent();
  assert.doesNotMatch(explanation,/capped at|adjustment|[+]\d|Current Tension|Pregame rating:/i);
  assert.match(explanation,/Notre Dame|Villanova/);
  assert.equal(await page.locator('.detail-scoring-details').getAttribute('open'),null);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(!production)assert.equal((await page.locator('.detail-excitement-score').textContent()).trim(),String(game.score));
  await page.screenshot({path:`${dir}/${production?'production':'local'}-${label}.png`,fullPage:true,animations:'disabled'});
  await page.locator('.detail-scoring-details summary').click();assert.ok(await page.locator('.detail-scoring-details').getAttribute('open')!==null);
  assert.deepEqual(errors,[]);results.checks.push({viewport:label,explanation,rating:await page.locator('.detail-excitement-score').textContent(),errors});await context.close();
 }
}finally{await browser.close();if(server)await new Promise(r=>server.close(r));}
fs.writeFileSync(`${dir}/${production?'production':'build'}-verification.json`,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));

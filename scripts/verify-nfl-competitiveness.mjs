import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {competitivenessData,competitivenessReport,runtime} from './nfl-competitiveness-report.mjs';
import {refinementData} from './nfl-refinement-report.mjs';
import {normalizeEvent,applyContextsToGame} from '../alerts-worker/src/live-game-model.js';
const require=createRequire(import.meta.url),{chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const production=process.argv.includes('--production'),dir='work/nfl-competitiveness';fs.mkdirSync(dir,{recursive:true});
const data=competitivenessData(),report=competitivenessReport(),summaries=refinementData().summaries;
const games=data.games.map(({event,competition,baseline})=>{const e=structuredClone(event);e.competitions=[structuredClone(competition)];const g=normalizeEvent(e,'NFL');applyContextsToGame(g,baseline.qualitativeContexts || []);return g;});
const site='https://mmueller091.github.io/sports-radar/',worker='https://sports-radar-alerts.mmueller918.workers.dev';
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
async function get(url){const r=await fetch(url,{cache:'no-store'});assert.ok(r.ok,`${r.status} ${url}`);return r;}
if(production){
  const bundle=await(await get(site+'scoring-runtime.js?audit='+Date.now())).text(),browser=vm.runInNewContext(bundle+';SportsRadarScore');
  assert.equal(browser.MODEL_VERSION,runtime.MODEL_VERSION);
  assert.ok((await(await get(site+'?audit='+Date.now())).text()).includes('scoring-runtime.js?rev='+revision));
  assert.ok((await(await get(site+'sw.js?audit='+Date.now())).text()).includes(revision));
  const feed=await(await get(worker+'/feed')).json();assert.equal(feed.modelVersion,runtime.MODEL_VERSION);
  fs.writeFileSync(dir+'/production-feed-after.json',JSON.stringify(feed));
  for(const row of report.rows){const g=feed.games.find(g=>g.sport==='NFL'&&g.id===row.id);assert.ok(g,row.id);assert.equal(g.score,row.after,`${row.matchup} production`);assert.deepEqual(plain(g.factors),plain(row.factors));}
}
function plain(x){return JSON.parse(JSON.stringify(x));}
let server;
if(!production){server=http.createServer((req,res)=>{const file=path.resolve('dist','.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(path.resolve('dist')+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));}
const url=production?site:`http://127.0.0.1:${server.address().port}/`,browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{for(const [label,width,height]of [['desktop',1440,1100],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',isMobile:label==='mobile'}),errors=[];
  if(!production)await context.route(worker+'/**',async route=>{const pathname=new URL(route.request().url()).pathname;let json={};if(pathname==='/feed')json={modelVersion:runtime.MODEL_VERSION,updatedAt:new Date().toISOString(),games};else if(pathname.startsWith('/game/')){const id=pathname.split('/').at(-1);json={...summaries[id],sportsRadarGame:games.find(g=>g.id===id)};}await route.fulfill({json,headers:{'Access-Control-Allow-Origin':'*'}});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('.game-card').first().waitFor({timeout:45000});await page.locator('[data-state="upcoming"]').click();
  for(const row of report.rows){const card=page.locator(`.game-card[data-id="${row.id}"]`);await card.waitFor();assert.equal((await card.locator('.score-circle').textContent()).trim(),String(row.after));}
  await page.screenshot({path:`${dir}/${production?'production':'local'}-${label}-cards.png`,fullPage:true,animations:'disabled'});
  for(const id of ['401873047','401873045','401873041','401873044','401873026','401873025']){
    await page.goto(url+`#game/NFL/${id}`,{waitUntil:'domcontentloaded'});const row=report.rows.find(r=>r.id===id);
    await page.waitForFunction(score=>document.querySelector('.detail-excitement-score')?.textContent.trim()===String(score),row.after,{timeout:45000});
    const explanation=await page.locator('.detail-why-text').textContent();
    if(['401873047','401873045'].includes(id)){assert.match(explanation,/projected mismatch lowers excitement/);assert.match(explanation,/capped at two/);for(const f of row.factors.filter(f=>f.points&&!['Sport baseline','Schedule scarcity'].includes(f.label)))assert.ok(explanation.includes(`(${f.points>0?'+':''}${f.points})`),`${id}: ${f.label}`);}
    if(id==='401873026')assert.match(explanation,/jointly add/);
    if(id==='401873025')assert.match(explanation,/NFC South lead/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`${dir}/${production?'production':'local'}-${label}-${id}.png`,fullPage:true,animations:'disabled'});results.push({label,id,score:row.after,explanation});
  }
  assert.deepEqual(errors,[]);await context.close();
}
fs.writeFileSync(`${dir}/${production?'production':'local'}-verification.json`,JSON.stringify({revision,model:runtime.MODEL_VERSION,url,slateRatingsVerified:report.rows.length,results},null,2));console.log(JSON.stringify({production,revision,model:runtime.MODEL_VERSION,slateRatingsVerified:report.rows.length,detailsVerified:results.length}));
}finally{await browser.close();if(server)await new Promise(r=>server.close(r));}

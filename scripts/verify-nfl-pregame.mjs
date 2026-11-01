import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {normalizeEvent,applyContextsToGame} from '../alerts-worker/src/live-game-model.js';
import {nflPregameContext} from '../alerts-worker/src/nfl-pregame.js';
import helper from '../test/helpers/nfl-pregame.cjs';
import runtime from '../scoring/live-runtime.cjs';
import {refinementData,refinementGames} from './nfl-refinement-report.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const refinement=process.argv.includes('--refinement');
const deployed=process.argv.includes('--production'),dir=refinement?'work/nfl-refinement':'work/nfl-pregame';
const worker='https://sports-radar-alerts.mmueller918.workers.dev',site='https://mmueller091.github.io/sports-radar/';
const data=refinement?refinementData():helper.fixture(),opposition=Object.values(data.summaries).flatMap(s=>s.standings?.groups || []).flatMap(g=>g.standings?.entries || []);
const games=refinement?refinementGames(data):data.events.map(event=>{const g=normalizeEvent(structuredClone(event),'NFL');applyContextsToGame(g,nflPregameContext(g,data.summaries[g.id],g.teams.flatMap(t=>data.teamNews[t[8]]?.articles || []),opposition,Date.parse(data.capturedAt)));return g;});
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
async function get(url){const r=await fetch(url,{cache:'no-store'});assert.ok(r.ok,`${r.status}: ${url}`);return r;}
let feed;
if(deployed){
  const bundle=await(await get(site+'scoring-runtime.js?verify='+Date.now())).text();
  const browser=vm.runInNewContext(bundle+';SportsRadarScore');assert.equal(browser.MODEL_VERSION,runtime.MODEL_VERSION);
  const html=await(await get(site+'?verify='+Date.now())).text();assert.ok(html.includes('scoring-runtime.js?rev='+revision));
  const sw=await(await get(site+'sw.js?verify='+Date.now())).text();assert.ok(sw.includes(revision));
  feed=await(await get(worker+'/feed')).json();assert.equal(feed.modelVersion,runtime.MODEL_VERSION);
  fs.writeFileSync(dir+'/production-feed.json',JSON.stringify(feed));
  for(const g of games){const actual=feed.games.find(a=>a.sport==='NFL' && a.id===g.id);assert.ok(actual);assert.equal(actual.score,g.score,`${g.id} production rating`);assert.ok(!actual.qualitativeContexts?.some(f=>/uniform/i.test(f.text)));}
}
let server;
if(!deployed){server=http.createServer((req,res)=>{const file=path.resolve('dist','.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(path.resolve('dist')+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));}
const url=deployed?site:`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{for(const [label,width,height]of [['desktop',1440,1100],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',isMobile:label==='mobile'});
  if(!deployed)await context.route(worker+'/**',async route=>{
    const u=new URL(route.request().url());let json={};
    if(u.pathname==='/feed')json={modelVersion:runtime.MODEL_VERSION,updatedAt:new Date().toISOString(),games};
    else if(u.pathname.startsWith('/game/')){const id=u.pathname.split('/').at(-1);json={...data.summaries[id],sportsRadarGame:games.find(g=>g.id===id)};}
    await route.fulfill({json,headers:{'Access-Control-Allow-Origin':'*'}});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('.game-card').first().waitFor({timeout:45000});
  await page.locator('[data-state="upcoming"]').click();
  for(const g of games){const card=page.locator(`.game-card[data-id="${g.id}"]`);await card.waitFor();assert.equal((await card.locator('.score-circle').textContent()).trim(),String(g.score));}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`${dir}/${deployed?'production':'local'}-${label}-cards.png`,fullPage:true,animations:'disabled'});
  for(const id of ['401873025','401873027','401873024','401873026']){
    await page.goto(url+`#game/NFL/${id}`,{waitUntil:'domcontentloaded'});
    const detail=page.locator('#game-detail-content .detail-radar');await detail.waitFor({timeout:45000});
    const g=games.find(g=>g.id===id);
    await page.waitForFunction(score=>document.querySelector('.detail-excitement-score')?.textContent.trim()===String(score),g.score);
    await page.waitForTimeout(400);
    assert.equal((await page.locator('.detail-excitement-score').textContent()).trim(),String(g.score));
    const explanation=await page.locator('.detail-why-text').textContent();
    if(id==='401873025')assert.match(explanation,/NFC South lead/);
    if(id==='401873027')assert.match(explanation,/AFC North lead/);
    if(id==='401873024')assert.match(explanation,/Love/);
    if(refinement && id==='401873026')assert.match(explanation,/jointly add/);
    if(refinement && id==='401873025')assert.match(explanation,/Records .*%/);
    assert.doesNotMatch(await page.locator('#game-detail-content').textContent(),/uniforms: Jaguars/i);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`${dir}/${deployed?'production':'local'}-${label}-${id}.png`,fullPage:true,animations:'disabled'});
    results.push({label,id,score:g.score,explanation});
  }
  assert.deepEqual(errors,[]);await context.close();
}
fs.writeFileSync(`${dir}/${deployed?'production':'local'}-verification.json`,JSON.stringify({revision,model:runtime.MODEL_VERSION,url,results},null,2));console.log(JSON.stringify({deployed,revision,model:runtime.MODEL_VERSION,verified:results.length}));
}finally{await browser.close();if(server)await new Promise(r=>server.close(r));}

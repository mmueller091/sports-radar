import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import * as active from '../alerts-worker/src/live-game-model.js';
import helper from '../test/helpers/finish-audit.cjs';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const {chromium}=playwright;
const deployed=process.argv.includes('--production'),dir='work/finish-audit';fs.mkdirSync(dir,{recursive:true});
const ids=[['CFB','401856842'],['CFB','401868342'],['CFB','401867861'],['NHL','401892618'],['NHL','401892615'],['NHL','401892616'],['NHL','401892614']];
const fixtures=ids.map(([sport,id])=>({sport,id,f:helper.read(`${sport}-${id}`)}));
const games=fixtures.map(({sport,f})=>helper.score(active,f.event,f.summary,sport));
const version=games[0].modelVersion;
let server;
if(!deployed){server=http.createServer((req,res)=>{const p=path.resolve('dist','.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!p.startsWith(path.resolve('dist')+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml'})[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));}
const url=deployed?'https://mmueller091.github.io/sports-radar/':`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
try{for(const [label,width,height]of [['desktop',1440,1100],['mobile',390,844]]){
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',isMobile:label==='mobile',deviceScaleFactor:1});
 if(!deployed)await context.route('https://sports-radar-alerts.mmueller918.workers.dev/**',async route=>{
  const u=new URL(route.request().url());let data={};
  if(u.pathname==='/feed')data={modelVersion:version,updatedAt:new Date().toISOString(),games};
  else if(u.pathname.startsWith('/game/')){const [, ,sport,id]=u.pathname.split('/'),item=fixtures.find(f=>f.sport===sport&&f.id===id);if(item)data={...item.f.summary,sportsRadarGame:games.find(g=>g.id===id),sportsRadarHistory:JSON.parse(fs.readFileSync(`test/fixtures/finish-audit/history-${sport}-${id}.json`))};}
  await route.fulfill({json:data,headers:{'Access-Control-Allow-Origin':'*'}});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('.game-card').first().waitFor({timeout:45000});
 await page.locator('[data-state="completed"]').click();await page.screenshot({path:`${dir}/${deployed?'production':'local'}-${label}-cards.png`,fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page overflow');
 for(const id of ['401856842','401892616']){
  if(deployed){await page.goto(url+`#game/${id==='401856842'?'CFB':'NHL'}/${id}`,{waitUntil:'domcontentloaded'});}else await page.locator(`.game-card[data-id="${id}"] [data-open-game]`).click();
  await page.locator('#game-detail-content .detail-tabs').waitFor({timeout:45000});
  await page.screenshot({path:`${dir}/${deployed?'production':'local'}-${label}-${id}-center.png`,fullPage:true});
  const timeline=page.locator('.timeline-chart').first();await timeline.scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/${deployed?'production':'local'}-${label}-${id}-timeline.png`});
  assert.ok(await timeline.isVisible());
  const point=page.locator('.timeline-point').first();if(await point.count()){await page.mouse.move(0,0);await point.press('Enter');assert.ok(await page.locator('.timeline-point-help[aria-hidden="false"]').count());}
  results.push({label,id,chart:await timeline.getAttribute('aria-label'),errors:[...errors]});assert.deepEqual(errors,[]);
  await page.evaluate(()=>hideGameDetails());
 }
 await context.close();
}
fs.writeFileSync(`${dir}/${deployed?'production':'local'}-visual.json`,JSON.stringify({url,model:version,results},null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();if(server)await new Promise(r=>server.close(r));}

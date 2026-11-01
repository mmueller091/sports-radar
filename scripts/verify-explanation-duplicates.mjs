import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import assert from 'node:assert/strict';import vm from 'node:vm';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
import {refinementData,refinementGames} from './nfl-refinement-report.mjs';
const require=createRequire(import.meta.url),{chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const production=process.argv.includes('--production'),site='https://mmueller091.github.io/sports-radar/',worker='https://sports-radar-alerts.mmueller918.workers.dev',dir='work/explanation-duplicates';
fs.mkdirSync(dir,{recursive:true});
const data=refinementData(),fixture=refinementGames(data).find(g=>g.teams.some(t=>t[1]==='BAL')),revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
async function get(url){const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.ok(response.ok,`${response.status} ${url}`);return response;}
let feed,game=fixture;
if(production){
 const html=await(await get(site+'?verify='+Date.now())).text();assert.ok(html.includes('app.js?rev='+revision));
 const app=await(await get(site+'app.js?verify='+Date.now())).text().then(s=>s.replaceAll('\r\n','\n'));
 const explain=vm.runInNewContext(app.slice(app.indexOf('function explainRating('),app.indexOf('\nfunction trendFor('))+';explainRating');
 assert.equal((explain(fixture).match(/\breturn\b/gi)||[]).length,1,'published renderer must repair the captured source');
 feed=await(await get(worker+'/feed')).json();game=feed.games.find(g=>g.sport==='NFL'&&String(g.id)===String(fixture.id));assert.ok(game);
 const sw=await(await get(site+'sw.js?verify='+Date.now())).text();assert.ok(sw.includes(revision));
}
let server;
if(!production){server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve('dist','.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(path.resolve('dist')+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));}
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const [label,width,height]of [['desktop',1440,1100],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:label==='mobile',serviceWorkers:'block'});
  if(!production)await context.route(worker+'/**',async route=>{
   const url=new URL(route.request().url());let json={};
   if(url.pathname==='/feed')json={modelVersion:fixture.modelVersion,updatedAt:new Date().toISOString(),games:[fixture]};
   else if(url.pathname.startsWith('/game/'))json={...data.summaries[fixture.id],sportsRadarGame:fixture};
   await route.fulfill({json,headers:{'Access-Control-Allow-Origin':'*'}});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto((production?site:`http://127.0.0.1:${server.address().port}/`)+`#game/NFL/${game.id}`,{waitUntil:'domcontentloaded'});
  await page.locator('.detail-why-text').waitFor({timeout:45000});await page.waitForTimeout(300);
  const explanation=await page.locator('.detail-why-text').textContent(),rating=(await page.locator('.detail-excitement-score').textContent()).trim();
  assert.match(explanation,/Lamar Jackson/);assert.equal((explanation.match(/\breturn\b/gi)||[]).length,1,explanation);
  assert.doesNotMatch(explanation,/Ravens QB Jackson to return|bearable|[.!?]["”][.!?]/);
  const story=await page.locator('.storyline-section li span').allTextContents();
  assert.ok(story.every(text=>(text.match(/\breturn\b/gi)||[]).length<=1));
  assert.ok(story.every(text=>!/bearable|Ravens QB Jackson to return/.test(text)));
  assert.equal(rating,String(game.score));assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`${dir}/${production?'production':'local'}-${label}.png`,fullPage:false,animations:'disabled'});
  results.push({viewport:label,rating,explanation,errors});await context.close();
 }
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
const report={production,revision,gameId:game.id,model:game.modelVersion,results};
fs.writeFileSync(`${dir}/${production?'production':'local'}-verification.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const audit='audit/ncaam-20261102',read=name=>JSON.parse(fs.readFileSync(`${audit}/${name}`,'utf8').replace(/^\uFEFF/,''));
const feed=read('worker-feed-selected.json'),detail=read('miami-worker-before.json');
const states=read('miami-production-snapshots.json')[0].results;
const reported=JSON.parse(states.find(row=>row.observed_at===1793663490000).normalized_state);
const historyEnd=1793663475000;
const now=new Date().toISOString();
feed.updatedAt=now;
feed.games=feed.games.filter(game=>['401906769','401909562','401925733'].includes(String(game.id)))
 .map(game=>String(game.id)==='401906769'?reported:game);
detail.sportsRadarGame=reported;
detail.sportsRadarHistory.snapshots=detail.sportsRadarHistory.snapshots.filter(point=>point.observedAt<=historyEnd);
detail.header.competitions[0].status=reported.liveRawStatus;
for(const team of detail.header.competitions[0].competitors){
 const current=reported.teams.find(item=>String(item[8])===String(team.team.id));
 team.score=String(current[2]);
 team.linescores=String(team.team.id)==='2390'?[{displayValue:''}]:[{displayValue:String(current[2])}];
}
detail.sportsRadarFreshness={updatedAt:now,canonicalUpdatedAt:now,receivedAt:now,stale:false};
const root=path.resolve('dist');
const server=http.createServer((request,response)=>{
 const name=decodeURIComponent(request.url.split('?')[0])==='/'?'/index.html':decodeURIComponent(request.url.split('?')[0]);
 const file=path.resolve(root,'.'+name);
 if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
 try{response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');response.end(fs.readFileSync(file));}
 catch{response.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
 for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:label==='mobile',serviceWorkers:'block'});
  await context.route('https://sports-radar-alerts.mmueller918.workers.dev/**',route=>{
   const pathname=new URL(route.request().url()).pathname;
   const body=pathname==='/feed'?feed:pathname==='/game/NCAAB/401906769'?detail:
    pathname==='/game/NCAAB/401909562'?read('army-worker-before.json'):
    pathname==='/game/NCAAB/401925733'?read('oakland-worker-before.json'):{error:'Not in audit fixture'};
   return route.fulfill({status:body.error?404:200,json:body,headers:{'Access-Control-Allow-Origin':'*'}});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/#game/NCAAB/401906769`,{waitUntil:'domcontentloaded'});
  await page.locator('.detail-why-text').waitFor({timeout:45000});
  const explanation=await page.locator('.detail-why-text').textContent();
  assert.match(explanation,/Florida Gators lead Miami Hurricanes 41–31/);
  assert.match(explanation,/10-point gap limits the suspense/);
  const current=(await page.locator('.timeline-rating-current strong').textContent()).trim();
  const latest=(await page.locator('.timeline-rating-last strong').textContent()).trim();
  assert.equal(current,'40');assert.equal(latest,'38');
  const miamiFirstHalf=(await page.locator('.detail-scoring tbody tr').filter({hasText:'MIA'}).locator('td').first().textContent()).trim();
  assert.equal(miamiFirstHalf,'31');
  const oakland=page.locator('.game-card').filter({hasText:'Oakland'}).first();
  assert.equal(await oakland.locator('.status-live').count(),1);
  assert.equal(await oakland.locator('.live-phase, .card-clock').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  fs.mkdirSync('work/ncaam-audit-visual',{recursive:true});
  const screenshot=`work/ncaam-audit-visual/${label}.png`;
  await page.screenshot({path:screenshot,fullPage:true,animations:'disabled'});
  await page.locator('.detail-scoring').scrollIntoViewIfNeeded();
  const scoringScreenshot=`work/ncaam-audit-visual/${label}-scoring.png`;
  await page.screenshot({path:scoringScreenshot,animations:'disabled'});
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  const oaklandCard=page.locator('.game-card').filter({hasText:'Oakland'}).first();
  await oaklandCard.waitFor();
  assert.equal((await oaklandCard.innerText()).match(/HALFTIME/g)?.length,1);
  const cardScreenshot=`work/ncaam-audit-visual/${label}-oakland-card.png`;
  await oaklandCard.screenshot({path:cardScreenshot,animations:'disabled'});
  results.push({label,width,height,current,latest,miamiFirstHalf,explanation,
   oaklandBadge:await oaklandCard.locator('.status-live').textContent(),screenshot,scoringScreenshot,cardScreenshot,errors});
  await context.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
fs.writeFileSync(`${audit}/visual-results.json`,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));

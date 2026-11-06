// Local browser regression: the preview server supplies deterministic games and
// authentic team logo URLs. Run after build-site.mjs and ui-overhaul-preview.mjs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
let playwright;
try { playwright=require('playwright'); }
catch { playwright=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const {chromium}=playwright;
const output=path.resolve('audit/mobile-alignment-20261105');
fs.mkdirSync(output,{recursive:true});
const widths=(process.env.MOBILE_QA_WIDTHS || '320,375,390,428,1440').split(',').map(Number);
const detailCases=(process.env.MOBILE_QA_CASES || '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14').split(',').map(Number);
const results=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const width of widths) {
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(String(error)));
    for(const set of [0,1,2,3]) {
      await page.goto(`http://127.0.0.1:4174/after/?view=slate&set=${set}`,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>typeof window.__qaMeasure==='function',{timeout:30000});
      await page.waitForFunction(()=>[...document.querySelectorAll('.game-card img.team-logo')].every(img=>img.complete&&img.naturalWidth>0),undefined,{timeout:30000});
      await page.screenshot({path:path.join(output,`cards-${width}-${set}.png`),fullPage:true,animations:'disabled'});
      const report=await page.evaluate(()=>window.__qaMeasure());
      assert.equal(report.overflow,false,`card page overflow ${width}/${set}`);
      assert.deepEqual(report.recordFailures,[],`card records ${width}/${set}`);
      assert.deepEqual(report.overlaps,[],`card overlaps ${width}/${set}`);
      assert.deepEqual(report.clipped,[],`card clipping ${width}/${set}`);
      assert.ok(report.logos.every(item=>item.loaded),`card official logos ${width}/${set}`);
      const cardTracks=await page.evaluate(()=>[...document.querySelectorAll('.game-card')].map(card=>{
        const rows=[...card.querySelectorAll('.team-row')];
        return rows.map(row=>({logo:row.querySelector('.team-logo')?.getBoundingClientRect().x,score:row.querySelector('.team-score')?.getBoundingClientRect().right,record:row.querySelector('.team-record')?.getBoundingClientRect().x}));
      }));
      for(const [cardIndex,rows] of cardTracks.entries())if(rows.length===2)for(const field of ['logo','record','score'])
        assert.ok(Math.abs(rows[0][field]-rows[1][field])<1,`card ${field} track ${width}/${set}/${cardIndex}`);
      results.push({width,view:'cards',set,logosLoaded:report.logos.filter(item=>item.loaded).length,logos:report.logos.length});
    }
    for(const index of detailCases) {
      await page.goto(`http://127.0.0.1:4174/after/?view=detail&set=${index}`,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>typeof window.__qaMeasure==='function',{timeout:30000});
      await page.waitForFunction(()=>[...document.querySelectorAll('.detail-scoreboard img.team-logo')].every(img=>img.complete&&img.naturalWidth>0),undefined,{timeout:30000});
      await page.screenshot({path:path.join(output,`center-${width}-${index}.png`),fullPage:false,animations:'disabled'});
      const data=await page.evaluate(()=>{
        const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,centerY:r.y+r.height/2};};
        const teams=[...document.querySelectorAll('.detail-scoreboard .detail-team')];
        const statTab=document.querySelector('[data-detail-tab="team-stats"]');
        const before={id:activeDetailGame?.id,sport:activeDetailGame?.sport,state:activeDetailGame?.state,scoreboard:teams.map(team=>({name:team.querySelector('strong')?.textContent,score:team.querySelector(':scope > b')?.textContent,logo:box(team.querySelector('img')),nameBox:box(team.querySelector('strong')),record:box(team.querySelector('small')),scoreBox:box(team.querySelector(':scope > b'))})),overflow:document.documentElement.scrollWidth>innerWidth,logosLoaded:teams.every(team=>{const img=team.querySelector('img');return img.complete&&img.naturalWidth>0;})};
        statTab?.click();
        before.stats=[...document.querySelectorAll('.detail-tab-panel:not([hidden]) .detail-comparison-teams span')].map(el=>el.textContent);
        before.bars=[...document.querySelectorAll('.detail-tab-panel:not([hidden]) .detail-comparison-bars')].slice(0,1).map(el=>[...el.querySelectorAll('i')].map(i=>i.style.background));
        before.values=[...document.querySelectorAll('.detail-tab-panel:not([hidden]) .detail-comparison-values')].slice(0,1).map(el=>[...el.querySelectorAll('span')].map(span=>span.textContent));
        const boxTab=document.querySelector('[data-detail-tab="box-score"]');boxTab?.click();
        before.boxTeams=[...document.querySelectorAll('.detail-tab-panel:not([hidden]) .detail-player-team h4')].map(el=>el.textContent);
        return before;
      });
      if(data.stats.length) {
        await page.locator('[data-detail-tab="team-stats"]').click();
        await page.screenshot({path:path.join(output,`stats-${width}-${index}.png`),fullPage:false,animations:'disabled'});
      }
      if(data.boxTeams.length) {
        await page.locator('[data-detail-tab="box-score"]').click();
        await page.screenshot({path:path.join(output,`box-${width}-${index}.png`),fullPage:false,animations:'disabled'});
      }
      const report=await page.evaluate(()=>window.__qaMeasure());
      assert.equal(data.overflow,false,`detail page overflow ${width}/${index}`);
      assert.ok(data.logosLoaded,`detail official logos ${width}/${index}`);
      assert.deepEqual(report.recordFailures,[],`detail record ${width}/${index}`);
      assert.deepEqual(report.overlaps,[],`detail overlap ${width}/${index}`);
      assert.deepEqual(report.clipped,[],`detail clipping ${width}/${index}`);
      const [left,right]=data.scoreboard;
      for(const field of ['logo','scoreBox','record'])assert.ok(Math.abs(left[field].centerY-right[field].centerY)<1,`${field} alignment ${width}/${index}: ${JSON.stringify(data.scoreboard)}`);
      assert.ok(Math.abs(left.nameBox.y-right.nameBox.y)<1,`name top ${width}/${index}`);
      const game=await page.evaluate(()=>activeDetailGame);
      assert.deepEqual(data.scoreboard.map(team=>team.name),game.teams.map(team=>team[0]),`scoreboard order ${width}/${index}`);
      if(data.stats.length)assert.deepEqual(data.stats.slice(0,2),game.teams.map(team=>team[1]),`stats order ${width}/${index}`);
      if(data.values.length) {
        const expected={NFL:['310','Total yards','350'],CFB:['310','Total yards','350'],MLB:['3','Runs','4'],NHL:['21','Shots','30'],NBA:['38','Rebounds','44'],NCAAB:['38','Rebounds','44']}[game.sport];
        assert.deepEqual(data.values[0],expected,`stat/value association ${width}/${index}`);
        assert.deepEqual(data.bars[0],['rgb(152, 0, 46)','rgb(29, 66, 138)'],`team color association ${width}/${index}`);
      }
      if(data.boxTeams.length)assert.deepEqual(data.boxTeams.slice(-2),game.teams.map(team=>team[0]),`box order ${width}/${index}`);
      results.push({width,view:'detail',index,...data,recordFailures:report.recordFailures.length,overlaps:report.overlaps.length,clipped:report.clipped.length});
    }
    assert.deepEqual(errors,[],`browser errors at ${width}`);
    await context.close();
    console.log(`Passed ${width}px: four card sets and ${detailCases.length} Game Centers`);
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
} finally { await browser.close(); }

// Warm the prior production service-worker cache before publishing, then verify
// the same browser profile upgrades to the exact new revision after Pages succeeds.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const warm=process.argv.includes('--warm-cache');
const dir='audit/ui-corrections-20261103';
const context=await playwright.chromium.launchPersistentContext(path.resolve('work/ui-review/production-profile'),{channel:'chrome',headless:true,viewport:{width:390,height:900},serviceWorkers:'allow'});
try{
  const page=await context.newPage();await page.bringToFront();
  await page.goto('https://slatemeter.app/',{waitUntil:'domcontentloaded'});
  await page.locator('.game-card').first().waitFor({timeout:45000});
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;await r.update();});
  const revision=warm?await page.locator('script[src*="app.js"]').getAttribute('src').then(s=>new URL(s, page.url()).searchParams.get('rev')):execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  await page.waitForFunction(async rev=>(await caches.keys()).includes('slatemeter-shell-'+rev),revision,{timeout:45000});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.game-card').first().waitFor({timeout:45000});
  const cache=await page.evaluate(async()=>({controlled:!!navigator.serviceWorker.controller,keys:await caches.keys(),assets:[...document.querySelectorAll('link[rel="stylesheet"],script[src]')].map(el=>el.href||el.src)}));
  assert.ok(cache.controlled);
  assert.ok(cache.keys.includes('slatemeter-shell-'+revision));
  if(!warm){
    assert.ok(cache.keys.filter(k=>k.startsWith('slatemeter-shell-')).every(k=>k==='slatemeter-shell-'+revision),'old shell caches retired');
    for(const file of ['app.js','styles.css','mobile-readability.css','scoring-runtime.js','sw.js']){
      const actual=await page.evaluate(async({file,revision})=>{const r=await fetch(file+'?rev='+revision);if(!r.ok)throw Error(r.status);return [...new Uint8Array(await r.arrayBuffer())];},{file,revision});
      const bytes=Buffer.from(actual),expected=fs.readFileSync('dist/'+file);
      assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(expected).digest('hex'),file+' matches verified build');
    }
    assert.ok(cache.assets.filter(u=>/\.(js|css)\?/.test(u)).every(u=>u.includes(revision)),'all module/style references use new revision');
    const logo=page.locator('.game-card .card-team-link').first();
    assert.equal(await logo.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(228, 222, 210)');
    assert.ok(await page.locator('.game-card .team-record').first().isVisible());
    assert.equal(await page.locator('.game-card .card-moment[data-moment-kind="last-score"]').evaluateAll(els=>els.some(el=>getComputedStyle(el).display!=='none')),false);
    await page.screenshot({path:dir+'/production-upgraded-cache.png'});
  }
  fs.writeFileSync(`${dir}/${warm?'production-cache-before':'production-cache-after'}.json`,JSON.stringify({url:page.url(),revision,...cache},null,2));
  console.log(`${warm?'Warmed previous':'Verified upgraded'} production cache: ${revision}`);
}finally{await context.close();}

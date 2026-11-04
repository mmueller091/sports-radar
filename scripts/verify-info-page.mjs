// Build and serve dist first. Pass --production to verify the published release.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const production = process.argv.includes('--production');
const base = production ? 'https://slatemeter.app/' : 'http://127.0.0.1:8768/';
const phase = production ? 'production' : 'local';
const dir = 'work/info-qa';
fs.mkdirSync(dir,{recursive:true});
const approved = JSON.parse(fs.readFileSync('test/fixtures/info-copy.json','utf8'));
// Capture the current public feed once; its model must match this release.
let fixture;
if (!production) {
  const capture = `${dir}/feed.json`;
  if (!fs.existsSync(capture)) {
    const response = await fetch('https://sports-radar-alerts.mmueller918.workers.dev/feed',{signal:AbortSignal.timeout(20000)});
    assert.ok(response.ok());
    fs.writeFileSync(capture,await response.text());
  }
  fixture = JSON.parse(fs.readFileSync(capture,'utf8'));
}
const browser = await playwright.chromium.launch({channel:'chrome',headless:true});
const results = [];
try {
  for (const width of [1440,768,390,320]) {
    const context = await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1,serviceWorkers:'block'});
    // Local navigation checks use the same recorded canonical feed on every width.
    if (!production) await context.route('https://sports-radar-alerts.mmueller918.workers.dev/feed**',route => route.fulfill({json:fixture}));
    await context.addInitScript(() => {
      localStorage.setItem('sports-radar-selected-favorites-v1',JSON.stringify([{sport:'NFL',name:'Baltimore Ravens',id:'33'}]));
    });
    const page = await context.newPage(), errors = [];
    async function selectSport(sport) {
      const chip = page.locator(`.sport-chip[data-sport="${sport}"]`);
      if (!await chip.isVisible()) await page.locator('#mobile-sport-filter-toggle').click();
      await chip.click();
    }
    page.on('pageerror',error => errors.push(String(error)));
    await page.goto(base+'#info',{waitUntil:'domcontentloaded'});
    await page.locator('#info-page:not(.hidden)').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const blocks = await page.locator('#info-page h1,#info-page h2,#info-page p').allTextContents();
    assert.deepEqual(blocks,approved,'all approved copy, in order');
    assert.equal(await page.locator('.nav-link[aria-current="page"]').innerText(),'Info');
    assert.equal(await page.locator('.control-row').isVisible(),false);
    assert.equal(await page.locator('#data-status').isVisible(),false);
    assert.equal(await page.locator('#info-page a,#info-page button,#info-page iframe').count(),0);
    assert.equal(await page.title(),'About SlateMeter — SlateMeter');
    const geometry = await page.evaluate(() => {
      const rect = selector => {const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
      const style=getComputedStyle(document.querySelector('#info-page'));
      const nav=[...document.querySelectorAll('.main-nav a')].filter(a=>getComputedStyle(a).display!=='none').map(a=>({text:a.textContent,...rect(`[data-page="${a.dataset.page}"]`)}));
      const overflow=[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width && (r.right>innerWidth || r.left<0);}).map(el=>({tag:el.tagName,id:el.id,class:el.className,right:el.getBoundingClientRect().right}));
      return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,nav,brand:rect('.brand'),actions:rect('.top-actions'),article:rect('#info-page'),font:style.fontFamily,color:style.color,background:getComputedStyle(document.body).backgroundColor,overflow};
    });
    fs.writeFileSync(`${dir}/${phase}-geometry-${width}.json`,JSON.stringify(geometry,null,2));
    await page.screenshot({path:`${dir}/${phase}-info-${width}.png`,fullPage:true});
    assert.ok(geometry.scrollWidth <= width,`no horizontal overflow at ${width}: ${JSON.stringify(geometry)}`);
    assert.deepEqual(geometry.nav.map(n=>n.text),['Slate','Info']);
    assert.equal(geometry.nav[0].top,geometry.nav[1].top,'tabs share one row');
    assert.ok(geometry.nav[0].right <= geometry.nav[1].left,'tabs do not collide');
    assert.ok(geometry.brand.right <= geometry.actions.left,'logo and actions do not collide');
    for (const n of geometry.nav) {
      assert.ok(n.left >= 0 && n.right <= width && n.height >= 40,'navigation is visible and tappable');
      const overlap = other => n.left < other.right && n.right > other.left && n.top < other.bottom && n.bottom > other.top;
      assert.equal(overlap(geometry.brand),false,'navigation clears branding');
      assert.equal(overlap(geometry.actions),false,'navigation clears actions');
    }
    assert.equal(geometry.color,'rgb(240, 232, 212)');
    assert.equal(geometry.background,'rgb(25, 28, 31)');
    assert.doesNotMatch(geometry.font,/Inter|Poppins|Montserrat|Manrope|Outfit|DM Sans|Space Grotesk/i);
    await page.locator('[data-page="home"]').click();
    await page.waitForFunction(() => state.page === 'home');
    await page.locator('#game-list .game-card').first().waitFor({timeout:45000});
    await selectSport('CFB');
    await page.locator('.seg[data-state="upcoming"]').click();
    const before = await page.evaluate(() => JSON.stringify({sport:state.sport,gameState:state.gameState,filters:state.sportFilters,favorites:state.favoriteTeams,watched:[...state.watchedGames],visible:[...state.visibleSports],showFCS:state.showFCS}));
    await page.locator('[data-page="info"]').click();
    await page.waitForFunction(() => state.page === 'info');
    await page.goBack();
    await page.waitForFunction(() => state.page === 'home');
    await page.goForward();
    await page.waitForFunction(() => state.page === 'info');
    await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('#info-page').isVisible(),true,'direct route survives reload');
    // Re-select filters after reload (only navigation, not reload, preserves transient filters).
    await page.locator('[data-page="home"]').click();
    await page.waitForFunction(() => state.page === 'home');
    await page.locator('#game-list .game-card').first().waitFor({timeout:45000});
    await selectSport('CFB');
    await page.locator('.seg[data-state="upcoming"]').click();
    await page.locator('[data-page="info"]').click();
    await page.waitForFunction(() => state.page === 'info');
    await page.locator('[data-page="home"]').click();
    await page.waitForFunction(() => state.page === 'home');
    const after = await page.evaluate(() => JSON.stringify({sport:state.sport,gameState:state.gameState,filters:state.sportFilters,favorites:state.favoriteTeams,watched:[...state.watchedGames],visible:[...state.visibleSports],showFCS:state.showFCS}));
    assert.equal(after,before,'Info round trip preserves filters and favorites');
    await selectSport('all');
    await page.locator('.seg[data-state="all"]').click();
    const game = page.locator('#game-list [data-open-game]').first();
    await game.waitFor({timeout:45000});
    await game.click();
    await page.locator('#game-detail-overlay:not([hidden])').waitFor({timeout:45000});
    await page.locator('.detail-panel').waitFor();
    assert.match(page.url(),/#game\//,'Game Center navigation still works');
    await page.screenshot({path:`${dir}/${phase}-game-center-${width}.png`});
    await page.goBack();
    await page.waitForFunction(() => !activeDetailGame);
    assert.equal(await page.locator('#game-list').isVisible(),true);
    await page.screenshot({path:`${dir}/${phase}-slate-${width}.png`});
    if (production && width === 1440) {
      const revision = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
      for (const file of ['index.html','app.js','ui-overhaul.css','scoring-runtime.js','notifications.js','sw.js']) {
        const response = await context.request.get(base+file+'?rev='+revision);
        assert.equal(response.ok(),true,file);
        const hash = bytes => createHash('sha256').update(bytes).digest('hex');
        assert.equal(hash(await response.body()),hash(fs.readFileSync('dist/'+file)),file+' matches verified build');
      }
    }
    assert.deepEqual(errors,[],'no browser runtime errors');
    results.push({width,copy:true,navigation:true,backForward:true,directReload:true,preservedPreferences:true,gameCenter:true,geometry,errors});
    await context.close();
  }
  fs.writeFileSync(`${dir}/${phase}-browser-results.json`,JSON.stringify({base,results},null,2)+'\n');
  console.log(`${phase}: Info copy, navigation, history, direct URL, preferences, geometry and Game Center passed at all four widths.`);
} finally { await browser.close(); }

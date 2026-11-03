// Real provider snapshots, official logos, and the complete production CSS cascade.
// Build first. --capture freezes the current feed; --before uses a saved baseline dist.
// --production verifies the deployed assets and live UI without response substitution.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {gzipSync, gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const before = process.argv.includes('--before'), production = process.argv.includes('--production');
const phase = production ? 'production' : before ? 'before' : 'after';
const dir = 'audit/ui-corrections-20261103', fixture = 'test/fixtures/ui-corrections-feed.json.gz';
const worker = 'https://sports-radar-alerts.mmueller918.workers.dev';
fs.mkdirSync(dir, {recursive:true});
fs.mkdirSync('work/ui-review/responses', {recursive:true});
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const fetchJson = async url => { const r = await fetch(url); assert.ok(r.ok, `${url}: ${r.status}`); return r.json(); };
if (process.argv.includes('--capture')) {
  const feed = fs.existsSync('work/ui-review/feed.json') ? readJson('work/ui-review/feed.json') : await fetchJson(worker+'/feed');
  const find = predicate => { const g = feed.games.find(predicate); assert.ok(g, 'real matchup available'); return g; };
  const chosen = [
    find(g => g.teams.some(t => t[0] === 'Washington Capitals') && g.teams.some(t => t[0] === 'Dallas Stars')),
    find(g => g.teams.some(t => t[0] === 'Tampa Bay Lightning')),
    find(g => g.sport === 'NHL' && g.momentLabel === 'Last score'),
    find(g => g.sport === 'NFL' && g.teams.some(t => /Raiders/.test(t[0]))),
    find(g => g.sport === 'NFL' && g.momentLabel === 'Decisive play'),
    find(g => g.sport === 'CFB' && g.teams.some(t => /Penn State/.test(t[0]))),
    find(g => g.sport === 'NBA' && g.teams.some(t => /Nets/.test(t[0]))),
    find(g => g.sport === 'MLB'),
    find(g => g.sport === 'NCAAB' && g.state === 'live'),
    find(g => g.sport === 'NCAAB' && g.state === 'upcoming')
  ];
  fs.writeFileSync(fixture, gzipSync(JSON.stringify({...feed, games:chosen, uiCapture:{source:worker+'/feed', capturedAt:new Date().toISOString()}})));
}
const frozen = JSON.parse(gunzipSync(fs.readFileSync(fixture)));
const selected = frozen.games;
let server;
if (!production) {
  const root = path.resolve(before ? 'work/ui-review/before' : 'dist');
  server = http.createServer((req,res) => {
    const pathname = new URL(req.url, 'http://local').pathname;
    const file = path.resolve(root, '.'+(pathname === '/' ? '/index.html' : decodeURIComponent(pathname)));
    if (!file.startsWith(root+path.sep)) { res.writeHead(403).end(); return; }
    try {
      res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf'})[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
}
const url = production ? 'https://slatemeter.app/' : `http://127.0.0.1:${server.address().port}/`;
const browser = await playwright.chromium.launch({channel:'chrome',headless:true});
const report = {phase,url,source:frozen.uiCapture,results:[]};
async function readyImages(page, selector = '#game-list img') {
  await page.locator(selector).evaluateAll(images => Promise.all(images.map(img => {
    img.loading = 'eager';
    if (img.complete) return;
    return new Promise(resolve => { img.addEventListener('load',resolve,{once:true}); img.addEventListener('error',resolve,{once:true}); });
  })));
}
async function renderSelection(page) {
  await page.evaluate(ids => {
    hideGameDetails();
    state.page = 'home';
    document.querySelector('#game-list').innerHTML = ids.map(id => games.find(g => g.id === id)).filter(Boolean).map(gameCard).join('');
  }, selected.map(g => g.id));
  await readyImages(page);
  await page.evaluate(() => document.fonts.ready);
}
try {
  for (const width of [1440,390,320]) {
    const context = await browser.newContext({viewport:{width,height:width === 1440 ? 1100 : 900}, deviceScaleFactor:1, serviceWorkers:production ? 'allow' : 'block'});
    if (!production) await context.route(worker+'/**', async route => {
      const u = new URL(route.request().url());
      if (u.pathname === '/feed') { await route.fulfill({json:frozen}); return; }
      // Cache real detail/team responses so both versions inspect the same evidence.
      const file = 'work/ui-review/responses/'+encodeURIComponent(u.pathname+u.search)+'.json';
      if (!fs.existsSync(file)) {
        console.log('Capturing provider response',u.pathname);
        const response = await fetch(u.href,{signal:AbortSignal.timeout(20000)});
        if (!response.ok) { await route.fulfill({status:response.status,body:await response.text()}); return; }
        const body = await response.text();
        fs.writeFileSync(file,body);
      }
      await route.fulfill({contentType:'application/json',body:fs.readFileSync(file,'utf8')});
    });
    const page = await context.newPage(), errors = [];
    await page.bringToFront();
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(url, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => typeof games !== 'undefined' && games.some(g => g.sport === 'NHL' && g.teams.some(t => t[0] === 'Washington Capitals')), {timeout:45000});
    if (production) {
      const revision = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
      assert.ok(await page.locator('script[src*="app.js"]').getAttribute('src').then(src => src.includes(revision)));
    }
    await renderSelection(page);
    const metrics = await page.locator('.game-card').evaluateAll(cards => cards.map(card => {
      const box = el => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
      const visible = el => !!el.getClientRects().length && getComputedStyle(el).display !== 'none';
      const rating = box(card.querySelector('.excitement'));
      return {id:card.dataset.id, card:box(card), rating,
        teams:[...card.querySelectorAll('.team-row')].map(row => {
          const img=row.querySelector('img'),shell=row.querySelector('.card-team-link,.team-logo-shell'),record=row.querySelector('.team-record'),name=row.querySelector('.team-name-text');
          return {imageLoaded:!!img && img.complete && img.naturalWidth>0, image:img ? box(img) : null,
            background:getComputedStyle(shell).backgroundColor, filter:img ? getComputedStyle(img).filter : '',
            record:record ? {text:record.textContent,visible:visible(record),box:box(record),fontSize:getComputedStyle(record).fontSize,color:getComputedStyle(record).color} : null,
            name:box(name),score:box(row.querySelector('.team-score')),nameClipped:name.scrollWidth>name.clientWidth+1};
        }), moments:[...card.querySelectorAll('.card-moment')].map(el=>({label:el.querySelector('strong').textContent,visible:visible(el),text:el.textContent})),
        leagueBackground:card.querySelector('.league-logo') ? getComputedStyle(card.querySelector('.league-logo')).backgroundColor : null};
    }));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `page overflow at ${width}`);
    for (const card of metrics) {
      for (const team of card.teams) {
        assert.ok(team.imageLoaded, `${card.id} official image loaded`);
        if (!before) {
          assert.equal(team.background,'rgb(228, 222, 210)', 'cream shell survives both stylesheets');
          assert.equal(team.filter,'none','official artwork is not recolored');
          if (team.record) {
            assert.ok(team.record.visible, `${card.id} record visible at ${width}`);
            assert.ok(parseFloat(team.record.fontSize)>=11,'record remains readable');
            assert.ok(team.record.box.right<=card.card.right && team.record.box.bottom<=card.card.bottom,'record inside card');
            assert.ok(team.record.box.right<=team.score.x+1 || team.record.box.y>=team.score.bottom || team.record.box.bottom<=team.score.y,'record avoids score');
            assert.ok(team.record.box.right<=card.rating.x+1 || team.record.box.y>=card.rating.bottom,'record avoids excitement rating');
          }
          if (width<=600) assert.equal(team.nameClipped,false,`${card.id} team name not clipped`);
        }
      }
      for (const moment of card.moments) {
        if (!before) assert.equal(moment.visible, moment.label==='Last score' ? width>600 : true, `${moment.label} at ${width}`);
      }
      assert.equal(card.leagueBackground,'rgba(0, 0, 0, 0)','league logos stay distinct');
    }
    await page.screenshot({path:`${dir}/${phase}-${width}-full.png`,fullPage:true});
    for (const [label,g] of [['capitals-stars',selected[0]],['lightning',selected[1]],['completed',selected[2]],['light-logo',selected[3]]]) {
      const card=page.locator(`.game-card[data-id="${g.id}"]`);
      if (await card.count()) await card.screenshot({path:`${dir}/${phase}-${width}-${label}.png`});
    }
    // A completed game still has scoring evidence and the timeline in Game Center.
    await page.locator(`.game-card[data-id="${selected[2].id}"] [data-open-game]`).click();
    await page.locator('#game-detail-content .detail-tabs').waitFor({timeout:45000});
    await page.locator('#game-detail-content .detail-plays li').first().waitFor({state:'attached',timeout:45000});
    const detail = {scoringPlays:await page.locator('#game-detail-content .detail-plays li').count(),timeline:await page.locator('#game-detail-content .timeline-section').count()};
    assert.ok(detail.scoringPlays>0); assert.ok(detail.timeline>0);
    await readyImages(page,'#game-detail-content img');
    await page.screenshot({path:`${dir}/${phase}-${width}-game-center.png`,fullPage:true});
    await renderSelection(page);
    await page.locator(`.game-card[data-id="${selected[4].id}"] [data-open-game]`).click();
    await page.locator('#game-detail-content .detail-moment').waitFor({timeout:45000});
    assert.match(await page.locator('#game-detail-content .detail-moment').textContent(),/Decisive play/i);
    await renderSelection(page);
    // Real team navigation and its existing schedule/standings surfaces.
    await page.locator(`.game-card[data-id="${selected[0].id}"] [data-card-team-index="1"]`).click();
    await page.locator('.team-hero h1').waitFor();
    assert.match(await page.locator('.team-hero h1').textContent(),/Washington Capitals/);
    await readyImages(page);
    await page.screenshot({path:`${dir}/${phase}-${width}-team.png`,fullPage:true});
    await page.locator('[data-team-tab="standings"]').click();
    await page.locator('.team-standing-team img').first().waitFor({timeout:45000});
    await readyImages(page);
    await page.screenshot({path:`${dir}/${phase}-${width}-standings.png`,fullPage:true});
    await page.locator('[data-team-tab="schedule"]').click();
    await page.locator('.team-schedule-opponent img').first().waitFor({timeout:45000});
    await readyImages(page);
    await page.screenshot({path:`${dir}/${phase}-${width}-schedule.png`,fullPage:true});
    // Search and Favorites use official marks independently of game cards.
    await page.locator('#search-button').click();
    await page.locator('#search-query').fill('Washington Capitals');
    await page.locator('.search-team-logo img').first().waitFor();
    await readyImages(page,'.search-team-logo img');
    if(!before) assert.equal(await page.locator('.search-team-logo img').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(228, 222, 210)');
    await page.screenshot({path:`${dir}/${phase}-${width}-search.png`});
    await page.locator('#search-dialog').press('Escape');
    await page.locator('#profile-button').click();
    await page.locator('#favorite-sport').selectOption('NHL');
    await page.locator('#favorite-query').fill('Washington Capitals');
    await page.locator('.favorite-result img').first().waitFor();
    await readyImages(page,'.favorite-result img');
    if(!before) assert.equal(await page.locator('.favorite-result img').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(228, 222, 210)');
    await page.locator('.favorite-result').first().click();
    await page.locator('.favorite-tag img').first().waitFor();
    if(!before) assert.equal(await page.locator('.favorite-tag img').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(228, 222, 210)');
    await page.screenshot({path:`${dir}/${phase}-${width}-favorites.png`});
    if (!before && width===320) {
      await page.locator('#preferences-dialog').press('Escape');
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>games.length>0);
      await renderSelection(page);
      for(const edge of [600,601]) {
        await page.setViewportSize({width:edge,height:900});
        const last=page.locator(`.game-card[data-id="${selected[2].id}"] .card-moment`);
        assert.equal(await last.isVisible(),edge===601,'Last score breakpoint is precisely 600px');
        assert.ok(await page.locator('.team-record').first().isVisible());
      }
      if(!production) {
        // Missing data and non-clickable shells use the same production markup.
        await page.setViewportSize({width:320,height:900});
        await page.evaluate(()=>{
          const game=structuredClone(games.find(g=>g.sport==='NHL'));
          for(const team of game.teams){team[5]=null;team[8]=null;}
          document.querySelector('#game-list').innerHTML=gameCard(game);
        });
        assert.equal(await page.locator('.team-record').count(),0,'no placeholder record');
        assert.equal(await page.locator('.team-logo-shell').count(),2);
        assert.equal(await page.locator('.team-logo-shell').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(228, 222, 210)');
      }
    }
    assert.deepEqual(errors,[],`browser errors at ${width}`);
    report.results.push({width,metrics,detail,teamNavigation:true,errors});
    console.log(`${phase} ${width}px: ${metrics.length} real cards, Game Center and team navigation passed`);
    await context.close();
  }
  if (!before && !production && fs.existsSync(`${dir}/before.json`)) {
    const baseline=readJson(`${dir}/before.json`);
    for (const run of report.results) for (const card of run.metrics) {
      const old=baseline.results.find(r=>r.width===run.width).metrics.find(c=>c.id===card.id);
      card.teams.forEach((team,i)=>{
        assert.equal(team.image.width,old.teams[i].image.width,'logo width unchanged');
        assert.equal(team.image.height,old.teams[i].image.height,'logo height unchanged');
        if(run.width===1440) assert.deepEqual(team.record,old.teams[i].record,'desktop records unchanged');
      });
    }
  }
} finally {
  fs.writeFileSync(`${dir}/${phase}.json`,JSON.stringify(report,null,2));
  await browser.close();
  if(server) await new Promise(resolve=>server.close(resolve));
}

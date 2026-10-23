import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureDir, repoRoot, readJson } from '../calibration/helpers.mjs';

const args = process.argv.slice(2);
const has = flag => args.includes(flag);
const valueAfter = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const onlySport = valueAfter('--sport');
const onlyDate = valueAfter('--date');
const overwrite = has('--overwrite');
const maxPerSlate = Number(valueAfter('--max-per-slate') || 50);

const config = readJson(path.join(repoRoot, 'calibration', 'slates.json'));
fs.mkdirSync(fixtureDir, { recursive:true });

async function getJson(url) {
  const response = await fetch(url, { headers:{ accept:'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

function endpoint(apiSport, league, kind, query) {
  const base = `https://site.api.espn.com/apis/site/v2/sports/${apiSport}/${league}/${kind}`;
  return query ? `${base}?${query}` : base;
}

let captured = 0;
let skipped = 0;
let failed = 0;

for (const slate of config.slates || []) {
  if (onlySport && slate.modelSport.toLowerCase() !== onlySport.toLowerCase()) continue;
  for (const date of slate.dates || []) {
    if (onlyDate && date !== onlyDate.replaceAll('-', '')) continue;
    const boardUrl = endpoint(slate.apiSport, slate.league, 'scoreboard', `dates=${date}&limit=500`);
    let board;
    try {
      board = await getJson(boardUrl);
    } catch (error) {
      console.warn(`SKIP ${slate.modelSport} ${date}: scoreboard fetch failed: ${error.message}`);
      failed++;
      continue;
    }

    const events = (board.events || []).slice(0, maxPerSlate);
    console.log(`${slate.modelSport} ${date}: ${events.length} events`);

    for (const event of events) {
      const competition = event.competitions?.[0];
      const state = String(competition?.status?.type?.state || '').toLowerCase();
      if (state !== 'post') {
        skipped++;
        continue;
      }

      const eventId = String(event.id || competition?.id || '');
      if (!eventId) continue;
      const file = path.join(fixtureDir, `${slate.modelSport}-${date}-${eventId}.json`);
      if (!overwrite && fs.existsSync(file)) {
        skipped++;
        continue;
      }

      let summary = {};
      try {
        summary = await getJson(endpoint(slate.apiSport, slate.league, 'summary', `event=${eventId}`));
      } catch (error) {
        console.warn(`  ${eventId}: summary failed, saving scoreboard event only: ${error.message}`);
      }

      const fixture = {
        capturedAt:new Date().toISOString(),
        source:'ESPN public site API',
        modelSport:slate.modelSport,
        apiSport:slate.apiSport,
        league:slate.league,
        date,
        eventId,
        event,
        summary
      };

      fs.writeFileSync(file, JSON.stringify(fixture, null, 2));
      captured++;
      console.log(`  saved ${path.basename(file)}`);
    }
  }
}

console.log(`\nDone. captured=${captured} skipped=${skipped} failedSlates=${failed}`);
console.log(`Fixtures: ${fixtureDir}`);

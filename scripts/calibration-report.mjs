import fs from 'node:fs';
import path from 'node:path';
import { loadCore, loadFixtures, readJson, expectationsPath, contextOverridesPath, repoRoot, scoreFixture, expectationFor, csvEscape } from '../calibration/helpers.mjs';

const core = await loadCore();
const fixtures = loadFixtures();
if (!fixtures.length) {
  console.error('No real-game fixtures found. Run: node scripts/capture-calibration-fixtures.mjs');
  process.exit(2);
}

const expectations = readJson(expectationsPath, {events:{}, comparisons:[]});
const overrides = readJson(contextOverridesPath, {events:{}});
const rows = fixtures.map(f => scoreFixture(f, core, overrides)).filter(r => !r.error);
rows.sort((a,b) => a.modelSport.localeCompare(b.modelSport) || String(a.date).localeCompare(String(b.date)) || b.finalScore - a.finalScore);

console.log('\nREAL-GAME CALIBRATION REPORT\n');
let group = '';
for (const row of rows) {
  const nextGroup = `${row.modelSport} ${row.date}`;
  if (nextGroup !== group) {
    group = nextGroup;
    console.log(`\n${group}`);
    console.log('-'.repeat(group.length));
  }
  const exp = expectationFor(expectations, row.eventId);
  const human = Number(exp?.humanScore);
  const error = Number.isFinite(human) ? row.finalScore - human : null;
  console.log(`${String(row.finalScore).padStart(2)}  ${row.matchup.padEnd(48).slice(0,48)} ${row.scoreLine.padStart(8)}  base=${String(row.baseScore).padStart(2)} live=${String(row.liveBonus).padStart(3)} momentum=${String(row.momentumPoints).padStart(2)}${error === null ? '' : `  human=${human} err=${error >= 0 ? '+' : ''}${error}`}`);
}

console.log('\nDISTRIBUTION BY SPORT');
for (const sport of [...new Set(rows.map(r => r.modelSport))].sort()) {
  const list = rows.filter(r => r.modelSport === sport);
  const avg = list.reduce((s,r) => s + r.finalScore, 0) / list.length;
  const pct = threshold => Math.round(100 * list.filter(r => r.finalScore >= threshold).length / list.length);
  console.log(`${sport.padEnd(7)} n=${String(list.length).padStart(3)} avg=${avg.toFixed(1).padStart(5)}  70+=${String(pct(70)).padStart(3)}%  80+=${String(pct(80)).padStart(3)}%  90+=${String(pct(90)).padStart(3)}%`);
}

const annotated = rows.filter(r => Number.isFinite(Number(expectationFor(expectations, r.eventId)?.humanScore)));
if (annotated.length) {
  const errors = annotated.map(r => r.finalScore - Number(expectationFor(expectations, r.eventId).humanScore));
  const mae = errors.reduce((s,e) => s + Math.abs(e), 0) / errors.length;
  const bias = errors.reduce((s,e) => s + e, 0) / errors.length;
  console.log(`\nHUMAN CALIBRATION n=${annotated.length} MAE=${mae.toFixed(2)} bias=${bias >= 0 ? '+' : ''}${bias.toFixed(2)}`);
}

const suspicious = rows.filter(r => r.finalScore >= 90 || r.finalScore <= 20 || (r.gap !== null && r.gap >= 3 && ['MLB','NHL'].includes(r.modelSport) && r.finalScore >= 80));
if (suspicious.length) {
  console.log('\nREVIEW THESE EXTREMES');
  suspicious.forEach(r => console.log(`${r.finalScore} ${r.modelSport} ${r.eventId} ${r.matchup} ${r.scoreLine}`));
}

const outputDir = path.join(repoRoot, 'calibration', 'output');
fs.mkdirSync(outputDir, {recursive:true});
const csv = [
  ['sport','date','event_id','matchup','score_line','opening_score','base_score','live_bonus','momentum','decisive_last_play','model_score','human_score','error'].join(','),
  ...rows.map(r => {
    const exp = expectationFor(expectations, r.eventId);
    const human = Number.isFinite(Number(exp?.humanScore)) ? Number(exp.humanScore) : '';
    const error = human === '' ? '' : r.finalScore - human;
    return [r.modelSport,r.date,r.eventId,r.matchup,r.scoreLine,r.openingScore ?? '',r.baseScore,r.liveBonus,r.momentumPoints,r.decisiveLastPlay,r.finalScore,human,error].map(csvEscape).join(',');
  })
].join('\n');
const csvPath = path.join(outputDir, 'latest.csv');
fs.writeFileSync(csvPath, csv);
console.log(`\nCSV written: ${csvPath}`);

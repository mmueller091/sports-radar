import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as adapter from '../alerts-worker/src/game-model.js';
import * as active from '../alerts-worker/src/live-game-model.js';
const require=createRequire(import.meta.url),runtime=require('../scoring/live-runtime.cjs');
const {before,event:synthetic}=require('../test/helpers/football-transition.cjs');
const captures=JSON.parse(fs.readFileSync('test/fixtures/football-pregame-20261031.json'));
const originals=captures.cases.map(c=>({event:c.event,sport:c.sport,basis:'October 31 retained pregame capture; controlled clock/score projection'}));
for(const file of fs.readdirSync('test/fixtures/real-games').filter(f=>f.startsWith('NFL-')).slice(0,2)) {
  const f=JSON.parse(fs.readFileSync('test/fixtures/real-games/'+file));
  const event=structuredClone(f.event),c=event.competitions[0];
  if(!c.odds?.length)c.odds=f.summary?.pickcenter || f.summary?.header?.competitions?.[0]?.odds;
  originals.push({event,sport:'NFL',basis:`Archived ${file}; stored records/line, controlled clock/score projection (not a historical pregame observation)`});
}
for(const sport of ['NFL','CFB'])for(const spread of [null,0,26.5]) originals.push({event:synthetic(spread),sport,basis:'Synthetic spread/score continuity control'});
const rows=[];
for(const input of originals)for(const [label,period,clock] of [['Kickoff',1,'15:00'],['Q1 two minutes',1,'13:00'],['Q1 five minutes',1,'10:00'],['Halftime',2,'0:00'],['Late scoreless',4,'2:00']])for(const wp of [null,.5,.97]) {
  const event=structuredClone(input.event),c=event.competitions[0];
  c.competitors.forEach(t=>t.score='0');delete c.situation;
  c.status={period,displayClock:clock,type:{state:'in',...(label==='Halftime'?{name:'STATUS_HALFTIME',detail:'Halftime'}:{})}};
  const summary={header:{competitions:[structuredClone(c)]},...(wp===null?{}:{winprobability:[{homeWinPercentage:wp}]})};
  const old=adapter.normalizeEvent(structuredClone(event),input.sport);
  const oldResult=before.applyLiveSnapshot(old,old.sourceCompetition,structuredClone(summary));
  const game=active.normalizeEvent(structuredClone(event),input.sport);
  const result=runtime.applyLiveSnapshot(game,game.sourceCompetition,structuredClone(summary));
  const preEvent=structuredClone(event);preEvent.competitions[0].status={period:0,type:{state:'pre'}};
  const pre=active.normalizeEvent(preEvent,input.sport);
  if(label==='Kickoff')assert.equal(game.score,pre.score);
  rows.push({sport:input.sport,game:event.name,label,wp,basis:input.basis,spread:game.pregameBaseline.spread,calibratedPregame:pre.score,
    before:{score:old.score,opening:old.openingScore,factors:old.factors,live:old.live.components,momentum:old.momentumPoints,trajectory:oldResult.trajectoryScoring},
    after:{score:game.score,opening:game.openingScore,factors:game.factors,live:game.live.components,momentum:game.momentumPoints,trajectory:result.trajectoryScoring,evidence:result.state.footballEvidence}});
}
const invariance=[];
for(const file of fs.readdirSync('test/fixtures/real-games').filter(f=>f.endsWith('.json'))) {
  const f=JSON.parse(fs.readFileSync('test/fixtures/real-games/'+file));
  const a=adapter.normalizeEvent(structuredClone(f.event),f.modelSport),b=active.normalizeEvent(structuredClone(f.event),f.modelSport);
  if(a.state!=='live' || !['NFL','CFB'].includes(a.sport)) {
    adapter.enrichGame(a,structuredClone(f.summary));active.enrichGame(b,structuredClone(f.summary));
    if(a.state==='live')before.applyLiveSnapshot(a,a.sourceCompetition,f.summary);
    assert.equal(a.score,b.score,file);assert.deepEqual(a.factors,b.factors,file);
    invariance.push({file,sport:a.sport,state:a.state,score:a.score});
  }
}
const result={modelVersion:runtime.MODEL_VERSION,baselineCommit:'f31e46d',policy:runtime.POLICY_ID,rows,invariance};
fs.writeFileSync('calibration/output/football-transition-20261031.json',JSON.stringify(result,null,2)+'\n');
const representative=rows.filter(r=>r.wp===null && (r.game===originals[2].event.name || r.game===originals[6].event.name));
const table=representative.map(r=>`| ${r.sport} ${r.game} | ${r.label} | ${r.calibratedPregame} | ${r.before.score} | ${r.after.score} |`).join('\n');
const body=`# Football pregame-to-live continuity — October 31, 2026

Production model: ${runtime.MODEL_VERSION}. Comparison baseline: f31e46d. All comparisons execute scoring/live-runtime.cjs → calibration/shadow-candidate.cjs → the NFL/CFB models, not the legacy rateGame result alone. The frozen previous runtime selects its original unchanged policy. Full factors, live components, history, trajectory, uncertainty evidence and input provenance are in [the comparison JSON](output/football-transition-20261031.json).

## Correction

At kickoff, the calibrated opening rating owns the whole state basis. Through the first half, a cubic smoothstep transfers ownership to the existing live baseline, retained context/stakes, and current-tension award. This happens before live bonus/floor/history aggregation; actual plays retain their independent credit. There is no score cap, kickoff subtraction, team exception or step activation. The existing CFB 34-to-48 tension scale and midgame competition/history improvements remain selected. The transition is fully mature at halftime and introduces no new fourth-quarter gate.

Both sports now use the October 31 calibrated pregame basis in production. Market competitiveness and signed injury/context reductions therefore survive the transition. A smooth market-to-validated-ESPN uncertainty handoff prevents an early tied scoreboard from erasing expected mismatch. Missing ESPN WP uses remaining expected spread and the observed score in touchdown scoring units, or neutral uncertainty when neither market nor WP is available. It does not select the missing-WP maximum. Actual ESPN telemetry remains separate from the internal estimate.

The feed retains the last observed pregame baseline, factors and market inputs. It recovers that baseline from D1 after feed/Worker resets, including snapshots from the preceding calibrated release. Browser refreshes receive that same serialized value. If no pregame observation exists, the live model uses a reconstruction with the same calibrated rules; the football card hides “vs start” instead of labeling that estimate as an observed start. Completed-game rating calculations are untouched.

## Representative controlled projections (missing WP)

These retain actual captured team/record/market inputs, with the listed clock and a 0–0 score imposed for before/after comparison. They are not claims about the historical scores at those clocks. The Bucknell capture lists Lehigh -27.5, versus -26.5 in the user's later screenshot.

| Game | State | Calibrated pregame | Previous live | Corrected live |
| --- | --- | ---: | ---: | ---: |
${table}

## Verification

${rows.length} production-path controlled comparisons; kickoff equals calibrated pregame across all tested WP/market combinations. ${invariance.length} archived completed/non-football/upcoming fixtures have identical scores and factors under the previous and current production selections. The regression matrix additionally covers meaningful early defensive touchdowns, early/final fourth downs, possessions, down/distance, overtime, postseason, missing/available WP, large spreads and pick’em, scoreless games, upsets, and late comeback viability. Browser-bundle and Worker comparisons cover 504 football state/market/score/WP combinations. Existing frozen experimental and calibration policies remain unchanged; only the production selection enables the new transition.
`;
fs.writeFileSync('calibration/football-transition-20261031.md',body);
console.log(JSON.stringify({comparisons:rows.length,unchanged:invariance.length,representative:representative.map(r=>({sport:r.sport,game:r.game,state:r.label,pre:r.calibratedPregame,before:r.before.score,after:r.after.score}))},null,2));

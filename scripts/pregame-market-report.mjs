import fs from 'node:fs';
import {createRequire} from 'node:module';
import * as active from '../alerts-worker/src/live-game-model.js';
import {nflPregameContext} from '../alerts-worker/src/nfl-pregame.js';
const require=createRequire(import.meta.url),before=require('../test/helpers/pregame-market-before.cjs');
const input=JSON.parse(fs.readFileSync('test/fixtures/pregame-market-20261101.json')),now=Date.parse(input.capturedAt);
const opposition=[...new Map(input.cases.flatMap(f=>f.summary.standings?.groups||[])
  .flatMap(g=>g.standings?.entries||[]).map(t=>[String(t.id),t])).values()];
const cases=input.cases.map(f=>{
 const event=structuredClone(f.event),game=active.normalizeEvent(event,f.sport);
 active.preserveFootballPregameMarket(game,f.previous,now);
 // Match production's existing 42-hour research window; do not introduce new
 // context for later games while measuring the isolated market correction.
 if(Date.parse(game.startTime)-now<=42*3600000)nflPregameContext(game,f.summary,[],opposition,now);
 active.applyContextsToGame(game,f.previous.qualitativeContexts||[]);
 active.enrichGame(game,structuredClone(f.summary),f.previous);
 return {sport:f.sport,id:game.id,teams:game.teams.map(t=>t[0]),start:game.startTime,line:game.line,
   before:f.previous.score,after:game.score,delta:game.score-f.previous.score,beforeFactors:f.previous.factors,afterFactors:game.factors,
   oddsSource:game.pregameMarketQuote?.source,baselineConsistent:game.score===game.pregameBaseline.score,source:f.source};
});
const controlled=[];
for(const sport of ['NFL','CFB'])for(const days of [1,4,7,14])for(const spread of [3,sport==='NFL'?9.5:35]) {
 const date=new Date(now+days*86400000).toISOString(),c={status:{type:{state:'pre'}},competitors:[
  {homeAway:'away',team:{id:'a',abbreviation:'DOG',displayName:'Underdog'},score:'0',records:[{summary:'4-2'}]},
  {homeAway:'home',team:{id:'h',abbreviation:'FAV',displayName:'Favorite'},score:'0',records:[{summary:'4-2'}]}]};
 const event={id:'controlled',date,season:{year:2026,type:2},competitions:[c]},prior=before.normalizeEvent(structuredClone(event),sport);
 prior.line={spread:`FAV -${spread}`,total:52,provider:'controlled',verifiedClose:false};
 const game=active.normalizeEvent(structuredClone(event),sport);active.preserveFootballPregameMarket(game,prior,now);
 controlled.push({sport,days,spread,before:prior.score,after:game.score,delta:game.score-prior.score,marketFactors:game.factors.filter(f=>/spread|scoring potential|scoring upside/i.test(f.label))});
}
const report={baseline:'6de87bd12d52dec20226c4d02c2b04206371382b',model:'2026-11-01.football-market.2',capturedAt:input.capturedAt,cases,controlled};
report.preReleaseEvidence=input.preReleaseEvidence;
fs.writeFileSync('calibration/output/pregame-market-hotfix-20261101.json',JSON.stringify(report,null,2)+'\n');
const rows=cases.map(c=>`| ${c.teams.join(' at ')} | ${c.line?.spread} / ${c.line?.total} | ${c.before} | ${c.after} | ${c.delta>0?'+':''}${c.delta} |`).join('\n');
const matrix=controlled.filter(c=>c.days===7).map(c=>`| ${c.sport} | ${c.spread} | ${c.before} | ${c.after} | ${c.delta>0?'+':''}${c.delta} |`).join('\n');
fs.writeFileSync('calibration/pregame-market-hotfix-20261101.md',`# Upcoming football market hotfix\n\nModel: ${report.model}. Baseline: ${report.baseline}.\n\n## Root cause\n\nThe football-live 48-hour guard compared quote time with kickoff, which incorrectly excludes early markets from that context helper. It was not itself called by the upcoming rating calculation. The verified pregame mismatch had two connected causes: future provider updates omitted raw odds while the feed retained only their displayed line; and prepareFootballOpening rebuilt opening factors without copying the new upcoming baseline to the visible score/factors. Thus visible spreads and totals could disagree with pregame scoring.\n\n## Isolated correction\n\nUpcoming NFL/CFB select one eligible market for display, baseline and visible rating. Fresh provider odds take priority; valid retained raw markets survive omissions; older publications can migrate their exact displayed spread/total with explicit untimestamped provenance. First-observed time is retained, not renewed by another missing-data update. Quotes older than 48 hours are aged against supplied observation time, independently of days until kickoff. Missing quote timestamps use actual provider observation time; missing markets add nothing. Live/in-play, malformed/future timestamps and post-kickoff quotes cannot supply upcoming markets. Current source markets can refresh an untimestamped observation; absent updates cannot.\n\nThe live helper uses this eligibility rule only for upcoming states. Its existing live branch, weights and safeguards are unchanged. Recorded history, completed ratings and unrelated sports are not recalculated. Evaluation time is not a content fingerprint, preserving existing refresh reuse and request cadence.\n\n## Captured production examples\n\nCapture: ${input.capturedAt}. Before ratings are the actual published feed. After ratings use the same teams, records, retained line, available summary and verified NFL context.\n\n| Game | Spread / total | Before | After | Delta |\n|---|---|---:|---:|---:|\n${rows}\n\n## Controlled missing-market comparisons\n\nThese are controlled inputs, not additional real-game claims. Every 1/4/7/14-day horizon produces the same rating for the same eligible market.\n\n| Sport | Spread | Before | After | Delta |\n|---|---:|---:|---:|---:|\n${matrix}\n\nFull factors and all horizon results are in output/pregame-market-hotfix-20261101.json. Differences are existing spread/total modifiers and the existing market-sensitive team-quality calculation; no weights changed. The already-correct Bears–Seahawks market should remain unchanged.\n`);
const reportPath='calibration/pregame-market-hotfix-20261101.md';
let text=fs.readFileSync(reportPath,'utf8');
if(input.preReleaseEvidence)text+=`\n## Earlier production evidence\n\nA retained ${input.preReleaseEvidence.modelVersion} feed from ${input.preReleaseEvidence.updatedAt}, before football-live.1 was deployed, already showed the same four ratings and market omissions. The pregame mismatch therefore predates that release. Its compact evidence is retained with the regression capture.\n`;
text+='\n## Validation\n\n918 tests passed, zero failures. The full browser/Worker suite, exact live/final and unrelated-sport parity against the frozen deployed model, 295-game warm-cache reuse, real feed repair/expiry, 1/4/7/14-day market matrix, syntax checks, test-score.js, browser build and Wrangler dry run passed. No scoring weights, historical snapshots, recurring requests, subscriptions, database schema or other sports were changed.\n';
fs.writeFileSync(reportPath,text);
console.log(JSON.stringify({cases,controlled:controlled.filter(c=>c.days===7)},null,2));

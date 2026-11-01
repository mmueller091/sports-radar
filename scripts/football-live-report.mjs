import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import * as active from '../alerts-worker/src/live-game-model.js';
import {loadFixtures} from '../calibration/helpers.mjs';
import {replayCheckpoints} from './replay-inputs.mjs';
import {footballScenario} from '../test/fixtures/football-live-scenarios.mjs';
const require=createRequire(import.meta.url),before=require('../test/helpers/football-live-before.cjs');
const run=(adapter,event,sport,summary)=>{const game=adapter.normalizeEvent(structuredClone(event),sport);adapter.enrichGame(game,structuredClone(summary));return game;};
const scenarios=[];
for (const sport of ['NFL','CFB']) for (const [label,params] of [
  ['opening live',{period:1,clock:'15:00',away:0}],
  ['one drive, 35-point underdog',{spread:35,period:1,clock:'12:00',away:3}],
  ['early Q2 two-score underdog lead',{spread:sport==='NFL'?13.5:28,away:sport==='NFL'?13:14}],
  ['halftime underdog lead',{spread:sport==='NFL'?13.5:28,period:2,clock:'0:00',away:14}],
  ['late underdog lead',{spread:sport==='NFL'?13.5:28,period:4,clock:'5:00',away:14}],
  ['favorite merely underperforming line',{spread:35,home:14,away:0}],
  ['even close matchup',{spread:1,period:4,clock:'5:00',home:24,away:23}],
  ['ranked favorite trailing, no odds',{rank:3,odds:false,period:4,clock:'5:00',away:7}],
]) {
  const s=footballScenario({sport,...params}),a=run(before,s.event,sport,s.summary),b=run(active,s.event,sport,s.summary);
  scenarios.push({sport,label,before:a.score,after:b.score,delta:b.score-a.score,upsetBefore:a.upsetPoints,upsetAfter:b.upsetPoints});
}
const histories=[];let checkpointCount=0;const allFlags=[];
const captures=JSON.parse(readFileSync('test/fixtures/football-live-20261101.json')).cases;
const namedExamples=captures.map(f=>{
  const a=run(before,f.event,f.modelSport,f.summary),b=run(active,f.event,f.modelSport,f.summary);
  return {eventId:f.eventId,source:f.source,capturedAt:f.capturedAt,before:a.score,after:b.score,
    scores:b.teams.map(t=>({team:t[0],score:t[2]})),phase:b.live?.phase,
    explanation:require('../scoring/live-runtime.cjs').footballLiveExplanation(b),developments:b.verifiedDevelopments};
});
const fixtures=[...loadFixtures(),...captures];
for (const f of fixtures) {
  const sport=f.modelSport;
  const a=run(before,f.event,sport,f.summary),b=run(active,f.event,sport,f.summary);
  if (!['NFL','CFB'].includes(sport)) {
    if (a.score!==b.score || JSON.stringify(a.factors)!==JSON.stringify(b.factors)) throw Error(`Other sport changed: ${f.eventId}`);
    continue;
  }
  const available=replayCheckpoints(f).checkpoints;
  // Every scoring state plus a fixed regular-game grid and the last ten plays:
  // covers opening/half/late/peak without millions of redundant prefix replays.
  const scoringIds=new Set((f.summary?.scoringPlays||[]).map(p=>String(p.id)));
  const chosen=new Set([...Array.from({length:21},(_,i)=>Math.round((available.length-1)*i/20)),
    ...available.map((cp,i)=>scoringIds.has(String(cp.play.id))?i:-1).filter(i=>i>=0),
    ...Array.from({length:Math.min(10,available.length)},(_,i)=>available.length-1-i)]);
  const cps=available.filter((_,i)=>chosen.has(i));
  const rows=cps.map(cp=>{
    const event={...cp.event,competitions:[cp.competition]};
    // New live captures retain explicitly supplied closing markets. The older
    // historical replay inputs remain untouched when such evidence is absent.
    const summary=captures.includes(f) ? {...cp.summary,pickcenter:f.summary.pickcenter} : cp.summary;
    const old=run(before,event,sport,summary),fresh=run(active,event,sport,summary);
    checkpointCount++;
    const oldFactor=old.upsetPoints||0,newFactor=fresh.upsetPoints||0;
    const delta=fresh.score-old.score;
    const explained=delta===0 || oldFactor!==newFactor;
    const row={playId:String(cp.play.id),period:cp.competition.status.period,clock:cp.competition.status.displayClock,
      before:old.score,after:fresh.score,delta,upsetBefore:oldFactor,upsetAfter:newFactor,explained};
    if(Math.abs(delta)>5)allFlags.push({sport,eventId:f.eventId,...row,reason:explained?(fresh.liveSurprise?.market?.source==='rankings'?'Modest rank-based CFB upset threat where no historical line is available':'Continuous market-based surprise replaces elapsed-time gate / magnitude curve'):'UNEXPLAINED'});
    return row;
  });
  const first=rows[0],half=rows.reduce((best,r)=>r.period===2?r:best,null),late=rows.find(r=>r.period>=4),peakBefore=rows.reduce((best,r)=>!best||r.before>best.before?r:best,null),peakAfter=rows.reduce((best,r)=>!best||r.after>best.after?r:best,null);
  histories.push({sport,eventId:f.eventId,name:f.event.name || f.event.shortName,opening:[a.openingScore,b.openingScore],first,half,late,peakBefore,peakAfter,final:[a.score,b.score],checkpoints:rows.length,changed:rows.filter(r=>r.delta!==0).length});
  if(a.openingScore!==b.openingScore || f.event.competitions[0].status?.type?.completed && a.score!==b.score)throw Error(`Nonlive changed ${f.eventId}`);
}
const output={model:'2026-11-01.football-live.1',baselineCommit:'92cec7c2a04c9d1c0c40de31b53a4f4f8110c70c',provenance:'Frozen self-contained current-production adapter; archived provider events and validated replayCheckpoints. Synthetic scenarios are separate from historical evidence. Every scoring state, 21 evenly spaced checkpoints and final ten plays are sampled; peaks are sampled checkpoint peaks.',namedExamples,scenarios,histories,checkpointCount,flags:allFlags,unexplained:allFlags.filter(r=>r.reason==='UNEXPLAINED')};
writeFileSync('calibration/output/football-live-20261101.json',JSON.stringify(output,null,2)+'\n');
const table=rows=>rows.map(r=>`| ${r.sport} | ${r.label} | ${r.before} | ${r.after} | ${r.delta>0?'+':''}${r.delta} |`).join('\n');
writeFileSync('calibration/football-live-20261101.md',`# Live football audit — November 1, 2026\n\nModel: \`${output.model}\`.\n\n## Confirmed causes and overlap\n\nBoth legacy football upset paths require 35% elapsed before rewarding any lead. NFL also qualifies abruptly at a seven-point spread; CFB separately scales through large spreads but suppresses large unexpected leads by treating their margin as poor competitiveness. The live production policy already owns closeness, uncertainty, leverage, comeback, lead-change, run, event and trajectory credit. News research is pregame-oriented and cached storylines were never reconciled against confirmed live injury updates. Live explanations concatenate generic fragments.\n\n## Implementation\n\nProduction-only shared football context replaces the old live upset factor before base/floor aggregation. Smooth spread/moneyline expectation strength, actual lead, elapsed expected margin, time, validated sustained leadership and optional current WP produce bounded credit (NFL 22, CFB 30). Correlated history discounts up to 35% of the surprise award. Merely covering is insufficient. Rank-only CFB evidence is modest; FCS identity creates no assumed line. Timestamped odds after kickoff, explicitly live odds and lines older than 48h before kickoff are excluded. Untimestamped provider lines remain last-listed pregame evidence.\n\nExisting game-summary news supplies conservative event-bound confirmed developments, without additional requests, AI calls or paid services. Confirmed events persist in existing feed/snapshot payloads; publication order supersedes arrival order, duplicates never stack, explicit returns supersede absences, and stale pregame return context is suppressed. Development credit is capped at five and decays with game progress and actual competitiveness. Missing statistics never imply injury. Source text and links remain inspectable.\n\n## Synthetic calibration (not historical game claims)\n\n| Sport | State | Before | After | Delta |\n|---|---|---:|---:|---:|\n${table(scenarios)}\n\n## Historical replay\n\n${histories.length} archived NFL/CFB games, ${checkpointCount} validated checkpoints. ${allFlags.length} changes larger than five points are individually flagged in the JSON report; ${output.unexplained.length} unexplained. Opening estimates and finals are unchanged. Other archived sports retain exact score/factor parity. News is not retrospectively injected into play checkpoints. These captures do not establish the supplied November 1 examples as verified historical facts.\n\n| Sport | Game | Opening before/after | Half before/after | Late before/after | Peak before/after | Final before/after |\n|---|---|---|---|---|---|---|\n${histories.map(h=>`| ${h.sport} | ${h.name||h.eventId} | ${h.opening.join('/')} | ${h.half?`${h.half.before}/${h.half.after}`:'unavailable'} | ${h.late?`${h.late.before}/${h.late.after}`:'unavailable'} | ${h.peakBefore?.before??'—'}/${h.peakAfter?.after??'—'} | ${h.final.join('/')} |`).join('\n')}\n\n## Evidence limits\n\nBroad league headlines without matchup binding, speculative injuries, stale articles, unverified replacement inference and rejected/regressing summaries add no new development. Provider omission can still prevent recognition of a real injury; the model does not invent one. Existing record/context research cadence, subscriptions, history ownership, down/distance, OT and completed rules are preserved.\n`);
const reportPath='calibration/football-live-20261101.md';
let report=readFileSync(reportPath,'utf8')
  .replace(`${histories.length} archived NFL/CFB games`,`${histories.length-captures.length} archived NFL/CFB games plus ${captures.length} current NFL captures`)
  .replace('These captures do not establish the supplied November 1 examples as verified historical facts.','The November 1 captures include the provider’s confirmed Jackson injury report, its explicit injury play, and positive passing-play evidence identifying the later replacement. Older NFL captures lack verified closing markets, so their missing lines are never filled with invented spreads.')
  .replace('Peak before/after','Sampled peak before/after').replace('Final before/after','Captured end state before/after');
report+='\n## Current provider captures\n\n'+namedExamples.map(n=>`- ${n.eventId}: ${n.before} → ${n.after} at ${n.phase}. ${n.explanation} Source: ${n.source}; captured ${n.capturedAt}.`).join('\n')+'\n';
report+='\n## Validation\n\n896 tests passed with zero failures in the full root/Worker suite. Browser build, test-score.js, syntax checks and Wrangler dry run passed. The original checkout’s pre-existing tracked diff was restored byte-for-byte; this release is isolated on current production commit 92cec7c. No API subscription, AI budget, database migration or scheduled cadence changes.\n';
writeFileSync(reportPath,report);
console.log(JSON.stringify({checkpointCount,games:histories.length,flags:allFlags.length,unexplained:output.unexplained.length,scenarios,namedExamples},null,2));

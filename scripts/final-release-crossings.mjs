// Offline review ledger. Uses real archived play prefixes without changing fixtures.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {Module} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {replayCheckpoints} from './replay-inputs.mjs';
import * as active from '../alerts-worker/src/live-game-model.js';
import {evaluate} from '../test/helpers/live-underdog-scenarios.mjs';
import calculation from '../scoring/shared/calculation.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=file=>JSON.parse(file.endsWith('.gz')?gunzipSync(fs.readFileSync(path.join(root,file))):fs.readFileSync(path.join(root,file),'utf8'));
const source=read('calibration/output/live-underdog-20261103.json');
const baselineFile='test/fixtures/live-underdog-before.cjs.gz';
const frozen=new Module(path.join(root,baselineFile));
frozen._compile(gunzipSync(fs.readFileSync(path.join(root,baselineFile))).toString(),path.join(root,baselineFile));
const before=frozen.exports;
const verifySource=file=>{
 const actual=createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
 assert.equal(actual,source.provenance.find(p=>p.file===file)?.sha256,`${file}: original source bytes`);
 return actual;
};
verifySource(baselineFile);
const rows=source.historicalFlags.filter(r=>r.crossings.some(c=>c.direction==='up'&&c.threshold>=85));
const downwardRows=source.historicalFlags.filter(r=>r.crossings.some(c=>c.direction==='down'&&c.threshold>=85));
const fixtures=new Map();
function quotes(f){
 const start=Date.parse(f.event.date||'');
 return [...(f.summary?.pickcenter||[]),...(f.summary?.header?.competitions?.[0]?.odds||[])].filter(raw=>{
  const listed=raw.close||raw.closing||raw;
  const type=[raw.type?.name||raw.type,listed.type?.name||listed.type,raw.marketType,raw.description].filter(Boolean).join(' ');
  if(raw.live===true||raw.isLive===true||listed.live===true||listed.isLive===true||/\blive\b|in[ -]?play/i.test(type))return false;
  const stamp=listed.lastUpdated??listed.lastModified??raw.lastUpdated??raw.lastModified,at=Date.parse(stamp||'');
  const closing=Boolean(raw.close||raw.closing||listed.pointSpread?.home?.close?.line!=null&&listed.pointSpread?.away?.close?.line!=null||/\bclosing\b/i.test(type));
  if(stamp!=null&&(!Number.isFinite(at)||!Number.isFinite(start)||at>start||start-at>48*3600000))return false;
  return closing||Number.isFinite(at)&&at<=start;
 });
}
function fixture(r){
 if(!fixtures.has(r.sourceFile)){
  const f=read(r.sourceFile);f.modelSport=r.sport;f.eventId=r.id;
  fixtures.set(r.sourceFile,{f,replay:replayCheckpoints(f),quotes:quotes(f),sha256:verifySource(r.sourceFile)});
 }
 return fixtures.get(r.sourceFile);
}
function evaluateCheckpoint(f,cp,quotes,adapter=active){
 return evaluate(adapter,{sport:f.modelSport,event:{...cp.event,competitions:[cp.competition]},competition:cp.competition,
  summary:quotes.length?{...cp.summary,pickcenter:quotes}:cp.summary});
}
function rankIsolationDiagnostic(f,cp,quotes){
 // This is a controlled factor-isolation diagnostic, NOT a provider observation
 // or a corrected historical rating. No replacement poll rank is invented.
 const c=structuredClone(cp);
 for(const competition of [c.competition,...(c.event.competitions||[]),...(c.summary.header.competitions||[])]){
  for(const team of competition.competitors||[]){delete team.curatedRank;delete team.rank;delete team.team.rank;}
 }
 const g=evaluateCheckpoint(f,c,quotes);
 return {kind:'controlled diagnostic with provider tournament seeds omitted; not historical evidence',score:g.score,openingScore:g.openingScore,
  carry:g.factors.find(f=>f.label==='Pregame context carried into play')?.points||0,
  stakes:g.factors.find(f=>f.label==='Persistent postseason stakes')?.points||0,factors:g.factors,liveBonus:g.live.bonus};
}
function reviewState(r){
 const {f,replay,quotes,sha256}=fixture(r),cp=replay.checkpoints.find(x=>String(x.play.id)===r.playId);
 assert.ok(cp,r.playId);
 const g=evaluateCheckpoint(f,cp,quotes),old=evaluateCheckpoint(f,cp,quotes,before);
 assert.equal(g.score,r.after,r.playId);
 assert.equal(old.score,r.before,`${r.playId}: independently reproduced baseline`);
 assert.equal(g.evidenceQuality,r.afterDetail.evidence,r.playId);
 assert.equal(old.evidenceQuality,r.beforeDetail.evidence,r.playId);
 assert.deepEqual(g.factors,r.afterDetail.factors,`${r.playId}: candidate factor ledger`);
 assert.deepEqual(old.factors,r.beforeDetail.factors,`${r.playId}: baseline factor ledger`);
 const otherFactors=game=>game.factors.filter(f=>f.label!=='Underdog threatens upset');
 assert.deepEqual(otherFactors(g),otherFactors(old),`${r.playId}: unchanged non-upset factors`);
 assert.equal(g.factors.filter(f=>f.liveUpset||f.liveSurprise).length,Number(g.upsetPoints>0),`${r.playId}: at most one nonzero upset owner`);
 assert.equal(g.openingScore,old.openingScore,`${r.playId}: unchanged opening score`);
 assert.equal(g.momentumPoints,old.momentumPoints,`${r.playId}: unchanged history award`);
 assert.equal(g.live.bonus,old.live.bonus,`${r.playId}: unchanged live event/situation bonus`);
 assert.equal(g.score-old.score,r.delta,`${r.playId}: independently reproduced delta`);
 const context=g.liveUpset||g.liveSurprise,market=context.market;
 const probability=g.live?.winProbability;
 const possession=g.liveRawSituation?.possession?.id||g.liveRawSituation?.possession||null;
 const holder=g.teams.find(t=>String(t[8])===String(possession));
 const transient=g.factors.find(f=>f.label==='Pregame context carried into play')?.points||0;
 const stakes=g.factors.find(f=>f.label==='Persistent postseason stakes')?.points||0;
 const tension=g.factors.find(f=>f.label==='Current Tension')?.points||0;
 return {sport:r.sport,id:r.id,playId:r.playId,sourceFile:r.sourceFile,sourceSha256:sha256,
  sourceContext:{date:f.event.date,season:f.event.season,notes:f.event.competitions?.[0]?.notes||[],
   archivedQuotes:quotes.map(q=>({details:q.details,pointSpread:q.pointSpread,quotedAt:q.lastUpdated??q.lastModified??null}))},
  period:r.period,clock:r.clock,scores:r.scores,
  threshold:r.crossings.find(c=>c.threshold>=85).threshold,direction:r.delta>0?'up':'down',before:r.before,after:r.after,
  upsetBefore:r.upsetBefore,upsetAfter:r.upsetAfter,market:context.market,upsetContext:context,
  underdogWinProbability:context.currentProbability??(probability==null?null:market.side==='home'?probability:1-probability),
  possessionTeam:holder?.[0]||'unknown',possessionId:holder?String(holder[8]):null,
  situation:g.liveRawSituation,footballSituation:g.footballSituation||null,
  evidenceQuality:g.evidenceQuality,scoringPartial:g.scoringPartial,evidenceReasons:g.evidenceReasons,evidenceCoverage:g.evidenceCoverage,
  excludedHistory:r.excludedHistory,missingSituationFields:r.missingSituationFields,
  sourcePlay:{text:cp.play.text,scoringPlay:cp.play.scoringPlay,team:cp.play.team},
  openingScore:g.openingScore,openingFactors:g.openingFactors,transientContext:transient,persistentStakes:stakes,currentTension:tension,
  momentum:g.momentumPoints,overlap:context.overlap,factors:g.factors,live:g.live,calculation:calculation.get(g),
  factorChanges:r.afterDetail.factors.filter(f=>JSON.stringify(f)!==JSON.stringify(r.beforeDetail.factors.find(x=>x.label===f.label))),
  ...(r.id==='401856574'?{rankIsolationDiagnostic:rankIsolationDiagnostic(f,cp,quotes)}:{}),
  verdict:g.scoringPartial?'Defensible change; partial observation is alert-ineligible':'Defensible change; numerical/evidence gates only, not proof of notification eligibility'};
}
const ledger=rows.map(reviewState),downwardLedger=downwardRows.map(reviewState);
assert.equal(ledger.length,32);
assert.ok(ledger.every(r=>[1,2].includes(r.after-r.before)));
assert.equal(ledger.filter(r=>r.threshold===85).length,17);
assert.equal(ledger.filter(r=>r.threshold===90).length,15);
assert.equal(downwardLedger.length,52);
assert.equal(downwardLedger.filter(r=>r.threshold===85).length,29);
assert.equal(downwardLedger.filter(r=>r.threshold===90).length,23);
const iowa=source.replayRows.filter(r=>r.id==='401856574');
const firstIowa=[85,90].map(threshold=>{
 const r=iowa.find(r=>r.after>=threshold),{f,replay,quotes}=fixture(r),cp=replay.checkpoints.find(x=>String(x.play.id)===r.playId),g=evaluateCheckpoint(f,cp,quotes);
 return {threshold,playId:r.playId,period:r.period,clock:r.clock,scores:r.scores,before:r.before,after:r.after,openingScore:g.openingScore,openingFactors:g.openingFactors,factors:g.factors,live:g.live,calculation:calculation.get(g),historyOwnership:g.historyOwnership,
  rankIsolationDiagnostic:rankIsolationDiagnostic(f,cp,quotes)};
});
const output={commit:'712f221',baseline:source.baselineCommit,kind:'archived causal reconstructions; not original live snapshots or delivered alerts',
 counts:{states:ledger.length,games:new Set(ledger.map(r=>r.id)).size,new85:17,new90:15,partial:ledger.filter(r=>r.scoringPartial).length,
  downwardStates:downwardLedger.length,downwardGames:new Set(downwardLedger.map(r=>r.id)).size,below85:29,below90:23},firstIowa,ledger,downwardLedger};
fs.writeFileSync(path.join(root,'calibration/output/final-release-crossings-20261103.json'),JSON.stringify(output,null,2)+'\n');
const gameNames={'401856722':'Kentucky–Oklahoma','401856724':'Florida–Texas','401856574':'Iowa–Illinois','401856575':'Purdue–Arizona','401873003':'Titans–Colts','401856847':'Oklahoma St.–Iowa St.','401920982':'Notre Dame–Villanova'};
const shortTeam=name=>({'Kentucky Wildcats':'Kentucky','Oklahoma Sooners':'Oklahoma','Florida Gators':'Florida','Texas Longhorns':'Texas','Iowa Hawkeyes':'Iowa','Illinois Fighting Illini':'Illinois','Purdue Boilermakers':'Purdue','Arizona Wildcats':'Arizona','Indianapolis Colts':'Colts','Iowa State Cyclones':'Iowa St.'}[name]||name);
const cells=r=>`| ${gameNames[r.id]} | ${r.playId} | ${r.sport==='NCAAB'?'H':'Q'}${r.period} ${r.clock} | ${r.scores.map(s=>s.score).join('–')} | ${r.before}→${r.after} | ${r.upsetBefore}→${r.upsetAfter} | ${(100*r.underdogWinProbability).toFixed(2)}% | ${shortTeam(r.possessionTeam)} | ${r.evidenceQuality} |`;
const table=threshold=>`| Game (away–home) | Source play | Phase / clock | Score | Rating | Upset | Dog WP | Accepted possession | Evidence |\n|---|---|---|---|---|---|---|---|---|\n${ledger.filter(r=>r.threshold===threshold).map(cells).join('\n')}`;
const markdown=`# Final release crossing audit — 712f221\n\n**PASS for the rating changes examined. No implausible new 85/90 crossing or duplicated upset award found; no recalibration recommended.** This conclusion concerns rating plausibility. Notification readiness and the overall release decision are separate gates.\n\nRecomputed every upward 85/90 row through the actual Worker facade from its archived causal play prefix; all 32 ratings and evidence classifications reproduce the committed ledger. The only changed factor in these states is the single upset award, +1 or +2. Source observations, stored ratings and thresholds are unchanged. Reproduce with \`node scripts/final-release-crossings.mjs\`. The [complete ledger](output/final-release-crossings-20261103.json) includes source path/play, exact situation, current WP, closing market, all factors, live bonus and exact rounding ledger.\n\n| Boundary | Replay states | Unique games | Complete scoring evidence | Partial / alert-ineligible |\n|---|---:|---:|---:|---:|\n| Newly 85+ | 17 | 5 | 10 states / 3 games | 7 states / 2 games |\n| Newly 90+ | 15 | 3 | 13 states / 1 game | 2 states / 2 games |\n| Combined | 32 | 6 | 23 states / 3 games | 9 states / 3 games |\n\nThese are cross-model rating comparisons, **not 32 chronological threshold crossings or delivered notifications**. Complete here means a consistent score-progression ledger, not proof of a complete event stream: unresolved earlier archived events and unknown possession remain explicitly disclosed. Each row uses available play-linked WP; no missing WP or possession was fabricated. Closing quotes are genuine archived pregame expectations, but the archive does not prove the app had each quote at that instant. Actual eligibility additionally needs a fresh live publication, current model, valid baseline/crossing, subscription preferences, and no previous notification for that subscriber/game.\n\n## Every new 85 crossing\n\n${table(85)}\n\n## Every new 90 crossing\n\n${table(90)}\n\n## Game-by-game judgment and factor ownership\n\n- **Iowa–Illinois (401856574), Iowa +6.5, verified South Region Elite Eight.** Three new 85 states and thirteen new 90 states, all in the second half, tied or Iowa behind by 1–2. Accepted Iowa WP is 28.4–38.5%; possession is unknown for most rows, Iowa at 14:34, Illinois at 14:03. With 7:27–18:36 remaining, all have abundant comeback runway. The change contributes only 1–2 upset points after a 0.377–0.643 history-overlap discount. Existing Current Tension 26–31, persistent stakes 20, transient opening carry 5–12.552, historical recovery/lead changes/WP swings, and immediate event bonuses 0–3 explain the high totals. All remain defensible.\n- **Purdue–Arizona (401856575), Purdue +5.5, verified West Region Elite Eight.** Four new 85 states at H2 14:34–14:01, 43–43 or 43–44; Purdue WP 37.9–38.9%. Possession unknown in three states and Purdue in the last. Upset 0→1 after a roughly 0.20 discount, Current Tension 30–31, persistent stakes 20, carry about 10, and retained WP/competitive-history scoring explain 85. No decisive-possession bonus or excessive underdog credit.\n- **Kentucky–Oklahoma (401856722), Kentucky +7.** Five new 85 and one new 90, Kentucky ahead 14–13 in Q4, WP 49.58–67.75%. Oklahoma has 2nd-and-13 at its 22 at 12:46; Kentucky later has 1st-and-10 at OU31, 2nd-and-8 at OU29, and 4th-and-3 at OU5. Accepted possession is unknown at 5:23 (the display adapter has a Kentucky label); do not treat the display label as scoring possession evidence. Upset 3→4 is the intended same-clock tie-threat floor. Current Tension 41–48, lead-change/WP history 15, generic leverage 5–7 and occasional situation/event credit 0–2 drive the totals. All six have partial evidence and cannot justify an alert. The +1 correction is plausible, but historical absolute-rating confidence is limited.\n- **Florida–Texas (401856724), Florida +13.5.** Three new 85 states: 20–17 at 6:55, 27–24 at 4:21/4:15 Q4. Florida WP 71.72–80.70%. Confirmed Florida possession at Texas11 at 6:55; later accepted possession is unknown around a score/transition. The underdog is actually leading, not merely covering. Upset 10→11/12 is consistent with the tie-floor repair. Current Tension 37–38, comeback/late-lead-change history, generic leverage 6 and carry 4 remain unchanged. No impossible comeback or late possession overclaim.\n- **Oklahoma State–Iowa State (401856847), Iowa State +10.** Two new 85 states, Iowa State ahead 45–42 at Q4 8:00 and 6:42; WP 64.80/65.15%. Accepted possession unknown at 8:00; Iowa State 2nd-and-17 at ISU29 at 6:42. Upset 8→9/10 with 1.32/1.10 correlated-history discounts; Current Tension 42, leverage 6/7, carry 4/3, WP-history 6/5 and trajectory about 6.4 explain the total. Both are partial and alert-ineligible. The rating change is defensible with limited historical certainty.\n- **Titans–Colts (401873003), Tennessee +6.5.** One new 90: Tennessee ahead 23–20 with 1:49 Q4; Tennessee WP 75.23%. Colts possession, 3rd-and-10 at IND38, retains a credible tying/winning drive. The existing NFL competitive-situation bonus is 24 (ordinary situation 8 with a 16-point floor); Current Tension 26, history 15, leverage 6 and carry 3 are unchanged. Upset 3→4 after a 2.093 overlap discount is plausible. This observation is partial and alert-ineligible.\n\n## Why Iowa reached 85–90 early\n\nThe archived competition note explicitly says “NCAA Men's Basketball Championship - South Region - Elite 8” and season type is 3. The opening score is 80: sport baseline 32, scarcity 3, the existing tournament-stage factor 30 (internally labeled “Final round”), projected spread 2 and existing ranked-matchup factors 13. The 85+ state at H1 19:26 is **87→87**, with the opening basis retained and an existing +7 turnover event impact. It is not created by this calibration.\n\nIowa led 12–2 at H1 15:56. Illinois subsequently erased that ten-point deficit. At the first 90+ state, H2 18:36 and 32–32, the old model already scored 90; the candidate scores 91. The exact candidate calculation is baseline 12 + transient context 12.552 + persistent postseason 20 + Current Tension 30 + upset 1, rounded to 76, then recovery 6 + WP swing 4 + retained trajectory 4.758, rounded to 91. Another play at the same 18:36 clock changes 89→90 because its current WP/tension and trajectory differ. These are distinct source observations, not invented clock advancement.\n\nThere is no new duplicated ownership: persistent postseason points are subtracted from the transient opening basis before carry; trajectory replaces sustained-history points within the existing shared history cap; current WP contributes to Current Tension but earns **zero** separate live probability bonus; the new upset WP term is only a downward feasibility gate. The comeback award describes **Illinois's recovery**, while upset context describes **Iowa's continuing chance against the pregame line**. Those facts are correlated, so the new formula subtracts 25% of its raw award here. An aggressive but established Elite Eight watchability rating is not evidence of a defective new upset factor.\n`;
const revisedMarkdown=markdown.replace('**PASS for the rating changes examined. No implausible new 85/90 crossing or duplicated upset award found; no recalibration recommended.**',
 '**PASS for the narrowly changed upset factors. No implausible new upset award or duplicate ownership found; no underdog recalibration recommended.** The absolute early Iowa ratings include the inherited seed-versus-poll issue quantified below.')
 .replace('All remain defensible.','The new upset deltas remain defensible; the inherited seed-based carry caveat below applies to these absolute totals.')+
 '\n## Exact tournament-factor provenance\n\nThe inherited +30 “Final round” label is selected by the broad `/conference final|league final|finals|championship|title game/` branch in `rating-core.js::pregameRating`: the provider note contains the word “Championship”. It is **not an Elite-Eight-specific numerical calibration**, although the same note independently verifies the Elite Eight stage. `eventSignalText` reads names, competition notes, series metadata and season context; it does not read the event\'s final status. No context override exists for game 401856574. Thus there is no completed-status or recap leakage into this factor. Its mature retained value is round(30 × 0.68) = 20, with the original 30 removed from transient opening carry before persistence is added. The broad stage label is another inherited semantic limitation, not duplicate postseason credit.\n'+
 '\n## Inherited Iowa seed-versus-poll caveat\n\nThe archived provider numbers 3 (Illinois) and 9 (Iowa) are tournament seeds: the archived recap explicitly identifies the third-seeded Illini and ninth-seeded Hawkeyes. Existing `rankFor`/`collegePregame` code uses those numbers for “Two ranked teams”, “Both top 10” and “Top 10 team”, adding 13 opening points. The archive therefore does **not** independently establish both teams as top-ten poll teams. This pre-existing semantic defect contributes to the early score; it is separate from the verified Elite Eight stakes and is not caused by 712f221.\n\nA clearly labeled controlled factor-isolation diagnostic omits these seed fields, without substituting invented poll rankings or changing any archive. Opening score becomes 67 instead of 80. At H1 19:26 the retained contribution is 12.9878 points (87 versus diagnostic 74); at the first H2 18:36 tie it is 5.552 carried points (91 versus diagnostic 85). At the newly crossing 18:36 observation the same isolation changes 90 to diagnostic 84. Across the sixteen newly crossing Iowa states, the retained seed-derived contribution declines from 5.552 to 1 point. The three new 85 states at 14:02/12:13/9:55 carry 3.7826/3.0201/2.2512 points of it (85 versus diagnostic 81/82/83). Persistent Elite Eight stakes remain exactly 20 in every second-half comparison. These diagnostic totals are **not historical observations, corrected historical ratings, or a proposed calibration**.\n\nThis identifies a real inherited evidence-label problem, not duplicated postseason stakes or an excessive new 1–2-point underdog award. It is recorded for separate metadata work; changing it in this release would alter prior opening calibration that this task explicitly preserves.\n';
const downwardTable=threshold=>`| Game (away–home) | Source play | Phase / clock | Score | Rating | Upset | Dog WP | Accepted possession | Evidence |\n|---|---|---|---|---|---|---|---|---|\n${downwardLedger.filter(r=>r.threshold===threshold).map(cells).join('\n')}`;
const completedMarkdown=revisedMarkdown.replace('all 32 ratings and evidence classifications reproduce the committed ledger.',
 'all 32 upward ratings and evidence classifications reproduce the committed ledger. Independently recomputed all 52 downward 85/90 crossings as well. Both engines reproduce the exact factor ledgers, while original fixture SHA-256 hashes, non-upset factors, opening scores, history awards and live event/situation bonuses remain unchanged.')+
 `\n## Downward threshold crossings\n\nAll **52 downward states across three NCAAM games** are also reviewed: 29 fall below 85 and 23 below 90. Iowa–Illinois contributes 46, Purdue–Arizona two, and Notre Dame–Villanova four. The revised continuous upset award alone accounts for every decrease (1–3 points in the Elite Eight games, five in Notre Dame–Villanova); no lost stakes, Current Tension, history, possession or other factor explains these changes. The small Elite Eight underdog spreads receive less bonus while leading or tied than the old gated formula gave; Notre Dame's +7.5 award falls 9→4 after the history-overlap discount. These are justified reductions rather than a reason to restore the old time gates. Full period/clock, score, WP, possession and evidence are listed below and retained in the JSON ledger. No reduction is a delivered notification or a reason to rewrite stored ratings.\n\n### Newly below 85\n\n${downwardTable(85)}\n\n### Newly below 90\n\n${downwardTable(90)}\n`;
fs.writeFileSync(path.join(root,'calibration/final-release-crossings-20261103.md'),completedMarkdown);
console.log(JSON.stringify(output.counts));
for(const r of ledger)console.log(JSON.stringify({id:r.id,play:r.playId,clock:r.clock,rating:r.before+'>'+r.after,possession:r.possessionTeam,situation:r.footballSituation,evidence:r.evidenceQuality,partial:r.scoringPartial}));
console.log(JSON.stringify(firstIowa));

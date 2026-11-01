import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import * as active from '../alerts-worker/src/live-game-model.js';import runtime from '../scoring/live-runtime.cjs';
import {frame,evaluate,captured,recorded} from './helpers/basketball-audit.mjs';
const copy=x=>structuredClone(x);
test('captured Notre Dame timeline corroborates the reported reversals',()=>{
 const rows=recorded.filter(p=>p.period===2&&p.scoreA==='70'&&p.scoreB==='68');
 assert.ok(rows.some(p=>p.clock==='0:47'&&p.rating===70));assert.ok(rows.some(p=>p.clock==='0:48'&&p.rating===58));
 assert.deepEqual([...new Set(rows.filter(p=>p.clock==='0:24').map(p=>p.rating))],[57,67]);
});
test('missing, shortened, duplicated and reordered optional arrays preserve the same verified basketball state',()=>{
 const f=frame(),g=evaluate(active,f);
 for(const summary of [null,{header:copy(f.summary.header)}, {...copy(f.summary),plays:[],winprobability:[]},
  {...copy(f.summary),plays:f.summary.plays.slice(-2),winprobability:[]},
  {...copy(f.summary),plays:[...f.summary.plays,...f.summary.plays].reverse(),winprobability:[...f.summary.winprobability,...f.summary.winprobability].reverse()}]){
  const next=evaluate(active,f,summary,g);assert.equal(next.score,g.score);assert.equal(next.momentumPoints,g.momentumPoints);
  assert.deepEqual(next.basketballFacts,g.basketballFacts);assert.equal(next.basketballEvidence.plays.length,g.basketballEvidence.plays.length);
 }
 // The captured scoreboard briefly reported 11; the later complete play ledger
 // and both provider team-stat blocks agree that the corrected maximum was 10.
 assert.equal(g.basketballFacts.comeback.team,'Notre Dame Fighting Irish');assert.equal(g.basketballFacts.comeback.deficit,10);assert.ok(g.basketballFacts.lateLeadChanges>=1);
});
test('probability omissions and invalid values cannot erase verified probability history',()=>{
 const f=frame(),g=evaluate(active,f),partial=copy(f.summary);delete partial.winprobability;
 const missing=evaluate(active,f,partial,g);assert.equal(missing.score,g.score);assert.deepEqual(missing.basketballEvidence.probabilities,g.basketballEvidence.probabilities);
 partial.winprobability=[{playId:f.summary.plays.at(-1).id}];assert.equal(evaluate(active,f,partial,g).score,g.score);
});
test('scoreboard play IDs and detail sequence numbers identify the same event',()=>{
 const f=frame(),full=evaluate(active,f);delete f.event.competitions[0].situation.lastPlay.sequenceNumber;
 const sparse=evaluate(active,f);assert.equal(sparse.live.probabilityTelemetry.probability,full.live.probabilityTelemetry.probability);assert.equal(sparse.score,full.score);
});
test('optional play metadata is not a new possession or scoring event',()=>{
 const f=frame(),g=evaluate(active,f),same=copy(f);
 same.event.competitions[0].situation.lastPlay.probability={homeWinPercentage:.309};
 const next=evaluate(active,same,null,g);assert.equal(next.score,g.score);assert.equal(next.live.probabilityTelemetry.probability,g.live.probabilityTelemetry.probability);
});
test('47 to 48 second clock correction retains comeback and lead-change evidence',()=>{
 const first=evaluate(active,frame('0:47')),next=evaluate(active,frame('0:48'),null,first);
 assert.equal(next.liveRawStatus.displayClock,'0:48');assert.equal(next.score,first.score);assert.deepEqual(next.basketballFacts,first.basketballFacts);
});
test('a larger legitimate clock correction requires a newer event',()=>{
 const f=frame('0:24'),g=evaluate(active,f),correction=copy(f);
 correction.event.competitions[0].status.displayClock='0:30';
 correction.event.competitions[0].situation.lastPlay={id:'999999999999999999',text:'Official clock correction',type:{text:'Timeout'}};
 correction.summary.header.competitions[0]=copy(correction.event.competitions[0]);
 const next=evaluate(active,correction,correction.summary,g);assert.equal(next.liveRawStatus.displayClock,'0:30');assert.deepEqual(next.basketballFacts,g.basketballFacts);
});
test('delayed earlier event cannot roll back score, clock or history',()=>{
 const f=frame('0:24'),g=evaluate(active,f),old=frame('1:00',68,68),next=evaluate(active,old,old.summary,g);
 assert.equal(next.basketballUpdateRejected,true);assert.deepEqual(next.teams.map(t=>t[2]),g.teams.map(t=>t[2]));
 assert.equal(next.liveRawStatus.displayClock,g.liveRawStatus.displayClock);assert.deepEqual(next.basketballFacts,g.basketballFacts);
});
test('future detail plays and a lagging header cannot erase the verified prefix',()=>{
 const f=frame(),g=evaluate(active,f),ahead=copy(captured);
 const next=evaluate(active,f,ahead,g);assert.equal(next.score,g.score);assert.deepEqual(next.basketballFacts,g.basketballFacts);
 const stale=copy(f.summary);stale.header.competitions[0].competitors.find(t=>t.homeAway==='away').score='67';
 assert.equal(evaluate(active,f,stale,g).score,g.score);
});
test('established historical facts survive long delays and subsequent scoreboard advances',()=>{
 const f=frame(),g=evaluate(active,f),aged=copy(g);aged.basketballEvidence.observedAt=0;
 assert.deepEqual(evaluate(active,f,null,aged).basketballFacts,g.basketballFacts);
 const advanced=frame('0:16',72,70),next=evaluate(active,advanced,null,g);
 assert.deepEqual(next.basketballFacts.comeback,g.basketballFacts.comeback);assert.notEqual(next.score,g.score);
});
test('possession changes at an unchanged score and clock remain meaningful',()=>{
 const f=frame('0:12'),c=f.event.competitions[0];c.situation.possession='222';f.summary.header.competitions[0]=copy(c);
 const trailing=evaluate(active,f),lead=copy(f);lead.event.competitions[0].situation.possession='87';lead.summary.header.competitions[0]=copy(lead.event.competitions[0]);
 const leading=evaluate(active,lead,lead.summary,trailing);
 assert.notEqual(leading.score,trailing.score);assert.equal(leading.liveRawSituation.possession,'87');
 assert.deepEqual(leading.basketballFacts,trailing.basketballFacts);
});
test('provider competitor possession flags drive the same legitimate possession change',()=>{
 const f=frame('0:12'),c=f.event.competitions[0];c.competitors.forEach(t=>t.possession=t.team.id==='222');
 f.summary.header.competitions[0]=copy(c);const first=evaluate(active,f);
 assert.equal(first.liveRawSituation.possession,'222');
 const changed=copy(f);changed.event.competitions[0].competitors.forEach(t=>t.possession=t.team.id==='87');
 changed.summary.header.competitions[0]=copy(changed.event.competitions[0]);
 const next=evaluate(active,changed,changed.summary,first);assert.equal(next.liveRawSituation.possession,'87');assert.notEqual(next.score,first.score);
});
test('a new foul invalidates a probability tied to the previous observation',()=>{
 const f=frame(),g=evaluate(active,f),foul=copy(f);foul.event.competitions[0].situation.lastPlay={id:'999999999999999999',text:'Foul on Villanova',type:{text:'Foul'}};
 const next=evaluate(active,foul,null,g);assert.equal(next.live.probabilityTelemetry.probability,null);assert.deepEqual(next.basketballFacts,g.basketballFacts);
});
test('a missing player block preserves a verified scoring milestone; an explicit correction replaces it',()=>{
 const f=frame();f.summary.boxscore={players:[{statistics:[{labels:['PTS'],athletes:[{athlete:{id:'player',displayName:'Verified Player'},stats:['35']}]}]}]};
 const g=evaluate(active,f),missing=copy(f.summary);delete missing.boxscore;
 const next=evaluate(active,f,missing,g);assert.equal(next.live.components.milestone,g.live.components.milestone);assert.ok(next.live.components.milestone>0);
 const corrected=copy(f.summary);corrected.boxscore.players[0].statistics[0].athletes[0].stats=['25'];
 assert.equal(evaluate(active,f,corrected,g).live.components.milestone,0);
});
test('corroborated score and event corrections replace the affected evidence',()=>{
 const f=frame(),g=evaluate(active,f),corrected=frame('0:48',69,68);
 const next=evaluate(active,corrected,corrected.summary,g);assert.equal(next.teams[0][2],'69');
 assert.ok(next.basketballEvidence.plays.every(p=>p.awayScore<=69));
 const revision=copy(f.summary),last=revision.plays.findLast(p=>p.scoringPlay);last.text='Corrected scoring description';
 assert.equal(evaluate(active,f,revision,g).basketballEvidence.plays.find(p=>p.id===last.id).text,'Corrected scoring description');
});
test('Game Center header, period totals and box score use the canonical score without fabricating player stats',()=>{
 const g=evaluate(active,frame()),s={header:copy(frame().summary.header),basketballBoxScore:{teams:[{teamId:'87',totals:{points:'67'},periods:[{value:'67'}],players:[{name:'Player',stats:{points:'20'}}]}]}};
 s.header.competitions[0].competitors.find(t=>t.team.id==='87').score='67';
 const detail=runtime.canonicalDetailSummary(g,s);
 assert.equal(detail.header.competitions[0].competitors.find(t=>t.team.id==='87').score,'70');assert.equal(detail.basketballBoxScore.teams[0].totals.points,'70');
 assert.deepEqual(detail.basketballBoxScore.teams[0].periods,[]);assert.equal(detail.basketballBoxScore.teams[0].players[0].stats.points,'20');assert.equal(detail.sportsRadarFreshness.statsPending,true);assert.equal(s.basketballBoxScore.teams[0].totals.points,'67');
});
test('browser bundle and Worker scorer agree on accepted, missing and corrected states',()=>{
 const browser=vm.runInNewContext(fs.readFileSync('dist/scoring-runtime.js','utf8')+';SportsRadarScore');
 const f=frame(),g=evaluate(active,f),b=active.normalizeEvent(copy(f.event),'NCAAB');browser.applyLiveSnapshot(b,b.sourceCompetition,copy(f.summary));
 assert.equal(b.score,g.score);assert.deepEqual(JSON.parse(JSON.stringify(b.factors)),g.factors);
 browser.applyLiveSnapshot(b,b.sourceCompetition,null);assert.equal(b.score,g.score);
});

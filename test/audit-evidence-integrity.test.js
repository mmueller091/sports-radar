import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
const root=process.env.AUDIT_BASELINE_ROOT;
const source=relative=>root?pathToFileURL(path.join(root,relative)).href:new URL(`../${relative}`,import.meta.url).href;
const active=await import(source('alerts-worker/src/live-game-model.js'));
const {default:runtime}=await import(source('scoring/live-runtime.cjs'));
const {snapshotEvidence,shouldSnapshot}=await import(source('alerts-worker/src/snapshot-history.js'));
const {default:eventScoring}=await import(source('scoring/shared/events.js'));

const copy=x=>structuredClone(x);
const play=(id,clock,text,home=7,away=7,scoringPlay=false,period=2)=>({id,period:{number:period},clock:{displayValue:clock},homeScore:home,awayScore:away,text,scoringPlay});
function input(sport='NFL',clock='5:00',home=7,away=7,period=2){
 const c={status:{period,displayClock:clock,type:{state:'in',completed:false}},competitors:[
  {homeAway:'home',score:String(home),team:{id:'h',displayName:'Home',abbreviation:'H'}},
  {homeAway:'away',score:String(away),team:{id:'a',displayName:'Away',abbreviation:'A'}}],situation:{}};
 return {sport,event:{id:'12345',name:'Away at Home',season:{year:2026,type:2},competitions:[c]},summary:{header:{season:{year:2026,type:2},competitions:[copy(c)]},plays:[]}};
}
function run(i,previous=null){const g=active.normalizeEvent(copy(i.event),i.sport);active.enrichGame(g,copy(i.summary),previous&&copy(previous));return g;}
const captured=JSON.parse(fs.readFileSync(new URL('./fixtures/audit-evidence-20261101/nfl-correction.json',import.meta.url))).observations;

test('F1: captured same-ID timeout/spot revision updates state; replayed superseded state cannot undo it',()=>{
 const at=index=>({sport:'NFL',event:captured[index].event,summary:null});
 const first=run(at(0)),revised=run(at(1),first);
 assert.equal(revised.liveUpdateRejected,false);
 assert.equal(revised.liveRawStatus.displayClock,'1:38');
 assert.equal(revised.liveRawSituation.down,4);assert.equal(revised.liveRawSituation.yardLine,19);
 assert.equal(revised.footballSituation.downAndDistance,'4th & 1');assert.equal(revised.footballSituation.fieldPosition,'WSH 19');
 const timeout=run(at(2),revised);assert.equal(timeout.liveRawSituation.awayTimeouts,2);
 const stale=run(at(0),timeout);assert.equal(stale.liveUpdateRejected,true);assert.equal(stale.liveRawStatus.displayClock,'1:38');
 assert.equal(shouldSnapshot(stale,{},Date.now(),runtime.MODEL_VERSION),false);
 const punt=run(at(3),timeout);assert.equal(punt.liveUpdateRejected,false);assert.equal(punt.liveRawStatus.displayClock,'1:32');assert.equal(punt.liveRawSituation.possession,'21');
});

test('F1: clock-only rollback and older IDs remain rejected; matching summary corroborates a same-ID revision',()=>{
 const a=input();a.event.competitions[0].situation.lastPlay={id:'12345100',text:'Pass complete'};a.summary.header.competitions=[copy(a.event.competitions[0])];
 const first=run(a),old=copy(a);old.event.competitions[0].status.displayClock='5:30';old.summary=null;
 assert.equal(run(old,first).liveUpdateRejected,true);
 const revised=copy(old);revised.event.competitions[0].situation.lastPlay.text='Pass ruled incomplete after review';revised.event.competitions[0].situation.down=3;
 revised.summary={header:{competitions:[copy(revised.event.competitions[0])]}};
 const accepted=run(revised,first);assert.equal(accepted.liveUpdateRejected,false);assert.equal(accepted.liveRawStatus.displayClock,'5:30');
});

function hockeyLedger(complete){
 const i=input('NHL','0:41',3,3,2);
 const scores=[[1,0],[2,0],[3,0],[3,1],[3,2],...(complete?[[3,3]]:[])];
 i.summary.scoringPlays=scores.map(([h,a],n)=>({...play('goal-'+n,`${String(2+n*3).padStart(2,'0')}:00`,'Goal',h,a,true,2),sequenceNumber:String(n+1),team:{id:n<3?'h':'a'}}));
 // ESPN NHL play clocks in this ledger count up. The tying goal precedes the canonical 0:41 remaining.
 if(complete)i.summary.scoringPlays.at(-1).clock.displayValue='19:17';
 i.summary.plays=copy(i.summary.scoringPlays);return i;
}
test('F2: delayed tying goal preserves earned +8 while incomplete observation stays partial',()=>{
 const first=run(hockeyLedger(false)),complete=run(hockeyLedger(true),first),repeat=run(hockeyLedger(true),complete);
 assert.equal(first.scoringPartial,true);assert.equal(first.evidenceQuality,'partial');assert.ok(first.evidenceReasons.includes('ledger-behind-scoreboard'));
 assert.equal(complete.score-first.score,8);assert.equal(complete.scoringPartial,false);assert.equal(complete.evidenceQuality,'complete');
 assert.equal(repeat.score,complete.score);assert.equal(first.evidenceQuality,'partial');
 assert.equal(snapshotEvidence(first,'live').evidenceQuality,'partial');
 assert.equal(snapshotEvidence(complete,'live').evidenceQuality,'verified');
});
test('F2: invalid, missing and truncated ledgers never become complete evidence',()=>{
 const missing=run(input());assert.equal(missing.evidenceQuality,'partial');
 const bad=hockeyLedger(true);bad.summary.scoringPlays[1].homeScore=999;bad.summary.plays=copy(bad.summary.scoringPlays);
 const invalid=run(bad);assert.equal(invalid.evidenceQuality,'invalid');assert.equal(snapshotEvidence(invalid,'live').evidenceQuality,'invalid');
 const truncated=hockeyLedger(true);truncated.summary.scoringPlays=truncated.summary.scoringPlays.slice(-1);truncated.summary.plays=copy(truncated.summary.scoringPlays);
 assert.equal(run(truncated).scoringPartial,true);
});

test('F4: duplicate interception is idempotent across array copies and repeated polling',()=>{
 const i=input();i.summary.plays=[play('turnover','5:00','Pass intercepted at the 50')];const one=run(i);
 for(const count of [2,3]){const duplicated=copy(i);duplicated.summary.plays=Array.from({length:count},()=>copy(i.summary.plays[0]));const g=run(duplicated,one);assert.equal(g.score,one.score);assert.deepEqual(g.live.components,one.live.components);}
 const distinct=copy(i);distinct.summary.plays.push(play('second-turnover','5:00','Pass intercepted at the 50'));assert.ok(run(distinct).live.components.eventShock>one.live.components.eventShock);
});
test('F4: ordering and revision timestamps produce one deterministic canonical event ledger',()=>{
 const i=input();i.summary.scoringPlays=[play('one','12:00','Home touchdown',7,0,true),play('two','6:00','Away touchdown',7,7,true)];i.summary.plays=copy(i.summary.scoringPlays);
 const first=run(i),reverse=copy(i);reverse.summary.plays.reverse();reverse.summary.scoringPlays.reverse();assert.equal(run(reverse).score,first.score);
 const old={...play('review','5:00','Pass intercepted'),lastModified:'2026-11-02T02:00:00Z'};
 const corrected={...old,text:'Pass incomplete after review',lastModified:'2026-11-02T02:00:05Z'};
 const clean=copy(i);clean.summary.plays.push(corrected);const baseline=run(clean);
 for(const records of [[old,corrected],[corrected,old]]){const changed=copy(i);changed.summary.plays.push(...records);assert.equal(run(changed).score,baseline.score);}
});

for(const period of [4,5])test(`F5: summary-only future play/WP cannot alter canonical period ${period} checkpoint`,()=>{
 const i=input('NFL','1:00',14,14,period);i.summary.plays=[play('current','1:00','Pass complete',14,14,false,period)];i.summary.winprobability=[{playId:'current',homeWinPercentage:.5}];
 const first=run(i),future=copy(i);future.summary.header.competitions[0].status.displayClock='0:50';future.summary.plays.push(play('future','0:50','Pass complete',14,14,false,period));future.summary.winprobability.push({playId:'future',homeWinPercentage:.99});
 const next=run(future);assert.equal(next.liveRawStatus.displayClock,'1:00');assert.equal(next.score,first.score);assert.equal(next.live.winProbability,first.live.winProbability);assert.equal(next.trajectoryScoring.trajectoryEndPosition,first.trajectoryScoring.trajectoryEndPosition);
 assert.ok(next.inputEvidence.futureEventsExcluded>0);
});
test('F5: same-clock future event identity and ahead aggregate statistics are excluded',()=>{
 const i=input('NFL','1:00',14,14,4);const c=i.event.competitions[0];c.situation.lastPlay=play('12345100','1:00','Pass complete',14,14,false,4);i.summary.header.competitions=[copy(c)];i.summary.plays=[copy(c.situation.lastPlay)];i.summary.winprobability=[{playId:'12345100',homeWinPercentage:.5}];
 const first=run(i),future=copy(i);future.summary.plays.push(play('12345101','1:00','Pass intercepted',14,14,false,4));future.summary.winprobability.push({playId:'12345101',homeWinPercentage:.99});
 assert.equal(run(future).score,first.score);
 const older=copy(i);older.summary.header.competitions[0].status.displayClock='1:10';assert.equal(run(older).lastSummaryAccepted,false);
});
test('NHL chronology: genuinely older scoreboard cannot roll canonical state backward',()=>{
 const a=input('NHL','4:00',2,1,2),b=input('NHL','5:00',2,1,2);const next=run(b,run(a));assert.equal(next.liveRawStatus.displayClock,'4:00');assert.equal(next.liveUpdateRejected,true);
});

test('F1: ESPN modified revisions take precedence over misleading clock direction',()=>{
 const first=input();first.event.competitions[0].situation.lastPlay={id:'12345100',text:'Original event',modified:'2026-11-02T02:00:00Z'};first.summary=null;
 const changed=copy(first);changed.event.competitions[0].status.displayClock='5:30';changed.event.competitions[0].situation.lastPlay={id:'12345100',text:'Corrected event',modified:'2026-11-02T02:00:05Z'};
 const accepted=run(changed,run(first));assert.equal(accepted.liveUpdateRejected,false);assert.equal(accepted.liveRawStatus.displayClock,'5:30');
 const stale=copy(first);stale.event.competitions[0].status.displayClock='4:59';assert.equal(run(stale,accepted).liveUpdateRejected,true);
});
test('F4: modified revision is shared across containers, factual conflict is quarantined consistently',()=>{
 const i=input(),old={...play('review','5:00','Pass intercepted'),modified:'2026-11-02T02:00:00Z'},corrected={...old,text:'Pass incomplete after review',modified:'2026-11-02T02:00:05Z'};
 i.summary.plays=[old];i.summary.drives={current:{id:'drive',plays:[corrected]}};
 const clean=copy(i);clean.summary.plays=[corrected];assert.equal(run(i).score,run(clean).score);assert.equal(run(i).live.components.eventShock,0);
 const conflict=input();conflict.summary.scoringPlays=[play('score','5:00','Touchdown',7,0,true)];conflict.summary.plays=[play('score','5:00','Touchdown',0,7,true)];
 const g=run(conflict);assert.equal(g.evidenceQuality,'invalid');assert.ok(g.evidenceReasons.includes('conflicting-event-revisions'));assert.equal(g.momentumPoints,0);
});
test('F2: retained partial observations cannot be upgraded to verified history',()=>{
 const i=input();i.summary.plays=[play('present','5:00','Pass complete')];const first=run(i),missing=copy(i);missing.summary=null;
 const retained=run(missing,first);assert.equal(retained.sameStateEvidenceRetained,true);assert.equal(retained.evidenceQuality,'partial');assert.equal(snapshotEvidence(retained,'live').evidenceQuality,'partial');
});
test('F5: future summary aggregate milestones cannot be attached to an earlier clock',()=>{
 const i=input('NFL','1:00',14,14,4);i.summary.plays=[play('current','1:00','Pass complete',14,14,false,4)];
 const first=run(i),future=copy(i);future.summary.header.competitions[0].status.displayClock='0:50';future.summary.boxscore={players:[{team:{id:'h'},statistics:[{name:'passing',labels:['C/ATT','YDS','AVG','TD','INT'],athletes:[{athlete:{id:'qb',displayName:'Quarterback'},stats:['30/40','400','10','4','0']}]}]}]};
 const g=run(future);assert.equal(g.score,first.score);assert.equal(g.inputEvidence.aggregateEvidenceDeferred,true);assert.ok(g.evidenceReasons.includes('ahead-summary-aggregates-deferred'));
});
test('F2: captured Senators-Ducks observations retain the exact earned +8 delayed-goal movement',()=>{
 const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/audit-evidence-20261101/nhl-delayed-goal.json.gz',import.meta.url))));
 const games=fixture.observations.map(f=>{const g=copy(f.game);g.sourceCompetition=copy(f.competition);g.sourceEvent={season:{year:2026,type:2}};runtime.applyLiveSnapshot(g,g.sourceCompetition,copy(f.summary));return g;});
 assert.deepEqual(fixture.observations.map(f=>f.observedRating),[63,71]);
 assert.equal(snapshotEvidence(fixture.observations[0].game,'live').evidenceQuality,'partial');
 assert.equal(snapshotEvidence(fixture.observations[1].game,'live').evidenceQuality,'verified');
 assert.equal(games[1].score-games[0].score,8);assert.equal(games[0].evidenceQuality,'partial');assert.equal(games[1].evidenceQuality,'complete');
 assert.deepEqual(games[1].historyOwnership.eventFactors,[{label:'Erased a multi-goal deficit',points:8}]);
});
test('F2: provider-declared partial history remains partial through a same-state cache omission',()=>{
 const i=input();i.summary.scoringPlays=[play('one','12:00','Home touchdown',7,0,true),play('two','6:00','Away touchdown',7,7,true)];i.summary.plays=copy(i.summary.scoringPlays);i.summary.playsComplete=false;
 const first=run(i),next=copy(i);next.summary=null;const retained=run(next,first);
 assert.equal(first.evidenceQuality,'partial');assert.equal(retained.evidenceQuality,'partial');assert.ok(retained.evidenceReasons.includes('provider-history-incomplete'));
});
test('F4: replay of an older unversioned event cannot undo a timestamped correction across polls',()=>{
 const i=input();i.summary.plays=[play('review','5:00','Pass intercepted')];const first=run(i),revised=copy(i);
 revised.summary.plays[0]={...revised.summary.plays[0],text:'Pass incomplete after review',modified:'2026-11-02T02:00:05Z'};
 const corrected=run(revised,first),persisted=JSON.parse(JSON.stringify(corrected)),replayed=run(i,persisted);assert.equal(corrected.live.components.eventShock,0);assert.equal(replayed.score,corrected.score);assert.equal(replayed.live.components.eventShock,0);
 assert.ok(persisted.providerEventRevisions.events.some(p=>p.id==='review'));assert.ok(JSON.stringify(persisted.providerEventRevisions).length<=385000);
});
test('F4/F5: old-model cached inputs are normalized again before scoring under the new model',()=>{
 const i=input();i.summary.plays=[play('turnover','5:00','Pass intercepted')];const one=run(i),duplicate=copy(one);
 one.modelVersion=duplicate.modelVersion='2026-11-01.production-integrity.2';duplicate.liveInputEvidence.summary.plays=Array.from({length:3},()=>copy(i.summary.plays[0]));
 const missing=copy(i);missing.summary=null;assert.equal(run(missing,duplicate).score,run(missing,one).score);
});
test('F4: identical idless period-only records cannot multiply a turnover bonus',()=>{
 const i=input('NFL','7:30');i.summary.plays=[{period:{number:2},text:'Pass intercepted at the 50',homeScore:7,awayScore:7,scoringPlay:false}];const one=run(i);
 for(const count of [2,3]){const copies=copy(i);copies.summary.plays=Array.from({length:count},()=>copy(i.summary.plays[0]));assert.equal(run(copies).score,one.score);}
});
test('F1: matching older scoreboards and summaries do not turn a two-quarter stale rollback into a correction',()=>{
 const i=input('NFL','1:00',14,0,4);i.event.competitions[0].situation.lastPlay={id:'12345900',text:'Current play'};i.summary.header.competitions=[copy(i.event.competitions[0])];
 const old=input('NFL','10:00',7,0,2);old.event.competitions[0].situation.lastPlay={id:'12345200',text:'Older play'};old.summary.header.competitions=[copy(old.event.competitions[0])];
 const g=run(old,run(i));assert.equal(g.liveUpdateRejected,true);assert.equal(g.liveRawStatus.period,4);assert.equal(g.teams[1][2],'14');
});
test('F2: a late one-second scoreless excerpt is observed coverage, not complete game history',()=>{
 const i=input('NFL','1:00',0,0,4);i.summary.plays=[play('one','1:01','Pass incomplete',0,0,false,4),play('two','1:00','Clock stopped',0,0,false,4)];
 const g=run(i);assert.equal(g.evidenceQuality,'partial');assert.ok(g.evidenceReasons.includes('scoreless-history-start-unobserved'));
});
test('F5: a clipped future drive result cannot invent an overtime possession even with a synchronized header',()=>{
 const i=input('NFL','5:00',14,14,5);const c=i.event.competitions[0];c.situation={possession:'h',lastPlay:{id:'12345100'}};i.summary.header.competitions=[copy(c)];
 i.summary.drives={previous:[{id:'drive',team:{id:'a'},plays:[{...play('12345100','5:00','Pass complete',14,14,false,5),start:{team:{id:'a'}}}]}]};
 const first=run(i),future=copy(i),drive=future.summary.drives.previous[0];drive.result='Punt';drive.end={period:5,clock:{displayValue:'4:50'}};drive.plays.push({...play('12345101','4:50','Punt',14,14,false,5),start:{team:{id:'a'}}});
 const g=run(future);assert.equal(g.score,first.score);assert.equal(g.live.nflOvertime?.suddenDeath,first.live.nflOvertime?.suddenDeath);
});
test('F1/F2: rejecting a stale lower-score NHL snapshot preserves accepted historical evidence',()=>{
 const i=hockeyLedger(true),first=run(i),old=copy(i);old.event.competitions[0].status.displayClock='5:00';old.event.competitions[0].competitors.find(t=>t.homeAway==='home').score='2';old.summary=null;
 const rejected=run(old,first);assert.equal(rejected.liveUpdateRejected,true);assert.ok(rejected.verifiedLiveEvidence);assert.equal(rejected.score,first.score);
});
test('F4/F5: current event shock needs observed recency, not a period midpoint or future tolerance',()=>{
 for(const [sport,clock]of [['NFL','7:30'],['CFB','7:30'],['NBA','6:00'],['NCAAB','10:00'],['NHL','10:00'],['Soccer','67:30']]){
  const status={period:2,displayClock:clock,type:{state:'in'}},p={id:'turnover',period:{number:2},text:'Pass intercepted at the 50'};
  assert.equal(eventScoring.eventShockFor(sport,{plays:[p]},status).points,0,`${sport} missing event clock`);
  assert.equal(eventScoring.eventShockFor(sport,{plays:[{...p,clock:{displayValue:clock}}]},status).points,4,`${sport} observed current event`);
  assert.equal(eventScoring.eventShockFor(sport,{plays:[{...p,clock:{displayValue:clock}}]},{period:2,type:{state:'in'}}).points,0,`${sport} missing current clock`);
 }
 const future={...play('future','7:29','Pass intercepted'),homeScore:undefined,awayScore:undefined};
 assert.equal(eventScoring.eventShockFor('NFL',{plays:[future]},{period:2,displayClock:'7:30'}).points,0);
});

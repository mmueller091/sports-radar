import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {browser,fixture,rows} from './helpers/timeline-clarity.mjs';
import {gameHistory,snapshotEvidence} from '../alerts-worker/src/snapshot-history.js';
const context=browser();
const view=(game,detail)=>context.timelinePresentation(game,context.timelinePoints(game,detail));
const finals=v=>v.history.filter(g=>g.records[0].ratingKind==='final');

test('read-time provenance exposes incomplete Chiefs finals without changing any stored observation',async()=>{
 const original=JSON.stringify(rows);
 const env={DB:{prepare:()=>({bind(){return this;},all:async()=>({results:rows.filter(r=>r.game_key==='NFL:401873033')})})}};
 const history=await gameHistory(env,'NFL','401873033');
 assert.equal(history.snapshots.length,12);
 assert.ok(history.snapshots.filter(p=>p.rating===38).every(p=>p.evidenceQuality==='partial'));
 assert.ok(history.snapshots.filter(p=>p.rating===75).every(p=>p.evidenceQuality==='verified'));
 assert.equal(JSON.stringify(rows),original);
 assert.deepEqual(history.snapshots.map(p=>p.rating),rows.filter(r=>r.game_key==='NFL:401873033').map(r=>r.rating));
});

test('explicit invalid evidence takes precedence; absent evidence and a supported zero bonus are distinct',()=>{
 assert.equal(snapshotEvidence({moment:'Last score',summaryLifecycleRejected:true},'completed').evidenceQuality,'invalid');
 assert.equal(snapshotEvidence({scoringPartial:true,moment:'Last score'},'completed').evidenceQuality,'partial');
 assert.equal(snapshotEvidence({momentumPoints:0},'completed').evidenceQuality,'verified');
 assert.equal(snapshotEvidence({},'completed').evidenceQuality,'partial');
 assert.equal(snapshotEvidence({scoringPartial:true,sameStateEvidenceRetained:true},'live').evidenceQuality,'verified');
 assert.equal(snapshotEvidence({},'live').evidenceQuality,undefined,'unknown legacy evidence is not asserted verified');
});

test('Chiefs 75/38: one authoritative final, grouped incomplete 38s, and unchanged reliable live points',()=>{
 const d=fixture('NFL','401873033'),game=d.sportsRadarGame,original=JSON.stringify(d);
 const raw=context.timelinePoints(game,d),v=view(game,d),groups=finals(v),html=context.excitementTimeline(game,d);
 assert.equal(v.current,75);assert.equal(groups.length,2);
 assert.equal(groups.find(g=>g.kind==='partial').score,38);
 assert.equal(groups.find(g=>g.kind==='partial').records.length,6);
 assert.equal(groups.find(g=>g.kind==='matching').records.length,6);
 assert.ok(v.points.every(p=>p.ratingKind!=='final'&&!p.incomplete&&!p.invalid));
 assert.deepEqual(Array.from(v.points,p=>p.score),Array.from(raw.points.filter(p=>p.ratingKind!=='final'&&!p.incomplete&&!p.invalid),p=>p.score));
 assert.equal((html.match(/<span>Final rating<\/span>/g)||[]).length,1);
 assert.match(html,/Incomplete update · 38/);assert.doesNotMatch(html,/Final assessment/);
 assert.match(html,/Last reliable live rating/);
 assert.equal(JSON.stringify(d),original);
});

test('Notre Dame 61 is a superseded 74–70 result, not an invalid play or an alternative to 65',()=>{
 const d=fixture('NCAAB','401920982'),v=view(d.sportsRadarGame,d),old=finals(v).find(g=>g.score===61);
 assert.equal(v.current,65);assert.equal(old.kind,'superseded');
 assert.match(old.reason,/74–70 to 74–72/);
 assert.equal(old.records[0].evidenceQuality,'verified');
 assert.equal(finals(v).find(g=>g.score===65).records.length,6);
 assert.equal(v.lastLive.score,47,'later incomplete live updates stay in the disclosure');
});

test('Celtics duplicate 67s collapse across refreshes, releases and the provider final-clock reset',()=>{
 const d=fixture('NBA','401909903'),v=view(d.sportsRadarGame,d);
 assert.equal(v.current,67);assert.equal(finals(v).length,1);
 assert.equal(finals(v)[0].kind,'matching');assert.equal(finals(v)[0].records.length,5);
 assert.equal(v.lastLive.score,7,'the later 9 was recorded with incomplete data');
 assert.equal(context.timelinePoints(d.sportsRadarGame,d).points.filter(p=>p.ratingKind==='final').length,5);
});

const point=(at,rating,state='live',extra={})=>({observedAt:at,rating,state,scoreA:'24',scoreB:'21',period:4,clock:'1:00',modelVersion:'same',evidenceQuality:'verified',...extra});
const game={id:'correction',sport:'NFL',state:'completed',score:84,teams:[['Away','A','24'],['Home','H','23']],liveRawStatus:{period:4,displayClock:'0:00'}};
const detail=points=>({sportsRadarHistory:{snapshots:points}});

test('legitimate final corrections remain visible as earlier results; authority does not depend on the latest history row',()=>{
 const d=detail([point(1,82),point(2,85,'completed'),point(3,84,'completed',{scoreB:'23'}),point(4,84,'completed',{scoreB:'23'})]);
 const v=view(game,d);assert.equal(v.current,84);assert.equal(finals(v).length,2);
 assert.equal(finals(v)[0].kind,'superseded');assert.match(finals(v)[0].reason,/24–21 to 24–23/);
 assert.equal(finals(v)[1].records.length,2);
 const later=structuredClone(game);later.score=81;later.teams[1][2]='22';
 const updated=view(later,d);assert.equal(updated.current,81);assert.ok(finals(updated).every(g=>g.kind==='superseded'));
 assert.equal(updated.lastLive.score,82);
});

test('a newer incomplete final cannot replace authority, and pending source data is not certified as final',()=>{
 const d=detail([point(1,82),point(2,84,'completed',{scoreB:'23'}),point(3,38,'completed',{scoreB:'23',evidenceQuality:'partial'})]);
 const v=view(game,d);assert.equal(v.current,84);assert.equal(v.lastLive.score,82);
 assert.equal(finals(v).at(-1).kind,'partial');
 const pending=view({...game,scoringPartial:true},d);assert.equal(pending.current,null);
 assert.equal(finals(pending).find(g=>g.score===84).kind,'previous');
 assert.match(context.excitementTimeline({...game,scoringPartial:true},d),/>Pending</);
});

test('invalid live points leave gaps; real same-clock swings, score corrections and overtime survive unchanged',()=>{
 const live={...game,state:'live',score:90,liveRawStatus:{period:5,displayClock:'9:00'}};
 const d=detail([point(1,66),point(2,73),point(3,20,'live',{evidenceQuality:'partial'}),point(4,72),
  point(5,10,'live',{integrityIssue:true}),point(6,69,'live',{scoreA:'23',clock:'1:01'}),
  point(7,90,'live',{period:5,clock:'9:00'})]);
 const v=view(live,d);
 assert.deepEqual(Array.from(v.points,p=>p.score),[66,73,72,69,90]);
 assert.equal(context.timelineComparable(v.points[1],v.points[0]),true);
 assert.equal(context.timelineComparable(v.points[2],v.points[1]),false);
 assert.equal(context.timelineComparable(v.points[3],v.points[2]),false);
 assert.equal(v.points.at(-1).overtime,true);
 assert.ok(v.history.some(g=>g.kind==='invalid'));assert.ok(v.history.some(g=>g.kind==='partial'));
});

test('resumed play supersedes an early final without changing CFB overtime spacing',()=>{
 const g={...game,sport:'CFB',state:'live',liveRawStatus:{period:6,displayClock:'0:00'}};
 const live=[point(1,80,'live',{period:5}),point(3,88,'live',{period:5}),point(4,90,'live',{period:6})];
 const a=view(g,detail(live)),b=view(g,detail([live[0],point(2,85,'completed',{period:5}),...live.slice(1)]));
 assert.deepEqual(Array.from(b.points,p=>[p.x,p.score]),Array.from(a.points,p=>[p.x,p.score]));
 assert.match(finals(b)[0].reason,/Play resumed/);
 assert.equal(context.timelineComparable(b.points[1],b.points[0]),false);
});

test('final-only and entirely incomplete history never fabricates a live curve',()=>{
 for(const ps of [[point(1,84,'completed',{scoreB:'23'})],[point(1,20,'live',{evidenceQuality:'partial'})]]){
  const d=detail(ps),v=view(game,d),html=context.excitementTimeline(game,d);
  assert.equal(v.points.length,0);assert.equal(v.lastLive,null);assert.equal(v.current,84);
  assert.match(html,/Not enough reliable live history/);assert.doesNotMatch(html,/<svg/);
  assert.match(html,/>Final rating</);assert.match(html,/Rating history/);
 }
});

test('history is collapsed by default, keyboard native, escaped, and remains readable on mobile',()=>{
 const d=detail([point(1,82),point(2,38,'completed',{evidenceQuality:'partial',scoreA:'<img src=x>'})]);
 const html=context.excitementTimeline(game,d),css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(html,/<details class="timeline-history"><summary>/);
 assert.doesNotMatch(html,/<details[^>]*\sopen[\s>]/);
 assert.match(html,/&lt;img src=x>/);assert.doesNotMatch(html,/<img src=x>/);
 assert.match(css,/\.timeline-history summary \{[^}]*min-height: 44px/);
 assert.match(css,/\.timeline-history summary:focus-visible/);
 assert.match(css,/@media \(max-width: 480px\)/);
});

import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import * as active from '../alerts-worker/src/live-game-model.js';import runtime from '../scoring/live-runtime.cjs';
import integrity from '../scoring/snapshot-integrity.cjs';import {validLedger} from '../scoring/live-evidence.cjs';
import {shouldSnapshot,gameHistory} from '../alerts-worker/src/snapshot-history.js';
import {fixture,rows,frame,evaluate} from './helpers/production-integrity.mjs';
const copy=x=>structuredClone(x);
const get=(id,rating)=>frame(rows.find(r=>r.game_key===id&&r.rating===rating));

test('captured production histories establish all reported anomalies and distinguish model generations',()=>{
 const osu=fixture('CFB','401856847').detail.sportsRadarHistory.snapshots;
 assert.deepEqual([...new Set(osu.filter(p=>p.period===4&&p.clock==='0:02').map(p=>p.rating))],[23,82]);
 assert.ok(osu.some((p,i)=>p.rating===23&&osu[i-1]?.rating===98));
 const mia=fixture('CFB','401858282').detail.sportsRadarHistory.snapshots;
 assert.ok(mia.some((p,i)=>p.rating===20&&mia[i-1]?.rating===62));
 assert.ok(mia.some(p=>p.rating===72&&p.clock==='0:44'));
 const chiefs=rows.filter(r=>r.game_key==='NFL:401873033'&&[66,73].includes(r.rating));
 assert.ok(chiefs.some(r=>r.rating===73));assert.ok(chiefs.some(r=>r.rating===66));
 assert.equal(new Set(chiefs.map(r=>r.model_version)).size,1);
 assert.notEqual(chiefs[0].model_version,osu.find(p=>p.rating===23).modelVersion);
});

for(const [id,rating] of [['CFB:401856847',82],['CFB:401858282',72],['NFL:401873033',73]]){
 test(`${id}: unchanged verified state survives missing and shortened summaries without smoothing`,()=>{
  const f=get(id,rating),first=evaluate(active,f);assert.ok(first.verifiedLiveEvidence);assert.ok(first.liveInputEvidence);
  for(const summary of [null,{header:copy(f.summary.header)},{...copy(f.summary),scoringPlays:[],winprobability:[],plays:[]},
   {...copy(f.summary),scoringPlays:f.summary.scoringPlays.slice(-1),winprobability:f.summary.winprobability.slice(-1)}]){
   const next=evaluate(active,f,summary,first);assert.equal(next.score,first.score);
   assert.deepEqual(next.historyOwnership.eventFactors,first.historyOwnership.eventFactors);
   assert.equal(next.sameStateEvidenceRetained,true);
  }
  const expired=copy(first);expired.liveInputEvidence.observedAt-=120001;
  assert.equal(evaluate(active,f,null,expired).sameStateEvidenceRetained,false);
 });
}

test('older football plays/clock resets are rejected before persistence; possession and turnovers remain real changes',()=>{
 const f=get('NFL:401873033',73),first=evaluate(active,f),old=copy(f);
 old.event.competitions[0].status.displayClock='9:40';
 old.event.competitions[0].situation.lastPlay.id='4018730333800';
 const rejected=evaluate(active,old,null,first);
 assert.equal(rejected.liveRawStatus.displayClock,'8:55');assert.equal(rejected.liveUpdateRejected,true);
 assert.equal(shouldSnapshot(rejected,{},Date.now(),runtime.MODEL_VERSION),false);
 for(const modify of [c=>{c.situation.possession='12';},c=>{c.situation.lastPlay={id:'4018730334000',type:{text:'Interception'},text:'Pass intercepted'};c.situation.possession='12';}]){
  const fresh=copy(f);modify(fresh.event.competitions[0]);const changed=evaluate(active,fresh,null,first);
  assert.equal(changed.liveUpdateRejected,false);assert.equal(changed.sameStateEvidenceRetained,false);assert.equal(shouldSnapshot(changed,{},Date.now(),runtime.MODEL_VERSION),true);
 }
});

test('corroborated score corrections, delayed conversion and small clock corrections are accepted',()=>{
 const f=get('NFL:401873033',73),first=evaluate(active,f);
 for(const [score,clock]of [['19','8:55'],['21','8:56']]){
  const changed=copy(f),c=changed.event.competitions[0];c.status.displayClock=clock;
  c.competitors.find(t=>t.homeAway==='home').score=score;changed.summary.header.competitions=[copy(c)];
  changed.summary.scoringPlays=changed.summary.scoringPlays.filter(p=>p.homeScore<=Number(score));
  const next=evaluate(active,changed,changed.summary,first);assert.equal(next.liveUpdateRejected,false);assert.equal(next.teams[1][2],score);assert.equal(next.liveRawStatus.displayClock,clock);
 }
 const pending=copy(f);pending.event.competitions[0].competitors.find(t=>t.homeAway==='home').score='19';
 const before=evaluate(active,pending,null),after=evaluate(active,f,f.summary,before);
 assert.equal(after.teams[1][2],'21');assert.equal(after.liveUpdateRejected,false);assert.equal(after.sameStateEvidenceRetained,false);
});

test('impossible provider ledger cannot contaminate completed scoring; stored ratings never enter the final methodology',()=>{
 const f=fixture('CFB','401856847'),first=evaluate(active,f),bad=copy(f);
 bad.summary.scoringPlays[1].homeScore=999;
 const invalid=evaluate(active,bad);assert.equal(invalid.scoringHistoryRejected,true);assert.equal(invalid.momentumPoints||0,0);
 const polluted=copy(f);polluted.summary.sportsRadarHistory={snapshots:Array(50).fill({rating:99,state:'live'})};
 assert.equal(evaluate(active,polluted).score,first.score);
 assert.equal(validLedger({scoringPlays:[{homeScore:'NaN',awayScore:1}]},f.event.competitions[0],'CFB'),false);
});

test('Notre Dame decisive play is the permanent late lead, while Colts blowout uses Last score',()=>{
 const nd=evaluate(active,fixture('NCAAB','401920982'));assert.equal(nd.momentLabel,'Decisive play');assert.match(nd.moment,/Logan Duncomb.*three point/);assert.doesNotMatch(nd.moment,/0:00/);
 const ind=evaluate(active,fixture('NFL','401873028'));assert.equal(ind.momentLabel,'Last score');assert.equal(ind.score,1);
 const cfb=evaluate(active,fixture('CFB','401856847'));assert.equal(cfb.momentLabel,'Decisive play');assert.match(cfb.moment,/0:00.*Field Goal/);
 const cards=evaluate(active,fixture('NFL','401873024'));assert.equal(cards.momentLabel,'Decisive play');assert.match(cards.moment,/2:53.*Ryland/);
});

test('verified Cardinals comeback, quarterback replacement and missed-PAT redemption are factual and event-scoped',()=>{
 const f=fixture('NFL','401873024'),g=evaluate(active,f);assert.equal(g.completedFacts.comeback.deficit,14);
 assert.equal(g.completedFacts.quarterbackChange.incoming,'Gardner Minshew II');assert.equal(g.completedFacts.quarterbackChange.outgoing,'Jacoby Brissett');
 assert.equal(g.completedFacts.redemption.kicker,'Chad Ryland');assert.equal(g.completedFacts.redemption.clock,'0:06');
 const wrong=copy(f);wrong.summary.article.gameId='other';assert.equal(evaluate(active,wrong).completedFacts.quarterbackChange,undefined);
});

test('Chiefs conversion reconciles period totals from verified scoring progression, never an invented residual',()=>{
 const f=get('NFL:401873033',73),g=evaluate(active,f),s=copy(f.summary);
 const den=s.header.competitions[0].competitors.find(t=>t.homeAway==='home');
 den.linescores=[3,3,7,6].map(value=>({value}));den.score='21';
 const result=runtime.canonicalDetailSummary(g,s),fixed=result.header.competitions[0].competitors.find(t=>t.homeAway==='home');
 assert.equal(fixed.score,'21');assert.equal(fixed.linescores.reduce((sum,l)=>sum+Number(l.value),0),21);assert.equal(fixed.linescores[3].value,8);
 assert.equal(fixed.periodScoreSource,'verified scoring progression');
 const missing=copy(s);delete missing.scoringPlays;delete missing.plays;
 const partial=runtime.canonicalDetailSummary(g,missing);assert.equal(partial.header.competitions[0].competitors.find(t=>t.homeAway==='home').linescores.length,0);
 assert.equal(partial.sportsRadarFreshness.statsPending,true);assert.deepEqual(missing.boxscore,s.boxscore);
});

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function browser(){const context=vm.createContext({console,Date,Intl,SportsRadarScore:runtime,ratingHistory:{},SPORT_BASE:runtime.SPORT_BASE,watchKey:g=>`${g.sport}:${g.id}`,legacyPlayPosition:()=>null,scoringEvents:s=>s.scoringPlays||s.plays?.filter(p=>p.scoringPlay)||[],estimatedEventRating:()=>30,compactPlay:p=>p.text||'',safeText:s=>String(s??'')});
 vm.runInContext(source.slice(source.indexOf('function timelineFormat('),source.indexOf('function safeStoryUrl(')),context);
 vm.runInContext(source.slice(source.indexOf('function explainRating('),source.indexOf('function trendFor(')),context);return context;
}
test('Celtics +58 and Notre Dame +47 finals are isolated retrospective assessments with original live points intact',()=>{
 const context=browser();for(const [sport,id,delta]of [['NBA','401909903',58],['NCAAB','401920982',47]]){
  const f=fixture(sport,id),ps=f.detail.sportsRadarHistory.snapshots;
  assert.ok(ps.some((p,i)=>p.state==='completed'&&ps[i-1]?.state==='live'&&p.rating-ps[i-1].rating===delta));
  const result=context.timelinePoints(f.game,f.detail),final=result.points.find(p=>p.ratingKind==='final');assert.ok(final);
  assert.equal(context.timelineComparable(final,result.points[result.points.indexOf(final)-1]),false);
  const live=result.points.filter(p=>p.ratingKind==='live');assert.deepEqual(Array.from(live,p=>p.score),ps.filter(p=>p.state==='live').map(p=>p.rating));
  const html=context.excitementTimeline(f.game,f.detail);assert.match(html,/retrospective rating evaluates the whole game/);assert.doesNotMatch(html,new RegExp(`<b>\\+${delta}</b>`));
 }
});

test('legacy partial observations remain transparent but cannot masquerade as measured excitement spikes',async()=>{
 const selected=rows.filter(r=>r.game_key==='CFB:401856847');
 const env={DB:{prepare:()=>({bind(){return this;},all:async()=>({results:selected})})}};
 const history=await gameHistory(env,'CFB','401856847');assert.equal(history.snapshots[0].evidenceQuality,'partial');
 const f=fixture('CFB','401856847'),context=browser(),summary={...f.detail,sportsRadarHistory:history};
 const result=context.timelinePoints(f.game,summary);assert.equal(result.points[0].score,23);assert.equal(result.points[1].score,82);
 assert.equal(context.timelineComparable(result.points[1],result.points[0]),false);
});

test('Patriots current two-score situation and early Oilers two-goal gap receive proportionate explanations',()=>{
 const context=browser(),f=get('NFL:401873034',44),ne=evaluate(active,f);
 assert.match(context.explainRating(ne),/more than one scoring possession/);assert.doesNotMatch(context.explainRating(ne),/brought.*back|back within reach/);
 const edm=copy(fixture('NHL','401892627').game);edm.teams[0][2]='2';edm.teams[1][2]='0';edm.liveRawStatus={period:2,displayClock:'18:00'};edm.live={reasons:[]};edm.factors=[{label:'Wide margin',points:-5}];
 const text=context.explainRating(edm);assert.match(text,/cut the lead to one/);assert.doesNotMatch(text,/major turnaround/);
 const cards=evaluate(active,fixture('NFL','401873024'));assert.match(context.explainRating(cards),/14 points down.*Minshew.*Brissett.*missed.*overtime field goal/);
});

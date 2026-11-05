import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildScoringQuality,captureQualityEvidence,clockSeconds} from '../src/quality.js';
import worker from '../src/index.js';
const start=Date.parse('2026-11-03T23:00:00Z');
function observation({sport='NBA',id='1',rating=60,scores=[100,100],period=4,clock='1:00',offset=0,model='one',raw={},quality={},state='live',revision}={}){
  const game={id,sport,state,score:rating,teams:[['Away','A',scores[0],'','','','','','away'],['Home','H',scores[1],'','','','','','home']],
    liveRawStatus:{period,displayClock:clock},liveRawSituation:raw,evidenceQuality:'complete'};
  const at=start+offset;
  return {rating,observedAt:at,scores,period,state:game,scoringVersion:model,feedRevision:revision??String(at),
    qualityEvidence:{...captureQualityEvidence(game,{publishedAt:at,observedAt:at}),...quality}};
}
function run(observations,sport=observations[0]?.state.sport||'NBA',id='1'){
  return buildScoringQuality([{gameKey:sport+':'+id,sport,matchup:'Away vs Home',observations}]);
}
test('unknown rating is not zero; completed closeness cannot inflate live peaks',()=>{
  const q=run([observation({rating:null}),observation({rating:99,state:'completed',offset:180000})]);
  assert.equal(q.calibration.find(s=>s.sport==='NBA').gamesWithRating,0);
  assert.equal(q.topUnderrated.length,0);assert.equal(q.games[0].peakRating,null);
  assert.equal(q.calibration.length,8);
});
test('threshold denominator is games, not observations; every requested boundary is inclusive',()=>{
  const games=[70,80,85,90,95].map((rating,i)=>({gameKey:'NBA:'+i,sport:'NBA',observations:[observation({rating}),observation({rating,offset:180000})]}));
  const c=buildScoringQuality(games).calibration.find(s=>s.sport==='NBA');
  assert.deepEqual(Object.values(c.percentageReaching),[100,80,60,40,20]);assert.equal(c.peakDistribution.median,85);
});
test('duration excludes repeated stale revisions, gaps, finals, model switches and causal replay',()=>{
  const a=observation({rating:90}),dup={...a,observedAt:start+180000};
  const b=observation({rating:85,offset:360000}),gap=observation({rating:95,offset:1800000});
  const q=run([a,dup,b,gap,observation({rating:99,offset:1980000,model:'two'})]);
  assert.equal(q.games[0].coveredSeconds,360);assert.equal(q.games[0].estimatedSecondsAbove85,360);
  assert.equal(q.games[0].unknownIntervalSeconds,1440);assert.equal(q.modelCohorts.length,2);
  assert.equal(q.games[1].coveredSeconds,0);
  assert.equal(q.calibration.find(s=>s.sport==='NBA').gamesObserved,1,'cross-model overview deduplicates game identity');
  const reconstructed=run([a,b].map(o=>({...o,provenance:'causal-reconstruction'})));
  assert.equal(reconstructed.calibration.find(s=>s.sport==='NBA').estimatedSecondsAbove85,null);
});
test('strictly above 85 differs from reaching 85; missing publication does not invent duration',()=>{
  const a=observation({rating:85}),b=observation({rating:90,offset:180000});
  assert.equal(run([a,b]).games[0].estimatedSecondsAbove85,0);
  a.qualityEvidence.publishedAt=null;
  assert.equal(run([a,b]).games[0].coveredSeconds,0);assert.equal(run([a,b]).games[0].unknownIntervalSeconds,0);
});
test('football decisive possession requires actual down, distance and spot; timeouts remain explicit gaps',()=>{
  const basic=observation({sport:'NFL',scores:[20,23]});
  assert.equal(run([basic]).topUnderrated.length,0);
  const rich=observation({sport:'NFL',scores:[20,23],raw:{possession:'away',down:4,distance:2,yardsToEndzone:18}});
  const f=run([rich]).topUnderrated[0];assert.ok(f.signals.includes('Meaningful fourth down'));assert.ok(f.missingEvidence.includes('Timeouts unavailable'));
});
test('basketball possession, foul, bonus and shot-clock uncertainty are not fabricated',()=>{
  const q=run([observation({rating:62,raw:{possession:'away'}})]),f=q.topUnderrated[0];
  assert.ok(f.signals.includes('Decisive basketball possession'));assert.equal(f.evidence.shotClock,null);
  assert.ok(f.missingEvidence.includes('Bonus evidence unavailable'));assert.ok(f.missingEvidence.includes('Foul evidence unavailable'));
  assert.equal(run([observation({rating:62})]).topUnderrated.length,0);
});
test('seven points down with two seconds is not a viable underdog finish',()=>{
  const q=run([observation({rating:91,scores:[100,107],clock:'0:02',quality:{market:{teamId:'away',spread:15},underdogMargin:-7}})]);
  assert.equal(q.topOverrated.length,1);assert.equal(q.topUnderrated.length,0);
});
test('archived-like 98.6% four-point favorite at four seconds is not flagged as urgent missing upset credit',()=>{
  const o=observation({sport:'NCAAB',period:2,scores:[74,70],clock:'0:04',rating:31,
    quality:{market:{teamId:'away',spread:7.5},underdogMargin:4,underdogProbability:.986,winProbability:.014}});
  assert.equal(run([o]).topUnderrated.length,0);assert.equal(run([o]).games[0].watchability.closeButSettled,true);
});
test('comeback feasibility penalty is not mistaken for retained historical excitement',()=>{
  const g=observation().state;g.factors=[{label:'Limited comeback runway',points:-10},{label:'Erased a large deficit',points:6},{label:'1 late lead change',points:2}];
  assert.equal(captureQualityEvidence(g).historyPoints,8);
});
test('late defensive rebound by a three-point leader with 97.8% win chance is effectively settled',()=>{
  const o=observation({sport:'NCAAB',period:2,rating:41,scores:[67,64],clock:'0:04',raw:{possession:'away'},quality:{winProbability:.022}});
  assert.equal(run([o]).topUnderrated.length,0);assert.equal(run([o]).games[0].watchability.closeButSettled,true);
});
test('football timeout and possession evidence identifies an effectively decided close score',()=>{
  const o=observation({sport:'NFL',rating:89,scores:[24,21],clock:'0:20',raw:{possession:'away',down:2,distance:10,yardsToEndzone:60,awayTimeouts:1,homeTimeouts:0}});
  const q=run([o]);assert.equal(q.topOverrated.length,1);assert.equal(q.topUnderrated.length,0);assert.equal(q.games[0].watchability.closeButSettled,true);
  o.qualityEvidence.timeouts[1]=null;assert.equal(run([o]).topOverrated.length,0);
});
test('observed basketball run is a historical signal, with late emergence evaluated separately',()=>{
  const a=observation({rating:40,scores:[60,80],clock:'4:00'}),b=observation({rating:72,scores:[70,80],clock:'2:00',offset:180000});
  assert.ok(run([a,b]).games[0].decisiveMoments[0].signals.includes('Observed unanswered run within three game minutes'));
  const c=observation({rating:90,scores:[82,82],clock:'0:45',offset:360000,raw:{possession:'away'}});
  assert.equal(run([a,b,c]).games[0].watchability.lateEmergence,true);
});
test('NBA and NCAAM late underdogs require accepted expectation evidence',()=>{
  for(const sport of ['NBA','NCAAB']){
    const o=observation({sport,period:sport==='NBA'?4:2,clock:'4:00',rating:71,scores:[65,66],
      quality:{market:{teamId:'away',spread:15},underdogMargin:-1,underdogProbability:.4}});
    assert.ok(run([o]).topUnderrated[0].signals.includes('Credible observed underdog threat'));
    delete o.qualityEvidence.market;assert.equal(run([o]).topUnderrated.length,0);
  }
});
test('NHL one-goal, overtime, pulled-goalie and pressure coverage are independent',()=>{
  const o=observation({sport:'NHL',period:4,scores:[2,2],clock:'3:00',rating:68});
  const q=run([o]);assert.ok(q.topUnderrated[0].signals.includes('Tied hockey overtime'));
  assert.ok(q.topUnderrated[0].missingEvidence.includes('Advanced pressure unavailable; experiment disabled'));
  assert.equal(q.topUnderrated[0].evidence.goaliePulled,null);
  const late=run([observation({sport:'NHL',period:3,scores:[2,3],clock:'3:00',rating:70})]);
  assert.ok(late.games[0].decisiveMoments[0].signals.includes('Late one-goal opportunity'));
});
test('MLB tying-run leverage needs all bases, outs and actual trailing batting side',()=>{
  const raw={outs:2,onFirst:true,onSecond:false,onThird:false,battingTeamId:'away'};
  const o=observation({sport:'MLB',period:9,scores:[2,4],raw});
  assert.ok(run([o]).topUnderrated[0].signals.includes('Late tying/winning run at plate or on base'));
  o.qualityEvidence.battingTeamId='home';assert.equal(run([o]).topUnderrated.length,0);
  o.qualityEvidence.battingTeamId=null;assert.equal(run([o]).topUnderrated.length,0);
});
test('MLB no-hit bid and Tennis match points require explicit evidence; format is never assumed',()=>{
  assert.equal(run([observation({sport:'MLB',period:8,scores:[0,2],quality:{noHitBid:true}})]).topUnderrated.length,1);
  const o=observation({sport:'Tennis',period:3,scores:[1,1],clock:'',quality:{grandSlam:true}});
  assert.equal(run([o]).topUnderrated.length,0);assert.equal(run([o]).games[0].decisiveMoments.length,0);
  o.qualityEvidence.matchPoint=true;assert.equal(run([o]).topUnderrated.length,1);
});
test('comeback uses only prior observations and does not persist into a later blowout',()=>{
  const first=observation({rating:40,scores:[50,70],period:2,clock:'9:00'});
  const recovered=observation({rating:65,scores:[80,82],offset:180000,clock:'4:00'});
  const after=observation({rating:90,scores:[105,82],offset:360000,clock:'1:00',quality:{historyPoints:16}});
  assert.equal(run([first]).topUnderrated.length,0);
  const q=run([first,recovered,after]);assert.equal(q.topUnderrated[0].rating,65);
  assert.equal(q.topOverrated[0].rating,90);assert.equal(q.games[0].watchability.retainedHistoryDuringBlowout,true);
  assert.ok(!q.games[0].decisiveMoments.find(m=>m.rating===90)?.signals.includes('Substantial comeback observed so far'));
});
test('future final facts cannot change earlier analysis',()=>{
  const a=observation({rating:60}),prefix=run([a]);
  const future={...observation({rating:99,offset:900000}),state:{state:'completed'}};
  const extended=run([a,future]);
  // The upgraded report preserves completed ratings in their own context. All
  // earlier live decisions and measured live trajectories remain unchanged.
  for(const field of ['topOverrated','topUnderrated','recommendations','simultaneousPriorityConflicts'])assert.deepEqual(extended[field],prefix[field]);
  for(const field of ['peakRating','thresholds','volatility','comebackAnalysis','decisiveMoments','watchability'])assert.deepEqual(extended.games[0][field],prefix.games[0][field]);
  assert.equal(extended.games[0].ratingContexts.completed[0].rating,99);
  assert.equal(extended.games[0].ratingContexts.peakLive.rating,60);
});
test('event response is observed association and unknown provider latency remains unknown',()=>{
  const a=observation({rating:60}),b=observation({rating:65,offset:180000,quality:{event:{id:'goal',occurredAt:start+60000,text:'Goal'}}});
  const q=run([a,b]),e=q.games[0].eventResponses[0];
  // Canonical refresh start was previously mislabeled publication. Preserve the
  // measured observation bound without asserting exact scoring latency.
  assert.equal(e.eventToObservedRiseMs,null);assert.match(e.status,/causality unproven/);
  assert.equal(e.latency.eventToFirstObservedResponseUpperBoundMs,120000);
  assert.equal(e.latency.exactResponseMs,null);assert.equal(e.change,5);
  assert.deepEqual(e.observedInterval,[start,start+180000]);
  assert.match(q.methodology.providerToPublicationLatency,/Unavailable/);
  assert.equal(run([b]).games[0].eventResponses[0].eventToObservedRiseMs,null);
});
test('candidate evidence retains exact archive play identity and event time separately from publication',()=>{
  const o=observation({rating:60,raw:{possession:'away'}});
  o.sourceReference={file:'verified-archive.json',playId:'42'};o.sourceEvent={id:'42',occurredAt:start-1000,text:'Shot'};
  const f=run([o]).topUnderrated[0];assert.equal(f.sourceReference.playId,'42');assert.equal(f.sourceEvent.occurredAt,start-1000);assert.equal(f.publishedAt,start);
});
test('same-clock future events and cached later scores are rejected',()=>{
  const g=observation().state;
  const lastPlay={id:'future',period:{number:4},clock:{displayValue:'1:00'},homeScore:100,awayScore:100,scoringPlay:true,wallclock:new Date(start+1).toISOString()};
  g.liveRawSituation={lastPlay};assert.equal(captureQualityEvidence(g,{publishedAt:start}).event,null);
  lastPlay.wallclock=new Date(start-1).toISOString();lastPlay.homeScore=102;
  assert.equal(captureQualityEvidence(g,{publishedAt:start}).event,null);
  lastPlay.homeScore=100;assert.equal(captureQualityEvidence(g,{publishedAt:start}).event.id,'future');
});
test('simultaneous priority comparisons require the same revision; ties retain all leaders',()=>{
  const games=[{gameKey:'NBA:high',sport:'NBA',observations:[observation({rating:90,scores:[120,90]})]},
    {gameKey:'NBA:urgent',sport:'NBA',observations:[observation({rating:65,raw:{possession:'away'}})]}];
  assert.equal(buildScoringQuality(games).simultaneousPriorityConflicts.length,1);
  games[1].observations[0].feedRevision='later';assert.equal(buildScoringQuality(games).simultaneousPriorityConflicts.length,0);
});
test('deterministic integrity faults and subjective calibration are distinct; top lists deduplicate games',()=>{
  const a=observation({rating:91,scores:[120,90]}),b=observation({rating:92,scores:[125,90],offset:180000});
  b.auditCandidates=[{reasonCode:'BAD_SCORE',deterministic:true}];
  const q=run([a,b]);assert.equal(q.topOverrated.length,1);assert.equal(q.integrityProblems[0].classification,'confirmed_integrity_failure');
  assert.equal(q.topOverrated[0].rating,91,'supported scoring candidates exclude the invalid 92 observation');
  assert.equal(q.topOverrated[0].classification,'calibration_hypothesis');
  assert.equal(q.evidenceReview[0].classification,'confirmed_defect');assert.equal(q.evidenceReview[0].rating,92);
  assert.equal(q.evidenceReview[0].legacyClassification,'confirmed_integrity_failure');
  assert.deepEqual(q.evidenceReview[0].integrityProblems,['BAD_SCORE']);assert.equal(q.confirmedScoringDefects.length,0);
});
test('decimal seconds are retained and malformed clocks stay missing',()=>{
  assert.equal(clockSeconds('3.4'),3.4);assert.equal(clockSeconds('0:03.4'),3.4);assert.equal(clockSeconds('1:99'),null);assert.equal(clockSeconds(''),null);
});
test('quality route uses existing private auth and rejects mutations',async()=>{
  assert.equal((await worker.fetch(new Request('https://audit/quality?date=2026-11-03'),{AUDIT_READ_TOKEN:'secret'})).status,401);
  assert.equal((await worker.fetch(new Request('https://audit/quality',{method:'POST'}),{})).status,405);
});
test('audit has no production/scoring, network or AI dependency and candidate is outside browser build',()=>{
  const quality=fs.readFileSync(new URL('../src/quality.js',import.meta.url),'utf8');
  assert.doesNotMatch(quality,/\bfetch\s*\(|\bimport\s+.*(?:scoring|candidate)|\.prepare\(/);
  const browser=fs.readFileSync(new URL('../../dist/scoring-runtime.js',import.meta.url),'utf8');
  assert.doesNotMatch(browser,/correctNcaaMetadata|ScoringQuality/);
});

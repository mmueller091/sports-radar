import test from 'node:test';
import assert from 'node:assert/strict';
import * as adapter from '../alerts-worker/src/live-game-model.js';
import runtime from '../scoring/live-runtime.cjs';
import nhl from '../scoring/sports/nhl.js';
import evidence from '../scoring/live-evidence.cjs';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {shouldSnapshot} from '../alerts-worker/src/snapshot-history.js';
import {notificationEligible,DEFAULT_NOTIFICATION_PREFERENCES} from '../alerts-worker/src/notification-preferences.js';
import {replayCheckpoints} from '../scripts/replay-inputs.mjs';
import {cases,input,ice,eventAt,goal,shot,evaluate,clock} from './helpers/nhl-stage1.mjs';
const run=(i,_candidate=false,previous=null)=>evaluate(adapter,runtime,i,previous);
const act=g=>g.live.sportImpact.allocation.activity;
const copy=x=>structuredClone(x);
test('release graph excludes NHL experiments and public entry ignores candidate options',t=>{
  t.mock.method(Date,'now',()=>1794340000000);
  assert.equal(runtime.applyNhlActivityCandidate,undefined);
  assert.equal(runtime.MODEL_VERSION,JSON.parse(readFileSync(new URL('../social-bot/wrangler.jsonc',import.meta.url))).vars.EXPECTED_SCORING_MODEL);
  const i=cases().active,build=options=>{const g=run(i);runtime.applyLiveSnapshot(g,g.sourceCompetition,copy(i.summary),options);return g;};
  const a=build(),b=build({nhlActivity:true,nhlDirectionEvidence:{fact:{homeDefends:'left'}}});
  assert.deepEqual(b,a);
  const history={upcoming:new Set(),completed:new Map()};
  assert.equal(shouldSnapshot(a,history,Date.now(),runtime.MODEL_VERSION),shouldSnapshot(b,history,Date.now(),runtime.MODEL_VERSION));
  assert.equal(notificationEligible(a,DEFAULT_NOTIFICATION_PREFERENCES),notificationEligible(b,DEFAULT_NOTIFICATION_PREFERENCES));
  const require=createRequire(import.meta.url),bundle=require('../alerts-worker/node_modules/esbuild').buildSync({
    entryPoints:['alerts-worker/src/index.js'],bundle:true,platform:'browser',format:'esm',write:false,metafile:true,external:['cloudflare:*']});
  assert.ok(!Object.keys(bundle.metafile.inputs).some(p=>/nhl-(activity|direction|pressure-experiment)/.test(p)));
  assert.doesNotMatch(bundle.outputFiles[0].text,/NHL_DIRECTION_SHADOW|nhlActivity|nhlDirectionEvidence|Rapid comeback in progress/);
});
test('Stage 1 corrects tied power plays and OT descriptions; +3 OT calibration remains excluded',()=>{
  const c=cases(),g=Object.fromEntries(Object.entries(c).map(([k,i])=>[k,run(i)]));
  assert.equal(g.tiedEV.score,79);assert.equal(g.tiedPP.score,85);
  assert.deepEqual([g.ot3.score,g.ot4.score,g.ot5.score],[90,90,90]);
  assert.match(g.tiedPP.live.sportImpact.note,/Tied-game/);
  assert.equal(Boolean(g.tiedPP.live.sportImpact.manpower.trailingPowerPlay),false);
  assert.match(g.ot4.live.sportImpact.note,/4-on-3/);assert.match(g.ot5.live.sportImpact.note,/5-on-3/);
  assert.equal(act(g.quiet),undefined);assert.equal(runtime.PRODUCTION_POLICY.nhlActivity,undefined);
  assert.equal(runtime.MODEL_VERSION,'2026-11-10.nhl-correctness.1');
});

test('explicit delayed penalties suppress tactical intent across reduced-strength attacker counts',()=>{
  for(const [h,a]of [[4,5],[3,5],[3,4],[5,6],[4,6]]){
    const i=ice(input({clock:'3:00'}),h,a,true,false);
    i.summary.plays.push(eventAt(3400,{text:'Delayed penalty',team:{id:'h'}}));
    const g=run(i),m=g.live.sportImpact.manpower;
    assert.equal(m.pulled,false,`${a}-on-${h}`);assert.equal(m.goaliePullSuppressed,'probable-delayed-penalty');
    assert.equal(m.advantage,Math.max(0,a-h-1));
  }
});

test('tactical intent is explicit before three minutes; boundary uncertainty and late six-on-four survive',()=>{
  for(const seconds of [181,180,179]){
    const i=input({clock:clock(seconds),manpower:'pulled'});
    const unclear=run(i).live.sportImpact.manpower;
    assert.equal(unclear.pulled,seconds<=180);
    if(seconds>180)assert.equal(unclear.goaliePullSuppressed,'unconfirmed-early-six-on-five');
    i.summary.plays.push(eventAt(3600-seconds-5,{text:'Away goalie pulled to the bench',team:{id:'a'}}));
    assert.equal(run(i).live.sportImpact.manpower.pulled,true);
  }
  assert.equal(run(input({clock:'3:00',manpower:'sixOnFour'})).live.sportImpact.manpower.pulled,true);
  const reduced=ice(input({clock:'3:00'}),3,4,true,false);
  assert.equal(run(reduced).live.sportImpact.manpower.goaliePullSuppressed,'unconfirmed-reduced-strength-extra-attacker');
  reduced.summary.plays.push(eventAt(3415,{text:'Away goalie pulled to the bench',team:{id:'a'}}));
  assert.equal(run(reduced).live.sportImpact.manpower.pulled,true);
});

test('missing goalie identities never create a confirmed penalty or tactical advantage',()=>{
  const i=input({manpower:'sixOnFour'});i.summary.boxscore.players=[];
  const m=run(i).live.sportImpact.manpower;
  assert.equal(m.pulled,false);assert.equal(m.powerPlay,false);assert.equal(m.advantage,0);
});

test('known expired manpower cannot affect the target or trusted cache; valid goals survive',()=>{
  const i=input({home:1,away:1,plays:[goal(1,0,600),goal(1,1,1200,'A','a')],manpower:'trailingPP'});
  i.summary.plays.push(eventAt(3100,{id:'minor',team:{id:'h'},type:{text:'Tripping',penaltyMinutes:2,penaltyType:'Minor'}}));
  const original=JSON.stringify(i),g=run(i),even=copy(i);ice(even,5,5);
  assert.equal(g.manpowerQuality.state,'conflict');assert.equal(g.live.sportImpact.manpower.powerPlay,false);
  assert.equal(g.manpowerEvidence,undefined);assert.equal(g.score,run(even).score);
  assert.equal(g.verifiedLiveEvidence.summary.scoringPlays.length,2);assert.equal(JSON.stringify(i),original);
});

test('compatible brief missing lineup retains trusted PP; expired/conflicting state does not',()=>{
  const i=input({manpower:'trailingPP'});
  i.summary.plays.push(eventAt(3270,{id:'minor',team:{id:'h'},type:{text:'Tripping',penaltyMinutes:2,penaltyType:'Minor'}}));
  const g=run(i);assert.ok(g.manpowerEvidence);
  const absent=copy(i.summary);delete absent.onIce;
  const now=g.manpowerEvidence.observedAt+1000;
  const retained=evidence.currentManpower(g,i.competition,absent,now);
  assert.equal(g.manpowerRetained,true);assert.ok(nhl.hockeyOnIceState(retained,g.teams).powerPlayTeamId);
  const expired=copy(i.competition);expired.status.displayClock='2:00';
  assert.equal(evidence.currentManpower(g,expired,absent,now+1000).onIce,undefined);
});

test('structured shorthanded strength survives duplicates and retained goal processing exactly once',()=>{
  const i=input({plays:[goal(1,0,3270)]});
  i.summary.plays[0].strength={id:'703',text:'Short Handed',abbreviation:'short-handed'};
  const g=run(i);assert.ok(g.live.components.eventShock>0);
  assert.deepEqual(g.verifiedLiveEvidence.summary.scoringPlays[0].strength,i.summary.plays[0].strength);
  assert.deepEqual(g.verifiedLiveEvidence.summary.scoringPlays[0].participants,[{type:'scorer',athlete:{id:'Scorer'}}]);
  const duplicate=copy(i);duplicate.summary.plays.push(copy(duplicate.summary.plays[0]));
  assert.equal(run(duplicate).live.components.eventShock,g.live.components.eventShock);
  const missing=copy(i);missing.summary={header:copy(i.summary.header)};
  assert.equal(run(missing,false,g).live.components.eventShock,g.live.components.eventShock);
});

test('highest goal performance wins across teams/groups; assists never refresh its scorer clock',()=>{
  const c=cases();assert.equal(run(c.milestone).score,run(c.reversed).score);
  assert.equal(nhl.hockeyGoalMilestone(c.milestone.summary).scorerId,'Four');
  const i=copy(c.milestone);
  i.summary.plays.at(-1).clock.displayValue='10:00';i.summary.plays.at(-1).sequenceNumber=3000;
  i.summary.scoringPlays=i.summary.plays.filter(p=>p.scoringPlay);
  const last=i.summary.plays.at(-1);last.participants=[{type:'scorer',athlete:{id:'Other'}}];last.text='Other Goal, assists: Four';
  last.clock.displayValue='14:50';last.sequenceNumber=3290;
  assert.equal(run(i).live.components.milestone,0);
});

test('untimed pressure records are neutral through the production entry',()=>{
  const i=input({plays:[goal(1,0,600),...Array.from({length:18},(_,n)=>({id:'untimed'+n,text:'Point-blank shot saved by goalie'}))]});
  assert.equal(run(i).live.components.pressure,0);
});

test('high-scoring Seattle Florida replay retains scorer identities inside the unchanged history byte limit',()=>{
  const f=JSON.parse(readFileSync(new URL('./fixtures/real-games/NHL-20261017-401892522.json',import.meta.url)));
  const cps=replayCheckpoints(f).checkpoints,g=run(cps[Math.floor(cps.length*.95)]);
  assert.ok(g.verifiedLiveEvidence);assert.ok(JSON.stringify(g.verifiedLiveEvidence).length<=32000);
  assert.ok(g.verifiedLiveEvidence.summary.scoringPlays.every(p=>p.participants.some(a=>a.type==='scorer' && a.athlete?.id)));
  assert.ok(!JSON.stringify(g.verifiedLiveEvidence.summary).includes('headshot'));
  assert.equal(g.providerEventRevisions.truncated,false);
});

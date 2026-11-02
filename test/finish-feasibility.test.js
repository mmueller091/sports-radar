import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as active from '../alerts-worker/src/live-game-model.js';
import {createRequire} from 'node:module';
import helper from './helpers/finish-audit.cjs';
import cfb from './helpers/cfb-completed.cjs';
import live from './helpers/cfb-calibration.cjs';
import nhl from './helpers/nhl-calibration.cjs';
import {replayCheckpoints} from '../scripts/replay-inputs.mjs';
const require=createRequire(import.meta.url),core=require('../rating-core.js');
const before=helper.baseline();
const run=(sport,id,api=active)=>{const f=helper.read(`${sport}-${id}`);return helper.score(api,f.event,f.summary,sport);};

test('reported CFB finals retain competitive paths consistently with margin and drama',()=>{
 const v=run('CFB','401868342'),i=run('CFB','401867861'),a=run('CFB','401856842');
 assert.equal(run('CFB','401868342',before).score,67);assert.equal(run('CFB','401867861',before).score,66);assert.equal(run('CFB','401856842',before).score,56);
 assert.ok(a.score>=70&&a.score<=85);assert.ok(a.score>v.score+20);assert.ok(v.score>i.score&&v.score<55&&i.score<40);
 const s=input=>cfb.evaluate(core,input).score;
 const scores=[7,8,9,10].map(gap=>s({...cfb.cases.I,scores:[28+gap,28],path:cfb.cases.I.path.slice(0,-1).concat([[4,'0:40',25+gap,28],[4,'0:12',28+gap,28]])}));
 for(let j=1;j<scores.length;j++)assert.ok(Math.abs(scores[j]-scores[j-1])<=7,scores.join(','));
 assert.ok(s(cfb.cases.I)>=80);assert.ok(s(cfb.cases.T)>s(cfb.cases.U)+20);
});

test('settled CFB live urgency stays separate from the provisional and final game-quality assessment',()=>{
 for(const id of ['401868342','401867861','401856842']){
  const f=helper.read(`CFB-${id}`),final=helper.score(active,f.event,f.summary,'CFB');
  for(const seconds of [120,90,60,30,10,1,0]){
   const e=structuredClone(f.event),s=structuredClone(f.summary),c=e.competitions[0];
   c.status={period:4,displayClock:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`,type:{state:'in',completed:false,detail:'4th Quarter'}};
   c.situation={};s.header.competitions[0]=structuredClone(c);
   const g=helper.score(active,e,s,'CFB');
   assert.equal(g.factors.some(f=>f.label==='Competitive path retained as clock expires'),false);
   if(seconds<=1) {
    assert.equal(g.gameQualitySoFar.provisional,true);
    assert.equal(g.gameQualitySoFar.score,final.score,`${id} observed game-quality assessment`);
    assert.ok(g.score<g.gameQualitySoFar.score,`${id} live urgency is distinct from retrospective quality`);
   }
  }
 }
});

test('Northwestern third-and-19 is constrained by the actual drive tasks, not win probability',()=>{
 const f=helper.read('CFB-401858505'),p=replayCheckpoints(f).checkpoints.find(p=>p.competition.status.period===4&&p.competition.status.displayClock==='2:04');
 assert.equal(p.competition.situation.distance,19);assert.equal(p.competition.situation.yardsToEndzone,80);
 const event=structuredClone(p.event),summary=structuredClone(p.summary);
 event.competitions[0].status.displayClock='2:00';summary.header.competitions[0]=structuredClone(event.competitions[0]);
 const old=helper.score(before,event,summary,'CFB'),now=helper.score(active,event,summary,'CFB');
 assert.ok(old.score>=85);assert.ok(now.score>=45&&now.score<=75);assert.ok(old.score-now.score>=15);
 for(const wp of [undefined,.01,.05]){
  const s=structuredClone(summary);s.winprobability=wp===undefined?[]:[{homeWinPercentage:1-wp}];
  const e=structuredClone(event);e.competitions[0].situation={...e.competitions[0].situation,down:1,distance:10,possessionText:'ORE 20',yardsToEndzone:20};s.header.competitions[0]=structuredClone(e.competitions[0]);
  assert.ok(helper.score(active,e,s,'CFB').score>now.score+10);
 }
 const s=input=>live.evaluate(core,input).score;
 assert.ok(s({...live.cases.C,down:3,distance:19})<s({...live.cases.C,down:3,distance:9})-10);
 assert.ok(s(live.cases.Q)>=90);assert.ok(s(live.cases.R)>=90);
});

test('NHL shootout bonus and completed floor are both actually awarded once',()=>{
 const old=run('NHL','401892616',before),now=run('NHL','401892616');assert.equal(old.score,55);
 assert.ok(now.score>=61);assert.equal(now.factors.filter(f=>f.label==='Shootout finish').length,1);
 assert.equal(now.factors.find(f=>f.label==='Shootout finish').points,9);
 assert.equal(now.factors.some(f=>f.label==='Decisive last play'),false);
 assert.equal(core.clampScore(now.factors.reduce((n,f)=>n+f.points,0)),now.score);
 const f=helper.read('NHL-401892616');f.event.competitions[0].status.type.detail=f.event.competitions[0].status.type.shortDetail='Final';delete f.event.competitions[0].status.period;
 const sparse=helper.score(active,f.event,f.summary,'NHL');assert.ok(sparse.score>=61);assert.equal(sparse.factors.filter(f=>f.label==='Shootout finish').length,1);
});

test('NHL one-goal retention requires a complete competitive late path',()=>{
 for(const id of ['401892618','401892615']){const g=run('NHL',id);assert.ok(g.score>=60&&g.score<=72);assert.ok(g.factors.some(f=>/late competitive path/.test(f.label)));}
 assert.equal(run('NHL','401892614').score,74);
 const f=helper.read('NHL-401892618');f.summary.plays=f.summary.plays.filter(p=>!p.scoringPlay||Number(p.period?.number)===3);
 assert.equal(helper.score(active,f.event,f.summary,'NHL').factors.some(f=>/late competitive path/.test(f.label)),false);
 const wire=nhl.fixture({completed:true,gap:1,plays:[nhl.goal(1,0,1,'1:00'),nhl.goal(2,0,1,'2:00'),nhl.goal(3,0,2,'1:00'),nhl.goal(3,1,3,'19:00'),nhl.goal(3,2,3,'19:59')]});
 assert.equal(helper.score(active,wire.event,wire.summary,'NHL').factors.some(f=>/late competitive path/.test(f.label)),false);
 const pressure=nhl.fixture({completed:true,gap:1,plays:[nhl.goal(1,0,1,'1:00')]});
 pressure.competition.competitors[0].score='1';pressure.competition.competitors[1].score='0';
 assert.ok(helper.score(active,pressure.event,pressure.summary,'NHL').score<60);
 pressure.summary.plays.push(...['17:00','18:00','19:00'].map(clock=>({period:{number:3},clock:{displayValue:clock},team:{id:'a'},homeScore:1,awayScore:0,text:'Shot on goal saved by goalie'})));
 pressure.summary.plays.forEach((p,i)=>p.sequenceNumber=i+1);
 assert.ok(helper.score(active,pressure.event,pressure.summary,'NHL').score>=59);
});

test('all archived NFL, NBA, MLB and other-sport outputs preserve the immediate production baseline',()=>{
 for(const file of fs.readdirSync('test/fixtures/real-games').filter(n=>n.endsWith('.json'))){
  const f=JSON.parse(fs.readFileSync('test/fixtures/real-games/'+file));if(['CFB','NHL'].includes(f.modelSport))continue;
  const a=helper.score(active,f.event,f.summary,f.modelSport),b=helper.score(before,f.event,f.summary,f.modelSport);
  // Presentation facts and evidence metadata now have their own regressions.
  for(const g of [a,b])for(const k of ['modelVersion','completedFacts','moment','momentLabel','sameStateEvidenceRetained','liveInputEvidence','priorObservation','liveUpdateRejected'])delete g[k];
  assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),file);
 }
});

test('browser runtime and Worker agree on final ratings and factors for every reported final',()=>{
 const browser=vm.runInNewContext(fs.readFileSync('dist/scoring-runtime.js','utf8')+';SportsRadarScore');
 for(const [sport,id]of [['CFB','401856842'],['CFB','401868342'],['CFB','401867861'],['NHL','401892618'],['NHL','401892615'],['NHL','401892616'],['NHL','401892614']]){
  const f=helper.read(`${sport}-${id}`),a=run(sport,id),c=f.event.competitions[0];
  const teams=a.teams.map(t=>({name:t[0],abbr:t[1],score:t[2],record:t[5],rank:t[6],id:t[8]}));
  const r=browser.rateGame(sport,'completed',teams,f.event,c,a.context);
  const game={...a,score:r.score,factors:r.factors,upsetPoints:r.upsetPoints,sourceEvent:f.event,sourceCompetition:c};
  const history=browser.momentumImpact(sport,f.summary,1,'completed',{game,finishPoints:0});
  assert.equal(browser.clampScore(r.score+history.points),a.score,`${sport} ${id}`);
 }
});

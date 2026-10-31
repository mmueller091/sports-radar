import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import * as adapter from '../alerts-worker/src/game-model.js';
import * as active from '../alerts-worker/src/live-game-model.js';
const require=createRequire(import.meta.url),runtime=require('../scoring/live-runtime.cjs');
const h=require('../test/helpers/opening-transition.cjs'),nhl=require('../test/helpers/nhl-calibration.cjs');
const original={exports:{}};
vm.runInNewContext(execFileSync('git',['show','c9623643b589a79553785d1c5c9920e011f47dd7:scoring/live-runtime.cjs'],{encoding:'utf8'}),
  {module:original,require:createRequire(new URL('../scoring/live-runtime.cjs',import.meta.url))});
export const before=original.exports;
function rate(sport,options,engine,controlled=true) {
  const event=h.event(sport,options),g=adapter.normalizeEvent(event,sport);
  if(controlled) {
    h.controlledBaseline(g);g.openingScore=53;g.openingFactors=g.pregameBaseline.factors;g.rawPregameScore=53;
  }
  engine.applyLiveSnapshot(g,event.competitions[0],h.summary(event,options));
  return g;
}
const compact=g=>({score:g.score,openingScore:g.openingScore,rawPregameScore:g.rawPregameScore,openingFactors:g.openingFactors,
  factors:g.factors,components:g.live?.components,bonus:g.live?.bonus,history:g.historyOwnership,trajectory:g.trajectoryScoring,
  baselineSource:g.pregameBaseline?.source});
export function comparison() {
  const results=[];
  for(const sport of Object.keys(h.starts)) {
    const early={clock:h.early[sport],...(sport==='MLB'?{situation:{outs:1}}:sport==='Tennis'?{games:[[1],[1]]}:{})};
    const goal={id:'late-goal',period:{number:2},clock:{displayValue:'89'},scoringPlay:true,homeScore:1,awayScore:1,text:'Goal! Late equalizer'};
    const late={...h.late[sport],...(sport==='Soccer'?{plays:[{id:'first',period:{number:1},clock:{displayValue:'20'},scoringPlay:true,homeScore:0,awayScore:1,text:'Goal!'},goal]}:{})};
    for(const [label,options] of [['first-live',{}],['early',early],['late',late]]) {
      const a=rate(sport,options,before),b=rate(sport,options,runtime);
      results.push({sport,label,options,before:compact(a),after:compact(b),delta:b.score-a.score,
        flag:label==='first-live' ? (b.score===53?'corrected opening inflation':'UNEXPECTED opening mismatch') :
          Math.abs(b.score-a.score)>=5 ? 'REVIEW movement of 5+' : ''});
    }
  }
  const lateNhl=Object.entries(nhl.cases).map(([label,options])=>{
    const score=engine=>{const i=nhl.fixture(options),g=adapter.normalizeEvent(i.event,'NHL');engine.applyLiveSnapshot(g,i.competition,i.summary);return compact(g);};
    const a=score(before),b=score(runtime);return {label,before:a,after:b,delta:b.score-a.score};
  });
  // Complete archived outputs retain their existing scoring. The shared legacy
  // adapter remains the capture oracle; only the active facade selects this policy.
  let completed=0,football=0;
  for(const file of fs.readdirSync('test/fixtures/real-games').filter(f=>f.endsWith('.json'))) {
    const f=JSON.parse(fs.readFileSync('test/fixtures/real-games/'+file)),a=adapter.normalizeEvent(structuredClone(f.event),f.modelSport),b=active.normalizeEvent(structuredClone(f.event),f.modelSport);
    if(a.state==='completed') {adapter.enrichGame(a,structuredClone(f.summary));active.enrichGame(b,structuredClone(f.summary));assert.equal(b.score,a.score,file);assert.deepEqual(b.factors,a.factors,file);completed++;}
  }
  for(const sport of ['NFL','CFB']) for(const spread of [null,0,26.5])for(const [period,clock] of [[1,'15:00'],[1,'13:00'],[2,'0:00'],[4,'1:00'],[5,'5:00']])for(const scores of [[0,0],[7,0],[24,21]])for(const wp of [null,.5,.98]) {
    const helper=require('../test/helpers/football-transition.cjs');
    const evaluate=engine=>{const e=helper.event(spread,{period,clock,scores}),g=adapter.normalizeEvent(e,sport);engine.applyLiveSnapshot(g,e.competitions[0],h.summary(e,{wp}));return compact(g);};
    const a=JSON.parse(JSON.stringify(evaluate(runtime))),b=JSON.parse(JSON.stringify(evaluate(before)));delete a.trajectory.policyId;delete b.trajectory.policyId;
    assert.deepEqual(a,b,`${sport} ${spread} ${period} ${clock}`);football++;
  }
  return {model:runtime.MODEL_VERSION,comparisonCommit:'c9623643b589a79553785d1c5c9920e011f47dd7',controlledOpening:53,results,lateNhl,completedUnchanged:completed,footballUnchanged:football};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/opening-transition-report.mjs')) {
  const data=comparison();fs.writeFileSync('calibration/output/opening-transition-20261031.json',JSON.stringify(data,null,2)+'\n');
  const rows=Object.keys(h.starts).map(sport=>{
    const get=label=>data.results.find(r=>r.sport===sport && r.label===label),pair=r=>`${r.before.score} → ${r.after.score}`;
    return `| ${sport} | 53 | ${pair(get('first-live'))} | ${pair(get('early'))} | ${pair(get('late'))} |`;
  });
  console.log(['| Sport | Opening | First live: before → after | Early: before → after | Late: before → after |','| --- | ---: | ---: | ---: | ---: |',...rows].join('\n'));
  console.log(`Completed unchanged: ${data.completedUnchanged}; football unchanged: ${data.footballUnchanged}`);
}

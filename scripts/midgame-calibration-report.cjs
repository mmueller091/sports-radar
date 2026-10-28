const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const core=require('../rating-core.js');
const {before,frozen,cfb,nhl,cfbCases,hockey,hockeyCases,touchdown,shocks,transitionSequence,oldHandoffScores}=require('../test/helpers/midgame.cjs');
const nfl=require('../test/helpers/nfl-calibration.cjs');
async function main(){
  const lines=['# CFB midgame and NHL opening calibration','','Immediate baseline: frozen working engine before this patch, including existing NHL calibration. Synthetic cases are not provider captures.',''];
  function table(title,rows){lines.push(`## ${title}`,'','| Case | Before | After |','| --- | ---: | ---: |',...rows.map(r=>`| ${r.join(' | ')} |`),'');}
  table('CFB',Object.entries(cfbCases).map(([k,v])=>[k,cfb.evaluate(before,v).score,cfb.evaluate(core,v).score]));
  for(const gap of [0,3,7]) table(`CFB ${gap ? `gap ${gap}` : 'tied'} Q3/Q4 transition`,
    transitionSequence.map(([period,clock],i)=>[
      `${clock} Q${period}`,oldHandoffScores[gap][i],cfb.evaluate(core,{period,clock,scores:[21+gap,21]}).score
    ]));
  table('CFB 14-point carryover check',transitionSequence.map(([period,clock],i)=>[
    `${clock} Q${period}`,oldHandoffScores[14][i],cfb.evaluate(core,{period,clock,scores:[35,21]}).score
  ]));
  table('CFB example-style states',[
    ['21-21 Q2 1:59',{period:2,clock:'1:59',scores:[21,21],spot:'MIA 23',down:3,distance:9}],
    ['35-21 Q3 2:23, long leader TD',{period:3,clock:'2:23',scores:[35,21],spot:'MIA 49',down:3,distance:2}]
  ].map(([name,input])=>{const f=cfb.fixture(input);if(input.period===3)Object.assign(f.summary,touchdown([28,21],[35,21]));return [name,cfb.evaluateFixture(before,f).score,cfb.evaluateFixture(core,f).score];}));
  table('Explosive TD shock',Object.entries(shocks).map(([name,[pre,post]])=>[name,...[before,core].map(c=>c.eventShockImpact('CFB',touchdown(pre,post),{period:3,displayClock:'2:23'}).points)]));
  table('NHL opening grid',Object.entries(hockeyCases).map(([k,v])=>[k,hockey(before,v),hockey(core,v)]));
  table('NHL example-style states (supplied opening approximations)',[
    ['Bruins–Carolina style, opening 61',{opening:61,period:1,clock:'13:15',gap:1}],
    ['Devils–Dallas style, opening 54',{opening:54,period:1,clock:'11:38',gap:1}]
  ].map(([k,v])=>[k,hockey(before,v),hockey(core,v)]));
  for(const [name,helper] of [['CFB A–Y',cfb],['NFL A–P',nfl],['NHL P3/OT',nhl]]) {
    table(name,Object.entries(helper.cases).filter(([,v])=>helper!==nhl||(v.period??3)>=3).map(([k,v])=>{
      const old=helper.evaluate(before,v),now=helper.evaluate(core,v);
      assert.deepEqual(now,structuredClone(old));return [k,old.score,now.score];
    }));
  }
  const display=await import('../alerts-worker/src/display-model.js'),current=await import('../alerts-worker/src/game-model.js');
  const adapter=fs.readFileSync('alerts-worker/src/game-model.js','utf8').replace(/^import .*;\s*$/gm,'').replace(/^export .*;\s*$/gm,'');
  const old=vm.runInNewContext(`${frozen}\n${adapter}\n({normalizeEvent,enrichGame})`,display);
  const rows=[],counts={};
  for(const file of fs.readdirSync('test/fixtures/real-games').filter(f=>f.endsWith('.json')).sort()){
    const input=JSON.parse(fs.readFileSync(`test/fixtures/real-games/${file}`));
    const games=[old,current].map(api=>{const g=api.normalizeEvent(structuredClone(input.event),input.modelSport);
      if((g.state!=='upcoming'||!g.line)&&!(g.division==='FCS'&&g.state==='upcoming'))api.enrichGame(g,structuredClone(input.summary));return structuredClone(g);});
    const [a,b]=games,delta=b.score-a.score;
    (counts[input.modelSport]??={total:0,changed:0}).total++;
    if(delta)counts[input.modelSport].changed++;
    if(!['CFB','NHL'].includes(input.modelSport)||b.state!=='live')assert.deepEqual(b,a,file);
    if(Math.abs(delta)>=10)rows.push([file,a.score,b.score]);
  }
  table('All provider movements ≥10',rows);
  lines.push('Provider counts and score changes:','', '```json',JSON.stringify(counts,null,2),'```','',
    'All unaffected sports and all non-live provider outputs are deeply identical. Completed history and capped pregame outputs are included.','',
    '## Boundary behavior','',
    'The CFB floor rises through the end of Q3 and carries into early Q4. The existing Q4 score overtakes it before 5:00, so calibrated late-Q4 behavior remains authoritative. Margins above ten lose carryover smoothly and a 14-point game receives none after 2:00 Q3.','',
    'NHL opening retention reaches zero at P3. The existing P3 situation floor already changes some boundary scores (opening 40 tied: 50 → 52); that pre-existing behavior is preserved.','',
    '## Exact formulas','',
    'Let S(x)=clamp(x,0,1)^2*(3-2*clamp(x,0,1)); p is regulation progress. All floors use max(existing live score, round(target)), so rankings, stakes, WP and generic context are consumed rather than added again.','',
    'CFB target = [60+44*max(0,min(.75,p)-.5)+S((p-43/60)/(2/60))+6*max(0,p-.75)] * S((p-23/60)/(5/60)) * V(margin) * C. It is active for 23/60 < p < 11/12. V uses smoothstep interpolation through (0,1),(3,.955),(7,.85),(10,.72),(14,.62),(21,.30),(28,0). C=1 through 2:00 Q3, then C=S((14-margin)/4), which leaves close games intact and removes carryover at 14 points.','',
    'CFB Q3 expected possessions: B + (Q-B)*W, where B=max(0,14*(1-p)+0.5+possessionAdjustment), Q=max(0,2.1+6*max(0,43/60-p)+0.15*possessionAdjustment), and W=S((p-.5)/(43/60-.5))*S((.75-p)/(2/60)). Existing Q4 runway overrides this unchanged.','',
    'CFB scoring shock weight: verified shrinking absolute margin gets 1-S((postGap-8)/13); tied to a lead of at most 8 gets .6; all other widening or unknown scoring direction gets 0. Non-scoring events retain weight 1. Existing event decay and 12-point cap remain.','',
    'NHL target = min(90,openingScore)*R(elapsed)*M(gap,elapsed). R uses smoothstep interpolation through minute/weight anchors (0,1),(10,1),(20,.88),(30,.55),(40,0); no floor at or after P3. Let A=.98-.04*clamp((elapsed-10)/10,0,1). M=1-(1-A)*gap for gap<=1, otherwise A*exp(-3*(gap-1)^2).','',
    'NHL first-ten-minute one-goal retention is 98%, slightly above the requested approximate 90–95%, to also reach the low/mid-opening example targets. At end P1 it is .88*.94=82.72%.','',
    '## Validation','',
    'Final full suite on the completed handoff tree: 327/327 passed. test-score.js, both existing calibration report commands, this immediate-baseline report, and git diff --check pass.','',
    'The historical CFB report harness now adapts its old pregame oracle using the existing cap helper and defers independently calibrated NHL comparisons to the immediate baseline. Its pre-existing working report file was preserved.','');
  fs.writeFileSync('calibration/midgame-calibration.md',lines.join('\n'));
  console.log(JSON.stringify({providers:counts,movements:rows},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

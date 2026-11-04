// Hypothetical simulations only. This report is not archived provider evidence.
import fs from 'node:fs';
import {Module} from 'node:module';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import * as active from '../../alerts-worker/src/live-game-model.js';
import {scenario,evaluate} from '../../test/helpers/live-underdog-scenarios.mjs';
const source=JSON.parse(fs.readFileSync(new URL('../../calibration/output/live-underdog-20261103.json',import.meta.url)));
const filename=new URL('../../test/fixtures/live-underdog-before.cjs.gz',import.meta.url).pathname;
const frozen=new Module(filename);
frozen._compile(gunzipSync(fs.readFileSync(new URL('../../test/fixtures/live-underdog-before.cjs.gz',import.meta.url))).toString(),filename);
const detail=g=>({score:g.score,baseScore:g.baseScore,upset:g.upsetPoints||0,liveBonus:g.live?.bonus,live:g.live,
  evidence:g.evidenceQuality,scoringPartial:g.scoringPartial,timingUncertain:g.timingUncertain,
  factors:g.factors,history:g.historyOwnership,evidenceReasons:g.evidenceReasons,context:g.liveUpset||g.liveSurprise,footballSituation:g.footballSituation});
const rows=source.scenarios.filter(r=>r.crossings.some(c=>c.direction==='up'&&c.threshold>=85)).map(row=>{
  const input=scenario({...row,halftime:row.phase==='halftime'});
  const before=detail(evaluate(frozen.exports,input)),after=detail(evaluate(active,input));
  assert.equal(before.score,row.before);assert.equal(after.score,row.after);
  return {...row,beforeDetail:before,afterDetail:after};
});
const controls=[];
for(const sport of ['NCAAB','NBA'])for(const margin of [-14,-7,-3,-1,0])for(const possession of ['dog','unknown','fav']){
  const input=scenario({sport,margin,possession,clock:'0:02'});
  controls.push({kind:'hypothetical control',sport,margin,possession,clock:'0:02',before:detail(evaluate(frozen.exports,input)),after:detail(evaluate(active,input))});
}
const perSport=Object.fromEntries(['NCAAB','NBA','NFL','CFB'].map(sport=>{
  const all=source.scenarios.filter(r=>r.sport===sport);
  return [sport,{scenarios:all.length,changed:all.filter(r=>r.delta!==0).length,material:all.filter(r=>Math.abs(r.delta)>=3).length,
    minDelta:Math.min(...all.map(r=>r.delta)),maxDelta:Math.max(...all.map(r=>r.delta)),
    new85:all.filter(r=>r.before<85&&r.after>=85).length,new90:all.filter(r=>r.before<90&&r.after>=90).length,
    downward85:all.filter(r=>r.before>=85&&r.after<85).length,downward90:all.filter(r=>r.before>=90&&r.after<90).length}];
}));
const report={kind:'controlled simulations; not historical evidence or notification events',perSport,rows,controls};
fs.writeFileSync(new URL('controlled-crossings.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
const materialRows=source.scenarios.filter(r=>Math.abs(r.delta)>=3);
const newlyHighRows=source.scenarios.filter(r=>r.crossings.some(c=>c.direction==='up'&&c.threshold>=85));
const combinedRows=source.scenarios.filter(r=>Math.abs(r.delta)>=3||r.crossings.some(c=>c.direction==='up'&&c.threshold>=85));
const ledger={kind:'controlled simulations only; not historical provider observations, games, or notification events',
  sourceReport:'calibration/output/live-underdog-20261103.json',sourceCommit:'712f221',
  baselineModel:source.baselineModel,candidateModel:source.model,
  materialDefinition:'Absolute total score change of at least 3 points',
  counts:{materialRows:materialRows.length,new85Or90Rows:newlyHighRows.length,combinedUniqueRows:combinedRows.length,
    overlapRows:materialRows.length+newlyHighRows.length-combinedRows.length},materialRows,newlyHighRows};
fs.writeFileSync(new URL('controlled-material-changes.json',import.meta.url),JSON.stringify(ledger,null,2)+'\n');
const columns=['kind','sport','phase','period','clock','spread','margin','market','wp','possession','timeouts','before','after','delta','upsetBefore','upsetAfter','crossings'];
const csv=value=>`"${String(value??'').replaceAll('"','""')}"`;
fs.writeFileSync(new URL('controlled-material-changes.csv',import.meta.url),columns.join(',')+'\n'+combinedRows.map(r=>columns.map(k=>csv(k==='crossings'?r.crossings.map(c=>`${c.direction} ${c.threshold}`).join('; '):r[k])).join(',')).join('\n')+'\n');
console.log(JSON.stringify({perSport,rows:rows.map(r=>({sport:r.sport,phase:r.phase,clock:r.clock,spread:r.spread,margin:r.margin,
  before:r.before,after:r.after,upsetBefore:r.upsetBefore,upsetAfter:r.upsetAfter,possession:r.possession,timeouts:r.timeouts,
  factors:r.afterDetail.factors,context:r.afterDetail.context,evidence:r.afterDetail.evidence,scoringPartial:r.afterDetail.scoringPartial})),
  controls:controls.map(r=>({sport:r.sport,margin:r.margin,possession:r.possession,before:r.before.score,after:r.after.score,upset:r.after.upset}))},null,2));

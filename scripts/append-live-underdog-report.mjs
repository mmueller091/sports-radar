// Merge independently scored supplemental captures into an existing full run.
// A fresh live-underdog-report.mjs run already includes these same captures.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const destination=path.join(root,'calibration/output/live-underdog-20261103.json');
const output=JSON.parse(fs.readFileSync(destination,'utf8'));
const supplement=JSON.parse(fs.readFileSync(path.resolve(root,process.argv[2]||'work/nba-underdog-supplement.json'),'utf8'));
const hash=file=>createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
for(const p of [...output.provenance,...supplement.provenance])if(hash(p.file)!==p.sha256)throw Error(`Changed archive: ${p.file}`);
if(supplement.baselineCommit&&supplement.baselineCommit!==output.baselineCommit)throw Error('Baseline mismatch');
if(supplement.model&&supplement.model!==output.model)throw Error('Candidate model mismatch');
const priorGames=new Set(output.histories.map(r=>`${r.sport}:${r.id}`));
const included=supplement.histories.every(r=>priorGames.has(`${r.sport}:${r.id}`));
if(included&&!process.argv.includes('--render-only')){console.log('Supplement already present.');process.exit(0);}
if(!included&&supplement.histories.some(r=>priorGames.has(`${r.sport}:${r.id}`)))throw Error('Partially duplicated supplement');
const compact=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['beforeDetail','afterDetail'].includes(k)));
const key=r=>`${r.kind}:${r.sport}:${r.id}:${r.playId||''}:${r.period}:${r.clock}`;
const oldFlags=new Map(output.historicalFlags.map(r=>[key(r),r]));
const newRows=[...supplement.replayRows,...supplement.capturedStates];
if(!included){
 output.histories.push(...supplement.histories);
 output.replayRows.push(...supplement.replayRows);
 output.capturedStates.push(...supplement.capturedStates);
 for(const r of newRows){
 if(r.openingBefore!==r.openingAfter)output.openingChanges.push(compact(r));
 if(r.state!=='live'&&(r.delta||JSON.stringify(r.beforeDetail.factors)!==JSON.stringify(r.afterDetail.factors)))output.nonliveChanges.push(compact(r));
 }
}
output.provenance=[...new Map([...output.provenance,...supplement.provenance].map(p=>[p.file,p])).values()];
const all=[...output.replayRows,...output.capturedStates].map(r=>oldFlags.get(key(r))||r);
output.historicalFlags=all.filter(r=>r.material||r.crossings.length);
output.new85=all.filter(r=>Number.isFinite(r.before)&&Number.isFinite(r.after)&&r.before<85&&r.after>=85);
output.statistics=Object.fromEntries(['NCAAB','NBA','NFL','CFB'].map(sport=>{
 const rows=output.replayRows.filter(r=>r.sport===sport),finite=rows.filter(r=>Number.isFinite(r.before)&&Number.isFinite(r.after));
 return [sport,{games:output.histories.filter(h=>h.sport===sport).length,checkpoints:rows.length,rated:finite.length,
  changed:finite.filter(r=>r.delta).length,material:finite.filter(r=>r.material).length,
  up:finite.filter(r=>r.delta>0).length,down:finite.filter(r=>r.delta<0).length,
  meanDelta:finite.reduce((s,r)=>s+r.delta,0)/(finite.length||1),
  minDelta:finite.length?Math.min(...finite.map(r=>r.delta)):0,maxDelta:finite.length?Math.max(...finite.map(r=>r.delta)):0,
  crossings:Object.fromEntries([75,85,90].map(t=>[t,{up:finite.filter(r=>r.before<t&&r.after>=t).length,down:finite.filter(r=>r.before>=t&&r.after<t).length}]))}];
}));
output.replayRows=output.replayRows.map(compact);output.capturedStates=output.capturedStates.map(compact);
fs.writeFileSync(destination,JSON.stringify(output,null,2)+'\n');
const csv=value=>`"${String(value??'').replaceAll('"','""')}"`;
const columns=['kind','sport','id','matchup','playId','period','clock','scores','underdogMargin','before','after','delta','upsetBefore','upsetAfter','crossings'];
fs.writeFileSync(path.join(root,'calibration/output/live-underdog-material-changes-20261103.csv'),
 columns.join(',')+'\n'+output.historicalFlags.map(r=>columns.map(k=>csv(k==='crossings'?r.crossings.map(c=>`${c.direction} ${c.threshold}`).join('; ')
  :k==='scores'?r.scores.map(t=>`${t.name} ${t.score}`).join(' / '):k==='matchup'?r.matchup||r.scores?.map(t=>t.name).join(' at '):k==='underdogMargin'?r.afterDetail.context?.margin:r[k])).join(',')).join('\n')+'\n');
const markdownPath=path.join(root,'calibration/live-underdog-evidence-20261103.md');
let markdown=fs.readFileSync(markdownPath,'utf8');
const table=rows=>rows.map(r=>`| ${r.sport} | ${r.label||r.matchup||r.scores?.map(t=>t.name).join(' at ')||r.id} | ${r.period} / ${r.clock} | ${r.before} | ${r.after} | ${r.delta>0?'+':''}${r.delta} | ${r.upsetBefore} / ${r.upsetAfter} |`).join('\n');
const summary=`## Historical reconstruction summary\n\n| Sport | Games | Checkpoints | Changed | Material | Mean delta | Min / max delta | New 85+ crossings |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${Object.entries(output.statistics).map(([s,r])=>`| ${s} | ${r.games} | ${r.checkpoints} | ${r.changed} | ${r.material} | ${r.meanDelta.toFixed(3)} | ${r.minDelta} / ${r.maxDelta} | ${r.crossings[85].up} |`).join('\n')}\n\n${output.nonliveChanges.length} nonlive score/factor changes; ${output.openingChanges.length} opening-baseline changes; ${output.otherSportChanges.length} other-sport score/factor changes in captured end states.\n\n`;
markdown=markdown.replace(/## Historical reconstruction summary[\s\S]*?(?=## Controlled simulations)/,summary);
const withheld=output.replayRows.filter(r=>!Number.isFinite(r.before)||!Number.isFinite(r.after));
markdown=markdown.replace('## Controlled simulations',`${output.replayRows.length-withheld.length} checkpoints receive finite ratings in both engines; ${withheld.length} are withheld by both at an unconfirmed 0:00 basketball transition. This is existing timing-integrity protection, not a new scoring failure.\n\nNBA's original October 20 captures have small 1.5/4.5-point lines. Targeted archived Minnesota–San Antonio (+12.5, available through Q3) and New Orleans–Memphis (+5.5, through overtime) strengthen coverage without inventing later states.\n\n## Controlled simulations`);
const high=`## Every new historical 85+ crossing\n\n${output.new85.length?`| Sport | Game | Period / clock | Before | After | Delta | Upset before / after |\n|---|---|---|---:|---:|---:|---:|\n${table(output.new85)}`:'None.'}\n\n`;
markdown=markdown.replace(/## Every new historical 85\+ crossing[\s\S]*?(?=These are rerated archived states)/,high);
markdown=markdown.replace('These are rerated archived states',`The seven new NCAAM 85+ states are early-to-middle second-half tournament situations: one or two upset points lift existing 83/84 ratings. They need a watchability review; this replay cannot classify them as unequivocally true or false alerts. Seven of the ten CFB new 85+ states have partial evidence (five Kentucky–Oklahoma, two Oklahoma State–Iowa State), which warrants additional caution. These 17 states span five games; they are not 17 delivered notifications.\n\nThese are rerated archived states`);
fs.writeFileSync(markdownPath,markdown);
console.log(JSON.stringify({statistics:output.statistics,historicalFlags:output.historicalFlags.length,new85:output.new85.length,
 nonliveChanges:output.nonliveChanges.length,openingChanges:output.openingChanges.length,otherSportChanges:output.otherSportChanges.length},null,2));

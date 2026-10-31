import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {replayPublicGame,correctionReplay} from '../calibration/nhl-public-replay.mjs';
const fixtureDir=new URL('../test/fixtures/nhl-public/',import.meta.url);
const fixtures=readdirSync(fixtureDir).filter(f=>/^\d{10}\.json$/.test(f)).map(file=>JSON.parse(readFileSync(new URL(file,fixtureDir))));
const games=fixtures.map(replayPublicGame);
const rows=games.flatMap(g=>g.history);
const filters={lateOneGoal:r=>r.period===3&&r.elapsed>=3300&&r.gap===1,tied:r=>r.gap===0,blowouts:r=>r.gap>=3,
  powerPlays:r=>['1451','1541','1351','1531'].includes(r.manpower),emptyNets:r=>/^[0]|0$/.test(r.manpower),overtime:r=>r.period>3};
const categories=Object.fromEntries(Object.entries(filters).map(([label,filter])=>{
  const sample=rows.filter(r=>!r.final && filter(r));
  return [label,{checkpoints:sample.length,changed:sample.filter(r=>r.delta).length,
    minDelta:Math.min(...sample.map(r=>r.delta)),maxDelta:Math.max(...sample.map(r=>r.delta)),
    meanDelta:sample.reduce((sum,r)=>sum+r.delta,0)/sample.length,maxPressure:Math.max(...sample.map(r=>r.pressure || 0))}];
}));
const output={model:'NHL advanced pressure review v1',enabledInProduction:false,pressureCap:4,
  provenance:'Corrected final NHL public PBP replayed as chronological prefixes. Ratings reconstructed with current production policy; no recorded historical rating observations or historical market/roster context claimed.',
  summary:{games:games.length,checkpoints:rows.length,changed:rows.filter(r=>r.delta).length,
    minDelta:Math.min(...rows.map(r=>r.delta)),maxDelta:Math.max(...rows.map(r=>r.delta)),
    meanDelta:rows.reduce((s,r)=>s+r.delta,0)/rows.length,
    changedHistoryPoints:rows.filter(r=>r.oldHistory!==r.newHistory).length},categories,
  corrections:correctionReplay(fixtures.find(f=>f.id===2023030417)),games};
mkdirSync('calibration/output',{recursive:true});
writeFileSync('calibration/output/nhl-pressure-comparison.json',JSON.stringify(output,null,2)+'\n');
const table=['| Game | Score | Frames changed | Delta range | Peak old / experiment | Final old / experiment |',
  '| --- | --- | ---: | --- | --- | --- |',...games.map(g=>`| ${g.date} ${g.matchup} (${g.gameId}) | ${g.finalScore} | ${g.changed}/${g.checkpoints} | ${g.minDelta} to +${g.maxDelta} | ${g.oldPeak} / ${g.experimentalPeak} | ${g.oldFinal} / ${g.experimentalFinal} |`)];
const categoryTable=['| Situation (overlapping groups, live only) | Frames changed | Delta range | Mean delta | Maximum pressure |',
  '| --- | ---: | --- | ---: | ---: |',...Object.entries(categories).map(([name,c])=>`| ${name} | ${c.changed}/${c.checkpoints} | ${c.minDelta} to +${c.maxDelta} | ${c.meanDelta.toFixed(3)} | ${c.maxPressure} |`)];
const correctionTable=['| Injected snapshot | Old | Experimental | Difference | Pressure |',
  '| --- | ---: | ---: | ---: | ---: |',...output.corrections.history.map(r=>`| ${r.snapshot} | ${r.old} | ${r.experimental} | ${r.delta} | ${r.pressure} |`)];
writeFileSync('calibration/nhl-pressure-results.md',`# NHL pressure replay comparison\n\nProduction experiment disabled. No scoring changes published.\n\n${output.provenance}\n\n${table.join('\n')}\n\n${JSON.stringify(output.summary)}\n\n${categoryTable.join('\n')}\n\nDelayed and corrected delivery is a controlled injected sequence on 2024 Final Game 7 event ${output.corrections.eventId}, not an observed historical arrival log. Every snapshot is rebuilt; no accumulated duplicate attempts.\n\n${correctionTable.join('\n')}\n\nFull event-by-event ratings, pressure components, targets, and history points: [comparison JSON](output/nhl-pressure-comparison.json). Counts describe event checkpoints, not equal intervals of wall time.\n`);
console.log(JSON.stringify(output.summary));console.log(table.join('\n'));

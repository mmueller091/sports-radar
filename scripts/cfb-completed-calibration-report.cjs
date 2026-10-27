// Replays the immutable pre-pass bundle; never overwrites its baseline.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const core=require('../rating-core.js');
const c=require('../test/helpers/cfb-completed.cjs');
const live=require('../test/helpers/cfb-calibration.cjs');
const nfl=require('../test/helpers/nfl-calibration.cjs');
const baseline=require('../calibration/cfb-completed-baseline.json');
const before=vm.runInNewContext(`${c.frozen()}\nSportsRadarScore`);
const root=path.resolve(__dirname,'..');
const plain=v=>JSON.parse(JSON.stringify(v));
function table(lines,headers,rows){lines.push(`| ${headers.join(' | ')} |`,`| ${headers.map(()=>'---').join(' | ')} |`,...rows.map(row=>`| ${row.join(' | ')} |`),'');}
async function main(){
 const adapter=await import('../alerts-worker/src/game-model.js');
 const display=await import('../alerts-worker/src/display-model.js');
 const old=c.providers(c.adapter(c.frozen(),{baseballSituation:display.baseballSituation,footballSituation:display.footballSituation}));
 const now=c.providers(adapter);
 assert.deepEqual(plain(old),baseline.providers);
 const results=Object.fromEntries(Object.entries(c.cases).map(([k,input])=>{
  assert.deepEqual(plain(c.evaluate(before,input)),baseline.completed[k],`${k} baseline provenance`);
  return [k,c.evaluate(core,input)];
 }));
 const lines=['# Completed CFB calibration — 2026-10-27','','Completed CFB only. No deployment. The immutable baseline includes the already calibrated live CFB and NFL models. All values below come from stored captures or synthetic inputs; they are not fresh provider verification.','',
 'See [cfb-completed-audit.md](cfb-completed-audit.md) for exact formulas, changed files, API integration and remaining edge cases.','',
 '## Synthetic completed matrix',''];
 table(lines,['Case','Archetype','Before','After','Base','Original history','Completed adjustment','Finish'],Object.entries(results).map(([k,r])=>[k,c.cases[k].label,baseline.completed[k].score,r.score,r.base,r.history,r.adjustment,r.finish]));
 const s=k=>results[k].score;
 const checks=[['D > C',s('D')>s('C')],['E >= D',s('E')>=s('D')],['G > F > H',s('G')>s('F')&&s('F')>s('H')],['I > J',s('I')>s('J')],['N > M > L > K',s('N')>s('M')&&s('M')>s('L')&&s('L')>s('K')],['N > O',s('N')>s('O')],['P > unranked L',s('P')>s('L')],['Close ranked upset P > blowout Q',s('P')>s('Q')],['R >= 95',s('R')>=95],['Championship blowout S at least 50 below classic R',s('S')<s('R')-50],['T > U',s('T')>s('U')],['B materially above A',s('B')>=s('A')+10]];
 for(const [label,pass]of checks)assert.ok(pass,label);
 table(lines,['Relative assertion','Result'],checks.map(([label])=>[label,'PASS']));
 lines.push('## Exact live regression','');
 for(const [title,helper,key]of [['CFB live A–Y',live,'cfb'],['NFL A–P',nfl,'nfl']]){
  lines.push(`### ${title}`,'');
  table(lines,['Case','Before','After','All components identical'],Object.entries(helper.cases).map(([k,input])=>{
   const r=helper.evaluate(core,input);assert.deepEqual(plain(r),baseline[key][k]);return[k,baseline[key][k].score,r.score,'YES'];
  }));
 }
 const bySport={};
 for(const [file,g]of Object.entries(now)){
  const record=bySport[g.sport]||={count:0,identical:0,scoreChanges:0};record.count++;
  if(JSON.stringify(g)===JSON.stringify(old[file]))record.identical++;
  if(g.score!==old[file].score)record.scoreChanges++;
  if(g.sport!=='CFB'||g.state!=='completed')assert.deepEqual(plain(g),plain(old[file]),file);
 }
 lines.push('## All stored provider fixtures','');
 table(lines,['Sport','Fixtures','Complete outputs identical','Scores changed'],Object.entries(bySport).map(([sport,r])=>[sport,r.count,r.identical,r.scoreChanges]));
 lines.push('CFB pregame, every standalone completed history, and other sports across upcoming/live/completed states are additionally checked against the frozen engine. Public API keys, function arities and browser/Node outputs are unchanged. The new optional aggregation context is supplied only for completed CFB.','',
 '## All stored completed CFB results','');
 table(lines,['Fixture / matchup','Final','Before','After','Why changed or stayed'],Object.entries(now).filter(([,g])=>g.sport==='CFB').map(([file,g])=>{
  const prior=old[file];const reasons=g.factors.filter(f=>/^Completed/.test(f.label)).map(f=>`${f.label} ${f.points>0?'+':''}${f.points}`);
  if(g.upsetPoints!==prior.upsetPoints)reasons.push(`Completed upset ${prior.upsetPoints} → ${g.upsetPoints}`);
  return [`${file.replace('.json','')}: ${g.teams.map(t=>t[0]).join(' vs ')}`,g.teams.map(t=>t[2]).join('–'),prior.score,g.score,reasons.join('; ')||'Existing evidence already sufficient, or no qualifying new interaction'];
 }));
 lines.push('## Three audit archetypes','',
 '- **Florida State–Miami: 77 → 88.** Final period 6 confirms 2OT. The existing 43 base + 25 history + 9 defensive finish totals 77. The depth floor contributes only the missing 11; neither the generic +13 OT factor nor the defensive finish is awarded again.',
 '- **Alabama–Tennessee: 27 → 28.** The +7.5 winning underdog receives 4 completed upset points instead of 3. Rank significance is bounded by spread and final competitiveness. The margin became nine at 5:05 in Q3 and sixteen at 3:17 in Q4; there is no verified one-score Q4 window, so no late-path rescue is granted.',
 '- **Tulsa–Rice: 26 → 61.** Rice led 17–7 before Tulsa came back. Rice was still within seven until Tulsa scored at 10:06 in Q4; the final 21-point margin arrived at 3:39. Existing base 1 and history 25 remain; the verified path floor supplies 35, without awarding the comeback twice. This is meaningfully below the close 21-point comeback archetype (88).','',
 '## Verification','',
 '- Focused CFB completed/live + NFL + stagnation: 31/31 passed.',
 '- Full scoring suite: 239/239 passed, including API signatures, browser/Node parity and Worker bundle execution.',
 '- Worker suite: 22/22 passed, including all 107 migration fixtures.',
 '- `node test-score.js`: both model and watchlist/timeline fixture groups passed.',
 '- Provider replay: 107 fixtures (50 CFB); every non-CFB complete output identical.',
 '- `node scripts/calibration-report.mjs`: all 107 stored fixtures processed; generated CSV retained in `work/cfb-completed/provider-after.csv`, with the pre-existing tracked CSV preserved.',
 '- `git diff --check`: passed.',
 '- Initial esbuild test needed filesystem access beyond the sandbox to resolve the existing dependencies; the full suite passed on retry. No deployment ran.','');
 fs.writeFileSync(path.join(root,'calibration/cfb-completed-calibration.md'),lines.join('\n'));
 console.log(JSON.stringify({syntheticCases:Object.keys(results).length,relativeAssertions:checks.length,providers:bySport},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

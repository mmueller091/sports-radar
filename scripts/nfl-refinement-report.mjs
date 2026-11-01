import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {normalizeEvent,applyContextsToGame} from '../alerts-worker/src/live-game-model.js';
import {nflPregameContext} from '../alerts-worker/src/nfl-pregame.js';
import runtime from '../scoring/live-runtime.cjs';
export const refinementData=()=>JSON.parse(gunzipSync(fs.readFileSync('test/fixtures/nfl-pregame/refinement-20261101.json.gz')));
export function refinementGames(data=refinementData()) {
  const opposition=Object.values(data.summaries).flatMap(s=>s.standings?.groups || []).flatMap(g=>g.standings?.entries || []);
  return data.events.map(event=>{const g=normalizeEvent(structuredClone(event),'NFL');
    applyContextsToGame(g,nflPregameContext(g,data.summaries[g.id],g.teams.flatMap(t=>data.teamNews[t[8]]?.articles || []),opposition,Date.parse(data.capturedAt)));return g;});
}
export function refinementReport() {
  const data=refinementData(),games=refinementGames(data);
  return {model:runtime.MODEL_VERSION,baselineModel:data.baselineModel,baselineCommit:data.baselineCommit,capturedAt:data.capturedAt,
    basis:'Captured production ratings and current November 1 markets; cached source summaries/team news reused without additional requests.',
    methodology:{interaction:'3 × smoothstep((7 − |spread|)/4) × smoothstep((total − 46)/8), with clamped inputs. Spread and total contributions remain separate and occur once.',
      losingRecords:'Smooth percentage-based severity, capped at seven, includes bounded point-differential relief. Complementary point-differential weights prevent reuse; recent form remains separate. Extremely low win percentages retain a smooth severe-team floor.',
      winningContinuity:'Superseded by the competitiveness correction: the fourteen-point ceiling requires both records to contribute through a smooth weaker-record gate. Single-winning-team interest is capped at two before market scaling; missing-market duplicate record/race awards are omitted.',
      returns:'Identified, source-linked NFL MVP/All-Pro starting QB: five; verified established star or starting QB: three; regular player: two; unknown significance: one; unverified/irrelevant news: zero. Total positive story budget remains six.'},
    rows:games.map(g=>{const old=data.baselineGames.find(b=>b.id===g.id);
      return {id:g.id,matchup:data.events.find(e=>e.id===g.id).shortName,before:old.score,after:g.score,delta:g.score-old.score,line:g.line,
        components:Object.fromEntries([...new Set([...old.factors,...g.factors].map(f=>f.label))].map(label=>{
          const before=old.factors.filter(f=>f.label===label).reduce((n,f)=>n+f.points,0),after=g.factors.filter(f=>f.label===label).reduce((n,f)=>n+f.points,0);
          return [label,{before,after,delta:Number((after-before).toFixed(2))}];})),factors:g.factors,stories:g.qualitativeContexts};})};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/nfl-refinement-report.mjs')) {
  const report=refinementReport();fs.writeFileSync('calibration/output/nfl-refinement-20261101.json',JSON.stringify(report,null,2)+'\n');
  console.table(report.rows.map(({matchup,before,after,delta})=>({matchup,before,after,delta})));
}

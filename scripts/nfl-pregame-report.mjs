import fs from 'node:fs';
import {normalizeEvent,applyContextsToGame} from '../alerts-worker/src/live-game-model.js';
import {nflPregameContext} from '../alerts-worker/src/nfl-pregame.js';
import helper from '../test/helpers/nfl-pregame.cjs';
import runtime from '../scoring/live-runtime.cjs';
const data=helper.fixture();
const opposition=Object.values(data.summaries).flatMap(s=>s.standings?.groups || []).flatMap(g=>g.standings?.entries || []);
const rows=data.events.map(event=>{
  const game=normalizeEvent(structuredClone(event),'NFL');
  const contexts=nflPregameContext(game,data.summaries[event.id],game.teams.flatMap(t=>data.teamNews[t[8]]?.articles || []),opposition,Date.parse(data.capturedAt));
  applyContextsToGame(game,contexts);
  const old=data.games.find(g=>g.id===game.id);
  const components=Object.fromEntries([...new Set([...old.factors,...game.factors].map(f=>f.label))].map(label=>{
    const a=old.factors.filter(f=>f.label===label).reduce((n,f)=>n+f.points,0),b=game.factors.filter(f=>f.label===label).reduce((n,f)=>n+f.points,0);
    return [label,{before:a,after:b,delta:Number((b-a).toFixed(2))}];
  }));
  return {id:game.id,matchup:event.shortName,before:old.score,after:game.score,delta:game.score-old.score,
    line:game.line,components,factors:game.factors,stories:game.qualitativeContexts,
    sourceUrl:`https://www.espn.com/nfl/preview?gameId=${game.id}`};
});
const output={modelVersion:runtime.MODEL_VERSION,capturedAt:data.capturedAt,baselineCommit:data.sourceCommit,
  basis:'Actual production baseline; frozen ESPN scoreboard, summaries, standings, team news. Targets did not enter the scorer.',
  changes:['Actual division standings determine lead/positioning stakes, including losing-record races.',
    'Retained continuous spread curve; corrected moderate/substantial-favorite wording; added positive-only total contribution capped at five.',
    'Added bounded point differential, recent results, verified streaks and available opponent strength.',
    'Deterministic NFL news relevance and materiality; filtered uniform roundups, trade speculation, generic milestone tracking and prospective streaks.',
    'Source-linked return/rematch context capped at six; division/rivalry/rematch/standings share twelve.',
    'Six-hour summary/team-news cache, refreshed after canonical publication. No NFL inference calls.',
    'Factor-derived explanations and consistent season metadata across pregame/opening transition.'],rows};
fs.writeFileSync('calibration/output/nfl-pregame-20261101.json',JSON.stringify(output,null,2)+'\n');
console.table(rows.map(({matchup,before,after,delta})=>({matchup,before,after,delta})));

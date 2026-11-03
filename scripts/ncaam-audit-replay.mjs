// Reconstructed, causal ESPN prefixes. The original per-poll provider bodies
// were not archived, so these are comparisons rather than historical ratings.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {replayCheckpoints} from './replay-inputs.mjs';

const root=resolve(process.argv[2]||'.');
const destination=process.argv[3];
const api=await import(pathToFileURL(join(root,'alerts-worker/src/live-game-model.js')));
const fixture=name=>JSON.parse(readFileSync(new URL(`../audit/ncaam-20261102/${name}`,import.meta.url),'utf8').replace(/^\uFEFF/,''));
const board=fixture('espn-scoreboard-after.json');
const miamiSnapshots=fixture('miami-production-snapshots.json')[0].results;
const reportedPlay=JSON.parse(miamiSnapshots.find(row=>row.observed_at===1793663445000).normalized_state).liveRawSituation.lastPlay;
const targets=[['miami','401906769'],['army','401909562'],['oakland','401925733']];
const report={commit:process.argv[4]||'',games:[]};
for(const [name,id] of targets){
 const event=board.events.find(e=>String(e.id)===id),summary=fixture(`${name}-summary-after.json`);
 const stream=replayCheckpoints({modelSport:'NCAAB',event,summary});
 let previous=null;
 const states=[];
 for(const checkpoint of stream.checkpoints){
  if(name==='miami'&&String(checkpoint.play.id)===String(reportedPlay.id)){
   const partial=structuredClone(checkpoint);
   partial.event.competitions[0].situation={...partial.event.competitions[0].situation,lastPlay:reportedPlay};
   partial.summary.header.competitions[0].situation=structuredClone(partial.event.competitions[0].situation);
   partial.summary.winprobability=partial.summary.winprobability.filter(p=>String(p.playId)!==String(reportedPlay.id));
   const omitted=api.normalizeEvent(structuredClone(partial.event),'NCAAB');
   api.enrichGame(omitted,partial.summary,previous);
   report.omittedCurrentProbability={clock:omitted.liveRawStatus?.displayClock,
    scores:omitted.teams.map(t=>String(t[2])),rating:omitted.score,probability:omitted.live?.winProbability,
    providerLastPlayProbability:reportedPlay.probability.homeWinPercentage};
  }
  const game=api.normalizeEvent(structuredClone(checkpoint.event),'NCAAB');
  api.enrichGame(game,structuredClone(checkpoint.summary),previous);
  states.push({period:game.liveRawStatus?.period,clock:game.liveRawStatus?.displayClock,
   scores:game.teams.map(t=>String(t[2])),rating:game.score,probability:game.live?.winProbability,
   playId:String(checkpoint.play.id)});
  previous=game;
 }
 report.games.push({name,id,sourceCheckpoints:stream.checkpoints.length,exclusions:stream.exclusions.length,states});
}
if(destination)writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({omittedCurrentProbability:report.omittedCurrentProbability,
 games:report.games.map(g=>({name:g.name,checkpoints:g.states.length,exclusions:g.exclusions,
 first:g.states[0],last:g.states.at(-1)}))},null,2));

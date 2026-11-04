import fs from 'node:fs';
import * as active from '../../alerts-worker/src/live-game-model.js';
import context from '../../scoring/cfb-verified-context.cjs';
export const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/cfb-context/slate-20261107.json',import.meta.url)));
export const now=Date.parse(fixture.capturedAt);
export const copy=value=>structuredClone(value);
export function gameFor(row,{reviewed=true,state='pre',clock='15:00',period=1,scores=[0,0],at=now}={}) {
  const event=copy(row.event),competition=event.competitions[0];
  competition.status={period:state==='pre'?0:period,displayClock:clock,type:{state,completed:state==='post'}};
  competition.competitors.forEach((t,i)=>t.score=String(scores[i]));
  const game=active.normalizeEvent(event,'CFB');game.marketAsOf=at;
  if(state==='pre')active.preserveFootballPregameMarket(game,{...game,pregameMarketQuote:row.market},at,now);
  const factors=reviewed?context.mergeCfbContexts(game,copy(row.contexts),at):copy(row.contexts);
  active.applyContextsToGame(game,factors,at);
  return game;
}
export function summary(game,{wp=null,plays=[]}={}) {
  return {header:{season:game.sourceEvent.season,competitions:[copy(game.sourceCompetition)]},plays,
    ...(wp===null?{}:{winprobability:[{homeWinPercentage:wp,...(plays.length?{playId:plays.at(-1).id}:{})}]})};
}

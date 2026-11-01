import fs from 'node:fs';import z from 'node:zlib';import vm from 'node:vm';
import * as legacy from '../../alerts-worker/src/game-model.js';
export const read=n=>JSON.parse(z.gunzipSync(fs.readFileSync(new URL(`../fixtures/basketball-audit/${n}.json.gz`,import.meta.url))));
export const captured=read('summary'),recorded=read('history').sportsRadarHistory.snapshots;
export function frame(clock='0:48',away=70,home=68,source=captured,sport='NCAAB') {
 const event=structuredClone(read('scoreboard').events[0]);
 const c=event.competitions[0];
 c.status={period:2,displayClock:clock,type:{state:'in',completed:false,detail:`${clock} - 2nd Half`,shortDetail:`${clock} - 2nd`}};
 c.competitors.forEach(t=>{t.score=String(t.homeAway==='home'?home:away);delete t.winner;});
 const seconds=s=>{const [m,n]=s.split(':').map(Number);return m*60+n;};
 const plays=source.plays.filter(p=>(p.period.number<2||seconds(p.clock.displayValue)>=seconds(clock)-2)&&p.homeScore<=home&&p.awayScore<=away);
 c.situation={lastPlay:structuredClone(plays.at(-1))};
 const ids=new Set(plays.map(p=>String(p.id)));
 const summary={...structuredClone(source),header:{...structuredClone(source.header),competitions:[structuredClone(c)]},plays:structuredClone(plays),winprobability:source.winprobability.filter(p=>ids.has(String(p.playId)))};
 return {event,summary,sport};
}
export function evaluate(api,input,summary=input.summary,previous=null) {
 const game=api.normalizeEvent(structuredClone(input.event),input.sport);
 if(previous)api.enrichGame(game,summary&&structuredClone(summary),previous);
 else api.enrichGame(game,summary&&structuredClone(summary));
 return game;
}
export function beforeRuntime(){const module={exports:{}};vm.runInNewContext(z.gunzipSync(fs.readFileSync(new URL('../fixtures/basketball-audit/scorer-before.cjs.gz',import.meta.url))).toString(),{module,exports:module.exports,require:()=>{},URL,console});return module.exports;}
export function beforeApi(){
 const runtime=beforeRuntime(),finish=(g,s)=>{runtime.applyLiveSnapshot(g,g.sourceCompetition,s);g.modelVersion=runtime.MODEL_VERSION;return g;};
 return {normalizeEvent:(...args)=>finish(legacy.normalizeEvent(...args)),enrichGame:(g,s,p)=>{
  runtime.preservePregameBaseline(g,p);runtime.preserveLiveEvidence(g,p);legacy.enrichGame(g,s,p);finish(g,s);
 }};
}

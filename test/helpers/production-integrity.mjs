import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import time from '../../scoring/shared/time.js';
export const read=name=>JSON.parse(gunzipSync(fs.readFileSync(new URL(`../fixtures/production-integrity/${name}.json.gz`,import.meta.url))));
export const rows=read('anomaly-snapshots');
export const fixture=(sport,id)=>read(`${sport}-${id}`);
export function frame(row){
 const saved=JSON.parse(row.normalized_state),f=fixture(saved.sport,saved.id);
 const event=structuredClone(f.event),c=event.competitions[0];
 c.status=structuredClone(saved.liveRawStatus);c.situation=structuredClone(saved.liveRawSituation);
 c.competitors.forEach(t=>{t.score=saved.teams.find(x=>String(x[8])===String(t.team.id))[2];delete t.winner;});
 const summary=structuredClone(f.summary);summary.header.competitions=[structuredClone(c)];
 const end=time.normalizedTime(saved.sport,c).elapsedSeconds;
 const lastId=String(c.situation?.lastPlay?.id||'');
 const before=p=>{
  const at=time.normalizedTime(saved.sport,{status:{period:p.period?.number,displayClock:p.clock?.displayValue}}).elapsedSeconds;
  const scores=p.homeScore==null||Number(p.homeScore)<=Number(c.competitors.find(t=>t.homeAway==='home').score)&&Number(p.awayScore)<=Number(c.competitors.find(t=>t.homeAway==='away').score);
  return scores&&at!==null&&at<=end&&(at!==end||!lastId.startsWith(saved.id)||!String(p.id).startsWith(saved.id)||Number(p.id)<=Number(lastId));
 };
 summary.scoringPlays=summary.scoringPlays?.filter(before);
 summary.plays=summary.plays?.filter(before);
 const drives=[...(summary.drives?.previous||[]),summary.drives?.current].filter(Boolean).map(d=>({...d,plays:(d.plays||[]).filter(before)})).filter(d=>d.plays.length);
 if(summary.drives)summary.drives={previous:drives.slice(0,-1),current:drives.at(-1)};
 const ids=new Set([...(summary.plays||[]),...drives.flatMap(d=>d.plays)].map(p=>String(p.id)));
 summary.winprobability=summary.winprobability?.filter(p=>ids.has(String(p.playId)));
 delete summary.boxscore;delete summary.article;delete summary.news;
 return {sport:saved.sport,event,summary,saved};
}
export function evaluate(api,input,summary=input.summary,previous=null){
 const game=api.normalizeEvent(structuredClone(input.event),input.sport);
 api.enrichGame(game,summary&&structuredClone(summary),previous&&structuredClone(previous));return game;
}

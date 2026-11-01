import helper from './live-sync.cjs';
import {replayCheckpoints} from '../../scripts/replay-inputs.mjs';
const copy=x=>structuredClone(x);
const fixtureCache=new Map();
export function fixture(name){if(!fixtureCache.has(name))fixtureCache.set(name,helper.read(name));return copy(fixtureCache.get(name));}
export function osu(){
 const f=fixture('CFB-401856847');
 const p=replayCheckpoints({...f,modelSport:'CFB'}).checkpoints.find(p=>p.competition.status.period===3&&p.competition.status.displayClock==='5:29'&&p.competition.competitors.some(t=>t.score==='28'));
 return {sport:'CFB',event:p.event,summary:{...p.summary,pickcenter:f.summary.pickcenter},baseline:f.game.pregameBaseline,recorded:f.history.snapshots};
}
export function eku(){const f=fixture('CFB-401868147');return {sport:f.sport,event:f.event,summary:f.summary,baseline:f.game.pregameBaseline,recorded:f.history.snapshots};}
export function toronto(){
 const f=fixture('NHL-401892621'),p=replayCheckpoints({...f,modelSport:'NHL'}).checkpoints.find(p=>p.play.id==='401892621000009340');
 const event=copy(p.event),c=event.competitions[0];c.status={period:3,displayClock:'9:59',type:{state:'in',completed:false,detail:'9:59 - 3rd Period'}};
 c.competitors.forEach(t=>t.score=t.homeAway==='home'?'2':'3');
 const summary={...p.summary,header:{...p.summary.header,competitions:[copy(c)]}};
 // Historical lineups are unavailable. This controlled variation uses real
 // teams, goals and the two-minute tripping record, with explicit 5-on-4 data.
 summary.onIce=c.competitors.map(t=>({teamId:t.team.id,entries:[...Array.from({length:t.team.id==='21'?4:5},(_,i)=>({athleteid:`${t.team.id}-${i}`})),{athleteid:`${t.team.id}-g`}]}));
 summary.boxscore={players:c.competitors.map(t=>({team:{id:t.team.id},statistics:[{name:'goalies',athletes:[{athlete:{id:`${t.team.id}-g`}}]}]}))};
 return {sport:'NHL',event,summary,baseline:f.game.pregameBaseline,recorded:f.history.snapshots};
}
export function evaluate(api,input,summary=input.summary,previous=null){
 const g=api.normalizeEvent(copy(input.event),input.sport);if(input.baseline)g.pregameBaseline=copy(input.baseline);
 api.enrichGame(g,copy(summary),previous&&copy(previous));return g;
}

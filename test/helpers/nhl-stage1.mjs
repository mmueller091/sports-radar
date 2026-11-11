// Controlled inputs, not historical games. Always score via the production facade.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {fixture}=require('./nhl-calibration.cjs');
export const clock=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
export function eventAt(time,extra={}) {
  const period=Math.max(1,Math.ceil(time/1200));
  return {id:`p${time}`,sequenceNumber:time,period:{number:period},clock:{displayValue:clock(time-(period-1)*1200)},
    text:'Face Off',type:{text:'Face Off'},scoringPlay:false,...extra};
}
export const goal=(homeScore,awayScore,time,name='Scorer',teamId='h')=>eventAt(time,{
  homeScore,awayScore,scoringPlay:true,type:{id:'505',text:'Goal',abbreviation:'goal'},team:{id:teamId},
  text:`${name} Goal`,participants:[{type:'scorer',athlete:{id:name,displayName:name}}]
});
export const shot=(time,id,teamId='a',premium=false)=>eventAt(time,{id,
  type:{id:'506',text:'Shot',abbreviation:'shot-on-goal'},team:{id:teamId},
  text:premium?'Point-blank shot saved by goalie':'Wrist Shot saved by goalie',
  coordinate:{x:teamId==='a'?-80:80,y:premium?2:30},
  participants:[{type:'shooter',athlete:{id:`${teamId}s`}},{type:'saver',athlete:{id:`${teamId==='a'?'h':'a'}g`}}]
});
export function input({home=1,away=0,plays=[goal(1,0,600)],complete=false,...options}={}) {
  const i=fixture({clock:'5:00',...options});
  i.event.date='2026-11-10T00:00:00Z';i.competition.id='synthetic';
  i.competition.competitors.forEach(c=>c.score=String(c.homeAway==='home'?home:away));
  i.summary.plays=structuredClone(plays);i.summary.scoringPlays=i.summary.plays.filter(p=>p.scoringPlay);
  i.summary.sportsRadarEvidence={clockMode:'elapsed'};
  if(complete){
    i.summary.playsComplete=true;
    i.summary.plays.unshift(eventAt(0,{homeScore:0,awayScore:0}));
    const now=(Number(i.competition.status.period)-1)*1200+1200-optionsSeconds(i.competition.status.displayClock);
    i.summary.plays.push(eventAt(now-60,{id:'recent-observation',homeScore:home,awayScore:away}),
      eventAt(now,{id:'current-observation',homeScore:home,awayScore:away}));
  }
  return i;
}
const optionsSeconds=c=>c.split(':').map(Number).reduce((m,s)=>m*60+s);
export function ice(i,home,away,homeGoalie=true,awayGoalie=true){
  i.summary.onIce=['h','a'].map((id,n)=>({teamId:id,entries:[
    ...Array.from({length:n?away:home},(_,j)=>({athleteid:id+j})),
    ...((n?awayGoalie:homeGoalie)?[{athleteid:id+'g'}]:[])]}));return i;
}
export function cases(){
  const quiet=input(),active=input({plays:[goal(1,0,600),...Array.from({length:8},(_,n)=>shot(3220+n*10,'s'+n))]});
  const quiet43=input({home:4,away:3,plays:[[1,0,300],[1,1,500],[2,1,700],[2,2,900],[3,2,1100],[3,3,1300],[4,3,1500]].map(([h,a,t])=>goal(h,a,t))});
  const comeback=input({home:4,away:3,plays:[[1,0,600],[2,0,720],[3,0,840],[4,0,960],[4,1,3150],[4,2,3210],[4,3,3270]].map(([h,a,t])=>goal(h,a,t,'Scorer',t>3000?'a':'h'))});
  const zero=input({home:0,away:0,plays:[],complete:true});
  const duel=input({home:0,away:0,complete:true,plays:Array.from({length:12},(_,n)=>shot(3190+n*10,'duel'+n,n%2?'a':'h',true))});
  const milestone=input({home:3,away:4,plays:[[1,0,300,'Two','h'],[1,1,600,'Four','a'],[2,1,900,'Two','h'],[2,2,1200,'Four','a'],[3,2,1800,'Other','h'],[3,3,3000,'Four','a'],[3,4,3270,'Four','a']].map(v=>goal(...v))});
  for(const [n,name,g]of [[0,'Two',2],[1,'Four',4]])milestone.summary.boxscore.players[n].statistics.push({name:'skaters',labels:['G'],athletes:[{athlete:{id:name,displayName:name},stats:[String(g)]}]});
  const reversed=structuredClone(milestone);reversed.summary.boxscore.players.reverse();
  const delayed=ice(input({clock:'3:00',complete:true}),4,5,true,false);
  delayed.summary.plays.push(eventAt(3400,{id:'delayed',text:'Delayed penalty',type:{text:'Delayed Penalty'},team:{id:'h'}}));
  const missing=input();delete missing.summary.plays;delete missing.summary.scoringPlays;
  return {quiet,active,verifiedQuiet:input({complete:true}),quiet43,comeback,zero,duel,
    tiedEV:input({home:2,away:2,plays:[]}),tiedPP:input({home:2,away:2,plays:[],manpower:'trailingPP'}),
    ot3:ice(input({home:0,away:0,plays:[],period:4,clock:'3:00'}),3,3),
    ot4:ice(input({home:0,away:0,plays:[],period:4,clock:'3:00'}),3,4),
    ot5:ice(input({home:0,away:0,plays:[],period:4,clock:'3:00'}),3,5),
    milestone,reversed,tactical:input({clock:'3:00',manpower:'pulled'}),delayed,missing};
}
export function evaluate(adapter,runtime,i,previous=null){
  i=structuredClone(i);
  const g=adapter.normalizeEvent(i.event,'NHL');adapter.enrichGame(g,i.summary,previous);
  return g;
}

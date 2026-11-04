// Controlled scoring simulations. These are not observed games or provider events.
export const SPREADS=[4,7.5,7.9,8,8.1,10,14,25.5,35];
export const MARGINS=[-14,-7,-3,-1,0,1,3,7,14];
export const SPORTS=['NCAAB','NBA','NFL','CFB'];
export function phases(sport){
 const college=sport==='NCAAB',basketball=college||sport==='NBA';
 return [
  {phase:'early',period:1,clock:college?'18:00':basketball?'10:00':'12:00'},
  {phase:'halftime',period:college?1:2,clock:'0:00',halftime:true},
  {phase:'late',period:college?2:4,clock:'8:00'},
  {phase:'final minutes',period:college?2:4,clock:'4:00'},
  {phase:'final seconds',period:college?2:4,clock:'0:02'},
  {phase:'overtime',period:college?3:5,clock:!basketball&&sport==='CFB'?'':'2:00'},
 ];
}
export function scenario({sport='NCAAB',spread=25.5,margin=1,period=sport==='NCAAB'?2:4,
 clock='4:00',market='verified',wp=null,possession='unknown',halftime=false,state='live',
 home=50,rank=null,timeouts=null,names=null}={}){
 const college=sport==='NCAAB',basketball=college||sport==='NBA',regulation=college?2:4;
 const status={period,displayClock:clock,type:{state:state==='upcoming'?'pre':state==='completed'?'post':'in',
  completed:state==='completed',detail:state==='completed'?'Final':state==='upcoming'?'Scheduled':halftime?'Halftime':period>regulation?'Overtime':`${clock} ${college?'Half':'Q'}${period}`}};
 const away=home+margin;
 const competitors=[{homeAway:'home',team:{id:'fav',displayName:names?.[1]||'Simulation Favorite',shortDisplayName:names?.[1]||'Favorite',abbreviation:names?'TENN':'FAV'},score:String(home),
  ...(rank?{curatedRank:{current:rank}}:{})},
  {homeAway:'away',team:{id:'dog',displayName:names?.[0]||'Simulation Underdog',shortDisplayName:names?.[0]||'Underdog',abbreviation:names?'WOF':'DOG'},score:String(away)}];
 if(possession!=='unknown')competitors.find(t=>t.team.id===(possession==='dog'?'dog':'fav')).possession=true;
 if(timeouts!==null)competitors.forEach(t=>{t.timeoutsRemaining=timeouts;});
 const raw={spread,details:`${names?'TENN':'FAV'} -${spread}`,lastUpdated:'2026-11-03T16:00:00Z',
  homeTeamOdds:{favorite:true,underdog:false},awayTeamOdds:{favorite:false,underdog:true},
  pointSpread:{home:{close:{line:-spread}},away:{close:{line:spread}}},provider:{name:'Simulation fixture'}};
 if(market==='stale')raw.lastUpdated='2026-10-20T16:00:00Z';
 if(market==='after-start')raw.lastUpdated='2026-11-03T18:00:00Z';
 if(market==='invalid-time')raw.lastUpdated='not a time';
 if(market==='live')raw.isLive=true;
 if(market==='unverified'){delete raw.lastUpdated;delete raw.pointSpread;}
 const situation=possession==='unknown'?{}:{possession:possession==='dog'?'dog':'fav'};
 if(!basketball&&possession!=='unknown')Object.assign(situation,{down:1,distance:10,yardsToEndzone:65,homeTimeouts:timeouts??3,awayTimeouts:timeouts??3});
 const competition={competitors,status,situation,...(market==='missing'?{}:{odds:[raw]})};
 const event={id:'simulation-underdog',date:'2026-11-03T17:00:00Z',season:{year:2026,type:2},competitions:[competition]};
 const summary={header:{id:event.id,competitions:[]},plays:[],scoringPlays:[],winprobability:[]};
 if(wp!==null){
  // A deliberately synthetic observation anchors the optional probability to
  // this exact state without inventing a scoring play or a historical ledger.
  const play={id:'simulation-observation',period:{number:period},clock:{displayValue:clock},homeScore:home,awayScore:away,
   type:{text:'Simulation observation'},text:'Controlled simulation, not a historical event',scoringPlay:false};
  competition.situation.lastPlay=structuredClone(play);summary.plays=[play];
  summary.winprobability=[{playId:play.id,homeWinPercentage:1-wp}];
 }
 summary.header.competitions=[structuredClone(competition)];
 return {sport,event,competition,summary,simulation:true};
}
export function evaluate(api,input,previous=null){
 const game=api.normalizeEvent(structuredClone(input.event),input.sport);
 api.enrichGame(game,input.summary&&structuredClone(input.summary),previous&&structuredClone(previous));
 return game;
}

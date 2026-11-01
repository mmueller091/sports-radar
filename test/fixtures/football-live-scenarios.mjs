export function footballScenario({sport='NFL',spread=13.5,period=2,clock='12:00',home=0,away=13,rank=null,fcs=false,odds=true}={}) {
  const competitors=[{homeAway:'home',team:{id:'fav',displayName:'Favorite',shortDisplayName:'Favorite',abbreviation:'FAV'},score:String(home),records:[{type:'total',summary:'4-2'}],...(rank?{curatedRank:{current:rank}}:{})},
    {homeAway:'away',team:{id:'dog',displayName:'Underdog',shortDisplayName:'Underdog',abbreviation:'DOG',...(fcs?{groups:{id:'81'}}:{})},score:String(away),records:[{type:'total',summary:'1-6'}]}];
  const competition={competitors,status:{period,displayClock:clock,type:{state:'in',detail:`${clock} Q${period}`,completed:false}},situation:{},
    ...(odds?{odds:[{spread,details:`FAV -${spread}`,homeTeamOdds:{favorite:true,underdog:false},awayTeamOdds:{underdog:true,favorite:false}}]}:{})};
  const event={id:'live-test',date:'2026-11-01T18:00:00Z',season:{year:2026,type:2},competitions:[competition]};
  return {sport,event,competition,summary:{header:{id:event.id,competitions:[structuredClone(competition)]},plays:[],scoringPlays:[],winprobability:[]}};
}

export function developmentArticle(text='Starting quarterback Alex Player leaves with a thumb injury, replaced by Sam Backup against Underdog',published='2026-11-01T18:10:00Z') {
  return {id:'news-1',headline:text,published,categories:[{type:'event',eventId:'live-test'},{type:'team',teamId:'fav'}],links:{web:{href:'https://www.espn.com/nfl/story/_/id/123/test'}}};
}

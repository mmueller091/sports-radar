// Explicitly synthetic boundary cases; never represented as played games.
export const syntheticCases=[];
for(const sport of ['NFL','CFB','NBA','NHL','MLB','NCAAB','Tennis']){
  for(const scenario of ['even','slight','meaningful','heavy','missing','conflict','limited']){
    const prices={even:[-110,-110],slight:[110,-130],meaningful:[140,-166],heavy:[500,-700],limited:[140,-166],conflict:[140,-166]}[scenario];
    const spread={NFL:{even:0,slight:3,meaningful:6,heavy:14},CFB:{even:0,slight:3,meaningful:10,heavy:21},NBA:{even:0,slight:3,meaningful:7,heavy:14},NCAAB:{even:0,slight:3,meaningful:8,heavy:18}}[sport];
    const game={id:`synthetic-${sport}-${scenario}`,sport,state:'upcoming',score:50,factors:[],synthetic:true,scenario,
      teams:[['Away Team','A','0','','',scenario==='limited'?'1-0':sport==='MLB'?'90-60':'12-4',null,'Away Team','1'],['Home Team','H','0','','',scenario==='limited'?'0-1':sport==='MLB'?'78-72':'8-8',null,'Home Team','2']]};
    if(prices){
      const [away,home]=prices;
      game.line={moneyline:`H ${home}`,provider:'Synthetic Book',total:null};
      game.pregameBaseline={odds:[{details:`H ${home}`,provider:{name:'Synthetic Book'},moneyline:{away:{close:{odds:String(away)}},home:{close:{odds:String(home)}}}}]};
      if(spread){const n=spread[scenario]??spread.meaningful;game.line.spread=n===0?'PK':`H -${n}`;}
      if(scenario==='conflict')game.pregameBaseline.odds.push({...game.pregameBaseline.odds[0],moneyline:{away:{close:{odds:'150'}},home:{close:{odds:String(home)}}}});
    }
    syntheticCases.push(game);
  }
}

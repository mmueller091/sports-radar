const runtime=require('../../scoring/live-runtime.cjs');
const starts={NHL:'20:00',NBA:'12:00',NCAAB:'20:00',MLB:'',Soccer:'0',Tennis:''};
const early={NHL:'18:00',NBA:'10:00',NCAAB:'18:00',MLB:'',Soccer:'2',Tennis:''};
function event(sport,options={}) {
  const {state='in',period=1,clock=starts[sport],scores=[0,0],spread=null,prices=null,situation={},detail='',games=[],postseason=false}=options;
  return {id:'opening-'+sport,name:'Edmonton Oilers at New York Islanders',season:{year:2026,type:postseason?3:2},competitions:[{
    status:{period,displayClock:clock,type:{state,completed:state==='post',detail:detail || (sport==='MLB'?'Top 1st':'')}},situation,
    competitors:['away','home'].map((side,i)=>({homeAway:side,team:{id:side,displayName:i?'New York Islanders':'Edmonton Oilers',abbreviation:i?'NYI':'EDM'},
      score:String(scores[i]),records:[{summary:'6-2'}],linescores:(games[i] || []).map(value=>({value}))})),
    ...(spread===null && !prices ? {} : {odds:[{...(spread===null?{}:{spread,details:spread===0?'PK':`NYI -${spread}`}),
      homeTeamOdds:{favorite:true,...(prices?{moneyLine:prices[0]}:{})},awayTeamOdds:{underdog:true,...(prices?{moneyLine:prices[1]}:{})}}]})
  }]};
}
function controlledBaseline(game,score=53) {
  game.pregameBaseline={calibration:runtime.MODEL_VERSION,source:'observed',score,rawPregameScore:score,
    factors:[{label:'Sport baseline',points:score}],odds:game.sourceCompetition?.odds || [],spread:null};
  return game;
}
function summary(event,options={}) {
  return {header:{season:event.season,competitions:[structuredClone(event.competitions[0])]},
    ...(options.wp==null?{}:{winprobability:[{homeWinPercentage:options.wp}]}),
    ...(options.plays?{plays:options.plays}:{}),...(options.extra || {})};
}
const late={
  NHL:{period:3,clock:'1:00',scores:[2,2]},NBA:{period:4,clock:'0:10',scores:[100,101],situation:{possession:'away'}},
  NCAAB:{period:2,clock:'0:10',scores:[70,71],situation:{possession:'away'}},MLB:{period:9,detail:'Bottom 9th',scores:[4,3],situation:{outs:1,onFirst:true,onSecond:true,onThird:true}},
  Soccer:{period:2,clock:'89',scores:[1,1]},Tennis:{period:3,scores:[1,1],games:[[6,4,6],[4,6,6]],situation:{matchPoint:true,tiebreak:true}}
};
module.exports={event,summary,controlledBaseline,starts,early,late};

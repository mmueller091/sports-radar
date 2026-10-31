const fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib'),path=require('node:path'),{createRequire}=require('node:module');
const moduleBefore={exports:{}};
vm.runInNewContext(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'../fixtures/football-transition-before.cjs.gz'))).toString(),
  {module:moduleBefore,require:createRequire(path.join(__dirname,'../../scoring/live-runtime.cjs'))});
const before=moduleBefore.exports;
function event(spread=0,{period=1,clock='15:00',scores=[0,0],state='in',situation={},ranks=[],postseason=false}={}) {
  return {id:'transition',name:'Away at Home',season:{year:2026,type:postseason?3:2},competitions:[{
    status:{period,displayClock:clock,type:{state,completed:state==='post'}},situation,
    competitors:['away','home'].map((side,i)=>({homeAway:side,team:{id:side,displayName:side,abbreviation:i?'PIT':'BAL'},
      score:String(scores[i]),records:[{summary:'6-2'}],...(ranks[i]?{curatedRank:{current:ranks[i]}}:{})})),
    ...(spread===null?{}:{odds:[{spread,details:spread===0?'PK':`PIT -${spread}`,homeTeamOdds:{favorite:true},awayTeamOdds:{underdog:true}}]})
  }]};
}
module.exports={before,event};

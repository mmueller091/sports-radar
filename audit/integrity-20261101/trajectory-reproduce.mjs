// Offline synthetic controls from the November 1 audit. No provider requests.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const checkout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const sourceRoot=path.resolve(process.argv[2] || checkout);
const require=createRequire(pathToFileURL(path.join(sourceRoot,'scoring/live-runtime.cjs')));
const core=require(path.join(sourceRoot,'scoring/live-runtime.cjs'));
const active=await import(pathToFileURL(path.join(sourceRoot,'alerts-worker/src/live-game-model.js')));
const results=[];
const play=(id,period,clock,homeScore,awayScore,extra={})=>({id,period:{number:period},clock:{displayValue:clock},homeScore,awayScore,...extra});
function input(sport,{home=0,away=0,period=4,clock='1:00',situation={},detail='',plays=[]}={}) {
  const competition={status:{period,displayClock:clock,type:{state:'in',completed:false,detail}},situation,
    competitors:[{homeAway:'home',score:String(home),team:{id:'h',displayName:'Home',abbreviation:'HME'}},
      {homeAway:'away',score:String(away),team:{id:'a',displayName:'Away',abbreviation:'AWY'}}]};
  return {sport,event:{id:'audit-synthetic',competitions:[competition]},summary:{header:{competitions:[structuredClone(competition)]},plays,winprobability:[]}};
}
function evaluate(label,i,previous=null) {
  const game=active.normalizeEvent(structuredClone(i.event),i.sport);
  active.enrichGame(game,structuredClone(i.summary),previous);
  results.push({label,sport:i.sport,clock:game.liveRawStatus?.displayClock,rating:game.score,
    factors:game.factors,reasons:game.live?.reasons,trajectory:game.trajectoryScoring,
    pressure:game.live?.components?.pressure,quality:game.gameQualitySoFar || null,
    evidenceQuality:game.evidenceQuality || null,partial:game.scoringPartial});
  return game;
}
for(const sport of ['NFL','CFB']) evaluate(`${sport} header-only trailing five`,input(sport,{home:24,away:19,clock:'1:50',situation:{possession:'a',down:1,distance:10,possessionText:'AWY 25',homeTimeouts:2,awayTimeouts:2}}));
for(const sport of ['NBA','NCAAB']) evaluate(`${sport} header-only late tie`,input(sport,{home:100,away:100,period:sport==='NBA'?4:2,clock:'2:00'}));
evaluate('MLB header-only bottom ninth tie',input('MLB',{home:3,away:3,period:9,clock:'',detail:'Bottom 9th',situation:{outs:0,onFirst:false,onSecond:false,onThird:false}}));
const soccer=input('Soccer',{home:1,away:1,period:2,clock:'90+5',plays:[play('goal1',1,'20',1,0,{scoringPlay:true}),play('goal2',1,'21',1,1,{scoringPlay:true})]});
evaluate('Soccer predominantly tied without WP',soccer);
for(const n of [0,1,7]) evaluate(`Soccer old chance copies ${n}`,input('Soccer',{home:1,away:0,period:2,clock:'90+5',plays:Array(n).fill(play('old-shot',1,'3',1,0,{text:'Away shot hit the post',team:{id:'a'}}))}));
for(const outs of [0,1,2,3]) for(const gap of [0,1,2,3,4,5]) for(const loaded of [false,true])
  evaluate(`MLB deficit ${gap}, ${loaded?'loaded':'empty'}, ${outs} outs`,input('MLB',{home:3,away:3+gap,period:9,clock:'',detail:'Bottom 9th',situation:{outs,onFirst:loaded,onSecond:loaded,onThird:loaded}}));
const kneels=JSON.parse(fs.readFileSync(path.join(checkout,'test/fixtures/audit-20261101/cfb-legal-kneels.json'))).inputs;
let previous=null;
for(const i of kneels) previous=evaluate(`CFB legal kneel ${i.event.competitions[0].status.displayClock}`,i,previous);
for(const i of kneels) evaluate(`NFL equivalent kneel ${i.event.competitions[0].status.displayClock}`,{...i,sport:'NFL'});
console.log(JSON.stringify({model:core.MODEL_VERSION,sourceRoot,synthetic:true,results},null,2));

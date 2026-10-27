const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {gunzipSync} = require('node:zlib');
const live = require('./cfb-calibration.cjs');
const root = path.resolve(__dirname,'../..');
const frozen = () => gunzipSync(fs.readFileSync(path.join(root,'test/fixtures/scoring-core-before-cfb-completed.js.gz'))).toString();
const play = ([period,clock,homeScore,awayScore]) => ({period:{number:period},clock:{displayValue:clock},homeScore,awayScore,text:'Touchdown',scoringPlay:true});
const ordinary = [[1,'8:00',7,0],[2,'6:00',7,7],[3,'7:00',14,7],[3,'1:00',14,14],[4,'8:00',17,14]];
const drama = [[1,'8:00',7,0],[2,'6:00',7,7],[3,'7:00',14,7],[4,'6:00',14,17],[4,'3:00',21,17],[4,'1:00',21,24],[4,'0:12',27,24]];
const blowout = [[1,'10:30',7,0],[1,'3:00',14,0],[2,'10:30',21,0],[2,'2:00',28,0],[3,'9:00',28,7]];
const comeback = [[1,'8:00',0,7],[2,'12:00',0,14],[2,'4:00',0,21],[3,'12:00',7,21],[3,'5:00',14,21],[4,'12:00',21,21],[4,'7:00',28,21],[4,'3:00',28,28],[4,'0:12',31,28]];
const late = [[1,'8:00',7,0],[2,'6:00',7,7],[3,'7:00',14,7],[3,'0:00',14,14],[4,'5:00',21,14],[4,'2:00',28,14],[4,'0:20',35,14]];
const closeDog = {scores:[14,17],path:ordinary.map(([p,c,h,a])=>[p,c,a,h])};
const regulationOT = [[1,'8:00',7,0],[1,'2:00',7,7],[2,'9:00',14,7],[2,'2:00',14,14],[3,'8:00',21,14],[3,'1:00',21,21],[4,'9:00',27,21],[4,'0:15',27,27]];
const firstOT = regulationOT.concat([[5,'0:00',35,27],[5,'0:00',35,35]]);
const secondOT = firstOT.concat([[6,'0:00',43,35],[6,'0:00',43,43]]);
const cases = {
 A:{label:'Ordinary three-point final',scores:[17,14],path:ordinary},
 B:{label:'Multiple late lead changes',scores:[27,24],path:drama},
 C:{label:'Eight-point 1OT',scores:[35,27],ot:1,path:regulationOT.concat([[5,'0:00',35,27]])},
 D:{label:'Eight-point 2OT',scores:[43,35],ot:2,path:firstOT.concat([[6,'0:00',43,35]])},
 E:{label:'Eight-point 3OT (historical rules)',scores:[51,43],ot:3,year:2018,path:secondOT.concat([[7,'0:00',51,43]])},
 F:{label:'Tied entering Q4, ends +21',scores:[35,14],path:late.map(row=>row[0]===4?[4,row[1]==='5:00'?'14:00':row[1]==='2:00'?'10:00':'6:00',row[2],row[3]]:row)},
 G:{label:'One score at 5:00, ends +21',scores:[35,14],path:late},
 H:{label:'Never competitive after half',scores:[28,7],path:blowout},
 I:{label:'Erases 21, wins close',scores:[31,28],path:comeback},
 J:{label:'Erases 21, pulls away late',scores:[42,21],path:comeback.slice(0,7).concat([[4,'2:00',35,21],[4,'0:20',42,21]])},
 K:{label:'+7 wins close',...closeDog,spread:7}, L:{label:'+14 wins close',...closeDog,spread:14},
 M:{label:'+21 wins close',...closeDog,spread:21}, N:{label:'+28 wins close',...closeDog,spread:28},
 O:{label:'+28 wins wire-to-wire by 28',scores:[0,28],spread:28,path:blowout.slice(0,4).map(([p,c,h,a])=>[p,c,a,h])},
 P:{label:'Unranked +14 beats No. 2 close',...closeDog,spread:14,ranks:[2,null]},
 Q:{label:'No. 1 loses by 24, no late contest',scores:[7,31],spread:14,ranks:[1,null],path:[[1,'10:30',0,7],[1,'3:00',0,14],[2,'8:00',0,21],[2,'2:00',0,28],[3,'9:00',7,28],[4,'9:00',7,31]]},
 R:{label:'CFP semifinal 2OT',scores:[43,35],ot:2,stage:'College Football Playoff Semifinal',path:firstOT.concat([[6,'0:00',43,35]])},
 S:{label:'National championship blowout',scores:[28,7],stage:'National Championship',path:blowout},
 T:{label:'10-7 defensive classic',scores:[10,7],action:true,path:[[1,'8:00',3,0],[2,'6:00',3,7],[4,'0:12',10,7]]},
 U:{label:'10-7 punt-fest',scores:[10,7],stagnant:true,path:[[1,'8:00',3,0],[2,'6:00',3,7],[4,'0:12',10,7]]},
 V:{label:'Repeated two-point shootout, 5OT',scores:[35,33],ot:5,shootout:true,path:regulationOT.concat([[5,'0:00',33,27],[5,'0:00',33,33],[9,'0:00',35,33]])}
};
function fixture(input) {
 const f=live.fixture(input);
 f.event.name=input.stage || input.label || 'College Home vs College Away';
 f.event.season.type=input.stage?3:2;
 f.competition.status={period:4+(input.ot||0),displayClock:'0:00',type:{state:'post',completed:true,detail:input.ot?`Final/${input.ot}OT`:'Final',shortDetail:input.ot?`Final/${input.ot}OT`:'Final'}};
 f.event.status=f.competition.status;
 f.event.competitions=[f.competition];
 f.summary.scoringPlays=(input.path||[]).map(play);
 if(input.shootout) f.summary.plays=[7,7,8,8,9,9].map((p,i)=>({id:`try${i}`,period:{number:p},type:{text:'Two Point Attempt'},text:'Two-point conversion attempt'}));
 return f;
}
function evaluate(core,input) {
 const f=fixture(input), teams=f.competition.competitors.map(t=>({...t,id:t.team.id}));
 const r=core.rateGame('CFB','completed',teams,f.event,f.competition,'');
 const game={sport:'CFB',state:'completed',score:r.score,baseScore:r.score,factors:r.factors,underdog:r.underdog,upsetPoints:r.upsetPoints,sourceCompetition:f.competition,sourceEvent:f.event};
 const last=f.summary.scoringPlays.at(-1);
 const finish=/(0:00|last second|game[- ]winning)/i.test(`${last?.clock?.displayValue||''} ${last?.text||''}`) && /field goal|goal|home run|touchdown/i.test(last?.text||'')?14:(core.defensiveFinishFactor('CFB',f.summary)?.points||0);
 const history=core.momentumImpact('CFB',f.summary,1,'completed');
 const enriched=core.momentumImpact('CFB',f.summary,1,'completed',{game,finishPoints:finish});
 return {score:core.clampScore(r.score+enriched.points+finish),base:r.score,history:history.points,adjustment:enriched.points-history.points,finish,upset:r.upsetPoints,factors:[...r.factors,...enriched.factors]};
}
function adapter(source,display) {
 const code=fs.readFileSync(path.join(root,'alerts-worker/src/game-model.js'),'utf8').replace(/^import .*;\s*$/gm,'').replace(/^export .*;\s*$/gm,'');
 return vm.runInNewContext(`${source}\n${code}\n({normalizeEvent,enrichGame})`,display);
}
function providers(model) {
 return Object.fromEntries(fs.readdirSync(path.join(root,'test/fixtures/real-games')).filter(f=>f.endsWith('.json')).sort().map(file=>{
  const f=JSON.parse(fs.readFileSync(path.join(root,'test/fixtures/real-games',file)));
  const g=model.normalizeEvent(structuredClone(f.event),f.modelSport);
  if((g.state!=='upcoming'||!g.line)&&!(g.division==='FCS'&&g.state==='upcoming'))model.enrichGame(g,structuredClone(f.summary));
  return [file,structuredClone(g)];
 }));
}
module.exports={cases,fixture,evaluate,adapter,providers,frozen};

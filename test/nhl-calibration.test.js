import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import source from './helpers/scoring-source.cjs';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/game-model.js';
const require=createRequire(import.meta.url),core=require('../rating-core.js');
const {fixture,evaluate,cases,goal}=require('./helpers/nhl-calibration.cjs');
const {hockeyOvertime,hockeyHistory,hockeyPressure}=require('../scoring/sports/nhl.js');
const score=input=>evaluate(core,input).score;

test('NHL margin/runway grid is continuous, monotone, and bounded even with extra manpower',()=>{
  for(const situation of [{},{trailingGoaliePulled:true},{trailingPowerPlay:true},{trailingGoaliePulled:true,trailingPowerPlay:true}]) {
    for(const p of [0,.17,.5,.83,.97,1]) {
      let previous=1;
      for(let i=0;i<=60;i++) {
        const value=core.nhlLiveMarginCloseness(i/10,p,situation);
        assert.ok(value>=0&&value<=previous+1e-10,`${p}/${i/10}`);previous=value;
      }
      for(const gap of [1,2,3,4]) {
        const left=core.nhlLiveMarginCloseness(gap-.001,p,situation),right=core.nhlLiveMarginCloseness(gap+.001,p,situation);
        assert.ok(Math.abs(left-right)<.005,`continuous at ${gap}`);
      }
    }
    for(const gap of [2,3,4]) {
      const values=[.1,.5,.97].map(p=>core.nhlLiveMarginCloseness(gap,p,situation));
      assert.ok(values[0]>values[1]&&values[1]>values[2]);
    }
    assert.ok(core.nhlLiveMarginCloseness(3,.97,situation)<.04);
  }
  assert.equal(core.nhlLiveMarginCloseness(null,.5),0);
  assert.equal(core.nhlLiveMarginCloseness(Infinity,.5),0);
});

test('NHL tied and one-through-four-goal early/mid/late score grid',()=>{
  for(const phase of [{period:1,clock:'10:00'},{period:2,clock:'10:00'},{period:3,clock:'2:00'}]) {
    const scores=[0,1,2,3,4].map(gap=>score({...phase,gap}));
    for(let i=1;i<scores.length;i++) assert.ok(scores[i]<scores[i-1],`${JSON.stringify(phase)}: ${scores}`);
  }
  for(const gap of [2,3,4]) assert.ok(score({gap,period:1,clock:'10:00'})>score({gap,period:2,clock:'10:00'})&&score({gap,period:2,clock:'10:00'})>score({gap,clock:'2:00'}));
  assert.ok(score({period:1,clock:'10:00'})<score({period:2,clock:'10:00'}));
});

test('NHL late decisive states use one combined competitive floor',()=>{
  const tied=['12:00','10:00','7:30','5:00','2:00','1:00'].map(clock=>score({clock}));
  assert.ok(tied.every((value,i)=>i===0||value>tied[i-1]),tied.join(','));
  assert.ok(tied[1]>=62&&tied[1]<=67&&tied[3]>=74&&tied[3]<=78);
  assert.ok(tied[4]>=82&&tied[4]<=86&&tied[5]>=86&&tied[5]<=90);
  const normal=score({gap:1}),leading=score({gap:1,manpower:'leadingPP'}),pp=score({gap:1,manpower:'trailingPP'});
  const pulled=score({gap:1,clock:'1:00',manpower:'pulled'}),combined=score({gap:1,clock:'1:00',manpower:'sixOnFour'});
  assert.ok(pp>normal&&pp>leading&&pulled>normal&&combined>pulled);
  assert.ok(combined>=90&&combined<=94,'combined leverage alone is not an automatic 99');
  assert.ok(score({gap:1,manpower:'fiveOnThree'})>=88);
  assert.ok(score({gap:2,manpower:'pulled'})>score({gap:2}));
  assert.ok(score({gap:4,manpower:'sixOnFour'})<20);
  const f=fixture({gap:1,manpower:'sixOnFour'});
  const teams=f.competition.competitors.map(c=>[c.team.displayName,'',c.score,'','','','','',c.team.id]);
  const state=core.hockeyOnIceState(f.summary,teams);
  assert.equal(state.pulledGoalieTeamId,'a');assert.equal(state.powerPlayTeamId,'a');assert.equal(state.powerPlayAdvantage,1);
  delete f.summary.boxscore;
  assert.equal(core.hockeyOnIceState(f.summary,teams).pulledGoalieTeam,null,'missing goalie roster is not evidence of a pull');
});

test('NHL two-goal third-period runway stays viable while three-goal deficits remain remote',()=>{
  const clocks=['10:00','5:00','2:00','1:00'];
  const two=clocks.map(clock=>score({gap:2,clock}));
  const three=clocks.map(clock=>score({gap:3,clock}));
  assert.ok(two[0]>=32&&two[0]<=38&&two[1]>=20&&two[1]<=27&&two[2]>=10&&two[2]<=16&&two[3]<10,two.join(','));
  assert.ok(two.every((value,i)=>i===0||value<two[i-1]));
  assert.ok(three.slice(0,3).every((value,i)=>value<=two[i]-5)&&three[3]<two[3],`${two} / ${three}`);
  assert.ok(three.every((value,i)=>i===0||value<=three[i-1]));
});

test('NHL regular OT, shootout, playoff OT depth and deciding final separate without chance data',()=>{
  const end=score(cases['Tied end regulation']),start=score(cases['Start regular-season OT']);
  const regular=score(cases['Regular-season OT']),shootout=score(cases.Shootout),playoff=score(cases['Playoff OT']);
  assert.equal(end,90);assert.ok(start>=91&&start<=92);assert.ok(regular>=92&&regular<=94);assert.ok(shootout>=89&&shootout<=92);
  assert.ok(start>=end&&regular>=start&&shootout>=89,'regulation to OT to shootout has no artificial collapse');
  assert.ok(playoff>=regular+2);
  assert.ok(score(cases['Playoff 2OT'])>playoff);
  assert.ok(score(cases['Playoff 3OT'])>score(cases['Playoff 2OT']));
  assert.equal(score(cases['Stanley Cup Final deciding game OT']),99);
  assert.ok(score({period:4,postseason:true,deciding:true,clock:'15:00'})>=96);
  assert.ok(score({period:4,postseason:true,final:true,clock:'15:00'})>=95);
  const f=fixture({period:7,postseason:true});assert.equal(hockeyOvertime(f.event,f.competition,f.summary).depth,4);
});

test('NHL end-regulation target consumes generic stacking and leaves limited dramatic-history headroom',()=>{
  const ordinary=evaluate(core,{clock:'0:00'});
  assert.equal(ordinary.score,90);
  const dramatic=[goal(0,1,1,'15:00'),goal(1,1,1,'10:00'),goal(2,1,2,'15:00'),goal(2,2,2,'10:00'),
    goal(2,3,3,'5:00'),goal(3,3,3,'0:10','Shorthanded goal, extra attacker goal')];
  const end=evaluate(core,{clock:'0:00',plays:dramatic});
  assert.equal(end.base+end.bonus,90);assert.equal(end.history,5);assert.equal(end.score,95);
  assert.ok(end.historyFactors.some(f=>f.label==='Late tying goal'));
  const routine=[goal(1,0,1,'15:00'),goal(1,1,2,'10:00'),goal(2,1,2,'5:00'),goal(2,2,3,'10:00'),goal(3,2,3,'5:00'),goal(3,3,3,'4:00')];
  const routineEnd=evaluate(core,{clock:'0:00',plays:routine});
  assert.ok(routineEnd.score>=90&&routineEnd.score<=92);
  const f=fixture({clock:'0:00',goals:2,plays:dramatic});
  f.summary.winprobability=[{homeWinPercentage:.5}];
  f.summary.plays.push(...Array.from({length:5},(_,i)=>({period:{number:3},clock:{displayValue:`0:${String(50-i*10).padStart(2,'0')}`},team:{id:i%2?'a':'h'},text:'Shot on goal'})));
  const teams=f.competition.competitors.map(c=>({...c,id:c.team.id}));
  const rating=core.rateGame('NHL','live',teams,f.event,f.competition,'');
  const game={sport:'NHL',state:'live',sourceEvent:f.event,sourceCompetition:f.competition,
    teams:teams.map(c=>[c.team.displayName,c.team.abbreviation,c.score,'','','',null,c.homeAway,c.id]),baseScore:rating.score,score:rating.score,
    openingScore:rating.openingScore,liveRawStatus:f.competition.status};
  core.applyLiveSnapshot(game,f.competition,f.summary);
  assert.equal(game.score,92);assert.equal(game.live.components.probability,16);assert.ok(game.live.components.pressure>0);
  assert.equal(game.live.components.milestone,3);assert.ok(game.live.components.eventShock>0);
  const history=core.momentumImpact('NHL',f.summary,core.gameProgress('NHL',f.competition),'live');
  assert.equal(core.clampScore(game.score+history.points),97,'verified last-seconds drama remains below 99');
});

test('NHL regular-season end-regulation history headroom decays with dramatic-event recency and significance',()=>{
  const sequence=(clock,major=false)=>major
    ? [goal(0,1,1,'15:00'),goal(0,2,2,'10:00'),goal(1,2,3,'3:00'),goal(2,2,3,clock,'Extra attacker goal')]
    : [goal(0,1,1,'15:00'),goal(1,1,1,'10:00'),goal(2,1,2,'15:00'),goal(2,2,2,'10:00'),
      goal(2,3,3,'5:00'),goal(3,3,3,clock)];
  const scores=['4:16','2:00','0:45'].map(clock=>evaluate(core,{clock:'0:00',plays:sequence(clock)}));
  assert.deepEqual(scores.map(item=>item.score),[92,93,94]);
  assert.deepEqual(scores.map(item=>item.history),[2,3,4]);
  const exceptional=evaluate(core,{clock:'0:00',plays:sequence('0:15',true)});
  assert.equal(exceptional.score,95);assert.equal(exceptional.history,5);
  const stale=evaluate(core,{clock:'0:00',plays:sequence('5:30')});
  assert.equal(stale.score,90);assert.equal(stale.history,0);

  const reproducer=fixture({clock:'0:00',goals:2,plays:sequence('4:16')});
  reproducer.summary.winprobability=[{homeWinPercentage:.5}];
  reproducer.summary.plays.push(...Array.from({length:5},(_,i)=>({period:{number:3},clock:{displayValue:`0:${String(50-i*10).padStart(2,'0')}`},team:{id:i%2?'a':'h'},text:'Shot on goal'})));
  const teams=reproducer.competition.competitors.map(c=>({...c,id:c.team.id}));
  const rating=core.rateGame('NHL','live',teams,reproducer.event,reproducer.competition,'');
  const game={sport:'NHL',state:'live',sourceEvent:reproducer.event,sourceCompetition:reproducer.competition,
    teams:teams.map(c=>[c.team.displayName,c.team.abbreviation,c.score,'','','',null,c.homeAway,c.id]),baseScore:rating.score,score:rating.score,
    openingScore:rating.openingScore,liveRawStatus:reproducer.competition.status};
  core.applyLiveSnapshot(game,reproducer.competition,reproducer.summary);
  const history=core.momentumImpact('NHL',reproducer.summary,core.gameProgress('NHL',reproducer.competition),'live');
  assert.equal(game.score,92);assert.equal(history.points,2);assert.equal(core.clampScore(game.score+history.points),94);
});

test('NHL completed overtime floors consume earned history and retain depth ordering',()=>{
  const completed=input=>evaluate(core,{completed:true,gap:1,clock:'0:00',...input});
  const regular=completed({period:4}),shootout=completed({period:5,shootout:true});
  const playoff=[4,5,6].map(period=>completed({period,postseason:true}));
  assert.equal(regular.score,63);assert.equal(shootout.score,61);
  assert.deepEqual(playoff.map(item=>item.score),[78,85,90]);
  const dramatic=[goal(0,1,1,'18:00'),goal(0,2,1,'10:00'),goal(0,3,2,'10:00'),goal(1,3,2,'5:00'),
    goal(2,3,3,'5:00'),goal(3,3,3,'1:00','Extra attacker goal'),goal(4,3,3,'0:30'),
    goal(4,4,3,'0:10'),goal(5,4,4,'3:00')];
  const earned=completed({period:4,plays:dramatic});
  assert.ok(earned.score>=80);
  assert.ok(!earned.historyFactors.some(f=>/floor/.test(f.label)),'earned 80+ OT rating is unchanged by floor');
});

test('NHL pressure uses direction, elapsed seconds, premium chances and score leverage',()=>{
  const f=fixture({gap:1});
  const plays=side=>Array.from({length:6},(_,i)=>({text:i%2?'Breakaway saved by goalie':'Shot on goal',team:{id:side==='balanced'?(i%2?'a':'h'):side},period:{number:3},clock:{displayValue:`${2+Math.floor(i/3)}:${String((i%3)*20).padStart(2,'0')}`}}));
  const pressure=items=>hockeyPressure({...f.summary,plays:items},.967,1,f.competition).points;
  assert.ok(pressure(plays('a'))>pressure(plays('balanced'))&&pressure(plays('balanced'))>pressure(plays('h')));
  const stale=plays('a').map((p,i)=>({...p,clock:{displayValue:`${3+i}:45`}}));
  assert.ok(pressure(plays('a'))>pressure(stale));
  const early=fixture({gap:1,period:1,clock:'2:00'});
  assert.ok(hockeyPressure({...early.summary,plays:plays('a').map(p=>({...p,period:{number:1}}))},.3,1,early.competition).points<pressure(plays('a')));
  assert.equal(hockeyPressure({...f.summary,plays:plays('a')},.967,4,f.competition).points,0);
  for(const text of ['Shot on goal','Saved by goalie','Save','Breakaway','Penalty shot','Hit the post','Off the crossbar','Point-blank chance']) {
    assert.ok(pressure(plays('a').map(p=>({...p,text})))>0,text);
  }
});

test('NHL completed paths distinguish late ties, late winners, lead changes and multi-goal comebacks',()=>{
  const history=plays=>hockeyHistory(fixture({completed:true,clock:'0:00',plays}).summary,1,'completed');
  const ordinary=[goal(1,0,1,'18:00'),goal(2,0,1,'10:00'),goal(3,0,2,'10:00'),goal(4,0,2,'5:00'),goal(4,1,3,'12:00'),goal(4,2,3,'8:00'),goal(4,3,3,'3:00')];
  const dramatic=[goal(0,1,1,'18:00'),goal(0,2,1,'10:00'),goal(0,3,2,'10:00'),goal(1,3,2,'5:00'),goal(2,3,3,'5:00'),goal(3,3,3,'1:00','Extra attacker goal'),goal(4,3,3,'0:12')];
  assert.ok(history(dramatic).points>=history(ordinary).points+20);
  for(const label of ['Late tying goal','Late go-ahead goal','Goalie-pull comeback','Erased a multi-goal deficit']) assert.ok(history(dramatic).factors.some(f=>f.label===label));
  const two=[goal(0,1,1,'18:00'),goal(0,2,1,'10:00'),goal(1,2,2,'10:00'),goal(2,2,2,'5:00')];
  assert.ok(history(two).factors.some(f=>/multi-goal/.test(f.label)));
  const changes=[goal(1,0,1,'15:00'),goal(1,1,1,'10:00'),goal(1,2,2,'15:00'),goal(2,2,2,'10:00'),goal(3,2,3,'15:00')];
  assert.ok(history(changes).factors.some(f=>f.label==='2 lead changes'));
  assert.ok(history(ordinary).withinOneShare<history(changes).withinOneShare);
  const final=fixture({completed:true,period:6,postseason:true,final:true,deciding:true,gap:1,plays:dramatic});
  const game=normalizeEvent(final.event,'NHL');enrichGame(game,final.summary);assert.equal(game.score,99);
  assert.equal(game.factors.filter(f=>f.label==='Decisive last play').length,0,'NHL finishing path counted once');
});

test('NHL moneyline magnitude is modest at +180 and grows smoothly; milestones respect competitiveness',()=>{
  const values=[180,220,250,300,500,1000].map(price=>evaluate(core,{price,winningDog:true,gap:1,completed:true}).upset);
  assert.ok(values[0]>=3&&values[0]<=5);for(let i=1;i<values.length;i++) assert.ok(values[i]>values[i-1]);
  assert.ok(evaluate(core,{price:250,winningDog:true,gap:1}).upset>0);
  for(const goals of [2,3]) {
    assert.ok(score({gap:1,goals})>score({gap:1}));
    assert.ok(score({gap:5,goals})-score({gap:5})<=1);
    assert.ok(score({gap:5,goals})<20);
  }
});

test('all NHL synthetic archetypes match browser and Node engines',()=>{
  const browser=vm.runInNewContext(`${source.scoringSource()}\nSportsRadarScore`);
  for(const [name,input] of Object.entries(cases)) assert.deepEqual(evaluate(core,input),structuredClone(evaluate(browser,input)),name);
});

test('NHL final summaries without clocks include the OT winner and incomplete ledgers do not invent competitive time',()=>{
  const summary={header:{competitions:[{status:{type:{detail:'Final/OT'}}}]},plays:[goal(1,0,4,'3:26')]};
  const history=hockeyHistory(summary,1,'completed');
  assert.equal(history.tiedShare,1);
  assert.equal(history.withinOneShare,1);
  assert.ok(history.factors.some(f=>f.label==='Time tied or within one goal'&&f.points===8));
  summary.plays=[goal(4,3,3,'1:00')];
  assert.ok(!hockeyHistory(summary,1,'completed').factors.some(f=>f.label==='Time tied or within one goal'));
  summary.plays=[goal(null,3,3,'1:00')];
  assert.equal(hockeyHistory(summary,1,'completed').points,0);
});

test('NHL elapsed provider play clocks and remaining-clock ledgers describe the same history',()=>{
  const plays=[goal(1,0,1,'15:00'),goal(1,1,1,'10:00'),goal(1,2,2,'15:00'),goal(2,2,3,'1:00'),goal(3,2,3,'0:12')];
  const remaining=fixture({completed:true,clock:'0:00',plays}).summary;
  const elapsed=structuredClone(remaining);
  elapsed.plays.forEach((p,i)=>{
    const [m,s]=p.clock.displayValue.split(':').map(Number),seconds=1200-m*60-s;
    p.clock.displayValue=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;p.sequenceNumber=String(i+1);
  });
  assert.deepEqual(hockeyHistory(elapsed,1,'completed'),hockeyHistory(remaining,1,'completed'));
  const provider=require('./fixtures/real-games/NHL-20261017-401892520.json');
  const history=hockeyHistory(provider.summary,1,'completed');
  assert.equal(history.withinOneShare,1,'all five provider goals remain within one');
  assert.ok(history.factors.some(f=>f.label==='Time tied or within one goal'));
});

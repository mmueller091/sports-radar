import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCore} from '../calibration/helpers.mjs';

const core = await loadCore();

function competition(home,away,status,situation={},extra={}) {
  return {status,situation,competitors:[
    {homeAway:'home',team:{id:'h',displayName:'Home',abbreviation:'HME'},score:String(home)},
    {homeAway:'away',team:{id:'a',displayName:'Away',abbreviation:'AWY'},score:String(away)}
  ],...extra};
}

function score(sport,comp,probability=.8,details={}) {
  const teams = comp.competitors.map(item => ({id:item.team.id,name:item.team.displayName,
    abbr:item.team.abbreviation,score:item.score}));
  const opening = core.rateGame(sport,'live',teams,{},comp,'');
  const game = {sport,state:'live',openingScore:opening.openingScore,
    baseScore:opening.score,score:opening.score,liveRawStatus:comp.status,
    liveRawSituation:comp.situation,
    teams:teams.map(team => [team.name,team.abbr,team.score,'','','',null,'',team.id])};
  core.applyLiveSnapshot(game,comp,{header:{competitions:[comp]},
    winprobability:[{homeWinPercentage:probability}],...details});
  return {score:game.score,bonus:game.live.bonus,live:game.live};
}

for (const sport of ['NBA','NCAAB']) {
  test(`${sport} final possession has a directional, clock-ramped competitive floor`,() => {
    const period = sport === 'NBA' ? 4 : 2;
    const status = clock => ({period,displayClock:clock,type:{state:'in',detail:`${clock} - period ${period}`}});
    const trailing = score(sport,competition(103,101,status('0:08'),{possession:'a'}));
    const leading = score(sport,competition(103,101,status('0:08'),{possession:'h'}));
    const ended = score(sport,competition(103,101,status('0:02'),{possession:'h'}),.95);
    assert.equal(trailing.live.winProbability,.8);
    assert.equal(trailing.bonus,20);
    assert.ok(trailing.score >= leading.score + 3);
    assert.ok(ended.score <= trailing.score - 8);
    const early = core.basketballSituationImpact(
      {sport,teams:[['Home','HME','103','','','','','','h'],['Away','AWY','101','','','','','','a']]},
      status('0:30'),.98,2,{possession:'a'});
    const late = core.basketballSituationImpact(
      {sport,teams:[['Home','HME','103','','','','','','h'],['Away','AWY','101','','','','','','a']]},
      status('0:08'),.995,2,{possession:'a'});
    assert.ok(early.finalPossession.urgency < late.finalPossession.urgency);
  });
}

function hockeyDetails(kind) {
  const entries = (goalie,prefix,count=6) => [
    {athleteid:goalie},...Array.from({length:count-1},(_,i) => ({athleteid:`${prefix}${i}`}))
  ];
  return {onIce:[
    {teamId:'h',entries:entries('hg','h',kind === 'trailingPP' ? 5 : 6)},
    {teamId:'a',entries:kind === 'pulled'
      ? Array.from({length:6},(_,i) => ({athleteid:`a${i}`}))
      : entries('ag','a',kind === 'leadingPP' ? 5 : 6)}
  ],boxscore:{players:['h','a'].map(id => ({team:{id},statistics:[{
    name:'goalies',athletes:[{athlete:{id:`${id}g`}}]
  }]}))}};
}

test('NHL trailing power play and extra attacker outrank leading-team control',() => {
  const status = {period:3,displayClock:'1:20',type:{state:'in',detail:'1:20 - 3rd Period'}};
  const comp = competition(3,2,status);
  const trailing = score('NHL',comp,.8,hockeyDetails('trailingPP'));
  const leading = score('NHL',comp,.8,hockeyDetails('leadingPP'));
  const pulled = score('NHL',comp,.8,hockeyDetails('pulled'));
  const ended = score('NHL',comp,.95,hockeyDetails('even'));
  assert.ok(trailing.score >= leading.score + 4);
  assert.ok(pulled.score >= leading.score + 4);
  assert.ok(ended.score <= trailing.score - 8);
  assert.equal(trailing.live.winProbability,.8);
});

function soccerDetails(cardTeam,shotTeam) {
  return {boxscore:{teams:['h','a'].map(id => ({team:{id},statistics:[{
    name:'redCards',value:id === cardTeam ? 1 : 0
  }]}))},plays:shotTeam ? [
    'Breakaway saved by goalkeeper','Shot hit the post',
    'Close range shot on goal','Shot hit the crossbar'
  ].map(text => ({text,team:{id:shotTeam}})) : []};
}

test('Soccer leader red card and trailing pressure outrank leader pressure',() => {
  const status = {period:2,displayClock:'90+2',type:{state:'in',detail:"90+2 - Second Half"}};
  const comp = competition(2,1,status);
  const trailing = score('Soccer',comp,.8,soccerDetails('h','a'));
  const leading = score('Soccer',comp,.8,soccerDetails('a','h'));
  const ended = score('Soccer',comp,.95,soccerDetails(null,null));
  assert.ok(trailing.score >= leading.score + 4);
  assert.ok(ended.score <= trailing.score - 8);
  assert.ok(trailing.live.components.pressure > leading.live.components.pressure);
  assert.equal(trailing.live.winProbability,.8);
  const leaderCard = core.soccerSituationImpact(comp,soccerDetails('h',null),status,1,1);
  const trailerCard = core.soccerSituationImpact(comp,soccerDetails('a',null),status,1,1);
  assert.ok(leaderCard.points >= trailerCard.points + 4);
  const unattributed = soccerDetails(null,'a');
  unattributed.plays.forEach(play => { delete play.team; });
  assert.equal(
    core.dangerousChanceImpact('Soccer',unattributed,.99,1,comp).points,
    core.dangerousChanceImpact('Soccer',unattributed,.99,1).points,
    'unattributed chances retain generic scoring'
  );
});

test('MLB bottom-ninth decisive plate appearance survives low WP without rewarding blowout traffic',() => {
  const bottom = {period:9,type:{state:'in',detail:'Bottom 9th'}};
  const top = {period:9,type:{state:'in',detail:'Top 9th'}};
  const loaded = {outs:2,count:'3-2',onFirst:true,onSecond:true,onThird:true};
  const trailing = score('MLB',competition(4,5,bottom,loaded),.2);
  const leading = score('MLB',competition(4,5,top,loaded),.2);
  const ended = score('MLB',competition(4,5,bottom,{outs:3,count:'0-0'}),.05);
  assert.equal(trailing.bonus,20);
  assert.ok(trailing.score > leading.score);
  assert.ok(ended.score <= trailing.score - 8);
  assert.equal(trailing.live.winProbability,.2);
  const blowout = core.baseballSituationImpact(
    {sport:'MLB',teams:[['Home','HME','2','','','','','','h'],['Away','AWY','10','','','','','','a']]},
    competition(2,10,bottom,loaded),bottom,loaded,.98,8);
  assert.equal(blowout.points,0);
});

test('MLB decisive plate appearance includes the road team in the ninth and extra innings',() => {
  const top = inning => ({period:inning,type:{state:'in',detail:`Top ${inning}th`}});
  const bottom = {period:9,type:{state:'in',detail:'Bottom 9th'}};
  const atPlate = {outs:2,count:'3-2',onFirst:false,onSecond:false,onThird:false};
  const impact = (home,away,status,situation) => core.baseballSituationImpact(
    {sport:'MLB',teams:[['Home','HME',String(home),'','','','','','h'],
      ['Away','AWY',String(away),'','','','','','a']]},
    competition(home,away,status,situation),status,situation,.98,Math.abs(home-away));
  const road = impact(5,4,top(9),atPlate);
  const thirdOut = impact(5,4,top(9),{...atPlate,outs:3});
  const walkOff = impact(5,5,bottom,atPlate);
  const leader = impact(4,5,top(9),atPlate);
  const extra = impact(5,4,top(10),atPlate);
  assert.ok(road.competitiveFloor >= 19);
  assert.equal(thirdOut.competitiveFloor,0);
  assert.ok(walkOff.competitiveFloor >= 19);
  assert.equal(leader.competitiveFloor,0);
  assert.ok(extra.competitiveFloor >= 19);
  const roadRated = score('MLB',competition(5,4,top(9),atPlate),.8);
  const outRated = score('MLB',competition(5,4,top(9),{...atPlate,outs:3}),.95);
  const leaderRated = score('MLB',competition(4,5,top(9),atPlate),.8);
  assert.ok(roadRated.bonus >= 19);
  assert.ok(roadRated.score >= outRated.score + 8);
  assert.ok(roadRated.score >= leaderRated.score + 5);
  const first = impact(5,4,top(9),{outs:1,count:'1-1',onFirst:true});
  const second = impact(5,4,top(9),{outs:1,count:'1-1',onSecond:true});
  assert.ok(second.competitiveFloor > first.competitiveFloor);
});

test('Tennis deciding-set match point outranks rout match point without label stacking',() => {
  const status = {period:3,type:{state:'in',detail:'Deciding third set'}};
  const high = score('Tennis',competition(1,1,status,{matchPoint:true,tiebreak:true}),.8);
  const control = score('Tennis',competition(1,1,status,
    {description:'Deuce',servingTeam:{id:'h'}}),.8);
  const routine = score('Tennis',competition(1,0,{period:2,type:{state:'in',detail:'Second set'}},{matchPoint:true}),.8);
  const ended = score('Tennis',competition(1,1,status,{description:'Deuce'}),.95);
  assert.ok(high.score >= routine.score + 4);
  assert.ok(high.score >= control.score + 5);
  assert.ok(ended.score <= high.score - 8);
  assert.equal(high.live.components.situation,12);
  assert.equal(high.bonus,20);
  assert.equal(high.live.winProbability,.8);
  const game = {sport:'Tennis',teams:[['Home','HME','1','','','','','','h'],['Away','AWY','1','','','','','','a']]};
  for (const situation of [{breakPoint:true},{description:'Deuce'},{setPoint:true},{tiebreak:true}]) {
    const comp = competition(1,1,status,situation);
    const earlier = core.tennisSituationImpact(game,comp,{},status,.5);
    const later = core.tennisSituationImpact(game,comp,{},status,.95);
    assert.ok(later.points >= earlier.points);
    assert.ok(later.points < high.live.components.situation);
  }
  const overlapping = core.tennisSituationImpact(game,
    competition(1,1,status,{setPoint:true,breakPoint:true,tiebreak:true}),{},status,.95);
  assert.ok(overlapping.points < 12,'point labels share one capped match-leverage value');
});

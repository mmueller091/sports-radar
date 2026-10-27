import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCore} from '../calibration/helpers.mjs';

const core = await loadCore();

function competition(home, away, clock, possession, spot, down=2, distance=6,extra={}) {
  return {
    status:{period:4,displayClock:clock,type:{state:'in',detail:`${clock} - 4th Quarter`}},
    competitors:[
      {homeAway:'home',team:{id:'bay',displayName:'Baylor',abbreviation:'BAY'},score:String(home)},
      {homeAway:'away',team:{id:'kan',displayName:'Kansas',abbreviation:'KAN'},score:String(away)}
    ],
    situation:{possession,down,distance,downDistanceText:`${down === 4 ? '4th' : down === 1 ? '1st' : '2nd'} & ${distance} at ${spot}`,possessionText:spot,...extra}
  };
}

function scoreSequence(sport) {
  const first = competition(21,19,'7:00','kan','KAN 40');
  const teams = first.competitors.map(item => ({id:item.team.id,name:item.team.displayName,abbr:item.team.abbreviation,score:item.score}));
  const opening = core.rateGame(sport,'live',teams,{},first,'');
  const game = {
    sport,state:'live',teams:teams.map(team => [team.name,team.abbr,team.score,'','','',null,'',team.id]),
    openingScore:opening.openingScore,baseScore:opening.score,score:opening.score,
    liveRawStatus:first.status,liveRawSituation:first.situation
  };
  const snapshot = (target,comp,probability) => {
    core.applyLiveSnapshot(target,comp,{header:{competitions:[comp]},winprobability:[{homeWinPercentage:probability}]});
    return {score:target.score,base:target.baseScore,bonus:target.live.bonus,situation:target.live.components.situation,
      probability:target.live.components.probability,winProbability:target.live.winProbability,reasons:target.live.reasons};
  };
  const early = snapshot(game,first,.54);
  const drive = snapshot(game,competition(24,19,'1:50','kan','KAN 25'),.80);
  const advanced = snapshot(structuredClone(game),competition(24,19,'1:50','kan','BAY 15',2,6,{isRedZone:true}),.80);
  const leader = snapshot(structuredClone(game),competition(24,19,'1:50','bay','BAY 25'),.80);
  const failed = snapshot(game,competition(24,19,'0:50','bay','BAY 42',1,10),.94);
  return {early,drive,advanced,leader,failed};
}

for (const sport of ['NFL','CFB']) {
  test(`${sport}: a trailing team's late winning-TD drive stays exciting until possession is lost`, () => {
    const {early,drive,advanced,leader,failed} = scoreSequence(sport);
    assert.ok(drive.score >= early.score,`${sport}: ${JSON.stringify({early,drive,advanced,leader,failed})}`);
    assert.ok(advanced.score > drive.score,`${sport}: ${JSON.stringify({drive,advanced})}`);
    assert.ok(drive.score >= leader.score + 5,`${sport}: ${JSON.stringify({drive,leader})}`);
    assert.ok(failed.score <= drive.score - 8,`${sport}: ${JSON.stringify({drive,failed})}`);
    assert.ok(drive.probability < early.probability,'win probability still reflects the more one-sided game');
    assert.equal(drive.probability,leader.probability,'possession does not alter the probability component');
    assert.equal(drive.winProbability,.80);
    assert.equal(drive.bonus,Math.round((99-drive.base)*(sport === 'NFL' ? .70 : .73)),'the active drive reaches its competitive floor at own 25');
    assert.equal(advanced.bonus,Math.round((99-advanced.base)*(sport === 'NFL' ? .76 : .79)),'red-zone leverage replaces overlapping situation points');
    assert.match(drive.reasons.join(' '),sport === 'NFL' ? /winning TD drive/ : /viable tying or winning possession/);
    assert.doesNotMatch(leader.reasons.join(' '),/winning TD drive/);
    assert.doesNotMatch(failed.reasons.join(' '),/winning TD drive/);
  });

  test(`${sport}: decisive-drive leverage ramps with time and field position`, () => {
    const game = {sport,teams:[
      ['Baylor','BAY','24','','','','','','bay'],
      ['Kansas','KAN','19','','','','','','kan']
    ]};
    const impact = (clock,spot,extra={},period=4,down=2) => {
      const status = {period,displayClock:clock};
      const situation = {
        possession:'kan',down,distance:6,
        downDistanceText:`${down === 4 ? '4th' : '2nd'} & 6 at ${spot}`,
        possessionText:spot,...extra
      };
      return core.footballSituationImpact(game,{},status,situation,
        core.gameProgress(sport,{status}),5);
    };
    const four = impact('4:00','KAN 40');
    const three = impact('3:00','KAN 40');
    const twoThirty = impact('2:30','KAN 40');
    const two = impact('1:50','KAN 40');
    const acrossMidfield = impact('1:50','BAY 40');
    const redZone = impact('1:50','BAY 15',{isRedZone:true});
    const goal = impact('1:50','BAY 2',{isRedZone:true,isGoalToGo:true});
    const fourth = impact('1:50','KAN 40',{},4,4);
    assert.ok(four.points < three.points && three.points < two.points);
    assert.equal(four.decisiveDrive,null);
    assert.equal(three.decisiveDrive.urgency,.5);
    assert.equal(twoThirty.decisiveDrive.urgency,.75);
    assert.equal(two.decisiveDrive.urgency,1);
    assert.ok(two.points < acrossMidfield.points);
    assert.ok(acrossMidfield.points < redZone.points);
    assert.ok(redZone.points < goal.points);
    assert.ok(fourth.points > two.points);
    assert.ok(goal.points <= 12);
    assert.match(two.reasons.join(' '),/winning TD drive/);
    if (sport === 'CFB') {
      assert.ok(impact('','KAN 40',{},5).points >= three.points,'clockless CFB overtime keeps decisive-drive leverage');
    } else {
      assert.ok(impact('','KAN 40',{},5).points < two.points,'unknown NFL overtime possession rights get modest leverage');
    }
  });
}

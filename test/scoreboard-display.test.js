import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {baseballSituation,footballSituation,basketballBoxScore} from '../alerts-worker/src/display-model.js';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/game-model.js';

const source = fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const context = vm.createContext({safeText:value => String(value).replaceAll('<','&lt;').replaceAll('"','&quot;')});
for (const name of ['footballAccessibleSituation','possessionMarkup','footballSituationMarkup','baseballSituationMarkup','basketballBoxScoreMarkup','basesMarkup']) {
  const start = source.indexOf(`function ${name}(`);
  vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
}
const teams = [['Baltimore','BAL','24','','','','','','1'],['Denver','DEN','21','','','','','','2']];
for (const sport of ['NFL','CFB']) {
  test(`${sport}: possession, punt/turnover changes, missing state and field position`,() => {
    const game={sport,state:'live',teams,liveRawSituation:{possession:'1',down:3,distance:4,possessionText:'DEN 38'}};
    const refresh=()=>game.footballSituation=footballSituation(game);
    refresh();
    assert.equal(context.possessionMarkup(game,teams[0]).includes('<svg'),true);
    assert.equal(context.possessionMarkup(game,teams[1]),'');
    assert.match(context.footballSituationMarkup(game),/3rd &amp; 4|3rd & 4/);
    assert.match(context.footballSituationMarkup(game),/DEN 38/);
    for (const possession of ['2','1']) {
      game.liveRawSituation.possession=possession;refresh();
      assert.equal(teams.filter(team=>context.possessionMarkup(game,team)).length,1);
      assert.ok(context.possessionMarkup(game,teams[Number(possession)-1]));
    }
    game.liveRawSituation={down:1,distance:7,isGoalToGo:true};refresh();
    assert.equal(game.footballSituation.downAndDistance,'1st & Goal');
    assert.equal(game.footballSituation.fieldPosition,'');
    assert.ok(teams.every(team=>!context.possessionMarkup(game,team)));
    game.liveRawSituation={};refresh();assert.equal(context.footballSituationMarkup(game),'');
    for(const state of ['upcoming','completed']) {
      game.state=state;game.footballSituation={possessionTeamId:'1',downAndDistance:'3rd & 4',fieldPosition:'DEN 38'};
      assert.equal(context.footballSituationMarkup(game),'');
      assert.equal(context.possessionMarkup(game,teams[0]),'');
      assert.equal(footballSituation(game),null);
    }
  });
}

test('accepted summary updates situation; missing situation clears possession; older summary cannot rewind it',()=>{
  const comp={status:{period:4,displayClock:'5:00',type:{state:'in'}},competitors:teams.map(t=>({team:{id:t[8],abbreviation:t[1]},score:t[2]})),situation:{possession:'1',down:3,distance:4,possessionText:'DEN 38'}};
  const game=normalizeEvent({id:'1',competitions:[comp]},'NFL');
  const update=(clock,situation)=>enrichGame(game,{header:{competitions:[{...comp,status:{...comp.status,displayClock:clock},situation}]}});
  update('4:50',{possession:'2'});assert.equal(game.footballSituation.possessionTeamId,'2');
  update('5:00',{possession:'1'});assert.equal(game.footballSituation.possessionTeamId,'2');
  update('4:40',undefined);assert.equal(game.footballSituation.possessionTeamId,null);
});

test('MLB live situation uses explicit bases, outs, and count; missing fields stay hidden',()=>{
  const teams=[['Baltimore','BAL','4','','','','','','1'],['New York','NYY','3','','','','','','2']];
  const game=normalizeEvent({id:'mlb1',competitions:[{status:{type:{state:'in'}},competitors:teams.map(team=>({team:{id:team[8],abbreviation:team[1]},score:team[2]})),situation:{onFirst:true,onSecond:false,onThird:true,outs:2,balls:2,strikes:1}}]},'MLB');
  assert.deepEqual(JSON.parse(JSON.stringify(game.baseballSituation)),{bases:{first:true,second:false,third:true},outs:2,count:'2-1'});
  const html=context.baseballSituationMarkup(game);
  assert.match(html,/base first occupied/);assert.match(html,/base third occupied/);assert.match(html,/base second(?! occupied)/);assert.match(html,/2-1/);assert.equal((html.match(/out-dot active/g)||[]).length,2);
  game.liveRawSituation={balls:1};game.baseballSituation=baseballSituation(game);
  assert.equal(game.baseballSituation,null);assert.equal(context.baseballSituationMarkup(game),'');
  game.liveRawSituation={outs:0};game.baseballSituation=baseballSituation(game);
  assert.match(context.baseballSituationMarkup(game),/baseball-outs/);assert.equal(context.baseballSituationMarkup({...game,state:'completed'}),'');
});

const summary={boxscore:{players:['Home','Away'].map((displayName,i)=>({team:{id:String(i),displayName},statistics:[{labels:['PTS','MIN','FG','3PT','FT','REB','AST','STL','BLK','TO','PF'],athletes:[
  {athlete:{id:'a',displayName:'Starter Player'},starter:true,stats:['30','37','11-18','2-4','6-7','13','11','2','1','4','3']},
  {athlete:{id:'b',displayName:'Bench Player'},starter:false,stats:['2']},
  {athlete:{id:'c',displayName:'Inactive Player'},didNotPlay:true,reason:'Ankle injury',stats:[]}
],totals:['100','240','40-80']}]}))}};
for (const sport of ['NBA','NCAAB']) {
  test(`${sport}: full source rows, columns, starters, DNP, totals and missing stats`,()=>{
    const box=basketballBoxScore(summary,sport);
    assert.equal(box.teams.length,2);assert.equal(box.teams[0].players.length,3);
    assert.equal(box.teams[0].players[0].stats.fg,'11-18');assert.equal(box.teams[0].players[0].stats.points,'30');
    assert.equal(box.teams[0].players[1].stats.minutes,null);
    for(const state of ['in','post']) {
      const html=context.basketballBoxScoreMarkup({basketballBoxScore:box,header:{competitions:[{status:{type:{state}}}]}},sport);
      for(const expected of ['Home','Away','Starter','Bench','DNP · Ankle injury','TEAM','11-18','3PT']) assert.ok(html.includes(expected));
      assert.match(html,/tabindex="0"/);
    }
    assert.match(context.basketballBoxScoreMarkup({},sport),/Box score unavailable/);
  });
}

test('frontend stays on Worker routes and mobile tables contain overflow',()=>{
  assert.doesNotMatch(source,/https?:\/\/[^'"\s]*espn[^'"\s]*\/(?:scoreboard|summary)/i);
  assert.match(source,/\/game\/\$\{encodeURIComponent\(sport\)\}/);
  const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(css,/\.detail-table-scroll\s*\{[^}]*overflow-x: auto/);
  assert.match(css,/\.basketball-player-table th:first-child\s*\{[^}]*position: sticky/);
});

import {capPregameOracle} from './helpers/cap-pregame-oracle.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import calibration from './helpers/cfb-calibration.cjs';
import nfl from './helpers/nfl-calibration.cjs';
import sourceHelper from './helpers/scoring-source.cjs';
const require = createRequire(import.meta.url);
const core = require('../rating-core.js');
const baseline = require('../calibration/cfb-baseline.json');
const {cfbClockRunway,cfbOvertime,cfbModel} = require('../scoring/sports/cfb.js');
const before = vm.runInNewContext(`${capPregameOracle(gunzipSync(fs.readFileSync(new URL('./fixtures/scoring-core-before-cfb.js.gz',import.meta.url))).toString())}\nSportsRadarScore`);
const browser = vm.runInNewContext(`${sourceHelper.scoringSource()}\nSportsRadarScore`);
const {fixture,evaluate,evaluateFixture,cases,margins} = calibration;
const score = input => evaluate(core,input).score;
const s = key => score(cases[key]);
const same = (a,b,message) => assert.deepEqual(structuredClone(a),structuredClone(b),message);

test('CFB A-Y calibration: urgency, viability, consequences, upset and stakes ordering', () => {
  for (const [higher,lower] of [['F','C'],['C','B'],['B','A'],['C','E'],['E','D'],['G','H'],['H','I'],['K','J'],['M','N'],['O','K'],['T','S']]) {
    assert.ok(s(higher)>s(lower),`${higher}=${s(higher)} > ${lower}=${s(lower)}`);
  }
  assert.ok(s('L')>=s('K') && s('U')>=s('T') && s('V')>=s('U'));
  assert.ok(s('K')>=s('J')+4,'large spread materially changes live upset tension');
  for (const [key,minimum,maximum] of [['A',35,60],['B',65,84],['C',85,91],['F',90,96],['P',94,98],['Q',90,97],['R',90,98],['S',87,94],['T',95,98],['U',95,99]]) {
    assert.ok(s(key)>=minimum && s(key)<=maximum,`${key}=${s(key)} in ${minimum}..${maximum}`);
  }
  assert.equal(s('V'),99);
  assert.ok(s('P')>s('F'),'elite ranked pairing scales decisive significance');
  assert.ok(s('W')<20 && s('W')<s('P')-60);
  assert.ok(s('I')<20 && s('N')<20);
  assert.ok(s('Q')>score({...cases.Q,clock:'3:00'}));
  assert.ok(s('R')>score({...cases.R,period:1,clock:'9:00'})+30);
  assert.ok(s('X')>=65);
  assert.equal(s('X'),s('Y'),'no CFB live stagnation penalty without independent calibration');
});

test('CFB margin grid preserves wider comeback windows, then collapses without opportunities', () => {
  same(core.footballLiveCloseness('CFB','7',.8),core.footballLiveCloseness('CFB',7,.8),'numeric margin strings preserve public helper compatibility');
  for (const time of ['30:00','15:00','8:00','4:00','2:00']) {
    const values = [7,10,14,17,21,28].map(gap => score(margins[`${time}/${gap}`]));
    for (let i=1;i<values.length;i++) assert.ok(values[i-1]>=values[i],`${time}: ${values}`);
  }
  assert.ok(s('G')>=40 && s('H')>=25);
  for (const gap of [14,17,21,28]) {
    assert.ok(score(margins[`8:00/${gap}`])>score(margins[`2:00/${gap}`]));
  }
  for (const gap of [10,14,17,21]) {
    const f = fixture(margins[`8:00/${gap}`]);
    const p = core.gameProgress('CFB',f.competition);
    assert.ok(core.footballLiveCloseness('CFB',gap,p,f.competition).close > core.footballLiveCloseness('NFL',gap,p,f.competition).close);
  }
});

test('CFB runoff uses possession, validated timeout fields, down, field and season', () => {
  const runway = input => cfbClockRunway(fixture({...cases.D,...input}).competition);
  assert.equal(runway({timeouts:0}).expectedPossessions,0);
  assert.ok(runway({timeouts:3}).expectedPossessions>runway({timeouts:1}).expectedPossessions);
  assert.equal(runway({timeouts:3}).offensiveTimeouts,0,'timeouts spent getting the ball cannot be reused on offense');
  assert.ok(cfbClockRunway(fixture({...cases.C,clock:'15:00'}).competition).expectedPossessions<=5,'hurry-up estimate stays within a quarter pace budget');
  assert.ok(runway({down:3}).remaining>runway({down:1}).remaining);
  assert.ok(runway({clock:'2:30',year:2026}).remaining>runway({clock:'2:30',year:2023}).remaining);
  const eventOnly = fixture({...cases.D,clock:'2:30'});
  delete eventOnly.competition.season;
  assert.equal(evaluateFixture(core,eventOnly).score,score({...cases.D,clock:'2:30'}),'event-level season reaches clock runway');
  assert.equal(eventOnly.competition.season,undefined,'input feed is not mutated');
  for (const timeouts of [undefined,null,'',-1,4,true,NaN,Infinity,'three timeouts']) {
    assert.equal(runway({timeouts}),null);
    assert.ok(Number.isFinite(score({...cases.D,timeouts})));
  }
  const f = fixture(cases.D);
  f.competition.situation.awayTimeouts = 3;
  assert.equal(cfbClockRunway(f.competition).timeouts,3);
  f.competition.situation.awayTimeouts = 'invalid';
  assert.equal(cfbClockRunway(f.competition),null,'invalid higher priority field must not invent a count');
  delete f.competition.situation.awayTimeouts;
  delete f.competition.competitors[1].timeouts;
  f.competition.situation.text = 'Away has three timeouts remaining';
  assert.equal(cfbClockRunway(f.competition),null,'text never reconstructs timeout counts');
  for (const spot of ['MIA 5','MIA 25','BUF 20']) {
    const c = fixture({...cases.C,spot}).competition;
    const p = core.gameProgress('CFB',c);
    assert.ok(core.footballLiveCloseness('CFB',5,p,c).expectedPossessions>core.footballLiveCloseness('NFL',5,p,c).expectedPossessions);
  }
});

test('CFB decisive states survive routine plays and respect absent or impossible evidence', () => {
  assert.ok(Math.abs(s('C')-score({...cases.C,clock:'1:22',down:3,distance:9}))<=2);
  assert.ok(score({...cases.C,spot:'BUF 20'})>s('C'));
  assert.ok(score({...cases.C,spot:'BUF 3',goalToGo:true})>score({...cases.C,spot:'BUF 20'}));
  assert.ok(score({...cases.Q,clock:'1:30',timeouts:0})>score({...cases.Q,clock:'1:30',timeouts:3}));
  for (const input of [{clock:'0:01',spot:'MIA 5'},{clock:'0:00'},{clock:''},{possession:''},{possession:'invalid'}]) {
    assert.ok(score({...cases.C,...input})<s('C')-10,JSON.stringify(input));
  }
  const malformed = fixture({...cases.Q,distance:undefined});
  delete malformed.competition.situation.distance;
  assert.ok(Number.isFinite(evaluateFixture(core,malformed).score));
  assert.ok(score({...cases.R,tryState:false})<s('R')-20);
  const stale = fixture({...cases.R,tryState:false});
  stale.competition.situation.lastPlay = {text:'Touchdown, two point conversion successful'};
  assert.equal(evaluateFixture(core,stale).score,score({...cases.R,tryState:false}));
  const unknownField = score({...cases.C,spot:'XYZ 2',goalToGo:true});
  assert.ok(unknownField<score({...cases.C,spot:'BUF 2',goalToGo:true}));
  const longAbbr = fixture({...cases.C,spot:'UCONN 2',goalToGo:true});
  longAbbr.competition.competitors[0].team.abbreviation='UCONN';
  assert.equal(evaluateFixture(core,longAbbr).score,score({...cases.C,spot:'BUF 2',goalToGo:true}));
});

test('CFB OT identifies same-period response series, pending conversions and historical shootouts', () => {
  const get = input => {const f=fixture(input);return cfbOvertime(f.competition,f.summary);};
  assert.equal(get(cases.S).decisive,false);
  assert.equal(get(cases.T).decisive,true);
  assert.equal(get({...cases.T,evidencePeriod:4}).decisive,false);
  assert.equal(get({...cases.U,evidencePeriod:6}).decisive,false);
  assert.equal(get({...cases.U,tryState:false}).shootout,false);
  assert.equal(get({...cases.U,year:2018}).shootout,false);
  assert.equal(get({...cases.U,year:2020}).shootout,false);
  assert.equal(get({...cases.U,year:2020,period:9}).shootout,true);
  assert.equal(get({...cases.U,year:2021}).shootout,true);
  assert.equal(get({...cases.T,possession:'h'}).decisive,false);
  const incomplete = fixture(cases.T);
  incomplete.summary.drives.previous[0].isCurrent=true;
  assert.equal(cfbOvertime(incomplete.competition,incomplete.summary).decisive,false);
  incomplete.summary.drives.previous[0].isCurrent=false;
  incomplete.summary.drives.previous[0].plays=[];
  assert.equal(cfbOvertime(incomplete.competition,incomplete.summary).decisive,false);
  const pending = fixture({...cases.T,scores:[31,30],tryState:true});
  pending.summary.drives.previous.push({team:{id:'a'},start:{period:{number:5}},result:'Touchdown',plays:[{start:{team:{id:'a'}},text:'Touchdown'}]});
  assert.equal(cfbOvertime(pending.competition,pending.summary).decisive,true,'provider closed the responding TD drive before its pending try');
  assert.ok(evaluateFixture(core,pending).score>=96);
  for (const name of ['CFP first round','College Football Playoff semifinal','Conference Championship']) {
    const f=fixture(cases.V);f.event.name=name;
    assert.equal(evaluateFixture(core,f).score,99,name);
  }
  for (const name of ['CFP race','CFP rematch','National Championship rematch','Bowl Game']) {
    const f=fixture(cases.V);f.event.name=name;
    assert.ok(evaluateFixture(core,f).score<99,name);
  }
  assert.ok(score({...cases.U,otResponse:false})<s('U'),'period plus explicit try does not prove response rights');
  assert.ok(score({...cases.S,scores:[24,30],tryState:true})>=85,'opening TD pending conversion remains an active OT possession');
});

test('CFB spread and rank interactions are bounded by live viability', () => {
  const tiers=[7,10,14,21,28,35,50].map(spread=>evaluate(core,{...cases.K,spread}));
  for(let i=1;i<tiers.length;i++) assert.ok(tiers[i].upset>=tiers[i-1].upset);
  assert.equal(tiers[5].upset,tiers[6].upset,'magnitude saturates');
  assert.ok(tiers.every(t=>t.upset<=36));
  assert.ok(evaluate(core,{...cases.O,ranks:[20,null]}).upset>evaluate(core,cases.K).upset);
  assert.ok(score({...cases.O,ranks:[20,null]})>=s('K'));
  assert.ok(s('O')>score({...cases.O,ranks:[20,null]}));
  assert.ok(score({...cases.K,scores:[21,42],period:2,clock:'0:00',spread:28})<80);
  for (const input of [cases.N,cases.W,{...cases.W,scores:[21,49],spread:28},{...cases.W,scores:[49,21],clock:'5:00'}]) {
    const output=evaluate(core,input);
    assert.ok(output.score<25 && output.upset<=1,JSON.stringify(output));
  }
  for (const input of [cases.C,cases.F,cases.Q,cases.R,cases.U]) {
    for (const probability of [.01,.5,.99]) assert.equal(score({...input,probability}),score(input),'WP stays observable without stacking over the floor');
  }
});

test('CFB floors rebase idempotently and disappear on possession loss', () => {
  const f=fixture(cases.C), teams=f.competition.competitors.map(t=>({...t,id:t.team.id}));
  const rating=core.rateGame('CFB','live',teams,f.event,f.competition,'');
  const game={sport:'CFB',state:'live',teams:teams.map(t=>[t.team.displayName,t.team.abbreviation,t.score,'','','',null,t.homeAway,t.id]),
    baseScore:rating.score,score:rating.score,openingScore:rating.openingScore,openingFactors:rating.openingFactors,liveRawStatus:f.competition.status};
  for(let i=0;i<3;i++) {core.applyLiveSnapshot(game,f.competition,f.summary);assert.equal(game.score,s('C'));}
  const lost=fixture(cases.D);
  core.applyLiveSnapshot(game,lost.competition,lost.summary);
  assert.equal(game.score,s('D'));
});

test('CFB standalone histories remain exact; completed changes are confined to result significance', () => {
  for(const input of Object.values(cases)) {
    for(const state of ['upcoming','completed']) {
      const f=fixture(input), teams=f.competition.competitors.map(t=>({...t,id:t.team.id}));
      const actual=core.rateGame('CFB',state,teams,f.event,f.competition,''),old=before.rateGame('CFB',state,teams,f.event,f.competition,'');
      if(state!=='upcoming') {
        const stable=({score,upsetText,upsetPoints,factors,...rest})=>({...rest,factors:factors.filter(f=>f.label!=='Underdog won outright')});
        same(stable(actual),stable(old),'only completed upset fields may change');
        assert.equal(actual.score,core.clampScore(old.factors.reduce((sum,f)=>sum+f.points,0)-old.upsetPoints+actual.upsetPoints));
      }
      same(core.momentumImpact('CFB',f.summary,1,state),before.momentumImpact('CFB',f.summary,1,state));
    }
    assert.equal(core.footballStagnationImpact('CFB',fixture(input).summary,.99,'live').points,0);
  }
});

test('CFB browser equivalence and frozen pre-change calibration; all NFL A-P outputs exactly unchanged', () => {
  for(const [key,input] of Object.entries(cases)) {
    same(evaluate(before,input),baseline.cfb[key],`CFB ${key} baseline provenance`);
    same(evaluate(browser,input),evaluate(core,input),`CFB ${key} browser`);
  }
  for(const [key,input] of Object.entries(margins)) {
    same(evaluate(before,input),baseline.margins[key],key);
    same(evaluate(browser,input),evaluate(core,input),key);
  }
  for(const [key,input] of Object.entries(nfl.cases)) {
    same(nfl.evaluate(core,input),baseline.nfl[key],`NFL ${key} all components`);
    same(nfl.evaluate(core,input),nfl.evaluate(before,input),`NFL ${key} frozen engine`);
  }
  // Include older periods, missing provider fields and all public API shapes.
  same(Object.keys(core),Object.keys(before));
  for(const key of Object.keys(core)) if(typeof core[key]==='function') assert.equal(core[key].length,before[key].length,key);
  for(const sport of ['NFL','NBA','NCAAB','MLB','Soccer','Tennis']) {
    for(const input of [...Object.values(nfl.cases),{clock:''},{possession:''},{scores:[56,0]}]) {
      same(nfl.evaluate(core,input,sport),nfl.evaluate(before,input,sport),`${sport} live unchanged`);
    }
  }
});

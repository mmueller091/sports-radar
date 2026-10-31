import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {normalizeEvent,enrichGame,applyContextsToGame} from '../alerts-worker/src/game-model.js';
import {baseballSituation,footballSituation} from '../alerts-worker/src/display-model.js';
import * as active from '../alerts-worker/src/live-game-model.js';
import {deterministicFactor,meaningfulInjuryEvidence,contextsForGames,mergeFactors,saveFactors} from '../alerts-worker/src/storylines.js';
import watch from '../watch-links.js';
const require=createRequire(import.meta.url),core=require('../rating-core.js'),before=require('./helpers/pregame-before.cjs');
const {footballPregameSpread,footballSpreadAdjustment,FOOTBALL_SPREAD_ANCHORS}=require('../scoring/shared/market.js');
const targets={NFL:[[0,7],[3,6],[7,3],[10,0],[14,-4],[17,-7],[21,-10]],CFB:[[0,5],[3,4],[7,2],[10,1],[14,0],[20,-4],[27,-7],[35,-10]]};
const captured=JSON.parse(fs.readFileSync(new URL('./fixtures/football-pregame-20261031.json',import.meta.url)));
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(sport,spread,options={}) {
  const competitors=[
    {homeAway:'away',team:{id:'away',displayName:'Away University',abbreviation:'BAL'},score:'0',records:[{summary:options.records?.[0] || '6-2'}]},
    {homeAway:'home',team:{id:'home',displayName:'Home University',abbreviation:'PIT'},score:'0',records:[{summary:options.records?.[1] || '6-2'}]}
  ];
  if(options.ranks) competitors.forEach((team,i)=>team.curatedRank={current:options.ranks[i]});
  const competition={competitors,status:{period:0,type:{state:'pre'}},...(spread==null?{}:{odds:[{spread,details:spread===0?'PK':`PIT -${spread}`,awayTeamOdds:{underdog:true},homeTeamOdds:{favorite:true}}]})};
  const event={id:'synthetic',name:options.title || 'Away University at Home University',season:{type:options.postseason?3:2},competitions:[competition]};
  return {event,competition,sport};
}
const rating=(f,engine=core,state='upcoming')=>engine.rateGame(f.sport,state,f.competition.competitors.map(team=>({...team,name:team.team.displayName,abbr:team.team.abbreviation})),f.event,f.competition,'');

for(const sport of ['NFL','CFB']) {
  test(`${sport}: independent continuous, bounded spread anchors and no jumps at anchor boundaries`,()=>{
    assert.deepEqual(FOOTBALL_SPREAD_ANCHORS[sport],targets[sport]);
    for(const [spread,points] of targets[sport]) {
      assert.equal(footballSpreadAdjustment(sport,spread),points);
      assert.equal(footballSpreadAdjustment(sport,-spread),points);
      assert.ok(Math.abs(footballSpreadAdjustment(sport,spread+.0001)-footballSpreadAdjustment(sport,Math.max(0,spread-.0001)))<.0003);
    }
    let prior=Infinity;
    for(let spread=0;spread<=100;spread+=.05){const points=footballSpreadAdjustment(sport,spread);assert.ok(points<=prior+1e-10);assert.ok(points>=-10);prior=points;}
    assert.equal(footballSpreadAdjustment(sport,1000),-10);
    assert.equal(footballSpreadAdjustment(sport,null),0);
    assert.equal(footballSpreadAdjustment(sport,NaN),0);
  });
  test(`${sport}: overall ratings decrease with spread; quality and postseason prestige remain meaningful`,()=>{
    let previous=Infinity;
    for(let spread=0;spread<=50;spread+=.25){const result=rating(fixture(sport,spread,{ranks:[5,12]}));assert.ok(result.score<=previous,`${sport} ${spread}`);previous=result.score;}
    assert.ok(rating(fixture(sport,21,{postseason:true})).score>rating(fixture(sport,21)).score);
    assert.ok(rating(fixture(sport,3,{ranks:[5,12]})).score>rating(fixture(sport,35,{ranks:[5,12]})).score+15);
    assert.ok(rating(fixture(sport,1000)).score>=1);
  });
}

test('missing odds stay neutral; numeric zero, signed, nested and textual pick’em are actual market evidence',()=>{
  for(const odds of [{spread:0},{details:'PK'},{details:"Pick'em"},{details:'PIT PK'},{pointSpread:{away:{close:{line:'+14'}}}},{spread:{displayValue:'−14'}},{details:'PIT -14'}]) {
    assert.equal(footballPregameSpread({odds:[odds]}),['0','PK',"Pick'em",'PIT PK'].includes(String(odds.spread??odds.details))?0:14);
  }
  for(const odds of [null,{}, {spread:''},{spread:false},{spread:Infinity},{details:'PIT -110'},{details:'Total 48.5'},{spread:'not listed'}]) assert.equal(footballPregameSpread({odds:odds?[odds]:[]}),null);
  for(const sport of ['NFL','CFB'])assert.deepEqual(plain(rating(fixture(sport,null))),plain(rating(fixture(sport,null),before.legacy)));
  assert.notEqual(footballSpreadAdjustment('NFL',14),footballSpreadAdjustment('CFB',14));
});

test('NFL market competitiveness replaces duplicate record-evenness/race awards; winless record penalty does not stack with two losing records',()=>{
  const game=rating(fixture('NFL',3));
  assert.equal(game.factors.filter(f=>/projected spread/i.test(f.label)).length,1);
  assert.ok(!game.factors.some(f=>/Evenly matched winning records|Division race between/.test(f.label)));
  assert.ok(game.factors.some(f=>f.label==='Both winning records'));
  assert.ok(game.factors.some(f=>f.label==='AFC North matchup'));
  const losing=rating(fixture('NFL',21,{records:['0-8','2-6']}));
  assert.ok(losing.factors.some(f=>f.label==='Both teams below .500'));
  assert.ok(!losing.factors.some(f=>f.label==='Winless team'));
  assert.ok(rating(fixture('NFL',21,{records:['8-0','6-2']})).score<rating(fixture('NFL',3,{records:['8-0','6-2']})).score-15);
});

test('upcoming rivalry and postseason context do not duplicate existing division/rivalry/stakes factors',()=>{
  for(const sport of ['NFL','CFB']) {
    const f=fixture(sport,3,{title:'Historic rivalry',postseason:true});
    const original=rating(f);
    f.event.sportsRadarContextFactors=[{type:'rivalry',text:'Verified rivalry',verified:true},{type:'playoff_race',text:'Playoff race',verified:true}];
    assert.equal(rating(f).score,original.score);
    assert.ok(!rating(f).factors.some(f=>['rivalry','playoff_race'].includes(f.contextType)));
    assert.deepEqual(plain(rating(f,core,'live')),plain(rating(f,before.legacy,'live')),'live context remains on its original path');
  }
});

test('ordinary and speculative injuries are rejected; explicitly important absences and injury returns survive',()=>{
  for(const headline of ['Mississippi State OL DJ Chester ruled out vs Texas','Backup receiver sidelined with ankle injury','Star quarterback questionable for Saturday','Star quarterback not ruled out','Captain returns to lineup after injury','Star quarterback returns while backup tackle ruled out','Starting quarterback will miss practice']) {
    assert.notEqual(deterministicFactor({headline,description:''})?.type,'star_absence',headline);
  }
  assert.equal(deterministicFactor({headline:'Starting quarterback Alex Jones ruled out with an ankle injury'})?.type,'star_absence');
  assert.equal(deterministicFactor({headline:'All-American tackle Alex Jones will miss Saturday'})?.type,'star_absence');
  assert.equal(deterministicFactor({headline:'All-Pro receiver returns from injury for first game back'})?.type,'star_injury_return');
  for(const article of captured.injuryArticles) assert.equal(meaningfulInjuryEvidence(article,'star_absence'),null,article.headline);
  assert.equal(mergeFactors([{id:'x',sport:'CFB',eventId:'1',article:{headline:'Backup tackle ruled out',description:'Ordinary reserve will miss Saturday.',published:Date.now(),url:'https://www.espn.com/story'}}],[{id:'x',type:'star_absence',text:'A star quarterback ruled out',confidence:.99}]).length,0,'AI cannot promote an ordinary injury');
});

test('meaningful injury scoring requires affected team evidence and avoids market double-counting',()=>{
  for(const sport of ['NFL','CFB']) {
    const f=fixture(sport,null);
    const absence={type:'star_absence',verified:true,confidence:.9,text:'Starting quarterback ruled out',injuryEvidence:{importance:'starting-quarterback',affectedTeamId:'away',reportedAt:'2026-10-31T10:00:00Z'}};
    f.event.sportsRadarContextFactors=[absence];
    const points=()=>rating(f).factors.find(f=>f.contextType==='star_absence')?.points || 0;
    assert.equal(points(),-5);
    f.event.sportsRadarContextFactors=[{...absence,injuryEvidence:{...absence.injuryEvidence,affectedTeamId:'unrelated'}}];assert.equal(points(),0);
    f.event.sportsRadarContextFactors=[absence];
    f.competition.odds=[{spread:21,awayTeamOdds:{underdog:true}}];assert.equal(points(),0,'unknown line timestamp does not justify an extra penalty');
    f.competition.odds[0].lastUpdated='2026-10-31T09:00:00Z';assert.equal(points(),-2,'confirmed newer underdog absence is bounded');
    f.competition.odds[0].lastUpdated='2026-10-31T11:00:00Z';assert.equal(points(),0);
    f.competition.odds[0].lastUpdated='2026-10-31T09:00:00Z';f.competition.odds[0].awayTeamOdds={favorite:true};assert.equal(points(),0,'favorite absence does not prove a bigger mismatch');
  }
});

test('cached legacy injuries are revalidated immediately without deleting unrelated storylines',async()=>{
  const rows=[
    {event_id:'1',sport:'CFB',factor_type:'star_absence',context_text:'Mississippi State OL ruled out',source_title:'Mississippi State OL ruled out',confidence:.9},
    {event_id:'1',sport:'CFB',factor_type:'star_absence',context_text:'AI says a star is injured',source_title:'Backup tackle sidelined',confidence:.99},
    {event_id:'1',sport:'CFB',factor_type:'rivalry',context_text:'Historic rivalry',source_title:'Historic rivalry',confidence:.9},
    {event_id:'2',sport:'NFL',factor_type:'star_absence',context_text:JSON.stringify({version:2,text:'QB Jones ruled out',description:'Starting quarterback Jones will miss Sunday.',affectedTeamId:'away'}),source_title:'Jones ruled out',confidence:.9,source_published:1793430000}
  ];
  const statements=[];
  const env={DB:{prepare(sql){statements.push(sql);return {bind(){return {async all(){return {results:rows};}};}}}}};
  const result=await contextsForGames(env,['CFB:1','NFL:2']);
  assert.deepEqual(result['CFB:1'].map(f=>f.type),['rivalry']);
  assert.equal(result['NFL:2'][0].injuryEvidence.affectedTeamId,'away');
  assert.ok(statements.every(sql=>sql.startsWith('SELECT')));
});

test('new significant-injury evidence survives storage and revalidation with plain text returned to clients',async()=>{
  const now=Date.now(),key='NFL:1',game={key,eventId:'1',sport:'NFL',start:now+3600000};
  const factors=mergeFactors([{id:'i',eventId:'1',sport:'NFL',affectedTeamId:'away',article:{headline:'Jones ruled out for Sunday',description:'Starting quarterback Jones will miss the game.',published:now,url:'https://www.espn.com/story'}}],[]);
  assert.equal(factors.length,1);let row;
  const env={DB:{prepare(sql){return {bind(...args){
    if(sql.startsWith('INSERT INTO game_context'))row={event_id:args[0],sport:args[1],factor_type:args[2],context_text:args[3],confidence:args[4],source_title:args[5],source_url:args[6],source_published:args[7]};
    return {async run(){},async all(){return {results:[row]};}};
  }};},async batch(){}}};
  await saveFactors(env,[game],factors,now);
  assert.equal(JSON.parse(row.context_text).version,2);
  const result=await contextsForGames(env,[key]);
  assert.equal(result[key][0].text,factors[0].text);
  assert.equal(result[key][0].injuryEvidence.importance,'starting-quarterback');
  assert.equal(result[key][0].injuryEvidence.affectedTeamId,'away');
});

test('browser bundle and active Worker agree on calibrated upcoming ratings and model version',()=>{
  const {buildSync}=require('../alerts-worker/node_modules/esbuild');
  const source=buildSync({entryPoints:['scoring/browser-entry.cjs'],bundle:true,write:false,platform:'browser',format:'iife',logLevel:'silent'}).outputFiles[0].text;
  const browser=vm.runInNewContext(source+';SportsRadarScore');
  assert.equal(browser.MODEL_VERSION,'2026-10-31.football-pregame.1');
  for(const sport of ['NFL','CFB'])for(const spread of [null,0,3,7,10,14,17,20,21,27,35,60]){
    const f=fixture(sport,spread,{ranks:[5,12]});
    assert.deepEqual(plain(rating(f,browser)),plain(rating(f)));
    const worker=active.normalizeEvent(structuredClone(f.event),sport);
    assert.equal(worker.score,rating(f).score);
    assert.equal(worker.modelVersion,browser.MODEL_VERSION);
  }
});

test('named current examples get mismatch deductions without ordinary injury penalties or an FCS surcharge',()=>{
  for(const c of captured.cases) {
    const game=normalizeEvent(structuredClone(c.event),c.sport,'',c.division);
    const valid=c.contexts.filter(context=>meaningfulInjuryEvidence({headline:context.sourceTitle},context.type));
    applyContextsToGame(game,valid);
    assert.equal(game.score,({'401856737':38,'401859185':34,'401867995':33,'401866680':37,'401868231':37,'401868147':34})[c.event.id],c.event.name);
    assert.ok(game.factors.some(f=>f.label==='Projected spread mismatch' && f.points<0));
    assert.ok(!game.factors.some(f=>f.contextType==='star_absence'));
    const otherDivision=normalizeEvent(structuredClone(c.event),c.sport,'',c.division==='FCS'?'FBS':'FCS');
    assert.equal(otherDivision.score,game.score,'classification alone does not change excitement');
  }
});

test('all 107 archived actual live/final games and all non-football states retain exact scoring and enrichment',()=>{
  const model=fs.readFileSync(new URL('../alerts-worker/src/game-model.js',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'').replace(/^export .*;\s*$/gm,'');
  const old=vm.runInNewContext(`${model}\n({normalizeEvent,enrichGame})`,{SportsRadarScore:before.legacy,SportsRadarWatch:watch,baseballSituation,footballSituation,URL});
  const directory=new URL('./fixtures/real-games/',import.meta.url);let compared=0;
  for(const file of fs.readdirSync(directory).filter(file=>file.endsWith('.json'))) {
    const f=JSON.parse(fs.readFileSync(new URL(file,directory)));
    const a=normalizeEvent(structuredClone(f.event),f.modelSport),b=old.normalizeEvent(structuredClone(f.event),f.modelSport);
    if(a.state==='upcoming' && ['NFL','CFB'].includes(a.sport))continue;
    enrichGame(a,structuredClone(f.summary));old.enrichGame(b,structuredClone(f.summary));
    assert.deepEqual(plain(a),plain(b),file);
    if(a.state==='live'){
      const current=require('../scoring/live-runtime.cjs');
      current.applyLiveSnapshot(a,a.sourceCompetition,f.summary);before.runtime.applyLiveSnapshot(b,b.sourceCompetition,f.summary);
      delete a.modelVersion;delete b.modelVersion;assert.deepEqual(plain(a),plain(b),file+' production');
    }
    compared++;
  }
  assert.ok(compared>80,`compared ${compared}`);
});

test('an extreme-favorite pregame mismatch cannot suppress a late live upset or completed upset award',()=>{
  const model=fs.readFileSync(new URL('../alerts-worker/src/game-model.js',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'').replace(/^export .*;\s*$/gm,'');
  const oldAdapter=vm.runInNewContext(`${model}\n({normalizeEvent,enrichGame})`,{SportsRadarScore:before.legacy,SportsRadarWatch:watch,baseballSituation,footballSituation,URL});
  for(const sport of ['NFL','CFB']) {
    const f=fixture(sport,28,{records:['0-7','7-0']});
    const pre=normalizeEvent(structuredClone(f.event),sport);assert.ok(pre.score<45);
    f.competition.status={period:4,displayClock:'1:00',type:{state:'in'}};
    f.competition.competitors[0].score='24';f.competition.competitors[1].score='24';
    f.competition.situation={possession:'away',down:4,distance:3,isGoalToGo:true,possessionText:'PIT 3',downDistanceText:'4th & Goal at PIT 3'};
    const game=normalizeEvent(f.event,sport),old=oldAdapter.normalizeEvent(structuredClone(f.event),sport);
    assert.equal(game.score,old.score);assert.ok(game.upsetPoints>0);
    require('../scoring/live-runtime.cjs').applyLiveSnapshot(game,f.competition,null);
    assert.ok(game.score>=75,`${sport} late upset ${game.score}`);
    f.competition.status.type={state:'post',completed:true};
    f.competition.competitors[0].score='28';
    const final=normalizeEvent(f.event,sport);
    assert.equal(final.score,oldAdapter.normalizeEvent(structuredClone(f.event),sport).score);assert.ok(final.upsetPoints>0);
  }
});

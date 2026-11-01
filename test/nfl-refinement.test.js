import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {refinementData,refinementGames} from '../scripts/nfl-refinement-report.mjs';
import {nflReturnSignificance} from '../alerts-worker/src/nfl-return.js';
import {nflPregameContext} from '../alerts-worker/src/nfl-pregame.js';
import {normalizeEvent,applyContextsToGame} from '../alerts-worker/src/live-game-model.js';
import {deterministicFactor} from '../alerts-worker/src/storylines.js';
const require=createRequire(import.meta.url),core=require('../scoring/live-runtime.cjs');
const {nflRecordAssessment,nflMarketInteraction,nflEvidenceFactors,nflReturnPoints}=require('../scoring/shared/nfl-pregame.js');
const module={exports:{}};vm.runInNewContext(gunzipSync(fs.readFileSync('test/fixtures/nfl-pregame/refinement-before.cjs.gz')).toString(),{module,exports:module.exports,require,Date,console,structuredClone});
const before=module.exports,data=refinementData(),games=refinementGames(data),plain=x=>JSON.parse(JSON.stringify(x));
const record=p=>({pct:p,wins:Math.round(p*100000),losses:100000-Math.round(p*100000),games:100000,ties:0});
function synthetic(pcts,spread=3,total=44) {
  const records=pcts.map(record),competition={season:{year:2026,type:2},status:{type:{state:'pre'}},competitors:records.map((r,i)=>({homeAway:i?'home':'away',team:{id:String(i),displayName:i?'Home':'Away',abbreviation:i?'PIT':'BAL'},score:'0',records:[{type:'total',summary:`${r.wins}-${r.losses}`}]})),odds:spread==null?[]:[{spread,overUnder:total}]};
  const event={id:'generic',season:competition.season,competitions:[competition]};return{records,competition,event};
}
const rating=f=>core.rateGame('NFL','upcoming',[],f.event,f.competition,'');

test('fresh production baseline is captured and all twelve recalculations meet independent sanity ranges',()=>{
  assert.equal(data.baselineModel,'2026-11-01.nfl-pregame.1');assert.equal(data.baselineGames.length,12);
  assert.deepEqual(data.baselineGames.map(g=>g.score),[72,42,47,79,41,75,54,48,39,76,49,43]);
  // Seven-point favorites now lose the former +3 market award.
  const ranges={'401873026':[75,77],'401873029':[44,45],'401873025':[55,58],'401873024':[45,47]};
  for(const [id,[min,max]]of Object.entries(ranges)){const g=games.find(g=>g.id===id);assert.ok(g.score>=min&&g.score<=max,`${id}: ${g.score}`);}
  for(const id of ['401873030','401873033','401873027'])assert.equal(games.find(g=>g.id===id).score,data.baselineGames.find(g=>g.id===id).score);
  assert.ok(games.find(g=>g.id==='401873031').score<=43);
});

test('market interaction is bounded, smooth, non-additive and absent for defensive or seven-point games',()=>{
  assert.equal(nflMarketInteraction(3,54.5),3);assert.equal(nflMarketInteraction(7,54.5),0);
  for(const value of [null,undefined,NaN,'3',Infinity])assert.equal(nflMarketInteraction(value,54.5),0);
  for(let spread=0;spread<=20;spread+=.125)for(let total=30;total<=65;total+=.25){const points=nflMarketInteraction(spread,total);assert.ok(points>=0&&points<=3);if(total<=46||spread>=7)assert.equal(points,0);}
  for(const spread of [0,3,3.5,4,6.5,7,7.5])for(const total of [35,46,48,54,54.5,56]) {
    assert.ok(Math.abs(nflMarketInteraction(spread-.00001,total)-nflMarketInteraction(spread+.00001,total))<=.01);
    assert.ok(Math.abs(nflMarketInteraction(spread,total-.00001)-nflMarketInteraction(spread,total+.00001))<=.01);
  }
  const close=rating(synthetic([.7,.7],3,54.5)),defense=rating(synthetic([.7,.7],3,35)),wide=rating(synthetic([.7,.7],7,54.5));
  assert.equal(close.factors.filter(f=>f.label==='Close-game scoring upside').length,1);
  assert.equal(close.factors.filter(f=>f.label==='Expected scoring potential').length,1);
  assert.equal(close.factors.filter(f=>/projected (spread|favorite)/i.test(f.label)).length,1);
  assert.ok(!wide.factors.some(f=>f.label==='Close-game scoring upside'));
  assert.ok(!defense.factors.some(f=>f.label==='Expected scoring potential'||f.label==='Close-game scoring upside'));
  assert.equal(defense.score,rating(synthetic([.7,.7],3,46)).score);
  assert.ok(close.factors.filter(f=>/projected (spread|favorite)|Expected scoring|Close-game scoring/i.test(f.label)).reduce((n,f)=>n+f.points,0)<=15);
});

test('losing severity distinguishes mild records, a winless opponent and two genuinely poor teams',()=>{
  const mild=nflRecordAssessment({},[record(3/7),record(2/7)]),winless=nflRecordAssessment({},[record(0),record(3/7)]),poor=nflRecordAssessment({},[record(0),record(0)]);
  assert.ok(mild.penalty>winless.penalty);assert.ok(winless.penalty>poor.penalty);assert.equal(poor.penalty,-7);
  assert.ok(mild.penalty>-3);
  for(const g of games){assert.ok(!g.factors.some(f=>['Both teams below .500','Performance beyond losing records'].includes(f.label)));assert.equal(g.score,core.clampScore(g.factors.reduce((n,f)=>n+f.points,0)));}
  assert.ok(games.find(g=>g.id==='401873025').factors.some(f=>f.label==='Division race positioning'&&f.points===5));
});

test('record contributions remain continuous at .500 for weak/strong opponents with and without a market',()=>{
  for(const other of [0,.1,.25,.49,.5,.55,.6,.8,1])for(const spread of [null,0,3,7,14]){
    const a=rating(synthetic([.49999,other],spread)),b=rating(synthetic([.5,other],spread)),c=rating(synthetic([.50001,other],spread));
    assert.ok(Math.abs(a.rawPregameScore-b.rawPregameScore)<.03,`${other}, ${spread}: below .500`);
    assert.ok(Math.abs(c.rawPregameScore-b.rawPregameScore)<.03,`${other}, ${spread}: above .500`);
  }
});

test('point differential is split between severity relief and quality; recent form is counted once',()=>{
  const f=synthetic([.4,.3]);
  const attach=differential=>{f.competition.sportsRadarNflPregame={season:2026,teams:f.records.map((r,i)=>({...r,id:String(i),differential:differential*r.games})),recent:f.records.map((r,i)=>({id:String(i),events:[{margin:7,result:'W'},{margin:-3,result:'L'},{margin:2,result:'W'}]}))};};
  attach(-10);const weak=nflRecordAssessment(f.competition,f.records),weakFactors=nflEvidenceFactors(f.competition,f.records,'');
  attach(5);const strong=nflRecordAssessment(f.competition,f.records),strongFactors=nflEvidenceFactors(f.competition,f.records,'');
  assert.ok(strong.penalty>weak.penalty);assert.ok(strong.relief>0);
  assert.ok(!strongFactors.some(f=>f.label==='Season point differential'),'fully engaged severity owns point differential');
  assert.equal(strongFactors.filter(f=>f.label==='Recent performance').length,1);
  assert.equal(strongFactors.find(f=>f.label==='Recent performance').points,weakFactors.find(f=>f.label==='Recent performance').points);
  for(const other of [.3,.5,.7]){
    const totals=[.49999,.5,.50001].map(p=>{const x=synthetic([p,other]);x.competition.sportsRadarNflPregame={season:2026,teams:x.records.map((r,i)=>({...r,id:String(i),differential:r.games})),recent:[{events:[]},{events:[]}]};const a=nflRecordAssessment(x.competition,x.records);return a.positive+a.penalty+nflEvidenceFactors(x.competition,x.records,'').reduce((n,f)=>n+f.points,0);});
    assert.ok(Math.max(...totals)-Math.min(...totals)<.03);
  }
});

test('return tiers use role/accomplishment proof rather than player names and keep a six-point story cap',()=>{
  const competition=synthetic([.7,.7]).competition,base={injuryEvidence:{affectedTeamId:'0',importance:'starting-quarterback'}};
  const proof={verified:true,playerId:'generic-player',tier:'major-quarterback',fact:'Player won NFL MVP',sourceUrl:'https://example.test/honors'};
  assert.equal(nflReturnPoints({...base,injuryEvidence:{...base.injuryEvidence,playerSignificance:proof}},competition),5);
  assert.equal(nflReturnPoints(base,competition),3);
  assert.equal(nflReturnPoints({injuryEvidence:{affectedTeamId:'0',importance:'star',playerSignificance:{...proof,tier:'established-star'}}},competition),3);
  assert.equal(nflReturnPoints({injuryEvidence:{affectedTeamId:'0',importance:'key-player'}},competition),2);
  assert.equal(nflReturnPoints({injuryEvidence:{affectedTeamId:'0',importance:'star'}},competition),1);
  assert.equal(nflReturnPoints({injuryEvidence:{affectedTeamId:'unrelated',playerSignificance:proof}},competition),0);
  assert.equal(nflReturnPoints({...base,injuryEvidence:{...base.injuryEvidence,playerSignificance:{...proof,verified:false}}},competition),3);
  for(const g of games)assert.ok(g.factors.filter(f=>f.contextType).reduce((n,f)=>n+Math.max(0,f.points),0)<=6);
  const major=games.find(g=>g.id==='401873026').factors.find(f=>f.contextType==='star_injury_return'),regular=games.find(g=>g.id==='401873024').factors.find(f=>f.contextType==='star_injury_return');
  assert.equal(major.points,5);assert.equal(regular.points,2);assert.ok(major.returnSignificance.sourceUrl);
});

test('honor attribution rejects an opponent, ambiguous surname, speculation, college awards and missing identity',()=>{
  const article={headline:'Starting QB Avery Stone returns from knee injury',description:'',url:'https://example.test/return',players:[{id:'10',name:'Avery Stone'}]};
  const link=(id,name)=>`<a href="https://www.espn.com/nfl/player/_/id/${id}/player">${name}</a>`;
  const preview=story=>({story,links:{web:{href:'https://example.test/preview'}}});
  assert.equal(nflReturnSignificance(article,preview(`${link('10','Avery Stone')} is a two-time NFL MVP.`),'starting-quarterback').tier,'major-quarterback');
  for(const text of [
    `${link('10','Avery Stone')} faces ${link('11','Morgan Reed')}, who is an NFL MVP.`,
    `${link('10','Avery Stone')} was never an NFL MVP.`,
    `${link('10','Avery Stone')} is an NFL MVP candidate.`,
    `${link('10','Avery Stone')} eyes NFL MVP.`,
    `${link('10','Avery Stone')} is NFL MVP-caliber.`,
    `${link('10','Avery Stone')} was a college league MVP.`,
    `${link('10','Avery Stone')} faces ${link('11','Casey Stone')}. Stone is an NFL MVP.`
  ])assert.equal(nflReturnSignificance(article,preview(text),'starting-quarterback'),null,text);
  assert.equal(nflReturnSignificance({...article,players:[]},preview('Avery Stone is an NFL MVP.'),'starting-quarterback'),null);
  const star={...article,headline:'All-Pro receiver Avery Stone returns from injury'};
  assert.equal(nflReturnSignificance(star,null,'star').tier,'established-star');
  assert.equal(deterministicFactor({headline:'Reserve tackle returns after minor ankle soreness',description:''}),null);
});

test('fresh source proof survives context deduplication against older cached coverage',()=>{
  const g=refinementGames(data).find(g=>g.id==='401873026'),fresh=g.qualitativeContexts.find(f=>f.type==='star_injury_return');
  applyContextsToGame(g,[fresh,{...fresh,injuryEvidence:{...fresh.injuryEvidence,playerSignificance:undefined}}]);
  assert.equal(g.factors.find(f=>f.contextType==='star_injury_return').points,5);
  assert.equal(g.factors.filter(f=>f.contextType==='star_injury_return').length,1);
});

test('historical NFL pregame inputs cover defensive, high-total, divisional and large-spread cases',()=>{
  let count=0,defense=0,high=0,wide=0;
  for(const name of fs.readdirSync('test/fixtures/real-games').filter(n=>n.startsWith('NFL-')&&n.endsWith('.json'))){
    const f=JSON.parse(fs.readFileSync('test/fixtures/real-games/'+name)),event=structuredClone(f.event),c=event.competitions[0];
    c.status={type:{state:'pre'}};c.competitors.forEach(t=>t.score='0');
    if(!c.odds?.length)c.odds=structuredClone(f.summary?.pickcenter || []);
    const result=core.rateGame('NFL','upcoming',[],event,c,event.name),prior=before.rateGame('NFL','upcoming',[],event,c,event.name);
    assert.ok(result.score>=1&&result.score<=90,name);assert.ok(Math.abs(result.score-prior.score)<=14,name);
    const total=core.parseLine(c.odds?.[0],c,'NFL')?.total,spread=require('../scoring/shared/market.js').footballPregameSpread(c);
    if(total<=44)defense++;if(total>=50)high++;if(spread>=7)wide++;count++;
  }
  assert.ok(count>=20&&defense>0&&high>0&&wide>0,JSON.stringify({count,defense,high,wide}));
});

test('browser and Worker agree on all twelve games and observed ratings persist at kickoff',()=>{
  const browser=vm.runInNewContext(fs.readFileSync('dist/scoring-runtime.js','utf8')+';SportsRadarScore');
  for(const g of games){const b=browser.rateGame('NFL','upcoming',[],g.sourceEvent,g.sourceCompetition,g.context);assert.equal(b.score,g.score);assert.deepEqual(plain(b.factors),plain(g.factors));
    const event=structuredClone(g.sourceEvent);event.competitions=[{...structuredClone(g.sourceCompetition),status:{period:1,displayClock:'15:00',type:{state:'in',name:'STATUS_IN_PROGRESS'}}}];
    const live=normalizeEvent(event,'NFL');core.preservePregameBaseline(live,g);core.applyLiveSnapshot(live,live.sourceCompetition,null);assert.equal(live.openingScore,g.score);assert.ok(Math.abs(live.score-g.score)<=1);
  }
});

test('frozen NFL live/final and every other sport retain identical rating outputs',()=>{
  const archive=JSON.parse(gunzipSync(fs.readFileSync('alerts-worker/test/fixtures/migration-inputs.json.gz')));let compared=0;
  for(const f of Object.values(archive)){const c=f.event.competitions[0],state=c.status.type.state==='pre'?'upcoming':c.status.type.state==='post'?'completed':'live';if(f.modelSport==='NFL'&&state==='upcoming')continue;
    assert.deepEqual(plain(core.rateGame(f.modelSport,state,c.competitors,f.event,c,f.event.name)),plain(before.rateGame(f.modelSport,state,c.competitors,f.event,c,f.event.name)));compared++;
  }assert.ok(compared>=100);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import center from '../game-center.js';
import {syntheticCases} from './fixtures/market-timeline/synthetic-cases.mjs';
const read=n=>JSON.parse(gunzipSync(fs.readFileSync(`test/fixtures/market-timeline/${n}.json.gz`)));
const corpus=read('production-games'),detail=read('pelicans-grizzlies');
const source=fs.readFileSync('app.js','utf8');
const {pregameExplanation:explain,narrativeMarket:market}=vm.runInNewContext(source.slice(source.indexOf('function explainRating('),source.indexOf('function trendFor('))+';({pregameExplanation,narrativeMarket})',{Date,Intl});
const game=id=>structuredClone(corpus.games.find(g=>g.id===id));
const teams=[['Away','A','0','','','12-4',null,'Away','1'],['Home','H','0','','','8-8',null,'Home','2']];
const paired=(sport,away,home)=>({sport,state:'upcoming',teams:structuredClone(teams),factors:[],line:{moneyline:`H ${home>0?'+':''}${home}`,provider:'Book'},pregameBaseline:{odds:[{details:`H ${home>0?'+':''}${home}`,provider:{name:'Book'},moneyline:{away:{close:{odds:String(away)}},home:{close:{odds:String(home)}}}}]}});
test('upcoming display never recycles an older cached market when current evidence is missing',()=>{
  const fn=source.slice(source.indexOf('function displayLine('),source.indexOf('function displayLine(')+source.slice(source.indexOf('function displayLine(')).indexOf('\nfunction ',1));
  const display=vm.runInNewContext(fn+';displayLine',{lineSnapshots:{fixture:{line:{spread:'H -14',moneyline:'H -700',total:40}}}});
  assert.equal(display({id:'fixture',sport:'NFL',state:'upcoming'}).text,'Not listed');
  assert.match(display({id:'fixture',sport:'NFL',state:'completed'}).text,/H -14/);
});
test('seven-sport synthetic corpus covers market classes, missing/conflicting evidence and small samples',()=>{
  for(const g of syntheticCases){
    const saved=JSON.stringify(g),m=market(g),text=explain(g);
    if(['even','slight','meaningful','heavy'].includes(g.scenario))assert.equal(m.kind,g.scenario,g.id);
    if(g.scenario==='missing')assert.equal(m.kind,'unknown',g.id);
    if(g.scenario==='conflict'){assert.equal(m.conflict,true,g.id);assert.match(text,/conflicting expectations/);}
    if(g.scenario==='limited')assert.doesNotMatch(text,/stronger record|struggled so far/);
    assert.equal(JSON.stringify(g),saved,g.id);
  }
});
test('both reported NHL markets use current paired prices with margin removed',()=>{
  for(const [id,p]of [['401892634',.599037],['401892636',.593405]]){
    const g=game(id),m=market(g),before=JSON.stringify(g),text=explain(g);
    assert.equal(m.kind,'meaningful');assert.equal(m.paired,true);assert.ok(Math.abs(m.probability-p)<.001);
    assert.equal(m.favorite,g.teams[1]);assert.match(text,/clear favorites/);assert.doesNotMatch(text,/neither side|even match|overwhelming/);
    assert.equal(JSON.stringify(g),before);
  }
  assert.match(explain(game('401892636')),/Oilers have the stronger record by points percentage, but the Devils are clear favorites/);
  assert.match(explain(game('401892634')),/Jets have struggled/);
  const utah=game('401892633');assert.equal(market(utah).paired,true);assert.equal(market(utah).favorite,utah.teams[0]);
  assert.equal(market(utah).kind,'slight','the displayed UTAH alias resolves to the normalized UTA team');
});
test('paired prices distinguish even, slight, meaningful and heavy across moneyline sports',()=>{
  for(const sport of ['NHL','MLB','Tennis'])for(const [away,home,kind]of [[-110,-110,'even'],[110,-130,'slight'],[140,-166,'meaningful'],[500,-700,'heavy']]){
    const g=paired(sport,away,home);assert.equal(market(g).kind,kind,`${sport}: ${away}/${home}`);
    assert.doesNotMatch(explain(g),/probabilit|\d+%|margin|threshold|component/);
  }
  assert.equal(market(paired('NHL',240,-278)).kind,'heavy');
  assert.equal(market(paired('Tennis',240,-278)).kind,'meaningful');
});
test('spreads follow sport-specific anchors and never treat a puck line as a point spread',()=>{
  const equalTeams=teams.map(t=>{const copy=[...t];copy[5]='8-8';return copy;});
  const classify=(sport,n)=>market({sport,teams,line:{spread:`H -${n}`}}).kind;
  assert.equal(classify('NFL',4),'meaningful');assert.equal(classify('NBA',4),'slight');
  assert.equal(classify('NFL',10),'heavy');assert.equal(classify('CFB',10),'meaningful');
  assert.equal(classify('NBA',12),'heavy');assert.equal(classify('NCAAB',12),'meaningful');
  assert.equal(classify('NHL',1.5),'unknown');assert.equal(classify('MLB',1.5),'unknown');
  assert.match(explain({sport:'NFL',state:'upcoming',teams:equalTeams,line:{spread:'H -3'}}),/field goal/);
  assert.doesNotMatch(explain({sport:'NBA',state:'upcoming',teams:equalTeams,line:{spread:'H -3'}}),/field goal/);
});
test('missing, one-sided, stale, conflicting and malformed quotes cannot manufacture confidence',()=>{
  const g=paired('NHL',140,-166);
  g.factors=[{label:'Near pick’em market',points:5}];delete g.line;
  assert.equal(market(g).kind,'unknown');assert.doesNotMatch(explain(g),/listed market|betting market|even line/);
  g.line={moneyline:'H -166',provider:'Book'};g.pregameBaseline.odds[0].moneyline.home.close.odds='-400';
  assert.equal(market(g).paired,false,'does not combine a stale quote with displayed odds');
  assert.notEqual(market(g).kind,'heavy');
  g.line.moneyline='H -110';assert.notEqual(market(g).kind,'even');
  const inconsistent=paired('NBA',140,-166);inconsistent.line.spread='A -4';
  assert.equal(market(inconsistent).conflict,true);assert.match(explain(inconsistent),/conflicting expectations/);
  const oldOpen=paired('NHL',140,-166);oldOpen.pregameBaseline.odds[0].moneyline.home.open={odds:'-110'};
  assert.equal(market(oldOpen).kind,'meaningful','opening prices cannot weaken the current favorite');
  const mixed=paired('NHL',140,-166);delete mixed.pregameBaseline.odds[0].moneyline.away.close;mixed.pregameBaseline.odds[0].moneyline.away.open={odds:'+140'};
  assert.equal(market(mixed).paired,false,'no open/close pairing');
  const malformed=paired('NHL',-500,-500);assert.equal(market(malformed).paired,false,'implausible margin rejected');
});
test('records respect NHL points, ties, sample size and tennis context',()=>{
  const g=paired('NHL',140,-166);g.teams[0][5]='6-5-4';g.teams[1][5]='7-5-3';
  assert.doesNotMatch(explain(g),/winning records|stronger record/);
  g.teams[0][5]='2-0-0';g.teams[1][5]='0-2-0';assert.doesNotMatch(explain(g),/stronger record|struggled so far/);
  g.sport='Tennis';g.teams[0][5]='50-3';g.teams[1][5]='9-20';assert.doesNotMatch(explain(g),/stronger record|winning records|struggled/);
});
test('all captured pregame narratives leave every rating, factor and normalized input unchanged',()=>{
  for(const g of corpus.games.filter(g=>g.state==='upcoming')){
    const before=JSON.stringify(g),text=explain(g);assert.equal(JSON.stringify(g),before);
    assert.doesNotMatch(text,/neither side much of an edge|probabilit|overwhelming/);
  }
});
test('mandatory Pelicans replay retains every snapshot and separates final 97 from live 71',()=>{
  const before=JSON.stringify(detail),g=detail.sportsRadarGame,data=center.observations(g,detail),live=data.points.filter(center.reliable);
  assert.equal(g.score,97);assert.equal(g.pregameBaseline.score,51);assert.equal(live.at(-1).score,71);assert.equal(live.at(-1).label,'OT 7.3');
  assert.equal(live.length,296);assert.equal(data.points.length,475);assert.equal(live.some(p=>p.score===97),false);
  assert.equal(data.points.filter(p=>p.ratingKind==='final'&&p.evidenceQuality==='verified'&&p.score===97).length,5);
  const html=center.timeline(g,detail),svgs=html.match(/<svg[\s\S]*?<\/svg>/g).join('');
  assert.match(html,/Final game quality · After the game/);assert.match(html,/live graph ends at 71 \(OT 7.3\)/);
  assert.match(html,/Opening rating<\/span><strong>51/);assert.doesNotMatch(svgs,/rating: 97|Final game quality|After the game/);
  assert.equal(JSON.stringify(detail),before);
});
for(const sport of ['NFL','CFB','NBA','NHL','MLB','NCAAB','Tennis'])for(const same of [true,false])test(`${sport}: completed full or sparse history, equal or different final ratings stay separate (${same})`,()=>{
  const g={sport,id:'fixture',state:'completed',score:same?71:97,teams},period={NFL:4,CFB:5,NBA:5,NHL:5,MLB:10,NCAAB:2,Tennis:5}[sport];
  if(sport==='NHL')g.status='Final/SO';
  const snapshots=[0,1,2].map(i=>({state:'live',period,clock:sport==='CFB'?'':`0:${30-i*10}`,rating:65+i*3,observedAt:1000+i*15000,evidenceQuality:'verified',modelVersion:'same'}));
  for(const samples of [snapshots,snapshots.slice(-1),[],[snapshots[0],{...snapshots[1],evidenceQuality:'invalid'},snapshots[2]]]){
    const s={sportsRadarHistory:{snapshots:samples}},before=JSON.stringify(s),html=center.timeline(g,s);
    assert.match(html,/timeline-outcome/);assert.match(html,/separate assessment/);assert.equal(JSON.stringify(s),before);
    if(samples.length===1){assert.match(html,/only verified live rating/);assert.doesNotMatch(html,/live graph ends/);}
    const data=center.observations(g,s);for(let i=1;i<data.points.length;i++)if(center.comparable(data.points[i],data.points[i-1]))assert.ok(data.points[i].observedAt>data.points[i-1].observedAt&&data.points[i].x>data.points[i-1].x);
  }
});

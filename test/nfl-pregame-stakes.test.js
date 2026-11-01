import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {normalizeEvent,applyContextsToGame} from '../alerts-worker/src/live-game-model.js';
import {nflPregameContext,cachedNflPregame,NFL_CONTEXT_TTL,nflTeamNewsUrl} from '../alerts-worker/src/nfl-pregame.js';
import {articleMetadata,articleMatchesGame,contextsForGames,deterministicFactor,mergeFactors} from '../alerts-worker/src/storylines.js';
import {summaryUrl} from '../alerts-worker/src/providers/espn.js';
import helper from './helpers/nfl-pregame.cjs';
const require=createRequire(import.meta.url),core=require('../scoring/live-runtime.cjs'),evidence=require('../scoring/shared/nfl-pregame.js');
const data=helper.fixture(),before=helper.before(),plain=x=>JSON.parse(JSON.stringify(x));
const opposition=Object.values(data.summaries).flatMap(s=>s.standings?.groups || []).flatMap(g=>g.standings?.entries || []);
const source=id=>structuredClone(data.events.find(e=>e.id===id));
function score(event){const g=normalizeEvent(structuredClone(event),'NFL');applyContextsToGame(g,nflPregameContext(g,data.summaries[event.id],g.teams.flatMap(t=>data.teamNews[t[8]]?.articles || []),opposition,Date.parse(data.capturedAt)));return g;}
const rows=data.events.map(score);

test('captured November 1 baseline and all five abnormalities improve without per-game rules',()=>{
  assert.equal(rows.length,12);
  assert.deepEqual(data.events.map(e=>data.games.find(g=>g.id===e.id).score),[77,47,45,73,49,66,45,46,45,67,49,48]);
  const ranges={'401873025':[54,59],'401873027':[71,76],'401873033':[72,78],'401873031':[39,44],'401873024':[46,52]};
  for(const [id,[min,max]] of Object.entries(ranges)){const g=rows.find(g=>g.id===id);assert.ok(g.score>=min && g.score<=max,`${id}: ${g.score}`);}
  for(const id of ['401873026','401873030'])assert.ok(rows.find(g=>g.id===id).score>=70);
  for(const g of rows){assert.equal(g.score,core.clampScore(g.factors.reduce((n,f)=>n+f.points,0)));assert.ok(g.score<85);assert.ok(!g.qualitativeContexts.some(f=>/uniform/i.test(f.text)));}
});

test('actual standings distinguish a lead-changing game, a losing-record race, and an ordinary divisional game',()=>{
  const labels=id=>rows.find(g=>g.id===id).factors.map(f=>f.label);
  assert.ok(labels('401873027').includes('Division lead at stake'));
  assert.ok(labels('401873033').includes('Division lead at stake'));
  assert.ok(labels('401873025').includes('Division race positioning'));
  assert.ok(!labels('401873028').some(l=>/^Division (lead|race)/.test(l)));
  assert.ok(!labels('401873030').includes('Division lead at stake'),'Detroit cannot take first simply by winning');
});

test('stale season/record evidence, early-season standings, duplicate/future results stay conservative',()=>{
  const event=source('401873027'),summary=structuredClone(data.summaries[event.id]);
  summary.header.season.year=2025;assert.equal(evidence.evidenceFromSummary(event,summary),null);
  summary.header.season.year=2026;event.competitions[0].competitors[0].records[0].summary='6-2';assert.equal(evidence.evidenceFromSummary(event,summary),null);
  const e=source('401873027'),s=structuredClone(data.summaries[e.id]),game=s.lastFiveGames[0].events[0];
  s.lastFiveGames[0].events=[game,game,{...game,id:'future',gameDate:'2026-11-02T00:00Z'}];
  assert.equal(evidence.evidenceFromSummary(e,s).recent[0].events.length,1);
  for(const c of e.competitions[0].competitors)c.records[0].summary='1-1';
  assert.ok(!score(e).factors.some(f=>/^Division (lead|race)/.test(f.label)));
});

test('point differential, recent margins and opponent strength distinguish identical losing records',()=>{
  const g=rows.find(g=>g.id==='401873025');
  assert.ok(g.factors.some(f=>f.label==='Recent win over winning opposition'));
  const base=source(g.id),s=structuredClone(data.summaries[g.id]);
  for(const group of s.standings.groups)for(const team of group.standings.entries)for(const stat of team.stats)if(stat.name==='pointsFor')stat.value-=100;
  const weak=normalizeEvent(base,'NFL');applyContextsToGame(weak,nflPregameContext(weak,s));
  assert.ok(weak.score<g.score);
});

test('spread effects stay continuous; 6.5/7 are moderate favorites and totals contribute at most five',()=>{
  const e=source('401873024'),teams=e.competitions[0].competitors.map(c=>({name:c.team.displayName,abbr:c.team.abbreviation,score:'0'}));
  const rating=spread=>{const c={...e.competitions[0],odds:[{spread,overUnder:54.5}]};return core.rateGame('NFL','upcoming',teams,e,c,'');};
  let previous=Infinity;
  for(let spread=0;spread<=30;spread+=.05){const g=rating(spread);assert.ok(g.score<=previous);previous=g.score;}
  for(const spread of [6.5,7])assert.ok(rating(spread).factors.some(f=>f.label==='Moderate projected favorite'));
  assert.ok(rating(7.5).factors.some(f=>f.label==='Substantial projected favorite'));
  const c=e.competitions[0];c.odds=[{spread:7,overUnder:35}];const low=core.pregameRating('NFL',e,c,'');
  c.odds[0].overUnder=46;assert.equal(core.pregameRating('NFL',e,c,'').score,low.score,'no low-total deduction');
  c.odds[0].overUnder=90;assert.equal(core.pregameRating('NFL',e,c,'').factors.find(f=>f.label==='Expected scoring potential').points,5);
});

test('returns are directly relevant, source-linked and deduplicated; uniform roundups never match',()=>{
  for(const id of ['401873024','401873026']){
    const g=rows.find(g=>g.id===id),f=g.factors.find(f=>f.contextType==='star_injury_return');
    assert.equal(f.points,id==='401873026'?5:2);assert.match(f.sourceUrl,/espn.com/);
    assert.equal(g.factors.filter(f=>f.contextType==='star_injury_return').length,1);
  }
  const game={eventId:'test',teams:[{id:'33',name:'Baltimore Ravens',abbr:'BAL'},{id:'2',name:'Buffalo Bills',abbr:'BUF'}],teamIds:new Set(['33','2'])};
  const uniform=articleMetadata(data.news.articles.find(a=>/uniforms/.test(a.headline)));uniform.eventIds.add('test');
  assert.equal(articleMatchesGame(uniform,game),false);
  const unrelated={...uniform,headline:'Jaguars coach returns to former team',description:'Jacksonville travels to Detroit.',eventIds:new Set(),teamIds:new Set(['30','8'])};
  assert.equal(articleMatchesGame(unrelated,game),false);
  for(const headline of ['Cowboys look for rare winning streak','Rams and Chargers share a city, not a rivalry','NFL players show off best arrivals'])assert.equal(deterministicFactor({headline,description:''}),null);
  assert.equal(deterministicFactor({headline:'Rivals prepare for rematch after player confrontation',description:''}).type,'rivalry_development');
});

test('rivalry/rematch/standings share a cap; news cannot stack over measured streaks',()=>{
  const g=score(source('401873027'));
  applyContextsToGame(g,[...g.qualitativeContexts,...['rivalry','rivalry_development','playoff_rematch','championship_rematch','playoff_race','team_win_streak'].map(type=>({type,text:'Verified context',verified:true,confidence:.9}))]);
  const points=g.factors.filter(f=>/^(AFC|NFC).*matchup$|^Division (lead|race)|^Season-series/.test(f.label) || ['rivalry','rivalry_development','meaningful_rematch','playoff_rematch','championship_rematch','playoff_race'].includes(f.contextType)).reduce((n,f)=>n+f.points,0);
  assert.ok(points<=12);assert.ok(!g.factors.some(f=>f.contextType==='team_win_streak'));
  assert.ok(g.factors.filter(f=>f.contextType).reduce((n,f)=>n+Math.max(0,f.points),0)<=6);
  const returning=score(source('401873026'));
  applyContextsToGame(returning,[...returning.qualitativeContexts,{type:'former_star_return',text:'Same return covered again',confidence:.9,verified:true}]);
  assert.equal(returning.factors.filter(f=>['star_injury_return','former_star_return'].includes(f.contextType)).length,1,'overlapping return coverage earns one award');
});

test('cached uniform contexts are rejected immediately without writes or inference',async()=>{
  const g=rows[0],calls=[];const env={DB:{prepare(sql){calls.push(sql);return{bind(){return{async all(){return{results:[{sport:'NFL',event_id:g.id,factor_type:'rivalry',context_text:'Rivalries uniforms',source_title:'NFL Week 8 uniforms: Jaguars, Lions become latest team to debut Rivalries look',source_published:Date.now()/1000,confidence:.99}]};}};}};}}};
  assert.deepEqual(await contextsForGames(env,[`NFL:${g.id}`],[g]),{});assert.ok(calls.every(sql=>sql.startsWith('SELECT')));
});

test('six-hour context cache consumes existing summaries/news with no fetches or writes',async()=>{
  const g=normalizeEvent(source('401873024'),'NFL'),now=Date.parse('2026-11-01T14:00Z'),urls=[summaryUrl(g),...g.teams.map(t=>nflTeamNewsUrl(t[8]))];
  const payloads=[data.summaries[g.id],...g.teams.map(t=>data.teamNews[t[8]])];let reads=0;
  const env={DB:{prepare(sql){assert.ok(sql.startsWith('SELECT'));reads++;return{bind(){return{async all(){return{results:urls.map((key,i)=>({key,payload:JSON.stringify(payloads[i]),updated_at:now-1000}))};}};}};}}};
  const result=await cachedNflPregame(env,[g],now);assert.equal(reads,1);assert.deepEqual(result.deferred,[]);assert.ok(result.contexts[g.id].length);
  const expired=await cachedNflPregame(env,[g],now+NFL_CONTEXT_TTL);assert.equal(expired.deferred.length,3);
});

test('browser and Worker agree on every recalculated game; observed pregame ratings survive kickoff',()=>{
  const browser=vm.runInNewContext(fs.readFileSync('dist/scoring-runtime.js','utf8')+';SportsRadarScore');
  for(const original of rows){
    const g={...structuredClone(original),sourceEvent:structuredClone(original.sourceEvent),sourceCompetition:structuredClone(original.sourceCompetition)},c=g.sourceCompetition;
    const b=browser.rateGame('NFL','upcoming',g.teams.map(t=>({name:t[0],abbr:t[1],score:t[2]})),g.sourceEvent,c,g.context);
    assert.equal(b.score,g.score);assert.deepEqual(plain(b.factors),plain(g.factors));
    const event=structuredClone(g.sourceEvent);event.competitions=[{...structuredClone(c),status:{period:1,displayClock:'15:00',type:{state:'in',name:'STATUS_IN_PROGRESS'}}}];
    const live=normalizeEvent(event,'NFL');core.preservePregameBaseline(live,g);core.applyLiveSnapshot(live,live.sourceCompetition,null);
    assert.equal(live.openingScore,g.score);assert.ok(Math.abs(live.score-g.score)<=1,`${g.id}: ${g.score} -> ${live.score}`);
  }
});

test('historical NFL and other-sport live/final scoring stays identical to the frozen production engine',()=>{
  let count=0;
  const archive=JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync('alerts-worker/test/fixtures/migration-inputs.json.gz')));
  for(const input of Object.values(archive)){
    const event=input.event,c=event.competitions[0],sport=input.modelSport,state=c.status.type.state==='pre'?'upcoming':c.status.type.state==='post'?'completed':'live';
    if(state==='upcoming')continue;
    const args=[sport,state,c.competitors.map(t=>({name:t.team?.displayName,abbr:t.team?.abbreviation,score:t.score,record:t.records?.[0]?.summary,id:t.team?.id})),event,c,event.name];
    const a=core.rateGame(...args),b=before.rateGame(...args);assert.deepEqual(plain(a),plain(b),`${input.sport}:${input.id}`);count++;
  }assert.ok(count>=20);
  const future=data.games.filter(g=>g.sport==='NFL' && g.state==='upcoming' && !data.events.some(e=>e.id===g.id));
  assert.ok(future.length>=10);for(const g of future){
    const event={id:g.id,date:g.startTime,season:{year:2026,type:2},competitions:[{status:{type:{state:'pre'}},competitors:g.teams.map((t,i)=>({team:{id:t[8],displayName:t[0],abbreviation:t[1]},records:[{type:'total',summary:t[5]}],score:'0',homeAway:i?'home':'away'}))}]};
    const current=normalizeEvent(event,'NFL');assert.ok(current.score>=25 && current.score<=85);
  }
});

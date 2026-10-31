import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {compareCheckpoint,correctionReplay,publicCheckpoint} from '../calibration/nhl-public-replay.mjs';
const require=createRequire(import.meta.url),core=require('../rating-core.js');
const {nhlAdvancedStats,eventTime}=require('../scoring/nhl-advanced.cjs');
const {experimentalNhlRating,DEFAULT_FLAGS,pressureComponent}=require('../calibration/nhl-pressure-experiment.cjs');
const runtime=require('../scoring/live-runtime.cjs');
const dir=new URL('./fixtures/nhl-public/',import.meta.url);
const fixtures=readdirSync(dir).filter(f=>/^\d{10}\.json$/.test(f)).map(f=>JSON.parse(readFileSync(new URL(f,dir))));
const play=(id,type,clock,owner=1,situationCode='1551',period=1)=>({eventId:id,typeDescKey:type,
  periodDescriptor:{number:period,periodType:period>3?'OT':'REG'},timeInPeriod:clock,sortOrder:id,
  situationCode,details:{eventOwnerTeamId:owner}});
const pbp=plays=>({id:123,gameType:2,awayTeam:{id:1,abbrev:'AWY'},homeTeam:{id:2,abbrev:'HME'},plays});

test('attempt accounting includes goals once; blocks belong to shooter; Fenwick is unblocked only',()=>{
  const s=nhlAdvancedStats(pbp([play(1,'goal','00:10'),play(2,'shot-on-goal','00:20'),play(3,'missed-shot','00:30'),
    play(4,'blocked-shot','00:40'),play(5,'shot-on-goal','00:50',2),play(6,'stoppage','01:00')]));
  assert.deepEqual(s.fullGame['1'],{cf:4,ca:1,ff:3,fa:1,cfPct:80,ffPct:75});
  assert.deepEqual(s.score,{'1':1,'2':0});assert.equal(s.recentPressure.teams['1'].cf,3,'goal is not a second pressure reward');
  assert.equal(s.fullGame['1'].cf,s.fullGame['2'].ca);
});
test('5-on-5 explicitly excludes power plays, 4-on-4, empty nets and missing strength',()=>{
  const s=nhlAdvancedStats(pbp(['1551','1451','1441','0651',undefined].map((code,i)=>({...play(i+1,'shot-on-goal',`00:${10+i}`,1,code),situationCode:code}))));
  assert.equal(s.fullGame['1'].cf,5);assert.equal(s.fiveOnFive['1'].cf,1);
  assert.equal(s.rollingFiveMinutes.powerPlayAttempts,1);assert.equal(s.rollingFiveMinutes.emptyNetAttempts,1);
  assert.equal(s.quality.unknownStrength,1);assert.equal(s.pressureEligible,false);
});
test('five-minute window uses elapsed game time across intermission; strict lower boundary',()=>{
  const s=nhlAdvancedStats(pbp([play(1,'missed-shot','16:00'),play(2,'blocked-shot','16:01'),play(3,'shot-on-goal','00:59',2,'1551',2)]),{asOfElapsed:1260});
  assert.equal(s.rollingFiveMinutes.teams['1'].cf,1);assert.equal(s.fullGame['1'].cf,2);
  const expired=nhlAdvancedStats(pbp([play(1,'shot-on-goal','01:00')]),{asOfElapsed:1000});
  assert.equal(expired.rollingFiveMinutes.teams['1'].cf,0);assert.equal(expired.pressureEligible,false);
});
test('recent trailing pressure requires being behind at attempt time and resets on goals',()=>{
  const s=nhlAdvancedStats(pbp([play(1,'shot-on-goal','01:00'),play(2,'goal','01:10',2),play(3,'blocked-shot','01:20'),
    play(4,'shot-on-goal','01:25',2),play(5,'shot-on-goal','01:30',1,'0651')]));
  assert.equal(s.trailingTeamId,'1');assert.equal(s.recentPressure.trailingAttempts,2);
  assert.equal(s.recentPressure.trailingUnblocked,1);assert.equal(s.recentPressure.weightedTrailingAttempts,1.5);
  const tied=nhlAdvancedStats(pbp([...pbp([]).plays,play(1,'goal','01:00',2),play(2,'goal','01:20'),play(3,'shot-on-goal','01:21')]));
  assert.equal(tied.trailingTeamId,null);assert.equal(tied.recentPressure.trailingAttempts,0);
  const sameClock=nhlAdvancedStats(pbp([play(1,'shot-on-goal','01:00'),play(2,'goal','01:00',2),play(3,'shot-on-goal','01:00')]));
  assert.equal(sameClock.recentPressure.trailingAttempts,1,'same-clock attempts before the goal are excluded');
});
test('event revisions replace rather than accumulate, and snapshot removal reverses totals',()=>{
  const original=play(1,'blocked-shot','01:00'),corrected={...original,typeDescKey:'missed-shot',modified:'2026-01-01T00:02:00Z'},
    older={...original,modified:'2026-01-01T00:01:00Z'};
  const s=nhlAdvancedStats(pbp([original,corrected,older]));
  assert.equal(s.fullGame['1'].cf,1);assert.equal(s.fullGame['1'].ff,1);assert.equal(s.quality.duplicates,2);
  assert.equal(nhlAdvancedStats(pbp([])).fullGame['1'].cf,0);
  assert.equal(nhlAdvancedStats(pbp([corrected])).fullGame['1'].cf,1);
});
test('no future leakage, invalid clocks are quarantined and zero denominators remain null',()=>{
  const s=nhlAdvancedStats(pbp([play(1,'goal','02:00'),play(2,'shot-on-goal','01:99')]),{asOfElapsed:60});
  assert.equal(s.fullGame['1'].cf,0);assert.equal(s.fullGame['1'].cfPct,null);
  assert.equal(s.score['1'],0);assert.equal(s.quality.unknownTime,1);assert.equal(s.pressureEligible,false);
  const missing=play(null,'shot-on-goal','00:01');assert.equal(nhlAdvancedStats(pbp([missing])).quality.missingIds,1);
});
test('regular-season and playoff overtime use their physical period lengths; SO attempts excluded',()=>{
  assert.equal(eventTime(play(1,'shot-on-goal','02:00',1,'1331',4),2),3720);
  assert.equal(eventTime(play(1,'shot-on-goal','02:00',1,'1551',5),3),4920);
  const so={...play(1,'goal','00:01',1,'1010',5),periodDescriptor:{number:5,periodType:'SO'}};
  assert.equal(nhlAdvancedStats(pbp([so])).fullGame['1'].cf,0);
});
test('all historical source snapshots have verified hashes and match official non-shootout goals/SOG',()=>{
  for(const f of fixtures) {
    const bytes=readFileSync(new URL(`${f.id}.json`,dir)),meta=JSON.parse(readFileSync(new URL(`${f.id}.source.json`,dir)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.sha256);
    assert.equal(meta.url,`https://api-web.nhle.com/v1/gamecenter/${f.id}/play-by-play`);
    for(const team of [f.homeTeam,f.awayTeam]) {
      const shots=f.plays.filter(p=>['goal','shot-on-goal'].includes(p.typeDescKey) && p.periodDescriptor.periodType!=='SO' && p.details?.eventOwnerTeamId===team.id);
      assert.equal(shots.length,team.sog,`${f.id} ${team.abbrev} SOG`);
    }
    const s=nhlAdvancedStats(f);assert.equal(s.quality.unknownTeam,0);assert.equal(s.quality.unknownStrength,0);
    if(f.periodDescriptor.periodType!=='SO'){assert.equal(s.score[f.homeTeam.id],f.homeTeam.score);assert.equal(s.score[f.awayTeam.id],f.awayTeam.score);}
  }
});
test('flag defaults off; explicit false equals baseline; active production entry never imports experiment',()=>{
  assert.equal(DEFAULT_FLAGS.nhlAdvancedPressure,false);
  const f=fixtures.find(f=>f.id===2023030417),plays=f.plays.filter(p=>eventTime(p,f.gameType)!==null).slice(0,150);
  const r=compareCheckpoint(f,plays);
  assert.deepEqual(experimentalNhlRating(core,r.game,r.competition,r.summary,{...f,plays},{nhlAdvancedPressure:false}),r.old);
  const game={...structuredClone(r.game),sourceEvent:r.game.sourceEvent,sourceCompetition:r.game.sourceCompetition};runtime.applyLiveSnapshot(game,r.competition,r.summary);
  assert.equal(game.score,r.old.score);assert.equal(game.scoringPolicy,runtime.POLICY_ID);
  const {buildSync}=require('../alerts-worker/node_modules/esbuild');
  const bundle=buildSync({entryPoints:['scoring/browser-entry.cjs'],bundle:true,write:false,metafile:true});
  assert.ok(!Object.keys(bundle.metafile.inputs).some(p=>p.includes('nhl-pressure-experiment')));
});
test('historical archetypes preserve base, clocks, margin and manpower, replacing legacy shot support once',()=>{
  const found=new Set();
  for(const f of fixtures) {
    const plays=f.plays.filter(p=>eventTime(p,f.gameType)!==null);
    for(let i=1;i<plays.length;i++) {
      const p=plays[i],s=nhlAdvancedStats({...f,plays:plays.slice(0,i+1)}),time=eventTime(p,f.gameType);
      const labels=[...(p.periodDescriptor.number===3 && time>=3300 && s.gap===1?['late-one-goal']:[]),
        ...(s.gap===0?['tied']:[]),...(s.gap>=3?['blowout']:[]),
        ...(['1451','1541','1351','1531'].includes(p.situationCode)?['power-play']:[]),
        ...(/^[0]|0$/.test(p.situationCode)?['empty-net']:[]),...(p.periodDescriptor.number>3?['overtime']:[])];
      if(!labels.some(l=>!found.has(l)))continue;
      const r=compareCheckpoint(f,plays.slice(0,i+1));for(const label of labels)found.add(label);
      assert.equal(r.old.baseScore,r.experimental.baseScore);assert.deepEqual(r.old.state,r.experimental.state);
      assert.deepEqual(r.old.live.sportImpact.manpower,r.experimental.live.sportImpact.manpower);
      assert.deepEqual(r.old.live.sportImpact.overtime,r.experimental.live.sportImpact.overtime);
      const e=r.experimental.pressureExperiment;assert.equal(e.applied,true);assert.ok(e.points>=0 && e.points<=4);
      assert.equal(r.experimental.live.components.pressure,e.points);
      assert.equal(r.experimental.live.sportImpact.competitiveTarget,e.pressureFreeTarget>0?e.pressureFreeTarget+e.points:0);
      if(s.gap>=3)assert.equal(e.points,0);
      assert.ok(r.experimental.score<=r.old.score+4);
    }
    const r=compareCheckpoint(f,plays,plays.at(-1),true);assert.equal(r.old.score,r.experimental.score,'completed rating unchanged');
  }
  assert.deepEqual([...found].sort(),['blowout','empty-net','late-one-goal','overtime','power-play','tied']);
});
test('historical late and corrected arrivals replace totals and ratings, stale/mismatched PBP retains baseline',()=>{
  const f=fixtures.find(f=>f.id===2023030417);
  const end=f.plays.findIndex(p=>p.periodDescriptor.number===3 && eventTime(p,f.gameType)>3450);
  const plays=f.plays.slice(0,end+1),attempt=plays.findLast(p=>['blocked-shot','missed-shot','shot-on-goal'].includes(p.typeDescKey));
  const before=compareCheckpoint(f,plays.filter(p=>p!==attempt),plays.at(-1));
  const arrival=compareCheckpoint(f,plays);
  const correction={...attempt,typeDescKey:attempt.typeDescKey==='blocked-shot'?'missed-shot':'blocked-shot'};
  const revised=compareCheckpoint(f,plays.map(p=>p===attempt?correction:p));
  assert.equal(arrival.stats.fullGame[String(attempt.details.eventOwnerTeamId)].cf,before.stats.fullGame[String(attempt.details.eventOwnerTeamId)].cf+1);
  const duplicate=compareCheckpoint(f,[...plays,attempt]);assert.equal(duplicate.experimental.score,arrival.experimental.score);
  assert.deepEqual(duplicate.stats.fullGame,arrival.stats.fullGame);
  assert.equal(revised.stats.fullGame[String(attempt.details.eventOwnerTeamId)].cf,arrival.stats.fullGame[String(attempt.details.eventOwnerTeamId)].cf);
  for(const raw of [null,{...f,plays:plays.slice(0,20)}]) {
    const result=experimentalNhlRating(core,arrival.game,arrival.competition,arrival.summary,raw,{nhlAdvancedPressure:true});
    assert.equal(result.score,arrival.old.score);assert.equal(result.pressureExperiment.applied,false);
  }
  for(const r of [before,arrival,revised])assert.ok(Math.abs(r.experimental.score-r.old.score)<=7);
});
test('experimental data alignment accepts ESPN team IDs only with matching NHL sides and abbreviations',()=>{
  const f=fixtures.find(f=>f.id===2023030417),r=compareCheckpoint(f,f.plays.slice(0,150));
  const comp=structuredClone(r.competition);
  for(const c of comp.competitors)c.team.id='espn-'+c.team.id;
  const game={...r.game,sourceEvent:r.game.sourceEvent,sourceCompetition:comp,
    teams:r.game.teams.map(team=>{const copy=[...team];copy[8]='espn-'+copy[8];return copy;})};
  const summary={...r.summary,header:{...r.summary.header,competitions:[comp]}};
  const mapped=experimentalNhlRating(core,game,comp,summary,{...f,plays:f.plays.slice(0,150)},{nhlAdvancedPressure:true});
  assert.equal(mapped.pressureExperiment.applied,true);
  comp.competitors[0].team.abbreviation='NYR';
  const rejected=experimentalNhlRating(core,game,comp,summary,{...f,plays:f.plays.slice(0,150)},{nhlAdvancedPressure:true});
  assert.equal(rejected.pressureExperiment.applied,false);
});
test('quiet historical close and late states keep exact existing ratings and targets',()=>{
  const f=fixtures.find(f=>f.id===2023030417),late=f.plays.findIndex(p=>p.periodDescriptor.number===3 && eventTime(p,f.gameType)>3480);
  const quiet=f.plays.slice(0,late+1).filter(p=>!['shot-on-goal','missed-shot','blocked-shot'].includes(p.typeDescKey));
  const r=compareCheckpoint(f,quiet,f.plays[late]);
  assert.equal(r.experimental.pressureExperiment.points,0);assert.equal(r.experimental.score,r.old.score);
  assert.equal(r.experimental.live.sportImpact.competitiveTarget,r.old.live.sportImpact.competitiveTarget);
  assert.deepEqual(r.experimental.historyOwnership,r.old.historyOwnership);
});
test('replay adapter preserves post chances and distinguishes empty-net from shorthanded goals',()=>{
  const f=fixtures.find(f=>f.id===2023030417),at=f.plays.find(p=>p.periodDescriptor.number===3);
  const events=[{...at,eventId:1,sortOrder:1,typeDescKey:'missed-shot',details:{eventOwnerTeamId:22,reason:'hit-left-post'}},
    {...at,eventId:2,sortOrder:2,typeDescKey:'goal',situationCode:'0651',details:{eventOwnerTeamId:13}},
    {...at,eventId:3,sortOrder:3,typeDescKey:'goal',situationCode:'1451',details:{eventOwnerTeamId:22}}];
  const r=publicCheckpoint(f,events,events.at(-1));
  assert.match(r.summary.plays[0].text,/hit the post/);
  assert.equal(r.summary.plays[1].text,'Goal (empty net)');
  assert.match(r.summary.plays[2].text,/Shorthanded Goal/);
});
test('pressure cap and trailing direction: full-game totals cannot add points; blowouts zero',()=>{
  const raw=pbp([play(1,'goal','10:00',2),...Array.from({length:12},(_,i)=>play(i+2,'shot-on-goal',`11:${String(i).padStart(2,'0')}`))]);
  const stats=nhlAdvancedStats(raw),value=pressureComponent(stats,{progress:.95,gap:1});
  assert.ok(value.points>0 && value.points<=4);
  assert.equal(pressureComponent({...stats,fullGame:{}},{progress:.95,gap:1}).points,value.points);
  assert.equal(pressureComponent(stats,{progress:.95,gap:4}).points,0);
});
test('Game Center presents mapped statistics, zero shares, missing data and freshness without affecting rating',()=>{
  const source=readFileSync('app.js','utf8'),start=source.indexOf('function basketballPeriodLabel('),end=source.indexOf('function readRatingHistory(',start);
  const context=vm.createContext({safeText:String});vm.runInContext(source.slice(start,end),context);
  const stats=nhlAdvancedStats(pbp([]));
  const summary={header:{competitions:[{competitors:[{homeAway:'away',team:{id:'a',abbreviation:'AWY'}},{homeAway:'home',team:{id:'h',abbreviation:'HME'}}]}]},
    nhlAdvanced:{...stats,teamIdMap:{a:'1',h:'2'},stale:true}};
  const html=context.detailNhlAdvanced(summary);
  assert.match(html,/Full game Corsi/);assert.match(html,/5-on-5 Fenwick/);assert.match(html,/Last 5 minutes/);
  assert.match(html,/awaiting score reconciliation/);assert.doesNotMatch(html,/NaN|Infinity|undefined/);
  assert.match(context.detailNhlAdvanced({}),/unavailable/);
  context.storylineDetails=()=>'';
  vm.runInContext(source.slice(source.indexOf('const DETAIL_TAB_CONFIG ='),source.indexOf('function detailTabsMarkup(')),context);
  const tabs=context.detailTabSections({sport:'NHL'},summary);
  assert.match(tabs.find(tab=>tab.id==='team-stats').content,/Full game Corsi/);
});
test('Game Center preserves ESPN column order and maps real counts to the matching headings',()=>{
  const source=readFileSync('app.js','utf8'),start=source.indexOf('function basketballPeriodLabel('),end=source.indexOf('function readRatingHistory(',start);
  const context=vm.createContext({safeText:String});vm.runInContext(source.slice(start,end),context);
  const stats=nhlAdvancedStats(pbp([play(1,'shot-on-goal','00:10'),play(2,'missed-shot','00:20',2),play(3,'blocked-shot','00:30',2)]));
  const summary={header:{competitions:[{competitors:[{homeAway:'home',team:{id:'h',abbreviation:'HME'}},{homeAway:'away',team:{id:'a',abbreviation:'AWY'}}]}]},
    nhlAdvanced:{...stats,teamIdMap:{a:'1',h:'2'}}};
  const html=context.detailNhlAdvanced(summary);
  assert.match(html,/<span>HME<\/span><span>AWY<\/span>/);
  assert.match(html,/<span>2<\/span><span>Full game Corsi<\/span><span>1<\/span>/);
  assert.match(html,/<span>66\.7%<\/span><span>Full game Corsi %<\/span><span>33\.3%<\/span>/);
});
test('production Worker graph includes display statistics but excludes the offline scoring experiment',()=>{
  const {buildSync}=require('../alerts-worker/node_modules/esbuild');
  const bundle=buildSync({entryPoints:['alerts-worker/src/index.js'],bundle:true,platform:'browser',format:'esm',write:false,metafile:true,external:['cloudflare:*']});
  const inputs=Object.keys(bundle.metafile.inputs);
  assert.ok(inputs.some(p=>p.endsWith('scoring/nhl-advanced.cjs')));
  assert.ok(!inputs.some(p=>p.includes('nhl-pressure-experiment')||p.includes('nhl-public-replay')));
  assert.doesNotMatch(bundle.outputFiles[0].text,/NHL_LIVE_PRESSURE|nhlAdvancedPressure/);
});
test('saved historical comparison reproduces rating extrema, final ratings and arrival histories against current code',()=>{
  const report=JSON.parse(readFileSync('calibration/output/nhl-pressure-comparison.json'));
  assert.equal(report.enabledInProduction,false);assert.equal(report.pressureCap,4);assert.equal(report.games.length,8);
  for(const g of report.games) {
    const f=fixtures.find(f=>String(f.id)===g.gameId),history=g.history;
    assert.equal(g.oldPeak,Math.max(...history.map(r=>r.old)));assert.equal(g.experimentalPeak,Math.max(...history.map(r=>r.experimental)));
    assert.equal(g.oldFinal,history.at(-1).old);assert.equal(g.oldFinal,g.experimentalFinal);
    for(const r of history){assert.ok(r.pressure===null || (r.pressure>=0 && r.pressure<=4));assert.ok(r.delta<=4);if(r.gap>=3)assert.equal(r.delta,0);}
    const extremum=key=>history.reduce((a,b)=>b[key]>a[key]?b:a);
    const checkpoints=new Set([history[0],extremum('old'),extremum('experimental'),extremum('delta'),history.at(-1)]);
    for(const h of checkpoints) {
      const index=f.plays.findIndex(p=>p.eventId===h.eventId),plays=h.final?f.plays:f.plays.slice(0,index+1);
      const current=compareCheckpoint(f,plays,f.plays[index],h.final);
      assert.equal(current.old.score,h.old,`${g.gameId}/${h.eventId} baseline`);
      assert.equal(current.experimental.score,h.experimental,`${g.gameId}/${h.eventId} experiment`);
    }
  }
  const corrections=correctionReplay(fixtures.find(f=>f.id===2023030417));assert.deepEqual(corrections,report.corrections);
  assert.deepEqual(corrections.history[0].fullGame,corrections.history.at(-1).fullGame);
  assert.deepEqual(corrections.history[1].fullGame,corrections.history[2].fullGame);
});

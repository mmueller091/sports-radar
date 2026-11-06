import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditGame,auditTimeline,SPORTS} from '../src/audit.js';
import worker from '../src/index.js';

const now=Date.parse('2026-11-03T20:00:00Z');
function game(sport='NHL',options={}) {
  const {score=60,scores=[1,1],period=2,clock='10:00',state='live',phase='',...rest}=options;
  return {id:'fixture',sport,state,score,status:phase,teams:[['Away','AWY',String(scores[0])],['Home','HOM',String(scores[1])]],
    liveRawStatus:{period,displayClock:clock,type:{state:state==='live'?'in':'pre'}},...rest};
}
const prior=(g,at=now-180000)=>({observed_at:at,state:g.state,normalized_state:JSON.stringify(g),model_version:'fixture'});
const codes=(g,p=null,peers=[],cross=null)=>auditGame(g,p?[p]:[],peers,now,cross).findings.map(f=>f.reasonCode);

test('all supported sport keys are audited without sharing production scorer',()=>{
  assert.deepEqual([...SPORTS].sort(),['CFB','MLB','NBA','NCAAB','NFL','NHL','Tennis'].sort());
  assert.equal(auditGame(game('Tennis',{context:'Wimbledon'}),[],[],now).checks>=10,true);
  assert.equal(auditGame(game('Tennis'),[],[],now).checks,0);
  assert.equal(auditGame(game('Soccer'),[],[],now).checks,0);
});
test('kickoff jump is a hypothesis, but score-backed drama is allowed',()=>{
  const opening=prior(game('CFB',{state:'upcoming',score:35,period:0}),now-86400000);
  assert.ok(codes(game('CFB',{score:70,scores:[0,0],period:1,clock:'14:52'}),opening).includes('KICKOFF_JUMP'));
  const before=prior(game('NFL',{score:45,scores:[14,17],period:4,clock:'1:00'}));
  assert.ok(!codes(game('NFL',{score:93,scores:[21,17],period:4,clock:'0:55',moment:'Go-ahead touchdown'}),before).includes('UNEXPLAINED_RISE'));
  assert.ok(codes(game('NFL',{score:75,scores:[14,17],period:4,clock:'0:55'}),before).includes('UNEXPLAINED_RISE'));
});
test('NHL inflation and NCAA basketball late blowout are review candidates',()=>{
  assert.ok(codes(game('NHL',{score:91,scores:[5,1],period:3,clock:'1:00'})).includes('LATE_WIDE_MARGIN_HIGH'));
  assert.ok(codes(game('NCAAB',{score:90,scores:[82,52],period:2,clock:'2:00'})).includes('LATE_WIDE_MARGIN_HIGH'));
  assert.ok(!codes(game('NHL',{score:95,scores:[2,2],period:4,clock:'3:00',context:'Stanley Cup Final'})).includes('LATE_WIDE_MARGIN_HIGH'));
});
test('clock rollback, bad period and overtime label are separate layers',()=>{
  const before=prior(game('NBA',{score:70,period:4,clock:'1:00'}));
  const current=game('NBA',{score:70,period:4,clock:'5:00'});
  assert.ok(codes(current,before).includes('CLOCK_ROLLBACK'));
  assert.ok(codes(game('NBA',{score:70,period:6,phase:'6th quarter'})).includes('OVERTIME_LABEL'));
  assert.ok(codes(game('NHL',{score:70,period:0})).includes('INVALID_PERIOD'));
});
test('history and source integrity failures alert deterministically',()=>{
  const g=game();
  assert.ok(codes(g,prior(game('NHL',{state:'completed'}))).includes('FINAL_TO_LIVE'));
  assert.ok(codes(g,prior(g,now+60000)).includes('HISTORY_FUTURE_TIMESTAMP'));
  assert.ok(codes(g,{observed_at:now-60000,state:'live',normalized_state:'{'}).includes('HISTORY_JSON_CORRUPT'));
  assert.ok(codes({...g,scoreboard:game('NHL',{scores:[3,1]})}).includes('SCOREBOARD_ENRICHMENT_CONFLICT'));
  assert.ok(codes(g,null,[],{scores:[2,1],ageMs:10000}).includes('NHL_SOURCE_SCORE_CONFLICT'));
});
test('similar-state peer comparison requires five independent supplied games',()=>{
  const g=game('NBA',{score:93,scores:[65,65],period:4,modelVersion:'one',openingScore:50,live:{components:{pressure:0}}});
  assert.ok(!codes(g,null,[{rating:40},{rating:40},{rating:40},{rating:40}]).includes('SIMILAR_STATE_OUTLIER'));
  assert.ok(!codes(g,null,Array.from({length:5},()=>({rating:40}))).includes('SIMILAR_STATE_OUTLIER'),'anonymous unverified ratings are not peers');
  const peers=Array.from({length:5},(_,i)=>({game_key:`NBA:peer${i}`,rating:40,evidence:JSON.stringify({state:{...g,id:`peer${i}`,score:40},scoringVersion:'one'})}));
  assert.ok(codes(g,null,peers).includes('SIMILAR_STATE_OUTLIER'));
  assert.ok(!codes(g,null,peers.map(p=>({...p,game_key:'NBA:same'}))).includes('SIMILAR_STATE_OUTLIER'),'repeated observations cannot manufacture independent games');
  assert.ok(!codes({...g,modelVersion:'two'},null,peers).includes('SIMILAR_STATE_OUTLIER'),'model versions cannot be pooled');
});
test('archived NHL public replay keeps legitimate dramatic movement unflagged',()=>{
  const replay=JSON.parse(fs.readFileSync(new URL('../../calibration/output/nhl-pressure-comparison.json',import.meta.url)));
  const history=replay.games.find(item=>item.gameId==='2023030417').history;
  let compared=0;
  for (let i=1;i<history.length;i++) {
    const a=history[i-1],b=history[i];
    if (b.elapsed-a.elapsed>180 || b.elapsed<a.elapsed || b.final) continue;
    const make=row=>game('NHL',{score:row.old,scores:Object.values(row.score),period:row.period,clock:row.timeRemaining,
      context:'Stanley Cup Final',moment:row.eventId===a.eventId?'':'Verified play '+row.eventId});
    const flags=codes(make(b),prior(make(a),now-(b.elapsed-a.elapsed)*1000));
    assert.ok(!flags.includes('LATE_WIDE_MARGIN_HIGH'));
    if (Object.values(a.score).join()!=Object.values(b.score).join()) assert.ok(!flags.includes('UNEXPLAINED_RISE'));
    compared++;
  }
  assert.ok(compared>100);
});
test('retained NCAA basketball replay exposes sequence ordering risk without inventing a clock error',()=>{
  const fixture=JSON.parse(fs.readFileSync(new URL('../../test/fixtures/real-games/NCAAB-20260328-401856574.json',import.meta.url)));
  const found=auditTimeline(fixture.summary,'NCAAB').findings.map(item=>item.reasonCode);
  assert.ok(found.includes('TIMELINE_SEQUENCE_CONFLICT'));
  assert.ok(!found.includes('TIMELINE_CLOCK_ORDER'));
  assert.ok(!found.includes('TIMELINE_SCORE_ROLLBACK'));
});
test('report is read-only and requires a private bearer token',async()=>{
  const env={AUDIT_READ_TOKEN:'secret'};
  assert.equal((await worker.fetch(new Request('https://audit.example/report'),env)).status,401);
  assert.equal((await worker.fetch(new Request('https://audit.example/report',{method:'POST'}),env)).status,405);
});
test('dashboard login sets a private session and keeps report access gated',async()=>{
  const env={AUDIT_READ_TOKEN:'test-dashboard-secret'};
  const locked=await worker.fetch(new Request('https://audit.example/dashboard'),env);
  assert.equal(locked.status,200);assert.match(await locked.text(),/Dashboard password/);
  const wrong=await worker.fetch(new Request('https://audit.example/session',{method:'POST',
    body:new URLSearchParams({password:'wrong'})}),env);
  assert.equal(wrong.status,401);
  const login=await worker.fetch(new Request('https://audit.example/session',{method:'POST',
    body:new URLSearchParams({password:'test-dashboard-secret'})}),env);
  assert.equal(login.status,303);assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const page=await worker.fetch(new Request('https://audit.example/dashboard',{headers:{Cookie:cookie}}),env);
  assert.match(await page.text(),/Games audited for this slate/);
  const source=await worker.fetch(new Request('https://audit.example/dashboard.js'),env);
  assert.match(await source.text(),/No live games have been audited/);
});

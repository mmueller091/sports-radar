import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import center from '../game-center.js';

const game=(sport='NBA',extra={})=>({id:'history',sport,state:'completed',score:97,teams:[['A','A','10','','','','','','a'],['B','B','10','','','','','','b']],sourceEvent:{season:{type:2}},...extra});
const p=(i,extra={})=>({observedAt:1793668305000+i*15000,state:'live',period:1,clock:`8:${String(50-i*5).padStart(2,'0')}`,rating:60+i,scoreA:'10',scoreB:'10',evidenceQuality:'verified',modelVersion:'test',...extra});
const detail=snapshots=>({sportsRadarHistory:{snapshots}});
function check(sport,snapshots,extra={}){
  const g=game(sport,extra),s=detail(snapshots),saved=JSON.stringify([g,s]);
  const data=center.observations(g,s),original=JSON.stringify(data),edges=center.connections(g,s,data);
  center.timeline(g,s);
  assert.equal(JSON.stringify([g,s]),saved,'canonical game and snapshots are immutable');
  assert.equal(JSON.stringify(data),original,'the drawing layer never reclassifies canonical observations');
  return {edges,data};
}
const allow=(sport,ps,extra)=>{const r=check(sport,ps,extra);assert.ok(r.edges.length);assert.ok(r.edges.every(e=>e.allowed),JSON.stringify(r.edges.map(e=>e.reason)));return r;};
const reject=(sport,ps,extra)=>{const r=check(sport,ps,extra);assert.ok(r.edges.every(e=>!e.allowed),JSON.stringify(r.edges.map(e=>e.reason)));return r;};

for(const sport of ['NFL','CFB','NBA','NCAAB','NHL']){
  test(`${sport}: regulation connects real anchors across multiple partial ledger updates`,()=>{
    const ps=[p(0),p(1,{evidenceQuality:'partial',rating:99,evidenceReasons:['ledger-behind-scoreboard']}),p(2,{evidenceQuality:'partial',rating:1}),p(3)];
    const r=allow(sport,ps);assert.equal(r.edges.length,1);assert.equal(r.edges[0].bridged,2);
    assert.deepEqual(r.data.points.filter(center.reliable).map(p=>p.score),[60,63]);
  });
  test(`${sport}: missing intermediate observation and missing partial metadata remain estimates`,()=>{
    allow(sport,[p(0),p(3)]);
    allow(sport,[p(0),p(1,{period:null,clock:'',evidenceQuality:'partial',scoreA:null}),p(3)]);
  });
  test(`${sport}: confirmed period end and new period`,()=>{
    const start=sport==='NCAAB'?'19:55':sport==='NHL'?'19:55':sport==='NBA'?'11:55':'14:55';
    allow(sport,[p(0,{clock:'0:00',phaseLabel:'End of 1st '+(sport==='NHL'?'period':sport==='NCAAB'?'half':'quarter')}),p(1,{period:2,clock:start})]);
  });
  test(`${sport}: verified early-period zero connects forward, not backward`,()=>{
    allow(sport,[p(0,{clock:'0:00'}),p(1,{period:2,clock:'8:00'})]);
    reject(sport,[p(0,{period:2,clock:'0.0'}),p(1,{period:2,clock:'1:08'})]);
  });
  test(`${sport}: a verified next-period endpoint establishes a visual connection`,()=>{
    const length=sport==='NBA'?12:sport==='NCAAB'||sport==='NHL'?20:15;
    allow(sport,[p(0,{clock:'0:03'}),p(1,{period:2,clock:`${length-1}:59`}),p(2,{period:2,clock:`${length-1}:55`})]);
    allow(sport,[p(0,{clock:'0:03'}),p(1,{period:2,clock:`${length-1}:59`})]);
  });
  test(`${sport}: no backward countdown or hidden partial clock reversal`,()=>{
    reject(sport,[p(0,{clock:'1:00'}),p(1,{clock:'1:08'})]);
    reject(sport,[p(0),p(1,{evidenceQuality:'partial',clock:'9:00'}),p(2)]);
  });
  test(`${sport}: same clock is unchanged geometry; a changed rating stays separate`,()=>{
    const r=allow(sport,[p(0),p(1,{clock:'8:50',rating:60}),p(2)]);assert.equal(r.edges[0].coincident,true);
    reject(sport,[p(0),p(1,{clock:'8:50'})]);
  });
  for(const [a,b]of [[5,3],[4,2],[3,2],[6,5]])test(`${sport}: impossible period ${a} to ${b} is disconnected`,()=>{
    reject(sport,[p(0,{period:a,clock:'1:00'}),p(1,{period:b,clock:'0:50'})],{sourceEvent:{season:{type:3}}});
  });
}
for(const sport of ['NFL','NBA','NCAAB','NHL'])test(`${sport}: multiple timed overtime periods retain their actual duration`,()=>{
  const g=game(sport,{sourceEvent:{season:{type:3}}}),f=center.format(g,{}),start=`${f.overtime/60-1}:59`;
  const r=allow(sport,[p(0,{period:f.periods+1,clock:'0:00',phaseLabel:'End of OT'}),p(1,{period:f.periods+2,clock:start})],{sourceEvent:{season:{type:3}}});
  assert.equal(r.data.points[1].x-r.data.points[0].x,1);
});
for(const sport of ['NFL','CFB','NBA','NCAAB'])test(`${sport}: halftime preserves the break without inventing elapsed time`,()=>{
  const g=game(sport),f=center.format(g,{}),period=f.periods/2;
  allow(sport,[p(0,{period,clock:'0:00',phaseLabel:'Halftime'}),p(1,{period:period+1,clock:`${f.periodLength/60-1}:59`,observedAt:p(0).observedAt+16*60000})]);
});
test('CFB: untimed overtime and additional overtime use observation time',()=>{
  const r=allow('CFB',[p(0,{period:5,clock:'',phaseLabel:'OT'}),p(1,{period:5,clock:'',phaseLabel:'OT'}),p(2,{period:6,clock:'',phaseLabel:'2OT'}),p(3,{period:6,clock:'',phaseLabel:'2OT'})]);
  assert.equal(r.data.axis,'observed');assert.equal(r.data.points[0].x,p(0).observedAt);
  reject('CFB',[p(0,{period:6,clock:''}),p(1,{period:5,clock:''})]);
});
test('NHL: regulation to OT to shootout follows evidence; shootout cannot return to play',()=>{
  allow('NHL',[p(0,{period:3,clock:'0:00',phaseLabel:'End of 3rd period'}),p(1,{period:4,clock:'4:59'})]);
  const r=allow('NHL',[p(0,{period:4,clock:'0:00',phaseLabel:'End of OT'}),p(1,{period:5,clock:'',phaseLabel:'Shootout'}),p(2,{period:5,clock:'',phaseLabel:'Shootout'})],{status:'Final/SO'});
  assert.equal(r.data.axis,'observed');
  for(const period of [3,4])reject('NHL',[p(0,{period:5,clock:'',phaseLabel:'Shootout'}),p(1,{period,clock:'1:00'})],{status:'Final/SO'});
});
test('NCAAM: second half cannot go back to first half',()=>reject('NCAAB',[p(0,{period:2,phaseLabel:'Second half'}),p(1,{period:1,phaseLabel:'First half'})]));
test('MLB: top/bottom and extra innings retain real order and wall timestamps',()=>{
  const ps=[p(0,{period:9,clock:'',phaseLabel:'Top 9th'}),p(1,{period:9,clock:'',phaseLabel:'Bottom 9th'}),p(2,{period:10,clock:'',phaseLabel:'Top 10th'}),p(3,{period:10,clock:'',phaseLabel:'Bottom 10th'})];
  const r=allow('MLB',ps);assert.equal(r.data.axis,'observed');assert.deepEqual(r.data.points.map(p=>p.x),ps.map(p=>p.observedAt));
  reject('MLB',[ps[1],p(2,{period:8,clock:'',phaseLabel:'Top 8th'})]);
  reject('MLB',[ps[1],p(2,{period:9,clock:'',phaseLabel:'Top 9th'})]);
  reject('MLB',[ps[0],p(2,{period:10,clock:'',phaseLabel:'Top 10th'})]);
  reject('MLB',[ps[0],p(2,{period:9,clock:'',phaseLabel:'Inning 9'})]);
});
test('Tennis: verified set transition uses cumulative sets; missing game/point order fails closed',()=>{
  const a=p(0,{period:1,clock:'',scoreA:'0',scoreB:'0',phaseLabel:'1st set'}),b=p(1,{period:2,clock:'',scoreA:'1',scoreB:'0',phaseLabel:'2nd set'});
  allow('Tennis',[a,b]);reject('Tennis',[b,{...a,observedAt:p(2).observedAt}]);
  reject('Tennis',[a,{...b,scoreA:'0'}]);reject('Tennis',[a,p(1,{period:1,clock:'',scoreA:'0',scoreB:'0'})]);
});
for(const [name,extra]of Object.entries({
  invalid:{evidenceQuality:'invalid'},integrity:{integrityIssue:true},unconfirmedClock:{timingIssue:'unconfirmed-period-transition'},
  clockCorrection:{observationIntegrity:{status:'revised'}},rejected:{liveUpdateRejected:true},unresolved:{evidenceReasons:['unconfirmed-clock']},
  lowerHomeScore:{scoreB:'9'},lowerAwayScore:{scoreA:'9'},malformedScore:{scoreA:'NaN'},negativeScore:{scoreA:'-1'},
  conflictingGame:{gameId:'different'},conflictingSport:{sport:'NFL'},conflictingKey:{gameKey:'NBA:other'},
  conflictingTeams:{teams:[['B','B',10],['A','A',10]]},modelChange:{modelVersion:'new'},missingModel:{modelVersion:null},
  missingTimestamp:{observedAt:null},malformedTimestamp:{observedAt:'nonsense'},blankTimestamp:{observedAt:''},
  duplicateTimestamp:{observedAt:p(0).observedAt},reverseTimestamp:{observedAt:p(0).observedAt-1},
  finalTransition:{state:'completed'},openingTransition:{state:'upcoming'},malformedClock:{clock:'8:99'},
  unconfirmedZero:{clock:'0.0'},phaseLabelConflict:{phaseLabel:'OT'},backwardPartialPhase:{period:5,clock:''},
})){test(`contradictory intermediate evidence stays disconnected: ${name}`,()=>{
  reject('NBA',[p(0),p(1,{evidenceQuality:'partial',...extra}),p(2)]);
});}
for(const extra of [{period:null},{clock:''},{observedAt:NaN},{observedAt:''},{scoreA:null},{modelVersion:null},{phaseLabel:'Second half'}])test(`unknown endpoint fails closed ${JSON.stringify(extra)}`,()=>reject('NBA',[p(0),p(1,extra)]));
test('an observed final and unverified opening never become curve anchors',()=>{
  const {edges}=check('NBA',[p(0,{state:'upcoming'}),p(1),p(2,{state:'completed',rating:97})]);assert.equal(edges.length,0);
});
for(const extra of [{gameId:'other'},{observedAt:p(0).observedAt},{clock:'12:00'},{scoreA:'9'},{modelVersion:'other'},{evidenceReasons:'unconfirmed-clock'}])test(`new-phase corroboration cannot use contradictory future evidence: ${JSON.stringify(extra)}`,()=>{
  const r=check('NBA',[p(0,{clock:'0:03'}),p(1,{period:2,clock:'11:59'}),p(2,{period:2,clock:'11:55',...extra})]);
  assert.ok(!r.edges[0]?.allowed);
});
test('long elapsed gaps connect verified anchors; missing entire periods remain gaps',()=>{
  allow('NBA',[p(0),p(1,{observedAt:p(0).observedAt+301000})]);
  allow('NBA',[p(0),p(1,{clock:'4:00'})]);
  reject('NBA',[p(0),p(1,{period:3})]);
});
test('NBA final-quarter zero still requires confirmation',()=>{
  reject('NBA',[p(0,{period:4,clock:'0.0'}),p(1,{period:5,clock:'4:59'})]);
});
test('CFB: recorded quarter-end dots connect across long gaps without repeated tooltip text',()=>{
  const a=p(0,{period:1,clock:'4:00',rating:54,scoreA:'0',scoreB:'0'});
  const b=p(1,{period:2,clock:'0:00',rating:64,scoreA:'7',scoreB:'0',observedAt:a.observedAt+30*60000});
  const repeated={...b,observedAt:b.observedAt+15000};
  const c=p(2,{period:3,clock:'0:00',rating:80,scoreA:'14',scoreB:'14',observedAt:b.observedAt+45*60000});
  const points=[a,b,repeated,c],r=allow('CFB',points);
  assert.equal(r.edges.length,3);
  const html=center.timeline(game('CFB',{state:'live',score:70}),detail(points));
  assert.equal((html.match(/<path class="timeline-line timeline-estimated/g)||[]).length,4,'both gaps are drawn on both chart sizes');
  const explanations=[...html.matchAll(/<g class="timeline-point" data-timeline-explanation="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(explanations.filter(text=>text.includes('Recorded rating: 64')).length,2,'one concise description per SVG');
  assert.ok(explanations.every(text=>text.length<150),'no concatenated recording history');
  assert.doesNotMatch(html,/Lines between recorded ratings are estimated|Gaps are left open/);
});
test('renderer exposes real anchors and endpoint-only estimated tooltips',()=>{
  const s=detail([p(0),p(1,{evidenceQuality:'partial',rating:99}),p(2)]),html=center.timeline(game(),s);
  assert.match(html,/Estimated connection between recorded ratings: 60/);assert.match(html,/and 62/);
  assert.doesNotMatch(html,/Lines between recorded ratings are estimated/);assert.match(html,/timeline-bridged/);
  assert.match(html,/Recorded rating: 60/);assert.match(html,/Score: 10–10/);assert.doesNotMatch(html,/Recorded rating: 99/);
  assert.match(html,/Retrospective final game quality/);assert.doesNotMatch(html.match(/<svg[\s\S]*?<\/svg>/)[0],/rating: 97/);
});
test('random uneven anchor spacing preserves exact endpoints, bounds and monotonicity of every cubic',()=>{
  let seed=83;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
  for(let trial=0;trial<100;trial++){
    let x=0;const ps=Array.from({length:20},()=>({x:x+=.001+random()*100,score:Math.floor(random()*101)}));
    const path=center.curve(ps,p=>p.x,p=>p.score),commands=[...path.matchAll(/([LC]) ([^MLC]+)/g)];assert.equal(commands.length,ps.length-1);
    for(let i=0;i<commands.length;i++){
      const [,cmd,args]=commands[i],v=args.trim().split(/\s+/).map(Number),a=ps[i],b=ps[i+1];
      assert.equal(v.at(-2),b.x);assert.equal(v.at(-1),b.score);
      if(cmd==='L')continue;
      assert.ok(v[0]>a.x&&v[2]>v[0]&&b.x>v[2]);
      let prior=a.score;
      for(let step=1;step<=100;step++){
        const t=step/100,u=1-t,y=u*u*u*a.score+3*u*u*t*v[1]+3*u*t*t*v[3]+t*t*t*b.score;
        assert.ok(y>=Math.min(a.score,b.score)-1e-9&&y<=Math.max(a.score,b.score)+1e-9);
        assert.ok((y-prior)*(b.score-a.score)>=-1e-9,'no invented turning point');prior=y;
      }
    }
  }
});
test('Pelicans: all 475 inputs and canonical classifications equal production; live 71, final 97 and extrema unchanged',()=>{
  const bytes=fs.readFileSync('test/fixtures/market-timeline/pelicans-grizzlies.json.gz'),s=JSON.parse(gunzipSync(bytes)),g=s.sportsRadarGame;
  const old=vm.createContext({module:{exports:{}}});vm.runInContext(execFileSync('git',['show','ce8200e:game-center.js'],{encoding:'utf8'}),old);
  const baseline=old.module.exports.observations(g,s),data=center.observations(g,s),saved=JSON.stringify(s);
  const edges=center.connections(g,s,data);center.timeline(g,s);
  assert.equal(JSON.stringify(data),JSON.stringify(baseline));assert.equal(JSON.stringify(s),saved);
  assert.ok(fs.readFileSync('test/fixtures/market-timeline/pelicans-grizzlies.json.gz').equals(bytes));
  assert.equal(data.points.length,475);const live=data.points.filter(center.reliable);
  assert.equal(live.length,296);assert.equal(live.at(-1).score,71);assert.equal(g.score,97);
  assert.equal(data.points.filter(p=>p.ratingKind==='live'&&p.incomplete).length,171);
  assert.equal(data.points.filter(p=>p.invalid).length,2);
  assert.ok(edges.filter(e=>e.allowed&&e.bridged).length>=60,'meaningful improvement without reclassifying partials');
  assert.ok(edges.filter(e=>!e.allowed).length>=29,'true same-clock and integrity breaks retained');
  assert.deepEqual(live.map(p=>p.score),Array.from(baseline.points.filter(old.module.exports.reliable),p=>p.score));
});
for(const file of fs.readdirSync('test/fixtures/history-interpolation').filter(n=>n.endsWith('.json.gz')))test(`captured public history is immutable and every visible edge is chronologically valid: ${file}`,()=>{
  const s=JSON.parse(gunzipSync(fs.readFileSync('test/fixtures/history-interpolation/'+file))),g=s.sportsRadarGame;
  const saved=JSON.stringify(s),data=center.observations(g,s),edges=center.connections(g,s,data);
  center.timeline(g,s);
  assert.equal(JSON.stringify(s),saved);
  for(const e of edges.filter(e=>e.allowed)){
    assert.ok(e.to.observedAt>e.from.observedAt);assert.ok(e.to.x>=e.from.x);
    assert.equal(e.to.modelVersion,e.from.modelVersion);
    assert.ok(Number(e.to.period)>=Number(e.from.period));
    assert.ok(Number(e.to.scoreA)>=Number(e.from.scoreA)&&Number(e.to.scoreB)>=Number(e.from.scoreB));
    assert.equal(e.from.ratingKind,'live');assert.equal(e.to.ratingKind,'live');
    assert.equal(e.from.evidenceQuality,'verified');assert.equal(e.to.evidenceQuality,'verified');
  }
});

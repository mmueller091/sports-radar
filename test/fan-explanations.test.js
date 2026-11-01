import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import * as active from '../alerts-worker/src/live-game-model.js';import {frame,evaluate} from './helpers/basketball-audit.mjs';
const source=fs.readFileSync('app.js','utf8'),start=source.indexOf('function explainRating('),end=source.indexOf('\nfunction trendFor(',start);
const explain=vm.runInNewContext(source.slice(start,end)+';explainRating');
const jargon=/capped at|individual margins|adjustment|jointly add|projected competitiveness|winning team quality|before market scaling|[+]\d|pregame rating:|starts at \d|puts.* at \d|\btrajectory\b|\btelemetry\b/i;
const team=(name,id,score)=>[name,id,score,'','','8-3',null,name,id];
for(const sport of ['NFL','CFB','MLB','NHL','NBA','NCAAB','Soccer','Tennis'])for(const state of ['upcoming','live','completed'])test(`${sport} ${state}: default explanation reads naturally and cannot change scoring`,()=>{
 const g={sport,state,teams:[team('Falcons','A','21'),team('Eagles','B','24')],score:72,why:'capped at five; +11.62 adjustment',
  factors:[{label:'Both winning records',points:11.62,detail:'individual margins capped at 21'},{label:'Current Tension',points:24},{label:'Tiny adjustment',points:.03}],
  line:{spread:'B -3'},liveRawStatus:{period:({NBA:4,NCAAB:2,MLB:8,NHL:3,NFL:4,CFB:4,Soccer:2,Tennis:3})[sport],displayClock:'1:00'},live:{reasons:['Projected competitiveness raises excitement (+6)','Capped at five points']}};
 const before=JSON.stringify(g),text=explain(g);assert.doesNotMatch(text,jargon);assert.equal(JSON.stringify(g),before);assert.match(text,/Falcons|Eagles|Both/);
 assert.ok(text.split(/[.!?](?:\s|$)/).filter(Boolean).length>=2,text);assert.ok(text.length<650,text);assert.doesNotMatch(text,/rivalry|injury|injuries|championship|playoff|historic/);
});
test('real game explanation names the verified comeback and current score without repeating the rating',()=>{
 const g=evaluate(active,frame()),text=explain(g);assert.match(text,/Notre Dame/);assert.match(text,/erased a \d+-point deficit/);assert.match(text,/70–68/);assert.match(text,/every possession/i);assert.doesNotMatch(text,new RegExp(`\\b${g.score}\\b`));assert.doesNotMatch(text,jargon);
});
test('ten-point expected mismatch is described without inventing an outcome',()=>{
 const text=explain({sport:'NFL',state:'upcoming',teams:[team('San Francisco','SF','0'),team('Arizona','ARI','0')],line:{spread:'SF -10'},factors:[]});
 assert.match(text,/San Francisco is favored by 10 points/);assert.match(text,/possibility/);assert.doesNotMatch(text,/will win|rival|injur|capped|adjustment/);
});
test('only verified occasion fields can add an overseas season opener',()=>{
 const g=evaluate(active,frame());g.state='upcoming';const text=explain(g);assert.match(text,/open their seasons in Rome/);assert.match(text,/Eternal City Tip-Off/);assert.doesNotMatch(text,/first.*entire|former.*rival|Big East|historic programs/);
 const ordinary={...g,eventOccasion:null,factors:[]};assert.doesNotMatch(explain(ordinary),/Rome|Eternal|rival/);
});
test('irrelevant tiny factors and raw implementation strings never appear in public copy',()=>{
 const g={sport:'NBA',state:'upcoming',score:45,teams:[team('One','A','0'),team('Two','B','0')],factors:[{label:'Baseline',points:35},{label:'Tiny adjustment',contextType:'performance',contextText:'individual margins capped at 21',points:.03}]};
 assert.doesNotMatch(explain(g),jargon);assert.ok(source.includes('<summary>Scoring details</summary>'));assert.ok(source.includes('String(f.points)'));
});

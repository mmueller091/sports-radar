import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {RESEARCH_LIMITS,canonicalResearchGame,selectResearchGames} from '../alerts-worker/src/research-allocation.js';
const baseline='31f3eb26fbd3c3fc083f7828b2bb93d181fdb888';
const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).trim();
const sha=b=>createHash('sha256').update(b).digest('hex');
const changedWorker=new Set(['alerts-worker/src/ai-budget.js','alerts-worker/src/editorial-context.js','alerts-worker/src/index.js','alerts-worker/src/storylines.js']);
const paths=git(['ls-tree','-r','--name-only',baseline,'scoring','calibration','rating-core.js','alerts-worker/src','notifications.js','game-center.js','styles.css','mobile-readability.css']).split(/\r?\n/).filter(p=>!changedWorker.has(p));
const identities=paths.map(path=>{
 const original=execFileSync('git',['show',`${baseline}:${path}`],{maxBuffer:128e6}),current=fs.readFileSync(path);
 const normalize=b=>/\.(gz|png|woff2?|ttf)$/.test(path)?b:Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
 const a=normalize(original),b=normalize(current);assert.ok(a.equals(b),path);
 return {path,sha256:sha(b),unchanged:true};
});
const current=fs.readFileSync('app.js','utf8'),original=execFileSync('git',['show',`${baseline}:app.js`],{encoding:'utf8',maxBuffer:4e6});
const draft=execFileSync('git',['show','338de5c:app.js'],{encoding:'utf8',maxBuffer:4e6});
// Final editorial changes are confined to the upcoming-only helper. The live
// explanation and every surrounding app function remain byte-equivalent to P1.
const outside=s=>s.replaceAll('\r\n','\n').replace(/function pregameExplanation\([\s\S]*?(?=function trendFor\()/,'');
assert.equal(outside(current),outside(draft));
const linked=s=>s.slice(s.indexOf('function upcomingLinkedStories('),s.indexOf('// Presentation only:')>=0?s.indexOf('// Presentation only:'):s.indexOf('function trendFor(')).replaceAll('\r\n','\n').trim();
assert.equal(linked(current),linked(draft));
const fixture=JSON.parse(fs.readFileSync('test/fixtures/pregame-corpus-20261103.json')),at=Date.parse(fixture.capturedAt);
class AuditDate extends Date {static now(){return at;}}
const runtime=fs.readFileSync('dist/scoring-runtime.js','utf8');
const api=source=>vm.runInNewContext(runtime+'\n'+source.slice(source.indexOf('function explainRating('),source.indexOf('function trendFor('))+';({explainRating})',{Date:AuditDate,Intl,URL});
const before=api(original),after=api(current);
let liveCompleted=[];
const capture=process.argv[2];
if(capture){const feed=JSON.parse(fs.readFileSync(capture));liveCompleted=feed.games.filter(g=>g.state!=='upcoming').map(g=>{assert.equal(after.explainRating(g),before.explainRating(g));return {sport:g.sport,id:g.id,state:g.state};});}
for(const {game} of fixture.games){const input=JSON.stringify(game);after.explainRating(game);assert.equal(JSON.stringify(game),input);}
const selected=selectResearchGames(fixture.games.map(r=>canonicalResearchGame(r.game,at)).filter(Boolean),{},at);
assert.equal(selected.length,30);assert.deepEqual(selected.slice(0,6).map(g=>g.score),[82,81,80,79,76,73]);
assert.deepEqual(RESEARCH_LIMITS,{days:7,games:30,articles:60,perGame:4,editorialItems:8,providerRequests:6,aiRequests:3});
assert.equal(spawnSync('git',['merge-base','--is-ancestor','pregame/phase2-facts','HEAD']).status,1);
for(const path of ['experimental/pregame-facts.mjs','test/pregame-facts-prototype.test.js','scripts/evaluate-pregame-facts.mjs'])assert.equal(fs.existsSync(path),false,path);
const result={baseline,candidateSource:git(['rev-parse','HEAD']),unchangedFiles:identities.length,identities,liveCompleted,
 upcomingInputsUnchanged:fixture.games.length,storyFormattingAndLinkSafeguardsUnchanged:true,
 phase2:{commit:git(['rev-parse','pregame/phase2-facts']),ancestor:false,prototypeFilesAbsent:true},
 research:{limits:RESEARCH_LIMITS,selected:selected.map(g=>({id:g.eventId,sport:g.sport,score:g.score}))}};
fs.writeFileSync('audit/pregame-integration-20261103/parity.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({unchangedFiles:paths.length,liveCompleted:liveCompleted.length,upcoming:fixture.games.length,phase2Integrated:false,selected:selected.length}));

import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const baseline='31f3eb26fbd3c3fc083f7828b2bb93d181fdb888';
const output='audit/pregame-upgrade-20261103';
fs.mkdirSync(output,{recursive:true});
const fixturePath='test/fixtures/pregame-corpus-20261103.json';
const runtime=fs.readFileSync('dist/scoring-runtime.js','utf8');
const source=fs.readFileSync('app.js','utf8');
const old=execFileSync('git',['show',baseline+':app.js'],{encoding:'utf8',maxBuffer:4e6});
function api(code,at) {
  class AuditDate extends Date {static now(){return Date.parse(at);}}
  return vm.runInNewContext(runtime+'\n'+code.slice(code.indexOf('function explainRating('),code.indexOf('function trendFor('))+';({explainRating,upcomingLinkedStories,publicStorySentence})',{Date:AuditDate,URL,Intl});
}
if(process.argv.includes('--capture')) {
  const feed=JSON.parse(fs.readFileSync('work/pregame/feed.json'));
  const before=api(old,feed.updatedAt);
  const fields=['id','sport','division','state','startTime','teams','score','baseScore','openingScore','rawPregameScore','factors','line','eventOccasion','qualitativeContexts','verifiedDevelopments','editorialStorylines','suppressedContextTypes','pregameBaseline'];
  const rows=feed.games.filter(g=>g.state==='upcoming').map(g=>{
    const game=Object.fromEntries(fields.filter(k=>g[k]!==undefined).map(k=>[k,g[k]]));
    if(game.pregameBaseline)game.pregameBaseline={spread:game.pregameBaseline.spread,source:game.pregameBaseline.source,score:game.pregameBaseline.score};
    return {game,before:before.explainRating(g)};
  });
  fs.writeFileSync(fixturePath,JSON.stringify({capturedAt:feed.updatedAt,source:'https://sports-radar-alerts.mmueller918.workers.dev/feed',baseline,modelVersion:feed.modelVersion,games:rows},null,2)+'\n');
}
const fixture=JSON.parse(fs.readFileSync(fixturePath)),after=api(source,fixture.capturedAt);
const rows=fixture.games.map(({game,before})=>{
  const original=JSON.stringify(game),text=after.explainRating(game);
  assert.equal(JSON.stringify(game),original);
  return {id:game.id,sport:game.sport,division:game.division,rating:game.score,start:game.startTime,matchup:game.teams.map(t=>t[0]).join(' – '),before,after:text};
});
const patterns={recordGap:/gap between their records makes a close contest less certain/i,losingRecordFiller:/limits (?:the|this) (?:matchup[’']s )?appeal/i,missingMarket:/no betting line|without a listed betting line|a betting line are not available/i,hypotheticalComparison:/below (?:a meeting|the strongest)|rather than a long track record/i};
const counts=key=>Object.fromEntries(Object.entries(patterns).map(([name,re])=>[name,rows.filter(r=>re.test(r[key])).length]));
const divisionRows=fixture.games.filter(({game})=>['NHL','NBA'].includes(game.sport)&&game.factors.some(f=>/Division matchup$/.test(f.label)));
const immutable=execFileSync('git',['ls-files','scoring','rating-core.js','alerts-worker/src','calibration/output'],{encoding:'utf8'}).trim().split(/\r?\n/).map(path=>{
  const original=execFileSync('git',['show',baseline+':'+path],{maxBuffer:100e6}),actual=fs.readFileSync(path);
  // Git normalizes source text to LF on Windows; binary outputs compare exactly.
  const normalized=path.endsWith('.gz')?actual:Buffer.from(actual.toString('utf8').replaceAll('\r\n','\n'));
  const originalNormalized=path.endsWith('.gz')?original:Buffer.from(original.toString('utf8').replaceAll('\r\n','\n'));
  return {path,unchanged:originalNormalized.equals(normalized),sha256:createHash('sha256').update(normalized).digest('hex')};
});
let liveChecks=[];
if(fs.existsSync('work/pregame/feed.json')) {
  const feed=JSON.parse(fs.readFileSync('work/pregame/feed.json')),before=api(old,feed.updatedAt);
  liveChecks=feed.games.filter(g=>g.state!=='upcoming').map(g=>{assert.equal(after.explainRating(g),before.explainRating(g));return {sport:g.sport,id:g.id,state:g.state};});
}
const report={capturedAt:fixture.capturedAt,baseline,modelVersion:fixture.modelVersion,count:rows.length,bySport:Object.fromEntries([...new Set(rows.map(r=>r.sport))].map(s=>[s,rows.filter(r=>r.sport===s).length])),before:counts('before'),after:counts('after'),divisionCoverage:{eligible:divisionRows.length,described:divisionRows.filter(({game})=>/Division/.test(after.explainRating(game))).length},liveChecks,immutable,rows};
fs.writeFileSync(output+'/narrative-corpus.json',JSON.stringify(report,null,2)+'\n');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
fs.writeFileSync(output+'/narrative-corpus.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SlateMeter pregame corpus</title><style>body{font:16px/1.6 system-ui;background:#101820;color:#e8eff4;margin:0}main{max-width:1150px;margin:auto;padding:24px}article{padding:24px;border:1px solid #344650;margin:24px 0;border-radius:12px}.cols{display:grid;grid-template-columns:1fr 1fr;gap:32px}small{color:#9eb6c6}b{color:#70dfdd}@media(max-width:650px){.cols{display:block}article{padding:16px}}</style><main><h1>Pregame outlook: ${rows.length} production games</h1><p>Captured ${esc(fixture.capturedAt)}. Exact generator output; all ratings and inputs unchanged.</p>${rows.sort((a,b)=>b.rating-a.rating).map(r=>`<article id="game-${r.id}"><small>${r.sport} · ${r.start} · ${r.id}</small><h2>${esc(r.matchup)} · ${r.rating}</h2><div class="cols"><div><b>Before</b><p>${esc(r.before)}</p></div><div><b>After</b><p>${esc(r.after)}</p></div></div></article>`).join('')}</main></html>`);
console.log(JSON.stringify({...report,immutable:{files:immutable.length,changed:immutable.filter(x=>!x.unchanged).map(x=>x.path)},liveChecks:liveChecks.length,rows:undefined},null,2));

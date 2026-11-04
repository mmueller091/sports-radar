// Reproduce the public Saturday baseline with fixed inputs, then apply only the
// reviewed context correction. No live queries, private data or score overrides.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import http from 'node:http';
import path from 'node:path';
import {fixture,now,gameFor,summary} from '../test/helpers/cfb-verified-context.mjs';
import runtime from '../scoring/live-runtime.cjs';
import {cfbArticleRelevant} from '../alerts-worker/src/editorial-context.js';
const ids=['401856849','401856741','401858291','401856745','401862823','401858514','401856740','401856743'];
const app=fs.readFileSync('app.js','utf8');class FixedDate extends Date{static now(){return now;}}
const api=vm.runInNewContext(app.slice(app.indexOf('function explainRating('),app.indexOf('function trendFor('))+';({explainRating,upcomingLinkedStories,publicStorySentence})',{Date:FixedDate,Intl,SportsRadarScore:runtime});
const games=fixture.games.map(row=>{
  const before=gameFor(row,{reviewed:false}),after=gameFor(row);
  assert.equal(before.score,row.before,row.id);assert.deepEqual(before.factors,row.beforeFactors,row.id);
  const existing=(row.editorial||[]).filter(s=>cfbArticleRelevant({headline:s.sourceTitle,description:s.sourceDescription},after));
  if(!after.editorialStorylines?.length&&existing.length)after.editorialStorylines=existing;
  return {row,before,after};
});
const records=games.map(({before,after})=>({id:after.id,game:after.teams.map(t=>t[7]||t[0]).join(' at '),
  before:before.score,after:after.score,delta:after.score-before.score,originalFactors:before.factors,proposedFactors:after.factors,
  explanation:api.explainRating(after),linkedContext:api.upcomingLinkedStories(after).map(s=>({text:api.publicStorySentence(s),url:s.sourceUrl,type:s.type,evidence:s.evidence}))}));
const report={capturedAt:fixture.capturedAt,source:fixture.source,baselineModel:fixture.modelVersion,candidateModel:runtime.MODEL_VERSION,
  slateSize:records.length,changed:records.filter(r=>r.delta).map(r=>r.id),targets:ids.map(id=>records.find(r=>r.id===id)),
  beforeTopTen:[...records].sort((a,b)=>b.before-a.before).slice(0,10).map(r=>({id:r.id,game:r.game,score:r.before})),
  afterTopTen:[...records].sort((a,b)=>b.after-a.after).slice(0,10).map(r=>({id:r.id,game:r.game,score:r.after})),slate:records};
fs.mkdirSync('audit/cfb-context-20261104',{recursive:true});
fs.writeFileSync('audit/cfb-context-20261104/scoring-comparison.json',JSON.stringify(report,null,2)+'\n');
console.table(report.targets.map(({game,before,after,delta})=>({game,before,after,delta})));
console.log(`Saturday: ${records.length} games; ${report.changed.length} changed; ${records.length-report.changed.length} unchanged.`);
if(process.argv.includes('--serve')){
  // Local fixture preview only; production source and configuration are untouched.
  const feed={modelVersion:runtime.MODEL_VERSION,updatedAt:new Date().toISOString(),sourceErrors:[],games:games.map(({after})=>after)};
  http.createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1:8798'),json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
    if(url.pathname==='/api/feed')return json({...feed,updatedAt:new Date().toISOString()});
    if(url.pathname.startsWith('/api/game/')){const game=feed.games.find(g=>g.id===url.pathname.split('/').at(-1));return json(game?{...summary(game),sportsRadarGame:game}:{});}
    if(url.pathname.startsWith('/api/'))return json({configured:false,enabled:false,contexts:[]});
    if(url.pathname==='/alert-config.js'){res.setHeader('Content-Type','text/javascript');return res.end("globalThis.SPORTS_RADAR_ALERTS_URL='http://127.0.0.1:8798/api';");}
    if(url.pathname==='/sw.js'){res.writeHead(404).end();return;}
    const target=path.resolve('dist','.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
    if(!target.startsWith(path.resolve('dist')+path.sep)){res.writeHead(403).end();return;}
    try {res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(target)]||'application/octet-stream');res.end(fs.readFileSync(target));}catch{res.writeHead(404).end();}
  }).listen(8798,'127.0.0.1',()=>console.log('CFB fixture preview: http://127.0.0.1:8798/#game/CFB/401856849'));
}

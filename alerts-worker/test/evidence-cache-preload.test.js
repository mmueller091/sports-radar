import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {buildEvidenceCachePreload} from '../scripts/evidence-cache-preload.mjs';
import {OPEN_NEWS_KEY} from '../src/open-news-discovery.js';
import {SOURCE_LIMITS} from '../src/source-evidence.js';

const at=Date.parse('2026-11-04T22:29:50.021Z');
const document={version:1,url:'https://www.baltimoreravens.com/news/transcript-press-conferences-11-3-26',
  title:'Transcript: Press Conferences (11/3/26)',body:"HEAD COACH JESSE MINTER\nWe'll be starting Joe [Fagnano] at quarterback this week on Thursday.",
  published:at-86400000,retrievedAt:at,authors:['Baltimore Ravens'],section:'Transcripts',links:[]};
const options={key:OPEN_NEWS_KEY,documents:[document],updatedAt:at};
const sql=()=>buildEvidenceCachePreload(options);
function database(t,target){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const unrelated=[['unrelated','{"history":[1],"documents":[{"keep":true}]}',123],
    [OPEN_NEWS_KEY+'-other','not even JSON',456],['other-evidence-key','[1,2,3]',789]];
  for(const row of unrelated)db.prepare('INSERT INTO sports_resources(key,payload,updated_at) VALUES (?,?,?)').run(...row);
  db.prepare(`INSERT INTO game_context(event_id,sport,factor_type,context_text,confidence,source_title,source_url,source_published,expires_at,updated_at)
    VALUES ('keep','NFL','rivalry','existing fact',.9,'Existing source','https://example.test',1,9999999999,2)`).run();
  if(target!==undefined)db.prepare('INSERT INTO sports_resources(key,payload,updated_at) VALUES (?,?,?)').run(OPEN_NEWS_KEY,target,42);
  const snapshot=()=>({resources:db.prepare('SELECT * FROM sports_resources ORDER BY key').all(),contexts:db.prepare('SELECT * FROM game_context').all()});
  const before=snapshot();
  const unchanged=()=>{
    assert.deepEqual(snapshot().resources.filter(r=>r.key!==OPEN_NEWS_KEY),before.resources.filter(r=>r.key!==OPEN_NEWS_KEY));
    assert.deepEqual(snapshot().contexts,before.contexts);
  };
  return {db,before,snapshot,unchanged,row:()=>db.prepare('SELECT * FROM sports_resources WHERE key=?').get(OPEN_NEWS_KEY)};
}

test('missing cache inserts only the intended record and independent readback matches the document',t=>{
  const f=database(t);f.db.exec(sql());
  assert.equal(f.db.prepare('SELECT changes() AS n').get().n,1);
  assert.equal(f.row().key,OPEN_NEWS_KEY);assert.equal(f.row().updated_at,at);
  assert.deepEqual(JSON.parse(f.row().payload),{documents:[document]});f.unchanged();
});

for(const target of [{},{history:[{pairKey:'CFB:1:2'}],lastVerified:{other:1},failureUntil:7},
  {documents:[],history:[{evidence:'preserve'}],nested:{array:[true,null,0],text:'untouched'},lastResearched:{game:42}}])
test('valid existing cache preserves every field while adding documents: '+JSON.stringify(target),t=>{
  const f=database(t,JSON.stringify(target));f.db.exec(sql());
  const value=JSON.parse(f.row().payload),{documents,...remaining}=value,{documents:oldDocuments,...prior}=target;
  assert.deepEqual(remaining,prior);assert.deepEqual(documents,[document]);assert.equal(f.row().updated_at,at);f.unchanged();
});

for(const target of ['not JSON','{"history":','', '{documents:[]}'])
test('malformed existing JSON aborts atomically and preserves all original bytes: '+JSON.stringify(target),t=>{
  const f=database(t,target);assert.throws(()=>f.db.exec(sql()),/malformed JSON/);
  assert.deepEqual(f.snapshot(),f.before);assert.equal(f.row().payload,target);
});

for(const target of ['null','[]','[{}]','1','true','"cache"',
  '{"documents":null,"history":[1]}','{"documents":{},"history":[1]}','{"documents":"wrong type"}',
  '{"documents":[],"documents":[{"conflict":true}]}','{"history":{"same":1,"same":2},"documents":[]}'])
test('unexpected or ambiguous existing structure fails without mutation: '+target,t=>{
  const f=database(t,target);assert.throws(()=>f.db.exec(sql()),/malformed JSON/);assert.deepEqual(f.snapshot(),f.before);
});

for(const documents of [[{...document,body:'A changed official statement'}],[{...document,url:'https://www.nfl.com/news/unrelated'}],[document,{...document,url:document.url+'-second'}]])
test('conflicting nonempty evidence remains untouched: '+documents.map(d=>d.url).join(','),t=>{
  const f=database(t,JSON.stringify({documents,history:['keep']}));assert.throws(()=>f.db.exec(sql()),/malformed JSON/);
  assert.deepEqual(f.snapshot(),f.before);
});

test('SQL generated before a conflicting concurrent update still refuses to overwrite it',t=>{
  const prepared=sql(),f=database(t,'{"history":["existing"]}');
  f.db.prepare('UPDATE sports_resources SET payload=?,updated_at=? WHERE key=?').run('{"documents":[{"newer":true}],"history":["changed"]}',99,OPEN_NEWS_KEY);
  const before=f.snapshot();assert.throws(()=>f.db.exec(prepared),/malformed JSON/);assert.deepEqual(f.snapshot(),before);
});

test('a concurrent metadata-only update keeps its newer timestamp and every field',t=>{
  const prepared=sql(),f=database(t,'{"history":["old"]}'),newer=at+3600000;
  const current={history:['newer metadata'],documents:[],lastResearched:{keep:77}};
  f.db.prepare('UPDATE sports_resources SET payload=?,updated_at=? WHERE key=?').run(JSON.stringify(current),newer,OPEN_NEWS_KEY);
  f.db.exec(prepared);
  assert.deepEqual(JSON.parse(f.row().payload),{...current,documents:[document]});
  assert.equal(f.row().updated_at,newer,'preload cannot age preserved data into the resource cleanup window');f.unchanged();
});

test('exact repeated execution is a zero-write no-op preserving payload and timestamp',t=>{
  const f=database(t);f.db.exec(sql());const once=f.snapshot();
  f.db.exec(buildEvidenceCachePreload({...options,updatedAt:at+1000}));
  assert.equal(f.db.prepare('SELECT changes() AS n').get().n,0);assert.deepEqual(f.snapshot(),once);f.unchanged();
});

test('matching evidence in an existing metadata-rich cache is left byte-for-byte intact',t=>{
  const target=JSON.stringify({history:['preserve'],documents:[document],lastVerified:{NFL:23}},null,2),f=database(t,target);
  f.db.exec(sql());assert.equal(f.db.prepare('SELECT changes() AS n').get().n,0);assert.deepEqual(f.snapshot(),f.before);
});

test('unexpected record and table identifiers cannot generate SQL',()=>{
  for(const key of [undefined,null,'','other','open-news-evidence:v2',OPEN_NEWS_KEY+' ',"' OR 1=1; --"])
    assert.throws(()=>buildEvidenceCachePreload({...options,key}),/unexpected identifiers/);
  for(const extra of [{table:'game_context'},{database:'other'},{recordId:'other'},{keyColumn:'event_id'}])
    assert.throws(()=>buildEvidenceCachePreload({...options,...extra}),/unexpected identifiers/);
});

test('invalid, empty, duplicate and oversized incoming evidence is rejected before preparing SQL',()=>{
  for(const documents of [[],null,{},[document,document],[{...document,body:''}],[{...document,url:'http://example.test'}],
    [{...document,url:'https://user:password@example.test'}],[{...document,retrievedAt:at+1}],
    [{...document,body:'x'.repeat(SOURCE_LIMITS.body+1)}]])
    assert.throws(()=>buildEvidenceCachePreload({...options,documents}));
  for(const updatedAt of [null,0,-1,NaN,Infinity,1.5])assert.throws(()=>buildEvidenceCachePreload({...options,updatedAt}));
});

test('SQL metacharacters inside source text remain data and cannot affect unrelated records',t=>{
  const f=database(t),source={...document,body:"Quote '); DELETE FROM sports_resources; -- is source text."};
  f.db.exec(buildEvidenceCachePreload({...options,documents:[source]}));
  assert.equal(JSON.parse(f.row().payload).documents[0].body,source.body);f.unchanged();
});

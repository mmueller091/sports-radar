import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {cfbConferenceMetadata,normalizeCfbConferences,cfbSeason,CFB_METADATA_TTL} from '../src/cfb-metadata.js';

const group=(id,name,ids,children)=>({id,name,isConference:true,standings:{season:2026,entries:ids.map(id=>({team:{id,displayName:'Same name'}}))},children});
const sources=()=>[
  {id:'80',season:{year:2026},children:[group('8','SEC',['251','61']),group('18','FBS Independents',['87']),group('37','Sun Belt',[],[group('100','East',['326'])])]},
  {id:'81',season:{year:2026},children:[group('20','Big Sky',['149']),group('32','FCS Independents',['2110'])]}
];
function database(t) {
  const db=new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  t.after(()=>db.close());
  return {db,DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},
    async first(){return db.prepare(sql).get(...args);},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};}}};
}
test('stable IDs, both subdivisions, independent groups and nested divisions normalize without names',()=>{
  const result=normalizeCfbConferences(sources(),2026);
  assert.equal(result.teams['251'].conferenceId,'8');
  assert.equal(result.teams['87'].conferenceId,'18');
  assert.equal(result.teams['326'].conferenceId,'37');
  assert.deepEqual(result.teams['149'],{conferenceId:'20',division:'FCS'});
  assert.equal(result.conferences.length,5);
  assert.equal(result.teams['unknown'],undefined);
});
test('realignment follows the requested season; reject mismatched seasons, conflicting and incomplete sources',()=>{
  const before=sources(),after=sources();
  after[0].children[0].standings.entries=after[0].children[0].standings.entries.filter(e=>e.team.id!=='61');
  after[0].children[1].standings.entries.push({team:{id:'61'}});
  assert.equal(normalizeCfbConferences(before,2026).teams['61'].conferenceId,'8');
  assert.equal(normalizeCfbConferences(after,2026).teams['61'].conferenceId,'18');
  assert.throws(()=>normalizeCfbConferences(before,2025),/season/);
  after[0].children[0].standings.entries.push({team:{id:'61'}});
  assert.throws(()=>normalizeCfbConferences(after,2026),/Conflicting/);
  assert.throws(()=>normalizeCfbConferences([before[0],{}],2026),/unavailable/);
  const mixed=sources();mixed[0].children[0].standings.season=2025;
  assert.throws(()=>normalizeCfbConferences(mixed,2026),/Mixed/);
});
test('January games use prior football season and February begins the new season',()=>{
  assert.equal(cfbSeason(Date.parse('2027-01-20')),2026);
  assert.equal(cfbSeason(Date.parse('2027-02-01')),2027);
});
test('two bulk requests per daily refresh; compact shared cache, no per-team or per-game requests',async t=>{
  const env=database(t),now=Date.parse('2026-10-31');let calls=[];
  const fetcher=async url=>{calls.push(url);return Response.json(sources()[url.includes('group=80')?0:1]);};
  const first=await cfbConferenceMetadata(env,2026,now,fetcher);
  assert.equal(calls.length,2);assert.ok(calls.every(u=>u.includes('season=2026') && u.includes('/standings?')));
  assert.deepEqual(await cfbConferenceMetadata(env,2026,now+1000,fetcher),first);
  assert.equal(calls.length,2);
  assert.ok(env.db.prepare('SELECT length(payload) AS size FROM sports_resources').get().size<2000);
  await cfbConferenceMetadata(env,2026,now+CFB_METADATA_TTL,fetcher);
  assert.equal(calls.length,4);
});
test('failure uses bounded same-season stale data with retry backoff and rejects expired or absent metadata',async t=>{
  const env=database(t),now=Date.parse('2026-10-31');let calls=0;
  await cfbConferenceMetadata(env,2026,now,async url=>Response.json(sources()[url.includes('group=80')?0:1]));
  const fail=async()=>{calls++;throw Error('offline');};
  assert.equal((await cfbConferenceMetadata(env,2026,now+CFB_METADATA_TTL,fail)).stale,true);
  const count=calls;
  await cfbConferenceMetadata(env,2026,now+CFB_METADATA_TTL+1000,fail);
  assert.equal(calls,count);
  await assert.rejects(cfbConferenceMetadata(env,2025,now+CFB_METADATA_TTL,fail));
  await assert.rejects(cfbConferenceMetadata(env,2026,now+8*CFB_METADATA_TTL,fail));
});
test('parallel cold callers share a global lease',async t=>{
  const env=database(t),now=Date.parse('2026-10-31');let calls=0;
  const results=await Promise.allSettled(Array.from({length:5},()=>cfbConferenceMetadata(env,2026,now,async url=>{calls++;return Response.json(sources()[url.includes('group=80')?0:1]);})));
  assert.equal(calls,2);assert.ok(results.some(r=>r.status==='fulfilled'));
});

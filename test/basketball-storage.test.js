import test from 'node:test';import assert from 'node:assert/strict';
import {publishFeed} from '../alerts-worker/src/sports-feed.js';
test('a busy basketball slate partitions current evidence below the D1 row limit',async()=>{
 const written=[],env={DB:{prepare:sql=>({bind:(...args)=>({sql,args,run:async()=>({meta:{changes:1}})})}),batch:async statements=>{written.push(...statements);return [];}}};
 const games=Array.from({length:8},(_,id)=>({id,sport:'NCAAB',basketballEvidence:{plays:'é'.repeat(160000)}}));
 const feed=await publishFeed(env,{updatedAt:'2026-11-01T17:00:00Z',games},'owner',()=>Date.now());
 const rows=written.filter(s=>s.sql.includes('sports_feed_parts'));
 assert.equal(rows.length,3);assert.equal(feed.parts,3);
 assert.ok(rows.every(s=>new TextEncoder().encode(s.args[2]).length<=1000000));
 assert.deepEqual(rows.flatMap(s=>JSON.parse(s.args[2])).map(g=>g.id),games.map(g=>g.id));
});

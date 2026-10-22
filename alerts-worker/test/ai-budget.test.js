import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {reserveResearchAi} from '../src/ai-budget.js';

test('AI reservations enforce a daily allowance and reset only at UTC midnight',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE research_ai_budget (day TEXT PRIMARY KEY,reserved_neurons INTEGER NOT NULL)');
  const env={DB:{prepare(sql){return {bind(...args){this.args=args;return this;},async run(){return {meta:{changes:db.prepare(sql).run(...this.args).changes}};}};}}};
  const messages=[{role:'user',content:'A'.repeat(23000)}];
  const now=Date.parse('2026-10-22T23:59:59Z');
  const reservations=await Promise.all(Array.from({length:30},()=>reserveResearchAi(env,messages,now)));
  assert.ok(reservations.some(Boolean));
  assert.ok(reservations.some(value=>!value));
  assert.ok(db.prepare('SELECT reserved_neurons AS n FROM research_ai_budget').get().n<=8000);
  assert.equal(await reserveResearchAi(env,messages,now),false);
  assert.equal(await reserveResearchAi(env,messages,now+1000),true);
  assert.equal(db.prepare('SELECT count(*) AS n FROM research_ai_budget').get().n,2);
  db.close();
});

test('AI fails closed on oversized input, missing database, or quota storage failure',async()=>{
  const failing={DB:{prepare(){throw new Error('Unavailable');}}};
  assert.equal(await reserveResearchAi(failing,[{role:'user',content:'A'.repeat(24000)}]),false);
  assert.equal(await reserveResearchAi({},[{role:'user',content:'hello'}]),false);
  assert.equal(await reserveResearchAi(failing,[{role:'user',content:'hello'}]),false);
});

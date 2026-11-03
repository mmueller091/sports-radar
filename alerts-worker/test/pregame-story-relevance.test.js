import test from 'node:test';
import assert from 'node:assert/strict';
import {deterministicFactor,pregameStoryEligible} from '../src/storylines.js';

const now=Date.now();
const row=(factor_type,source_title,overrides={})=>({
  factor_type,source_title,source_url:'https://www.espn.com/story',
  source_published:Math.floor(now/1000),...overrides
});

test('generic previous-game recaps never qualify as pregame context',()=>{
  const recap='Detroit beats Florida 4-2 in its previous game';
  assert.equal(deterministicFactor({headline:recap,description:''}),null);
  assert.equal(pregameStoryEligible(row('notable_recent_performance',recap),{},now),false);
  assert.equal(pregameStoryEligible(row('notable_recent_performance','Hat trick powers Detroit past Florida'),{},now),false);
});

test('current, meaningful matchup stories keep their linked context',()=>{
  assert.equal(pregameStoryEligible(row('coach_return','Coach returns to former team'),{},now),true);
  assert.equal(pregameStoryEligible(row('team_win_streak','Detroit won 6 straight'),{},now),true);
  assert.equal(pregameStoryEligible(row('team_win_streak','Detroit looks to extend winning streak'),{},now),false);
});

test('stale, future, unlinked and mismatched story types are removed',()=>{
  const valid=row('playoff_rematch','Playoff rematch');
  assert.equal(pregameStoryEligible({...valid,source_url:''},{},now),false);
  assert.equal(pregameStoryEligible({...valid,source_published:Math.floor((now-8*86400000)/1000)},{},now),false);
  assert.equal(pregameStoryEligible({...valid,source_published:Math.floor((now+3600000)/1000)},{},now),false);
  assert.equal(pregameStoryEligible({...valid,factor_type:'milestone_chase'},{},now),false);
});

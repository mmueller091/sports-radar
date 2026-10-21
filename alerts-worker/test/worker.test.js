import test from 'node:test';
import assert from 'node:assert/strict';
import {gameFromEvent,validSubscription} from '../src/index.js';

test('large live underdog receives the same explicit upset boost as the site',() => {
  const event = {id:'123',name:'Bengals at Ravens',competitions:[{status:{type:{state:'in'},period:4,displayClock:'03:00'},competitors:[
    {homeAway:'home',team:{id:'1',displayName:'Baltimore Ravens',abbreviation:'BAL'},score:'24',records:[{summary:'4-2'}]},
    {homeAway:'away',team:{id:'2',displayName:'Cincinnati Bengals',abbreviation:'CIN'},score:'27',records:[{summary:'3-3'}]}
  ],odds:[{pointSpread:{home:{close:{line:'-10'}},away:{close:{line:'+10'}}}}]}]};
  const result = gameFromEvent('NFL','football/nfl/scoreboard',event);
  assert.ok(result);
  assert.match(result.rating.upsetText,/Cincinnati Bengals.*10-point underdog.*leads/);
  assert.ok(result.rating.upsetPoints >= 15);
});

test('pregame games are never queued and push endpoints are restricted',() => {
  const event = {id:'124',competitions:[{status:{type:{state:'pre'}},competitors:[{},{}]}]};
  assert.equal(gameFromEvent('NFL','football/nfl/scoreboard',event),null);
  assert.equal(validSubscription({endpoint:'https://example.com/push',keys:{p256dh:'abc',auth:'def'}}),false);
  assert.equal(validSubscription({endpoint:'https://web.push.apple.com/QWE',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}}),true);
});

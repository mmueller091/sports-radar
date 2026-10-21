import test from 'node:test';
import assert from 'node:assert/strict';
import {gameFromEvent,validSubscription} from '../src/index.js';
import {articleMatchesGame,contextsForGames,deterministicFactor,evidenceSupportsType,researchGame} from '../src/storylines.js';

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

function pregameEvent(id,teams,hours=2) {
  return {
    id,
    date:new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
    name:teams.map(team => team.team.displayName).join(' at '),
    competitions:[{
      status:{type:{state:'pre'}},
      competitors:teams
    }]
  };
}

test('research gate includes ranked college games but skips ordinary unranked games',() => {
  const ranked = pregameEvent('ranked',[
    {team:{id:'1',displayName:'Ranked State',abbreviation:'RKS'},curatedRank:{current:12},records:[{summary:'6-1'}]},
    {team:{id:'2',displayName:'Other University',abbreviation:'OTH'},records:[{summary:'5-2'}]}
  ]);
  const ordinary = pregameEvent('ordinary',[
    {team:{id:'3',displayName:'Cal Poly',abbreviation:'CP'},records:[{summary:'2-4'}]},
    {team:{id:'4',displayName:'Local College',abbreviation:'LC'},records:[{summary:'3-3'}]}
  ]);
  assert.ok(researchGame('CFB',ranked));
  assert.equal(researchGame('NCAAB',ordinary),null);
});

test('source-tagged return story matches the game and creates a conservative factor',() => {
  const game = {
    eventId:'401',
    teamIds:new Set(['14','26'])
  };
  const article = {
    headline:'Brady Tkachuk prepares for return to Ottawa',
    description:'Tkachuk was traded from Ottawa to Florida and faces his former team.',
    published:Date.now(),
    eventIds:new Set(),
    teamIds:new Set(['14','26'])
  };
  assert.equal(articleMatchesGame(article,game),true);
  assert.equal(deterministicFactor(article)?.type,'former_star_return');
});

test('AI labels require explicit source evidence for the exact storyline type',() => {
  const genericPreview = {
    headline:'Jets take losing streak into game against the Stars',
    description:'Winnipeg visits Dallas in a Central Division matchup.'
  };
  const priorHatTrick = {
    headline:"Mikko Rantanen's overtime hat trick gives the Stars a win",
    description:"Rantanen scored three goals in the previous game and snapped the opponent's winning streak."
  };
  assert.equal(evidenceSupportsType(genericPreview,'star_absence'),false);
  assert.equal(evidenceSupportsType(priorHatTrick,'star_hot_streak'),false);
  assert.equal(evidenceSupportsType(priorHatTrick,'notable_recent_performance'),true);
});

test('context lookup batches a full 100-game request within D1 parameter limits',async () => {
  const calls = [];
  const env = {
    DB:{
      prepare() {
        return {
          bind(...params) {
            calls.push(params);
            return {
              async all() {
                return {
                  results:params.includes('401892551') ? [{
                    event_id:'401892551',
                    sport:'NHL',
                    factor_type:'former_star_return',
                    context_text:'A former star returns to face his old team.',
                    confidence:.78,
                    source_title:'Return preview',
                    source_url:'https://www.espn.com/story',
                    source_published:Math.floor(Date.now() / 1000)
                  }] : []
                };
              }
            };
          }
        };
      }
    }
  };
  const keys = ['NHL:401892551',...Array.from({length:99},(_,index) => `NBA:game-${index}`)];
  const result = await contextsForGames(env,keys);
  assert.equal(calls.length,2);
  assert.ok(calls.every(params => params.length <= 91));
  assert.equal(result['NHL:401892551'][0].type,'former_star_return');
});

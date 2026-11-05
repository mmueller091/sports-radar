import test from 'node:test';
import assert from 'node:assert/strict';
import teams from '../teams.json' with {type:'json'};
import registry from '../social/hashtags.json' with {type:'json'};
import {parseBlinkfire,verifyFromXHtml} from '../scripts/hashtag-parsers.mjs';
import {teamHashtag,gameHashtags,draftExcitementPost} from '../social/hashtag-registry.mjs';

const byName=(sport,name)=>teams[sport].find(t=>t.name===name).id;

test('all 94 professional teams have stable ESPN ID entries',()=>{
  for(const sport of ['NFL','NBA','NHL']){
    assert.equal(Object.keys(registry.teams[sport]).length,teams[sport].length);
    for(const team of teams[sport])assert.equal(registry.teams[sport][team.id]?.name,team.name);
  }
});

test('college discovery entries align to canonical ESPN team IDs',()=>{
  for(const sport of ['CFB','NCAAB']){
    for(const [id,entry] of Object.entries(registry.teams[sport])){
      assert.equal(entry.name,teams[sport].find(t=>t.id===id)?.name);
    }
  }
});

test('verified tags have an official X source and no malformed or conflicting IDs',()=>{
  for(const [sport,entries] of Object.entries(registry.teams)){
    for(const [id,entry] of Object.entries(entries)){
      assert.match(id,/^\d+$/);
      assert.equal(new Set(entry.aliases.map(x=>x.toLowerCase())).size,entry.aliases.length);
      for(const hashtag of entry.aliases)assert.match(hashtag,/^#[A-Za-z0-9_]{2,48}$/);
      if(entry.verification.startsWith('official-')){
        assert.ok(entry.account);
        assert.ok(entry.sourceUrls.includes(`https://x.com/${entry.account}`));
        assert.ok(entry.lastVerifiedAt);
      }
    }
  }
});

test('verified professional examples resolve, unverified candidates never post',()=>{
  assert.equal(teamHashtag('NFL',byName('NFL','Baltimore Ravens')).primary,'#RavensFlock');
  assert.equal(teamHashtag('NHL',byName('NHL','Washington Capitals')).primary,'#ALLCAPS');
  assert.equal(teamHashtag('NBA',byName('NBA','Golden State Warriors')).primary,'#DubNation');
  const candidate={teams:{NHL:{'1':{name:'Boston Bruins',primary:'#NHLBruins',verification:'seasonal-report'}}}};
  assert.equal(teamHashtag('NHL','1',{registry:candidate}).primary,null);
  assert.equal(teamHashtag('NHL','1',{registry:candidate}).candidate,'#NHLBruins');
});

test('uses ESPNs tuple field eight for team ID, never abbreviation field one',()=>{
  const game={sport:'NFL',id:'401873024',score:91,teams:[
    ['Baltimore Ravens','BAL','27',null,null,null,null,null,byName('NFL','Baltimore Ravens')],
    ['Philadelphia Eagles','PHI','24',null,null,null,null,null,byName('NFL','Philadelphia Eagles')]]};
  assert.deepEqual(gameHashtags(game),['#RavensFlock','#FlyEaglesFly','#NFL']);
  const draft=draftExcitementPost(game,{reason:'A late fourth-quarter lead change.'});
  assert.ok(draft.eligible);
  assert.ok(draft.text.includes('https://slatemeter.app/#game/NFL/401873024'));
  assert.ok(draft.text.includes('A late fourth-quarter lead change.'));
  assert.equal(draft.missingTeamHashtags.length,0);
});

test('handles missing coverage and de-duplicates hashtags without invention',()=>{
  const blank={teams:{CFB:{}}};
  assert.deepEqual(gameHashtags({sport:'CFB',teams:[{id:12},{id:13}]},{registry:blank}),['#CFB']);
  const duplicate={teams:{NBA:{'1':{primary:'#Hawks',verification:'official-bio'},'2':{primary:'#hawks',verification:'official-post'}}}};
  assert.deepEqual(gameHashtags({sport:'NBA',teams:[{id:1},{id:2}]},{registry:duplicate}),['#hawks','#NBA']);
  assert.deepEqual(gameHashtags({sport:'Soccer',teams:[{id:1},{id:2}]}),[]);
  const unverifiedGame={sport:'NHL',id:'44',score:87,teams:[{id:1,name:'Boston Bruins'},{id:2,name:'Other team'}]};
  const preview=draftExcitementPost(unverifiedGame,{registry:{teams:{NHL:{'1':{primary:'#NHLBruins',verification:'seasonal-report'}}}}});
  assert.deepEqual(preview.unverifiedTeamTags.map(x=>x.candidate),['#NHLBruins',null]);
  assert.ok(!preview.text.includes('#NHLBruins'));
});

test('never makes a malformed or oversized draft',()=>{
  const game={sport:'NBA',id:'401',score:85,teams:[{id:1,name:'Atlanta Hawks'},{id:9,name:'Golden State Warriors'}]};
  const output=draftExcitementPost(game,{reason:'A'.repeat(700)});
  assert.ok(output.text.length<=280);
  assert.throws(()=>draftExcitementPost({...game,id:'../../secrets'}),/Invalid/);
  assert.throws(()=>draftExcitementPost({...game,score:Infinity}),/Invalid/);
});

test('extracts team IDs and candidate hashtags from public directory table',()=>{
  const html='<tr class="bfTable__row"><a class="league-hashtags__team" href="/publisher/team/college_football_football_333/alabama-crimson-tide"><span>Alabama Crimson Tide</span></a><span class="bfChip__text">#RollTide</span><span class="bfChip__text">#RollTide</span></tr>';
  assert.deepEqual(parseBlinkfire(html),[{id:'333',name:'Alabama Crimson Tide',tags:['#RollTide'],teamUrl:'https://www.blinkfire.com/publisher/team/college_football_football_333/alabama-crimson-tide'}]);
});

test('official profile proof requires both matching handle and visible hashtag',()=>{
  const html='<meta property="og:title" content="Baltimore Ravens (@Ravens) / X"><meta name="description" content="The #RavensFlock"><a href="/hashtag/FlyEaglesFly">';
  assert.deepEqual(verifyFromXHtml(html,'Ravens',['#RavensFlock']),{primary:'#RavensFlock',verification:'official-bio'});
  assert.equal(verifyFromXHtml(html,'Eagles',['#RavensFlock']),null);
  assert.equal(verifyFromXHtml(html.replace('(@Ravens)','(@RavensFanHQ)'),'Ravens',['#RavensFlock']),null);
  assert.deepEqual(verifyFromXHtml(html,'Ravens',['#FlyEaglesFly']),{primary:'#FlyEaglesFly',verification:'official-post'});
  assert.equal(verifyFromXHtml(html,'Ravens',['#NotThere']),null);
});

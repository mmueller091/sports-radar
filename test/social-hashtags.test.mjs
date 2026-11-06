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

test('all 32 owner-approved NHL tags resolve and retain alternate tags without duplicate posting',()=>{
  const approved={
    'Anaheim Ducks':'#FlyTogether','Boston Bruins':'#NHLBruins',
    'Buffalo Sabres':'#LetsGoBuffalo','Calgary Flames':'#Flames',
    'Carolina Hurricanes':'#CarolinaCulture','Chicago Blackhawks':'#Blackhawks',
    'Colorado Avalanche':'#GoAvsGo','Columbus Blue Jackets':'#CBJ',
    'Dallas Stars':'#TexasHockey','Detroit Red Wings':'#LGRW',
    'Edmonton Oilers':'#LetsGoOilers','Florida Panthers':'#FlaPanthers',
    'Los Angeles Kings':'#GoKingsGo','Minnesota Wild':'#MNWild',
    'Montreal Canadiens':'#GoHabsGo','Nashville Predators':'#Preds',
    'New Jersey Devils':'#NJDevils','New York Islanders':'#Isles',
    'New York Rangers':'#NYR','Ottawa Senators':'#GoSensGo',
    'Philadelphia Flyers':'#LetsGoFlyers','Pittsburgh Penguins':'#LetsGoPens',
    'San Jose Sharks':'#TurnItAllTeal','Seattle Kraken':'#SeaKraken',
    'St. Louis Blues':'#STLBlues','Tampa Bay Lightning':'#GoBolts',
    'Toronto Maple Leafs':'#Leafs','Utah Mammoth':'#TusksUp',
    'Vancouver Canucks':'#Canucks','Vegas Golden Knights':'#VegasBorn',
    'Washington Capitals':'#ALLCAPS','Winnipeg Jets':'#GoJetsGo'
  };
  assert.equal(Object.keys(approved).length,32);
  for(const [name,tag] of Object.entries(approved)){
    assert.equal(teamHashtag('NHL',byName('NHL',name))?.primary,tag,name);
  }
  assert.ok(registry.teams.NHL[byName('NHL','San Jose Sharks')].aliases.includes('#SJSharks'));
  assert.ok(registry.teams.NHL[byName('NHL','Toronto Maple Leafs')].aliases.includes('#PassionNeverSleeps'));
  assert.ok(registry.teams.NHL[byName('NHL','Winnipeg Jets')].aliases.includes('#NHLJets'));
  const result=gameHashtags({sport:'NHL',teams:[
    {id:byName('NHL','San Jose Sharks')},{id:byName('NHL','Toronto Maple Leafs')}
  ]});
  assert.deepEqual(result,['#TurnItAllTeal','#Leafs','#NHL']);
  assert.equal(registry.teams.NHL[byName('NHL','Utah Mammoth')].account,'UtahMammoth');
});

test('all 30 owner-approved NBA primary hashtags resolve by canonical ESPN ID',()=>{
  const approved={
    'Atlanta Hawks':'#TrueToAtlanta','Brooklyn Nets':'#NetsWorld',
    'Boston Celtics':'#DifferentHere','Charlotte Hornets':'#BuzzCity',
    'Chicago Bulls':'#SeeRed','Cleveland Cavaliers':'#LetEmKnow',
    'Dallas Mavericks':'#MFFL','Denver Nuggets':'#MileHighBasketball',
    'Detroit Pistons':'#DetroitBasketball','Golden State Warriors':'#DubNation',
    'Houston Rockets':'#AllFire','Indiana Pacers':'#Yescers',
    'LA Clippers':'#ClipperNation','Los Angeles Lakers':'#LakeShow',
    'Memphis Grizzlies':'#GrindCity','Miami Heat':'#HeatNation',
    'Milwaukee Bucks':'#FearTheDeer','Minnesota Timberwolves':'#TakeRoot',
    'New Orleans Pelicans':'#Pelicans','New York Knicks':'#NewYorkForever',
    'Oklahoma City Thunder':'#ThunderUp','Orlando Magic':'#MakeItMagic',
    'Philadelphia 76ers':'#ThrowTheBallUp','Phoenix Suns':'#SunsUp',
    'Portland Trail Blazers':'#RipCity','Sacramento Kings':'#LightTheBeam',
    'San Antonio Spurs':'#PorVida','Toronto Raptors':'#WeTheNorth',
    'Utah Jazz':'#TakeNote','Washington Wizards':'#ForTheDistrict'
  };
  assert.equal(Object.keys(approved).length,30);
  for(const [name,tag] of Object.entries(approved)){
    assert.equal(teamHashtag('NBA',byName('NBA',name))?.primary,tag,name);
  }
  assert.deepEqual(gameHashtags({sport:'NBA',teams:[
    {id:byName('NBA','Philadelphia 76ers')},{id:byName('NBA','Boston Celtics')}
  ]}),['#ThrowTheBallUp','#DifferentHere','#NBA']);
});

test('all 32 owner-approved NFL primary hashtags resolve by canonical ESPN ID',()=>{
  const approved={
    'Philadelphia Eagles':'#FlyEaglesFly','Dallas Cowboys':'#DallasCowboys',
    'Washington Commanders':'#RaiseHail','New York Giants':'#BigBlue',
    'San Francisco 49ers':'#FTTB','Seattle Seahawks':'#Seahawks',
    'Arizona Cardinals':'#RiseUpRedSea','Los Angeles Rams':'#RamsHouse',
    'Atlanta Falcons':'#DirtyBirds','Carolina Panthers':'#KeepPounding',
    'New Orleans Saints':'#Saints','Tampa Bay Buccaneers':'#WeAreTheKrewe',
    'Detroit Lions':'#OnePride','Chicago Bears':'#DaBears',
    'Minnesota Vikings':'#Skol','Green Bay Packers':'#GoPackGo',
    'New York Jets':'#JetUp','Miami Dolphins':'#PhinsUp',
    'New England Patriots':'#NEPats','Buffalo Bills':'#BillsMafia',
    'Kansas City Chiefs':'#ChiefsKingdom','Los Angeles Chargers':'#BoltUp',
    'Las Vegas Raiders':'#RaiderNation','Denver Broncos':'#BroncosCountry',
    'Jacksonville Jaguars':'#DUUUVAL','Indianapolis Colts':'#ForTheShoe',
    'Tennessee Titans':'#TitanUp','Houston Texans':'#HTownMade',
    'Cleveland Browns':'#DawgPound','Cincinnati Bengals':'#WhoDey',
    'Pittsburgh Steelers':'#HereWeGo','Baltimore Ravens':'#RavensFlock'
  };
  assert.equal(Object.keys(approved).length,32);
  for(const [name,tag] of Object.entries(approved)){
    assert.equal(teamHashtag('NFL',byName('NFL',name))?.primary,tag,name);
  }
  assert.deepEqual(gameHashtags({sport:'NFL',teams:[
    {id:byName('NFL','Buffalo Bills')},{id:byName('NFL','Miami Dolphins')}
  ]}),['#BillsMafia','#PhinsUp','#NFL']);
});

test('all 16 owner-approved SEC primary hashtags resolve in both football and mens basketball',()=>{
  const approved={
    'Alabama Crimson Tide':'#RollTide','Arkansas Razorbacks':'#WPS',
    'Auburn Tigers':'#WarEagle','Florida Gators':'#GoGators',
    'Georgia Bulldogs':'#GoDawgs','Kentucky Wildcats':'#BBN',
    'LSU Tigers':'#GeauxTigers','Mississippi State Bulldogs':'#HailState',
    'Missouri Tigers':'#MIZ','Oklahoma Sooners':'#BoomerSooner',
    'Ole Miss Rebels':'#HottyToddy','South Carolina Gamecocks':'#Gamecocks',
    'Tennessee Volunteers':'#GBO','Texas Longhorns':'#HookEm',
    'Texas A&M Aggies':'#GigEm','Vanderbilt Commodores':'#AnchorDown'
  };
  assert.equal(Object.keys(approved).length,16);
  for(const sport of ['CFB','NCAAB']){
    for(const [name,tag] of Object.entries(approved)){
      const id=byName(sport,name);
      assert.equal(teamHashtag(sport,id)?.primary,tag,`${sport}: ${name}`);
      assert.equal(registry.teams[sport][id].aliases[0],tag,`${sport}: ${name}`);
    }
    const game={sport,id:'401909726',score:86,teams:[
      {name:'Auburn Tigers',id:byName(sport,'Auburn Tigers')},
      {name:'Alabama Crimson Tide',id:byName(sport,'Alabama Crimson Tide')}]
    };
    const draft=draftExcitementPost(game,{reason:'A close finish.'});
    assert.deepEqual(draft.hashtags,['#WarEagle','#RollTide',sport==='CFB'?'#NCAAFB':'#CBB']);
    assert.deepEqual(draft.missingTeamHashtags,[]);
    assert.ok(!draft.text.includes('#AUAthletics'));
    assert.ok(draft.text.length<=280);
  }
  assert.equal(teamHashtag('NCAAM',byName('NCAAB','Vanderbilt Commodores')).primary,'#AnchorDown');
});

test('all 18 owner-approved Big Ten primary hashtags resolve in football and mens basketball',()=>{
  const approved={
    'Illinois Fighting Illini':'#Illini','Indiana Hoosiers':'#GoIU',
    'Iowa Hawkeyes':'#FightForIowa','Maryland Terrapins':'#FearTheTurtle',
    'Michigan Wolverines':'#GoBlue','Michigan State Spartans':'#GoGreen',
    'Minnesota Golden Gophers':'#SkiUMah','Nebraska Cornhuskers':'#GBR',
    'Northwestern Wildcats':'#GoCats','Ohio State Buckeyes':'#GoBucks',
    'Oregon Ducks':'#GoDucks','Penn State Nittany Lions':'#WeAre',
    'Purdue Boilermakers':'#BoilerUp','Rutgers Scarlet Knights':'#GoRU',
    'UCLA Bruins':'#GoBruins','USC Trojans':'#FightOn',
    'Washington Huskies':'#GoHuskies','Wisconsin Badgers':'#OnWisconsin'
  };
  assert.equal(Object.keys(approved).length,18);
  for(const sport of ['CFB','NCAAB']){
    for(const [name,tag] of Object.entries(approved)){
      const id=byName(sport,name);
      assert.equal(teamHashtag(sport,id)?.primary,tag,`${sport}: ${name}`);
      assert.equal(registry.teams[sport][id].aliases[0],tag,`${sport}: ${name}`);
    }
    const matchup={sport,id:'401987654',score:89,teams:[
      {name:'Maryland Terrapins',id:byName(sport,'Maryland Terrapins')},
      {name:'Penn State Nittany Lions',id:byName(sport,'Penn State Nittany Lions')}]
    };
    const draft=draftExcitementPost(matchup,{reason:'A late lead change.'});
    assert.deepEqual(draft.hashtags,['#FearTheTurtle','#WeAre',sport==='CFB'?'#NCAAFB':'#CBB']);
    assert.deepEqual(draft.missingTeamHashtags,[]);
    assert.ok(draft.text.length<=280);
  }
});

test('every professional matchup drafts with both approved hashtags and fits within X limits',()=>{
  for(const sport of ['NFL','NBA','NHL']){
    for(let i=0;i<teams[sport].length;i++){
      for(let j=i+1;j<teams[sport].length;j++){
        const sides=[teams[sport][i],teams[sport][j]];
        const game={sport,id:'401000999',score:85,teams:sides.map(team=>({name:team.name,id:team.id}))};
        const draft=draftExcitementPost(game,{reason:'A close, late-game finish.'});
        assert.deepEqual(draft.missingTeamHashtags,[],`${sport}: ${sides.map(x=>x.name).join(' vs ')}`);
        assert.equal(draft.hashtags.length,3);
        assert.equal(draft.hashtags[2],`#${sport}`);
        assert.ok(draft.text.length<=280,`${sport}: ${sides.map(x=>x.name).join(' vs ')}`);
      }
    }
  }
});

test('uses ESPNs tuple field eight for team ID, never abbreviation field one',()=>{
  const game={sport:'NFL',id:'401873024',score:91,teams:[
    ['Baltimore Ravens','BAL','27',null,null,null,null,null,byName('NFL','Baltimore Ravens')],
    ['Philadelphia Eagles','PHI','24',null,null,null,null,null,byName('NFL','Philadelphia Eagles')]]};
  assert.deepEqual(gameHashtags(game),['#RavensFlock','#FlyEaglesFly','#NFL']);
  const draft=draftExcitementPost(game,{reason:'A late fourth-quarter lead change.'});
  assert.ok(draft.eligible);
  assert.ok(draft.text.startsWith("This one's worth watching. Baltimore Ravens vs. Philadelphia Eagles just hit 91/99 on SlateMeter."));
  assert.ok(draft.text.includes('https://slatemeter.app/#game/NFL/401873024'));
  assert.ok(draft.text.includes('A late fourth-quarter lead change.'));
  assert.equal(draft.missingTeamHashtags.length,0);
});

test('handles missing coverage and de-duplicates hashtags without invention',()=>{
  const blank={teams:{CFB:{}}};
  assert.deepEqual(gameHashtags({sport:'CFB',teams:[{id:12},{id:13}]},{registry:blank}),['#NCAAFB']);
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

test('Wake Forest vs Vanderbilt crossing uses the approved wording',()=>{
  const game={sport:'NCAAB',id:'401909726',score:86,teams:[
    {id:'154',name:'Wake Forest Demon Deacons'},
    {id:'238',name:'Vanderbilt Commodores'}]};
  const draft=draftExcitementPost(game,{reason:'A close finish.'});
  assert.ok(draft.text.startsWith("This one's worth watching. Wake Forest Demon Deacons vs. Vanderbilt Commodores just hit 86/99 on SlateMeter."));
  assert.ok(draft.text.includes('A close finish.'));
  assert.ok(draft.text.endsWith('#GoDeacs #AnchorDown #CBB\nhttps://slatemeter.app/#game/NCAAB/401909726'));
  assert.deepEqual(draft.missingTeamHashtags,[]);
});

test('official team tags on current college-basketball slate use the canonical IDs',()=>{
  const expected={
    '12':'#BearDown','57':'#GoGators','127':'#GoGreen','150':'#GoDuke',
    '154':'#GoDeacs','219':'#FightOnPenn','238':'#AnchorDown',
    '251':'#HookEm','356':'#Illini','2641':'#WreckEm'
  };
  for(const [id,hashtag] of Object.entries(expected)){
    assert.equal(teamHashtag('NCAAB',id)?.primary,hashtag);
    assert.equal(teamHashtag('NCAAM',id)?.primary,hashtag);
  }
  assert.equal(teamHashtag('NHL','13')?.primary,'#NYR');
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

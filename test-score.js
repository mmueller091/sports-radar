const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync('app.js','utf8');
const provider = fs.readFileSync('alerts-worker/src/providers/espn.js','utf8');
const styles = fs.readFileSync('styles.css','utf8');
const favoriteLogic = app.slice(app.indexOf('function normalizedTeamName'),app.indexOf('function readLineSnapshots'));
const pickerLogic = app.slice(app.indexOf('function sameFavorite'),app.indexOf('function syncFavoriteGames'));
const teamDirectory = JSON.parse(fs.readFileSync('teams.json','utf8'));
assert.equal(teamDirectory.NBA.length,30);
assert.ok(teamDirectory.NBA.some(team => team.name === 'Los Angeles Lakers'));
assert.ok(teamDirectory.CFB.length > 500);
const scoreLogic = require('./test/helpers/scoring-source.cjs').scoringSource();
const lineLogic = app.slice(app.indexOf('function displayLine'),app.indexOf('async function loadLiveGames'));
const coreBindings = 'const {SPORT_FLOOR,SCHEDULE_SCARCITY,SPORT_BASE,CLOSE_MARGIN,clampScore,factorText,recordFor,rankFor,parseLine,lineFromSummary,gameProgress,momentumImpact,underdogCandidate,upsetImpact,stateRating,rateGame,applyLiveSnapshot} = globalThis.SportsRadarScore;';
const preferenceLogic = app.slice(app.indexOf('function readFavoriteSelections'),app.indexOf('const savedFavorites'));
const explanationLogic = app.slice(app.indexOf('function explainRating'),app.indexOf('function trendFor'));
const nflLogic = provider.slice(provider.indexOf('function nflWeekMeta'),provider.indexOf('function dedupeGames'));
const dedupeLogic = provider.slice(provider.indexOf('function dedupeGames'),provider.indexOf('async function fetchDailyWindow'));
assert.match(provider,/scoreboard\?groups=80[^\n]*limit:500/);
assert.match(provider,/scoreboard\?groups=81[^\n]*limit:500/);
assert.match(provider,/\[yesterday,today\]\.map/);
assert.match(app,/`Why \$\{score\}\? \$\{explainRating\(game\)\}`/);
assert.doesNotMatch(app,/class="game-context rating-context"/);
assert.match(styles,/\.game-card:has\(\.score-dot-wrap:hover\).*z-index: 8/);
assert.match(app,/style="\$\{scoreColorStyle\}"/);
assert.match(styles,/--score-hue/);
assert.match(styles,/hsl\(var\(--score-hue, 140\) 86% 62%\)/);
assert.match(app,/status-\$\{game\.state\}/);
assert.match(app,/strong>Broadcast<\/strong>/);
assert.match(app,/completed-card/);
assert.match(styles,/\.status-completed \{ display: inline-flex/);
assert.match(styles,/\.game-card\.completed-card \.winner-row \.team-score/);
vm.runInNewContext(`${preferenceLogic}
  const LEGACY_DEFAULT_FAVORITES = [{sport:'NFL',name:'Baltimore Ravens'},{sport:'MLB',name:'Baltimore Orioles'},{sport:'NHL',name:'Washington Capitals'}];
  const FAVORITE_SPORTS = ['NFL','MLB','NHL','CFB','NBA','NCAAB','Soccer'];
  const FAVORITES_KEY = 'sports-radar-selected-favorites-v1';
  let stored = null;
  const localStorage = {getItem:() => stored};
  assert.equal(readFavoriteSelections({}).length,0);
  assert.equal(readFavoriteSelections({favoriteTeams:LEGACY_DEFAULT_FAVORITES}).length,0);
  assert.equal(readFavoriteSelections({favoriteTeams:[{sport:'NBA',name:'Los Angeles Lakers'}]})[0].name,'Los Angeles Lakers');
  stored = '[]';
  assert.equal(readFavoriteSelections({favoriteTeams:[{sport:'NBA',name:'Los Angeles Lakers'}]}).length,0);
  stored = JSON.stringify([{sport:'NHL',name:'Washington Capitals'}]);
  assert.equal(readFavoriteSelections({})[0].name,'Washington Capitals');
  `,{assert});
const fixtures = `
  const state = {favoriteTeams:[{sport:'NFL',name:'Baltimore Ravens'},{sport:'MLB',name:'Baltimore Orioles'},{sport:'NHL',name:'Washington Capitals'}]};
  assert.equal(favoriteFor([{name:'Baltimore Ravens',id:'33'}],'NFL'),true);
  assert.equal(favoriteFor([{name:'Baltimore Ravens',id:'33'}],'NBA'),false);
  state.favoriteTeams = state.favoriteTeams.filter(team => team.name !== 'Washington Capitals');
  assert.equal(favoriteFor([{name:'Washington Capitals',id:'23'}],'NHL'),false);
  state.favoriteTeams.push({sport:'NBA',name:'Los Angeles Lakers',id:'13'});
  assert.equal(favoriteFor([{name:'Los Angeles Lakers',id:'13'}],'NBA'),true);
  assert.equal(favoriteFor([{name:'LA Lakers',id:'13'}],'NBA'),true);
  assert.equal(sameFavorite({sport:'NBA',name:'Los Angeles Lakers',id:'13'},{sport:'NBA',name:'LA Lakers',id:'13'}),true);
  const cfb = {notes:[],competitors:[{team:{displayName:'Minnesota'}},{team:{displayName:'Iowa'}}]};
  const worldSeries = {notes:[{headline:'World Series - Game 1'}],competitors:[{team:{displayName:'Brewers'}},{team:{displayName:'Rays'}}]};
  const scheduledTeams = [{score:'0'},{score:'0'}];
  const ordinary = rateGame('CFB','upcoming',scheduledTeams,{name:'Minnesota vs Iowa'},cfb,'');
  const championship = rateGame('MLB','upcoming',scheduledTeams,{name:'Brewers vs Rays'},worldSeries,'');
  const postseason = rateGame('MLB','upcoming',scheduledTeams,{name:'Brewers vs Rays',season:{type:3}},{notes:[],competitors:[]},'');
  assert.equal(SPORT_FLOOR,32);
  assert.deepEqual(SCHEDULE_SCARCITY,{NFL:10,MLB:0,NHL:5,CFB:8,NBA:5,NCAAB:3,Tennis:2,Soccer:4});
  assert.deepEqual(SPORT_BASE,{NFL:42,MLB:32,NHL:37,CFB:40,NBA:37,NCAAB:35,Tennis:34,Soccer:36});
  assert.equal(ordinary.score,40);
  assert.equal(ordinary.factors.find(factor => factor.label === 'Sport baseline').points,32);
  assert.equal(ordinary.factors.find(factor => factor.label === 'Schedule scarcity').points,8);
  assert.equal(championship.score,82);
  assert.equal(championship.factors.find(factor => factor.label === 'World Series').points,50);
  assert.ok(!championship.factors.some(factor => ['Postseason scarcity','Series opener'].includes(factor.label)));
  assert.ok(championship.score > ordinary.score);
  assert.equal(postseason.score,60);
  const ravensBengals = {notes:[],competitors:[
    {team:{abbreviation:'BAL'},records:[{type:'overall',summary:'4-2'}]},
    {team:{abbreviation:'CIN'},records:[{type:'overall',summary:'3-2'}]}
  ],odds:[{details:'BAL -3',overUnder:51.5}]};
  const rivalry = rateGame('NFL','upcoming',scheduledTeams,{name:'Ravens vs Bengals'},ravensBengals,'');
  assert.equal(rivalry.score,73);
  function nflMatchup(name,awayCode,awayRecord,homeCode,homeRecord,spread) {
    const competition = {notes:[],competitors:[
      {homeAway:'away',team:{abbreviation:awayCode},records:[{type:'overall',summary:awayRecord}]},
      {homeAway:'home',team:{abbreviation:homeCode},records:[{type:'overall',summary:homeRecord}]}
    ],odds:[{details:homeCode+' -'+spread}]};
    return rateGame('NFL','upcoming',scheduledTeams,{name},competition,'');
  }
  const jetsDolphins = nflMatchup('Dolphins at Jets','MIA','0-5','NYJ','2-4',4.5);
  const bearsPatriots = nflMatchup('Patriots at Bears','NE','4-2','CHI','4-2',3);
  const ramsRaiders = nflMatchup('Rams at Raiders','LAR','2-4','LV','3-3',4.5);
  const seahawksChiefs = nflMatchup('Chiefs at Seahawks','KC','5-0','SEA','3-3',2.5);
  assert.equal(jetsDolphins.score,39);
  assert.equal(bearsPatriots.score,66);
  assert.equal(ramsRaiders.score,47);
  assert.equal(seahawksChiefs.score,60);
  assert.ok([bearsPatriots,ramsRaiders,seahawksChiefs].every(matchup => matchup.score > jetsDolphins.score));
  assert.equal(bearsPatriots.factors.find(factor => factor.label === 'Both winning records').points,14);
  assert.equal(jetsDolphins.factors.find(factor => factor.label === 'AFC East matchup').points,4);
  const nflGame = {sport:'NFL',state:'upcoming',score:rivalry.score,factors:rivalry.factors,startTime:'2026-10-25T17:00:00Z',line:{spread:'BAL -3'},teams:[['Baltimore Ravens','BAL','0','',null,'4-2'],['Cincinnati Bengals','CIN','0','',null,'3-2']]};
  const nflProse = explainRating(nflGame);
  assert.match(nflProse,/AFC North/);
  assert.match(nflProse,/BAL -3/);
  assert.match(nflProse,/Lamar Jackson vs\. Joe Burrow if both start/);
  assert.doesNotMatch(nflProse,/ranked/);
  assert.doesNotMatch(explainRating({...nflGame,score:42,factors:[{label:'Sport baseline',points:32},{label:'Schedule scarcity',points:10}],teams:[['Team One','ONE'],['Team Two','TWO']]}),/ranked/);
  const weakDivisionProse = explainRating({sport:'NFL',state:'upcoming',score:jetsDolphins.score,factors:jetsDolphins.factors,startTime:'2026-10-25T17:00:00Z',line:{spread:'NYJ -4.5'},teams:[['Miami Dolphins','MIA','0','',null,'0-5'],['New York Jets','NYJ','0','',null,'2-4']]});
  assert.match(weakDivisionProse,/below .500/);
  assert.match(weakDivisionProse,/only a small boost/);
  const futureFavorite = {favorite:true,state:'upcoming',startTime:new Date(Date.now()+3*86400000).toISOString(),score:71};
  const todayFavorite = {...futureFavorite,startTime:new Date().toISOString()};
  const ordinaryUpcoming = {favorite:false,state:'upcoming',score:80};
  assert.equal(pinnedFavorite(futureFavorite),false);
  assert.equal(pinnedFavorite(todayFavorite),true);
  assert.equal([futureFavorite,ordinaryUpcoming].sort(compareGames)[0],ordinaryUpcoming);
  assert.equal([ordinaryUpcoming,todayFavorite].sort(compareGames)[0],todayFavorite);
  function safeText(value) { return String(value); }
  function gameCard(game) { return '<button>' + game.id + '</button>'; }
  const yesterday = new Date(Date.now()-86400000).toISOString();
  const twoDaysAgo = new Date(Date.now()-2*86400000).toISOString();
  const today = new Date().toISOString();
  const oldFinal = {id:'old-final',state:'completed',startTime:twoDaysAgo,score:99};
  const yesterdayFinal = {id:'yesterday-final',state:'completed',startTime:yesterday,score:72};
  const todayFinal = {id:'today-final',state:'completed',startTime:today,score:95};
  const todayUpcoming = {id:'today-upcoming',state:'upcoming',startTime:today,score:45};
  const futureUpcoming = {id:'future-upcoming',state:'upcoming',startTime:futureFavorite.startTime,score:90};
  const live = {id:'live',state:'live',startTime:today,score:50};
  const favoriteLive = {id:'favorite-live',favorite:true,state:'live',startTime:today,score:30};
  assert.equal(visibleInState(oldFinal,'all'),false);
  assert.equal(visibleInState(oldFinal,'completed'),true);
  assert.equal(visibleInState(todayFinal,'all'),true);
  assert.deepEqual([oldFinal,todayFinal,yesterdayFinal].sort((a,b) => compareDatedGames(a,b,'completed')).map(game => game.id),['today-final','yesterday-final','old-final']);
  assert.deepEqual([futureUpcoming,todayUpcoming].sort((a,b) => compareDatedGames(a,b,'upcoming')).map(game => game.id),['today-upcoming','future-upcoming']);
  const groupedFinals = renderGameList([todayFinal,yesterdayFinal,oldFinal],'completed');
  assert.equal((groupedFinals.match(/game-date-divider/g) || []).length,3);
  assert.match(groupedFinals,/Today/);
  assert.match(groupedFinals,/Yesterday/);
  assert.deepEqual([futureUpcoming,todayFinal,live,todayUpcoming,favoriteLive].sort(compareAllGames).map(game => game.id),
    ['favorite-live','live','today-upcoming','today-final','future-upcoming']);
  assert.equal(allGroup(todayFavorite),0);
  assert.equal(allGroup(futureFavorite),4);
  const rankedPair = {notes:[],competitors:[
    {curatedRank:{current:19},records:[{type:'overall',summary:'4-2'}]},
    {curatedRank:{current:7},records:[{type:'overall',summary:'5-1'}]}
  ]};
  const unbeatenPair = {notes:[],competitors:[
    {curatedRank:{current:10},records:[{type:'overall',summary:'6-0'}]},
    {curatedRank:{current:14},records:[{type:'overall',summary:'6-1'}]}
  ]};
  const texasOleMiss = rateGame('CFB','upcoming',scheduledTeams,{name:'Texas vs Ole Miss'},rankedPair,'');
  const utahHouston = rateGame('CFB','upcoming',scheduledTeams,{name:'Utah vs Houston'},unbeatenPair,'');
  assert.equal(texasOleMiss.score,71);
  assert.equal(utahHouston.score,75);
  const championshipDecider = rateGame('MLB','upcoming',scheduledTeams,{name:'World Series Game 7'},{notes:[],competitors:[]},'World Series Game 7');
  assert.ok(championshipDecider.score > Math.max(championship.score,utahHouston.score));
  assert.ok(!ordinary.factors.some(item => /close/i.test(item.label)));
  const final = rateGame('NFL','completed',[{score:'24'},{score:'27'}],{name:'Jaguars vs Texans'},{status:{type:{detail:'Final'}}},'');
  const blowoutFinal = rateGame('NFL','completed',[{score:'10'},{score:'38'}],{name:'Jaguars vs Texans'},{status:{type:{detail:'Final'}}},'');
  assert.ok(final.score > blowoutFinal.score);
  assert.ok(final.factors.some(factor => factor.label === 'Final margin'));
  const lateClose = stateRating(38,'NFL','live',3,.95);
  const earlyClose = stateRating(38,'NFL','live',3,.2);
  const lateBlowout = stateRating(80,'NFL','live',28,.95);
  assert.ok(lateClose.score > earlyClose.score);
  assert.ok(lateClose.score > lateBlowout.score);
  assert.ok(lateBlowout.score < 40);
  const upsetCompetition = {competitors:[
    {homeAway:'away',team:{id:'a',displayName:'Chicago Bears'},score:'24'},
    {homeAway:'home',team:{id:'h',displayName:'Baltimore Ravens'},score:'21'}
  ],status:{period:4,displayClock:'2:00',type:{detail:'2:00 - 4th Quarter'}},odds:[{pointSpread:{away:{close:{line:'+10.5'}},home:{close:{line:'-10.5'}}}}]};
  const upsetTeams = [{id:'a',score:'24'},{id:'h',score:'21'}];
  const underdogLive = rateGame('NFL','live',upsetTeams,{name:'Bears at Ravens'},upsetCompetition,'');
  assert.ok(underdogLive.upsetPoints >= 15);
  assert.match(underdogLive.upsetText,/Chicago Bears.*10.5-point underdog.*leads 24–21/);
  assert.ok(underdogLive.factors.some(item => item.label === 'Underdog threatens upset'));
  const underdogFinal = rateGame('NFL','completed',upsetTeams,{name:'Bears at Ravens'},upsetCompetition,'');
  assert.ok(underdogFinal.upsetPoints >= 20);
  const ordinaryLive = rateGame('NFL','live',upsetTeams,{name:'Bears at Ravens'},{...upsetCompetition,odds:[]},'');
  assert.ok(underdogLive.score > ordinaryLive.score);
  const tiedEarlier = upsetImpact(underdogLive.underdog,[{id:'a',score:'21'},{id:'h',score:'21'}],'live',.35);
  assert.equal(tiedEarlier.points,0);
  const reversed = upsetImpact(underdogLive.underdog,[{id:'a',score:'20'},{id:'h',score:'24'}],'completed',1);
  assert.equal(reversed.points,0);
  const comebackSummary = {header:{competitions:[{competitors:[{homeAway:'away',team:{displayName:'New England Patriots'}},{homeAway:'home',team:{displayName:'Chicago Bears'}}]}]},scoringPlays:[
    {period:{number:1},clock:{displayValue:'8:00'},homeScore:0,awayScore:7},
    {period:{number:2},clock:{displayValue:'4:00'},homeScore:0,awayScore:14},
    {period:{number:3},clock:{displayValue:'3:00'},homeScore:7,awayScore:14},
    {period:{number:4},clock:{displayValue:'9:00'},homeScore:14,awayScore:14},
    {period:{number:4},clock:{displayValue:'2:00'},homeScore:21,awayScore:14}
  ]};
  const comeback = momentumImpact('NFL',comebackSummary,.967,'live');
  assert.ok(comeback.points >= 15);
  assert.match(comeback.text,/Chicago Bears erased a deficit of 14 points/);
  assert.match(comeback.text,/lead changed 1 time/);
  assert.match(comeback.text,/21 unanswered points/);
  assert.equal(momentumImpact('NFL',{},.9,'live').points,0);
  assert.ok(momentumImpact('NFL',comebackSummary,1,'completed').points >= 15);
  assert.equal(comeback.factors.reduce((sum,factor) => sum + factor.points,0),comeback.points);
  const probabilityOnly = momentumImpact('NFL',{header:comebackSummary.header,winprobability:[
    {homeWinPercentage:.51},{homeWinPercentage:.49},{homeWinPercentage:.41},{homeWinPercentage:.28},{homeWinPercentage:.12}
  ]},.7,'live');
  assert.ok(probabilityOnly.points >= 6);
  assert.match(probabilityOnly.text,/New England Patriots.*39 percentage points/);
  assert.equal(momentumImpact('NFL',{winprobability:[{homeWinPercentage:.5},{homeWinPercentage:.49}]},.5,'live').points,0);
  const moneylineUpset = underdogCandidate('MLB',{competitors:[{homeAway:'away',team:{id:'a',displayName:'Rays'}},{homeAway:'home',team:{id:'h',displayName:'Brewers'}}]},{moneyline:{away:{close:{odds:'+230'}},home:{close:{odds:'-275'}}}});
  assert.ok(moneylineUpset.description.includes('+230 moneyline'));
  assert.equal(underdogCandidate('NHL',{competitors:upsetCompetition.competitors},{pointSpread:{away:{close:{line:'+1.5'}},home:{close:{line:'-1.5'}}}}),null);
  assert.equal(recordFor({records:[{type:'overall',summary:'5-2'}]}),'5-2');
  assert.equal(rankFor({curatedRank:{current:12}},'CFB'),12);
  const line = parseLine({details:'Iowa -3.5',overUnder:44.5,provider:{name:'ESPN BET'}},{});
  assert.equal(line.spread,'Iowa -3.5');
  assert.equal(line.total,44.5);
  assert.equal(displayLine({id:'test',state:'upcoming',line}).text,'Spread Iowa -3.5 · O/U 44.5');
  assert.equal(displayLine({id:'test',state:'live',line}).label,'Last listed pregame line');
  const hockeyLine = parseLine({details:'WSH -162',overUnder:5.5}, {}, 'NHL');
  assert.equal(hockeyLine.spread,'');
  assert.equal(displayLine({id:'hockey',sport:'NHL',state:'live',line:hockeyLine}).text,'Moneyline WSH -162 · O/U 5.5');
  const hockeyFinal = rateGame('NHL','completed',[{score:'2'},{score:'5'}],{name:'Capitals vs Kings'},{status:{type:{detail:'Final'}}},'');
  assert.match(hockeyFinal.reason,/goals/);
  const edmontonCarolina = rateGame('NHL','upcoming',scheduledTeams,{name:'Edmonton Oilers at Carolina Hurricanes'}, {notes:[],competitors:[
    {team:{abbreviation:'EDM'},records:[{type:'overall',summary:'7-1-1'}]},
    {team:{abbreviation:'CAR'},records:[{type:'overall',summary:'8-2-1'}]}
  ]},'');
  const dallasWinnipeg = rateGame('NHL','upcoming',scheduledTeams,{name:'Dallas Stars at Winnipeg Jets'}, {notes:[],competitors:[
    {team:{abbreviation:'DAL'},records:[{type:'overall',summary:'5-3-1'}]},
    {team:{abbreviation:'WPG'},records:[{type:'overall',summary:'4-3-2'}]}
  ]},'');
  assert.ok(edmontonCarolina.score > dallasWinnipeg.score);
  assert.ok(edmontonCarolina.factors.some(factor => factor.label === 'Adjusted team quality'));
  assert.equal(dallasWinnipeg.factors.filter(factor => /Division matchup/.test(factor.label)).reduce((sum,factor) => sum + factor.points,0),3);
  const prose = explainRating({state:'upcoming',score:82,factors:championship.factors,teams:[['Brewers'],['Rays']]});
  assert.match(prose,/Game 1 of the World Series/);
  assert.doesNotMatch(prose,/Sport baseline/);
  const cfbProse = explainRating({sport:'CFB',state:'upcoming',score:80,factors:utahHouston.factors,teams:[['Utah','UTA','—','',null,'6-0',10],['Houston','HOU','—','',null,'6-1',14]]});
  assert.match(cfbProse,/unbeaten/);
  const football = {sport:'NFL',state:'live',teams:[['Baltimore Ravens','BAL',21,,,,,,'33'],['Cincinnati Bengals','CIN',20,,,,,,'4']],baseScore:72};
  applyLiveSnapshot(football,{status:{displayClock:'2:32',period:2,type:{detail:'2:32 - 2nd Quarter'}},situation:{possession:'33',down:4,distance:2,downDistanceText:'4th & 2 at CIN 12',isRedZone:true}},null);
  assert.match(football.live.phase,/2:32.*2nd quarter/);
  assert.match(football.live.note,/BAL ball.*4th & 2 at CIN 12/);
  assert.equal(football.score,75,'NFL early fourth-down leverage stays modest (72 base + 3 situation)');
  const baseball = {sport:'MLB',state:'live',teams:[['Orioles','BAL',3],['Yankees','NYY',3]],baseScore:65};
  applyLiveSnapshot(baseball,{status:{period:7,type:{detail:'Top 7th'}},situation:{onFirst:true,onSecond:false,onThird:true,outs:2},competitors:[{homeAway:'away',team:{displayName:'Orioles'},score:'3'},{homeAway:'home',team:{displayName:'Yankees'},score:'3'}]},null);
  assert.equal(baseball.live.phase,'Top 7th');
  assert.equal(baseball.live.bases.third,true);
  assert.equal(baseball.live.note,'2 outs');
  const noHitSummary = {header:{competitions:[{competitors:[{team:{id:'1',displayName:'Orioles'},hits:0},{team:{id:'2',displayName:'Yankees'},hits:5}]}]},boxscore:{players:[{team:{id:'2'},statistics:[{name:'pitching',labels:['IP','H'],athletes:[{athlete:{displayName:'Ace Pitcher'},stats:['6.0','0']}]}]}]}};
  applyLiveSnapshot(baseball,{status:{period:7,type:{detail:'Top 7th'}},situation:{onFirst:true,onSecond:false,onThird:true,outs:2},competitors:[{homeAway:'away',team:{displayName:'Orioles'},score:'3'},{homeAway:'home',team:{displayName:'Yankees'},score:'3'}]},noHitSummary);
  assert.match(baseball.live.reasons.join(' '),/Ace Pitcher.*6 hitless innings/);
  assert.ok(baseball.score >= 84);
  const hockey = {sport:'NHL',state:'live',teams:[['Capitals','WSH',2,,,,,,'23'],['Penguins','PIT',2,,,,,,'16']],baseScore:60};
  const hockeySummary = {onIce:[{teamId:'23',entries:[{athleteid:'g1'},{athleteid:'a'},{athleteid:'b'},{athleteid:'c'},{athleteid:'d'},{athleteid:'e'}]},{teamId:'16',entries:[{athleteid:'g2'},{athleteid:'f'},{athleteid:'g'},{athleteid:'h'},{athleteid:'i'}]}],boxscore:{players:[{team:{id:'23'},statistics:[{name:'goalies',athletes:[{athlete:{id:'g1'}}]},{name:'forwards',labels:['G'],athletes:[{athlete:{displayName:'Star Skater'},stats:['2']}]}]},{team:{id:'16'},statistics:[{name:'goalies',athletes:[{athlete:{id:'g2'}}]}]}]}};
  applyLiveSnapshot(hockey,{status:{displayClock:'12:10',period:3,type:{detail:'12:10 - 3rd Period'}}},hockeySummary);
  assert.match(hockey.live.phase,/12:10.*3rd period/);
  assert.match(hockey.live.note,/Capitals power play/);
  assert.match(hockey.live.reasons.join(' '),/Star Skater.*hat trick/);
  assert.equal(hockey.live.components.milestone,3,'NHL hat-trick chase is a modest competitive bump');
  assert.equal(hockey.score,67);
  const unique = dedupeGames([{sport:'CFB',id:'1',division:'FBS'},{sport:'CFB',id:'1',division:'FCS'},{sport:'CFB',id:'2',division:'FBS'}]);
  assert.equal(unique.length,2);
  assert.equal(unique[0].division,'FCS');
  const meta = nflWeekMeta({season:{type:2,year:2026},week:{number:7}});
  assert.equal(meta.week,7);
  assert.equal(adjacentNFLWeek(meta,1).week,8);
  assert.equal(new URL(nflWeekFeed({sport:'NFL',url:'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'},meta).url).searchParams.get('week'),'7');
  const nflGames = [
    {sport:'NFL',id:'w6a',nflWeek:2026206,state:'completed'},
    {sport:'NFL',id:'w6b',nflWeek:2026206,state:'completed'},
    {sport:'NFL',id:'w7a',nflWeek:2026207,state:'completed'},
    {sport:'NFL',id:'w7b',nflWeek:2026207,state:'completed'},
    {sport:'NFL',id:'w7m',nflWeek:2026207,state:'upcoming'},
    {sport:'NFL',id:'w8t',nflWeek:2026208,state:'upcoming'},
    {sport:'NFL',id:'w8m',nflWeek:2026208,state:'upcoming'}
  ];
  const monday = selectNFLWindow(nflGames);
  assert.equal(monday.filter(game => game.state === 'completed').length,4);
  assert.equal(monday.filter(game => game.state === 'upcoming').length,3);
  nflGames[4].state = 'completed';
  const tuesday = selectNFLWindow(nflGames);
  assert.equal(tuesday.filter(game => game.state === 'completed').length,3);
  assert.equal(tuesday.filter(game => game.state === 'upcoming').length,2);
  nflGames[5].state = 'live';
  nflGames.push({sport:'NFL',id:'w9t',nflWeek:2026209,state:'upcoming'});
  const thursday = selectNFLWindow(nflGames);
  assert.ok(thursday.some(game => game.id === 'w9t'));
  assert.ok(thursday.some(game => game.id === 'w7a'));
  assert.equal(dateToken(new Date(2026,9,21,12,0,0)),'20261021');
  assert.equal(new URL(datedFeed({sport:'NBA',url:'https://example.com/scoreboard'},new Date(2026,9,22,12,0,0)).url).searchParams.get('dates'),'20261022');
  console.log('Score model fixtures passed');
`;
vm.runInNewContext(`${favoriteLogic}\n${pickerLogic}\n${scoreLogic}\n${coreBindings}\n${lineLogic}\n${explanationLogic}\n${nflLogic}\n${dedupeLogic}\n${fixtures}`,{assert,console,URL,localStorage:{getItem:()=>null}});

const watchLogic = app.slice(app.indexOf('function watchKey'),app.indexOf('function syncFCSFilter'));
vm.runInNewContext(`${watchLogic}
  const state = {watchedGames:new Set()};
  const saved = {};
  const localStorage = {setItem:(key,value) => { saved[key] = value; }};
  const WATCHLIST_KEY = 'sports-radar-watched-games-v1';
  const render = () => {};
  const game = {sport:'NHL',id:'401892539'};
  assert.equal(isWatched(game),false);
  assert.equal(toggleWatchedGame(game),true);
  assert.deepEqual(JSON.parse(saved[WATCHLIST_KEY]),['NHL:401892539']);
  assert.equal(toggleWatchedGame(game),false);
  assert.deepEqual(JSON.parse(saved[WATCHLIST_KEY]),[]);
`,{assert});

const timelineLogic = app.slice(app.indexOf('function readRatingHistory'),app.indexOf('function renderDetailContent'));
const momentLogic = app.slice(app.indexOf('function summarySpecificWhy'),app.indexOf('function render()'));
vm.runInNewContext(`${scoreLogic}\n${coreBindings}\n${timelineLogic}\n${momentLogic}
  const hockey = {sport:'NHL',id:'match',state:'completed',score:86,openingScore:35};
  const summary = {plays:[
    {scoringPlay:true,period:{number:1,displayValue:'1st'},clock:{displayValue:'13:49'},homeScore:0,awayScore:1,text:'Macklin Celebrini goal'},
    {scoringPlay:true,period:{number:2,displayValue:'2nd'},clock:{displayValue:'1:49'},homeScore:1,awayScore:1,text:'Nick Suzuki goal'},
    {scoringPlay:true,period:{number:4,displayValue:'OT'},clock:{displayValue:'2:13'},homeScore:3,awayScore:4,text:'Macklin Celebrini overtime goal'}
  ]};
  const chart = timelinePoints(hockey,summary);
  assert.equal(chart.source,'scoring plays');
  assert.equal(chart.points.length,4); // Terminal OT score already carries the final rating.
  assert.ok(chart.points[1].x < chart.points[2].x && chart.points[2].x < chart.points[3].x);
  assert.equal(chart.points[3].score,86);
  assert.equal(chart.points.at(-1).score,86);
  const chartMarkup = excitementTimeline(hockey,summary);
  assert.match(chartMarkup,/timeline-chart/);
  assert.match(chartMarkup,/timeline-point/);
  assert.match(chartMarkup,/data-timeline-explanation/);
  assert.match(chartMarkup,/timeline-point-help/);
  assert.match(summarySpecificWhy(hockey,summary).label,/Decisive/);
  assert.equal(timelinePoints({...hockey,state:'upcoming'},summary).points.length,0);
  assert.match(excitementTimeline({...hockey,state:'live'},null),/Not enough play-by-play/);
  console.log('Watchlist and timeline fixtures passed');
`,{
  assert,console,
  localStorage:{getItem:() => null},
  HISTORY_KEY:'sports-radar-rating-history-v1',
  watchKey:game => `${game.sport}:${game.id}`,
  state:{source:'demo'},
  SPORT_BASE:{NHL:35},CLOSE_MARGIN:{NHL:3},
  clampScore:value => Math.max(1,Math.min(99,Math.round(value))),
  gameProgress:() => 0,
  compactPlay:play => play?.text || '',
  safeText:value => String(value)
});

// Synthetic unit fixtures below are test-only. Local /qa uses live endpoints.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const data=require('../league-standings-data.js');
const ui=fs.readFileSync(require.resolve('../league-standings.js'),'utf8');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8').replace(/\r\n/g,'\n');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const now=Date.parse('2026-11-08T18:00:00Z');
const team={sport:'NFL',id:'33',name:'Baltimore Ravens',abbreviation:'BAL'};
const fixtureGame=(id,state='upcoming',startTime='2026-11-10T01:00:00Z',score=50)=>({
  id,sport:'NFL',state,startTime,score,status:state==='live'?'Q2 5:00':'Scheduled',
  teams:[['Baltimore Ravens','BAL','7','white','logo','4-4',null,'Ravens','33'],['Opponent','OPP','3','white','logo','3-5',null,'Opponent','1']]
});
const fixtureRow=(id,date,homeAway='away')=>({id,state:'upcoming',startTime:date,homeAway,opponent:{id:'1',name:'Opponent'}});
const st=(name,displayValue,type=name)=>({name,type,displayValue});
const entry=(id,stats=[])=>({team:{id,displayName:`Test team ${id}`,abbreviation:`T${id}`,logos:[{href:'official-logo',rel:['default']}]},stats});

test('new navigation immediately follows Info and loads only scoped feature assets',()=>{
  assert.match(html,/data-page="info">Info<\/a>\s*<a[^>]+id="standings-nav"[^>]+data-page="standings">Standings<\/a>/);
  for(const file of ['league-standings.css','league-standings.js','league-standings-data.js'])assert.ok(html.includes(file));
  assert.ok(html.indexOf('league-standings.js?')<html.indexOf('app.js?'));
});
test('raw source order, split records and current conference hierarchy are preserved',()=>{
  const payload={season:{year:2026},children:[{id:'37',name:'Test conference',children:[{id:'east',name:'East',standings:{entries:[
    entry('B',[st('overall','7-2','total'),st('vs. Conf.','5-0','vsconf'),st('wins','7'),st('wins','1','awayrecord_wins')]),
    entry('A',[st('overall','7-2','total'),st('vs. Conf.','5-0','vsconf')])
  ]}}]}]};
  const normalized=data.normalizeStandings(payload,'CFB','FBS');
  assert.equal(normalized.sections[0].conferenceId,'37');
  assert.equal(normalized.sections[0].conference,'Test conference');
  assert.equal(normalized.sections[0].name,'East');
  assert.deepEqual(normalized.sections[0].entries.map(t=>t.id),['B','A']);
  assert.equal(normalized.sections[0].entries[0].record,'7-2');
  assert.equal(normalized.sections[0].entries[0].conferenceRecord,'5-0');
});
test('professional groups retain league/conference parents and sport-specific fields',()=>{
  for(const sport of ['NFL','MLB','NHL','NBA']){
    const out=data.normalizeStandings({children:[{id:'conference',name:'Conference',children:[{id:'division',name:'Division',standings:{entries:[entry('1',[
      st('wins','10'),st('losses','3'),st('otLosses','2'),st('points','22'),st('regWins','8'),st('gamesPlayed','15')
    ])]}}]}]},sport);
    assert.equal(out.sections[0].parent,'Conference');
    assert.equal(out.sections[0].entries[0].record,sport==='NHL'?'10-3-2':'10-3');
    assert.equal(out.sections[0].entries[0].points,'22');
  }
});
test('AP rankings use published current rank, never seeds, conference position or scores',()=>{
  const standings={season:{year:2027},sections:[{conference:'Current conference',entries:[{id:'1',record:'2-0'}]}]};
  const payload={rankings:[{type:'cfp',ranks:[{current:1,team:{id:'other'}}]},
    {type:'ap',name:'AP Top 25',date:'2026-10-19',season:{year:2027},ranks:[
      {current:25,team:{id:'2',location:'Second',name:'Team'},recordSummary:'1-0'},
      {current:1,team:{id:'1',displayName:'First Team'},recordSummary:'0-0'},
      {current:26,team:{id:'3'}},{current:0,team:{id:'4'}}]}]};
  const poll=data.normalizePoll(payload,'NCAAB',standings);
  assert.equal(poll.name,'AP Top 25');assert.deepEqual(poll.entries.map(r=>r.rank),[1,25]);
  assert.equal(poll.entries[0].conference,'Current conference');assert.equal(poll.entries[0].record,'2-0');
  assert.equal(data.normalizePoll({rankings:[payload.rankings[0]]},'CFB',standings),null);
  assert.equal(data.normalizePoll(payload,'NCAAB',{season:{year:2028}}),null);
});

test('playoff views retain source seeds across conferences and use each sport cutoff',()=>{
  for(const [sport,first,cutoff] of [['NFL',4,7],['MLB',3,6],['NBA',6,10]]){
    const sections=['East','West'].flatMap(parent=>[0,1].map(division=>({name:`Division ${division}`,parent,
      entries:Array.from({length:8},(_,i)=>({id:`${parent}-${i*2+division+1}`,playoffSeed:i*2+division+1,record:'10-3'})).reverse()})));
    const before=JSON.stringify(sections),groups=data.playoffSections({sections},sport);
    assert.equal(groups.length,6);
    for(let offset=0;offset<6;offset+=3){
      assert.deepEqual(groups[offset].entries.map(t=>t.position),Array.from({length:first},(_,i)=>i+1));
      assert.deepEqual(groups[offset+1].entries.map(t=>t.position),Array.from({length:cutoff-first},(_,i)=>first+i+1));
      assert.equal(groups[offset+2].entries[0].position,cutoff+1);
      assert.equal(groups[offset+1].name,sport==='NBA'?'Play-in positions':'Wild cards');
    }
    assert.equal(JSON.stringify(sections),before,'regular standings must remain untouched');
  }
});

test('NHL selects three per division then both wild cards can come from one division',()=>{
  const section=(name,seeds)=>({parent:'Eastern Conference',name,entries:seeds.map(seed=>({id:String(seed),playoffSeed:seed,points:'25'}))});
  const sections=[section('Atlantic',[8,5,1,3,2,4,6,7]),section('Metropolitan',[16,15,14,13,12,11,10,9])];
  const before=JSON.stringify(sections),groups=data.playoffSections({sections},'NHL');
  assert.deepEqual(groups[0].entries.map(t=>t.id),['1','2','3']);
  assert.deepEqual(groups[1].entries.map(t=>t.id),['9','10','11']);
  assert.deepEqual(groups[2].entries.map(t=>t.id),['4','5']);
  assert.deepEqual(groups[2].entries.map(t=>t.position),[1,2]);
  assert.deepEqual(groups[3].entries.map(t=>t.id),['6','7','8','12','13','14','15','16']);
  assert.equal(new Set(groups.flatMap(g=>g.entries.map(t=>t.id))).size,16);
  assert.equal(JSON.stringify(sections),before);
});

test('missing, zero, duplicate or incomplete playoff seeds never invent a playoff field',()=>{
  for(const seeds of [[1,null],[1,0],[1,1],[1,3]]){
    const normalized=data.normalizeStandings({children:[{id:'east',name:'East',children:[{id:'division',name:'Division',
      standings:{entries:seeds.map((seed,i)=>entry(String(i),seed===null?[]:[st('playoffSeed',String(seed))]))}}]}]},'NBA');
    assert.deepEqual(data.playoffSections(normalized,'NBA'),[]);
  }
  assert.deepEqual(data.playoffSections({sections:[]},'CFB'),[]);
});
test('live takes precedence, finals are excluded, and next comes from the full schedule',()=>{
  const future=fixtureRow('tomorrow','2026-11-09T18:00:00Z');
  const live=fixtureGame('live','live','2026-11-08T17:00:00Z',77);
  const chosen=data.nextGame(team,[future,fixtureRow('later','2026-11-17T00:00:00Z')],[live],now);
  assert.equal(chosen.id,'live');assert.equal(chosen.game,live);assert.equal(chosen.homeAway,'away');
  assert.equal(data.nextGame(team,[future],[{...live,state:'completed'}],now).id,'tomorrow');
  assert.equal(data.nextGame(team,[fixtureRow('past','2026-11-07T00:00:00Z')],[],now),null);
  assert.equal(data.nextGame(team,[{...future,status:'Postponed'}],[],now),null);
  assert.equal(data.nextGame(team,[],[{...live,liveRawStatus:{type:{completed:true}}}],now),null);
});
test('only canonical IDs match, including teams sharing a display name across leagues',()=>{
  const wrong=fixtureGame('wrong');wrong.teams[0][8]='999';
  assert.equal(data.nextGame(team,[],[wrong],now),null);
  assert.equal(data.nextGame(team,[],[{...fixtureGame('other-league'),sport:'CFB'}],now),null);
  const ownHome=fixtureGame('home');ownHome.teams.reverse();
  const row=data.nextGame(team,[],[ownHome],now);
  assert.equal(row.homeAway,'home');assert.equal(row.opponent.id,'1');
});
test('a canonical final invalidates an older upcoming schedule row of the same game',()=>{
  const schedule=[fixtureRow('finished','2026-11-10T01:00:00Z'),fixtureRow('next','2026-11-17T01:00:00Z')];
  assert.equal(data.nextGame(team,schedule,[fixtureGame('finished','completed')],now).id,'next');
});

function harness(){
  const elements=new Map(),listeners=new Map();
  const element=selector=>{
    if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',contains:()=>false,querySelectorAll:()=>[],
      addEventListener:(type,fn)=>listeners.set(type,fn)});
    return elements.get(selector);
  };
  const context=vm.createContext({console,Map,Set,WeakMap,Promise,queueMicrotask,
    Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},
    SlateMeterStandingsData:data,SportsRadarScore:{MODEL_VERSION:'test-model'},
    HOME_SPORTS:['NFL','MLB','NHL','CFB','NBA','NCAAB','Tennis'],publicSport:s=>s!=='Tennis',
    state:{page:'standings',visibleSports:new Set(['NCAAB','NFL','Tennis','Soccer']),gameState:'completed',sport:'NHL',source:'live',updatedAt:new Date(now).toISOString()},
    games:[],teamPageData:new Map(),teamPageErrors:new Map(),teamDataKey:t=>`${t.sport}:${t.id}`,
    watchKey:g=>`${g.sport}:${g.id}`,safeText:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    labelForSport:s=>({CFB:'College Football',NCAAB:'NCAAM'})[s]||s,
    teamHash:t=>`#team/${t.sport}/${t.id}`,teamLogoWithFallback:()=>'<img data-team-logo>',
    teamSignalMarkup:(score,label)=>`<span class="rating">${score}:${label}</span>`,
    teamGameTimeLabel:r=>new Date(r.startTime).toISOString(),document:{activeElement:null},$:element,
    loadTeamPageData:async()=>null,fetchGameSummary:async()=>{throw new Error('test unavailable');},openGameDetails(){},openTeamPage(){}});
  vm.runInContext(ui,context);
  const run=s=>vm.runInContext(s,context);
  // All presentation tests provide explicit local fixtures; no network access.
  for(const sport of ['NFL','MLB','CFB','NCAAB'])run(`leagueStandings.data.set('${sport}',{season:{year:${sport==='NCAAB'?2027:2026}},sections:[],sourceUrl:'https://example.test',loadedAt:Date.now()})`);
  return {context,element,run,listeners};
}
test('league options follow homepage state, ordering and labels, then fall back without editing preferences',()=>{
  const h=harness();assert.deepEqual([...h.context.standingsSelectedSports()],['NFL','NCAAB']);
  h.context.renderLeagueStandings();
  assert.match(h.element('#ls-controls').innerHTML,/>NCAAM</);assert.doesNotMatch(h.element('#ls-controls').innerHTML,/Tennis|Soccer/);
  h.run("leagueStandings.sport='NCAAB';state.visibleSports.delete('NCAAB')");h.context.renderLeagueStandings();
  assert.equal(h.run('leagueStandings.sport'),'NFL');
  h.run('state.visibleSports.clear()');h.context.renderLeagueStandings();
  assert.match(h.element('#ls-content').innerHTML,/No sports selected/);assert.equal(h.run('state.visibleSports.size'),0);
  h.run("state.visibleSports.add('NFL')");h.context.renderLeagueStandings();
  assert.match(h.element('#ls-controls').innerHTML,/>NFL</);
  h.run('state.visibleSports.clear()');h.context.renderLeagueStandings();
  h.run("state.visibleSports.add('CFB')");h.context.renderLeagueStandings();
  assert.equal(h.run('leagueStandings.sport'),'CFB');assert.match(h.element('#ls-controls').innerHTML,/Conference Standings/);
});

test('four pro leagues toggle in-page playoff views without changing college selection or fetching data',()=>{
  const h=harness();h.context.initLeagueStandings();
  const click=view=>h.listeners.get('click')({target:{closest:selector=>selector==='[data-ls-view]'?{dataset:{lsView:view}}:null}});
  for(const sport of ['NFL','MLB','NBA','NHL']){
    h.run(`state.visibleSports.add('${sport}');leagueStandings.sport='${sport}';leagueStandings.data.set('${sport}',{season:{year:2026},sections:[],sourceUrl:'https://example.test'})`);
    h.context.renderLeagueStandings();
    assert.match(h.element('#ls-controls').innerHTML,/Playoff Picture/);
    click('playoffs');
    assert.match(h.element('#ls-controls').innerHTML,/data-ls-view="playoffs" aria-pressed="true"/);
    assert.match(h.element('#ls-content').innerHTML,/Playoff positions are not available/);
    click('standings');
    assert.match(h.element('#ls-content').innerHTML,/Standings have not been published/);
  }
  click('playoffs');
  h.run("leagueStandings.sport='NCAAB';leagueStandings.view='rankings';leagueStandings.polls.set('NCAAB',null)");
  h.context.renderLeagueStandings();
  assert.doesNotMatch(h.element('#ls-controls').innerHTML,/Playoff Picture/);
  assert.match(h.element('#ls-controls').innerHTML,/data-ls-view="rankings" aria-pressed="true"/);
  assert.equal(h.run('leagueStandings.requests.size'),0);
});
test('game row has correct away/home marker, local date, exact ID and shared current score',()=>{
  const h=harness();h.context.teamPageData.set('NFL:33',{team:{id:'33'},schedule:[fixtureRow('g','2026-11-10T01:00:00Z')]});
  h.context.games=[fixtureGame('g','live','2026-11-08T17:00:00Z',72)];
  let markup=h.context.standingsGameMarkup(team);
  assert.match(markup,/@ Opponent/);assert.match(markup,/data-ls-game="g"/);assert.match(markup,/data-ls-sport="NFL"/);
  assert.match(markup,/class="ls-game-kind">Live game/);
  assert.match(markup,/status-live/);assert.match(markup,/2026-11-08T17:00:00.000Z/);assert.match(markup,/>72:Live rating</);
  h.context.games=[{...h.context.games[0],score:88}];markup=h.context.standingsGameMarkup(team);
  assert.match(markup,/>88:Live rating</);assert.doesNotMatch(markup,/>72:Live rating</);
  h.context.games[0].teams.reverse();h.context.teamPageData.get('NFL:33').schedule[0].homeAway='home';
  assert.match(h.context.standingsGameMarkup(team),/vs Opponent/);
  h.context.games=[];
  assert.match(h.context.standingsGameMarkup(team),/class="ls-game-kind">Next game/);
});
test('missing ratings remain unavailable, while a real numeric zero is preserved',()=>{
  const h=harness();h.context.teamPageData.set('NFL:33',{team:{id:'33'},schedule:[]});
  for(const score of [null,undefined,'']){
    h.context.games=[fixtureGame('g','upcoming','2026-11-10T01:00:00Z',score)];
    if(score===undefined)h.context.games[0].score=undefined;
    assert.match(h.context.standingsGameMarkup(team),/Not yet rated/);
  }
  h.context.games[0].score=0;assert.match(h.context.standingsGameMarkup(team),/>0:Pregame rating</);
});
test('conference and poll rows share the same game resolver and exact navigation',()=>{
  const h=harness();h.context.teamPageData.set('NFL:33',{team:{id:'33'},schedule:[]});h.context.games=[fixtureGame('g')];
  const section={name:'Fixture',entries:[{...team,rank:1,record:'4-4'}]};
  const conference=h.context.standingsTable(section,'NFL'),poll=h.context.standingsTable(section,'NFL',true);
  const playoff=h.context.standingsTable({...section,playoff:true,entries:[{...section.entries[0],position:7}]},'NFL');
  const get=s=>s.match(/<button type="button" class="ls-game"[\s\S]*?<\/button>/)[0];
  assert.equal(get(conference),get(poll));
  assert.equal(get(conference),get(playoff));
  assert.match(playoff,/<span class="ls-rank" role="cell">7<\/span>/);
  const calls=[];h.context.openGameDetails=(...args)=>calls.push(args);h.context.initLeagueStandings();
  h.listeners.get('click')({target:{closest:selector=>selector==='[data-ls-game]'?{dataset:{lsGame:'g',lsSport:'NFL'}}:null}});
  assert.deepEqual(calls,[['g','NFL']]);
});
test('feature adds no independent refresh timer, scorer or preference persistence',()=>{
  assert.doesNotMatch(ui,/setInterval|setTimeout|rateGame\(|applyLiveSnapshot\(|localStorage\.setItem/);
  assert.match(app,/if \(isStandingsPage\)[\s\S]*?renderLeagueStandings\(\)/);
});
test('an open Game Center owns off-slate detail refresh without a duplicate standings request',()=>{
  const h=harness();let calls=0;
  h.context.teamPageData.set('NFL:33',{team:{id:'33'},schedule:[]});
  h.context.activeDetailGame=fixtureGame('detail','live','2026-11-08T17:00:00Z',91);
  h.context.fetchGameSummary=()=>{calls++;return Promise.reject(Error('unexpected duplicate'));};
  assert.match(h.context.standingsGameMarkup(team),/>91:Live rating</);
  assert.equal(calls,0);assert.equal(h.run('leagueStandings.detailRequests.size'),0);
});
test('off-slate summaries cannot introduce a rating or mismatched team/game identity',async()=>{
  const prior=global.fetch;
  const row=fixtureRow('123','2026-11-10T01:00:00Z');
  const payload={header:{id:'123',competitions:[{date:row.startTime,status:{type:{state:'pre'}},competitors:[
    {homeAway:'away',team:{id:'33',displayName:'Baltimore Ravens'}},{homeAway:'home',team:{id:'1',displayName:'Opponent'}}]}]}};
  global.fetch=async()=>({ok:true,json:async()=>payload});
  try{
    const summary=await data.loadScheduledSummary(row,team);
    assert.equal(summary.sportsRadarGame.id,'123');assert.equal(summary.sportsRadarGame.score,null);
    assert.equal(summary.sportsRadarGame.state,'upcoming');assert.equal(summary.sportsRadarGame.standingsUnrated,true);
    payload.header.competitions[0].status.type={completed:true,state:'in'};
    assert.equal((await data.loadScheduledSummary(row,team)).sportsRadarGame.state,'completed');
    payload.header.id='wrong';assert.equal(await data.loadScheduledSummary(row,team),null);
  }finally{global.fetch=prior;}
});
test('existing Game Center renders verified off-slate games without inventing a zero or explanation',()=>{
  let markup='';const context=vm.createContext({
    $:()=>({set innerHTML(value){markup=value;}}),safeText:v=>String(v??''),labelForSport:s=>s,
    teamLogoWithFallback:()=>'',teamLogoUrl:()=>'',isWatched:()=>false,watchKey:()=>'',orderedDetailSummary:(_game,s)=>s,
    compactClockPeriod:()=>'',displayLine:()=>({text:''}),broadcastWatchMarkup:()=>'',detailTabsMarkup:()=>'',
    scoreHeatClass:()=>'',scoreHueFor:()=>190,storylineDetails:()=>'',
    trendFor:()=>{throw Error('No trend for an unrated game');},
    explainRating:()=>{throw Error('No explanation for an unrated game');}
  });
  vm.runInContext(app.slice(app.indexOf('function renderDetailContent('),app.indexOf('async function fetchGameSummary(')),context);
  for(const state of ['upcoming','live']){
    context.renderDetailContent({...fixtureGame('g',state),score:null,standingsUnrated:true},null);
    assert.match(markup,/Not yet rated/);assert.match(markup,/Excitement unavailable/);assert.doesNotMatch(markup,/Why 0|Pregame rating 0/);
    assert.match(markup,/Baltimore Ravens vs Opponent/);
  }
});
test('published AP fallback follows provider availability week using its supported query fields',async()=>{
  const prior=global.fetch,urls=[];
  global.fetch=async url=>{urls.push(String(url));return {ok:true,json:async()=>urls.length===1
    ? {rankings:[{type:'usa'}],availableRankings:[{id:'1',seasonType:2,week:10}]}
    : {rankings:[{type:'ap',season:{year:2026},date:'2026-11-01',ranks:[{current:1,team:{id:'33'}}]}]}};};
  try{
    const poll=await data.loadPoll('CFB',{season:{year:2026},sections:[]});
    assert.match(urls[1],/seasons=2026&seasontypes=2&weeks=10/);assert.equal(poll.name,'AP Top 25');
  }finally{global.fetch=prior;}
});
test('the actual app starts directly on standings and its shared render updates selection without reload',()=>{
  const nodes=new Map();
  const element=selector=>{
    if(!nodes.has(selector)){
      const classes=new Set();
      nodes.set(selector,{innerHTML:'',textContent:'',value:selector==='#favorite-sport'?'NFL':'',
        classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n),toggle:(n,on)=>on?classes.add(n):classes.delete(n)},
        contains:()=>false,addEventListener(){},setAttribute(){},querySelectorAll:()=>[],focus(){}});
    }
    return nodes.get(selector);
  };
  const context=vm.createContext({console,queueMicrotask,AbortSignal,AbortController,
    document:{body:element('body'),querySelector:element,querySelectorAll:()=>[],addEventListener(){},hidden:false,activeElement:null},
    window:{addEventListener(){}},navigator:{},location:{hash:'#standings'},localStorage:{getItem:()=>null,setItem(){}},
    fetch:()=>new Promise(()=>{}),setTimeout:()=>1,clearTimeout(){},setInterval(){}});
  for(const file of ['sport-visibility.js','dist/scoring-runtime.js','tennis-coverage.js','league-standings-data.js','league-standings.js'])
    vm.runInContext(fs.readFileSync(require.resolve('../'+file),'utf8'),context);
  vm.runInContext(app,context);
  assert.equal(vm.runInContext('state.page',context),'standings');
  assert.match(element('#ls-controls').innerHTML,/>NFL</);
  assert.ok(element('body').classList.contains('standings-page-open'));
  assert.doesNotMatch(element('#ls-controls').innerHTML,/Tennis|Soccer/);
  vm.runInContext("state.visibleSports.clear();render()",context);
  assert.match(element('#ls-content').innerHTML,/No sports selected/);
  vm.runInContext("state.visibleSports.add('NCAAB');render()",context);
  assert.match(element('#ls-controls').innerHTML,/>NCAAM</);
  assert.match(element('#ls-controls').innerHTML,/National Rankings/);
});

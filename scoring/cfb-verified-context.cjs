// Manually reviewed primary-source facts, not AI output. No network or score
// overrides. New entries require evidence review and the slate/transition tests.
const DAY=86400000;
const VERSION='2026-11-04.cfb-context.1';
const REVIEWED_AT='2026-11-04T19:00:00Z';
const EFFECTIVE_FROM='2026-11-04T00:00:00Z';
const source=(url,title,publishedAt,evidence)=>({url,title,publishedAt,evidence,reviewedAt:REVIEWED_AT});
const sources={
  byu:source('https://byucougars.com/news/2026/11/2/byu-football-game-week-2026-at-utah','BYU game week at Utah','2026-11-02',
    'The November 7 visit to Utah is the first meeting of these rivals with both teams in the top ten.'),
  georgia:source('https://georgiadogs.com/news/2026/11/2/football-georgia-travels-to-oxford-to-take-on-ole-miss','Georgia travels to Oxford','2026-11-02',
    'The upcoming opponents last met in the January 2026 CFP quarterfinal; Ole Miss won 39-34.'),
  miami:source('https://miamihurricanes.com/news/2026/11/2/canes-rewind-a-look-back-at-the-win-over-north-carolina','Miami: Up Next, Notre Dame','2026-11-02',
    'The Up Next section identifies the longtime rivalry and the coming South Bend game. Miami won the 2025 meeting 27-24 and later received the final CFP at-large place ahead of Notre Dame.'),
  tennessee:source('https://utsports.com/news/2026/11/2/football-16-16-vols-ramping-up-for-rivalry-showdown-against-8-7-kentucky','Tennessee prepares for Kentucky rivalry','2026-11-02',
    'The November 7 rivalry game is meeting 122; only three previous meetings featured two ranked teams.'),
  cfp:source('https://collegefootballplayoff.com/news/2026/11/3/rankings','First CFP rankings of 2026','2026-11-03',
    'Kentucky is sixth, its highest position in CFP ranking history.'),
  army:source('https://goarmywestpoint.com/news/2025/12/17/army-football-to-open-2026-vs-bryant-all-12-opponents-set','Army announces 2026 opponents','2025-12-17',
    'Army hosts service-academy rival Air Force on November 7. The series has been annual since 1971. Army meets Navy on December 12.'),
  trophy:source('https://goarmywestpoint.com/documents/download/2025/10/28/Army_2025_Game_Notes__8__at_Air_Force.pdf','Army game notes: Commander-in-Chief\'s Trophy','2025-10-28',
    'Army, Navy and Air Force compete for the trophy in a round robin each season; Army-Navy is an established rivalry.'),
  oregon:source('https://goducks.com/news/2026/11/2/football-ducks-buckeyes-clash-in-columbus','Oregon visits Ohio State','2026-11-02',
    'The preview connects this meeting to Oregon\'s October 2024 win and Ohio State\'s January 2025 CFP quarterfinal victory, the most recent meeting.'),
  kiffin:source('https://lsusports.net/sports/fb/roster/season/2026/staff/lane-kiffin','LSU coach Lane Kiffin biography',null,
    'LSU lists Kiffin as head coach; he previously coordinated Alabama\'s offense from 2014 through 2016.'),
  texas:source('https://texaslonghorns.com/news/2025/12/11/footballs-2026-schedule-announced','Texas announces 2026 schedule','2025-12-11',
    'The November 7 trip to Missouri is Texas\' first visit to Columbia since 2011.')
};
// Team IDs are ESPN CFB identities. Historical membership alone can establish
// a rivalry; rankings, trophy-clinching scenarios and current personnel cannot.
const rivalries=[
  {key:'byu-utah',teams:['252','254'],sources:['byu'],text:'BYU and Utah renew their longstanding rivalry.'},
  {key:'miami-notre-dame',teams:['2390','87'],sources:['miami'],text:'Miami and Notre Dame renew their longstanding rivalry.'},
  {key:'kentucky-tennessee',teams:['96','2633'],sources:['tennessee'],text:'Kentucky and Tennessee renew their border rivalry.'},
  {key:'army-air-force',teams:['349','2005'],sources:['army','trophy'],text:'Army and Air Force renew a service-academy rivalry played annually since 1971, with a result in the Commander-in-Chief\'s Trophy series at stake.'},
  {key:'army-navy',teams:['349','2426'],sources:['army','trophy'],text:'Army and Navy renew their service-academy rivalry.'}
];
// New facts are tied to event ID, ordered opponents, date and an absolute expiry.
// Ranking history and coaching connections explain interest without extra points.
const events=[
  {id:'401856849',away:'252',home:'254',date:'2026-11-07',facts:[
    {key:'first-top-ten-holy-war',type:'rivalry',sources:['byu'],text:'BYU and Utah renew their rivalry in its first matchup with both teams ranked in the top ten.'}]},
  {id:'401856741',away:'61',home:'145',date:'2026-11-07',facts:[
    {key:'sugar-bowl-rematch',type:'playoff_rematch',previousSeason:2025,sources:['georgia'],text:'Georgia faces Ole Miss again after the Rebels ended its playoff run with a 39-34 CFP quarterfinal win in January 2026.'}]},
  {id:'401858291',away:'2390',home:'87',date:'2026-11-07',facts:[
    {key:'selection-rematch',type:'meaningful_rematch',previousSeason:2025,sources:['miami'],text:'Miami\'s 27-24 win over Notre Dame in 2025 became central to the CFP selection debate when Miami took the final at-large berth ahead of the Irish.'}]},
  {id:'401856745',away:'96',home:'2633',date:'2026-11-07',facts:[
    {key:'rare-ranked-border-rivalry',type:'rivalry',sources:['tennessee','cfp'],text:'Kentucky and Tennessee meet for the 122nd time and only the fourth with both ranked; Kentucky enters with its best-ever CFP ranking at No. 6.'}]},
  {id:'401858514',away:'2483',home:'194',date:'2026-11-07',facts:[
    {key:'older-rose-bowl-rematch',type:'meaningful_rematch',previousSeason:2024,sources:['oregon'],text:'Oregon and Ohio State meet for the first time since the Buckeyes won their January 2025 CFP quarterfinal, following Oregon\'s October 2024 victory.'}]},
  {id:'401856740',away:'333',home:'99',date:'2026-11-07',facts:[
    {key:'kiffin-alabama-background',type:'editorial_storyline',sources:['kiffin'],overlaps:['coach_return'],text:'LSU head coach Lane Kiffin previously served as Alabama\'s offensive coordinator from 2014 to 2016.'}]},
  {id:'401856743',away:'251',home:'142',date:'2026-11-07',facts:[
    {key:'columbia-return',type:'editorial_storyline',sources:['texas'],text:'Texas visits Missouri in Columbia for the first time since 2011.'}]}
].map(event=>({...event,expiresAt:'2026-11-08T12:30:00Z'}));
const REGISTRY={version:VERSION,effectiveFrom:EFFECTIVE_FROM,sources,rivalries,events};
const HOSTS=new Set(['byucougars.com','georgiadogs.com','miamihurricanes.com','utsports.com','collegefootballplayoff.com','goarmywestpoint.com','goducks.com','lsusports.net','texaslonghorns.com']);
const TYPES=new Set(['rivalry','playoff_rematch','meaningful_rematch','editorial_storyline']);
const pair=ids=>[...ids].map(String).sort().join(':');
const localDate=time=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
function validSource(s,now) {
  if(!s?.title||!s.evidence||s.evidence.length<20||!Number.isFinite(Date.parse(s.reviewedAt))||Date.parse(s.reviewedAt)>now)return false;
  if(s.publishedAt!==null&&(!Number.isFinite(Date.parse(s.publishedAt))||Date.parse(s.publishedAt)>Date.parse(s.reviewedAt)))return false;
  try {const u=new URL(s.url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&HOSTS.has(u.hostname)&&u.pathname.length>1;}catch{return false;}
}
function identity(game,now,registry) {
  const start=Date.parse(game?.startTime||'');
  const ids=(game?.teams||[]).map(t=>String(t.id||t[8]||''));
  if(game?.sport!=='CFB'||!['upcoming','live'].includes(game.state)||game.timingUncertain||
    !/^[\w-]+$/.test(String(game.id||''))||ids.length!==2||!ids[0]||!ids[1]||ids[0]===ids[1]||
    !Number.isFinite(start)||!Number.isFinite(now)||start<Date.parse(registry.effectiveFrom)||
    now<Date.parse(registry.effectiveFrom)||start>now+7*DAY||now>=start+12*3600000)return null;
  return {start,ids,date:localDate(start)};
}
function verifiedCfbContexts(game,now=Date.now(),registry=REGISTRY) {
  const match=identity(game,now,registry);if(!match)return [];
  const {start,ids,date}=match;
  const occasion=registry.events.find(e=>e.id===String(game.id)&&e.away===ids[0]&&e.home===ids[1]&&e.date===date&&
    Number.isFinite(Date.parse(e.expiresAt))&&now<Date.parse(e.expiresAt)&&Date.parse(e.expiresAt)<=start+24*3600000);
  const facts=[...(occasion?.facts||[]),...registry.rivalries.filter(r=>pair(r.teams)===pair(ids)).map(r=>({...r,type:'rivalry'}))];
  const accepted=[],seen=new Set();
  for(const fact of facts){
    if(!fact.key||!TYPES.has(fact.type)||!fact.text||!fact.sources?.length||fact.sources.some(id=>!validSource(registry.sources[id],now)))continue;
    // Full playoff credit is reserved for the immediately preceding season.
    // Older (at most two seasons) rematches require a current event review.
    const season=Number(date.slice(0,4));
    if(fact.type==='playoff_rematch'&&fact.previousSeason!==season-1)continue;
    if(fact.type==='meaningful_rematch'&&(!Number.isInteger(fact.previousSeason)||season-fact.previousSeason<1||season-fact.previousSeason>2))continue;
    if(seen.has(fact.type))continue;seen.add(fact.type);
    const evidence=fact.sources.map(id=>registry.sources[id]),primary=evidence[0];
    accepted.push({type:fact.type,text:fact.text,verified:true,confidence:1,
      ...(fact.type==='editorial_storyline'?{editorialOnly:true}:{}),
      sourceTitle:primary.title,sourceUrl:primary.url,sourceDescription:primary.evidence,publishedAt:primary.publishedAt,
      evidenceKind:'reviewed-historical',registryVersion:registry.version,factKey:fact.key,
      eventId:String(game.id),teamIds:ids,eventDate:date,reviewedAt:primary.reviewedAt,
      expiresAt:new Date(Math.min(start+12*3600000,occasion?Date.parse(occasion.expiresAt):Infinity)).toISOString(),
      evidence,overlaps:fact.overlaps||[]});
  }
  return accepted;
}
function verifiedCfbContextEligible(story,game,now=Date.now()) {
  if(story?.registryVersion!==VERSION||story.verified!==true)return false;
  return verifiedCfbContexts(game,now).some(f=>f.factKey===story.factKey&&f.type===story.type&&f.text===story.text&&
    f.eventId===story.eventId&&pair(f.teamIds)===pair(story.teamIds||[])&&f.eventDate===story.eventDate&&
    f.sourceUrl===story.sourceUrl&&f.expiresAt===story.expiresAt&&JSON.stringify(f.evidence)===JSON.stringify(story.evidence));
}
function mergeCfbContexts(game,discovered=[],now=Date.now()) {
  const reviewed=verifiedCfbContexts(game,now);
  if(!reviewed.length)return discovered;
  const types=new Set(reviewed.map(f=>f.type)),overlaps=new Set(reviewed.flatMap(f=>f.overlaps));
  if(reviewed.some(f=>['playoff_rematch','meaningful_rematch'].includes(f.type)))
    for(const type of ['championship_rematch','playoff_rematch','meaningful_rematch'])overlaps.add(type);
  const accepted=[...reviewed];
  for(const fact of discovered){
    if(fact.registryVersion||types.has(fact.type)||overlaps.has(fact.type))continue;
    accepted.push(fact);types.add(fact.type);
  }
  return accepted;
}
function cfbResearchPriority(game,now=Date.now()) {return verifiedCfbContexts(game,now).some(f=>!f.editorialOnly);}
module.exports={REGISTRY,validSource,verifiedCfbContexts,verifiedCfbContextEligible,mergeCfbContexts,cfbResearchPriority};

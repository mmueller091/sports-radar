const FAVORITE_MATCHES = ['ravens', 'orioles', 'capitals'];
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const HOME_SPORTS = ['NFL','MLB','NHL','CFB','NBA','NCAAB','Tennis'];
const SPORT_LABELS = {NFL:'NFL',MLB:'MLB',NHL:'NHL',CFB:'College football',NBA:'NBA',NCAAB:'NCAA basketball',Tennis:'Tennis',Soccer:'Soccer'};
const SPORT_PATHS = {NFL:'football/nfl',MLB:'baseball/mlb',NHL:'hockey/nhl',CFB:'football/college-football',NBA:'basketball/nba',NCAAB:'basketball/mens-college-basketball',Tennis:'tennis/atp',Soccer:'soccer/eng.1'};
const PREFERENCES_KEY = 'sports-radar-preferences-v2';
const LINES_KEY = 'sports-radar-last-pregame-lines-v1';
const LIVE_FEEDS = [
  {sport:'NFL', url:`${ESPN_BASE}/football/nfl/scoreboard`},
  {sport:'MLB', url:`${ESPN_BASE}/baseball/mlb/scoreboard`},
  {sport:'NHL', url:`${ESPN_BASE}/hockey/nhl/scoreboard`},
  {sport:'CFB', division:'FBS', url:`${ESPN_BASE}/football/college-football/scoreboard?groups=80`, limit:500},
  {sport:'CFB', division:'FCS', url:`${ESPN_BASE}/football/college-football/scoreboard?groups=81`, limit:500},
  {sport:'NBA', url:`${ESPN_BASE}/basketball/nba/scoreboard`},
  {sport:'NCAAB', url:`${ESPN_BASE}/basketball/mens-college-basketball/scoreboard`},
  {sport:'Soccer', url:`${ESPN_BASE}/soccer/eng.1/scoreboard`},
  {sport:'Soccer', url:`${ESPN_BASE}/soccer/uefa.champions/scoreboard`},
  {sport:'Tennis', url:`${ESPN_BASE}/tennis/atp/scoreboard`}
];
const LEAGUE_LOGOS = {
  NFL:'https://a.espncdn.com/i/leaguelogos/500/nfl.png', MLB:'https://a.espncdn.com/i/leaguelogos/500/mlb.png', NHL:'https://a.espncdn.com/i/leaguelogos/500/nhl.png', CFB:'https://a.espncdn.com/i/leaguelogos/500/ncaaf.png', NBA:'https://a.espncdn.com/i/leaguelogos/500/nba.png', NCAAB:'https://a.espncdn.com/i/leaguelogos/500/ncaab.png', Tennis:'https://a.espncdn.com/i/leaguelogos/500/atp.png', Soccer:'https://a.espncdn.com/i/leaguelogos/500/soccer.png'
};
const DEMO_GAMES = [
  {id:'ravens-browns',favorite:true,sport:'NFL',state:'live',status:'Q3 · 04:18',channel:'ESPN',teams:[['Baltimore Ravens','BAL','17','red'],['Cleveland Browns','CLE','13','brown']],context:'Ravens driving • red zone',sub:'Baltimore, MD',score:84,signal:'HOT'},
  {id:'orioles-yankees',favorite:true,sport:'MLB',state:'live',status:'7th inning',channel:'MASN',teams:[['Baltimore Orioles','BAL','4','orange'],['New York Yankees','NYY','3','black']],context:'One-run game • 2 outs',sub:'Bronx, NY',score:78,signal:'RISING'},
  {id:'capitals-devils',favorite:true,sport:'NHL',state:'upcoming',status:'Tonight · 7:30 PM',channel:'Monumental Sports Network',teams:[['Washington Capitals','WSH','—','red'],['New Jersey Devils','NJD','—','red']],context:'Division matchup',sub:'Washington, DC',score:66,signal:'WATCH'},
  {id:'chiefs-bills',sport:'NFL',state:'live',status:'Q4 · 02:51',channel:'CBS',teams:[['Kansas City Chiefs','KC','24','red'],['Buffalo Bills','BUF','27','blue']],context:'Bills up 3 • 4th down',sub:'Orchard Park, NY',score:92,signal:'HOT'},
  {id:'mets-dodgers',sport:'MLB',state:'live',status:'9th inning',channel:'TBS',teams:[['New York Mets','NYM','5','blue'],['Los Angeles Dodgers','LAD','5','blue']],context:'Tied in the 9th',sub:'Los Angeles, CA',score:89,signal:'HOT'},
  {id:'alabama-georgia',sport:'CFB',state:'upcoming',status:'Sat · 3:30 PM',channel:'CBS',teams:[['Alabama','ALA','—','red'],['Georgia','UGA','—','black']],context:'#4 vs #7 • SEC showdown',sub:'Athens, GA',score:86,signal:'CAN’T MISS'},
  {id:'leafs-habs',sport:'NHL',state:'upcoming',status:'Tonight · 7:00 PM',channel:'ESPN+',teams:[['Toronto Maple Leafs','TOR','—','blue'],['Montreal Canadiens','MTL','—','red']],context:'Original Six rivalry',sub:'Montreal, QC',score:73,signal:'WATCH'},
  {id:'astros-tigers',sport:'MLB',state:'completed',status:'Final',channel:'MLB Network',teams:[['Houston Astros','HOU','2','orange'],['Detroit Tigers','DET','1','blue']],context:'Low-scoring thriller',sub:'Detroit, MI',score:61,signal:'REPLAY'},
  {id:'wta-final',sport:'Tennis',state:'upcoming',status:'Tomorrow · 11:00 AM',channel:'Tennis Channel',teams:[['WTA Finals • SF','SF','—','purple'],['Singapore','SGP','—','green']],context:'Quarterfinal draw',sub:'Singapore',score:68,signal:'WATCH'},
  {id:'eagles-cowboys',sport:'NFL',state:'completed',status:'Final',channel:'FOX',teams:[['Philadelphia Eagles','PHI','31','green'],['Dallas Cowboys','DAL','28','blue']],context:'OT finish • instant classic',sub:'Arlington, TX',score:87,signal:'REPLAY'},
  {id:'ucla-usc',sport:'CFB',state:'upcoming',status:'Sat · 8:00 PM',channel:'FOX',teams:[['UCLA','UCLA','—','blue'],['USC','USC','—','gold']],context:'Rivalry game • LA',sub:'Los Angeles, CA',score:64,signal:'WATCH'},
  {id:'bruins-rangers',sport:'NHL',state:'completed',status:'Final',channel:'ESPN',teams:[['Boston Bruins','BOS','4','gold'],['New York Rangers','NYR','2','blue']],context:'Boston controls late',sub:'New York, NY',score:54,signal:'REPLAY'},
  {id:'arsenal-city',sport:'Soccer',state:'live',status:'2nd half · 71’',channel:'NBC, Peacock',teams:[['Arsenal','ARS','1','red'],['Man City','MCI','1','blue']],context:'EPL • level late',sub:'London, UK',score:90,signal:'HOT'},
  {id:'bayern-real',sport:'Soccer',state:'upcoming',status:'Wed · 3:00 PM',channel:'Paramount+',teams:[['Bayern Munich','FCB','—','red'],['Real Madrid','RMA','—','white']],context:'Champions League • QF',sub:'Munich, DE',score:88,signal:'CAN’T MISS'}
];
let games = [...DEMO_GAMES];
function readPreferences() { try { return JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}'); } catch { return {}; } }
const savedPreferences = readPreferences();
const savedSports = Array.isArray(savedPreferences.visibleSports) ? savedPreferences.visibleSports.filter(sport => HOME_SPORTS.includes(sport)) : HOME_SPORTS;
const state = {page:location.hash === '#soccer' ? 'soccer' : 'home', sport:'all', gameState:'all', showFCS:savedPreferences.showFCS !== false, visibleSports:new Set(savedSports), source:'demo'};
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
function persistPreferences() { try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify({visibleSports:[...state.visibleSports],showFCS:state.showFCS})); } catch {} }
function syncFCSFilter() { const chip = $('#fcs-toggle'); chip.textContent = state.showFCS ? 'FCS: On' : 'FCS: Off'; chip.classList.toggle('active',state.showFCS); chip.setAttribute('aria-pressed',String(state.showFCS)); }
function syncSportToggles() { $$('[data-visible-sport]').forEach(input => { input.checked = state.visibleSports.has(input.dataset.visibleSport); }); }
function labelForSport(sport) { return SPORT_LABELS[sport] || sport; }
function iconFor(sport) { return ({NFL:'◈',MLB:'◉',NHL:'✧',CFB:'◆',NBA:'●',NCAAB:'◇',Tennis:'◌',Soccer:'⊙'})[sport] || '✦'; }
function teamLogoUrl(sport, abbreviation) { const league = ({NFL:'nfl',MLB:'mlb',NHL:'nhl',CFB:'college-football',NBA:'nba',NCAAB:'mens-college-basketball',Tennis:'tennis',Soccer:'soccer'})[sport] || sport.toLowerCase(); return `https://a.espncdn.com/i/teamlogos/${league}/500/${String(abbreviation).toLowerCase()}.png`; }
function summaryUrlFor(sport, eventId) { return `${ESPN_BASE}/${SPORT_PATHS[sport] || SPORT_PATHS.NFL}/summary?event=${encodeURIComponent(eventId)}`; }
const SPORT_BASE = {NFL:38,MLB:38,NHL:35,CFB:36,NBA:37,NCAAB:35,Tennis:38,Soccer:35};
const CLOSE_MARGIN = {NFL:14,MLB:3,NHL:3,CFB:14,NBA:12,NCAAB:12,Tennis:3,Soccer:3};
function clampScore(value) { return Math.max(1,Math.min(99,Math.round(value))); }
function factorText(factors,score) { const parts = factors.map(factor => `${factor.label} ${factor.points > 0 ? '+' : ''}${factor.points}`); if (factors.reduce((sum,item) => sum + item.points,0) > 99 && score === 99) parts.push('capped at 99'); return parts.join(' · '); }
function favoriteFor(teams) { return teams.some(team => FAVORITE_MATCHES.some(match => team.name.toLowerCase().includes(match))); }
function sameLocalDay(value) { if (!value) return false; return new Date(value).toLocaleDateString() === new Date().toLocaleDateString(); }
function hideStaleFavorite(game) { return Boolean(game.favorite && game.state === 'completed' && (!game.startTime || !sameLocalDay(game.startTime))); }
function stateFromEvent(event) { const type = event.competitions?.[0]?.status?.type; if (type?.completed || type?.state === 'post') return 'completed'; if (type?.state === 'in') return 'live'; return 'upcoming'; }
function scoreValue(competitor) { const value = Number(competitor.score); return Number.isFinite(value) ? String(value) : '—'; }
function broadcastFor(competition) {
  const values = [];
  const add = value => { if (typeof value === 'string' && value.trim()) values.push(value.trim()); };
  (competition?.broadcasts || []).forEach(broadcast => { (broadcast.names || []).forEach(add); add(broadcast.name); add(broadcast.shortName); });
  (competition?.geoBroadcasts || []).forEach(broadcast => { add(broadcast.media?.shortName); add(broadcast.media?.name); add(broadcast.type?.shortName); });
  return [...new Set(values)].slice(0, 2).join(' · ');
}
function recordFor(competitor) {
  const records = competitor?.records || competitor?.team?.records || [];
  const overall = records.find(item => /overall|total/i.test(`${item.type || ''} ${item.name || ''} ${item.abbreviation || ''}`)) || records[0];
  return overall?.summary || competitor?.record?.summary || (typeof competitor?.record === 'string' ? competitor.record : '');
}
function rankFor(competitor, sport) {
  if (!['CFB','NCAAB'].includes(sport)) return null;
  const rank = Number(competitor?.curatedRank?.current ?? competitor?.team?.rank);
  return Number.isFinite(rank) && rank >= 1 && rank <= 25 ? rank : null;
}
function parseLine(raw, competition, sport) {
  if (!raw) return null;
  const listed = raw.close || raw.closing || raw;
  const totalValue = listed.overUnder ?? listed.over_under ?? listed.total?.overUnder ?? listed.total?.value;
  const total = totalValue == null || totalValue === '' ? NaN : Number(totalValue);
  const details = String(listed.details || listed.displayValue || '').trim();
  const isMoneyline = /[+-]\d{3,}\b/.test(details) && !/[+-]\d+\.\d+/.test(details);
  let spread = isMoneyline ? '' : String(listed.spread?.displayValue || details).trim();
  if (!spread && listed.spread != null && Number.isFinite(Number(listed.spread)) && (!isMoneyline || Math.abs(Number(listed.spread)) <= 10)) {
    const amount = Math.abs(Number(listed.spread));
    const home = (competition?.competitors || []).find(team => team.homeAway === 'home');
    const away = (competition?.competitors || []).find(team => team.homeAway === 'away');
    const favored = listed.homeTeamOdds?.favorite ? home : listed.awayTeamOdds?.favorite ? away : null;
    if (favored) spread = amount === 0 ? 'PK' : `${favored.team?.abbreviation || favored.abbreviation || 'Favorite'} -${amount}`;
  }
  if (!spread && !details && !Number.isFinite(total)) return null;
  return {spread:spread || '',moneyline:isMoneyline ? details : '',total:Number.isFinite(total) ? total : null,provider:listed.provider?.name || raw.provider?.name || '',verifiedClose:Boolean(raw.close || raw.closing)};
}
function lineFromSummary(summary, sport) {
  const competition = summary?.header?.competitions?.[0];
  return parseLine(summary?.pickcenter?.[0] || competition?.odds?.[0] || summary?.odds?.[0],competition,sport);
}
function readLineSnapshots() { try { return JSON.parse(localStorage.getItem(LINES_KEY) || '{}'); } catch { return {}; } }
let lineSnapshots = readLineSnapshots();
function rememberPregameLine(game) {
  if (game.state !== 'upcoming' || !game.line) return;
  lineSnapshots[game.id] = {line:game.line,capturedAt:Date.now()};
  const entries = Object.entries(lineSnapshots).sort((a,b) => b[1].capturedAt - a[1].capturedAt).slice(0,200);
  lineSnapshots = Object.fromEntries(entries);
  try { localStorage.setItem(LINES_KEY,JSON.stringify(lineSnapshots)); } catch {}
}
function displayLine(game) {
  const line = game.line || lineSnapshots[game.id]?.line;
  if (!line) return {label:game.state === 'upcoming' ? 'Current line' : 'Pregame line',text:'Not listed'};
  const pieces = [line.spread ? `${game.sport === 'NHL' ? 'Puck line' : game.sport === 'MLB' ? 'Run line' : 'Spread'} ${line.spread}` : '',line.moneyline ? `Moneyline ${line.moneyline}` : '',line.total !== null ? `O/U ${line.total}` : ''].filter(Boolean);
  const label = game.state === 'upcoming' ? 'Current line' : line.verifiedClose ? 'Closing line' : 'Last listed pregame line';
  return {label,text:pieces.join(' · '),provider:line.provider};
}
function eventSignalText(event, competition, context) { return [event?.name,event?.shortName,(competition?.notes || []).map(note => note.headline).join(' '),competition?.series?.summary,competition?.series?.title,competition?.series?.type,event?.season?.type?.name,event?.season?.type?.slug,event?.season?.slug,context].filter(Boolean).join(' ').toLowerCase(); }
function pregameRating(sport,event,competition,context) {
  const detail = eventSignalText(event,competition,context);
  const factors = [{label:'Sport baseline',points:SPORT_BASE[sport] || 35}];
  let reason = 'Regular-season matchup · no extra stakes listed';
  if (/world series/.test(detail)) { factors.push({label:'World Series',points:42}); reason = 'World Series championship'; }
  else if (/super bowl|stanley cup final|champions league final|national championship|grand slam final/.test(detail)) { factors.push({label:'Championship',points:40}); reason = 'Championship game'; }
  else if (/conference final|league final|finals|championship|title game/.test(detail)) { factors.push({label:'Final round',points:30}); reason = 'Final-round stakes'; }
  else if (/playoff|postseason|wild card|divisional round|quarterfinal|semifinal|knockout/.test(detail) || Number(event?.season?.type?.id ?? event?.season?.type) === 3) { factors.push({label:'Postseason',points:22}); reason = 'Postseason game'; }
  else if (sport === 'Tennis' && /wimbledon|australian open|french open|roland garros|us open/.test(detail)) { factors.push({label:'Major tournament',points:18}); reason = 'Tennis major'; }
  if (factors.length > 1 && /game\s*1\b|game one\b|g1\b/.test(detail)) { factors.push({label:'Series opener',points:5}); reason += ' · Game 1'; }
  const competitors = competition?.competitors || [];
  const ranks = competitors.map(item => Number(item.curatedRank?.current || item.team?.rank)).filter(rank => rank > 0 && rank <= 25);
  if (ranks.length === 2) {
    factors.push({label:'Two ranked teams',points:sport === 'CFB' ? 28 : 9});
    if (sport === 'CFB') {
      if (ranks.every(rank => rank <= 20)) factors.push({label:'Both top 20',points:4});
      if (ranks.some(rank => rank <= 10)) factors.push({label:'Top 10 team',points:5});
      const records = competitors.map(recordFor).map(value => String(value).match(/^(\d+)-(\d+)/));
      if (records.every(match => match && Number(match[1]) > Number(match[2]))) factors.push({label:'Both winning records',points:3});
      if (records.some(match => match && Number(match[1]) >= 4 && Number(match[2]) === 0)) factors.push({label:'Unbeaten team',points:4});
    }
    reason += ' · two ranked teams';
  }
  else if (ranks.length === 1) { factors.push({label:'Ranked team',points:sport === 'CFB' ? 11 : 4}); if (sport === 'CFB' && ranks[0] <= 10) factors.push({label:'Top 10 team',points:5}); reason += ' · ranked team'; }
  if (/rivalry|rival\b|derby/.test(detail)) { factors.push({label:'Rivalry',points:7}); reason += ' · rivalry'; }
  return {score:clampScore(factors.reduce((sum,item) => sum + item.points,0)),factors,reason};
}
function gameProgress(sport,competition) {
  const status = competition?.status || {};
  const period = Number(status.period || 0);
  const total = ({NFL:4,CFB:4,NHL:3,NBA:4,NCAAB:2,MLB:9,Soccer:2,Tennis:3})[sport] || 4;
  if (!period) return 0;
  if (sport === 'MLB') return Math.min(1,period / total);
  const length = ({NFL:15,CFB:15,NHL:20,NBA:12,NCAAB:20,Soccer:45})[sport];
  const clock = String(status.displayClock || '').match(/^(\d+):(\d+)/);
  const remaining = clock && length ? Math.min(length * 60,Number(clock[1]) * 60 + Number(clock[2])) : length ? length * 30 : 0;
  return Math.max(0,Math.min(1,((period - 1) + (length ? 1 - remaining / (length * 60) : .5)) / total));
}
function rateGame(sport,gameState,teams,event,competition,context) {
  const opening = pregameRating(sport,event,competition,context);
  const factors = opening.factors.map(item => ({...item}));
  if (gameState === 'upcoming') return {...opening,openingScore:opening.score};
  const values = teams.map(team => Number(team.score)).filter(Number.isFinite);
  const gap = values.length === 2 ? Math.abs(values[0] - values[1]) : null;
  const closeLimit = CLOSE_MARGIN[sport] || 10;
  const close = gap === null ? 0 : Math.max(0,1 - gap / closeLimit);
  const progress = gameState === 'completed' ? 1 : gameProgress(sport,competition);
  const closePoints = gameState === 'completed' ? Math.round(28 * close) : Math.round(24 * close * (.35 + .65 * progress));
  if (closePoints) factors.push({label:gameState === 'completed' ? 'Final margin' : 'Score closeness',points:closePoints});
  if (gap !== null && gap >= closeLimit && progress > .3) factors.push({label:'Wide margin',points:-Math.min(26,Math.round((gap / closeLimit) * 13 * progress))});
  const phasePoints = gameState === 'completed' ? 15 : Math.round(progress * 14);
  if (phasePoints) factors.push({label:gameState === 'completed' ? 'Reached final' : 'Game progress',points:phasePoints});
  const detail = `${competition?.status?.type?.detail || ''} ${competition?.status?.type?.shortDetail || ''}`;
  if (gameState === 'completed' && /overtime|\bot\b/i.test(detail)) factors.push({label:'Overtime',points:13});
  const score = clampScore(factors.reduce((sum,item) => sum + item.points,0));
  let reason = opening.reason;
  const unit = sport === 'NHL' || sport === 'Soccer' ? 'goal' : sport === 'MLB' ? 'run' : sport === 'Tennis' ? 'set' : 'point';
  if (gameState === 'live') reason = gap === 0 ? `Tied ${teams[0].score}–${teams[1].score}${progress > .65 ? ' late' : ''}` : gap !== null && closePoints > 0 ? `${gap}-${unit} game${progress > .65 ? ' late' : ''}` : `Game in progress · ${Math.round(progress * 100)}% elapsed`;
  if (gameState === 'completed') reason = /overtime|\bot\b/i.test(detail) ? `Overtime finish · ${gap}-${unit} margin` : gap !== null ? `Decided by ${gap} ${unit}${gap === 1 ? '' : 's'}` : 'Final result';
  return {score,factors,reason,openingScore:opening.score};
}
function normalizeEvent(event, sport, leagueLogo, division) {
  const competition = event.competitions?.[0]; const competitors = competition?.competitors || []; if (competitors.length < 2) return null;
  const teams = competitors.slice(0,2).map(competitor => ({name:competitor.team?.displayName || competitor.athlete?.displayName || 'Unknown', shortName:competitor.team?.shortDisplayName || competitor.team?.name || competitor.athlete?.shortName || '', abbr:competitor.team?.abbreviation || competitor.abbreviation || '', score:scoreValue(competitor), logo:competitor.team?.logo || '', color:'white',record:recordFor(competitor),rank:rankFor(competitor,sport)}));
  const gameState = stateFromEvent(event); const status = competition?.status?.type?.shortDetail || competition?.status?.type?.detail || (gameState === 'completed' ? 'Final' : 'Scheduled'); const context = competition?.notes?.[0]?.headline || event.name || `${sport} matchup`; const rating = rateGame(sport,gameState,teams,event,competition,context); const eventId = event.id || `${sport}-${event.name}`;
  return {id:eventId,summaryUrl:summaryUrlFor(sport,eventId),favorite:favoriteFor(teams),sport,division,icon:iconFor(sport),leagueLogo:leagueLogo || LEAGUE_LOGOS[sport],startTime:event.date,state:gameState,status,channel:broadcastFor(competition) || 'Channel not listed',teams:teams.map(team => [team.name,team.abbr,team.score,team.color,team.logo,team.record,team.rank,team.shortName]),line:gameState === 'upcoming' ? parseLine(competition?.odds?.[0],competition,sport) : null,context,why:rating.reason,sub:competition?.venue?.fullName || competition?.venue?.address?.city || 'Live scoreboard',score:rating.score,openingScore:rating.openingScore,factors:rating.factors};
}
async function fetchFeed(feed) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 7000); try { const url = new URL(feed.url); url.searchParams.set('limit',String(feed.limit || 100)); const response = await fetch(url, {signal:controller.signal,cache:'no-store'}); if (!response.ok) throw new Error(`HTTP ${response.status}`); const payload = await response.json(); const leagueLogo = payload.leagues?.[0]?.logos?.[0]?.href; const events = (payload.events || []).map(event => normalizeEvent(event,feed.sport,leagueLogo,feed.division)).filter(Boolean); events.forEach(rememberPregameLine); return events; } finally { clearTimeout(timer); } }
function dedupeGames(items) { const unique = new Map(); for (const game of items) { const key = `${game.sport}:${game.id}`; const existing = unique.get(key); if (!existing || game.division === 'FCS') unique.set(key,game); } return [...unique.values()]; }
async function loadLiveGames() { $('#data-status-label').textContent = 'Connecting to live scoreboards…'; const results = await Promise.allSettled(LIVE_FEEDS.map(fetchFeed)); const liveGames = dedupeGames(results.flatMap(result => result.status === 'fulfilled' ? result.value : [])); if (liveGames.length) { games = liveGames; state.source = 'live'; } else { games = [...DEMO_GAMES]; state.source = 'demo'; } $('#data-status-label').textContent = state.source === 'live' ? `Live scores · updated ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : 'Demo data · live feed unavailable'; $('#footer-status').textContent = state.source === 'live' ? 'Live feed' : 'Demo data'; render(); if (state.source === 'live') enrichGameSignals(); }
function safeText(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])); }
function teamMarkup(game, team) { const logo = team[4] || teamLogoUrl(game.sport, team[1]); return `<span class="team-name"><img class="team-logo" src="${safeText(logo)}" alt="" loading="lazy" onerror="this.style.display='none'">${team[6] ? `<b class="team-rank">#${safeText(team[6])}</b>` : ''}<span class="team-name-text"><span class="full-team-name">${safeText(team[0])}</span><span class="short-team-name">${safeText(team[7] || team[0])}</span></span>${team[5] ? `<small class="team-record">${safeText(team[5])}</small>` : ''}</span>`; }
function explainRating(game) {
  if (!game.factors?.length) return game.context || 'The live feed has not supplied a detailed rating explanation.';
  const labels = new Set(game.factors.map(item => item.label));
  if (game.state === 'upcoming') {
    if (labels.has('World Series')) return `Game 1 of the World Series brings championship stakes, so this starts at ${game.score} before the first pitch.`;
    if (labels.has('Championship')) return `This is a championship matchup, so the stakes put it at ${game.score} before play begins.`;
    if (labels.has('Final round')) return `A place in the final round is at stake, which puts this matchup at ${game.score} before play.`;
    if (labels.has('Postseason')) return `It's a postseason game, so its stakes put it at ${game.score} before play begins.`;
    if (labels.has('Major tournament')) return `This match is part of a tennis major, so it starts at ${game.score} before play.`;
    const ranked = game.teams.filter(team => team[6]);
    if (ranked.length === 2) return `Both teams are ranked (${ranked.map(team => `No. ${team[6]}`).join(' and ')}). ${labels.has('Unbeaten team') ? 'One is unbeaten, adding to the anticipation. ' : ''}This strong matchup starts at ${game.score} before kickoff; no game action is counted yet.`;
    if (ranked.length === 1) return `With No. ${ranked[0][6]} ${ranked[0][0]} in the matchup, this regular-season game starts at ${game.score} before play.`;
    if (labels.has('Rivalry')) return `A listed rivalry adds to the anticipation, putting this matchup at ${game.score} before play.`;
    return `No championship, playoff, or ranked-team stakes are listed for this matchup, so it starts at ${game.score} before play.`;
  }
  const why = String(game.why || '').replaceAll(' · ', ', ').replace(/^[a-z]/,character => character.toUpperCase());
  const moment = game.moment?.replace(/^Decisive play:\s*/,'The decisive play was ').replace(/^Recent score:\s*/,'The latest scoring play was ');
  if (game.state === 'completed') {
    const ending = labels.has('Wide margin') ? 'The wider margin keeps the rating down.' : labels.has('Overtime') ? 'Overtime adds to the rating.' : 'The close finish raises the rating.';
    return `${why}. ${moment ? `${moment}. ` : ''}${ending}`;
  }
  const action = labels.has('Score closeness') ? 'The close score and how late it is lift the rating.' : labels.has('Wide margin') ? 'The widening gap pulls the rating down.' : 'Its rating reflects how far along the game is.';
  return `${why}. ${moment ? `${moment}. ` : ''}${action}`;
}
function trendFor(game) {
  if (game.state === 'upcoming' || !Number.isFinite(game.openingScore)) return '';
  const delta = game.score - game.openingScore;
  const arrow = delta > 2 ? '↗' : delta < -2 ? '↘' : '→';
  return `<small class="score-trend" aria-label="${delta >= 0 ? 'Up' : 'Down'} ${Math.abs(delta)} points from the opening rating">${arrow} ${delta > 0 ? '+' : ''}${delta} vs start</small>`;
}
function gameCard(game) {
  const scoreClass = game.score >= 85 ? 'hot' : game.score >= 70 ? 'warm' : '';
  const stateLabel = game.state === 'live' ? '<span class="status-live">● LIVE</span>' : `<span class="status-${game.state}">${safeText(game.status)}</span>`;
  const leagueLogo = game.leagueLogo || LEAGUE_LOGOS[game.sport];
  const line = displayLine(game);
  return `<button type="button" class="game-card ${game.favorite ? 'favorite' : ''}" data-id="${safeText(game.id)}" data-division="${safeText(game.division || '')}" aria-label="Open details for ${safeText(game.teams[0][0])} versus ${safeText(game.teams[1][0])}"><span class="sport-icon"><img class="league-logo" src="${safeText(leagueLogo)}" alt="" loading="lazy" onerror="this.style.display='none'"></span><span class="team-column"><span class="match-meta">${stateLabel}${game.division ? `<span>•</span><span>${safeText(game.division)}</span>` : ''}<span>•</span><span>${safeText(game.sub)}</span></span><span class="team-row">${teamMarkup(game,game.teams[0])}<b class="team-score">${safeText(game.teams[0][2])}</b></span><span class="team-row">${teamMarkup(game,game.teams[1])}<b class="team-score">${safeText(game.teams[1][2])}</b></span></span><span class="game-context"><strong>Why ${game.score}?</strong><span>${safeText(explainRating(game))}</span></span><span class="game-context channel-context"><strong>Watch on</strong><span>${safeText(game.channel || 'Channel not listed')}</span><strong class="line-label">${safeText(line.label)}</strong><span class="line-value">${safeText(line.text)}</span><span class="stats-cue">Tap for stats ›</span></span><span class="excitement"><span class="score-circle ${scoreClass}">${game.score}</span>${trendFor(game)}</span></button>`;
}
function detailStats(summary) { const teams = summary?.boxscore?.teams || []; return teams.map(team => { const stats = (team.statistics || []).filter(stat => stat.displayValue && stat.displayValue !== '0').slice(0, 6); if (!stats.length) return ''; return `<div class="detail-stat-team"><strong>${safeText(team.team?.displayName || 'Team stats')}</strong>${stats.map(stat => `<div><span>${safeText(stat.label || stat.displayName || stat.name)}</span><b>${safeText(stat.displayValue)}</b></div>`).join('')}</div>`; }).join(''); }
function detailLeaders(summary) { const groups = summary?.leaders || []; const rows = groups.flatMap(group => (group.leaders || []).filter(leader => leader.athlete?.displayName || leader.athlete?.shortName).slice(0,1).map(leader => `<div><span>${safeText(group.displayName || group.name || 'Leader')}</span><b>${safeText(leader.athlete?.displayName || leader.athlete?.shortName)} · ${safeText(leader.displayValue || leader.value || '')}</b></div>`)).slice(0,6); return rows.length ? `<section class="detail-section"><h3>Leaders</h3><div class="detail-leaders">${rows.join('')}</div></section>` : ''; }
function detailPlays(summary) { const plays = (summary?.scoringPlays?.length ? summary.scoringPlays : summary?.plays || []).slice(-6).reverse(); return plays.length ? `<section class="detail-section"><h3>${summary?.scoringPlays?.length ? 'Scoring plays' : 'Recent play-by-play'}</h3><ul class="detail-plays">${plays.map(play => `<li><span>${safeText(play.clock?.displayValue || play.period?.displayValue || '')}</span>${safeText(play.text || play.shortText || play.type?.text || 'Play recorded')}</li>`).join('')}</ul></section>` : ''; }
function statKey(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function athleteName(entry) { return entry?.athlete?.displayName || entry?.athlete?.fullName || entry?.athlete?.shortName || entry?.player?.displayName || entry?.player?.fullName || 'Player'; }
function findStatIndex(labels, aliases, fallback) { const normalized = (labels || []).map(statKey); const wanted = [...(aliases || [])].map(statKey); const found = normalized.findIndex(label => wanted.includes(label)); return found >= 0 ? found : fallback; }
function statValue(entry, column, index) { const stats = entry?.stats ?? entry?.values ?? []; if (Array.isArray(stats)) return stats[index] ?? '—'; const keys = Object.keys(stats || {}); const aliases = [column.title, ...(column.aliases || [])].map(statKey); const key = keys.find(item => aliases.includes(statKey(item))); return key ? stats[key] : '—'; }
function playerTable(group, columns, title) { const athletes = group?.athletes || group?.players || []; if (!athletes.length) return ''; const labels = group.labels || group.headers || []; return `<div class="detail-player-group"><h4>${safeText(title)}</h4><div class="detail-table-scroll"><table class="detail-player-table"><thead><tr><th>Player</th>${columns.map(column => `<th>${safeText(column.title)}</th>`).join('')}</tr></thead><tbody>${athletes.map(entry => `<tr><th scope="row">${safeText(athleteName(entry))}</th>${columns.map((column,index) => `<td>${safeText(statValue(entry,column,findStatIndex(labels,column.aliases,index)))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`; }
function detailPlayerStats(summary, sport) { const blocks = summary?.boxscore?.players || []; if (!blocks.length || !['NFL','CFB','NHL'].includes(sport)) return ''; const teamSections = blocks.map(block => { const teamName = block.team?.displayName || block.team?.shortDisplayName || 'Team'; const statGroups = block.statistics || []; if (sport === 'NHL') { const skaters = statGroups.filter(group => (group.athletes || group.players || []).length && !/goalie|goaltender/i.test(`${group.name || ''} ${group.displayName || ''}`)); const columns = [{title:'S',aliases:['shots','shots on goal','s']},{title:'G',aliases:['goals','g']},{title:'A',aliases:['assists','a']},{title:'+/-',aliases:['plus minus','plusminus','+/-']},{title:'PIM',aliases:['pim','penalty minutes']}]; return skaters.length ? `<div class="detail-player-team"><strong>${safeText(teamName)}</strong>${skaters.map(group => playerTable(group,columns,group.displayName || group.name || 'Skaters')).join('')}</div>` : ''; } const groups = statGroups.filter(group => /pass|rush|receiv/i.test(`${group.name || ''} ${group.displayName || ''}`)); return groups.length ? `<div class="detail-player-team"><strong>${safeText(teamName)}</strong>${groups.map(group => { const athletes = group.athletes || group.players || []; const labels = Array.isArray(group.labels) && group.labels.length ? group.labels : Object.keys(athletes[0]?.stats || {}); const columns = labels.map(label => ({title:label,aliases:[label]})); return playerTable(group,columns,group.displayName || group.name || 'Player stats'); }).join('')}</div>` : ''; }).filter(Boolean); return teamSections.length ? `<section class="detail-section"><h3>${sport === 'NHL' ? 'Player stats · Skaters' : 'Player stats · Passing, rushing & receiving'}</h3><div class="detail-player-grid">${teamSections.join('')}</div></section>` : ''; }
function renderDetailContent(game, summary, loading = false) {
  if (loading) { $('#game-detail-content').innerHTML = `<div class="detail-loading">Loading live game details…</div>`; return; }
  const competition = summary?.header?.competitions?.[0];
  const competitors = competition?.competitors || [];
  const title = competitors.length >= 2 ? `${competitors[0].team?.displayName || competitors[0].athlete?.displayName || game.teams[0][0]} vs ${competitors[1].team?.displayName || competitors[1].athlete?.displayName || game.teams[1][0]}` : `${game.teams[0][0]} vs ${game.teams[1][0]}`;
  const scores = competitors.length >= 2 ? competitors.map(team => `<div class="detail-team"><img src="${safeText(team.team?.logo || teamLogoUrl(game.sport,team.team?.abbreviation || ''))}" alt="" onerror="this.style.display='none'"><span>${safeText(team.team?.displayName || team.athlete?.displayName || 'Team')}</span><b>${safeText(team.score || '—')}</b></div>`).join('') : game.teams.map(team => `<div class="detail-team"><img src="${safeText(team[4] || teamLogoUrl(game.sport,team[1]))}" alt="" onerror="this.style.display='none'"><span>${safeText(team[0])}</span><b>${safeText(team[2])}</b></div>`).join('');
  const status = competition?.status?.type?.detail || game.status;
  const venue = competition?.venue?.fullName || game.sub;
  const fallback = !summary ? `<p class="detail-empty">The live summary feed did not return additional stats for this game yet. The score, rating explanation, and broadcast are still current.</p>` : '';
  $('#game-detail-content').innerHTML = `<div class="detail-kicker">${safeText(labelForSport(game.sport))} · ${safeText(status)}</div><h2>${safeText(title)}</h2><div class="detail-scoreboard">${scores}</div><div class="detail-meta"><span>📍 ${safeText(venue)}</span><span>📺 ${safeText(game.channel || 'Channel not listed')}</span></div><section class="detail-section"><h3>Why ${game.score}?</h3><p class="detail-explanation">${safeText(explainRating(game))}</p></section>${detailLeaders(summary)}${detailStats(summary) ? `<section class="detail-section"><h3>Team stats</h3><div class="detail-stat-grid">${detailStats(summary)}</div></section>` : ''}${detailPlayerStats(summary,game.sport)}${detailPlays(summary)}${fallback}`;
}
async function fetchGameSummary(game) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(),7000); try { const response = await fetch(game.summaryUrl || summaryUrlFor(game.sport,game.id),{cache:'no-store',signal:controller.signal}); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); } finally { clearTimeout(timer); } }
function showDialog(dialog) { if (!dialog) return; if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open',''); }
function hideDialog(dialog) { if (!dialog) return; if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }
function showGameDetails() { const overlay = $('#game-detail-overlay'); overlay.hidden = false; document.body.classList.add('detail-open'); overlay.querySelector('.close-dialog')?.focus(); }
function hideGameDetails() { const overlay = $('#game-detail-overlay'); overlay.hidden = true; document.body.classList.remove('detail-open'); }
async function openGameDetails(id) { const game = games.find(item => item.id === id); if (!game) return; renderDetailContent(game,null,true); showGameDetails(); try { renderDetailContent(game,await fetchGameSummary(game)); } catch { renderDetailContent(game,null); } }
function compactPlay(play) { const text = String(play?.text || play?.shortText || play?.type?.text || '').replace(/\s+/g,' ').trim(); return text.length > 86 ? `${text.slice(0,83)}…` : text; }
function summarySpecificWhy(game,summary) {
  const plays = summary?.scoringPlays || [];
  const finalPlay = plays[plays.length - 1];
  const finalText = compactPlay(finalPlay);
  const clock = finalPlay?.clock?.displayValue || '';
  if (game.state === 'completed' && /(0:00|last second|game[- ]winning)/i.test(`${clock} ${finalText}`) && finalText) return `Decisive play: ${finalText}`;
  if (game.state === 'live') {
    const situation = summary?.header?.competitions?.[0]?.situation;
    if ((game.sport === 'NFL' || game.sport === 'CFB') && situation?.down) return `${situation.down}${situation.distance ? ` and ${situation.distance}` : ''}${situation.clock ? ` · ${situation.clock} left` : ''}`;
    const recent = plays[plays.length - 1];
    if (recent && /goal|touchdown|home run|grand slam|lead|match point|walk.off/i.test(compactPlay(recent))) return `Recent score: ${compactPlay(recent)}`;
  }
  return '';
}
async function enrichGameSignals() {
  const candidates = games.filter(game => (game.state !== 'upcoming' || !game.line) && !(game.division === 'FCS' && game.state === 'upcoming')).sort((a,b) => Number(b.favorite) - Number(a.favorite) || Number(b.state === 'live') - Number(a.state === 'live') || b.score - a.score).slice(0,60);
  let changed = false;
  for (let start = 0; start < candidates.length; start += 6) {
    await Promise.allSettled(candidates.slice(start,start + 6).map(async game => {
    try {
      const summary = await fetchGameSummary(game);
      const line = lineFromSummary(summary,game.sport);
      if (line && (game.state !== 'upcoming' || !game.line)) { game.line = line; changed = true; if (game.state === 'upcoming') rememberPregameLine(game); }
      const moment = summarySpecificWhy(game,summary);
      if (moment) { game.moment = moment; changed = true; }
      if (game.state !== 'completed') return;
      const plays = summary.scoringPlays || [];
      const last = plays[plays.length - 1];
      const finalText = `${last?.clock?.displayValue || ''} ${compactPlay(last)}`;
      if (/(0:00|last second|game[- ]winning)/i.test(finalText) && /field goal|goal|home run|touchdown/i.test(finalText)) {
        game.factors.push({label:'Decisive last play',points:14});
        game.score = clampScore(game.score + 14);
        changed = true;
      }
      let leadChanges = 0;
      let previousLead = 0;
      for (const play of plays) {
        const home = Number(play.homeScore);
        const away = Number(play.awayScore);
        if (!Number.isFinite(home) || !Number.isFinite(away)) continue;
        const lead = Math.sign(home - away);
        if (lead && previousLead && lead !== previousLead) leadChanges++;
        if (lead) previousLead = lead;
      }
      if (leadChanges) { const points = Math.min(8,leadChanges * 2); game.factors.push({label:`${leadChanges} lead change${leadChanges === 1 ? '' : 's'}`,points}); game.score = clampScore(game.score + points); changed = true; }
    } catch {}
    }));
    if (changed) { render(); changed = false; }
  }
}
function render() { const isSoccer = state.page === 'soccer'; $('#section-title').textContent = isSoccer ? 'Soccer radar' : 'Your radar'; $$('.nav-link').forEach(link => link.classList.toggle('active',link.dataset.page === state.page)); $$('.soccer-chip').forEach(chip => chip.classList.toggle('hidden',!isSoccer)); $('#fcs-toggle').classList.toggle('hidden',isSoccer || !state.visibleSports.has('CFB')); if (!isSoccer && state.sport !== 'all' && !state.visibleSports.has(state.sport)) { state.sport = 'all'; $$('.sport-chip[data-sport]').forEach(chip => chip.classList.toggle('active',chip.dataset.sport === 'all')); } let visible = games.filter(game => !hideStaleFavorite(game) && (isSoccer ? game.sport === 'Soccer' : game.sport !== 'Soccer' && state.visibleSports.has(game.sport) && (state.showFCS || game.division !== 'FCS'))); if (state.sport !== 'all') visible = visible.filter(game => game.sport === state.sport); if (state.gameState !== 'all') visible = visible.filter(game => game.state === state.gameState); visible.sort((a,b) => Number(b.favorite) - Number(a.favorite) || b.score - a.score); $('#game-list').innerHTML = visible.map(gameCard).join(''); $('#empty-state').classList.toggle('hidden',visible.length !== 0); $('#live-count').textContent = `${visible.filter(game => game.state === 'live').length} LIVE`; $('#all-count').textContent = visible.length; }
$$('.nav-link').forEach(link => link.addEventListener('click', () => { state.page = link.dataset.page; state.sport = 'all'; location.hash = state.page === 'soccer' ? 'soccer' : 'home'; $$('.sport-chip[data-sport]').forEach(chip => chip.classList.toggle('active',chip.dataset.sport === 'all')); render(); }));
window.addEventListener('hashchange', () => { state.page = location.hash === '#soccer' ? 'soccer' : 'home'; render(); });
$$('.sport-chip[data-sport]').forEach(chip => chip.addEventListener('click', () => { state.sport = chip.dataset.sport; $$('.sport-chip[data-sport]').forEach(item => item.classList.toggle('active',item === chip)); render(); }));
$('#fcs-toggle').addEventListener('click', () => { state.showFCS = !state.showFCS; persistPreferences(); syncFCSFilter(); render(); });
$$('.seg').forEach(tab => tab.addEventListener('click', () => { state.gameState = tab.dataset.state; $$('.seg').forEach(item => item.classList.toggle('active',item === tab)); render(); }));
$('#refresh-button').addEventListener('click',loadLiveGames); $('#refresh-data').addEventListener('click',loadLiveGames);
function wireDialog(id,opener) { const dialog = $(id); const trigger = opener ? $(opener) : null; if (!dialog) return; if (trigger) trigger.addEventListener('click',() => showDialog(dialog)); dialog.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click',() => hideDialog(dialog))); }
wireDialog('#preferences-dialog','#profile-button'); wireDialog('#data-dialog','#data-info');
let lastTouchOpen = 0;
let touchStart = null;
$('#game-list').addEventListener('pointerdown',event => { if (event.pointerType === 'touch') touchStart = {x:event.clientX,y:event.clientY,id:event.target.closest('.game-card')?.dataset.id}; });
$('#game-list').addEventListener('pointerup',event => {
  if (event.pointerType !== 'touch' || !touchStart) return;
  const moved = Math.hypot(event.clientX - touchStart.x,event.clientY - touchStart.y);
  const id = event.target.closest('.game-card')?.dataset.id;
  if (id && id === touchStart.id && moved < 12) { lastTouchOpen = Date.now(); openGameDetails(id); }
  touchStart = null;
});
$('#game-list').addEventListener('pointercancel',() => { touchStart = null; });
$('#game-list').addEventListener('click',event => { if (Date.now() - lastTouchOpen < 600) return; const card = event.target.closest('.game-card'); if (card) openGameDetails(card.dataset.id); });
$('#game-detail-overlay').addEventListener('click',event => { if (event.target === event.currentTarget || event.target.closest('.close-dialog')) hideGameDetails(); });
document.addEventListener('keydown',event => { if (event.key === 'Escape' && !$('#game-detail-overlay').hidden) hideGameDetails(); });
syncSportToggles(); syncFCSFilter(); $('#profile-button').addEventListener('click', syncSportToggles); $$('[data-visible-sport]').forEach(input => input.addEventListener('change', () => { const sport = input.dataset.visibleSport; if (input.checked) state.visibleSports.add(sport); else state.visibleSports.delete(sport); persistPreferences(); render(); }));
let deferredInstallPrompt; window.addEventListener('beforeinstallprompt',event => { event.preventDefault(); deferredInstallPrompt = event; $('#install-button').classList.remove('hidden'); }); $('#install-button').addEventListener('click',async() => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('#install-button').classList.add('hidden'); }); window.addEventListener('appinstalled',() => $('#install-button').classList.add('hidden'));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?rev=20261020-15').then(registration => registration.update()).catch(() => {});
render(); loadLiveGames(); setInterval(loadLiveGames,60000);

const FAVORITE_MATCHES = ['ravens', 'orioles', 'capitals'];
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const LIVE_FEEDS = [
  {sport:'NFL', url:`${ESPN_BASE}/football/nfl/scoreboard`},
  {sport:'MLB', url:`${ESPN_BASE}/baseball/mlb/scoreboard`},
  {sport:'NHL', url:`${ESPN_BASE}/hockey/nhl/scoreboard`},
  {sport:'CFB', url:`${ESPN_BASE}/football/college-football/scoreboard`},
  {sport:'Soccer', url:`${ESPN_BASE}/soccer/eng.1/scoreboard`},
  {sport:'Soccer', url:`${ESPN_BASE}/soccer/uefa.champions/scoreboard`},
  {sport:'Tennis', url:`${ESPN_BASE}/tennis/atp/scoreboard`}
];
const LEAGUE_LOGOS = {
  NFL:'https://a.espncdn.com/i/leaguelogos/500/nfl.png', MLB:'https://a.espncdn.com/i/leaguelogos/500/mlb.png', NHL:'https://a.espncdn.com/i/leaguelogos/500/nhl.png', CFB:'https://a.espncdn.com/i/leaguelogos/500/ncaaf.png', Tennis:'https://a.espncdn.com/i/leaguelogos/500/atp.png', Soccer:'https://a.espncdn.com/i/leaguelogos/500/soccer.png'
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
const state = {page:location.hash === '#soccer' ? 'soccer' : 'home', sport:'all', gameState:'all', spoilers:true, source:'demo'};
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
function iconFor(sport) { return ({NFL:'◈',MLB:'◉',NHL:'✧',CFB:'◆',Tennis:'◌',Soccer:'⊙'})[sport] || '✦'; }
function teamLogoUrl(sport, abbreviation) { const league = ({NFL:'nfl',MLB:'mlb',NHL:'nhl',CFB:'college-football',Tennis:'tennis',Soccer:'soccer'})[sport] || sport.toLowerCase(); return `https://a.espncdn.com/i/teamlogos/${league}/500/${String(abbreviation).toLowerCase()}.png`; }
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
function excitementFor(sport, gameState, teams) { const values = teams.map(team => Number(team.score)).filter(Number.isFinite); const close = values.length === 2 ? Math.max(0, 1 - Math.abs(values[0] - values[1]) / Math.max(5, Math.max(...values))) : .55; const late = gameState === 'live' ? .18 : gameState === 'upcoming' ? .08 : .02; const sportBoost = {NFL:.08,MLB:.06,NHL:.07,CFB:.09,Tennis:.07,Soccer:.06}[sport] || .04; return Math.max(22, Math.min(98, Math.round(35 + close * 40 + late * 40 + sportBoost * 20))); }
function excitementExplanation(sport, gameState, teams, status, competition, context) {
  const values = teams.map(team => Number(team.score)).filter(Number.isFinite);
  const gap = values.length === 2 ? Math.abs(values[0] - values[1]) : null;
  const detail = `${status} ${competition?.status?.type?.detail || ''} ${competition?.status?.type?.shortDetail || ''}`.toLowerCase();
  const situation = competition?.situation || {};
  const reasons = [];
  if (gameState === 'live') {
    if (gap === 0) reasons.push('Tied game');
    else if (gap !== null && ((sport === 'NFL' || sport === 'CFB') ? gap <= 8 : (sport === 'MLB' || sport === 'NHL' || sport === 'Soccer') ? gap <= 1 : gap <= 2)) reasons.push(sport === 'NHL' || sport === 'Soccer' ? 'One-goal game' : 'Close margin');
    if (sport === 'NFL' && situation.down) reasons.push(`${situation.down}${situation.distance ? ` down with ${situation.distance} to go` : ' down'}${situation.clock ? `, ${situation.clock} left` : ''}`);
    if (sport === 'MLB' && (situation.inning || situation.outs !== undefined)) reasons.push(`${situation.inning ? `Inning ${situation.inning}` : 'Late pressure'}${situation.outs !== undefined ? ` · ${situation.outs} out${situation.outs === 1 ? '' : 's'}` : ''}`);
    if (/(4th|fourth|9th|ninth|overtime|ot|match point|end of|late)/i.test(detail)) reasons.push('Late-game leverage');
    if (context && /red zone|power play|bases loaded|match point|break point|rally/i.test(context)) reasons.push(context);
  } else if (gameState === 'upcoming') {
    if (context && /rival|derby|classic|championship|final|semi|quarter|playoff|division|sec|big ten|top/i.test(context)) reasons.push('High-stakes matchup');
    reasons.push(sport === 'Tennis' ? 'Tournament-round pressure' : 'Pregame matchup context');
  } else {
    if (gap === 0) reasons.push('Finished tied before the final result');
    else if (gap !== null && ((sport === 'NFL' || sport === 'CFB') ? gap <= 8 : gap <= 1)) reasons.push('Stayed within one score');
    if (/(overtime|ot|late|final)/i.test(detail)) reasons.push('High-leverage finish');
  }
  return [...new Set(reasons)].slice(0, 2).join(' · ') || (gameState === 'live' ? 'Live action is driving the signal' : gameState === 'upcoming' ? 'The matchup is drawing a strong pregame signal' : 'The finish created a notable replay');
}
function normalizeEvent(event, sport, leagueLogo) {
  const competition = event.competitions?.[0]; const competitors = competition?.competitors || []; if (competitors.length < 2) return null;
  const teams = competitors.slice(0,2).map(competitor => ({name:competitor.team?.displayName || competitor.athlete?.displayName || 'Unknown', abbr:competitor.team?.abbreviation || competitor.abbreviation || '', score:scoreValue(competitor), logo:competitor.team?.logo || '', color:'white'}));
  const gameState = stateFromEvent(event); const status = competition?.status?.type?.shortDetail || competition?.status?.type?.detail || (gameState === 'completed' ? 'Final' : 'Scheduled'); const score = excitementFor(sport, gameState, teams); const context = competition?.notes?.[0]?.headline || event.name || `${sport} matchup`;
  return {id:event.id || `${sport}-${event.name}`,favorite:favoriteFor(teams),sport,icon:iconFor(sport),leagueLogo:leagueLogo || LEAGUE_LOGOS[sport],startTime:event.date,state:gameState,status,channel:broadcastFor(competition) || 'Channel not listed',teams:teams.map(team => [team.name,team.abbr,team.score,team.color,team.logo]),context,why:excitementExplanation(sport,gameState,teams,status,competition,context),sub:competition?.venue?.fullName || competition?.venue?.address?.city || 'Live scoreboard',score,signal:score >= 85 ? 'HOT' : score >= 70 ? 'RISING' : gameState === 'completed' ? 'REPLAY' : 'WATCH'};
}
async function fetchFeed(feed) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 7000); try { const response = await fetch(`${feed.url}?limit=100`, {signal:controller.signal,cache:'no-store'}); if (!response.ok) throw new Error(`HTTP ${response.status}`); const payload = await response.json(); const leagueLogo = payload.leagues?.[0]?.logos?.[0]?.href; return (payload.events || []).map(event => normalizeEvent(event,feed.sport,leagueLogo)).filter(Boolean); } finally { clearTimeout(timer); } }
async function loadLiveGames() { $('#data-status-label').textContent = 'Connecting to live scoreboards…'; const results = await Promise.allSettled(LIVE_FEEDS.map(fetchFeed)); const liveGames = results.flatMap(result => result.status === 'fulfilled' ? result.value : []); if (liveGames.length) { games = liveGames; state.source = 'live'; } else { games = [...DEMO_GAMES]; state.source = 'demo'; } $('#data-status-label').textContent = state.source === 'live' ? `Live scores · updated ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : 'Demo data · live feed unavailable'; $('#footer-status').textContent = state.source === 'live' ? 'Live feed' : 'Demo data'; render(); }
function displayScore(team) { return state.spoilers ? team[2] : (team[2] === '—' ? '—' : '••'); }
function safeText(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])); }
function teamMarkup(game, team) { const logo = team[4] || teamLogoUrl(game.sport, team[1]); return `<span class="team-name"><img class="team-logo" src="${safeText(logo)}" alt="" loading="lazy" onerror="this.style.display='none'"><span>${safeText(team[0])}</span></span>`; }
function gameCard(game) { const scoreClass = game.score >= 85 ? 'hot' : game.score >= 70 ? 'warm' : ''; const stateLabel = game.state === 'live' ? '<span class="status-live">● LIVE</span>' : `<span class="status-${game.state}">${safeText(game.status)}</span>`; const leagueLogo = game.leagueLogo || LEAGUE_LOGOS[game.sport]; return `<article class="game-card ${game.favorite ? 'favorite' : ''}" data-id="${safeText(game.id)}"><div class="sport-icon"><img class="league-logo" src="${safeText(leagueLogo)}" alt="${safeText(game.sport)} league" loading="lazy" onerror="this.style.display='none'"><small>${safeText(game.sport)}</small></div><div class="team-column"><div class="match-meta">${stateLabel}<span>•</span><span>${safeText(game.sub)}</span></div><div class="team-row">${teamMarkup(game,game.teams[0])}<b class="team-score ${!state.spoilers?'score-hidden':''}">${displayScore(game.teams[0])}</b></div><div class="team-row">${teamMarkup(game,game.teams[1])}<b class="team-score ${!state.spoilers?'score-hidden':''}">${displayScore(game.teams[1])}</b></div></div><div class="game-context"><strong>Why it's exciting</strong><span>${safeText(game.why || game.context)}</span><div class="sparkline">${Array.from({length:8},(_,i)=>`<i style="height:${Math.max(5,Math.round((game.score-30)/7)+((i*7)%11))}px"></i>`).join('')}</div></div><div class="game-context"><strong>Watch on</strong><span>${safeText(game.channel || 'Channel not listed')}</span></div><div class="excitement"><div class="score-circle ${scoreClass}">${state.spoilers ? game.score : '—'}</div><small>${game.signal}</small></div></article>`; }
function render() { const isSoccer = state.page === 'soccer'; $('#section-title').textContent = isSoccer ? 'Soccer radar' : 'Your radar'; $$('.nav-link').forEach(link => link.classList.toggle('active',link.dataset.page === state.page)); $$('.soccer-chip').forEach(chip => chip.classList.toggle('hidden',!isSoccer)); let visible = games.filter(game => !hideStaleFavorite(game) && (isSoccer ? game.sport === 'Soccer' : game.sport !== 'Soccer')); if (state.sport !== 'all') visible = visible.filter(game => game.sport === state.sport); if (state.gameState !== 'all') visible = visible.filter(game => game.state === state.gameState); visible.sort((a,b) => Number(b.favorite) - Number(a.favorite) || b.score - a.score); $('#game-list').innerHTML = visible.map(gameCard).join(''); $('#empty-state').classList.toggle('hidden',visible.length !== 0); $('#live-count').textContent = `${visible.filter(game => game.state === 'live').length} LIVE`; $('#all-count').textContent = visible.length; $('#spoiler-label').textContent = state.spoilers ? 'Spoilers on' : 'Spoiler-aware'; $('#spoiler-notice').classList.toggle('hidden',!state.spoilers); }
$$('.nav-link').forEach(link => link.addEventListener('click', () => { state.page = link.dataset.page; state.sport = 'all'; location.hash = state.page === 'soccer' ? 'soccer' : 'home'; $$('.sport-chip').forEach(chip => chip.classList.toggle('active',chip.dataset.sport === 'all')); render(); }));
window.addEventListener('hashchange', () => { state.page = location.hash === '#soccer' ? 'soccer' : 'home'; render(); });
$$('.sport-chip').forEach(chip => chip.addEventListener('click', () => { state.sport = chip.dataset.sport; $$('.sport-chip').forEach(item => item.classList.toggle('active',item === chip)); render(); }));
$$('.seg').forEach(tab => tab.addEventListener('click', () => { state.gameState = tab.dataset.state; $$('.seg').forEach(item => item.classList.toggle('active',item === tab)); render(); }));
$('#spoiler-toggle').addEventListener('click', () => { state.spoilers = !state.spoilers; render(); }); $('#dismiss-notice').addEventListener('click', () => $('#spoiler-notice').classList.add('hidden')); $('#refresh-button').addEventListener('click',loadLiveGames); $('#refresh-data').addEventListener('click',loadLiveGames);
function wireDialog(id,opener) { const dialog = $(id); const trigger = $(opener); if (!dialog || !trigger) return; trigger.addEventListener('click',() => dialog.showModal()); dialog.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click',() => dialog.close())); }
wireDialog('#preferences-dialog','#profile-button'); wireDialog('#data-dialog','#data-info');
let deferredInstallPrompt; window.addEventListener('beforeinstallprompt',event => { event.preventDefault(); deferredInstallPrompt = event; $('#install-button').classList.remove('hidden'); }); $('#install-button').addEventListener('click',async() => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('#install-button').classList.add('hidden'); }); window.addEventListener('appinstalled',() => $('#install-button').classList.add('hidden'));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
render(); loadLiveGames(); setInterval(loadLiveGames,60000);

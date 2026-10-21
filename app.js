const FAVORITE_MATCHES = ['ravens', 'orioles', 'capitals'];
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const LIVE_FEEDS = [
  { sport: 'NFL', url: `${ESPN_BASE}/football/nfl/scoreboard` },
  { sport: 'MLB', url: `${ESPN_BASE}/baseball/mlb/scoreboard` },
  { sport: 'NHL', url: `${ESPN_BASE}/hockey/nhl/scoreboard` },
  { sport: 'CFB', url: `${ESPN_BASE}/football/college-football/scoreboard` },
  { sport: 'Soccer', url: `${ESPN_BASE}/soccer/eng.1/scoreboard` },
  { sport: 'Soccer', url: `${ESPN_BASE}/soccer/uefa.champions/scoreboard` },
  { sport: 'Tennis', url: `${ESPN_BASE}/tennis/atp/scoreboard` }
];

const DEMO_GAMES = [
  {id:'ravens-browns',favorite:true,sport:'NFL',icon:'◈',state:'live',status:'Q3 · 04:18',teams:[['Baltimore Ravens','BAL','17','red'],['Cleveland Browns','CLE','13','brown']],context:'Ravens driving • red zone',sub:'Baltimore, MD',score:84,signal:'HOT'},
  {id:'orioles-yankees',favorite:true,sport:'MLB',icon:'◉',state:'live',status:'7th inning',teams:[['Baltimore Orioles','BAL','4','orange'],['New York Yankees','NYY','3','black']],context:'One-run game • 2 outs',sub:'Bronx, NY',score:78,signal:'RISING'},
  {id:'capitals-devils',favorite:true,sport:'NHL',icon:'✧',state:'upcoming',status:'Tonight · 7:30 PM',teams:[['Washington Capitals','WSH','—','red'],['New Jersey Devils','NJD','—','red']],context:'Division matchup',sub:'Washington, DC',score:66,signal:'WATCH'},
  {id:'chiefs-bills',sport:'NFL',icon:'◈',state:'live',status:'Q4 · 02:51',teams:[['Kansas City Chiefs','KC','24','red'],['Buffalo Bills','BUF','27','blue']],context:'Bills up 3 • 4th down',sub:'Orchard Park, NY',score:92,signal:'HOT'},
  {id:'mets-dodgers',sport:'MLB',icon:'◉',state:'live',status:'9th inning',teams:[['New York Mets','NYM','5','blue'],['Los Angeles Dodgers','LAD','5','blue']],context:'Tied in the 9th',sub:'Los Angeles, CA',score:89,signal:'HOT'},
  {id:'alabama-georgia',sport:'CFB',icon:'◆',state:'upcoming',status:'Sat · 3:30 PM',teams:[['Alabama','ALA','—','red'],['Georgia','UGA','—','black']],context:'#4 vs #7 • SEC showdown',sub:'Athens, GA',score:86,signal:'CAN’T MISS'},
  {id:'leafs-habs',sport:'NHL',icon:'✧',state:'upcoming',status:'Tonight · 7:00 PM',teams:[['Toronto Maple Leafs','TOR','—','blue'],['Montreal Canadiens','MTL','—','red']],context:'Original Six rivalry',sub:'Montreal, QC',score:73,signal:'WATCH'},
  {id:'astros-tigers',sport:'MLB',icon:'◉',state:'completed',status:'Final',teams:[['Houston Astros','HOU','2','orange'],['Detroit Tigers','DET','1','blue']],context:'Low-scoring thriller',sub:'Detroit, MI',score:61,signal:'REPLAY'},
  {id:'wta-final',sport:'Tennis',icon:'◌',state:'upcoming',status:'Tomorrow · 11:00 AM',teams:[['WTA Finals • SF','SF','—','purple'],['Singapore','SGP','—','green']],context:'Quarterfinal draw',sub:'Singapore',score:68,signal:'WATCH'},
  {id:'eagles-cowboys',sport:'NFL',icon:'◈',state:'completed',status:'Final',teams:[['Philadelphia Eagles','PHI','31','green'],['Dallas Cowboys','DAL','28','blue']],context:'OT finish • instant classic',sub:'Arlington, TX',score:87,signal:'REPLAY'},
  {id:'ucla-usc',sport:'CFB',icon:'◆',state:'upcoming',status:'Sat · 8:00 PM',teams:[['UCLA','UCLA','—','blue'],['USC','USC','—','gold']],context:'Rivalry game • LA',sub:'Los Angeles, CA',score:64,signal:'WATCH'},
  {id:'bruins-rangers',sport:'NHL',icon:'✧',state:'completed',status:'Final',teams:[['Boston Bruins','BOS','4','gold'],['New York Rangers','NYR','2','blue']],context:'Boston controls late',sub:'New York, NY',score:54,signal:'REPLAY'},
  {id:'arsenal-city',sport:'Soccer',icon:'⊙',state:'live',status:'2nd half · 71’',teams:[['Arsenal','ARS','1','red'],['Man City','MCI','1','blue']],context:'EPL • level late',sub:'London, UK',score:90,signal:'HOT'},
  {id:'bayern-real',sport:'Soccer',icon:'⊙',state:'upcoming',status:'Wed · 3:00 PM',teams:[['Bayern Munich','FCB','—','red'],['Real Madrid','RMA','—','white']],context:'Champions League • QF',sub:'Munich, DE',score:88,signal:'CAN’T MISS'}
];

let games = [...DEMO_GAMES];
const state = {page: location.hash === '#soccer' ? 'soccer' : 'home', sport:'all', gameState:'all', spoilers:true, source:'demo'};
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function formatDate() { return new Intl.DateTimeFormat('en-US', {month:'short', day:'numeric', year:'numeric'}).format(new Date()).toUpperCase(); }
function iconFor(sport) { return ({NFL:'◈', MLB:'◉', NHL:'✧', CFB:'◆', Tennis:'◌', Soccer:'⊙'})[sport] || '✦'; }
function colorFor(team, sport) { const text = `${team} ${sport}`.toLowerCase(); if (text.includes('ravens') || text.includes('orioles') || text.includes('capitals')) return 'red'; if (text.includes('yankees') || text.includes('rangers') || text.includes('real madrid')) return 'blue'; return 'white'; }
function favoriteFor(teams) { return teams.some(team => FAVORITE_MATCHES.some(match => team.name.toLowerCase().includes(match))); }
function stateFromEvent(event) { const type = event.competitions?.[0]?.status?.type; if (type?.completed || type?.state === 'post') return 'completed'; if (type?.state === 'in') return 'live'; return 'upcoming'; }
function scoreValue(competitor) { const value = Number(competitor.score); return Number.isFinite(value) ? String(value) : '—'; }
function excitementFor(sport, gameState, teams) {
  const values = teams.map(team => Number(team.score)).filter(Number.isFinite);
  const close = values.length === 2 ? Math.max(0, 1 - Math.abs(values[0] - values[1]) / Math.max(5, Math.max(...values))) : .55;
  const late = gameState === 'live' ? .18 : gameState === 'upcoming' ? .08 : .02;
  const sportBoost = {NFL:.08, MLB:.06, NHL:.07, CFB:.09, Tennis:.07, Soccer:.06}[sport] || .04;
  return Math.max(22, Math.min(98, Math.round(35 + close * 40 + late * 40 + sportBoost * 20)));
}
function normalizeEvent(event, sport) {
  const competition = event.competitions?.[0]; const competitors = competition?.competitors || [];
  if (competitors.length < 2) return null;
  const teams = competitors.slice(0,2).map(competitor => ({name: competitor.team?.displayName || competitor.athlete?.displayName || 'Unknown', abbr: competitor.team?.abbreviation || competitor.abbreviation || '', score: scoreValue(competitor), color: colorFor(competitor.team?.displayName || '', sport)}));
  const gameState = stateFromEvent(event); const status = competition?.status?.type?.shortDetail || competition?.status?.type?.detail || (gameState === 'completed' ? 'Final' : 'Scheduled'); const score = excitementFor(sport, gameState, teams);
  return { id:event.id || `${sport}-${event.name}`, favorite:favoriteFor(teams), sport, icon:iconFor(sport), state:gameState, status, teams:teams.map(team => [team.name, team.abbr, team.score, team.color]), context:event.name || `${sport} matchup`, sub:competition?.venue?.fullName || competition?.venue?.address?.city || 'Live scoreboard', score, signal:score >= 85 ? 'HOT' : score >= 70 ? 'RISING' : gameState === 'completed' ? 'REPLAY' : 'WATCH' };
}
async function fetchFeed(feed) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 7000);
  try { const response = await fetch(`${feed.url}?limit=100`, {signal:controller.signal, cache:'no-store'}); if (!response.ok) throw new Error(`HTTP ${response.status}`); const payload = await response.json(); return (payload.events || []).map(event => normalizeEvent(event, feed.sport)).filter(Boolean); } finally { clearTimeout(timer); }
}
async function loadLiveGames() {
  $('#data-status-label').textContent = 'Connecting to live scoreboards…';
  const results = await Promise.allSettled(LIVE_FEEDS.map(fetchFeed)); const liveGames = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  if (liveGames.length) { games = liveGames; state.source = 'live'; } else { games = [...DEMO_GAMES]; state.source = 'demo'; }
  $('#data-status-label').textContent = state.source === 'live' ? `Live scores · updated ${new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}` : 'Demo data · live feed unavailable'; render();
}
function displayScore(team) { return state.spoilers ? team[2] : (team[2] === '—' ? '—' : '••'); }
function gameCard(game) {
  const scoreClass = game.score >= 85 ? 'hot' : game.score >= 70 ? 'warm' : ''; const stateLabel = game.state === 'live' ? '<span class="status-live">● LIVE</span>' : `<span class="status-${game.state}">${game.status}</span>`;
  return `<article class="game-card ${game.favorite ? 'favorite' : ''}" data-id="${game.id}"><div class="sport-icon">${game.icon}<small>${game.sport}</small></div><div class="team-column"><div class="match-meta">${stateLabel}<span>•</span><span>${game.sub}</span></div><div class="team-row"><span class="team-name"><i class="team-badge ${game.teams[0][3]}">${game.teams[0][1]}</i>${game.teams[0][0]}</span><b class="team-score ${!state.spoilers?'score-hidden':''}">${displayScore(game.teams[0])}</b></div><div class="team-row"><span class="team-name"><i class="team-badge ${game.teams[1][3]}">${game.teams[1][1]}</i>${game.teams[1][0]}</span><b class="team-score ${!state.spoilers?'score-hidden':''}">${displayScore(game.teams[1])}</b></div></div><div class="game-context"><strong>${game.context}</strong><div class="sparkline">${Array.from({length:8},(_,i)=>`<i style="height:${Math.max(5,Math.round((game.score-30)/7)+((i*7)%11))}px"></i>`).join('')}</div></div><div class="game-context"><strong>${game.status}</strong><span>${game.signal === 'HOT' ? 'Momentum is building' : game.signal === 'CAN’T MISS' ? 'High-stakes setup' : 'Worth a closer look'}</span></div><div class="excitement"><div class="score-circle ${scoreClass}">${state.spoilers ? game.score : '—'}</div><small>${game.signal}</small></div></article>`;
}
function render() {
  const isSoccer = state.page === 'soccer'; $('#home-view').classList.toggle('hidden', isSoccer); $('#soccer-view').classList.toggle('hidden', !isSoccer); $('#section-title').textContent = isSoccer ? 'Soccer radar' : 'Your radar'; $$('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.page === state.page)); $$('.soccer-chip').forEach(chip => chip.classList.toggle('hidden', !isSoccer));
  let visible = games.filter(game => isSoccer ? game.sport === 'Soccer' : game.sport !== 'Soccer'); if (state.sport !== 'all') visible = visible.filter(game => game.sport === state.sport); if (state.gameState !== 'all') visible = visible.filter(game => game.state === state.gameState); visible.sort((a,b) => Number(b.favorite) - Number(a.favorite) || b.score - a.score);
  $('#game-list').innerHTML = visible.map(gameCard).join(''); $('#empty-state').classList.toggle('hidden', visible.length !== 0); $('#live-count').textContent = `${visible.filter(game => game.state === 'live').length} LIVE`; $('#all-count').textContent = visible.length; $('#spoiler-label').textContent = state.spoilers ? 'Spoilers on' : 'Spoiler-aware'; $('#spoiler-notice').classList.toggle('hidden', !state.spoilers);
}

document.querySelector('.hero .eyebrow').innerHTML = `<span class="pulse-dot"></span> LIVE SIGNALS <span class="muted">•</span> ${formatDate()}`;
$$('.nav-link').forEach(link => link.addEventListener('click', () => { state.page = link.dataset.page; state.sport = 'all'; location.hash = state.page === 'soccer' ? 'soccer' : 'home'; $$('.sport-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.sport === 'all')); render(); }));
window.addEventListener('hashchange', () => { state.page = location.hash === '#soccer' ? 'soccer' : 'home'; render(); });
$$('.sport-chip').forEach(chip => chip.addEventListener('click', () => { state.sport = chip.dataset.sport; $$('.sport-chip').forEach(item => item.classList.toggle('active', item === chip)); render(); }));
$$('.seg').forEach(tab => tab.addEventListener('click', () => { state.gameState = tab.dataset.state; $$('.seg').forEach(item => item.classList.toggle('active', item === tab)); render(); }));
$('#spoiler-toggle').addEventListener('click', () => { state.spoilers = !state.spoilers; render(); }); $('#dismiss-notice').addEventListener('click', () => $('#spoiler-notice').classList.add('hidden')); $('#refresh-button').addEventListener('click', loadLiveGames); $('#refresh-data').addEventListener('click', loadLiveGames);
function wireDialog(id, opener) { const dialog = $(id); $(opener).addEventListener('click', () => dialog.showModal()); dialog.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => dialog.close())); }
wireDialog('#preferences-dialog','#profile-button'); wireDialog('#data-dialog','#data-info');
let deferredInstallPrompt; window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstallPrompt = event; $('#install-button').classList.remove('hidden'); }); $('#install-button').addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('#install-button').classList.add('hidden'); }); window.addEventListener('appinstalled', () => $('#install-button').classList.add('hidden'));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
render(); loadLiveGames(); setInterval(loadLiveGames, 60000);

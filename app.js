const LEGACY_DEFAULT_FAVORITES = [{sport:'NFL',name:'Baltimore Ravens'},{sport:'MLB',name:'Baltimore Orioles'},{sport:'NHL',name:'Washington Capitals'}];
const FAVORITE_SPORTS = ['NFL','MLB','NHL','CFB','NBA','NCAAB','Soccer'];
const HOME_SPORTS = ['NFL','MLB','NHL','CFB','NBA','NCAAB','Tennis'];
const PUBLIC_SPORTS = new Set(globalThis.SlateMeterSports?.visible || ['NFL','CFB','NCAAB','NHL','MLB','NBA']);
const publicSport = sport => PUBLIC_SPORTS.has(sport);
const SPORT_LABELS = {NFL:'NFL',MLB:'MLB',NHL:'NHL',CFB:'College Football',NBA:'NBA',NCAAB:'NCAAM',Tennis:'Tennis',Soccer:'Soccer'};
const PREFERENCES_KEY = 'sports-radar-preferences-v2';
const FAVORITES_KEY = 'sports-radar-selected-favorites-v1';
const LINES_KEY = 'sports-radar-last-pregame-lines-v1';
const WATCHLIST_KEY = 'sports-radar-watched-games-v1';
const HISTORY_KEY = 'sports-radar-rating-history-v1';
const CONTEXT_SPORTS = new Set(['NFL','MLB','NHL','CFB','NBA','NCAAB']);


const LEAGUE_LOGOS = {
  NFL:'https://a.espncdn.com/i/leaguelogos/500/nfl.png',
  MLB:'https://a.espncdn.com/i/leaguelogos/500/mlb.png',
  NHL:'https://a.espncdn.com/i/leaguelogos/500/nhl.png',
  CFB:'https://a.espncdn.com/i/leaguelogos/500/ncaaf.png',
  NBA:'https://a.espncdn.com/i/leaguelogos/500/nba.png',
  NCAAB:'https://a.espncdn.com/i/leaguelogos/500/ncaab.png',
  Tennis:'https://a.espncdn.com/i/leaguelogos/500/atp.png',
  Soccer:'https://a.espncdn.com/i/leaguelogos/500/soccer.png'
};

let games = [];

const teamPageData = new Map();
const teamPageRequests = new Map();
const teamPageErrors = new Map();
const teamStandingsData = new Map();
const teamStandingsRequests = new Map();
const teamStandingsErrors = new Map();
let teamPageTab = 'overview';
let activeTeamPageKey = '';
const teamReturnStack = [];
let pendingTeamReturn = null;

function readPreferences() {
  try {
    return JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}');
  } catch {
    return {};
  }
}

const savedPreferences = readPreferences();
const savedSports = Array.isArray(savedPreferences.visibleSports)
  ? savedPreferences.visibleSports.filter(sport => HOME_SPORTS.includes(sport))
  : HOME_SPORTS;

function readFavoriteSelections(preferences) {
  let explicit;
  try {
    explicit = JSON.parse(localStorage.getItem(FAVORITES_KEY) || 'null');
  } catch {}

  const prior = Array.isArray(preferences.favoriteTeams) ? preferences.favoriteTeams : [];

  const legacyDefaultsOnly =
    prior.length === LEGACY_DEFAULT_FAVORITES.length &&
    LEGACY_DEFAULT_FAVORITES.every(defaultTeam =>
      prior.some(team =>
        team?.sport === defaultTeam.sport &&
        team?.name === defaultTeam.name
      )
    );

  const selected = Array.isArray(explicit)
    ? explicit
    : legacyDefaultsOnly
      ? []
      : prior;

  return selected
    .filter(team =>
      FAVORITE_SPORTS.includes(team?.sport) &&
      typeof team.name === 'string' &&
      team.name.trim()
    )
    .slice(0,50)
    .map(team => ({
      sport:team.sport,
      name:team.name.trim(),
      id:String(team.id || ''),
      logo:String(team.logo || '')
    }));
}

const savedFavorites = readFavoriteSelections(savedPreferences);

function readWatchedGames() {
  try {
    const value = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]');
    return new Set(
      Array.isArray(value)
        ? value.filter(item => typeof item === 'string').slice(0,100)
        : []
    );
  } catch {
    return new Set();
  }
}

function teamRouteFromHash(hash=location.hash) {
  const match =
    String(hash || '')
      .match(/^#team\/([^/]+)\/([^/]+)$/);

  if (!match) return null;

  const requestedSport =
    decodeURIComponent(match[1]);

  const sport =
    FAVORITE_SPORTS.find(item =>
      item.toLowerCase() ===
      requestedSport.toLowerCase()
    );

  const id =
    decodeURIComponent(match[2]);

  return sport && publicSport(sport) && id
    ? {sport,id}
    : null;
}

function teamHash(team) {
  return `#team/${encodeURIComponent(team.sport)}/${encodeURIComponent(team.id)}`;
}

function gameRouteFromHash(hash=location.hash) {
  const match=/^#game\/([^/]+)\/([^/]+)$/.exec(String(hash || ''));
  if(!match)return null;
  try {
    const sport=[...HOME_SPORTS,'Soccer'].find(sport=>sport.toLowerCase()===decodeURIComponent(match[1]).toLowerCase());
    const id=decodeURIComponent(match[2]);
    return sport && /^[A-Za-z0-9_-]{1,100}$/.test(id)?{sport,id}:null;
  } catch {return null;}
}
function gameHash(game) {return `#game/${encodeURIComponent(game.sport)}/${encodeURIComponent(game.id)}`;}
function hiddenSportFromHash(hash=location.hash) {
  if (hash === '#soccer' && !publicSport('Soccer')) return 'Soccer';
  const match=String(hash).match(/^#(?:team|game)\/([^/]+)\//);
  const sport=match && [...HOME_SPORTS,'Soccer'].find(item=>item.toLowerCase()===match[1].toLowerCase());
  return sport && !publicSport(sport) ? sport : null;
}

const state = {
  page:teamRouteFromHash(location.hash) ? 'team' : location.hash === '#info' ? 'info' : location.hash === '#soccer' && publicSport('Soccer') ? 'soccer' : 'home',
  teamRoute:teamRouteFromHash(location.hash),
  sport:'all',
  gameState:'all',
  showFCS:savedPreferences.showFCS !== false,
  sportFilters:{CFB:normalizeCfbFilters(savedPreferences.sportFilters?.CFB)},
  visibleSports:new Set(savedSports),
  favoriteTeams:savedFavorites,
  watchedGames:readWatchedGames(),
  source:'loading'
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function persistPreferences() {
  try {
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({
        visibleSports:[...state.visibleSports],
        showFCS:state.showFCS,
        sportFilters:state.sportFilters,
        favoriteTeams:state.favoriteTeams
      })
    );
  } catch {}
}

function persistFavoriteSelections() {
  try {
    localStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify(state.favoriteTeams)
    );
  } catch {}

  persistPreferences();
  document.dispatchEvent?.(new CustomEvent('sports-radar:favorites-changed'));
}

function watchKey(game) {
  return `${game.sport}:${game.id}`;
}

function isWatched(game) {
  return state.watchedGames.has(watchKey(game));
}

function toggleWatchedGame(game) {
  const key = watchKey(game);

  if (state.watchedGames.has(key)) {
    state.watchedGames.delete(key);
  } else {
    state.watchedGames.add(key);
  }

  try {
    localStorage.setItem(
      WATCHLIST_KEY,
      JSON.stringify([...state.watchedGames])
    );
  } catch {}

  render();

  return isWatched(game);
}

function syncFCSFilter() {
  const chip = $('#fcs-toggle');

  chip.textContent = state.showFCS ? 'FCS: On' : 'FCS: Off';
  chip.classList.toggle('active',state.showFCS);
  chip.setAttribute('aria-pressed',String(state.showFCS));
}

function normalizeCfbFilters(value) {
  return {conference:/^\d+$/.test(String(value?.conference || '')) ? String(value.conference) : '',top25:value?.top25 === true};
}

const cfbMetadata = new Map();
const CFB_METADATA_KEY = 'sports-radar-cfb-conferences-v1:';
function cfbSeasonFor(value=Date.now()) {
  const date=new Date(value);
  return date.getUTCFullYear() - (date.getUTCMonth()===0 ? 1 : 0);
}
function cfbMembership(game,team) {
  return cfbMetadata.get(cfbSeasonFor(game.startTime))?.data?.teams?.[String(team[8] || '')];
}
// Each future sport owns its own predicate and preferences. Apply only when that
// sport is explicitly selected; every existing sort and tab stays downstream.
const SPORT_FILTERS = {
  CFB:(game,filters)=>
    (!filters.top25 || game.teams.some(team=>Number.isInteger(team[6]) && team[6]>=1 && team[6]<=25)) &&
    (!filters.conference || game.teams.some(team=>cfbMembership(game,team)?.conferenceId===filters.conference))
};
function matchesSportFilters(game) {
  const matches=state.page==='home' && state.sport===game.sport && SPORT_FILTERS[game.sport];
  return !matches || matches(game,state.sportFilters[game.sport]);
}
function cfbFiltersActive() {
  return state.page==='home' && state.sport==='CFB' && Boolean(state.sportFilters.CFB.conference || state.sportFilters.CFB.top25);
}
function selectedCfbConference() {
  return cfbMetadata.get(cfbSeasonFor())?.data?.conferences.find(c=>c.id===state.sportFilters.CFB.conference);
}
async function loadCfbMetadata(season) {
  let entry=cfbMetadata.get(season);
  if (!entry) {
    entry={};
    try {
      const cached=JSON.parse(localStorage.getItem(CFB_METADATA_KEY+season) || 'null');
      if (cached?.data?.season===season && Array.isArray(cached.data.conferences) && cached.data.teams && Date.now()-Date.parse(cached.data.updatedAt)<7*86400000) Object.assign(entry,cached);
    } catch {}
    cfbMetadata.set(season,entry);
  }
  if (entry.loading || Date.now()<(entry.retryAt || 0) || Date.now()<(entry.expires || 0)) return;
  entry.loading=true;
  try {
    const base=String(globalThis.SPORTS_RADAR_ALERTS_URL || '').replace(/\/$/,'');
    const response=await fetch(`${base}/metadata/CFB?season=${season}`,{signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('Conference metadata unavailable');
    const data=await response.json();
    if (data.season!==season || !Array.isArray(data.conferences) || !data.teams || !Number.isFinite(Date.parse(data.updatedAt))) throw new Error('Invalid conference metadata');
    entry.data=data;
    entry.error=false;
    entry.expires=Date.now()+(data.stale?300000:3600000);
    try {localStorage.setItem(CFB_METADATA_KEY+season,JSON.stringify({data,expires:entry.expires}));} catch {}
    if (selectedCfbConference()?.division==='FCS' && !state.showFCS) {
      state.showFCS=true;persistPreferences();syncFCSFilter();
    }
  } catch {
    entry.error=true;
    entry.retryAt=Date.now()+60000;
    entry.expires=0;
    if (Date.now()-Date.parse(entry.data?.updatedAt)>=7*86400000) entry.data=null;
  } finally {
    entry.loading=false;
    render();
  }
}
function syncSportFilters() {
  const visible=state.page==='home' && state.sport==='CFB';
  $('#cfb-filters').classList.toggle('hidden',!visible);
  if (!visible) return;
  const seasons=new Set([cfbSeasonFor(),...games.filter(g=>g.sport==='CFB').map(g=>cfbSeasonFor(g.startTime)).filter(Number.isFinite)]);
  seasons.forEach(season=>{void loadCfbMetadata(season);});
  const entry=cfbMetadata.get(cfbSeasonFor());
  if (selectedCfbConference()?.division==='FCS' && !state.showFCS) {
    state.showFCS=true;persistPreferences();syncFCSFilter();
  }
  const filters=state.sportFilters.CFB;
  const conferences=entry?.data?.conferences || [];
  const select=$('#cfb-conference');
  const options='<option value="">All Conferences</option>'+['FBS','FCS'].map(division=>
    `<optgroup label="${division}">${conferences.filter(c=>c.division===division).sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option value="${safeText(c.id)}">${safeText(c.name)}</option>`).join('')}</optgroup>`
  ).join('')+(filters.conference && !conferences.some(c=>c.id===filters.conference)?`<option value="${safeText(filters.conference)}">Selected conference unavailable</option>`:'');
  if (select.filterOptions!==options) {select.innerHTML=options;select.filterOptions=options;}
  select.value=filters.conference;
  select.disabled=!conferences.length;
  $('#cfb-top25').setAttribute('aria-checked',String(filters.top25));
  $('#cfb-top25').classList.toggle('active',filters.top25);
  $('#cfb-clear').disabled=!cfbFiltersActive();
  const missing=filters.conference ? games.filter(g=>g.sport==='CFB' && g.teams.some(t=>!cfbMembership(g,t))).length : 0;
  $('#cfb-filter-status').textContent=entry?.error
    ? (entry.data ? 'Using cached conferences. Refresh to retry.' : 'Conferences unavailable. Top 25 still works; refresh to retry.')
    : !entry?.data ? 'Loading conferences…'
    : entry.data.stale ? 'Using cached ESPN conferences.'
    : selectedCfbConference()?.division==='FCS' ? 'FCS is on for this conference.'
    : missing ? `${missing} game${missing===1?' has':'s have'} incomplete conference data; only verified matches appear.` : '';
}
function clearCfbFilters() {
  state.sportFilters.CFB=normalizeCfbFilters();
  persistPreferences();render();
}

function syncSportToggles() {
  $$('[data-visible-sport]').forEach(input => {
    input.checked = state.visibleSports.has(input.dataset.visibleSport);
    input.closest?.('label')?.classList.toggle('hidden',!publicSport(input.dataset.visibleSport));
  });
  $$('.nav-link[data-page="soccer"]').forEach(link => link.classList.toggle('hidden',!publicSport('Soccer')));
  $$('#favorite-sport option').forEach(option => {if(!publicSport(option.value)) option.remove();});
}

function labelForSport(sport) {
  return SPORT_LABELS[sport] || sport;
}

function iconFor(sport) {
  return ({
    NFL:'◈',
    MLB:'◉',
    NHL:'✧',
    CFB:'◆',
    NBA:'●',
    NCAAB:'◇',
    Tennis:'◌',
    Soccer:'⊙'
  })[sport] || '✦';
}

function teamLogoUrl(sport, abbreviation) {
  const league = ({
    NFL:'nfl',
    MLB:'mlb',
    NHL:'nhl',
    CFB:'college-football',
    NBA:'nba',
    NCAAB:'mens-college-basketball',
    Tennis:'tennis',
    Soccer:'soccer'
  })[sport] || sport.toLowerCase();

  return `https://a.espncdn.com/i/teamlogos/${league}/500/${String(abbreviation).toLowerCase()}.png`;
}

function teamLogoWithFallback(logo, abbreviation, imageClass = '', loading = 'lazy') {
  const label = String(abbreviation || '?').replace(/[^A-Za-z0-9]/g,'').slice(0,3).toUpperCase() || '?';
  return `${logo ? `<img${imageClass ? ` class="${imageClass}"` : ''} ${globalThis.SlateMeterTeamLogos?.attributes(logo) || ''} src="${safeText(logo)}" alt="" loading="${loading}" onload="this.nextElementSibling.hidden=true;globalThis.SlateMeterTeamLogos?.loaded(this)" onerror="if(!globalThis.SlateMeterTeamLogos?.failed(this)){this.hidden=true;this.nextElementSibling.hidden=false}">` : ''}<span class="team-logo-fallback" aria-hidden="true"${logo ? ' hidden' : ''}>${safeText(label)}</span>`;
}

function summaryUrlFor(sport,eventId) {
  return `${String(globalThis.SPORTS_RADAR_ALERTS_URL || '').replace(/\/$/,'')}/game/${encodeURIComponent(sport)}/${encodeURIComponent(eventId)}`;
}

function teamDetailsUrlFor(team) {
  const base =
    String(
      globalThis.SPORTS_RADAR_ALERTS_URL ||
      ''
    ).replace(/\/$/,'');

  return `${base}/team/${encodeURIComponent(team.sport)}/${encodeURIComponent(team.id)}`;
}

function teamStandingsUrlFor(team) {
  const base = String(globalThis.SPORTS_RADAR_ALERTS_URL || '').replace(/\/$/,'');
  return `${base}/team/${encodeURIComponent(team.sport)}/${encodeURIComponent(team.id)}/standings`;
}

const {
  SPORT_BASE,
  CLOSE_MARGIN,
  clampScore,
  factorText,
  recordFor,
  rankFor,
  parseLine,
  lineFromSummary,
  gameProgress,
  eventPosition,
  playPeriodLabel,
  displayMoment,
  momentumImpact,
  underdogCandidate,
  upsetImpact,
  stateRating,
  rateGame,
  applyLiveSnapshot
} = globalThis.SportsRadarScore;

function normalizedTeamName(name) {
  return String(name || '')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g,' ');
}

function favoriteFor(teams,sport) {
  return state.favoriteTeams.some(favorite =>
    favorite.sport === sport &&
    teams.some(team => {
      const id = String(team.id || team[8] || '');
      const name = team.name || team[0];

      return Boolean(
        favorite.id &&
        id &&
        favorite.id === id
      ) ||
      normalizedTeamName(favorite.name) === normalizedTeamName(name);
    })
  );
}

function localDayStamp(value) {
  if (!value) return '';

  const date = new Date(value);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function sameLocalDay(value) {
  return Boolean(
    value &&
    localDayStamp(value) === localDayStamp(new Date())
  );
}

function gameDayStart(value) {
  const date = new Date(value);
  date.setHours(0,0,0,0);
  return date.getTime();
}

function gameDayLabel(value) {
  const date = new Date(value);

  const today = new Date();
  today.setHours(0,0,0,0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const prefix =
    localDayStamp(date) === localDayStamp(today)
      ? 'Today'
      : localDayStamp(date) === localDayStamp(yesterday)
        ? 'Yesterday'
        : '';

  const full = date.toLocaleDateString([],{
    weekday:'long',
    month:'long',
    day:'numeric'
  });

  return prefix ? `${prefix} · ${full}` : full;
}

function pinnedFavorite(game) {
  return Boolean(
    game.favorite &&
    (
      game.state !== 'upcoming' ||
      sameLocalDay(game.startTime)
    )
  );
}

function halftimePriorityAdjustment(game) {
  if(game.state!=='live' || !['NFL','CFB','NBA','NCAAB','Soccer'].includes(game.sport))return 0;
  const status=game.liveRawStatus || {type:{detail:game.live?.phase || game.status}},type=status.type||{};
  const marked=/half[ -]?time/i.test([type.name,type.description,type.detail,type.shortDetail,status.displayPeriod].filter(Boolean).join(' '));
  return marked || ['NFL','CFB','NBA'].includes(game.sport)&&globalThis.SportsRadarScore?.isHalftimeStatus?.(status) ? 6 : 0;
}
function viewingPriority(game) { return game.score-halftimePriorityAdjustment(game); }
function compareGames(a,b) {
  return Number(pinnedFavorite(b)) -
    Number(pinnedFavorite(a)) ||
    viewingPriority(b) -
    viewingPriority(a);
}

function visibleInState(game, selectedState) {
  return selectedState === 'all'
    ? game.state !== 'completed' || sameLocalDay(game.startTime) || (Date.now()-Date.parse(game.startTime) >= 0 && Date.now()-Date.parse(game.startTime) <= 48*60*60*1000)
    : game.state === selectedState;
}

function allGroup(game) {
  return pinnedFavorite(game)
    ? 0
    : game.state === 'live'
      ? 1
      : game.state === 'upcoming' && sameLocalDay(game.startTime)
        ? 2
        : game.state === 'completed'
          ? 3
          : 4;
}

function compareAllGames(a,b) {
  const groupDifference = allGroup(a) - allGroup(b);
  if (groupDifference) return groupDifference;

  const dayDifference =
    gameDayStart(a.startTime) -
    gameDayStart(b.startTime);

  if (dayDifference) {
    return allGroup(a)===3 ? -dayDifference : dayDifference;
  }

  return viewingPriority(b) - viewingPriority(a);
}

function compareDatedGames(a,b,selectedState) {
  const dayDifference =
    gameDayStart(a.startTime) -
    gameDayStart(b.startTime);

  if (dayDifference) {
    return selectedState === 'completed'
      ? -dayDifference
      : dayDifference;
  }

  return compareGames(a,b);
}

function renderGameList(items,selectedState) {
  if (!['all','upcoming','completed'].includes(selectedState)) {
    return items.map(gameCard).join('');
  }

  let previousDay = '';

  return items.map(game => {
    const day = localDayStamp(game.startTime);

    const divider =
      day !== previousDay
        ? `<div class="game-date-divider" role="separator" aria-label="${safeText(gameDayLabel(game.startTime))}"><span>${safeText(gameDayLabel(game.startTime))}</span><i aria-hidden="true"></i></div>`
        : '';

    previousDay = day;

    return `${divider}${gameCard(game)}`;
  }).join('');
}




function readLineSnapshots() {
  try {
    return JSON.parse(localStorage.getItem(LINES_KEY) || '{}');
  } catch {
    return {};
  }
}

let lineSnapshots = readLineSnapshots();

function rememberPregameLine(game) {
  if (game.state !== 'upcoming' || !game.line) return;

  lineSnapshots[game.id] = {
    line:game.line,
    capturedAt:Date.now()
  };

  const entries = Object.entries(lineSnapshots)
    .sort((a,b) => b[1].capturedAt - a[1].capturedAt)
    .slice(0,200);

  lineSnapshots = Object.fromEntries(entries);

  try {
    localStorage.setItem(
      LINES_KEY,
      JSON.stringify(lineSnapshots)
    );
  } catch {}
}

function displayLine(game) {
  const line = game.line || (game.state === 'upcoming' ? null : lineSnapshots[game.id]?.line);

  if (!line) {
    return {
      label:game.state === 'upcoming' ? 'Current line' : 'Pregame line',
      text:'Not listed'
    };
  }

  const pieces = [
    line.spread
      ? `${game.sport === 'NHL' ? 'Puck line' : game.sport === 'MLB' ? 'Run line' : 'Spread'} ${line.spread}`
      : '',
    line.moneyline
      ? `Moneyline ${line.moneyline}`
      : '',
    line.total !== null
      ? `O/U ${line.total}`
      : ''
  ].filter(Boolean);

  const label =
    game.state === 'upcoming'
      ? 'Current line'
      : line.verifiedClose
        ? 'Closing line'
        : 'Last listed pregame line';

  return {
    label,
    text:pieces.join(' · '),
    provider:line.provider
  };
}




















function gameStartingSoon(game,now=Date.now()) {
  if (game?.state !== 'upcoming' || !publicSport(game.sport)) return false;
  const type = game.liveRawStatus?.type || {};
  if (/postpon|cancel|suspend|(?:^|[\s_])(?:tbd|tba)(?:$|[\s_])|time to be determined/i.test([game.status,type.name,type.detail,type.shortDetail].join(' '))) return false;
  const untilStart = Date.parse(game.startTime || '') - now;
  // Keep briefly delayed starts responsive without polling stale fixtures forever.
  return Number.isFinite(untilStart) && untilStart <= 15*60000 && untilStart >= -30*60000;
}

function liveRefreshDelay(hasLiveGames,isHidden,hasStartingGames=false) {
  return isHidden ? 60000 : hasLiveGames ? 7000 : hasStartingGames ? 10000 : 60000;
}

let liveRefreshTimer = null;
let liveRefreshInFlight = false;
let feedHasLiveGames = false;
let recentLiveChanges = new Map();

function scheduleLiveRefresh() {
  clearTimeout(liveRefreshTimer);
  liveRefreshTimer = setTimeout(loadLiveGames,liveRefreshDelay(feedHasLiveGames,document.hidden,games.some(game=>gameStartingSoon(game))));
}

function canonicalFeedGames(items) {
  return items.filter(game=>game.sport!=='Tennis' || globalThis.SportsRadarTennisCoverage?.currentGameAllowed(game))
    .map(game => ({...game,scoreboard:undefined,favorite:favoriteFor(game.teams,game.sport)}));
}

async function loadLiveGames() {
  if (liveRefreshInFlight) return;
  clearTimeout(liveRefreshTimer);
  liveRefreshInFlight = true;
  $('#data-status-label').textContent = 'Connecting to live scoreboards…';
  try {
    const endpoint = String(globalThis.SPORTS_RADAR_ALERTS_URL || '').replace(/\/$/,'');
    const response = await fetch(`${endpoint}/feed`,{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const feed = await response.json();
    if (!Array.isArray(feed.games) || !Number.isFinite(Date.parse(feed.updatedAt))) throw new Error('Invalid feed');
    if (globalThis.SportsRadarScore.MODEL_VERSION && (feed.modelVersion !== globalThis.SportsRadarScore.MODEL_VERSION || feed.games.some(game => game.state === 'live' && game.modelVersion !== feed.modelVersion))) throw new Error('Scoring model update pending');
    if (state.updatedAt && Date.parse(feed.updatedAt) < Date.parse(state.updatedAt)) return;
    const previous = new Map(games.map(game => [`${game.sport}:${game.id}`,game]));
    games = canonicalFeedGames(feed.games);
    recentLiveChanges = new Map();
    for (const game of games) {
      if (game.state !== 'live') continue;
      const before = previous.get(`${game.sport}:${game.id}`);
      if (!before || before.state !== 'live') continue;
      const scoreChanged = game.teams?.some((team,index) => String(team?.[2]) !== String(before.teams?.[index]?.[2]));
      const ratingChanged = Number(game.score) !== Number(before.score);
      if (scoreChanged || ratingChanged) recentLiveChanges.set(`${game.sport}:${game.id}`,{scoreChanged,ratingChanged,previousScore:before.score});
    }
    feedHasLiveGames = games.some(game => game.state === 'live' && publicSport(game.sport));
    state.source = 'live';
    games.forEach(recordRatingSnapshot);
    state.updatedAt = feed.updatedAt;
    state.feedStale = feed.freshness?.stale === true;
    state.feedDegraded = feed.freshness?.degraded === true || games.some(game => game.state === 'live' && game.scoringPartial);
    games.forEach(rememberPregameLine);
    games.filter(game => game.state === 'live').forEach(recordRatingSnapshot);
  } catch {
    state.feedStale = true;
    if (state.source !== 'live') state.source = 'unavailable';
  } finally {
    liveRefreshInFlight = false;
    scheduleLiveRefresh();
    updateDataStatus();
    render();
  }
}

function updateDataStatus() {
  const updated = $('#data-last-updated');
  if (state.source !== 'live') {
    $('#data-status-label').textContent = state.source === 'loading'
      ? 'Connecting to live scoreboards…'
      : 'Live scores unavailable. Retry to reconnect.';
    $('#footer-status').textContent = state.source === 'loading' ? 'Loading feed' : 'Feed unavailable';
    if (updated) updated.hidden = true;
    return;
  }
  const stale = state.feedStale || Date.now() - Date.parse(state.updatedAt) > 120000;
  $('#data-status-label').textContent =
    stale ? 'Stale scores' : 'Live scores';
  $('#footer-status').textContent = stale ? 'Stale feed' : 'Live feed';
  if (updated) {
    const at = new Date(state.updatedAt);
    updated.hidden = false;
    updated.dateTime = at.toISOString();
    updated.textContent = `${stale ? 'Last update' : 'Updated'} ${at.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`;
    updated.title = at.toLocaleString();
  }
}
setInterval(updateDataStatus,15000);

function safeText(value) {
  return String(value ?? '')
    .replace(
      /[&<>"']/g,
      character => ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#39;'
      })[character]
    );
}

const favoriteCatalog = new Map();
let favoriteCatalogRequest;
let visibleFavoriteSuggestions = [];

function sameFavorite(a,b) {
  return a.sport === b.sport &&
    (
      Boolean(
        a.id &&
        b.id &&
        String(a.id) === String(b.id)
      ) ||
      normalizedTeamName(a.name) === normalizedTeamName(b.name)
    );
}

function syncFavoriteGames() {
  games.forEach(game => {
    game.favorite =
      favoriteFor(
        game.teams,
        game.sport
      );
  });
}

function renderFavoriteTags() {
  $('#favorite-tags').innerHTML =
    state.favoriteTeams.some(team=>publicSport(team.sport))
      ? state.favoriteTeams.map(
          (team,index) =>
            publicSport(team.sport) ? `<span class="favorite-tag">${
              teamLogoWithFallback(team.logo,team.abbreviation || team.name)
            }<span class="favorite-tag-name">${safeText(team.name)}</span><button type="button" data-remove-favorite="${index}" aria-label="Remove ${safeText(team.name)} from favorites">×</button></span>` : ''
        ).join('')
      : '<p class="favorite-empty">No favorites selected. Add a team below.</p>';
}

function loadFavoriteCatalog() {
  if (favoriteCatalogRequest) {
    return favoriteCatalogRequest;
  }

  favoriteCatalogRequest =
    fetch('./teams.json?rev=20261020-23')
      .then(response => {
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        return response.json();
      })
      .then(directory => {
        FAVORITE_SPORTS.forEach(
          sport =>
            favoriteCatalog.set(
              sport,
              (directory[sport] || [])
                .map(team => ({
                  sport,
                  id:String(team.id || ''),
                  name:String(team.name || ''),
                  logo:String(team.logo || '')
                }))
            )
        );

        renderFavoriteResults();
      })
      .catch(() => {
        FAVORITE_SPORTS.forEach(
          sport =>
            favoriteCatalog.set(
              sport,
              []
            )
        );

        renderFavoriteResults();
      });

  return favoriteCatalogRequest;
}

function knownFavoriteTeams(sport) {
  const fromGames =
    games
      .filter(
        game =>
          game.sport === sport
      )
      .flatMap(
        game =>
          game.teams.map(
            team => ({
              sport,
              id:String(team[8] || ''),
              name:team[0],
              logo:team[4] || ''
            })
          )
      );

  const unique =
    new Map();

  for (
    const team of [
      ...fromGames,
      ...(favoriteCatalog.get(sport) || [])
    ]
  ) {
    unique.set(
      normalizedTeamName(team.name),
      team
    );
  }

  return [...unique.values()];
}

let visibleGlobalSearchTeams = [];

globalThis.SportsRadarTeams = {
  load:loadFavoriteCatalog,
  search(query='',sport='all') {
    const unique=new Map();
    for(const category of FAVORITE_SPORTS.filter(publicSport))for(const team of knownFavoriteTeams(category)) {
      if(team.id && (sport==='all' || team.sport===sport) && (!query.trim() || globalSearchTeamScore(team,normalizeGlobalSearch(query))>0)) unique.set(`${team.sport}:${team.id}`,team);
    }
    return [...unique.values()].sort((a,b)=>a.name.localeCompare(b.name));
  },
  favorites() {
    const all=this.search();
    return state.favoriteTeams.map(team=>all.find(item=>sameFavorite(item,team))).filter(Boolean);
  }
};

function normalizeGlobalSearch(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
    .replace(/\s+/g,' ');
}

function globalSearchTextScore(query,text) {
  const needle = normalizeGlobalSearch(query);
  const haystack = normalizeGlobalSearch(text);

  if (!needle || !haystack) return 0;
  if (haystack === needle) return 1000;
  if (haystack.startsWith(needle)) return 800;

  const words = haystack.split(' ');
  if (words.some(word => word === needle)) return 750;
  if (words.some(word => word.startsWith(needle))) return 650;

  const tokens = needle.split(' ');
  if (tokens.every(token => haystack.includes(token))) return 450;

  return 0;
}

function globalSearchGameScore(game,query) {
  const teamValues = (game.teams || []).flatMap(team => [
    team?.[0],
    team?.[1],
    team?.[7]
  ]).filter(Boolean);

  const exactTeamScore = Math.max(
    0,
    ...teamValues.map(value =>
      globalSearchTextScore(query,value)
    )
  );

  const general = [
    game.sport,
    labelForSport(game.sport),
    game.division,
    game.status,
    game.sub,
    game.context,
    game.live?.phase,
    game.live?.note,
    teamValues.join(' ')
  ]
    .filter(Boolean)
    .join(' ');

  const generalScore =
    globalSearchTextScore(query,general);

  const score =
    Math.max(exactTeamScore,generalScore);

  if (!score) return 0;

  return score +
    (game.state === 'live' ? 45 : 0) +
    (game.favorite ? 20 : 0) +
    Math.min(19,Math.max(0,Number(game.score) || 0) / 5);
}

function globalSearchTeams() {
  const unique = new Map();

  for (const game of games.filter(game=>publicSport(game.sport))) {
    for (const team of game.teams || []) {
      const item = {
        sport:game.sport,
        id:String(team?.[8] || ''),
        name:String(team?.[0] || ''),
        abbreviation:String(team?.[1] || ''),
        logo:String(team?.[4] || '')
      };

      if (!item.name) continue;

      const key =
        item.id
          ? `${item.sport}:id:${item.id}`
          : `${item.sport}:name:${normalizeGlobalSearch(item.name)}`;

      unique.set(key,item);
    }
  }

  for (const sport of FAVORITE_SPORTS.filter(publicSport)) {
    for (const team of favoriteCatalog.get(sport) || []) {
      const item = {
        sport,
        id:String(team.id || ''),
        name:String(team.name || ''),
        abbreviation:String(team.abbreviation || ''),
        logo:String(team.logo || '')
      };

      if (!item.name) continue;

      const key =
        item.id
          ? `${sport}:id:${item.id}`
          : `${sport}:name:${normalizeGlobalSearch(item.name)}`;

      if (!unique.has(key)) unique.set(key,item);
    }
  }

  return [...unique.values()];
}

function globalSearchTeamScore(team,query) {
  return Math.max(
    globalSearchTextScore(query,team.name),
    globalSearchTextScore(query,team.abbreviation),
    globalSearchTextScore(query,`${labelForSport(team.sport)} ${team.name}`)
  );
}

function globalSearchTeamGames(team) {
  return games.filter(game =>
    game.sport === team.sport &&
    (game.teams || []).some(item => {
      const id = String(item?.[8] || '');
      const name = normalizeGlobalSearch(item?.[0]);

      return Boolean(
        team.id &&
        id &&
        String(team.id) === id
      ) ||
      name === normalizeGlobalSearch(team.name);
    })
  );
}

function teamDataKey(team) {
  return `${team.sport}:${String(team.id)}`;
}

function teamTupleForGame(game,team) {
  return (game?.teams || []).find(item => {
    const id = String(item?.[8] || '');

    return Boolean(
      team.id &&
      id &&
      String(team.id) === id
    ) ||
    normalizeGlobalSearch(item?.[0]) ===
      normalizeGlobalSearch(team.name);
  });
}

function teamPageTeam() {
  const route = state.teamRoute;

  if (!route) return null;

  const catalogTeam =
    globalSearchTeams()
      .find(team =>
        team.sport === route.sport &&
        String(team.id) === String(route.id)
      );

  if (catalogTeam) {
    return catalogTeam;
  }

  const data =
    teamPageData.get(
      teamDataKey(route)
    );

  if (!data?.team?.name) {
    return null;
  }

  return {
    sport:route.sport,
    id:String(route.id),
    name:data.team.name,
    abbreviation:data.team.abbreviation || '',
    logo:data.team.logo || ''
  };
}

function teamPageRecord(team,teamGames,data) {
  if (data?.team?.record) {
    return String(data.team.record);
  }

  for (const game of teamGames) {
    const record =
      teamTupleForGame(game,team)?.[5];

    if (record) return String(record);
  }

  return '';
}

function teamPageAbbreviation(team,teamGames,data) {
  if (data?.team?.abbreviation) {
    return data.team.abbreviation;
  }

  if (team.abbreviation) {
    return team.abbreviation;
  }

  for (const game of teamGames) {
    const abbreviation =
      teamTupleForGame(game,team)?.[1];

    if (abbreviation) return String(abbreviation);
  }

  return '';
}

function teamPageLogo(team,teamGames,data) {
  if (data?.team?.logo) {
    return data.team.logo;
  }

  if (team.logo) {
    return team.logo;
  }

  for (const game of teamGames) {
    const logo =
      teamTupleForGame(game,team)?.[4];

    if (logo) return String(logo);
  }

  return '';
}


function compactTeamStanding(value) {
  return String(value || '')
    .replace(/American Football Conference/g,'AFC')
    .replace(/National Football Conference/g,'NFC')
    .replace(/American League/g,'AL')
    .replace(/National League/g,'NL');
}


function teamUiOrdinal(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return '';
  const mod100 = number % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : number % 10 === 1
        ? 'st'
        : number % 10 === 2
          ? 'nd'
          : number % 10 === 3
            ? 'rd'
            : 'th';
  return `${number}${suffix}`;
}

function teamStandingConference(value) {
  const match = String(value || '').match(/\b(AFC|NFC)\b/);
  return match ? match[1] : '';
}

function teamHeroStat(value,label) {
  if (!value) return '';
  return `<span><strong>${safeText(value)}</strong><small>${safeText(label)}</small></span>`;
}

function teamHeroStandings(team,conferenceStanding) {
  const standings = teamStandingsData.get(teamDataKey(team));
  const row = standings?.team;
  const group = standings?.group;

  if (team.sport === 'NFL') {
    const conference = teamStandingConference(conferenceStanding);
    const divisionRank = Number(row?.rank ?? row?.divisionRank);
    const playoffSeed = Number(row?.playoffSeed);
    const divisionValue =
      Number.isFinite(divisionRank) && group?.name
        ? `${teamUiOrdinal(divisionRank)} in ${group.name}`
        : '';

    const primary =
      divisionRank === 1 && Number.isFinite(playoffSeed)
        ? teamHeroStat(`No. ${playoffSeed} seed`,'Playoff Seed')
        : teamHeroStat(
            conferenceStanding,
            conference ? `${conference} Standing` : 'Conference Standing'
          );

    return primary + teamHeroStat(divisionValue,'Division Standing');
  }

  if (team.sport === 'NHL' && row) {
    const divisionRank = Number(row.rank ?? row.divisionRank);
    const divisionValue =
      Number.isFinite(divisionRank) && group?.name
        ? `${teamUiOrdinal(divisionRank)} in ${group.name.replace(/ Division$/i,'')}`
        : '';

    const wildCards = standings?.playoffField?.wildCards || [];
    const wildCard = wildCards.find(item =>
      String(item.id) === String(team.id)
    );

    let playoffValue = '';
    if (Number.isFinite(divisionRank) && divisionRank <= 3) {
      playoffValue = 'Division qualifier';
    } else if (wildCard?.wildCardSlot) {
      playoffValue = `WC${wildCard.wildCardSlot}`;
    } else if (wildCard) {
      playoffValue = wildCard.wildCardOrder === 3
        ? 'First team out'
        : 'Outside playoff field';
    }

    return (
      teamHeroStat(divisionValue,'Division Standing') +
      teamHeroStat(playoffValue,'Playoff Position')
    );
  }

  if (!conferenceStanding) return '';

  const label =
    team.sport === 'MLB' && /\b(AL|NL)\b/.test(conferenceStanding)
      ? `${conferenceStanding.match(/\b(AL|NL)\b/)?.[1] || ''} Standing`
      : ['NBA','NCAAB'].includes(team.sport)
        ? 'Conference Standing'
        : 'League Standing';

  return teamHeroStat(conferenceStanding,label);
}

function sameTeamRoute(team) {
  return Boolean(
    state.page === 'team' &&
    state.teamRoute &&
    state.teamRoute.sport === team.sport &&
    String(state.teamRoute.id) ===
      String(team.id)
  );
}

function loadTeamPageData(team,{force=false}={}) {
  if (!team?.sport || !team?.id) {
    return Promise.resolve(null);
  }

  const key = teamDataKey(team);

  if (!force && teamPageData.has(key)) {
    return Promise.resolve(
      teamPageData.get(key)
    );
  }

  if (teamPageRequests.has(key)) {
    return teamPageRequests.get(key);
  }

  teamPageErrors.delete(key);

  const request =
    fetch(
      teamDetailsUrlFor(team),
      {cache:'no-store'}
    )
      .then(async response => {
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            payload?.error ||
            `Team data HTTP ${response.status}`
          );
        }

        teamPageData.set(
          key,
          payload
        );

        return payload;
      })
      .catch(error => {
        teamPageErrors.set(
          key,
          String(
            error?.message ||
            error ||
            'Team data unavailable'
          )
        );

        return null;
      })
      .finally(() => {
        teamPageRequests.delete(key);

        if (sameTeamRoute(team)) {
          render();
        }
      });

  teamPageRequests.set(
    key,
    request
  );

  return request;
}


function loadTeamStandings(team,{force=false}={}) {
  if (!team?.sport || !team?.id) return Promise.resolve(null);

  const key = teamDataKey(team);
  if (!force && teamStandingsData.has(key)) {
    return Promise.resolve(teamStandingsData.get(key));
  }
  if (teamStandingsRequests.has(key)) {
    return teamStandingsRequests.get(key);
  }

  teamStandingsErrors.delete(key);

  const request = fetch(
    teamStandingsUrlFor(team),
    {cache:'no-store'}
  )
    .then(async response => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || `Standings HTTP ${response.status}`);
      }
      teamStandingsData.set(key,payload);
      return payload;
    })
    .catch(error => {
      teamStandingsErrors.set(
        key,
        String(error?.message || error || 'Standings unavailable')
      );
      return null;
    })
    .finally(() => {
      teamStandingsRequests.delete(key);
      if (sameTeamRoute(team)) {
        renderTeamPage();
      }
    });

  teamStandingsRequests.set(key,request);
  return request;
}

function compareTeamGameTimes(a,b) {
  return (
    Date.parse(a?.startTime || '') || 0
  ) - (
    Date.parse(b?.startTime || '') || 0
  );
}

function teamScheduleFromCanonical(game,team) {
  if (!game) return null;

  const teamTuple =
    teamTupleForGame(game,team);

  const opponentTuple =
    (game.teams || [])
      .find(item =>
        item !== teamTuple
      );

  const teamScore =
    teamTuple?.[2] ?? '';

  const opponentScore =
    opponentTuple?.[2] ?? '';

  let result = '';

  if (
    game.state === 'completed' &&
    teamTuple &&
    opponentTuple
  ) {
    const left =
      Number(teamScore);

    const right =
      Number(opponentScore);

    if (
      Number.isFinite(left) &&
      Number.isFinite(right)
    ) {
      result =
        left > right
          ? 'W'
          : left < right
            ? 'L'
            : 'T';
    }
  }

  return {
    id:String(game.id),
    startTime:game.startTime,
    state:game.state,
    status:game.status || '',
    homeAway:'',
    opponent:{
      id:String(opponentTuple?.[8] || ''),
      name:opponentTuple?.[0] || 'Opponent',
      abbreviation:opponentTuple?.[1] || '',
      logo:opponentTuple?.[4] || ''
    },
    teamScore:String(teamScore ?? ''),
    opponentScore:String(opponentScore ?? ''),
    result,
    broadcast:game.channel || '',
    week:'',
    note:''
  };
}

function canonicalTeamGame(row,team) {
  if (!row?.id) return null;

  return games.find(game =>
    game.sport === team.sport &&
    String(game.id) ===
      String(row.id)
  ) || null;
}

function teamScheduleView(row,team) {
  const canonical =
    canonicalTeamGame(
      row,
      team
    );

  if (!canonical) {
    return row;
  }

  return {
    ...row,
    ...teamScheduleFromCanonical(
      canonical,
      team
    ),
    homeAway:
      row.homeAway || '',
    opponent:
      row.opponent ||
      teamScheduleFromCanonical(
        canonical,
        team
      )?.opponent,
    broadcast:
      canonical.channel ||
      row.broadcast ||
      '',
    week:
      row.week || '',
    note:
      row.note || ''
  };
}

// The upper range follows the original 215 - score * 2.15 interpolation.
// The low range bends toward blue/cyan so sub-50 ratings remain cool.
function scoreHueFor(score) {
  const value = Number(score);
  const normalized = Number.isFinite(value) ? Math.min(100,Math.max(0,value)) : 50;
  if (normalized >= 70) return Math.round(215 - normalized * 2.15);
  const anchors = [[0,215],[35,190],[49,150],[60,110],[69,68],[70,65]];
  for (let index=1; index<anchors.length; index++) {
    const [endScore,endHue] = anchors[index];
    const [startScore,startHue] = anchors[index-1];
    if (normalized <= endScore) {
      return Math.round(startHue + (endHue-startHue) * (normalized-startScore) / (endScore-startScore));
    }
  }
  return 65;
}

function scoreHeatClass(score) {
  return score >= 95 ? 'extreme' : score >= 90 ? 'very-hot' : score >= 85 ? 'hot' : score >= 70 ? 'warm' : '';
}

function teamSignalStyle(score) {
  const value = Number(score);

  if (!Number.isFinite(value)) {
    return {
      className:'',
      style:''
    };
  }

  return {
    className:scoreHeatClass(value),
    style:`--score-hue:${scoreHueFor(value)};`
  };
}

function teamSignalMarkup(score,label='Excitement') {
  const value = Number(score);

  if (!Number.isFinite(value)) {
    return `<span class="team-signal-pending"><small>${safeText(label)}</small><span>Pending</span></span>`;
  }

  const appearance =
    teamSignalStyle(value);

  return `<span class="team-signal"><small>${safeText(label)}</small><span class="score-circle ${appearance.className}" style="${appearance.style}">${safeText(Math.round(value))}</span></span>`;
}

function teamSpotlightRows(team,data) {
  const schedule =
    Array.isArray(data?.schedule)
      ? data.schedule
      : [];

  const byId =
    new Map(
      schedule.map(row => [
        String(row.id),
        row
      ])
    );

  const teamGames =
    globalSearchTeamGames(team);

  const canonicalLive =
    teamGames
      .filter(game =>
        game.state === 'live'
      )
      .sort(compareGames);

  const canonicalCompleted =
    teamGames
      .filter(game =>
        game.state === 'completed'
      )
      .sort((a,b) =>
        compareTeamGameTimes(b,a)
      );

  const canonicalUpcoming =
    teamGames
      .filter(game =>
        game.state === 'upcoming'
      )
      .sort(compareTeamGameTimes);

  const backendLast =
    data?.spotlights?.last?.gameId
      ? byId.get(
          String(
            data.spotlights.last.gameId
          )
        )
      : null;

  const backendNext =
    data?.spotlights?.next?.gameId
      ? byId.get(
          String(
            data.spotlights.next.gameId
          )
        )
      : null;

  const lastCandidates = [
    backendLast,
    canonicalCompleted[0]
      ? teamScheduleFromCanonical(
          canonicalCompleted[0],
          team
        )
      : null
  ]
    .filter(row => row && teamScheduleView(row,team).state === 'completed')
    .sort((a,b) =>
      compareTeamGameTimes(b,a)
    );

  const liveRow =
    canonicalLive[0]
      ? byId.get(
          String(
            canonicalLive[0].id
          )
        ) ||
        teamScheduleFromCanonical(
          canonicalLive[0],
          team
        )
      : null;

  const nextCandidates = [
    backendNext,
    canonicalUpcoming[0]
      ? byId.get(
          String(
            canonicalUpcoming[0].id
          )
        ) ||
        teamScheduleFromCanonical(
          canonicalUpcoming[0],
          team
        )
      : null
  ]
    .filter(row => row && teamScheduleView(row,team).state === 'upcoming')
    .sort(compareTeamGameTimes);

  const last =
    lastCandidates[0] ||
    schedule.filter(row => teamScheduleView(row,team).state === 'completed').sort((a,b) => compareTeamGameTimes(b,a))[0] || null;

  const next =
    liveRow ||
    nextCandidates[0] ||
    null;

  const signalFor = (row,kind) => {
    if (!row) return null;

    const canonical =
      canonicalTeamGame(
        row,
        team
      );

    if (
      canonical &&
      Number.isFinite(
        Number(canonical.score)
      )
    ) {
      return Number(
        canonical.score
      );
    }

    const backend =
      data?.spotlights?.[kind];

    return backend &&
      String(backend.gameId) ===
        String(row.id) &&
      Number.isFinite(
        Number(backend.signal)
      )
        ? Number(backend.signal)
        : null;
  };

  return {
    last:{
      row:last,
      signal:signalFor(
        last,
        'last'
      )
    },
    next:{
      row:next,
      signal:signalFor(
        next,
        'next'
      )
    }
  };
}

function teamGameDate(row) {
  const date =
    new Date(
      row?.startTime || ''
    );

  return Number.isFinite(
    date.getTime()
  )
    ? date
    : null;
}

function teamGameTimeLabel(row) {
  const date =
    teamGameDate(row);

  if (!date) {
    return row?.status || 'Time TBD';
  }

  return date.toLocaleString([],{
    weekday:'short',
    month:'short',
    day:'numeric',
    hour:'numeric',
    minute:'2-digit'
  });
}

function teamSpotlightMarkup(title,entry,team) {
  const row = entry?.row;

  if (!row) {
    return `<section class="team-spotlight-card team-spotlight-empty"><div class="team-spotlight-label">${safeText(title)}</div><strong>Not available</strong><span>The team schedule has not supplied this game yet.</span></section>`;
  }

  const view =
    teamScheduleView(
      row,
      team
    );

  const canonical =
    canonicalTeamGame(
      row,
      team
    );

  const opponent =
    view.opponent || {};

  const opponentLogo =
    opponent.logo ||
    (
      opponent.abbreviation
        ? teamLogoUrl(
            team.sport,
            opponent.abbreviation
          )
        : ''
    );

  const completed =
    view.state === 'completed';

  const live =
    view.state === 'live';

  const scoreLine =
    completed || live
      ? [
          view.result,
          view.teamScore !== '' &&
          view.opponentScore !== ''
            ? `${view.teamScore}-${view.opponentScore}`
            : ''
        ]
          .filter(Boolean)
          .join(' ')
      : teamGameTimeLabel(view);

  const meta = [
    live
      ? 'LIVE'
      : view.status,
    view.week,
    view.note
  ]
    .filter(Boolean)
    .join(' · ');

  const matchupPrefix =
    view.homeAway === 'away'
      ? 'at'
      : 'vs';

  const opponentTag = opponent.id ? 'button' : 'span';
  const opponentAttrs = opponent.id
    ? ` type="button" data-opponent-id="${safeText(opponent.id)}" data-opponent-name="${safeText(opponent.name || '')}" data-opponent-abbreviation="${safeText(opponent.abbreviation || '')}" data-opponent-logo="${safeText(opponentLogo)}" aria-label="Open ${safeText(opponent.name || 'opponent')} team page"` : '';
  const gameTarget = canonical
    ? `<button type="button" class="spotlight-open-target" data-team-game="${safeText(canonical.id)}" data-team-sport="${safeText(canonical.sport)}" aria-label="Open game details"></button>` : '';
  return `<div class="team-spotlight-card ${canonical ? 'is-clickable' : ''}">${gameTarget}<span class="team-spotlight-label">${safeText(live ? 'Live Now' : title)}</span><${opponentTag} class="team-spotlight-matchup"${opponentAttrs}>${teamLogoWithFallback(opponentLogo,opponent.abbreviation || opponent.name)}<span><small>${safeText(matchupPrefix)}</small><strong>${safeText(opponent.name || opponent.abbreviation || 'Opponent')}</strong></span></${opponentTag}><span class="team-spotlight-result"><strong>${safeText(scoreLine || 'TBD')}</strong>${meta ? `<small>${safeText(meta)}</small>` : ''}</span>${teamSignalMarkup(entry.signal,live ? 'Live Excitement' : 'Excitement')}</div>`;
}

function teamLeaderMarkup(leaders) {
  if (!Array.isArray(leaders) || !leaders.length) {
    return `<section class="team-leaders-section"><div class="team-section-heading"><div><span class="eyebrow">Season</span><h2>Statistical Leaders</h2></div></div><div class="team-page-state compact"><strong>Leaders unavailable</strong><p>The provider has not supplied team leaders for this sport yet.</p></div></section>`;
  }

  return `<section class="team-leaders-section"><div class="team-section-heading"><div><span class="eyebrow">Season</span><h2>Statistical Leaders</h2></div></div><div class="team-leader-grid">${leaders.slice(0,4).map(leader => {
    const athlete =
      leader.athlete || {};

    return `<article class="team-leader-card">${athlete.headshot ? `<img class="team-leader-headshot" src="${safeText(athlete.headshot)}" alt="" loading="lazy" onerror="this.style.display='none'">` : `<span class="team-leader-placeholder" aria-hidden="true">${safeText((athlete.name || '?').slice(0,1))}</span>`}<div class="team-leader-copy"><span>${safeText(leader.category || 'Leader')}</span><strong>${safeText(athlete.name || 'Team leader')}</strong>${athlete.position ? `<small>${safeText(athlete.position)}</small>` : ''}</div><div class="team-leader-value"><b>${safeText(leader.displayValue ?? '—')}</b>${leader.abbreviation ? `<small>${safeText(leader.abbreviation)}</small>` : ''}</div></article>`;
  }).join('')}</div></section>`;
}

function teamScheduleResultMarkup(row) {
  if (row.state === 'completed') {
    const result =
      row.result || '';

    const score =
      row.teamScore !== '' &&
      row.opponentScore !== ''
        ? `${row.teamScore}-${row.opponentScore}`
        : row.status || 'Final';

    return `<span class="team-schedule-result ${result === 'W' ? 'win' : result === 'L' ? 'loss' : ''}">${result ? `<b>${safeText(result)}</b>` : ''}<strong>${safeText(score)}</strong></span>`;
  }

  if (row.state === 'live') {
    return `<span class="team-schedule-result live"><b>LIVE</b><strong>${safeText(row.teamScore !== '' && row.opponentScore !== '' ? `${row.teamScore}-${row.opponentScore}` : row.status || '')}</strong></span>`;
  }

  const date =
    teamGameDate(row);

  return `<span class="team-schedule-result"><strong>${safeText(date ? date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}) : row.status || 'TBD')}</strong></span>`;
}

function teamScheduleRowMarkup(row,team) {
  const view =
    teamScheduleView(
      row,
      team
    );

  const date =
    teamGameDate(view);

  const opponent =
    view.opponent || {};

  const logo =
    opponent.logo ||
    (
      opponent.abbreviation
        ? teamLogoUrl(
            team.sport,
            opponent.abbreviation
          )
        : ''
    );

  const prefix =
    view.homeAway === 'away'
      ? '@'
      : 'vs';

  const details = [
    view.week,
    view.note
  ]
    .filter(Boolean)
    .join(' · ');

  const opponentTag = opponent.id ? 'button' : 'span';
  const opponentAttrs = opponent.id
    ? ` type="button" data-opponent-id="${safeText(opponent.id)}" data-opponent-name="${safeText(opponent.name || '')}" data-opponent-abbreviation="${safeText(opponent.abbreviation || '')}" data-opponent-logo="${safeText(logo)}" aria-label="Open ${safeText(opponent.name || 'opponent')} team page"` : '';
  return `<div class="team-schedule-row"><span class="team-schedule-date"><b>${safeText(date ? date.toLocaleDateString([],{month:'short',day:'numeric'}) : 'TBD')}</b><small>${safeText(date ? date.toLocaleDateString([],{weekday:'short'}) : '')}</small></span><${opponentTag} class="team-schedule-opponent"${opponentAttrs}>${teamLogoWithFallback(logo,opponent.abbreviation || opponent.name)}<span><small>${safeText(prefix)}</small><strong>${safeText(opponent.name || opponent.abbreviation || 'Opponent')}</strong>${details ? `<span>${safeText(details)}</span>` : ''}</span></${opponentTag}>${teamScheduleResultMarkup(view)}</div>`;
}

function teamScheduleMarkup(schedule,team) {
  if (!Array.isArray(schedule) || !schedule.length) {
    return `<section class="team-schedule-section"><div class="team-section-heading"><div><span class="eyebrow">Season</span><h2>Full Schedule</h2></div></div><div class="team-page-state compact"><strong>Schedule unavailable</strong><p>The provider has not supplied a season schedule for this team.</p></div></section>`;
  }

  const groups =
    new Map();

  schedule
    .slice()
    .sort(compareTeamGameTimes)
    .forEach(row => {
      const date =
        teamGameDate(row);

      const label =
        date
          ? date.toLocaleDateString([],{
              month:'long',
              year:'numeric'
            })
          : 'Schedule';

      if (!groups.has(label)) {
        groups.set(
          label,
          []
        );
      }

      groups.get(label)
        .push(row);
    });

  return `<section class="team-schedule-section"><div class="team-section-heading"><div><span class="eyebrow">Season</span><h2>Full Schedule</h2></div><span>${safeText(schedule.length)} games</span></div><div class="team-schedule-groups">${[...groups.entries()].map(([label,rows]) => `<section class="team-schedule-month"><h3>${safeText(label)}</h3><div class="team-schedule-list">${rows.map(row => teamScheduleRowMarkup(row,team)).join('')}</div></section>`).join('')}</div></section>`;
}



function teamStandingExtra(row,sport) {
  if (sport === 'NHL' || sport === 'Soccer') {
    return {label:'PTS',value:row.points || '—'};
  }
  if (['MLB','NBA','NCAAB'].includes(sport)) {
    return {label:'GB',value:row.gamesBehind || '—'};
  }
  return {label:'PCT',value:row.winPercent || '—'};
}

function teamStandingRowMarkup(row,team) {
  const extra = teamStandingExtra(row,team.sport);
  const current = String(row.id) === String(team.id);
  const clickable = Boolean(row.id);
  const divisionQualifier =
    team.sport === 'NHL' &&
    Number(row.rank) >= 1 &&
    Number(row.rank) <= 3;
  const divisionCutoff =
    team.sport === 'NHL' &&
    Number(row.rank) === 3;
  const tag = clickable ? 'button' : 'div';
  const attrs = clickable
    ? ` type="button" data-standing-team="${safeText(row.id)}" data-standing-name="${safeText(row.name || '')}" data-standing-abbreviation="${safeText(row.abbreviation || '')}" data-standing-logo="${safeText(row.logo || '')}"`
    : '';

  return `<${tag} class="team-standing-row ${current ? 'current' : ''} ${clickable ? 'is-clickable' : ''} ${divisionQualifier ? 'division-qualifier' : ''} ${divisionCutoff ? 'division-cutoff' : ''}"${attrs}><span class="team-standing-rank">${safeText(row.rank || '—')}</span><span class="team-standing-team">${teamLogoWithFallback(row.logo,row.abbreviation || row.name)}<span><strong>${safeText(row.name || row.abbreviation || 'Team')}</strong>${row.streak ? `<small>${safeText(row.streak)}</small>` : ''}</span></span><span class="team-standing-record"><strong>${safeText(row.record || '—')}</strong><small>Record</small></span><span class="team-standing-extra"><strong>${safeText(extra.value)}</strong><small>${safeText(extra.label)}</small></span></${tag}>`;
}

function teamPlayoffStatus(row,cutoff) {
  const seed = Number(row?.playoffSeed);
  if (!Number.isFinite(seed)) return '';
  if (seed <= 4) return 'Division leader';
  if (seed <= cutoff) return `Wild Card ${seed - 4}`;
  if (seed === cutoff + 1) return 'First team out';
  return 'Outside';
}

function teamPlayoffRowMarkup(row,team,field) {
  const current = String(row.id) === String(team.id);
  const seed = Number(row.playoffSeed);
  const inField = Number.isFinite(seed) && seed <= Number(field.cutoff || 7);
  const clickable = Boolean(row.id);
  const tag = clickable ? 'button' : 'div';
  const attrs = clickable
    ? ` type="button" data-standing-team="${safeText(row.id)}" data-standing-name="${safeText(row.name || '')}" data-standing-abbreviation="${safeText(row.abbreviation || '')}" data-standing-logo="${safeText(row.logo || '')}"`
    : '';

  return `<${tag} class="team-playoff-row ${current ? 'current' : ''} ${inField ? 'in-field' : 'out-field'} ${clickable ? 'is-clickable' : ''}"${attrs}><span class="team-playoff-seed">${safeText(Number.isFinite(seed) ? seed : '—')}</span><span class="team-standing-team">${teamLogoWithFallback(row.logo,row.abbreviation || row.name)}<span><strong>${safeText(row.name || row.abbreviation || 'Team')}</strong><small>${safeText(row.divisionName || '')}</small></span></span><span class="team-standing-record"><strong>${safeText(row.record || '—')}</strong><small>Record</small></span><span class="team-playoff-status">${safeText(teamPlayoffStatus(row,field.cutoff || 7))}</span></${tag}>`;
}

function teamPlayoffFieldMarkup(standings,team) {
  const field = standings?.playoffField;
  if (field?.type === 'nhl' || !field?.entries?.length) return '';

  const rows = [];
  for (const row of field.entries) {
    const seed = Number(row.playoffSeed);
    if (seed === 1) {
      rows.push('<div class="team-playoff-band division">Division Leaders</div>');
    } else if (seed === 5) {
      rows.push('<div class="team-playoff-band wildcard">Wild Cards</div>');
    } else if (seed === Number(field.cutoff || 7) + 1) {
      rows.push('<div class="team-playoff-band outside">Outside Looking In</div>');
    }
    rows.push(teamPlayoffRowMarkup(row,team,field));
  }

  return `<section class="team-playoff-picture"><div class="team-section-heading"><div><span class="eyebrow">Conference</span><h2>${safeText(field.name || 'Playoff Picture')}</h2></div><span>Top ${safeText(field.cutoff || 7)} qualify</span></div><div class="team-playoff-table" role="table" aria-label="${safeText(field.name || 'Conference playoff picture')}"><div class="team-playoff-head" role="row"><span>Seed</span><span>Team</span><span>Record</span><span>Status</span></div>${rows.join('')}</div></section>`;
}

function teamNhlWildCardRowMarkup(row,team) {
  const current = String(row.id) === String(team.id);
  const slot =
    row.wildCardSlot
      ? `WC${row.wildCardSlot}`
      : row.wildCardOrder === 3
        ? 'OUT'
        : '—';
  const status =
    row.wildCardSlot
      ? `Wild Card ${row.wildCardSlot}`
      : row.wildCardOrder === 3
        ? 'First team out'
        : 'Outside';
  const clickable = Boolean(row.id);
  const tag = clickable ? 'button' : 'div';
  const attrs = clickable
    ? ` type="button" data-standing-team="${safeText(row.id)}" data-standing-name="${safeText(row.name || '')}" data-standing-abbreviation="${safeText(row.abbreviation || '')}" data-standing-logo="${safeText(row.logo || '')}"`
    : '';

  return `<${tag} class="team-playoff-row nhl-wild-card ${current ? 'current' : ''} ${row.wildCardSlot ? 'in-field' : 'out-field'} ${clickable ? 'is-clickable' : ''}"${attrs}><span class="team-playoff-seed">${safeText(slot)}</span><span class="team-standing-team">${teamLogoWithFallback(row.logo,row.abbreviation || row.name)}<span><strong>${safeText(row.name || row.abbreviation || 'Team')}</strong><small>${safeText(String(row.divisionName || '').replace(/ Division$/i,''))}</small></span></span><span class="team-standing-record"><strong>${safeText(row.points || '—')}</strong><small>PTS</small></span><span class="team-playoff-status">${safeText(status)}</span></${tag}>`;
}

function teamNhlPlayoffMarkup(standings,team) {
  const field = standings?.playoffField;
  if (field?.type !== 'nhl' || !field?.wildCards?.length) return '';

  const selected = field.wildCards.find(row =>
    String(row.id) === String(team.id)
  );

  const divisionRank = Number(standings?.team?.rank);
  const currentText =
    Number.isFinite(divisionRank) && divisionRank <= 3
      ? `Currently qualifies through ${String(standings.group?.name || 'division').replace(/ Division$/i,'')}`
      : selected?.wildCardSlot
        ? `Currently WC${selected.wildCardSlot}`
        : selected?.wildCardOrder === 3
          ? 'Currently first team out'
          : selected
            ? 'Currently outside the Wild Card spots'
            : '';

  const rows = field.wildCards.map((row,index) => {
    const divider =
      index === 0
        ? '<div class="team-playoff-band wildcard">Wild Card Spots</div>'
        : index === 2
          ? '<div class="team-playoff-band outside">Outside Looking In</div>'
          : '';
    return divider + teamNhlWildCardRowMarkup(row,team);
  }).join('');

  return `<section class="team-playoff-picture nhl-playoff-picture"><div class="team-section-heading"><div><span class="eyebrow">Conference</span><h2>${safeText(field.name)}</h2></div>${currentText ? `<span>${safeText(currentText)}</span>` : ''}</div><div class="team-playoff-table" role="table" aria-label="${safeText(field.name)}"><div class="team-playoff-head" role="row"><span>Slot</span><span>Team</span><span>PTS</span><span>Status</span></div>${rows}</div></section>`;
}

function teamStandingsMarkup(team) {
  const key = teamDataKey(team);
  const standings = teamStandingsData.get(key);
  const loading = teamStandingsRequests.has(key);
  const error = teamStandingsErrors.get(key);

  if (!standings) {
    return `<section class="team-standings-section"><div class="team-section-heading"><div><span class="eyebrow">Season</span><h2>Standings</h2></div></div><div class="team-page-state compact"><strong>${error ? 'Standings unavailable' : 'Loading standings…'}</strong><p>${error ? 'The standings provider could not be reached. The rest of the team page is unaffected.' : loading ? 'Loading division context and playoff position.' : 'Standings are loading.'}</p></div></section>`;
  }

  if (!standings.available || !standings.group?.entries?.length) {
    return `<section class="team-standings-section"><div class="team-section-heading"><div><span class="eyebrow">Season</span><h2>Standings</h2></div></div><div class="team-page-state compact"><strong>Standings unavailable</strong><p>The provider has not supplied a standings group for this team yet.</p></div></section>`;
  }

  const target = standings.team || {};
  const rank = Number(target.rank);
  const rankLabel = Number.isFinite(rank) ? teamUiOrdinal(rank) : '—';
  const playoff = standings.playoff;
  const postseasonMarkup =
    team.sport === 'NHL'
      ? teamNhlPlayoffMarkup(standings,team)
      : teamPlayoffFieldMarkup(standings,team);

  return `<section class="team-standings-section"><div class="team-section-heading"><div><span class="eyebrow">Season</span><h2>${safeText(standings.group.name || 'Standings')}</h2></div>${standings.season ? `<span>${safeText(standings.season)}</span>` : ''}</div><div class="team-standing-summary"><article class="team-standing-card"><small>Division Standing</small><strong>${safeText(`${rankLabel} in ${String(standings.group.name || 'division').replace(/ Division$/i,'')}`)}</strong><span>${safeText(target.record || 'Record unavailable')}</span></article>${playoff && !standings.playoffField ? `<article class="team-standing-card playoff"><small>Playoff picture</small><strong>${safeText(playoff.label)}</strong><span>${safeText(playoff.detail || playoff.note || 'Current seed not listed')}</span></article>` : ''}</div><div class="team-standing-table" role="table" aria-label="${safeText(standings.group.name || 'Team standings')}"><div class="team-standing-head" role="row"><span>#</span><span>Team</span><span>Record</span><span>${safeText(teamStandingExtra(target,team.sport).label)}</span></div>${standings.group.entries.map(row => teamStandingRowMarkup(row,team)).join('')}</div>${postseasonMarkup}</section>`;
}

function teamTabsMarkup() {
  return `<div class="team-tabs" role="tablist" aria-label="Team page"><button type="button" class="team-tab ${teamPageTab === 'overview' ? 'active' : ''}" data-team-tab="overview" role="tab" aria-selected="${teamPageTab === 'overview'}">Overview</button><button type="button" class="team-tab ${teamPageTab === 'standings' ? 'active' : ''}" data-team-tab="standings" role="tab" aria-selected="${teamPageTab === 'standings'}">Standings</button><button type="button" class="team-tab ${teamPageTab === 'schedule' ? 'active' : ''}" data-team-tab="schedule" role="tab" aria-selected="${teamPageTab === 'schedule'}">Schedule</button></div>`;
}

function teamOverviewMarkup(team,data) {
  const spotlights =
    teamSpotlightRows(
      team,
      data
    );

  return `<div class="team-overview"><section class="team-spotlights"><div class="team-section-heading"><div><span class="eyebrow">SLATEMETER</span><h2>Last & Next</h2></div></div><div class="team-spotlight-grid">${teamSpotlightMarkup('Last Game',spotlights.last,team)}${teamSpotlightMarkup('Next Game',spotlights.next,team)}</div></section>${teamLeaderMarkup(data?.leaders || [])}</div>`;
}

function renderTeamPage() {
  const panel = $('#team-page');
  const list = $('#game-list');
  const empty = $('#empty-state');
  const route = state.teamRoute;

  if (!panel || !list || !empty || !route) {
    return;
  }

  list.innerHTML = '';
  empty.classList.add('hidden');

  const key =
    teamDataKey(route);

  const data =
    teamPageData.get(key);

  const team =
    teamPageTeam();

  if (!team) {
    const catalogReady =
      favoriteCatalog.has(
        route.sport
      );

    const failed =
      teamPageErrors.has(key);

    panel.innerHTML =
      `<button type="button" class="team-back-button" data-team-back>← Back</button><div class="team-page-state"><span class="eyebrow">${safeText(labelForSport(route.sport))}</span><h1>${failed ? 'Team data unavailable' : catalogReady ? 'Loading team…' : 'Loading team…'}</h1><p>${failed ? 'The team page could not be loaded. Return to Slate and try again.' : 'Loading the team profile, season leaders, and full schedule.'}</p></div>`;

    document.title =
      'Team | SlateMeter';

    return;
  }

  const teamGames =
    globalSearchTeamGames(team);

  const identity =
    data?.team || {};

  const record =
    teamPageRecord(
      team,
      teamGames,
      data
    );

  const abbreviation =
    teamPageAbbreviation(
      team,
      teamGames,
      data
    );

  const logo =
    teamPageLogo(
      team,
      teamGames,
      data
    );

  const favorite =
    state.favoriteTeams.some(item =>
      sameFavorite(item,team)
    );

  const heroStanding =
    compactTeamStanding(
      identity.standing
    );

  const heroStandings =
    teamHeroStandings(
      team,
      heroStanding
    );

  const secondaryMeta = [
    identity.venue
  ]
    .filter(Boolean)
    .join(' · ');

  const dataState =
    data
      ? ''
      : teamPageErrors.has(key)
        ? `<div class="team-data-warning">Team profile data is temporarily unavailable. Live scores are still available.</div>`
        : `<div class="team-data-loading">Loading season leaders and full schedule…</div>`;

  const content =
    teamPageTab === 'schedule'
      ? teamScheduleMarkup(
          data?.schedule || [],
          team
        )
      : teamPageTab === 'standings'
        ? teamStandingsMarkup(team)
        : teamOverviewMarkup(
            team,
            data
          );

  panel.innerHTML =
    `<button type="button" class="team-back-button" data-team-back>← Back</button><section class="team-hero"><div class="team-hero-logo">${teamLogoWithFallback(logo,abbreviation || team.name,'','eager')}</div><div class="team-hero-copy"><span class="eyebrow">${safeText(labelForSport(team.sport))}${abbreviation ? ` · ${safeText(abbreviation)}` : ''}</span><h1>${safeText(identity.name || team.name)}</h1><div class="team-hero-meta">${record ? `<span><strong>${safeText(record)}</strong><small>Record</small></span>` : ''}${heroStandings}</div>${secondaryMeta ? `<p>${safeText(secondaryMeta)}</p>` : ''}</div><button type="button" class="team-favorite-button ${favorite ? 'active' : ''}" data-team-favorite aria-pressed="${favorite}">${favorite ? '★ Favorite' : '☆ Add favorite'}</button></section>${teamTabsMarkup()}${dataState}<div class="team-tab-content">${content}</div>`;

  document.title =
    `${identity.name || team.name} | SlateMeter`;
}

function openTeamPage(team) {
  if (!team?.sport || !team?.id) return;

  const nextKey =
    teamDataKey(team);

  if (state.page !== 'team' || activeTeamPageKey !== nextKey || activeDetailGame) {
    teamReturnStack.push({
      hash:location.hash,
      teamTab:teamPageTab,
      page:state.page,teamRoute:state.teamRoute,
      detail:activeDetailGame ? {id:activeDetailGame.id,sport:activeDetailGame.sport,
        tab:activeDetailTab,team:activePlayerTeam,category:activePlayerCategory} : null
    });
  }
  if (activeDetailGame) hideGameDetails({keepRoute:true});

  if (
    activeTeamPageKey !==
    nextKey
  ) {
    activeTeamPageKey =
      nextKey;

    teamPageTab =
      'overview';
  }

  state.teamRoute = {
    sport:team.sport,
    id:String(team.id)
  };

  state.page = 'team';

  loadTeamPageData(team);

  if (['NFL','NHL'].includes(team.sport)) {
    loadTeamStandings(team);
  }

  const nextHash =
    teamHash(team);

  if (location.hash === nextHash) {
    render();
  } else {
    location.hash = nextHash;
  }

  loadFavoriteCatalog()
    .finally(() => {
      if (sameTeamRoute(team)) {
        render();
      }
    });
}

function restoreTeamReturn(context) {
  if (!context) return;
  if (state.page === 'team') {
    teamPageTab = context.teamTab || 'overview';
    renderTeamPage();
  }
  if (context.detail) openGameDetails(context.detail.id,context.detail.sport,context.detail);
}

function returnFromTeamPage() {
  const context = teamReturnStack.pop();
  if (!context) { location.hash = 'home'; return; }
  if (location.hash === context.hash) {
    restoreTeamReturn(context);
  } else {
    pendingTeamReturn = context;
    location.hash = context.hash;
  }
}


function globalSearchGameMeta(game) {
  if (game.state === 'live') {
    return [
      labelForSport(game.sport),
      'LIVE',
      game.live?.phase || game.status
    ].filter(Boolean).join(' · ');
  }

  if (game.state === 'completed') {
    return [
      labelForSport(game.sport),
      game.status || 'Final'
    ].filter(Boolean).join(' · ');
  }

  const start = new Date(game.startTime);
  const when = Number.isFinite(start.getTime())
    ? start.toLocaleString([],{
        weekday:'short',
        hour:'numeric',
        minute:'2-digit'
      })
    : game.status;

  return [
    labelForSport(game.sport),
    when
  ].filter(Boolean).join(' · ');
}

function globalSearchGameMarkup(game) {
  const matchup =
    (game.teams || [])
      .map(team => team?.[0])
      .filter(Boolean)
      .join(' vs ');

  const scores =
    game.state === 'upcoming'
      ? ''
      : (game.teams || [])
          .map(team => team?.[2])
          .filter(value => value !== undefined && value !== null && value !== '')
          .join(' – ');

  const logos = (game.teams || []).slice(0,2).map(team => `<span>${teamLogoWithFallback(team[4] || teamLogoUrl(game.sport,team[1]),team[1] || team[0])}</span>`).join('');
  return `<button type="button" class="search-result search-game-result" data-search-game="${safeText(game.sport)}" data-search-game-id="${safeText(game.id)}"><span class="search-result-leading search-game-logos">${logos}</span><span class="search-result-copy"><strong>${safeText(matchup || 'Game')}</strong><span>${safeText(globalSearchGameMeta(game))}${scores ? ` · ${safeText(scores)}` : ''}</span></span><span class="search-result-rating" style="--score-hue:${scoreHueFor(game.score)}"><small>${game.timingUncertain ? game.heldRatingProvisional ? 'Last observed' : 'Last confirmed' : game.scoringPartial ? 'Provisional' : 'Excitement'}</small><b class="${scoreHeatClass(game.score)}">${safeText(game.score ?? '—')}</b></span></button>`;
}

function renderGlobalSearch() {
  const input = $('#search-query');
  const results = $('#search-results');
  const meta = $('#search-meta');
  const clear = $('#search-clear');

  if (!input || !results || !meta || !clear) return;

  const raw = input.value;
  const query = normalizeGlobalSearch(raw);

  clear.hidden = !raw;

  if (query.length < 2) {
    const topGames =
      games.filter(game=>publicSport(game.sport))
        .sort((a,b) =>
          Number(b.state === 'live') - Number(a.state === 'live') ||
          Number(b.score || 0) - Number(a.score || 0)
        )
        .slice(0,6);

    meta.textContent =
      'Search every game in the current feed, regardless of your active filters.';

    results.innerHTML =
      topGames.length
        ? `<section class="search-section"><h3>Featured Games</h3><div class="search-result-list">${topGames.map(globalSearchGameMarkup).join('')}</div></section>`
        : '<div class="search-empty"><strong>No games loaded yet.</strong><span>Search will be available as soon as the live feed loads.</span></div>';

    visibleGlobalSearchTeams = [];
    return;
  }

  const gameMatches =
    games.filter(game=>publicSport(game.sport))
      .map(game => ({
        game,
        score:globalSearchGameScore(game,query)
      }))
      .filter(item => item.score > 0)
      .sort((a,b) =>
        b.score - a.score ||
        Number(b.game.score || 0) - Number(a.game.score || 0)
      )
      .slice(0,10)
      .map(item => item.game);

  visibleGlobalSearchTeams =
    globalSearchTeams()
      .map(team => ({
        team,
        score:globalSearchTeamScore(team,query)
      }))
      .filter(item => item.score > 0)
      .sort((a,b) =>
        b.score - a.score ||
        a.team.name.localeCompare(b.team.name)
      )
      .slice(0,10)
      .map(item => item.team);

  const gameSection =
    gameMatches.length
      ? `<section class="search-section"><h3>Games</h3><div class="search-result-list">${gameMatches.map(globalSearchGameMarkup).join('')}</div></section>`
      : '';

  const teamSection =
    visibleGlobalSearchTeams.length
      ? `<section class="search-section"><h3>Teams</h3><div class="search-result-list">${visibleGlobalSearchTeams.map((team,index) => {
          const currentGames = globalSearchTeamGames(team);
          const logo = team.logo || (currentGames[0]?.teams || []).find(item =>
            String(item?.[8] || '') === String(team.id || '') ||
            normalizeGlobalSearch(item?.[0]) === normalizeGlobalSearch(team.name)
          )?.[4] || '';

          return `<button type="button" class="search-result search-team-result" data-search-team="${index}"><span class="search-result-leading search-team-logo">${teamLogoWithFallback(logo,team.abbreviation || team.name)}</span><span class="search-result-copy"><strong>${safeText(team.name)}</strong><span>${safeText(labelForSport(team.sport))} · ${currentGames.length ? `${currentGames.length} game${currentGames.length === 1 ? '' : 's'} in current feed` : 'No game in current feed'}</span></span><span class="search-result-arrow" aria-hidden="true">›</span></button>`;
        }).join('')}</div></section>`
      : '';

  const total =
    gameMatches.length +
    visibleGlobalSearchTeams.length;

  meta.textContent = total ? `${total} result${total === 1 ? '' : 's'} for “${raw.trim()}”` : '';

  results.innerHTML =
    gameSection || teamSection
      ? gameSection + teamSection
      : '<div class="search-empty"><strong>No matching games or teams.</strong><span>Try a full team name, abbreviation, sport, or matchup.</span></div>';
}

function renderFavoriteResults() {
  const sport =
    $('#favorite-sport').value;

  const query =
    normalizedTeamName(
      $('#favorite-query').value
    );

  $('#favorite-manual-add').disabled =
    query.length < 2;

  if (query.length < 2) {
    visibleFavoriteSuggestions = [];

    $('#favorite-results').innerHTML =
      '<p class="favorite-empty">Type at least two letters to find a team.</p>';

    return;
  }

  if (!favoriteCatalogRequest) {
    loadFavoriteCatalog();
  }

  visibleFavoriteSuggestions =
    knownFavoriteTeams(sport)
      .filter(team =>
        normalizedTeamName(team.name)
          .includes(query)
      )
      .sort((a,b) =>
        Number(
          normalizedTeamName(b.name)
            .startsWith(query)
        ) -
        Number(
          normalizedTeamName(a.name)
            .startsWith(query)
        ) ||
        a.name.localeCompare(b.name)
      )
      .slice(0,12);

  $('#favorite-results').innerHTML =
    visibleFavoriteSuggestions
      .map((team,index) =>
        `<button type="button" class="favorite-result" data-add-favorite="${index}" ${
          state.favoriteTeams.some(
            item =>
              sameFavorite(
                item,
                team
              )
          )
            ? 'disabled'
            : ''
        }>${
          teamLogoWithFallback(team.logo,team.abbreviation || team.name)
        }<span>${safeText(team.name)}${
          state.favoriteTeams.some(
            item =>
              sameFavorite(
                item,
                team
              )
          )
            ? ' · Added'
            : ''
        }</span></button>`
      )
      .join('') ||
    `<p class="favorite-empty">${
      favoriteCatalog.has(sport)
        ? 'No matching team found.'
        : 'Looking up teams…'
    }</p>`;
}

function addFavoriteTeam(team) {
  if (
    !team?.name ||
    !FAVORITE_SPORTS.includes(team.sport) ||
    state.favoriteTeams.some(
      item =>
        sameFavorite(
          item,
          team
        )
    )
  ) {
    return;
  }

  state.favoriteTeams.push({
    sport:team.sport,
    name:team.name.trim(),
    id:String(team.id || ''),
    logo:String(team.logo || '')
  });

  if (
    HOME_SPORTS.includes(team.sport)
  ) {
    state.visibleSports.add(
      team.sport
    );
  }

  syncFavoriteGames();
  persistFavoriteSelections();
  syncSportToggles();
  renderFavoriteTags();
  renderFavoriteResults();
  render();
}

function addTypedFavorite() {
  const sport =
    $('#favorite-sport').value;

  const name =
    $('#favorite-query')
      .value
      .trim()
      .replace(/\s+/g,' ')
      .slice(0,80);

  if (name.length < 2) {
    return;
  }

  const exact =
    knownFavoriteTeams(sport)
      .find(team =>
        normalizedTeamName(team.name) === normalizedTeamName(name)
      );

  addFavoriteTeam(
    exact || {
      sport,
      name
    }
  );
}

function teamMarkup(game, team, cardTeamIndex = null) {
  const logo =
    team[4] ||
    teamLogoUrl(
      game.sport,
      team[1]
    );

  const image = teamLogoWithFallback(logo,team[1] || team[0],'team-logo');
  const canOpen = cardTeamIndex !== null && ['NFL','MLB','NHL','CFB','NBA','NCAAB','Soccer'].includes(game.sport) && team[8];
  const logoMarkup = canOpen
    ? `<button type="button" class="card-team-link" data-card-team-index="${cardTeamIndex}" aria-label="Open ${safeText(team[0])} team page">${image}</button>`
    : `<span class="team-logo-shell">${image}</span>`;
  return `<span class="team-name">${logoMarkup}<span class="team-name-copy"><span class="team-label">${
    team[6]
      ? `<b class="team-rank">#${safeText(team[6])}</b>`
      : ''
  }<span class="team-name-text"><span class="full-team-name">${safeText(team[0])}</span><span class="short-team-name">${safeText(team[7] || team[0])}</span></span></span>${
    team[5]
      ? `<small class="team-record">${safeText(team[5])}</small>`
      : ''
  }${nhlPowerPlayMarkup(game,team)}</span></span>`;
}

function nhlPowerPlayMarkup(game,team) {
  if (game.sport !== 'NHL' || game.state !== 'live' || game.timingUncertain ||
      game.staleEnrichment || game.summaryValidationPending || game.summaryLifecycleRejected ||
      game.manpowerQuality?.state === 'conflict' || game.manpowerQuality?.state === 'unknown' ||
      /intermission|end of|break|shootout/i.test(game.live?.phase || game.status || '')) return '';
  // The existing validated on-ice state emits this exact team-specific note.
  // Never infer an advantage from a penalty play, score, or missing goalie.
  // No verified timer/strength is serialized by the feed, so neither is invented.
  if (String(game.live?.note || '').trim() !== `${team[0]} power play`) return '';
  return `<span class="team-power-play" aria-label="${safeText(team[0])} power play" title="${safeText(team[0])} power play">PP</span>`;
}

function explainRating(game,summary=null) {
  if(game.timingUncertain)return game.heldRatingProvisional
    ? 'The clock is updating. This is the latest observed rating, pending confirmation.'
    : 'The clock is updating. This rating was last confirmed before the latest plays.';
  // Keep feed and evidence diagnostics out of the public game explanation.
  const evidenceNote='';
  const scoresKnown=game.teams?.length===2&&game.teams.every(t=>t[2]!=null&&String(t[2]).trim()!==''&&Number.isFinite(Number(t[2])));
  const footballExplanation=scoresKnown?globalThis.SportsRadarScore?.footballLiveExplanation?.(game):'';
  if (footballExplanation) return [footballExplanation,evidenceNote].filter(Boolean).join(' ');
  const teams=game.teams || [],names=teams.map(t=>t[0]).filter(Boolean),a=teams[0] || [],b=teams[1] || [];
  if(names.length!==2)return [game.state==='upcoming'?'Confirmed matchup details are not yet available.':game.state==='completed'?'The game has finished; detailed result evidence is unavailable.':'Live game details are still being confirmed.',evidenceNote].filter(Boolean).join(' ');
  const factors=game.factors || [],labels=factors.map(f=>f.label || ''),has=re=>labels.some(x=>re.test(x));
  const sport=game.sport==='NCAAM'?'NCAAB':game.sport,basketball=['NBA','NCAAB'].includes(sport),football=['NFL','CFB'].includes(sport);
  const collegeTeamVerb=(name,singular,plural)=>(['NBA','NHL','MLB','NCAAB'].includes(sport)&&/\s/.test(String(name||'').trim()))?plural:singular;
  const teamPlace=name=>{
    const team=teams.find(t=>t[0]===name),short=String(team?.[7]||'').trim();
    return sport==='NBA'&&short&&name.endsWith(` ${short}`)?name.slice(0,-short.length-1):
      sport==='NBA'&&String(name).includes(' ')?String(name).split(' ').slice(0,-1).join(' '):name;
  };
  const unit=({MLB:'run',NHL:'goal',Soccer:'goal',Tennis:'set'})[sport] || 'point';
  const clean=s=>String(s || '').trim().replace(/\s+/g,' ');
  const sentenceKey=s=>clean(s).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const sentences=[],add=s=>{
    s=clean(s);
    if(s&&!sentences.some(previous=>sentenceKey(previous)===sentenceKey(s)))
      sentences.push(/[.!?]["'\u2019\u201d)\]]*$/.test(s)?s:s+'.');
  };
  const safe=s=>s&&!/capped|adjustment|jointly add|projected competitiveness|winning team quality|before market|[+]\d|\b(?:trajectory|telemetry|scaling|allocation|baseline|retention|leverage points)\b/i.test(s);
  const verified=factors.filter(f=>f.contextType&&f.contextText&&Math.abs(f.points)>=2&&safe(f.contextText)&&
    (f.contextType!=='notable_recent_performance'||/hat trick|record[- ]breaking|milestone|in (?:(?:his|her|their) )?(?:last|past) (?:\d+|two|three|four) games|averaged? .{1,30} in (?:(?:his|her|their) )?(?:last|past) (?:\d+|two|three|four) games/i.test(f.contextText)))
    .map(f=>({...f,publicText:publicStorySentence(f,game.qualitativeContexts)})).filter(f=>safe(f.publicText))
    .sort((x,y)=>Math.abs(y.points)-Math.abs(x.points));
  if(game.state==='upcoming') return pregameExplanation(game,verified);

  const x=Number(a[2]),y=Number(b[2]),known=a[2]!=null&&b[2]!=null&&String(a[2]).trim()!==''&&String(b[2]).trim()!==''&&Number.isFinite(x)&&Number.isFinite(y),gap=known?Math.abs(x-y):null;
  const leader=x>y?a:b,trailer=x>y?b:a;
  const period=Number(game.liveRawStatus?.period),clock=String(game.liveRawStatus?.displayClock || ''),parts=clock.split(':').map(Number),seconds=parts.length===2?parts[0]*60+parts[1]:null;
  const late=basketball?period>=(sport==='NCAAB'?2:4)&&seconds!==null&&seconds<=120:football?period>=4:game.sport==='MLB'?period>=7:game.sport==='NHL'?period>=3:sport==='Soccer'?Number(clock.split(':')[0])>=75:false;
  const regulation=({NCAAB:2,NBA:4,NFL:4,CFB:4,NHL:3,Soccer:2})[sport];
  const overtime=period>regulation || has(/^Overtime$/);
  const shootout=sport==='NHL'&&/shootout/i.test([game.status,game.live?.phase,game.liveRawStatus?.type?.detail].join(' '));
  const overtimeName=period-regulation>1?`${period-regulation}OT`:'overtime';
  const facts=game.basketballFacts;
  if(game.state==='completed') {
    // Re-evaluate event-derived facts against the supplied canonical result. A
    // missing or contradictory ledger must not reuse a stale player narrative.
    const trusted=!game.scoringPartial&&!game.summaryLifecycleRejected&&!game.scoringHistoryRejected&&!game.staleEnrichment;
    const api=globalThis.SportsRadarScore;
    const completed=trusted?(summary?api?.completedGameFacts?.(game,summary):game.completedFacts):null;
    const decisive=trusted&&summary?api?.decisiveScoringPlay?.(game,summary):null;
    const ledger=trusted&&summary?api?.scoringLedger?.(game,summary):null;
    const winnerSide=leader===a?'away':'home',otherSide=winnerSide==='away'?'home':'away';
    const deficit=known&&gap>0&&ledger?.complete?Math.max(0,...ledger.plays.map(p=>Number(p[otherSide+'Score'])-Number(p[winnerSide+'Score']))):0;
    const observedComeback=deficit>=({NFL:7,CFB:7,NBA:8,NCAAB:8,MLB:3,NHL:2,Soccer:2,Tennis:1}[sport]||1)?{team:leader[0],deficit}:null;
    const comeback=completed?.comeback || observedComeback || (trusted&&!summary?facts?.comeback:null);
    const lateChanges=trusted?factors.find(f=>f.points>0&&/^\d+ late lead changes?$/.test(f.label)):null;
    const leadChanges=trusted?factors.find(f=>f.points>0&&/^\d+ lead changes?$/.test(f.label)):null;
    const positive=re=>trusted&&factors.some(f=>f.points>0&&re.test(f.label));
    const comebackTeam=comeback&&teams.find(t=>t[0]===comeback.team);
    const validComeback=comebackTeam&&Number.isFinite(Number(comeback.deficit))&&Number(comeback.deficit)>0;
    const upset=trusted&&game.upsetPoints>0&&game.underdog?.teamId&&String(game.underdog.teamId)===String(leader[8]);
    const finish=shootout?' after a shootout':overtime?(sport==='Soccer'?' after extra time':' in overtime'):'';
    if(known&&gap>0){
      const recovery=validComeback&&comebackTeam===leader?` erased a ${comeback.deficit}-${unit} deficit and`:'';
      add(`${leader[0]}${upset?', the underdog,':''}${recovery} beat ${trailer[0]} ${Math.max(x,y)}–${Math.min(x,y)}${finish}`);
    }else if(known)add(`${names.join(' and ')} finished level at ${x}–${y}${finish}`);
    else add(`${names.join(' and ')} have finished play`);
    const redemption=completed?.redemption;
    const decidingText=clean(decisive?.text || decisive?.shortText);
    if(redemption&&overtime&&decisive&&Number(decisive.period?.number)>regulation&&decidingText.includes(redemption.kicker))
      add(`${redemption.kicker} missed the go-ahead extra point with ${redemption.clock} left in regulation, then won it with an overtime field goal`);
    else if(decidingText&&safe(decidingText)){
      const eventPeriod=Number(decisive.period?.number),eventClock=clean(decisive.clock?.displayValue);
      const when=eventPeriod>regulation?'in overtime':eventClock?`with ${eventClock} ${sport==='NHL'?'elapsed in the final period':'remaining'}`:'late in the game';
      add(`The decisive score came ${when}: ${decidingText}`);
    }else if(validComeback&&comebackTeam!==leader)add(`${comeback.team} erased a ${comeback.deficit}-${unit} deficit along the way`);
    else if(lateChanges){const count=Number(lateChanges.label.match(/^\d+/)[0]);add(`The lead changed ${count===1?'once':count+' times'} in the closing stages`);}
    else if(trusted&&facts?.lateLeadChanges)add('The lead changed hands in the closing stages');
    else if(positive(/Sustained competitive game|Competitive for much of game/) && positive(/Postseason stakes|Advancement or elimination/))add('Postseason stakes added weight to a contest that stayed competitive for much of the game');
    else if(positive(/Repeated swings in control|Big win-chance swing/))add('The chances of winning swung sharply during the game');
    else if(leadChanges){const count=Number(leadChanges.label.match(/^\d+/)[0]);add(`The lead changed ${count===1?'once':count+' times'} during the game`);}
    else if(positive(/Sustained competitive game|Competitive for much of game/))add('The contest stayed close for much of the game');
    else if(gap!==null)add(gap<=({MLB:1,NHL:1,Soccer:1,Tennis:1,NFL:8,CFB:8,NBA:5,NCAAB:5}[sport] || 3)?'The narrow final margin made for a close result':has(/Wide margin/)?'The lopsided final margin limits the appeal of a replay':`The teams finished ${gap} ${unit}${gap===1?'':'s'} apart`);
    return [...sentences.slice(0,2),evidenceNote].filter(Boolean).join(' ');
  }
  if(facts?.comeback)add(`${teamPlace(facts.comeback.team)} erased a ${facts.comeback.deficit}-point deficit${facts.comeback.team===leader[0]&&gap>0?' and took the lead':''}`);
  else if(has(/Erased a multi-goal deficit/i))add('A verified comeback erased a multi-goal deficit');
  else if(has(/Erased a large deficit|comeback/i))add('A comeback has brought the game back to life');
  if(known) {
    const when=shootout?' in the Shootout':overtime?` in ${overtimeName}`:late?' late in the game':'';
    if(gap===0)add(`${names.join(' and ')} are tied ${x}–${y}${when}`);
    else add(`${leader[0]} ${collegeTeamVerb(leader[0],'leads','lead')} ${trailer[0]} ${Math.max(x,y)}–${Math.min(x,y)}${when}`);
  }
  const possession=String(game.liveRawSituation?.possession?.id || game.liveRawSituation?.possession || '');
  const holder=teams.find(t=>String(t[8])===possession);
  if(basketball&&late&&known&&gap<=3) {
    const freeThrow=/free throw/i.test(game.liveRawSituation?.lastPlay?.text || '');
    if(freeThrow)add('Free throws could decide this one, with a single possession separating the teams');
    else if(holder&&holder===trailer)add(`${holder[0]} ${collegeTeamVerb(holder[0],'has','have')} the ball with a chance to ${gap===3?'tie the game':'tie it or take the lead'}`);
    else add(`${seconds!==null&&seconds<60?'With less than a minute remaining, e':'E'}very possession could decide the game`);
  } else {
    const reason=(game.live?.reasons || []).find(r=>safe(r)&&!(game.manpowerQuality?.state==='conflict'&&/power play|extra attacker/i.test(r))&&/has .* (?:yards|points|goals)|power play|bases (?:are )?loaded|no.hit|match point|set point|break point|red zone|fourth down|extra attacker|goalie|potential tying|go-ahead|red card|equaliz|stoppage.time|scoring run/i.test(r));
    if(reason)add(clean(reason));
    else if(has(/Underdog threatens upset/)&&game.underdog?.teamName)add(`${game.underdog.teamName} is threatening an upset`);
    else if(sport==='NHL'&&gap===2)add(late?'The trailing team needs two goals to draw level':'A goal would cut the lead to one, with time remaining to get back into the game');
    else if(gap!==null&&has(/Wide margin/))add(`${trailer[0]} needs to close the ${gap}-${unit} gap${late?' with limited time remaining':''}`);
    else if(facts?.lateLeadChanges)add('The lead has changed hands in the closing stages');

  }
  if(sport==='NCAAB'&&known&&sentences.length===1){
    const firstHalf=period===1;
    const halftime=/half[ -]?time/i.test([game.liveRawStatus?.type?.name,game.liveRawStatus?.type?.detail,game.live?.phase].join(' '));
    const phase=firstHalf?(halftime?'at halftime':seconds!==null&&seconds<=300?'as halftime approaches':'in the first half'):
      late?'with little time left':'in the second half';
    const ranked=teams.filter(t=>Number(t[6])>=1&&Number(t[6])<=25);
    if(gap>=8){
      const context=ranked.length===2?'Both teams are ranked, but ':ranked.includes(leader)?`${leader[0]} ${collegeTeamVerb(leader[0],'is','are')} ranked, but `:'';
      add(`${context}${context?'the':'The'} ${gap}-point gap limits the suspense ${phase}`);
    }else if(firstHalf&&gap<=3)add('A single possession could tie it or change the lead with plenty of game left');
    else if(firstHalf)add('The margin is within reach with a half still to play');
  }
  return [...sentences.slice(0,3),evidenceNote].filter(Boolean).join(' ');
}


function upcomingLinkedStories(game,now=Date.now()) {
  if(game.state!=='upcoming')return [];
  const candidates=[...(game.verifiedDevelopments||[]).filter(d=>d?.verified),...(Array.isArray(game.qualitativeContexts)?game.qualitativeContexts:[]),...(game.editorialStorylines||[])]
    .filter(story=>{
      if(!story||story.verified===false||game.suppressedContextTypes?.includes(story.type))return false;
      const at=story.publishedAt?Date.parse(story.publishedAt):Number(story.sourcePublished)*1000;
      if(story.registryVersion){if(!globalThis.SportsRadarScore?.verifiedCfbContextEligible(story,game,now))return false;}
      else if(!Number.isFinite(at)||at>now+60000||now-at>7*86400000)return false;
      if(!/^https?:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d+)?(?:[/?#]|$)/i.test(story.sourceUrl||''))return false;
      if(/\/(?:recap|preview)(?:[/?]|$)/i.test(story.sourceUrl))return false;
      if(story.type==='notable_recent_performance')return false;
      const text=publicStorySentence(story),key=text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
      return Boolean(key);
    });
  const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const groups=[];
  for(const story of candidates){
    const key=normalize(publicStorySentence(story));
    const same=groups.find(prior=>{
      if(key===normalize(publicStorySentence(prior)))return true;
      if(prior.eventKey&&story.eventKey)return prior.eventKey===story.eventKey;
      const e=prior.evidence,subject=e?.subject;
      if(!subject || !e.owner || prior.type!==(story.discoveredType||story.type))return false;
      if(story.evidence?.subject)return subject===story.evidence.subject&&e.owner===story.evidence.owner;
      const text=normalize(story.sourceDescription||story.text);
      return (story.sourceTeamIds||[]).map(String).includes(String(e.owner)) && text.includes(normalize(subject)+' will start');
    });
    const links=[{url:story.sourceUrl,title:story.sourceTitle,verification:story.verification},...(story.sources||[])];
    if(same) same.sources=[...new Map([...same.sources,...links].map(s=>[s.url,s])).values()];
    else groups.push({...story,sources:[...new Map(links.map(s=>[s.url,s])).values()]});
  }
  return groups.slice(0,3);
}

function publicStorySentence(factor,stories=[]) {
  const clean=s=>String(s || '').trim().replace(/\s+/g,' ');
  if(factor.publicText&&['authoritative-primary','independently-corroborated'].includes(factor.verification))return clean(factor.publicText);
  let text=clean(factor.contextText || factor.text);
  const story=(Array.isArray(stories)?stories:[]).find(item=>item?.type===(factor.contextType || factor.type)&&
    (item.text===(factor.contextText || factor.text) || (item.sourceUrl&&item.sourceUrl===factor.sourceUrl)));
  const title=clean(factor.sourceTitle || story?.sourceTitle);
  const description=clean(factor.sourceDescription || story?.sourceDescription);
  // Editorial discoveries are source headlines, never model-authored prose.
  if((factor.type||factor.contextType)==='editorial_storyline'&&title&&!factor.registryVersion)
    return /[.!?]["'\u2019\u201d)\]]*$/.test(title)?title:title+'.';
  const conditional=/\b(?:if|unless|pending|subject to|could|may|might|not|no|clearance|cleared|questionable|doubtful|uncertain)\b/i;
  // Source evidence may include both a headline and its lede. Public copy
  // uses one statement; the original evidence and mathematical factors stay intact.
  if(title&&text.toLocaleLowerCase().startsWith(title.toLocaleLowerCase())){
    const body=clean(text.slice(title.length).replace(/^[\s.:;\u2013\u2014-]+/,''));
    const candidate=body || description;
    text=candidate&&!(conditional.test(title)&&!conditional.test(candidate))?candidate:text;
  }
  const marker='\uE000';
  const protectedText=text.replace(/\b(?:[A-Z]\.)+(?=\s+[A-Z])/g,s=>s.replaceAll('.',marker))
    .replace(/\b(?:Jr|Sr|St|Dr|Mr|Mrs|Ms|No)\.(?=\s+\S)/g,s=>s.replace('.',marker));
  const first=typeof Intl.Segmenter==='function'
    ? [...new Intl.Segmenter('en',{granularity:'sentence'}).segment(protectedText)][0]?.segment
    : protectedText.match(/^.*?(?:[.!?]["\u201d]?(?:\s|$)|$)/)?.[0];
  // Attribution and quoted reactions are evidence for the story, not another
  // reason to watch. Preserve the main clause, including any uncertainty.
  const sentence=clean(first || text).replaceAll(marker,'.').replace(/,\s+(?:saying|adding|according to)\b[\s\S]*$/i,
    attribution=>conditional.test(attribution)?attribution:'');
  return !sentence || /[.!?]["'\u2019\u201d)\]]*$/.test(sentence)?sentence:sentence+'.';
}


// Editorial interpretation of the displayed quote only. Never feeds the scorer.
function narrativeMarket(game) {
  const sport=game.sport==='NCAAM'?'NCAAB':game.sport,teams=game.teams||[],line=game.line;
  const unknown={kind:'unknown',favorite:null,spread:null};
  if(!line||teams.length!==2)return unknown;
  const token=s=>String(s||'').trim().toUpperCase();
  const price=v=>/^[+-]?\d+$/.test(String(v))&&Math.abs(Number(v))>=100?Number(v):null;
  const implied=n=>n<0?-n/(100-n):100/(100+n);
  const match=String(line.moneyline||'').trim().match(/^(.+?)\s+([+-]\d+)$/);
  const spreadMatch=String(line.spread||'').trim().match(/^(.+?)\s+([+-]\d+(?:\.\d+)?)$/);
  const pick=/^(?:PK|pick(?:\s*['’]?em)?)$/i.test(String(line.spread||'').trim());
  const teamToken=abbr=>sport==='NHL'&&token(abbr)==='UTAH'?'UTA':token(abbr);
  const indexFor=abbr=>teams.findIndex(t=>teamToken(t[1])===teamToken(abbr));
  let named=match?indexFor(match[1]):-1,paired=null;
  // A baseline can contain an older quote. Require the displayed price, provider,
  // team identities and one consistent pair; never mix opening/closing prices.
  for(const raw of game.pregameBaseline?.odds||[]){
    const q=raw.close||raw.closing||raw;
    if(token(q.provider?.name||raw.provider?.name)!==token(line.provider))continue;
    if(!match||String(q.details||q.displayValue||'').trim()!==String(line.moneyline).trim())continue;
    const sideIds=['away','home'].map(s=>q[s+'TeamOdds']?.team?.id);
    if(sideIds.some((id,i)=>id!=null&&String(id)!==String(teams[i][8])))continue;
    if(named<0){
      const side=['away','home'].findIndex(s=>token(q[s+'TeamOdds']?.team?.abbreviation)===token(match[1]));
      if(side>=0&&sideIds[side]!=null)named=side;
    }
    const book=q.moneyline||q.moneyLine;
    if(price(book?.draw?.close?.odds)!==null||price(q.drawOdds?.moneyLine)!==null)continue;
    const modern=['away','home'].map(s=>price(book?.[s]?.close?.odds));
    const legacy=['away','home'].map(s=>price(q[s+'TeamOdds']?.moneyLine??q[s+'TeamOdds']?.moneyline));
    const prices=modern.every(n=>n!==null)?modern:legacy.every(n=>n!==null)?legacy:null;
    if(!prices||named<0||prices[named]!==price(match[2]))continue;
    // Contradictory current quote representations are not a reliable pair.
    if(modern.every(n=>n!==null)&&legacy.some((n,i)=>n!==null&&n!==modern[i]))return {...unknown,conflict:true};
    const sum=prices.reduce((s,n)=>s+implied(n),0);
    if(sum<1||sum>1.12)continue;
    if(paired&&paired.prices.some((n,i)=>n!==prices[i]))return {...unknown,conflict:true};
    paired={prices,probabilities:prices.map(n=>implied(n)/sum)};
  }
  let money=null;
  if(paired){
    const p=Math.max(...paired.probabilities),favorite=paired.probabilities[0]>paired.probabilities[1]?0:1;
    const heavy=({NHL:.70,MLB:.70,Tennis:.80})[sport]||.75;
    money={kind:p<=.525?'even':p<.575?'slight':p<heavy?'meaningful':'heavy',favorite:teams[favorite],probability:p,paired:true};
  }else if(match&&named>=0&&price(match[2])<0){
    // One price includes an unknown margin. Name the listed favorite, but do
    // not call the game even or heavily favored without a complete market.
    const lower=implied(price(match[2]))/1.12;
    if(lower>.5)money={kind:lower>=.575?'meaningful':'listed',favorite:teams[named],paired:false};
  }
  const limits=({NFL:[1,3,10],CFB:[1,3.5,17],NBA:[1,4,12],NCAAB:[1,4,15]})[sport];
  if(limits&&(pick||spreadMatch)){
    const spread=pick?0:Math.abs(Number(spreadMatch[2])),i=spreadMatch?indexFor(spreadMatch[1]):-1;
    const favorite=i<0?null:teams[Number(spreadMatch[2])<0?i:1-i];
    if(money?.favorite&&favorite&&money.kind!=='even'&&money.favorite!==favorite)return {...unknown,conflict:true};
    return {kind:spread<=limits[0]?'even':spread<=limits[1]?'slight':spread<limits[2]?'meaningful':'heavy',favorite,spread,paired:false};
  }
  return money?{...money,spread:null}:unknown;
}

// Presentation only: no ratings, inputs, source evidence or live copy are changed.
function pregameExplanation(game,verified=[]) {
  const teams=game.teams || [],sport=game.sport==='NCAAM'?'NCAAB':game.sport;
  const college=['CFB','NCAAB'].includes(sport),pro=['NFL','NBA','NHL','MLB'].includes(sport);
  const factors=game.factors || [],has=re=>factors.some(f=>re.test(f.label || ''));
  const positive=re=>factors.some(f=>Number(f.points)>0&&re.test(f.label || ''));
  const record=t=>/^\d+-\d+(?:-\d+)?$/.test(String(t[5]||''))?String(t[5]):'';
  const records=teams.map(t=>record(t)?record(t).split('-').map(Number):null);
  const games=records.map(r=>r?r.reduce((a,b)=>a+b,0):0);
  const known=sport!=='Tennis'&&records.every(Boolean)&&games.every(n=>n>0)&&
    records.every(r=>r.length===2||['NHL','NFL','CFB'].includes(sport));
  // NHL overtime losses earn one standings point, not a win. Football ties
  // count as half a win; a 0-0 opener has no record-quality evidence.
  const rates=known?records.map((r,i)=>(r[0]+(['NHL','NFL','CFB'].includes(sport)?(r[2]||0)/2:0))/games[i]):null;
  const bothWinning=rates&&rates.every(r=>r>.5),bothLosing=rates&&rates.every(r=>r<.5);
  const full=t=>String(t[0]||'').trim();
  const name=t=>college?String(t[7]||t[0]).trim():full(t);
  const short=t=>pro&&t[7]&&t[7]!==t[0]?`the ${t[7]}`:name(t);
  const rank=t=>college&&Number.isInteger(Number(t[6]))&&Number(t[6])>=1&&Number(t[6])<=25?Number(t[6]):null;
  const ranked=teams.filter(rank);
  const unbeaten=teams.filter((t,i)=>games[i]>0&&records[i][0]>0&&records[i].slice(1).every(n=>n===0));
  const named=t=>`${rank(t)?`No. ${rank(t)} `:''}${name(t)}`;
  const pair=teams.map(named).join(' and ');
  const withRecord=t=>`${named(t)}${games[teams.indexOf(t)]?` (${record(t)})`:''}`;
  const recordPair=teams.map(withRecord).join(' and ');
  const market=narrativeMarket(game),spread=market.spread,favorite=market.favorite;
  const hasSpread=spread!==null&&['NFL','CFB','NBA','NCAAB'].includes(sport);
  const division=factors.find(f=>/^(?:(?:AFC|NFC) (?:East|North|South|West)|(?:AL|NL) (?:East|Central|West)|(?:Atlantic|Metropolitan|Central|Pacific|Northwest|Southeast|Southwest) Division) matchup$/.test(f.label||''))?.label.replace(' matchup','');
  const rivalry=has(/^Rivalry$|^Rivalry context$/);
  const postseason=has(/World Series|^Championship$|Super Bowl|Stanley Cup Final|Postseason|Playoff|Elimination|Final round/);
  const occasion=game.eventOccasion;
  const opener=has(/^Season opener$/)||records.every(Boolean)&&games.every(n=>n===0);
  const lines=[],add=text=>{
    if(!text)return;
    text=text.trim().replace(/^[a-z]/,c=>c.toUpperCase());
    if(!/[.!?]["'\u2019\u201d)\]]*$/.test(text))text+='.';
    const key=x=>x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    if(!lines.some(line=>key(line)===key(text)))lines.push(text);
  };
  let divisionUsed=false,recordsUsed=false,marketUsed=false;
  if(occasion?.international&&occasion.city) add(`${pair} ${occasion.seasonOpener?'open their seasons':'meet'} in ${occasion.city}${occasion.name?' for the '+occasion.name:''}`);
  else if(has(/World Series/))add(`${pair} meet in the World Series, with a championship on the line`);
  else if(has(/^Championship$|Super Bowl|Stanley Cup Final/))add(`${pair} play for a championship`);
  else if(postseason||sport==='Tennis'&&has(/Major tournament/))add(sport==='Tennis'?`${pair} meet on one of tennis's biggest stages`:`${pair} meet with postseason stakes`);
  else if(ranked.length===2) {
    if(!unbeaten.length&&known&&bothWinning&&hasSpread&&spread>0&&spread<=3.5) {
      add(record(teams[0])===record(teams[1])?
        `${pair} bring matching ${record(teams[0])} records to a ranked matchup with just a ${spread}-point spread`:
        `${recordPair} meet in a ranked matchup with just a ${spread}-point spread`);
      add('That mix of quality and expected closeness makes this one worth circling');
      marketUsed=true;
    } else add(`${recordPair} meet in a ${ranked.every(t=>rank(t)<=10)?'top-10':'ranked'} matchup${unbeaten.length===2?' between unbeaten teams':unbeaten.length===1?`, with ${name(unbeaten[0])}'s unbeaten season on the line`:''}`);
    recordsUsed=true;
  } else if(positive(/^Division lead at stake$/)&&division) {
    add(`${pair} meet with at least a share of the ${division} lead available to either winner`);divisionUsed=true;
  } else if(opener)add(`${pair} open their seasons`);
  else if(ranked.length===1) {
    const contender=ranked[0],opponent=teams.find(t=>t!==contender);
    add(`${withRecord(contender)} faces ${withRecord(opponent)}${unbeaten.includes(contender)?' with an unbeaten season to protect':''}`);recordsUsed=true;
  }
  else if(division) {
    add(`${recordPair} meet with a chance to gain ground on each other in the ${division}`);divisionUsed=true;recordsUsed=true;
  } else if(bothWinning) {
    const actualWinning=records.every((r,i)=>r[0]>games[i]/2);
    add(sport==='NHL'&&!actualWinning?`${recordPair} meet`:
      known&&record(teams[0])===record(teams[1])?`${pair} put matching ${record(teams[0])} records to the test`:
      `${recordPair} bring winning records into this matchup`);recordsUsed=true;
  } else if(unbeaten.length&&sport!=='Tennis') {
    add(`${recordPair} meet with ${unbeaten.length===2?'two unbeaten starts':name(unbeaten[0])+"'s unbeaten start"} on the line`);recordsUsed=true;
  } else if(bothLosing) {
    add(`${recordPair} meet with both teams looking to turn around a difficult start`);recordsUsed=true;
  } else {add(`${recordPair} meet`);recordsUsed=true;}

  const linked=upcomingLinkedStories(game);
  const factualStories=linked.filter(s=>s.publicText && ['authoritative-primary','independently-corroborated'].includes(s.verification));
  if(game.pregameContextSummary)add(game.pregameContextSummary);
  else for(const story of factualStories.slice(0,2))add(publicStorySentence(story));
  // A verified scoring reason belongs in the outlook even when the same
  // evidence also earns a separate source link under Key storylines.
  // Keeping this ledger-driven avoids a special-case rivalry narrative.
  const cfbScoredStories=sport==='CFB'
    ? verified.filter(f=>f.points>0&&f.publicText&&
      !['international_showcase','season_opener'].includes(f.contextType)).slice(0,2)
    : [];
  for(const story of cfbScoredStories)add(story.publicText);
  const rivalryStory=verified.find(f=>f.contextType==='rivalry'&&
    !/\/(?:recap|preview)(?:[/?]|$)/i.test(f.sourceUrl||''));
  if(rivalryStory&&!linked.some(s=>s.type==='rivalry')&&!cfbScoredStories.includes(rivalryStory))add(rivalryStory.publicText);
  else if(rivalry&&!rivalryStory)add(unbeaten.length===1?
    `The rivalry gives ${name(unbeaten[0])}'s unbeaten run an added test`:'Rivalry stakes add another reason to follow this meeting');
  if(division&&!divisionUsed) {
    add(positive(/^Division race positioning$/)?`Their ${division} meeting also carries weight near the top of the division`:
      `They are also ${division} opponents${sport==='NFL'?', with a head-to-head division result at stake':''}`);
  }

  const minimumGames=({NFL:4,CFB:4,NBA:5,NCAAB:5,NHL:8,MLB:20})[sport];
  const comparableRecords=known&&minimumGames&&games.every(n=>n>=minimumGames)&&
    Math.max(...games)/Math.min(...games)<=1.5&&!game.interDivision;
  const gap=comparableRecords?Math.abs(rates[0]-rates[1]):0;
  const stronger=comparableRecords?teams[rates[0]>rates[1]?0:1]:null;
  const recordGap=({NFL:.20,CFB:.25,NBA:.20,NCAAB:.25,NHL:.15,MLB:.10})[sport];
  const againstRecord=favorite&&stronger!==favorite&&gap>=recordGap;
  const marketName=favorite?short(favorite):'the listed favorite';
  const verb=pro?'are':'is';
  const strength=kind=>kind==='listed'?'favored':`${pro?'':'a '}${kind==='heavy'?'heavy':kind==='meaningful'?'clear':'slight'} ${pro?'favorites':'favorite'}`;
  if(marketUsed) { /* The ranked-matchup lead already explains the line. */ }
  else if(market.conflict)add('The listed markets give conflicting expectations');
  else if(againstRecord&&market.kind!=='even') {
    add(`${short(stronger)} ${pro?'have':'has'} the stronger record${sport==='NHL'?' by points percentage':''}, but ${marketName} ${verb} ${strength(market.kind)}${hasSpread?` by ${spread} points`:' in the listed market'}`);
  }
  else if(hasSpread) {
    if(market.kind==='even')add(spread===0?'An even line sets up a game that could go either way':`A ${spread}-point spread leaves little between the teams`);
    else if(market.kind==='slight')add(`${favorite?`${marketName} ${verb} ${strength('slight')}`:'A narrow line points to a close contest'}${spread?` with a ${spread}-point spread`:''}${sport==='NFL'&&spread===3?', the margin of a field goal':'; the line points to a close contest'}`);
    else add(`${favorite?`${marketName} ${verb} ${strength(market.kind)} by ${spread} points`:`A ${spread}-point spread gives one side a ${market.kind==='heavy'?'large':'clear'} edge`}${market.kind==='heavy'?', so a one-sided game is a real possibility':''}`);
  } else if(market.kind==='even')add('The listed odds leave little between the teams');
  else if(favorite)add(`${marketName} ${verb} ${strength(market.kind)} in the listed market`);
  else if(known&&Math.abs(rates[0]-rates[1])<.1) {
    add(bothLosing?'Neither has pulled away from the other on results so far':sport==='NHL'?
      'There is little between them on results so far':'Their similar records suggest a competitive game');
  } else if(comparableRecords&&gap>=recordGap) {
    add(`${short(stronger)} ${college?'looks':'look'} the stronger side on results so far`);
  }
  if(!againstRecord&&favorite&&['meaningful','heavy'].includes(market.kind)&&comparableRecords){
    const other=teams.find(t=>t!==favorite),otherRate=rates[teams.indexOf(other)];
    if(gap<.08)add('Their records are similar, even though the market gives one side a clear advantage');
    else if(stronger===favorite&&otherRate<.4)add(`${short(other)} ${pro?'have':'has'} struggled so far and ${pro?'face':'faces'} another difficult test`);
    else if(market.kind==='heavy'&&otherRate>.55)add(`${short(other)} ${pro?'have':'has'} a strong record of ${record(other)} despite the large gap in market expectations`);
  }

  // Totals describe expectations, never assert offensive quality or an outcome.
  const total=Number(game.line?.total);
  if(sport==='NFL'&&positive(/^Expected scoring potential$|^Close-game scoring upside$/)&&Number.isFinite(total)&&total>0) {
    add(total>=50?`The listed total of ${total} suggests the potential for plenty of scoring`:`The listed total is ${total}, adding some scoring appeal`);
  }
  if(!recordsUsed&&known&&bothWinning&&lines.length<3&&sport!=='NHL')add(`Both teams have winning records (${teams.map(record).join(' and ')})`);
  for(const story of verified.filter(f=>!['international_showcase','season_opener'].includes(f.contextType))) {
    if(cfbScoredStories.includes(story)||linked.some(item=>item.type===story.contextType)||story.contextType==='rivalry'&&rivalry||/\/(?:recap|preview)(?:[/?]|$)/i.test(story.sourceUrl||''))continue;
    if(lines.length>=5)break;
    add(story.publicText);
  }
  // A limitation earns its place only when it explains a weak matchup; no
  // comparisons with imaginary better opponents, and no missing-odds filler.
  if(bothLosing&&!postseason&&lines.length<3&&!lines[0].includes('difficult start'))
    add('Both teams are trying to turn around a difficult start');
  if(!known&&spread===null&&!postseason&&!verified.length&&lines.length===1&&sport!=='Tennis'&&!opener)
    add('Further matchup details are not available yet');
  return lines.slice(0,5).join(' ');
}

function trendFor(game) {
  if(game.timingUncertain||game.scoringPartial)return '';
  if (game.pregameBaseline?.source !== 'observed') return '';
  if (
    game.state === 'upcoming' ||
    !Number.isFinite(game.pregameBaseline.score) ||
    !Number.isFinite(game.score)
  ) {
    return '';
  }

  const delta = game.score - game.pregameBaseline.score;

  const direction = delta > 2 ? 'rising' : delta < -2 ? 'falling' : 'steady';
  const path = direction === 'rising' ? 'M3 13 13 3M5 3h8v8'
    : direction === 'falling' ? 'M3 3 13 13M5 13h8V5' : 'M2 8h12M9 3l5 5-5 5';
  const arrow = `<svg class="trend-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;

  return `<small class="score-trend" aria-label="${
    delta > 2 ? 'Rising' : delta < -2 ? 'Falling' : 'Steady, change of'
  } ${Math.abs(delta)} ${Math.abs(delta)===1?'point':'points'} from the opening rating">${arrow}<span>${
    delta > 0
      ? '+'
      : ''
  }${delta} from opening</span></small>`;
}

function isWinningTeam(game, team) {
  if (game.state !== 'completed' || !Array.isArray(game.teams)) {
    return false;
  }

  const scores = game.teams.map(item => Number(item?.[2]));
  const score = Number(team?.[2]);

  return scores.length === 2 &&
    scores.every(Number.isFinite) &&
    scores[0] !== scores[1] &&
    Number.isFinite(score) &&
    score === Math.max(...scores);
}

function basesMarkup(bases) {
  if (!bases) return '';

  const names =
    Object.entries(bases)
      .filter(
        ([,occupied]) =>
          occupied
      )
      .map(
        ([base]) =>
          base
      );

  return `<span class="base-diamond" role="img" aria-label="${safeText(
    names.length
      ? `Runners on ${names.join(' and ')}`
      : 'Bases empty'
  )}"><i class="base second ${bases.second ? 'occupied' : ''}"></i><i class="base third ${bases.third ? 'occupied' : ''}"></i><i class="base first ${bases.first ? 'occupied' : ''}"></i></span>`;
}

function compactClockPeriod(game) {
  const phase = String(game.live?.phase || game.status || '')
    .replace(/\b\d{1,2}:\d{2}\b/g,'').replace(/^[\s·|,-]+|[\s·|,-]+$/g,'');
  const status = game.liveRawStatus?.type;
  const season = game.sourceEvent?.season || game.sourceCompetition?.season;
  const shootoutStatus = [phase,game.status,status?.name,status?.detail,status?.shortDetail].join(' ');
  if (game.sport === 'NHL' && (/shootout|\bSO\b/i.test(shootoutStatus) ||
    (Number(game.liveRawStatus?.period) === 5 && Number(season?.type?.id ?? season?.type) === 2))) return 'Shootout';
  if (/shootout/i.test(phase)) return 'SO';
  if (/halftime|half time/i.test(phase)) return 'Half';
  if (/intermission|end of|break/i.test(phase)) return phase;
  const overtime = phase.match(/(?:(\d+)\s*(?:st|nd|rd|th)?\s*)?(?:OT\b|overtime)/i);
  if (overtime) return Number(overtime[1]) > 1 ? `${Number(overtime[1])}OT` : 'OT';
  const period = Number(game.liveRawStatus?.period) || Number(phase.match(/\b(\d+)(?:st|nd|rd|th)\b|\bQ(\d+)\b/i)?.slice(1).find(Boolean));
  const format = game.sourceCompetition?.format || game.sourceEvent?.competitions?.[0]?.format || game.format || {};
  const regulation = game.sport === 'NCAAB'
    ? Number(format.regulation?.periods) || (/quarter|\bQ\d/i.test(phase) ? 4 : 2)
    : {NFL:4,CFB:4,NBA:4,NHL:3}[game.sport];
  if (regulation && period > regulation) return period === regulation + 1 ? 'OT' : `${period-regulation}OT`;
  if (period > 0 && period <= 4) return ['1st','2nd','3rd','4th'][period-1];
  return phase || 'Live';
}

function broadcastWatchMarkup(game,summary=null,inline=false) {
  const channel = game.channel || 'Channel not listed';
  const links = globalThis.SportsRadarWatch?.resolve(game,summary) || [];
  if (!links.length) return inline ? safeText(channel) : '';
  const anchor = (link,name=link.name) => `<a class="broadcast-watch-link" href="${safeText(link.url)}" target="_blank" rel="noopener noreferrer" aria-label="Watch on ${safeText(name)} (opens externally)" title="${link.direct ? 'Open this game' : 'Browse sports'} on ${safeText(name)}">${inline ? '' : 'Watch on '}${safeText(name)}<svg class="external-link-icon" viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false"><path d="M9 2h5v5M14 2 7 9M6 3H2v11h11v-4"/></svg></a>`;
  if (!inline) return `<span class="broadcast-watch-actions">${links.map(link=>anchor(link)).join('')}</span>`;
  // Keep the original broadcast row and all labels; link supported providers in place.
  const rendered = new Set();
  const labels = String(channel).split(/(\s*[·,;/|&]\s*)/).map(label=>{
    const provider = globalThis.SportsRadarWatch.providers.find(item=>item.aliases.test(label.trim()));
    const link = links.find(item=>item.provider === provider?.id);
    if (!link) return safeText(label);
    rendered.add(link.provider);
    return anchor(link,label.trim());
  }).join('');
  return labels + links.filter(link=>!rendered.has(link.provider)).map(link=>` · ${anchor(link)}`).join('');
}

function gameCard(game) {
  const liveNote=game.timingUncertain||game.manpowerQuality?.state==='conflict' ? '' : game.live?.note;
  const phase = String(game.live?.phase || game.status || '');
  const clock = game.timingUncertain ? '' : String(game.liveRawStatus?.displayClock || phase.match(/\b\d{1,2}:\d{2}\b/)?.[0] || '');
  const period = compactClockPeriod(game);
  const ncaabHalftime=game.sport==='NCAAB'&&Boolean(halftimePriorityAdjustment(game));
  const betweenPeriods = /halftime|half time|intermission|end of|end[_ ]period|break/i.test([phase,game.status,game.liveRawStatus?.type?.name].join(' '));
  const clockMarkup = game.state === 'live' && !betweenPeriods && !ncaabHalftime && (clock || period === 'Shootout')
    ? `<span class="card-clock"><span>${safeText(period || 'Live')}</span>${period === 'Shootout' ? '' : `<strong>${safeText(clock)}</strong>`}</span>`
    : '';
  const cardTeam = (team,index) => teamMarkup(game,team,index);
  const scoreClass = scoreHeatClass(game.score);
  const scoreColorStyle = `--score-hue:${scoreHueFor(game.score)};`;

  const stateLabel =
    game.state === 'live'
      ? `<span class="status-live"${halftimePriorityAdjustment(game) ? ' title="Halftime: ranked 6 points lower for viewing priority; excitement rating unchanged."' : ''}>${halftimePriorityAdjustment(game) ? 'HALFTIME' : '● LIVE'}</span>${
          !game.timingUncertain && game.live?.phase &&
          game.live.phase !== 'Live' && !halftimePriorityAdjustment(game)
            ? `<span class="live-phase">${safeText(game.live.phase)}</span>`
            : ''
        }${game.timingUncertain?'<span class="status-provisional">Clock updating</span>':game.scoringPartial?'<span class="status-provisional">Provisional rating</span>':''}`
      : `<span class="status-${game.state}">${safeText(game.status)}</span>`;

  const leagueLogo =
    game.leagueLogo ||
    LEAGUE_LOGOS[game.sport];

  const line =
    displayLine(game);

  // Card-only wording; retain closing/pregame provenance and full market values.
  const compactLineLabel = line.label === 'Current line' ? 'Odds'
    : line.label === 'Closing line' ? 'Closing odds' : 'Pregame odds';
  const compactLineText = line.text.replace(/^(?:Puck line|Run line|Spread) /,'').replace(/\bMoneyline /g,'ML ');

  const situation =
    ['NFL','CFB'].includes(game.sport) ? footballSituationMarkup(game) :
    game.sport === 'MLB' ? baseballSituationMarkup(game) :
    game.state === 'live' &&
    (
      liveNote ||
      game.live?.bases
    )
      ? `<span class="live-situation">${basesMarkup(game.live?.bases)}${
          liveNote
            ? `<span>${safeText(liveNote)}</span>`
            : ''
        }</span>`
      : '';

  const momentMarkup =
    game.timingUncertain || game.enrichmentPending || game.summaryValidationPending
      ? ''
      : game.moment
      ? `<span class="card-moment" data-moment-kind="${game.momentLabel === 'Last score' ? 'last-score' : 'context'}"><strong>${safeText(game.momentLabel || 'Latest play')}</strong><span>${safeText(displayMoment(game))}</span></span>`
      : '';

  const accessibility = [
    game.teams[0][0],
    game.state === 'upcoming' ? 'versus' : game.teams[0][2],
    game.teams[1][0],
    game.state === 'upcoming' ? '' : game.teams[1][2],
    game.live?.phase,
    ...(['NFL','CFB'].includes(game.sport) ? footballAccessibleSituation(game) : [liveNote]),
    ...(game.sport === 'MLB' ? [game.baseballSituation?.outs != null ? `${game.baseballSituation.outs} outs` : '',game.baseballSituation?.count ? `count ${game.baseballSituation.count}` : ''] : []),
    game.live?.bases
      ? Object.entries(game.live.bases)
          .filter(([,on]) => on)
          .map(([base]) => base)
          .join(' and ')
      : '',
    `${game.timingUncertain?game.heldRatingProvisional?'last observed rating, clock updating':'last confirmed rating, clock updating':game.state==='live'&&game.scoringPartial?'provisional watch now rating':game.state==='live'?'watch now rating':game.state==='completed'?'game quality':'pregame rating'} ${game.score==null?'pending':game.score}`,
    'Open game details'
  ]
    .filter(Boolean)
    .join(', ');

  const completionClass =
    game.state === 'completed'
      ? 'completed-card'
      : '';

  const pregame = game.state === 'upcoming';
  return `<article class="game-card ${
    game.favorite
      ? 'favorite'
      : ''
  } ${
    isWatched(game)
      ? 'watched'
      : ''
  } ${completionClass}" data-id="${safeText(game.id)}" data-sport="${safeText(game.sport)}" data-division="${safeText(game.division || '')}"><button type="button" class="card-open-target" data-open-game aria-label="${safeText(accessibility)}"></button><span class="sport-icon"><img class="league-logo" src="${safeText(leagueLogo)}" alt="" loading="lazy" onerror="this.style.display='none'"></span><span class="team-column${pregame ? ' pregame' : ''}"><span class="match-meta">${stateLabel}<span class="mobile-card-league">${safeText(game.sport === 'NCAAB' ? 'NCAAM' : game.sport)}</span>${
    isWatched(game)
      ? '<span class="watch-indicator" aria-hidden="true">★ Watching</span>'
      : ''
  }${
    game.division
      ? `<span>•</span><span>${safeText(game.division)}</span>`
      : ''
  }<span class="card-secondary-meta" aria-hidden="true">·</span><span class="card-secondary-meta">${safeText(game.sub)}</span><span class="card-rating-change">${trendFor(game)}</span>${clockMarkup}</span><span class="team-row ${isWinningTeam(game,game.teams[0]) ? 'winner-row' : ''}">${cardTeam(game.teams[0],0)}<b class="team-score">${possessionMarkup(game,game.teams[0])}${pregame ? '' : safeText(game.teams[0][2])}</b></span><span class="team-row ${isWinningTeam(game,game.teams[1]) ? 'winner-row' : ''}">${cardTeam(game.teams[1],1)}<b class="team-score">${possessionMarkup(game,game.teams[1])}${pregame ? '' : safeText(game.teams[1][2])}</b></span>${pregame ? '<span class="pregame-versus">VS</span>' : ''}${situation}</span>${momentMarkup}<span class="game-context channel-context"><span class="detail-inline"><strong>TV</strong><span class="broadcast-labels" title="${safeText(game.channel || 'Channel not listed')}">${broadcastWatchMarkup(game,null,true)}</span></span><span class="stats-cue">Game Center</span><span class="detail-inline line-inline"><strong>${safeText(compactLineLabel)}</strong><span title="${safeText(`${line.label}: ${line.text}`)}">${safeText(compactLineText)}</span></span></span><span class="excitement" style="${scoreColorStyle}"><span class="score-circle ${scoreClass}">${game.score}</span>${trendFor(game)}</span></article>`;
}

function footballAccessibleSituation(game) {
  if (game.state !== 'live' || globalThis.SportsRadarScore?.isHalftimeStatus?.(game.liveRawStatus)) return [];
  const situation = game.footballSituation;
  const holder = game.teams.find(team => team[8] && String(team[8]) === situation?.possessionTeamId);
  return [holder ? `${holder[0]} possession` : '',situation?.downAndDistance,situation?.fieldPosition];
}

function possessionMarkup(game,team) {
  if (game.state !== 'live' || globalThis.SportsRadarScore?.isHalftimeStatus?.(game.liveRawStatus) || !['NFL','CFB'].includes(game.sport) || !team[8] || String(team[8]) !== game.footballSituation?.possessionTeamId || game.teams.filter(item => String(item[8]) === String(team[8])).length !== 1) return '';
  return '<svg class="possession-marker" viewBox="0 0 24 16" aria-hidden="true"><path d="M2 8Q6-2 22 8Q18 18 2 8Z" fill="currentColor"/><path d="M8 8h8m-6-2v4m4-4v4" stroke="var(--surface, #222629)" stroke-width="1.4"/></svg>';
}

function footballSituationMarkup(game) {
  if (game.state !== 'live') return '';
  if (globalThis.SportsRadarScore?.isHalftimeStatus?.(game.liveRawStatus)) return '';
  const situation = game.footballSituation;
  if (!situation?.downAndDistance && !situation?.fieldPosition) return '';
  return `<span class="football-situation">${situation.downAndDistance ? `<strong>${safeText(situation.downAndDistance)}</strong>` : ''}${situation.fieldPosition ? `<span>${safeText(situation.fieldPosition)}</span>` : ''}</span>`;
}

function baseballSituationMarkup(game) {
  if (game.state !== 'live') return '';
  const situation = game.baseballSituation;
  if (!situation) return '';
  const bases = situation.bases ? basesMarkup(situation.bases) : '';
  const outs = situation.outs == null ? '' : `<span class="baseball-outs" role="img" aria-label="${situation.outs} ${situation.outs === 1 ? 'out' : 'outs'}">${[0,1,2].map(index => `<i class="out-dot ${index < situation.outs ? 'active' : ''}"></i>`).join('')}</span>`;
  const count = situation.count ? `<strong class="baseball-count" aria-label="Count ${safeText(situation.count)}">${safeText(situation.count)}</strong>` : '';
  return bases || outs || count ? `<span class="live-situation baseball-situation">${bases}${outs}${count}</span>` : '';
}

function basketballPeriodLabel(sport,index) {
  if (sport === 'NCAAB') {
    return index < 2
      ? `${index + 1}H`
      : index === 2
        ? 'OT'
        : `${index - 1}OT`;
  }

  return index < 4
    ? `Q${index + 1}`
    : index === 4
      ? 'OT'
      : `${index - 3}OT`;
}

function basketballStatKey(value) {
  const text =
    String(value || '')
      .trim()
      .toLowerCase();

  if (
    text === '+/-' ||
    text === 'plus/minus' ||
    text === 'plus-minus' ||
    text === 'plus minus'
  ) {
    return 'plusminus';
  }

  return text.replace(/[^a-z0-9]/g,'');
}

function basketballRawTeamData(summary,teamId) {
  const blocks =
    summary?.boxscore?.players || [];

  const block =
    blocks.find(item =>
      String(item?.team?.id || '') ===
      String(teamId || '')
    );

  if (!block) {
    return {
      players:new Map(),
      totals:{}
    };
  }

  const players = new Map();
  const totals = {};

  const addStats = (target,group,values) => {
    const labels =
      Array.isArray(group?.labels) && group.labels.length
        ? group.labels
        : Array.isArray(group?.names) && group.names.length
          ? group.names
          : Array.isArray(group?.keys)
            ? group.keys
            : [];

    labels.forEach((label,index) => {
      const key = basketballStatKey(label);
      if (
        key &&
        values?.[index] !== undefined &&
        values?.[index] !== null &&
        values?.[index] !== ''
      ) {
        target[key] = String(values[index]);
      }
    });
  };

  for (const group of block.statistics || []) {
    for (const entry of group.athletes || []) {
      const name =
        entry?.athlete?.displayName ||
        entry?.athlete?.shortName ||
        'Player';

      const id =
        String(entry?.athlete?.id || '');

      const lookup =
        id ||
        `name:${basketballStatKey(name)}`;

      const current =
        players.get(lookup) || {
          stats:{},
          ejected:false
        };

      addStats(
        current.stats,
        group,
        entry.stats
      );

      current.ejected =
        current.ejected ||
        entry.ejected === true ||
        entry.athlete?.ejected === true;

      players.set(lookup,current);

      if (id) {
        players.set(
          `name:${basketballStatKey(name)}`,
          current
        );
      }
    }

    if (
      Array.isArray(group.totals) &&
      group.totals.length
    ) {
      addStats(
        totals,
        group,
        group.totals
      );
    }
  }

  return {
    players,
    totals
  };
}

function basketballRawValue(stats,aliases) {
  if (!stats) return null;

  for (const alias of aliases) {
    const value =
      stats[basketballStatKey(alias)];

    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      return value;
    }
  }

  return null;
}

const BASKETBALL_EXTRA_COLUMNS = [
  {
    key:'offensiveRebounds',
    label:'OREB',
    aliases:['OREB','offensiveRebounds','offensiveRebound']
  },
  {
    key:'defensiveRebounds',
    label:'DREB',
    aliases:['DREB','defensiveRebounds','defensiveRebound']
  },
  {
    key:'plusMinus',
    label:'+/-',
    aliases:['+/-','plusMinus','plusMinusPoints']
  }
];

function basketballMergePlayers(players) {
  const merged = new Map();

  for (const player of players || []) {
    const key =
      String(player?.id || '') ||
      `name:${basketballStatKey(player?.name)}`;

    if (!merged.has(key)) {
      merged.set(
        key,
        {
          ...player,
          stats:{...(player?.stats || {})}
        }
      );
      continue;
    }

    const current = merged.get(key);

    current.stats = {
      ...(current.stats || {}),
      ...(player?.stats || {})
    };

    if (
      current.starter === null ||
      current.starter === undefined
    ) {
      current.starter = player.starter;
    }

    current.didNotPlay =
      current.didNotPlay ||
      player.didNotPlay === true;

    current.dnpReason =
      current.dnpReason ||
      player.dnpReason ||
      '';
  }

  return [...merged.values()];
}

function basketballExpandedBoxScoreTeams(summary) {
  const normalized =
    summary?.basketballBoxScore?.teams || [];

  return normalized.map(team => {
    const raw =
      basketballRawTeamData(
        summary,
        team.teamId
      );

    const players =
      basketballMergePlayers(team.players)
        .map(player => {
          const lookup =
            String(player.id || '') ||
            `name:${basketballStatKey(player.name)}`;

          const rawPlayer =
            raw.players.get(lookup) ||
            raw.players.get(
              `name:${basketballStatKey(player.name)}`
            ) ||
            {
              stats:{},
              ejected:false
            };

          const extra =
            Object.fromEntries(
              BASKETBALL_EXTRA_COLUMNS.map(column => [
                column.key,
                basketballRawValue(
                  rawPlayer.stats,
                  column.aliases
                )
              ])
            );

          return {
            ...player,
            extra,
            ejected:rawPlayer.ejected
          };
        });

    const totalExtra =
      Object.fromEntries(
        BASKETBALL_EXTRA_COLUMNS.map(column => [
          column.key,
          basketballRawValue(
            raw.totals,
            column.aliases
          )
        ])
      );

    return {
      ...team,
      players,
      totalExtra
    };
  });
}

function basketballBoxScoreMarkup(summary,sport) {
  if (!['NBA','NCAAB'].includes(sport)) return '';

  const teams =
    basketballExpandedBoxScoreTeams(summary);

  if (!teams.length) {
    return '<section class="detail-section"><h3>Box Score</h3><p class="detail-empty">Box score unavailable</p></section>';
  }

  const baseColumns = [
    {key:'minutes',label:'MIN'},
    {key:'fg',label:'FG'},
    {key:'threePt',label:'3PT'},
    {key:'ft',label:'FT'}
  ];

  const tailColumns = [
    {key:'rebounds',label:'REB'},
    {key:'assists',label:'AST'},
    {key:'steals',label:'STL'},
    {key:'blocks',label:'BLK'},
    {key:'turnovers',label:'TO'},
    {key:'fouls',label:'PF'}
  ];

  const hasExtra = key =>
    teams.some(team =>
      team.players.some(player =>
        !player.didNotPlay &&
        player.extra?.[key] !== null &&
        player.extra?.[key] !== undefined &&
        player.extra?.[key] !== ''
      ) ||
      (
        team.totalExtra?.[key] !== null &&
        team.totalExtra?.[key] !== undefined &&
        team.totalExtra?.[key] !== ''
      )
    );

  const extraBeforeRebounds =
    BASKETBALL_EXTRA_COLUMNS
      .filter(column =>
        ['offensiveRebounds','defensiveRebounds'].includes(column.key) &&
        hasExtra(column.key)
      );

  const plusMinus =
    BASKETBALL_EXTRA_COLUMNS
      .filter(column =>
        column.key === 'plusMinus' &&
        hasExtra(column.key)
      );

  const columns = [
    ...baseColumns,
    ...extraBeforeRebounds,
    ...tailColumns,
    ...plusMinus,
    {key:'points',label:'PTS'}
  ];

  const valueFor = (source,column) =>
    BASKETBALL_EXTRA_COLUMNS.some(extra =>
      extra.key === column.key
    )
      ? source?.extra?.[column.key]
      : source?.stats?.[column.key];

  const totalValueFor = (team,column) =>
    BASKETBALL_EXTRA_COLUMNS.some(extra =>
      extra.key === column.key
    )
      ? team.totalExtra?.[column.key]
      : team.totals?.[column.key];

  const cells = source =>
    columns
      .map(column =>
        `<td>${safeText(valueFor(source,column) ?? '—')}</td>`
      )
      .join('');

  const totalCells = team =>
    columns
      .map(column =>
        `<td>${safeText(totalValueFor(team,column) ?? '—')}</td>`
      )
      .join('');

  const playerRow = (player,showRole) => {
    const status =
      player.ejected
        ? '<small class="box-player-status box-ejected">Ejected</small>'
        : showRole ||
          player.starter === null ||
          player.starter === undefined
          ? ''
          : `<small class="box-player-role">${player.starter ? 'Starter' : 'Bench'}</small>`;

    if (player.didNotPlay) {
      return `<tr class="box-dnp"><th scope="row">${safeText(player.name)}</th><td colspan="${columns.length}" class="box-dnp-reason">DNP${player.dnpReason ? ` · ${safeText(player.dnpReason)}` : ''}</td></tr>`;
    }

    return `<tr><th scope="row">${safeText(player.name)}${status}</th>${cells(player)}</tr>`;
  };

  const playerRows = team => {
    const players =
      team.players || [];

    const active =
      players.filter(player =>
        !player.didNotPlay
      );

    const dnp =
      players.filter(player =>
        player.didNotPlay
      );

    const hasStarterGroups =
      active.some(player =>
        player.starter === true
      );

    const rows = [];

    if (hasStarterGroups) {
      const starters =
        active.filter(player =>
          player.starter === true
        );

      const bench =
        active.filter(player =>
          player.starter !== true
        );

      if (starters.length) {
        rows.push(
          `<tr class="box-group-row"><th colspan="${columns.length + 1}">Starters</th></tr>`
        );
        rows.push(
          ...starters.map(player =>
            playerRow(player,true)
          )
        );
      }

      if (bench.length) {
        rows.push(
          `<tr class="box-group-row"><th colspan="${columns.length + 1}">Bench</th></tr>`
        );
        rows.push(
          ...bench.map(player =>
            playerRow(player,true)
          )
        );
      }
    } else {
      rows.push(
        ...active.map(player =>
          playerRow(player,false)
        )
      );
    }

    if (dnp.length) {
      rows.push(
        `<tr class="box-group-row box-dnp-group"><th colspan="${columns.length + 1}">Did not play</th></tr>`
      );
      rows.push(
        ...dnp.map(player =>
          playerRow(player,true)
        )
      );
    }

    return rows.join('');
  };

  return `<section class="detail-section basketball-box-score"><h3>Box Score</h3><div class="detail-player-grid">${teams.map(team => `<div class="detail-player-team"><h4>${safeText(team.displayName)}</h4>${team.periods?.length ? `<p class="box-periods">${team.periods.map((period,index) => `${basketballPeriodLabel(sport,index)} ${safeText(period.value)}`).join(' · ')}</p>` : ''}<div class="detail-table-scroll" tabindex="0" role="region" aria-label="${safeText(team.displayName)} box score, scroll for more statistics"><table class="detail-player-table basketball-player-table"><thead><tr><th scope="col">Player</th>${columns.map(column => `<th scope="col">${safeText(column.label)}</th>`).join('')}</tr></thead><tbody>${playerRows(team)}</tbody>${team.totals ? `<tfoot><tr><th scope="row">TEAM</th>${totalCells(team)}</tr></tfoot>` : ''}</table></div></div>`).join('')}</div></section>`;
}

const TEAM_STAT_CONFIG = {
  NBA:[['FG','fieldGoalsMade-fieldGoalsAttempted','fieldGoalPct'],['3PT','threePointFieldGoalsMade-threePointFieldGoalsAttempted','threePointFieldGoalPct'],['FT','freeThrowsMade-freeThrowsAttempted','freeThrowPct'],['Rebounds','totalRebounds'],['Offensive rebounds','offensiveRebounds'],['Assists','assists'],['Steals','steals'],['Blocks','blocks'],['Turnovers','turnovers'],['Paint points','pointsInPaint'],['Second-chance points','secondChancePoints'],['Fast-break points','fastBreakPoints'],['Points off turnovers','turnoverPoints'],['Fouls','fouls']],
  NFL:[['Total yards','totalYards'],['Passing yards','netPassingYards'],['Rushing yards','rushingYards'],['First downs','firstDowns'],['3rd downs','thirdDownEff'],['4th downs','fourthDownEff'],['Red zone','redZoneAttempts'],['Turnovers','turnovers'],['Sacks–yards lost','sacksYardsLost'],['Penalties–yards','totalPenaltiesYards'],['Possession','possessionTime'],['Yards/play','yardsPerPlay']],
  MLB:[['Runs','runs'],['Hits','hits'],['Errors','errors'],['Left on base','runnersLeftOnBase'],['Walks','walks'],['Strikeouts','strikeouts'],['Home runs','homeRuns'],['Total bases','totalBases']],
  NHL:[['Shots','shotsTotal'],['Faceoff %','faceoffPercent'],['Power play','powerPlayGoals','powerPlayOpportunities'],['Penalty minutes','penaltyMinutes'],['Hits','hits'],['Blocks','blockedShots'],['Takeaways','takeaways'],['Giveaways','giveaways'],['Saves','saves']],
  Soccer:[['Possession','possessionPct'],['Shots','totalShots'],['Shots on target','shotsOnTarget'],['Corners','cornerKicks'],['Fouls','fouls|foulsCommitted'],['Yellow cards','yellowCards'],['Red cards','redCards'],['Offsides','offsides'],['Saves','saves'],['Pass accuracy','passPct|accuratePassesPercentage'],['xG','expectedGoals']],
  Tennis:[['Aces','aces'],['Double faults','doubleFaults'],['First serve %','firstServePct|firstServePercentage'],['First serve points won','firstServePointsWon'],['Second serve points won','secondServePointsWon'],['Break points','breakPointsWon'],['Winners','winners'],['Unforced errors','unforcedErrors']]
};
TEAM_STAT_CONFIG.NCAAB = TEAM_STAT_CONFIG.NBA;
TEAM_STAT_CONFIG.CFB = TEAM_STAT_CONFIG.NFL;

function detailCompetitors(summary) {
  return summary?.header?.competitions?.[0]?.competitors || [];
}

// The canonical scoreboard decides left/right order; provider detail arrays do not.
function orderedDetailSummary(game,summary) {
  if (!summary || !game?.teams?.length) return summary;
  const position = entry => {
    const team = entry?.team || entry;
    const id = String(entry?.teamId || team?.id || '');
    const byId = id ? game.teams.findIndex(item => item[8] && String(item[8]) === id) : -1;
    if (byId >= 0) return byId;
    const names = [team?.displayName,team?.shortDisplayName,team?.abbreviation]
      .filter(Boolean).map(normalizedTeamName);
    return game.teams.findIndex(item => [item[0],item[1]].some(name => names.includes(normalizedTeamName(name))));
  };
  const order = items => Array.isArray(items) ? items.map((item,index) => ({item,index,position:position(item)}))
    .sort((a,b) => (a.position < 0 ? game.teams.length + a.index : a.position) -
      (b.position < 0 ? game.teams.length + b.index : b.position))
    .map(({item}) => item) : items;
  const competitions = summary.header?.competitions;
  return {
    ...summary,
    header:competitions?.length ? {...summary.header,competitions:[
      {...competitions[0],competitors:order(competitions[0].competitors)},...competitions.slice(1)
    ]} : summary.header,
    boxscore:summary.boxscore ? {...summary.boxscore,
      teams:order(summary.boxscore.teams),players:order(summary.boxscore.players)} : summary.boxscore,
    basketballBoxScore:summary.basketballBoxScore ? {...summary.basketballBoxScore,
      teams:order(summary.basketballBoxScore.teams)} : summary.basketballBoxScore
  };
}

function detailScoring(summary,sport) {
  const teams = detailCompetitors(summary);
  if (teams.length !== 2 || !teams.some(team => team.linescores?.length)) return '';
  const count = Math.max(...teams.map(team => team.linescores?.length || 0));
  const status = summary?.header?.competitions?.[0]?.status?.type?.detail || '';
  const labels = Array.from({length:count},(_,index) => {
    if (sport === 'MLB') return String(index + 1);
    if (sport === 'Tennis') return `S${index + 1}`;
    if (sport === 'Soccer') return ['1H','2H','ET','Pens'][index] || `ET${index - 1}`;
    const shootout=sport==='NHL' && index===count-1 && index>=3 && /shootout|\bSO\b/i.test(status);
    const overtime=playPeriodLabel({sport},{period:{number:index+1,displayValue:shootout?'Shootout':''}},summary);
    if(overtime)return overtime==='Shootout'?'SO':overtime;
    return sport==='NCAAB' ? `${index+1}H` : sport==='NHL' ? `P${index+1}` : `Q${index+1}`;
  });
  const totals = sport === 'MLB' ? ['R','H','E'] : sport === 'Tennis' ? [] : ['Total'];
  const value = entry => entry?.displayValue ?? entry?.value ?? '—';
  return `<section class="detail-section detail-scoring"><h3>Scoring</h3><div class="detail-table-scroll" tabindex="0" role="region" aria-label="Scoring by period"><table><thead><tr><th scope="col">Team</th>${[...labels,...totals].map(label => `<th scope="col">${safeText(label)}</th>`).join('')}</tr></thead><tbody>${teams.map(team => `<tr><th scope="row">${safeText(team.team?.abbreviation || team.athlete?.shortName || team.team?.shortDisplayName || 'Team')}</th>${labels.map((_,index) => `<td>${safeText(team.linescores?.[index] ? value(team.linescores[index]) : '—')}</td>`).join('')}${sport === 'MLB' ? [team.score,team.hits,team.errors].map(item => `<td>${safeText(item ?? '—')}</td>`).join('') : sport === 'Tennis' ? '' : `<td>${safeText(team.score ?? '—')}</td>`}</tr>`).join('')}</tbody></table></div></section>`;
}

function detailStatNumber(stat) {
  if (!stat) return null;
  if (typeof stat.value === 'number' && Number.isFinite(stat.value)) return stat.value;
  const text = String(stat.displayValue ?? '');
  if (/^\d+:\d\d$/.test(text)) { const [minutes,seconds] = text.split(':').map(Number); return minutes * 60 + seconds; }
  const match = text.match(/^\s*(\d+(?:\.\d+)?)\s*[-/]\s*(\d+(?:\.\d+)?)/);
  if (match) return Number(match[2]) ? Number(match[1]) / Number(match[2]) : 0;
  const number = Number(text.replace(/[% ,]/g,''));
  return Number.isFinite(number) && text.trim() !== '' ? number : null;
}

function detailNormalizeHex(value) {
  const match = String(value || '')
    .trim()
    .replace(/^#/,'')
    .match(/^[0-9a-f]{6}$/i);

  return match
    ? `#${match[0].toLowerCase()}`
    : '';
}

function detailHexRgb(value) {
  const hex = detailNormalizeHex(value);
  if (!hex) return null;

  return {
    r:parseInt(hex.slice(1,3),16) / 255,
    g:parseInt(hex.slice(3,5),16) / 255,
    b:parseInt(hex.slice(5,7),16) / 255
  };
}

function detailOklab(value) {
  const rgb = detailHexRgb(value);
  if (!rgb) return null;

  const linear = component =>
    component <= 0.04045
      ? component / 12.92
      : Math.pow((component + 0.055) / 1.055,2.4);

  const r = linear(rgb.r);
  const g = linear(rgb.g);
  const b = linear(rgb.b);

  const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
  const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
  const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);

  return {
    L:0.2104542553*l + 0.793617785*m - 0.0040720468*s,
    a:1.9779984951*l - 2.428592205*m + 0.4505937099*s,
    b:0.0259040371*l + 0.7827717662*m - 0.808675766*s
  };
}

function detailColorSeparation(left,right) {
  const a = detailOklab(left);
  const b = detailOklab(right);
  if (!a || !b) return 0;

  return Math.hypot(
    a.L - b.L,
    a.a - b.a,
    a.b - b.b
  );
}

function detailColorHue(value) {
  const lab = detailOklab(value);
  if (!lab) {
    return {
      hue:null,
      chroma:0,
      lightness:0
    };
  }

  const chroma = Math.hypot(lab.a,lab.b);
  const hue =
    chroma < .035
      ? null
      : (
          Math.atan2(lab.b,lab.a) *
          180 /
          Math.PI +
          360
        ) % 360;

  return {
    hue,
    chroma,
    lightness:lab.L
  };
}

function detailHueDistance(left,right) {
  const a = detailColorHue(left);
  const b = detailColorHue(right);

  if (
    a.hue === null ||
    b.hue === null
  ) {
    return 180;
  }

  const difference =
    Math.abs(a.hue - b.hue);

  return Math.min(
    difference,
    360 - difference
  );
}

function detailColorsTooClose(left,right) {
  const a = detailColorHue(left);
  const b = detailColorHue(right);
  const separation = detailColorSeparation(left,right);
  const hueDistance = detailHueDistance(left,right);
  const lightnessDistance =
    Math.abs(a.lightness - b.lightness);

  if (separation < .105) {
    return true;
  }

  const bothChromatic =
    a.chroma >= .055 &&
    b.chroma >= .055;

  // Adjacent color families can be mathematically different but still read
  // as the same side of the spectrum in a thin stat bar. Red/orange,
  // blue/blue-green, etc. should therefore trigger alternate-color selection.
  if (
    bothChromatic &&
    hueDistance < 58 &&
    lightnessDistance < .24
  ) {
    return true;
  }

  return false;
}

function detailColorPairScore(left,right) {
  const a = detailColorHue(left);
  const b = detailColorHue(right);
  const separation = detailColorSeparation(left,right);
  const hueDistance = detailHueDistance(left,right);
  const lightnessDistance =
    Math.abs(a.lightness - b.lightness);

  const hueBonus =
    Math.min(120,hueDistance) /
    120 *
    .14;

  const lightnessBonus =
    Math.min(.35,lightnessDistance) /
    .35 *
    .05;

  return (
    separation +
    hueBonus +
    lightnessBonus
  );
}

function detailRelativeLuminance(value) {
  const rgb = detailHexRgb(value);
  if (!rgb) return 0;

  const linear = component =>
    component <= 0.04045
      ? component / 12.92
      : Math.pow((component + 0.055) / 1.055,2.4);

  return (
    0.2126 * linear(rgb.r) +
    0.7152 * linear(rgb.g) +
    0.0722 * linear(rgb.b)
  );
}

function detailColorContrast(left,right) {
  const a = detailRelativeLuminance(left);
  const b = detailRelativeLuminance(right);
  const lighter = Math.max(a,b);
  const darker = Math.min(a,b);

  return (lighter + 0.05) / (darker + 0.05);
}

function detailTintHex(value,amount=.28) {
  const rgb = detailHexRgb(value);
  if (!rgb) return '';

  const channel = component =>
    Math.round(
      (component + (1 - component) * amount) * 255
    )
      .toString(16)
      .padStart(2,'0');

  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

function detailTeamColorCandidates(competitor,index) {
  const team = competitor?.team || {};
  const fallback = index ? '#C8AF78' : '#BD343E';

  return [
    detailNormalizeHex(team.color),
    detailNormalizeHex(team.alternateColor),
    detailNormalizeHex(team.alternateColor2),
    detailNormalizeHex(team.secondaryColor),
    detailNormalizeHex(fallback)
  ]
    .filter(Boolean)
    .filter((color,item,array) =>
      array.indexOf(color) === item
    );
}

function detailTeamComparisonColors(competitors) {
  const palettes = competitors.map(detailTeamColorCandidates);
  const primary = [palettes[0][0],palettes[1][0]];
  const darkSurface = '#191C1F';

  const visibleEnough = color =>
    detailColorContrast(color,darkSurface) >= 1.35;

  if (
    !detailColorsTooClose(primary[0],primary[1]) &&
    visibleEnough(primary[0]) &&
    visibleEnough(primary[1])
  ) {
    return primary;
  }

  const combinations = [];

  palettes[0].forEach((left,leftIndex) => {
    palettes[1].forEach((right,rightIndex) => {
      if (
        !visibleEnough(left) ||
        !visibleEnough(right)
      ) {
        return;
      }

      const alternatePenalty =
        (leftIndex > 0 ? .012 : 0) +
        (rightIndex > 0 ? .012 : 0);

      combinations.push({
        colors:[left,right],
        acceptable:
          !detailColorsTooClose(left,right),
        score:
          detailColorPairScore(left,right) -
          alternatePenalty
      });
    });
  });

  combinations.sort((a,b) => {
    if (a.acceptable !== b.acceptable) {
      return Number(b.acceptable) -
        Number(a.acceptable);
    }

    return b.score - a.score;
  });

  const best = combinations[0];

  if (
    best &&
    best.acceptable
  ) {
    return best.colors;
  }

  const left = primary[0];
  const right = primary[1];

  const fallbackPairs = [
    [left,detailTintHex(right,.48)],
    [detailTintHex(left,.48),right],
    [detailTintHex(left,.58),right],
    [left,detailTintHex(right,.58)]
  ]
    .filter(pair =>
      pair.every(Boolean) &&
      pair.every(visibleEnough)
    )
    .sort((a,b) =>
      detailColorPairScore(b[0],b[1]) -
      detailColorPairScore(a[0],a[1])
    );

  return fallbackPairs[0] || primary;
}

function detailStatRow(label,left,right,colors) {
  const display = stat => stat?.displayValue ?? '—';
  const numeric = [detailStatNumber(left),detailStatNumber(right)];
  const total = Math.max(0,numeric[0] || 0) + Math.max(0,numeric[1] || 0);
  const widths = numeric.map(number =>
    number === null
      ? 0
      : !total
        ? 0
        : 100 * Math.max(0,number) / total
  );
  const width = value => Math.max(0,Math.min(100,value)).toFixed(3);
  const comparisonLabel = `${label}: ${display(left)} versus ${display(right)}`;

  return `<div class="detail-comparison-row"><div class="detail-comparison-values"><span>${safeText(display(left))}</span><span>${safeText(label)}</span><span>${safeText(display(right))}</span></div><div class="detail-comparison-bars" role="img" aria-label="${safeText(comparisonLabel)}"><span><i class="detail-comparison-left" style="width:${width(widths[0])}%;background:${colors[0]}"></i><i class="detail-comparison-right" style="width:${width(widths[1])}%;background:${colors[1]}"></i></span></div></div>`;
}

function detailStats(summary,sport) {
  const competitors = detailCompetitors(summary);
  if (competitors.length !== 2) return '';
  const teams = competitors.map(competitor => (summary?.boxscore?.teams || []).find(team => String(team.team?.id) === String(competitor.team?.id)));
  const stats = teams.map(team => {
    const groups = team?.statistics || [];
    const entries = sport === 'MLB' ? groups.flatMap(group => ['batting','fielding'].includes(group.name) ? group.stats || [] : []) : groups;
    const available = new Map();
    entries.filter(stat => stat?.name && stat.displayValue !== undefined && stat.displayValue !== null && stat.displayValue !== '').forEach(stat => {
      if (!available.has(stat.name)) available.set(stat.name,stat);
    });
    return available;
  });
  if (!stats.some(map => map.size)) return '';
  const colors = detailTeamComparisonColors(competitors);
  const primary = TEAM_STAT_CONFIG[sport] || [];
  const used = new Set();
  const statFor = (map,key) => key.split('|').map(alias => map.get(alias)).find(Boolean);
  const rows = primary.map(([label,...keys]) => {
    keys.flatMap(key => key.split('|')).forEach(key => used.add(key));
    const entries = stats.map(map => keys.map(key => statFor(map,key)).filter(Boolean));
    if (!entries.every(items => items.length === keys.length)) return '';
    const pair = entries.map(items => items.length === 1 ? items[0] : {displayValue:items.length === 2 && /Pct$/.test(keys[1]) ? `${items[0].displayValue} (${items[1].displayValue}%)` : items.map(item => item.displayValue).join('/'),value:items[0].value});
    return detailStatRow(label,pair[0],pair[1],colors);
  }).filter(Boolean);
  const secondary = [...stats[0].keys()].filter(key => !used.has(key) && stats[1].has(key) && (sport !== 'MLB' || ['doubles','triples','stolenBases','caughtStealing','hitByPitch','sacFlies','GIDPs','atBats','plateAppearances','doublePlays'].includes(key))).slice(0,20).map(key => detailStatRow(stats[0].get(key).label || stats[0].get(key).displayName || key,stats[0].get(key),stats[1].get(key),colors));
  if (!rows.length && !secondary.length) return '';
  const headings = `<div class="detail-comparison-teams"><span>${safeText(competitors[0].team?.abbreviation || competitors[0].athlete?.shortName || 'Left')}</span><span>${safeText(competitors[1].team?.abbreviation || competitors[1].athlete?.shortName || 'Right')}</span></div>`;
  return `<section class="detail-section detail-comparison"><h3>Team Stats</h3>${headings}${rows.join('')}${secondary.length ? `<details class="detail-more-stats"><summary>More Stats</summary>${secondary.join('')}</details>` : ''}</section>`;
}

function detailNhlAdvanced(summary) {
  const data=summary?.nhlAdvanced;
  if (!data?.available) return `<section class="detail-section"><h3>Shot Attempts</h3><p class="detail-empty">${safeText(data?.reason || 'NHL play-by-play statistics are unavailable.')}</p></section>`;
  const competitors=detailCompetitors(summary);
  const ids=competitors.map(c=>data.teamIdMap?.[String(c.team?.id)]);
  if (ids.length!==2 || ids.some(id=>!id)) return '';
  const colors=detailTeamComparisonColors(competitors);
  const row=(label,scope,key,percent=false)=>{
    const values=ids.map(id=>scope?.[id]?.[key]);
    const stats=values.map(value=>({displayValue:value==null?'—':percent?`${value.toFixed(1)}%`:String(value),value}));
    return detailStatRow(label,stats[0],stats[1],colors);
  };
  const rows=[['Full game',data.fullGame],['5-on-5',data.fiveOnFive]].map(([label,scope])=>
    row(`${label} Corsi`,scope,'cf')+row(`${label} Corsi %`,scope,'cfPct',true)+
    row(`${label} Fenwick`,scope,'ff')+row(`${label} Fenwick %`,scope,'ffPct',true)).join('');
  const trailing=data.teams.find(t=>t.id===data.trailingTeamId);
  const pressure=trailing ? `${trailing.abbreviation}: ${data.recentPressure.trailingAttempts} attempts (${data.recentPressure.trailingUnblocked} unblocked) while trailing in the last two minutes, since the last goal.` : 'Game tied; neither team is trailing.';
  const freshness=data.stale || data.scoreMatches===false ? ' Cached or awaiting score reconciliation.' : data.lagSeconds>30 ? ` Play-by-play is ${Math.round(data.lagSeconds)} game seconds behind.` : '';
  const partial=Object.entries(data.quality || {}).some(([key,value])=>key!=='duplicates' && value>0) ? ' Partial data: some events could not be classified; 5-on-5 includes only confirmed situations.' : '';
  return `<section class="detail-section detail-comparison"><h3>Shot Attempts</h3><div class="detail-comparison-teams">${competitors.map(c=>`<span>${safeText(c.team?.abbreviation || '')}</span>`).join('')}</div>${rows}${row('Last 5 minutes Corsi',data.rollingFiveMinutes.teams,'cf')}${row('Last 5 minutes Fenwick',data.rollingFiveMinutes.teams,'ff')}<p>${safeText(pressure)}</p><p class="detail-empty">Corsi includes goals, saved shots, misses and blocks. Fenwick excludes blocks. 5-on-5 requires both goalies; shootouts are excluded. Recent attempts include all manpower states. These counts do not measure shot quality.${safeText(freshness+partial)}</p></section>`;
}

function detailDrives(summary,sport,status=null) {
  const halftime = globalThis.SportsRadarScore?.isHalftimeStatus?.(status || summary?.header?.competitions?.[0]?.status);
  if (!['NFL','CFB'].includes(sport)) return '';

  const previous =
    Array.isArray(summary?.drives?.previous)
      ? summary.drives.previous
      : [];

  const current =
    summary?.drives?.current &&
    typeof summary.drives.current === 'object'
      ? summary.drives.current
      : null;

  const seen = new Set();
  const drives = [];

  const addDrive = (drive,isCurrent=false) => {
    if (!drive || typeof drive !== 'object') return;

    const id =
      drive.id ??
      drive.driveId ??
      `${drive.team?.id || drive.team?.abbreviation || 'team'}:${drive.sequenceNumber ?? drives.length}`;

    const key = String(id);
    if (seen.has(key)) return;

    seen.add(key);
    drives.push({
      ...drive,
      _sportsRadarCurrent:isCurrent
    });
  };

  addDrive(current,!halftime);
  [...previous]
    .reverse()
    .forEach(drive => addDrive(drive,false));

  if (!drives.length) return '';

  const teamLabel = drive =>
    drive.team?.abbreviation ||
    drive.team?.shortDisplayName ||
    drive.team?.displayName ||
    'Drive';

  const resultLabel = drive =>
    drive.displayResult ||
    drive.result ||
    drive.description ||
    (drive.isScore ? 'Score' : 'Drive');

  const fieldLabel = value => {
    if (!value) return '';

    return (
      value.text ||
      value.shortText ||
      value.possessionText ||
      value.yardLineText ||
      (
        value.yardLine != null &&
        Number.isFinite(Number(value.yardLine))
          ? `Yard ${value.yardLine}`
          : ''
      )
    );
  };

  const playMeta = play => {
    const period =
      Number(
        play?.period?.number ||
        play?.period?.value ||
        play?.period ||
        0
      );

    const periodText =
      period > 4
        ? period === 5
          ? 'OT'
          : `${period - 4}OT`
        : period > 0
          ? `Q${period}`
          : '';

    const clock =
      play?.clock?.displayValue ||
      '';

    const down =
      play?.start?.shortDownDistanceText ||
      play?.start?.downDistanceText ||
      play?.downDistanceText ||
      '';

    return [
      periodText && clock
        ? `${periodText} ${clock}`
        : periodText || clock,
      halftime && /end (?:of )?(?:period|quarter)|End Period/i.test(`${play.type?.text || ''} ${play.text || ''}`) ? '' : down
    ]
      .filter(Boolean)
      .join(' · ');
  };

  const rows =
    drives
      .map((drive,index) => {
        const plays =
          Array.isArray(drive.plays)
            ? drive.plays
            : [];

        const count =
          drive.offensivePlays ??
          drive.playCount ??
          plays.length;

        const yards =
          drive.yards ??
          drive.netYards;

        const elapsed =
          drive.timeElapsed?.displayValue ||
          drive.timeElapsed?.text ||
          (
            typeof drive.timeElapsed === 'string'
              ? drive.timeElapsed
              : ''
          );

        const summaryBits = [
          Number.isFinite(Number(count))
            ? `${count} play${Number(count) === 1 ? '' : 's'}`
            : '',
          yards != null && yards !== ''
            ? `${yards} yds`
            : '',
          elapsed
        ].filter(Boolean);

        const start =
          fieldLabel(drive.start);

        const end =
          fieldLabel(drive.end);

        const field =
          start && end
            ? `${start} → ${end}`
            : start || end;

        const currentText =
          drive._sportsRadarCurrent
            ? '<span class="detail-drive-live">Current drive</span>'
            : '';

        const playRows =
          plays.length
            ? `<ol class="detail-drive-plays">${plays.map(play => {
                const text =
                  play.text ||
                  play.shortText ||
                  play.type?.text ||
                  'Play recorded';

                const meta =
                  playMeta(play);

                return `<li class="${play.scoringPlay ? 'scoring' : ''}"><span class="detail-drive-play-meta">${safeText(meta)}</span><span class="detail-drive-play-text">${safeText(text)}</span></li>`;
              }).join('')}</ol>`
            : '<p class="detail-empty">Play-by-play is unavailable for this drive.</p>';

        return `<details class="detail-drive ${drive._sportsRadarCurrent ? 'current' : ''}" ${drive._sportsRadarCurrent || index === 0 ? 'open' : ''}><summary><span class="detail-drive-team">${safeText(teamLabel(drive))}</span><span class="detail-drive-result">${safeText(resultLabel(drive))}</span><span class="detail-drive-meta">${safeText(summaryBits.join(' · '))}</span></summary><div class="detail-drive-body">${currentText}${field ? `<p class="detail-drive-field">${safeText(field)}</p>` : ''}${playRows}</div></details>`;
      })
      .join('');

  return `<section class="detail-section detail-drives"><div class="detail-section-heading"><h3>Drives</h3><span>Latest first</span></div><div class="detail-drive-list">${rows}</div></section>`;
}

function detailLeaders(summary) {
  const groups =
    summary?.leaders || [];

  const rows =
    groups
      .flatMap(group =>
        (group.leaders || [])
          .filter(leader =>
            leader.athlete?.displayName ||
            leader.athlete?.shortName
          )
          .slice(0,1)
          .map(leader =>
            `<div><span>${safeText(group.displayName || group.name || 'Leader')}</span><b>${safeText(leader.athlete?.displayName || leader.athlete?.shortName)} · ${safeText(leader.displayValue || leader.value || '')}</b></div>`
          )
      )
      .slice(0,6);

  return rows.length
    ? `<section class="detail-section"><h3>Leaders</h3><div class="detail-leaders">${rows.join('')}</div></section>`
    : '';
}

function detailPlays(summary,game={}) {
  const plays =
    (
      summary?.scoringPlays?.length
        ? summary.scoringPlays
        : summary?.plays || []
    )
      .slice(-6)
      .reverse();

  return plays.length
    ? `<section class="detail-section"><h3>${
        summary?.scoringPlays?.length
          ? 'Scoring plays'
          : 'Recent play-by-play'
      }</h3><ul class="detail-plays">${plays.map(play => {
        const period=playPeriodLabel(game,play,summary);
        const clock=play.clock?.displayValue || '';
        const label=/^(?:\d+)?OT$/.test(period) || period==='Shootout' ? [period,clock].filter(Boolean).join(' · ') : clock || period;
        return `<li><span>${safeText(label)}</span>${safeText(play.text || play.shortText || play.type?.text || 'Play recorded')}</li>`;
      }).join('')}</ul></section>`
    : '';
}

function statKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g,'');
}

function athleteName(entry) {
  return entry?.athlete?.displayName ||
    entry?.athlete?.fullName ||
    entry?.athlete?.shortName ||
    entry?.player?.displayName ||
    entry?.player?.fullName ||
    'Player';
}

function findStatIndex(labels, aliases, fallback) {
  const normalized =
    (labels || []).map(statKey);

  const wanted =
    [...(aliases || [])].map(statKey);

  const found =
    normalized.findIndex(
      label =>
        wanted.includes(label)
    );

  return found >= 0
    ? found
    : fallback;
}

function statValue(entry, column, index) {
  const stats =
    entry?.stats ??
    entry?.values ??
    [];

  if (Array.isArray(stats)) {
    return stats[index] ?? '—';
  }

  const keys =
    Object.keys(stats || {});

  const aliases =
    [
      column.title,
      ...(column.aliases || [])
    ].map(statKey);

  const key =
    keys.find(item =>
      aliases.includes(
        statKey(item)
      )
    );

  return key
    ? stats[key]
    : '—';
}

function playerTable(group, columns, title) {
  const athletes =
    group?.athletes ||
    group?.players ||
    [];

  if (!athletes.length) {
    return '';
  }

  const labels =
    group.labels ||
    group.headers ||
    [];

  return `<div class="detail-player-group"><h4>${safeText(title)}</h4><div class="detail-table-scroll detail-player-scroll" tabindex="0" role="region" aria-label="${safeText(title)} statistics, horizontally scroll for more columns"><table class="detail-player-table"><thead><tr><th>Player</th>${columns.map(column =>
    `<th>${safeText(column.title)}</th>`
  ).join('')}</tr></thead><tbody>${athletes.map(entry =>
    `<tr><th scope="row">${safeText(athleteName(entry))}</th>${columns.map((column,index) =>
      `<td>${safeText(statValue(entry,column,findStatIndex(labels,column.aliases,index)))}</td>`
    ).join('')}</tr>`
  ).join('')}</tbody></table></div></div>`;
}


function mlbPitchingDecision(entry) {
  const notes = [
    ...(Array.isArray(entry?.notes) ? entry.notes : []),
    ...(Array.isArray(entry?.athlete?.notes) ? entry.athlete.notes : [])
  ];

  const decision =
    notes.find(note =>
      statKey(
        note?.type ||
        note?.name ||
        ''
      ) === 'pitchingdecision'
    );

  return (
    decision?.text ||
    decision?.displayValue ||
    decision?.shortText ||
    decision?.value ||
    ''
  );
}

function mlbPlayerTable(group, title, includeDecision=false) {
  const athletes =
    group?.athletes ||
    group?.players ||
    [];

  if (!athletes.length) {
    return '';
  }

  const labels =
    Array.isArray(group.labels) && group.labels.length
      ? group.labels
      : Array.isArray(group.headers) && group.headers.length
        ? group.headers
        : Object.keys(athletes[0]?.stats || {});

  if (!labels.length) {
    return '';
  }

  const columns =
    labels.map(label => ({
      title:label,
      aliases:[label]
    }));

  const showDecision =
    includeDecision &&
    athletes.some(entry =>
      Boolean(mlbPitchingDecision(entry))
    );

  return `<div class="detail-player-group"><h4>${safeText(title)}</h4><div class="detail-table-scroll detail-player-scroll" tabindex="0" role="region" aria-label="${safeText(title)} statistics, horizontally scroll for more columns"><table class="detail-player-table"><thead><tr><th>Player</th>${columns.map(column =>
    `<th>${safeText(column.title)}</th>`
  ).join('')}${showDecision ? '<th>Decision</th>' : ''}</tr></thead><tbody>${athletes.map(entry =>
    `<tr><th scope="row">${safeText(athleteName(entry))}</th>${columns.map((column,index) =>
      `<td>${safeText(statValue(entry,column,findStatIndex(labels,column.aliases,index)))}</td>`
    ).join('')}${showDecision ? `<td>${safeText(mlbPitchingDecision(entry) || '—')}</td>` : ''}</tr>`
  ).join('')}</tbody></table></div></div>`;
}

function detailMlbPlayerStats(summary, type) {
  if (!['batting','pitching'].includes(type)) {
    return '';
  }

  const blocks =
    summary?.boxscore?.players || [];

  if (!blocks.length) {
    return '';
  }

  const title =
    type === 'batting'
      ? 'Batting'
      : 'Pitching';

  const teamSections =
    blocks
      .map(block => {
        const teamName =
          block.team?.displayName ||
          block.team?.shortDisplayName ||
          block.team?.abbreviation ||
          'Team';

        const groups =
          (block.statistics || [])
            .filter(group => {
              const groupType =
                statKey(
                  group.type ||
                  group.name ||
                  group.displayName
                );

              return (
                groupType === type &&
                (group.athletes || group.players || []).length
              );
            });

        if (!groups.length) {
          return '';
        }

        return `<div class="detail-player-team"><strong>${safeText(teamName)}</strong>${groups.map(group =>
          mlbPlayerTable(
            group,
            group.displayName || group.name || title,
            type === 'pitching'
          )
        ).join('')}</div>`;
      })
      .filter(Boolean);

  return teamSections.length
    ? `<section class="detail-section"><h3>${title}</h3><div class="detail-player-grid">${teamSections.join('')}</div></section>`
    : '';
}

const FOOTBALL_PLAYER_GROUPS = new Set([
  'passing',
  'rushing',
  'receiving',
  'fumbles',
  'defensive',
  'interceptions',
  'kickreturns',
  'puntreturns',
  'kicking',
  'punting'
]);

const FOOTBALL_PLAYER_GROUP_ORDER = [
  'passing',
  'rushing',
  'receiving',
  'fumbles',
  'defensive',
  'interceptions',
  'kickreturns',
  'puntreturns',
  'kicking',
  'punting'
];

const FOOTBALL_PLAYER_GROUP_TITLES = {
  passing:'Passing',
  rushing:'Rushing',
  receiving:'Receiving',
  fumbles:'Fumbles',
  defensive:'Defense',
  interceptions:'Interceptions',
  kickreturns:'Kick Returns',
  puntreturns:'Punt Returns',
  kicking:'Kicking',
  punting:'Punting'
};


function detailNhlGoalies(summary) {
  const blocks =
    summary?.boxscore?.players || [];

  if (!blocks.length) {
    return '';
  }

  const teamSections =
    blocks
      .map(block => {
        const teamName =
          block.team?.displayName ||
          block.team?.shortDisplayName ||
          block.team?.abbreviation ||
          'Team';

        const groups =
          (block.statistics || [])
            .filter(group =>
              (group.athletes || group.players || []).length &&
              /goalie|goaltender/i.test(
                `${group.type || ''} ${group.name || ''} ${group.displayName || ''}`
              )
            );

        if (!groups.length) {
          return '';
        }

        return `<div class="detail-player-team"><strong>${safeText(teamName)}</strong>${groups.map(group => {
          const athletes =
            group.athletes ||
            group.players ||
            [];

          const labels =
            Array.isArray(group.labels) && group.labels.length
              ? group.labels
              : Array.isArray(group.headers) && group.headers.length
                ? group.headers
                : Object.keys(athletes[0]?.stats || {});

          const columns =
            labels.map(label => ({
              title:label,
              aliases:[label]
            }));

          return playerTable(
            group,
            columns,
            group.displayName || group.name || 'Goalies'
          );
        }).join('')}</div>`;
      })
      .filter(Boolean);

  return teamSections.length
    ? `<section class="detail-section"><h3>Goalies</h3><div class="detail-player-grid">${teamSections.join('')}</div></section>`
    : '';
}

function detailPlayerStats(summary, sport) {
  const blocks =
    summary?.boxscore?.players || [];

  if (
    !blocks.length ||
    !['NFL','CFB','NHL'].includes(sport)
  ) {
    return '';
  }

  const teamSections =
    blocks
      .map(block => {
        const teamName =
          block.team?.displayName ||
          block.team?.shortDisplayName ||
          'Team';

        const statGroups =
          block.statistics || [];

        if (sport === 'NHL') {
          const skaters =
            statGroups.filter(group =>
              (group.athletes || group.players || []).length &&
              !/goalie|goaltender/i.test(
                `${group.type || ''} ${group.name || ''} ${group.displayName || ''}`
              )
            );

          const columns = [
            {
              title:'S',
              aliases:['shots','shots on goal','s']
            },
            {
              title:'G',
              aliases:['goals','g']
            },
            {
              title:'A',
              aliases:['assists','a']
            },
            {
              title:'+/-',
              aliases:['plus minus','plusminus','+/-']
            },
            {
              title:'PIM',
              aliases:['pim','penalty minutes']
            }
          ];

          return skaters.length
            ? `<div class="detail-player-team"><strong>${safeText(teamName)}</strong>${skaters.map(group =>
                playerTable(
                  group,
                  columns,
                  group.displayName || group.name || 'Skaters'
                )
              ).join('')}</div>`
            : '';
        }

        const groups =
          statGroups
            .filter(group => {
              const key =
                statKey(
                  group.name ||
                  group.displayName
                );

              return (
                FOOTBALL_PLAYER_GROUPS.has(key) &&
                (group.athletes || group.players || []).length
              );
            })
            .sort((a,b) => {
              const left =
                FOOTBALL_PLAYER_GROUP_ORDER.indexOf(
                  statKey(a.name || a.displayName)
                );

              const right =
                FOOTBALL_PLAYER_GROUP_ORDER.indexOf(
                  statKey(b.name || b.displayName)
                );

              return left - right;
            });

        return groups.length
          ? `<div class="detail-player-team"><strong>${safeText(teamName)}</strong>${groups.map(group => {
              const athletes =
                group.athletes ||
                group.players ||
                [];

              const labels =
                Array.isArray(group.labels) &&
                group.labels.length
                  ? group.labels
                  : Object.keys(
                      athletes[0]?.stats || {}
                    );

              const columns =
                labels.map(label => ({
                  title:label,
                  aliases:[label]
                }));

              const key =
                statKey(
                  group.name ||
                  group.displayName
                );

              return playerTable(
                group,
                columns,
                FOOTBALL_PLAYER_GROUP_TITLES[key] ||
                  group.displayName ||
                  group.name ||
                  'Player stats'
              );
            }).join('')}</div>`
          : '';
      })
      .filter(Boolean);

  return teamSections.length
    ? `<section class="detail-section"><h3>${
        sport === 'NHL'
          ? 'Player stats · Skaters'
          : 'Player stats'
      }</h3><div class="detail-player-grid">${teamSections.join('')}</div></section>`
    : '';
}

function readRatingHistory() {
  try {
    const value =
      JSON.parse(
        localStorage.getItem(HISTORY_KEY) || '{}'
      );

    return value &&
      typeof value === 'object' &&
      !Array.isArray(value)
        ? value
        : {};
  } catch {
    return {};
  }
}

const ratingHistory =
  readRatingHistory();

function recordRatingSnapshot(game) {
  if (
    state.source !== 'live' ||
    game.state === 'upcoming'
  ) {
    return;
  }

  const key = watchKey(game);
  const now = Date.now();

  const previous =
    Array.isArray(ratingHistory[key])
      ? ratingHistory[key]
      : [];

  if (
    previous.length &&
    now -
      previous[
        previous.length - 1
      ].at <
      45000 &&
    previous[
      previous.length - 1
    ].score === game.score &&
    previous[previous.length - 1].modelVersion === (game.modelVersion || 'legacy')
  ) {
    return;
  }

  ratingHistory[key] = [
    ...previous,
    {
      at:now,
      score:game.score,
      state:game.state,
      modelVersion:game.modelVersion || 'legacy',
      phase:
        game.live?.phase ||
        game.status,
      period:
        Number(game.liveRawStatus?.period) ||
        null,
      clock:
        String(game.liveRawStatus?.displayClock || ''),
      scoreA:
        String(game.teams?.[0]?.[2] ?? ''),
      scoreB:
        String(game.teams?.[1]?.[2] ?? '')
    }
  ].slice(-160);

  for (
    const [item,points] of
    Object.entries(ratingHistory)
  ) {
    if (
      !Array.isArray(points) ||
      !points.length ||
      now -
        points[
          points.length - 1
        ].at >
        8 * 86400000
    ) {
      delete ratingHistory[item];
    }
  }

  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(ratingHistory)
    );
  } catch {}
}

function playPosition(sport,play) {
  if (typeof eventPosition !== 'function') return legacyPlayPosition(sport,play);
  const period = Number(play?.period?.number || play?.period?.value || play?.period || 0);
  if (!Number.isFinite(period) || period < 1) return null;
  return eventPosition(sport,{status:{
    period,
    displayClock:play?.clock?.displayValue || '',
    clock:play?.clock?.value,
    type:{detail:play?.period?.displayValue || play?.inningHalf || ''}
  }});
}

function legacyPlayPosition(sport,play) {
  const period =
    Number(
      play?.period?.number ||
      play?.period?.value ||
      play?.period ||
      0
    );

  if (
    !Number.isFinite(period) ||
    period < 1
  ) {
    return null;
  }

  if (sport === 'MLB') {
    return Math.min(
      1,
      Math.max(
        0,
        (
          period -
          1 +
          (
            /bottom|bot/i.test(
              String(
                play.period?.displayValue ||
                play.inningHalf ||
                ''
              )
            )
              ? .75
              : .25
          )
        ) / 9
      )
    );
  }

  if (sport === 'NHL') {
    const clock =
      String(
        play.clock?.displayValue || ''
      ).match(
        /^(\d+):(\d+)/
      );

    const elapsed =
      clock
        ? Number(clock[1]) * 60 +
          Number(clock[2])
        : 600;

    return period > 3
      ? Math.min(
          1,
          .92 +
          Math.min(
            300,
            elapsed
          ) /
          300 *
          .08
        )
      : Math.min(
          .92,
          (
            (period - 1) *
            20 *
            60 +
            elapsed
          ) /
          (60 * 60) *
          .92
        );
  }

  const total = ({
    NFL:4,
    CFB:4,
    NHL:3,
    NBA:4,
    NCAAB:2,
    Soccer:2
  })[sport];

  const length = ({
    NFL:15,
    CFB:15,
    NHL:20,
    NBA:12,
    NCAAB:20,
    Soccer:45
  })[sport];

  if (
    !total ||
    !length
  ) {
    return null;
  }

  const clock =
    String(
      play.clock?.displayValue || ''
    ).match(
      /^(\d+):(\d+)/
    );

  const remaining =
    clock
      ? Math.min(
          length * 60,
          Number(clock[1]) * 60 +
          Number(clock[2])
        )
      : length * 30;

  return Math.min(
    1,
    Math.max(
      0,
      (
        period -
        1 +
        1 -
        remaining /
        (length * 60)
      ) / total
    )
  );
}


function scoringEvents(summary) {
  return summary?.scoringPlays?.length
    ? summary.scoringPlays
    : (summary?.plays || [])
        .filter(
          play =>
            play.scoringPlay === true
        );
}

function estimatedEventRating(
  game,
  homeScore,
  awayScore,
  progress,
  summary
) {
  const gap =
    Math.abs(
      homeScore -
      awayScore
    );

  const candidate =
    game.underdog;

  const simulated =
    candidate?.side === 'home'
      ? [
          {
            id:candidate.teamId,
            score:homeScore
          },
          {
            id:'other',
            score:awayScore
          }
        ]
      : [
          {
            id:candidate?.teamId,
            score:awayScore
          },
          {
            id:'other',
            score:homeScore
          }
        ];

  const upset =
    upsetImpact(
      candidate,
      simulated,
      'live',
      progress,
      game.sport
    ).points;

  const momentum =
    momentumImpact(
      game.sport,
      summary,
      progress,
      'live'
    ).points;

  return clampScore(
    stateRating(
      game.openingScore ||
        SPORT_BASE[game.sport] ||
        35,
      game.sport,
      'live',
      gap,
      progress
    ).score +
    upset +
    momentum
  );
}

// Display-only chronology. CFB OT units represent ordered segments, not time.
function timelineFormat(game,summary) {
  const competition = summary?.header?.competitions?.[0] || {};
  const format = competition.format || game.sourceCompetition?.format || game.sourceEvent?.competitions?.[0]?.format || game.format || {};
  const sport = game.sport;
  const periods = sport === 'NCAAB' ? Number(format.regulation?.periods) || 2 : ({NBA:4,NHL:3,NFL:4,CFB:4})[sport];
  if (!periods) return {regulation:1,periods:0};
  const regulation = sport === 'NBA' ? 2880 : sport === 'NCAAB' ? 2400 : 3600;
  const postseason = Number(summary?.header?.season?.type || game.sourceEvent?.season?.type) === 3;
  // Accept explicit seconds or clock strings, never ambiguous bare duration numbers.
  const duration = format.overtime?.clock?.displayValue || format.overtime?.duration;
  const match = typeof duration === 'string' && duration.match(/^(\d+):(\d+)$/);
  const supplied = Number(format.overtime?.durationSeconds || format.overtime?.periodLengthSeconds)
    || (match ? Number(match[1])*60 + Number(match[2]) : 0);
  // Visualization fallbacks: NHL 5m/20m postseason; NFL 10m/15m postseason.
  const overtime = supplied > 0 ? supplied : sport === 'NHL' ? (postseason ? 1200 : 300)
    : sport === 'NFL' ? (postseason ? 900 : 600) : 300;
  return {sport,season:summary?.header?.season || game.sourceEvent?.season || game.season,regulation,periods,periodLength:regulation/periods,
    overtime:sport === 'CFB' ? regulation/periods : overtime,untimed:sport === 'CFB'};
}

function timelineEventPosition(game,play,format,ordinal=.5) {
  const period = Number(play?.period?.number || play?.period?.value || play?.period || 0);
  if (!Number.isFinite(period) || period < 1) return null;
  if (!format.periods) {
    // Preserve the existing non-OT-sport display spacing without eventPosition.
    if (game.sport === 'MLB') {
      const detail = String(play.period?.displayValue || play.inningHalf || '');
      return (period-1+(/bottom|bot\b/i.test(detail) ? .75 : /top\b/i.test(detail) ? .25 : .5))/9;
    }
    if (game.sport === 'Tennis') return Math.max(0,Math.min(.98,(period-.5)/3));
    if (game.sport === 'Soccer') {
      const display = String(play.clock?.displayValue || '').trim();
      const minute = display.match(/^(\d+)'?(?:\+(\d+)'?)?$/);
      const colon = display.match(/^(\d+):(\d+(?:\.\d+)?)$/);
      const numeric = play.clock?.value;
      const seconds = minute?.[2] ? (Number(minute[1])+Number(minute[2]))*60
        : numeric != null && Number.isFinite(Number(numeric)) ? Number(numeric)
        : minute ? Number(minute[1])*60 : colon ? Number(colon[1])*60+Number(colon[2]) : null;
      return seconds === null ? Math.max(0,Math.min(1,(period-.5)/2)) : seconds/5400;
    }
    return legacyPlayPosition(game.sport,play);
  }
  const ot = period > format.periods;
  const length = ot ? format.overtime : format.periodLength;
  const start = ot ? format.regulation+(period-format.periods-1)*length : (period-1)*length;
  const clock = String(play?.clock?.displayValue ?? '').trim();
  const match = clock.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  const numeric = play?.clock?.value;
  const remaining = match ? Number(match[1])*60+Number(match[2])
    : /^\d+(?:\.\d+)?$/.test(clock) ? Number(clock)
    : numeric != null && Number.isFinite(Number(numeric)) ? Number(numeric) : null;
  const fraction = ot && format.untimed ? ordinal : remaining === null ? (ot ? ordinal : .5)
    : Math.max(0,Math.min(1,1-remaining/length));
  return start+fraction*length;
}

function timelinePeriodLabel(play,format) {
  const period = Number(play?.period?.number || play?.period?.value || play?.period || 0);
  return playPeriodLabel({sport:format.sport,format:{regulation:{periods:format.periods}},season:format.season},play,null,`Period ${period}`);
}

function timelineFinalScores(game,summary) {
  const competitors = summary?.header?.competitions?.[0]?.competitors;
  const score = side => {
    const competitor = competitors?.find(team => team.homeAway === side);
    const value = competitor?.score?.value ?? competitor?.score;
    if (value != null && value !== '' && Number.isFinite(Number(value))) return Number(value);
    // Normalized display teams are away first, home second.
    const fallback = game.teams?.[side === 'home' ? 1 : 0]?.[2];
    return fallback != null && fallback !== '' && Number.isFinite(Number(fallback)) ? Number(fallback) : null;
  };
  return {home:score('home'),away:score('away')};
}

function recordedTimelinePoints(game,summary,format) {
  const snapshots =
    Array.isArray(summary?.sportsRadarHistory?.snapshots)
      ? summary.sportsRadarHistory.snapshots
          .filter(point =>
            Number.isFinite(Number(point?.observedAt)) &&
            Number.isFinite(Number(point?.rating))
          )
          .sort((a,b) =>
            Number(a.observedAt) -
            Number(b.observedAt)
          )
      : [];

  if (!snapshots.length) return null;

  const live =
    snapshots.filter(point =>
      ['live','completed'].includes(point.state)
    );

  if (!live.length) return null;

  const opening =
    snapshots.find(point =>
      point.state === 'upcoming'
    );

  const geometryPoints = live.filter(point=>point.state==='live');
  const periodTotals = new Map();
  for (const point of geometryPoints) {
    const period = Number(point.period);
    if (Number.isFinite(period) && period > 0) {
      periodTotals.set(
        period,
        (periodTotals.get(period) || 0) + 1
      );
    }
  }

  const periodSeen = new Map();
  const firstAt = Number((geometryPoints[0] || live[0]).observedAt);
  const lastAt = Number((geometryPoints.at(-1) || live.at(-1)).observedAt);
  const observedSpan = Math.max(1,lastAt - firstAt);
  const points = [];

  if (opening) {
    points.push({
      x:0,
      score:Number(opening.rating),
      label:'Start',
      text:'Recorded pregame rating',
      observedAt:Number(opening.observedAt),
      modelVersion:opening.modelVersion || 'legacy',
      recorded:true
    });
  }

  let lastX =
    points.length
      ? 0
      : -Infinity;

  for (let point of live) {
    const period = Number(point.period);
    const seen = (periodSeen.get(period) || 0) + 1;
    if(point.state==='live')periodSeen.set(period,seen);

    const ordinal =
      seen /
      ((periodTotals.get(period) || 1) + 1);

    let x =
      Number.isFinite(period) && period > 0
        ? timelineEventPosition(
            game,
            {
              period:{
                number:period,
                displayValue:point.phaseLabel || ''
              },
              clock:{
                displayValue:point.clock || ''
              }
            },
            format,
            ordinal
          )
        : null;

    if (
      x === null ||
      !Number.isFinite(x)
    ) {
      x =
        (Number(point.observedAt) - firstAt) /
        observedSpan *
        format.regulation;
    }

    if (Number.isFinite(lastX)) {
      // Keep corrected provider clocks; start a new segment instead of moving them to a later clock.
      if (x < lastX) point = {...point,clockRevision:true};
    }

    if(point.state==='live')lastX = x;

    const phase =
      String(point.phaseLabel || '')
        .trim();

    const clock =
      String(point.clock || '')
        .trim();

    let label =
      phase && clock && !phase.includes(clock)
        ? `${phase} ${clock}`
        : phase || clock;

    if (
      !label &&
      Number.isFinite(period) &&
      period > 0
    ) {
      label = [
        timelinePeriodLabel(
          {period:{number:period}},
          format
        ),
        clock
      ].filter(Boolean).join(' ');
    }

    if (!label) {
      label =
        new Date(Number(point.observedAt))
          .toLocaleTimeString(
            [],
            {
              hour:'numeric',
              minute:'2-digit'
            }
          );
    }

    const scoreText =
      point.scoreA !== undefined &&
      point.scoreA !== null &&
      point.scoreB !== undefined &&
      point.scoreB !== null &&
      String(point.scoreA) !== '' &&
      String(point.scoreB) !== ''
        ? `${point.scoreA}-${point.scoreB}`
        : '';

    points.push({
      x,
      score:Number(point.rating),
      ratingKind:point.state==='completed'?'final':point.state,
      incomplete:point.evidenceQuality==='partial',
      invalid:point.evidenceQuality==='invalid' || point.integrityIssue===true,
      evidenceQuality:point.evidenceQuality,
      scoreA:point.scoreA,scoreB:point.scoreB,
      breakBefore:point.clockRevision===true || point.integrityIssue===true,
      label:point.state==='completed'?'Earlier final rating':label,
      text:
        scoreText
          ? `${scoreText} \u00b7 Recorded by SlateMeter`
          : 'Recorded by SlateMeter',
      overtime:
        format.periods > 0 &&
        Number.isFinite(period) &&
        period > format.periods,
      observedAt:Number(point.observedAt),
      modelVersion:
        point.modelVersion ||
        'legacy',
      recorded:true
    });
  }

  const latestCanonicalAt =
    Math.max(
      ...live.map(point =>
        Number(point.observedAt)
      )
    );

  const local =
    (
      ratingHistory[
        watchKey(game)
      ] ||
      []
    )
      .filter(point =>
        Number.isFinite(Number(point?.at)) &&
        Number.isFinite(Number(point?.score)) &&
        game.state === 'live' && point.state !== 'completed' &&
        Number(point.at) >
          latestCanonicalAt + 5000
      )
      .sort((a,b) =>
        Number(a.at) -
        Number(b.at)
      );

  let localAdded = 0;

  for (const point of local) {
    const period = Number(point.period);

    let x =
      Number.isFinite(period) && period > 0
        ? timelineEventPosition(
            game,
            {
              period:{
                number:period,
                displayValue:point.phase || ''
              },
              clock:{
                displayValue:point.clock || ''
              }
            },
            format,
            1
          )
        : null;

    if (
      x === null ||
      !Number.isFinite(x)
    ) {
      continue;
    }

    x = Math.max(lastX,x);
    lastX = x;

    const scoreText =
      point.scoreA !== undefined &&
      point.scoreA !== null &&
      point.scoreB !== undefined &&
      point.scoreB !== null &&
      String(point.scoreA) !== '' &&
      String(point.scoreB) !== ''
        ? `${point.scoreA}-${point.scoreB}`
        : '';

    points.push({
      x,
      score:Number(point.score),
      label:
        point.phase ||
        [
          timelinePeriodLabel(
            {period:{number:period}},
            format
          ),
          point.clock || ''
        ].filter(Boolean).join(' '),
      text:
        scoreText
          ? `${scoreText} ┬╖ Newest browser observation`
          : 'Newest browser observation',
      overtime:
        format.periods > 0 &&
        Number.isFinite(period) &&
        period > format.periods,
      observedAt:Number(point.at),
      modelVersion:point.modelVersion || 'legacy',
      ratingKind:'live',
      local:true
    });

    localAdded++;
  }

  if (!points.length) return null;

  const domainEnd =
    Math.max(
      format.regulation,
      ...points.map(point =>
        Number(point.x) || 0
      )
    );

  const dividers = [];

  if (
    format.periods &&
    domainEnd > format.regulation
  ) {
    for (
      let x = format.regulation, ot = 1;
      x < domainEnd;
      x += format.overtime, ot++
    ) {
      dividers.push({
        x,
        label:timelinePeriodLabel({period:format.periods+ot},format)
      });
    }
  }

  return {
    points,
    source:
      localAdded
        ? 'recorded + browser'
        : 'recorded snapshots',
    domainEnd,
    dividers
  };
}

function timelinePoints(game,summary) {
  if (
    game.state === 'upcoming'
  ) {
    return {
      points:[],
      source:'upcoming'
    };
  }

  const format = timelineFormat(game,summary);
  const recorded =
    recordedTimelinePoints(
      game,
      summary,
      format
    );

  if (recorded) {
    return recorded;
  }
  const plays = scoringEvents(summary);
  const periodNumber = play => Number(play?.period?.number || play?.period?.value || play?.period || 0);
  const events = plays.map((play,index) => {
    const siblings = plays.filter(item => periodNumber(item) === periodNumber(play));
    const ordinal = (siblings.indexOf(play)+1)/(siblings.length+1);
    const x = timelineEventPosition(game,play,format,ordinal);
    const home = play.homeScore == null || play.homeScore === '' ? NaN : Number(play.homeScore);
    const away = play.awayScore == null || play.awayScore === '' ? NaN : Number(play.awayScore);
    if (x === null || !Number.isFinite(home) || !Number.isFinite(away) || (!home && !away)) return null;
    const scoringProgress = Math.max(0,Math.min(1,x/format.regulation));
    return {x,chartPosition:x,scoringProgress,home,away,
      score:estimatedEventRating(game,home,away,scoringProgress,{
        ...summary,scoringPlays:plays.slice(0,index+1),winprobability:[]
      }),
      label:`${timelinePeriodLabel(play,format)} ${format.untimed && periodNumber(play)>format.periods ? '' : play.clock?.displayValue || ''}`.trim(),
      text:compactPlay(play),overtime:format.periods > 0 && periodNumber(play)>format.periods};
  }).filter(Boolean).sort((a,b) => a.x-b.x);

  if (events.length) {
    const finalEvent = events[events.length-1];
    const status = game.liveRawStatus || summary?.header?.competitions?.[0]?.status || {};
    const currentPosition = timelineEventPosition(game,{
      period:status.period,clock:{displayValue:status.displayClock,value:status.clock}
    },format,1);
    const endX = Math.max(finalEvent.x,currentPosition ?? 0,
      game.state === 'completed' ? format.regulation : 0);
    const points = [{x:0,score:game.openingScore || SPORT_BASE[game.sport] || 35,
      label:'Start',text:'Opening estimate'},...events];
    if (game.state==='live' && (endX > finalEvent.x || game.score !== finalEvent.score)) {
      points.push({x:endX,score:game.score,modelVersion:game.modelVersion || 'legacy',ratingKind:game.state==='completed'?'final':'live',
        label:game.state === 'completed' ? 'Final'
          : format.periods && Number(status.period)>format.periods
            ? `${timelinePeriodLabel({period:status.period},format)} ${format.untimed ? '' : status.displayClock || ''}`.trim()
            : game.live?.phase || 'Now',text:'Current rating'});
    }
    const domainEnd = Math.max(format.regulation,endX,...points.map(point => point.x));
    const dividers = [];
    if (format.periods && domainEnd > format.regulation) {
      for (let x=format.regulation,ot=1; x<domainEnd; x+=format.overtime,ot++) {
        dividers.push({x,label:timelinePeriodLabel({period:format.periods+ot},format)});
      }
    }
    return {points,source:'scoring plays',domainEnd,dividers};
  }

  const samples =
    (
      ratingHistory[
        watchKey(game)
      ] ||
      []
    )
      .filter(point =>
        Number.isFinite(point.at) &&
        Number.isFinite(point.score) &&
        point.state !== 'completed' && !/\bfinal\b/i.test(point.phase || '')
      );

  if (
    samples.length < 2
  ) {
    return {
      points:[],
      source:'unavailable'
    };
  }

  const span =
    Math.max(
      1,
      samples[
        samples.length - 1
      ].at -
      samples[0].at
    );

  return {
    points:
      samples.map(point => ({
        x:
          (
            point.at -
            samples[0].at
          ) /
          span,

        score:
          point.score,

        label:
          point.phase ||
          new Date(point.at)
            .toLocaleTimeString(
              [],
              {
                hour:'numeric',
                minute:'2-digit'
              }
            ),

        text:
          'Observed rating',
        ratingKind:'live',local:true,observedAt:point.at,
        modelVersion:point.modelVersion || 'legacy'
      })),

    source:
      'browser observations'
  };
}

function timelineComparable(point,previous) {
  return Boolean(previous) && point.ratingKind!=='final' && previous.ratingKind!=='final' &&
    !point.incomplete && !previous.incomplete && !point.invalid && !previous.invalid && !point.breakBefore &&
    (point.modelVersion || 'legacy') === (previous.modelVersion || 'legacy');
}

function timelinePresentation(game,timeline) {
  const points=[],groups=new Map();
  const completed=game.state==='completed';
  const pending=Boolean(game.scoringPartial || game.summaryLifecycleRejected || game.scoringHistoryRejected);
  const current=game.score!=null && Number.isFinite(Number(game.score)) && !pending ? Number(game.score) : null;
  const scores=game.teams?.map(team=>String(team[2]));
  let gap=false;
  for(const point of timeline.points){
    const unreliable=point.invalid || point.incomplete;
    if(point.ratingKind!=='final' && !unreliable){
      points.push({...point,breakBefore:point.breakBefore || gap});
      gap=false;continue;
    }
    gap=true;
    const sameScores=scores?.length===2 && point.scoreA!=null && point.scoreB!=null &&
      String(point.scoreA)===scores[0] && String(point.scoreB)===scores[1];
    const kind=point.invalid?'invalid':point.incomplete?'partial':completed && current===null?'previous':
      completed && current===point.score && sameScores ? 'matching':'superseded';
    const scoreText=point.scoreA!=null && point.scoreB!=null ? `${point.scoreA}–${point.scoreB}` : '';
    const reason=kind==='invalid'?'Conflicting game data; not used.':
      kind==='partial'?'Missing game data; not used.':
      kind==='matching'?'Matches the current final rating.':
      kind==='previous'?'Final rating is awaiting complete data.':
      !completed?'Play resumed after this update.':
      !sameScores && scoreText && scores?.length===2?`Score later corrected from ${scoreText} to ${scores.join('–')}.`:
      'Replaced by the current final rating.';
    // Group only the display. Every original observation remains in records.
    const key=JSON.stringify([kind,point.ratingKind,point.score,scoreText,
      point.ratingKind==='final'?'':point.label]);
    if(!groups.has(key))groups.set(key,{kind,score:point.score,scoreText,reason,records:[]});
    groups.get(key).records.push(point);
  }
  const lastLive=points.filter(p=>p.ratingKind==='live' || p.local).at(-1) || null;
  return {...timeline,points,history:[...groups.values()],current,completed,pending,lastLive};
}

function timelineRatingSummary(view) {
  const label=view.completed?'Final rating':'Current rating';
  const last=view.lastLive;
  return `<div class="timeline-ratings"><div class="timeline-rating-current"><span>${label}</span><strong>${view.current??'Pending'}</strong><small>${view.completed?'Whole game':'Right now'}</small></div><div class="timeline-rating-last"><span>Last reliable live rating</span><strong>${last?last.score:'—'}</strong><small>${last?safeText(last.label):'No reliable live record'}</small></div></div>`;
}

function timelineHistoryDetails(groups) {
  if(!groups.length)return '';
  const count=groups.reduce((sum,g)=>sum+g.records.length,0);
  const labels={invalid:'Discarded update',partial:'Incomplete update',superseded:'Earlier final rating',previous:'Earlier final rating',matching:'Same final rating'};
  return `<details class="timeline-history"><summary>Rating history <span>(${count} saved updates)</span></summary><p>Earlier and incomplete updates are kept here, separate from the chart. Repeats are grouped.</p><ul>${groups.map(group=>`<li class="timeline-history-group" data-kind="${group.kind}"><strong>${labels[group.kind]} · ${group.score}</strong><p>${safeText(group.reason)}</p><details><summary>${group.records.length===1?'View saved update':`View ${group.records.length} saved updates`}</summary><ol>${group.records.map(point=>`<li><time datetime="${new Date(point.observedAt).toISOString()}">${safeText(new Date(point.observedAt).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}))}</time>${group.scoreText?` · Score ${safeText(group.scoreText)}`:''}${point.ratingKind!=='final'?` · ${safeText(point.label)}`:''}</li>`).join('')}</ol></details></li>`).join('')}</ul></details>`;
}

function renderExcitementTimeline(game,summary) {
  return globalThis.SportsRadarGameCenter.timeline(game,summary,ratingHistory[watchKey(game)] || []);
}

function excitementTimeline(game,summary) {
  if (
    game.state === 'upcoming'
  ) {
    return '<section class="detail-section"><h3>Excitement timeline</h3><p class="detail-empty">The chart starts when the game begins.</p></section>';
  }

  const view = timelinePresentation(game,timelinePoints(game,summary));
  const {
    points,
    source,
    domainEnd = 1,
    dividers = []
  } = view;
  const ratingSummary=timelineRatingSummary(view);
  const historyDetails=timelineHistoryDetails(view.history);

  if (
    points.length < 2
  ) {
    return `<section class="detail-section timeline-section"><h3>Excitement timeline</h3>${ratingSummary}<p class="detail-empty">Not enough reliable live history to draw the chart.</p>${historyDetails}</section>`;
  }

  const width = 600;
  const height = 180;
  const left = 30;
  const right = 12;
  const top = 12;
  const bottom = 27;

  const px =
    point =>
      left +
      (point.x / domainEnd) *
      (
        width -
        left -
        right
      );

  const overtimeGuides = dividers.map((divider,index) => {
    const x = px(divider);
    const next = index+1 < dividers.length ? px(dividers[index+1]) : width-right;
    const label = next-x >= 28 ? `<text x="${((x+next)/2).toFixed(1)}" y="${top+10}" text-anchor="middle">${divider.label}</text>` : '';
    return `<g class="timeline-overtime"><line class="timeline-midline" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${top}" y2="${height-bottom}" stroke-dasharray="3 4"/><title>${index === 0 ? 'End regulation / ' : ''}${divider.label}</title>${label}</g>`;
  }).join('');

  const py =
    point =>
      top +
      (
        100 -
        point.score
      ) *
      (
        height -
        top -
        bottom
      ) /
      100;

  const path =
    points
      .map(
        (point,index) =>
          `${index && timelineComparable(point,points[index-1]) ? 'L' : 'M'} ${px(point).toFixed(1)} ${py(point).toFixed(1)}`
      )
      .join(' ');

  const rises =
    points
      .slice(1)
      .map(
        (point,index) => ({
          ...point,
          delta:
            timelineComparable(point,points[index]) ? point.score - points[index].score : 0
        })
      )
      .filter(point =>
        point.delta >= 5 &&
        point.text !== 'Current rating'
      )
      .sort(
        (a,b) =>
          b.delta -
          a.delta
      )
      .slice(0,3);

  const timelinePointExplanation = (point,index) => {
    const previous = points[index - 1];
    const score = Number(point.score);
    const prior = Number(previous?.score);
    const delta =
      timelineComparable(point,previous) && Number.isFinite(score) && Number.isFinite(prior)
        ? score - prior
        : 0;

    const lastRecorded=point===view.lastLive ? 'Last reliable live rating. ' : '';
    const movement =
      !timelineComparable(point,previous)
        ? `Recorded rating: ${score}.`
        : delta === 0
        ? `The rating stayed at ${score}.`
        : `The rating moved ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} ${Math.abs(delta)===1?'point':'points'}, from ${prior} to ${score}.`;

    const detail =
      point.text && point.text !== 'Current rating'
        ? `${String(point.text).replace(/[.]+$/,'')}.`
        : 'This is the current rating at that point in the game.';

    return `${lastRecorded}${point.label || 'Timeline point'}: ${movement} ${detail}`;
  };

  const timelineHelpId =
    `timeline-point-help-${String(game.id).replace(/[^a-zA-Z0-9_-]/g,'-')}`;

  const markerCandidates =
    points
      .map((point,index) => ({
        point,
        index,
        previous:points[index - 1]
      }))
      .slice(1)
      .filter(({point,index,previous}) => {
        const current =
          index ===
          points.length - 1;

        const delta =
          Number(point.score) -
          Number(previous?.score);

        const majorMove =
          timelineComparable(point,previous) &&
          Number.isFinite(delta) &&
          Math.abs(delta) >= 5;

        const enteredOvertime =
          point.overtime === true &&
          previous?.overtime !== true;

        return (
          current ||
          majorMove ||
          enteredOvertime
        );
      });

  const markers =
    markerCandidates
      .map(({point,index}) => {
        const explanation =
          timelinePointExplanation(
            point,
            index
          );

        const current =
          index ===
          points.length - 1;

        return `<g class="timeline-point${current ? ' timeline-point-last' : ''}" data-timeline-explanation="${safeText(explanation)}" role="button" tabindex="0" aria-expanded="false" aria-controls="${timelineHelpId}" aria-label="${safeText(explanation)}"><circle class="${current ? 'timeline-end' : ''}" cx="${px(point).toFixed(1)}" cy="${py(point).toFixed(1)}" r="${current ? '5' : '3'}"/><title>${safeText(explanation)}</title></g>`;
      })
      .join('');

  const annotationFormat =
    timelineFormat(
      game,
      summary
    );

  const eventMarkers =
    source.startsWith('recorded')
      ? scoringEvents(summary)
          .map((play,index,plays) => {
            const period = Number(
              play?.period?.number ||
              play?.period?.value ||
              play?.period ||
              0
            );

            const siblings =
              plays.filter(item =>
                Number(
                  item?.period?.number ||
                  item?.period?.value ||
                  item?.period ||
                  0
                ) === period
              );

            const ordinal =
              (
                siblings.indexOf(play) +
                1
              ) /
              (
                siblings.length +
                1
              );

            const x =
              timelineEventPosition(
                game,
                play,
                annotationFormat,
                ordinal
              );

            const text =
              compactPlay(play);

            if (
              x === null ||
              !Number.isFinite(x) ||
              x < 0 ||
              x > domainEnd ||
              !text
            ) {
              return '';
            }

            const nearest =
              points.reduce(
                (best,point) =>
                  !best ||
                  Math.abs(point.x - x) <
                    Math.abs(best.x - x)
                    ? point
                    : best,
                null
              );

            if (!nearest) {
              return '';
            }

            const label =
              `${
                timelinePeriodLabel(
                  play,
                  annotationFormat
                )
              } ${
                play.clock?.displayValue ||
                ''
              }`
                .trim();

            const explanation =
              `${label || 'Scoring play'}: ${text}`;

            return `<g class="timeline-point timeline-event-marker" data-timeline-explanation="${safeText(explanation)}" role="button" tabindex="0" aria-expanded="false" aria-controls="${timelineHelpId}" aria-label="${safeText(explanation)}"><circle cx="${px({x}).toFixed(1)}" cy="${height-bottom}" r="2.25"/><title>${safeText(explanation)}</title></g>`;
          })
          .join('')
      : '';

  const moments =
    rises.length
      ? `<ol class="timeline-moments">${rises.map(point =>
          `<li><b>+${point.delta}</b><span><strong>${safeText(point.label)}</strong> · ${safeText(point.text)}</span></li>`
        ).join('')}</ol>`
      : '';

  const note=source.startsWith('recorded') || source==='browser observations' ? 'Live ratings recorded during the game.' : 'Estimated from scoring plays; no recorded live curve is available.';
  return `<section class="detail-section timeline-section"><h3>Excitement timeline</h3>${ratingSummary}<p class="timeline-note">${note} Gaps mark unavailable or revised updates.${view.completed?' The final rating reflects the whole game.':''}</p><svg class="timeline-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Live excitement ratings during the game"><line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"/><line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/><line class="timeline-midline" x1="${left}" y1="${py({score:50})}" x2="${width - right}" y2="${py({score:50})}"/><text x="3" y="${top + 4}">100</text><text x="10" y="${py({score:50}) - 4}">50</text><text x="16" y="${height - bottom + 4}">0</text>${overtimeGuides}<path class="timeline-line" d="${path}"/>${eventMarkers}${markers}<text x="${left}" y="${height - 5}">Start</text><text x="${width - right}" y="${height - 5}" text-anchor="end">${game.state === 'completed' ? 'End of game' : 'Game time'}</text></svg><div class="timeline-point-help" id="${timelineHelpId}" role="status" aria-live="polite" aria-hidden="true"></div>${moments}${historyDetails}</section>`;
}

function safeStoryUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:','https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function storylineDetails(game) {
  const factors = game.state==='upcoming' ? upcomingLinkedStories(game) : [...(game.verifiedDevelopments||[]).filter(d=>d.verified),
    ...(Array.isArray(game.qualitativeContexts) ? game.qualitativeContexts : []).filter(f=>!game.suppressedContextTypes?.includes(f.type))];
  if (!factors.length) return '';
  if(game.state==='upcoming') {
    const seen=new Set(),links=[];
    for(const factor of factors) {
      const sources=(factor.sources?.length?factor.sources:[{url:factor.sourceUrl,title:factor.sourceTitle}]).slice(0,6);
      const significance=factor.injuryEvidence?.playerSignificance;
      if(game.sport==='NFL'&&significance?.verified)sources.push({url:significance.sourceUrl,title:significance.fact});
      for(const source of sources) {
        const href=safeStoryUrl(source?.url);if(!href)continue;
        const url=new URL(href);if(url.username||url.password)continue;
        url.hash='';if(seen.has(url.href))continue;seen.add(url.href);
        const publication=source.publisher?.name||source.publisher||source.publication;
        const label=typeof publication==='string'&&publication.trim()&&publication.trim()!=='?'?publication.trim():url.hostname.replace(/^www\./,'');
        links.push(`<a href="${safeText(href)}" target="_blank" rel="noopener noreferrer" title="${safeText(source.title||label)}">${safeText(label)}</a>`);
      }
    }
    return links.length?`<div class="storyline-section"><p class="detail-empty">Sources: ${links.join(' · ')}</p></div>`:'';
  }
  const seen=new Set();
  const normalized=text=>String(text||'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const outlook=game.state==='upcoming'?` ${normalized(explainRating(game))} `:'';
  const rows = factors.slice(0,6).map(factor => {
    const text=publicStorySentence(factor),key=text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    if(!key||seen.has(key))return '';
    seen.add(key);
    const links=factor.sources?.length?factor.sources:[{url:factor.sourceUrl,title:factor.sourceTitle}];
    const source=[...new Map(links.map(s=>[safeStoryUrl(s.url),s])).values()].slice(0,6).map((s,i)=>{
      const url=safeStoryUrl(s.url);return url?`<a href="${safeText(url)}" target="_blank" rel="noopener noreferrer" title="${safeText(s.title || 'Read source')}">${i?'Additional source':'Read source'} ?</a>`:'';
    }).join('');
    const significance=factor.injuryEvidence?.playerSignificance;
    const proofUrl=safeStoryUrl(significance?.sourceUrl);
    const proof=game.sport==='NFL' && proofUrl && significance.verified
      ? `<a href="${safeText(proofUrl)}" target="_blank" rel="noopener noreferrer" title="${safeText(significance.fact)}">Player honors source ↗</a>` : '';
    return `<li><span>${safeText(text)}</span>${source}${proof}</li>`;
  }).filter(Boolean).slice(0,3).join('');
  if(!rows)return '';
  return `<section class="detail-section storyline-section"><h3>Game storylines</h3><ul>${rows}</ul></section>`;
}

const DETAIL_TAB_CONFIG = {
  NFL:[['overview','Overview'],['drives','Drives'],['team-stats','Team Stats'],['players','Players'],['plays','Plays']],
  CFB:[['overview','Overview'],['drives','Drives'],['team-stats','Team Stats'],['players','Players'],['plays','Plays']],
  MLB:[['overview','Overview'],['batting','Batting'],['pitching','Pitching'],['team-stats','Team Stats'],['plays','Plays']],
  NHL:[['overview','Overview'],['team-stats','Team Stats'],['players','Skaters'],['goalies','Goalies'],['plays','Plays']],
  NBA:[['overview','Overview'],['box-score','Box Score'],['team-stats','Team Stats'],['plays','Plays']],
  NCAAB:[['overview','Overview'],['box-score','Box Score'],['team-stats','Team Stats'],['plays','Plays']],
  Soccer:[['overview','Overview'],['team-stats','Team Stats'],['plays','Plays']],
  Tennis:[['overview','Overview']]
};

let activeDetailTab = 'overview';
let activePlayerTeam = '';
let activePlayerCategory = '';

// Reuse the existing sport-specific tables with one real team/category selected.
// The original full tables remain available on desktop.
function detailPlayerBrowser(game,summary) {
  const blocks = Array.isArray(summary?.boxscore?.players) ? summary.boxscore.players : [];
  const basketball = ['NBA','NCAAB'].includes(game.sport);
  const normalizedTeams = summary?.basketballBoxScore?.teams || [];
  if (!blocks.length && !(basketball && normalizedTeams.length)) return '';
  const categoryFor = group => {
    const key = statKey(group.type || group.name || group.displayName);
    if (['NFL','CFB'].includes(game.sport)) return FOOTBALL_PLAYER_GROUPS.has(key) ? key : '';
    if (game.sport === 'NHL') return /goalie|goaltender/i.test(key) ? 'goalies' : 'skaters';
    if (game.sport === 'MLB') return ['batting','pitching'].includes(key) ? key : '';
    return key;
  };
  const categories = new Map();
  if (basketball && normalizedTeams.length) categories.set('box-score','Box score');
  else for (const block of blocks) for (const group of block.statistics || []) {
    if (!(group.athletes || group.players || []).length) continue;
    const key = categoryFor(group);
    if (!key) continue;
    const label = FOOTBALL_PLAYER_GROUP_TITLES[key] || ({batting:'Batting',pitching:'Pitching',skaters:'Skaters',goalies:'Goalies'})[key] || group.displayName || group.name || group.type || 'Player stats';
    if (!categories.has(key)) categories.set(key,label);
  }
  if (!categories.size || !game.teams?.length) return '';
  if (!['0','1'].includes(activePlayerTeam) || !game.teams[Number(activePlayerTeam)]) activePlayerTeam = '0';
  if (!categories.has(activePlayerCategory)) activePlayerCategory = categories.keys().next().value;
  const index = Number(activePlayerTeam),team = game.teams[index];
  const matches = source => {
    const id = String(source?.id || source?.teamId || '');
    if (team[8] && id) return String(team[8]) === id;
    const names = [source?.displayName,source?.shortDisplayName,source?.abbreviation].filter(Boolean).map(normalizedTeamName);
    return [team[0],team[1]].filter(Boolean).some(name => names.includes(normalizedTeamName(name)));
  };
  const filteredBlocks = blocks.filter(block => matches(block.team)).map(block => ({...block,
    statistics:(block.statistics || []).filter(group => categoryFor(group) === activePlayerCategory)}));
  const selected = {...summary,boxscore:{...summary.boxscore,players:filteredBlocks},
    basketballBoxScore:{...summary.basketballBoxScore,teams:normalizedTeams.filter(matches)}};
  let table = '';
  if (basketball) table = basketballBoxScoreMarkup(selected,game.sport);
  else if (game.sport === 'MLB') table = detailMlbPlayerStats(selected,activePlayerCategory);
  else if (game.sport === 'NHL') table = activePlayerCategory === 'goalies' ? detailNhlGoalies(selected) : detailPlayerStats(selected,game.sport);
  else if (['NFL','CFB'].includes(game.sport)) table = detailPlayerStats(selected,game.sport);
  else table = filteredBlocks.flatMap(block => block.statistics || []).map(group => {
    const first = (group.athletes || group.players || [])[0];
    const labels = group.labels?.length ? group.labels : group.headers?.length ? group.headers : Object.keys(first?.stats || {});
    return playerTable(group,labels.map(label => ({title:label,aliases:[label]})),categories.get(activePlayerCategory));
  }).join('');
  const buttons = game.teams.slice(0,2).map((item,i) => `<button type="button" data-player-team="${i}" aria-pressed="${i === index}">${teamLogoWithFallback(item[4] || teamLogoUrl(game.sport,item[1]),item[1] || item[0])}<span>${safeText(item[0])}</span></button>`).join('');
  const options = [...categories].map(([key,label]) => `<option value="${safeText(key)}"${key === activePlayerCategory ? ' selected' : ''}>${safeText(label)}</option>`).join('');
  return `<div class="mobile-player-browser"><div class="player-team-switch" role="group" aria-label="Team for player statistics">${buttons}</div><label class="player-category"><span>Category</span><span class="player-select-wrap"><select data-player-category aria-label="Player statistics category">${options}</select><span aria-hidden="true">⌄</span></span></label><p class="player-caption">${safeText(team[0])} · ${safeText(game.live?.phase || game.status || '')}</p>${table || '<p class="detail-empty">No player statistics are available for this team and category.</p>'}</div>`;
}

function detailTabSections(game,summary) {
  const overviewParts = [
    renderExcitementTimeline(game,summary),
    game.state==='upcoming'?'':storylineDetails(game),
    detailScoring(summary,game.sport),
    detailLeaders(summary)
  ].filter(Boolean);

  const playerBrowser = detailPlayerBrowser(game,summary);
  const withPlayerBrowser = content => playerBrowser ? `${playerBrowser}<div class="desktop-player-stats">${content}</div>` : content;
  const sections = new Map([
    [
      'overview',
      overviewParts.join('')
    ],
    ['drives',detailDrives(summary,game.sport,game.liveRawStatus)],
    ['batting',withPlayerBrowser(detailMlbPlayerStats(summary,'batting'))],
    ['pitching',withPlayerBrowser(detailMlbPlayerStats(summary,'pitching'))],
    ['team-stats',game.state==='upcoming' ? '' : detailStats(summary,game.sport)+(game.sport==='NHL' ? detailNhlAdvanced(summary) : '')],
    ['players',withPlayerBrowser(detailPlayerStats(summary,game.sport))],
    ['goalies',withPlayerBrowser(detailNhlGoalies(summary))],
    ['box-score',game.state==='upcoming' ? '' : withPlayerBrowser(basketballBoxScoreMarkup(summary,game.sport))],
    ['plays',detailPlays(summary,game)]
  ]);

  const configured = DETAIL_TAB_CONFIG[game.sport] || DETAIL_TAB_CONFIG.Tennis;
  const tabs = game.sport === 'Soccer' && playerBrowser
    ? [...configured.slice(0,-1),['players','Players'],...configured.slice(-1)] : configured;
  return tabs
    .map(([id,label]) => ({
      id,
      label,
      content:sections.get(id) || ''
    }))
    .filter(tab => Boolean(tab.content));
}

function detailTabsMarkup(game,summary) {
  const tabs = detailTabSections(game,summary);

  if (!tabs.length) return '';

  if (tabs.length === 1) return tabs[0].content;

  if (!tabs.some(tab => tab.id === activeDetailTab)) {
    activeDetailTab = tabs[0].id;
  }

  const gameKey =
    String(game.id || 'game')
      .replace(/[^a-zA-Z0-9_-]/g,'-');

  const buttons = tabs.map(tab => {
    const selected = tab.id === activeDetailTab;
    const tabId = `detail-tab-${gameKey}-${tab.id}`;
    const panelId = `detail-panel-${gameKey}-${tab.id}`;

    return `<button type="button" class="detail-tab ${selected ? 'active' : ''}" id="${tabId}" role="tab" data-detail-tab="${tab.id}" aria-selected="${selected}" aria-controls="${panelId}" tabindex="${selected ? '0' : '-1'}">${safeText(tab.label)}</button>`;
  }).join('');

  const panels = tabs.map(tab => {
    const selected = tab.id === activeDetailTab;
    const tabId = `detail-tab-${gameKey}-${tab.id}`;
    const panelId = `detail-panel-${gameKey}-${tab.id}`;

    return `<div class="detail-tab-panel" id="${panelId}" role="tabpanel" aria-labelledby="${tabId}"${selected ? '' : ' hidden'}>${tab.content}</div>`;
  }).join('');

  return `<div class="detail-tab-shell ${tabs.some(tab => tab.content.includes('mobile-player-browser')) ? 'has-player-browser' : ''}"><div class="detail-tabs" role="tablist" aria-label="${safeText(labelForSport(game.sport))} game details">${buttons}</div>${panels}</div>`;
}

function setActiveDetailTab(button) {
  const shell = button?.closest('.detail-tab-shell');
  const nextTab = button?.dataset.detailTab;

  if (!shell || !nextTab) return;

  activeDetailTab = nextTab;

  if (['batting','pitching','goalies'].includes(nextTab) &&
      globalThis.matchMedia?.('(max-width: 600px)').matches && activePlayerCategory !== nextTab) {
    activePlayerCategory = nextTab;
    renderActiveDetail();
    return;
  }

  shell.querySelectorAll('.detail-tab').forEach(tab => {
    const selected = tab.dataset.detailTab === nextTab;
    tab.classList.toggle('active',selected);
    tab.setAttribute('aria-selected',String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });

  shell.querySelectorAll('.detail-tab-panel').forEach(panel => {
    panel.hidden =
      panel.id !== button.getAttribute('aria-controls');
  });
}

function moveDetailTabFocus(event,button) {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
    return false;
  }

  const tabs = [
    ...button
      .closest('.detail-tabs')
      ?.querySelectorAll('.detail-tab') || []
  ];

  if (!tabs.length) return false;

  const current = tabs.indexOf(button);
  let index = current;

  if (event.key === 'Home') index = 0;
  if (event.key === 'End') index = tabs.length - 1;
  if (event.key === 'ArrowLeft') index = (current - 1 + tabs.length) % tabs.length;
  if (event.key === 'ArrowRight') index = (current + 1) % tabs.length;

  event.preventDefault();
  tabs[index].focus();
  tabs[index].click();
  return true;
}

function renderDetailContent(
  game,
  summary,
  loading=false
) {
  summary=orderedDetailSummary(game,globalThis.SportsRadarScore?.canonicalDetailSummary?.(game,summary) || summary);
  $('#game-detail-title').textContent =
    'Game Center';

  if (loading) {
    renderDetailContent(game,null,false);
    $('#game-detail-content').insertAdjacentHTML('beforeend','<p class="detail-loading" role="status">Loading game statistics...</p>');
    return;
  }

  const competition =
    summary?.header?.competitions?.[0];

  // Score, clock and rating always describe the same canonical feed state.
  const title = `${game.teams[0][0]} vs ${game.teams[1][0]}`;

  const scores = game.teams.map(team => {
    const teamMeta = [
      Number(team[6]) > 0
        ? `No. ${team[6]}`
        : '',
      team[5] || ''
    ].filter(Boolean);

    const teamPageId =
      ['NFL','MLB','NHL','CFB','NBA','NCAAB','Soccer'].includes(game.sport)
        ? String(team[8] || '')
        : '';

    const tag = teamPageId ? 'button' : 'div';
    const attrs = teamPageId
      ? ` type="button" data-detail-team-id="${safeText(teamPageId)}" data-detail-team-sport="${safeText(game.sport)}" aria-label="Open ${safeText(team[0])} team page"`
      : '';

    const logo = team[4] || teamLogoUrl(game.sport,team[1]);
    return `<${tag} class="detail-team ${teamPageId ? 'detail-team-link' : ''}"${attrs}>${teamLogoWithFallback(logo,team[1] || team[0],'','eager')}<span class="detail-team-copy"><strong>${safeText(team[0])}</strong>${teamMeta.length ? `<small>${safeText(teamMeta.join(' · '))}</small>` : ''}${typeof nhlPowerPlayMarkup === 'function' ? nhlPowerPlayMarkup(game,team) : ''}</span><b>${game.state === 'upcoming' ? '' : safeText(team[2])}</b></${tag}>`;
  }).join('') + (game.state === 'upcoming' ? '<span class="pregame-versus">VS</span>' : '');

  const detailSituation = game.timingUncertain ? '' :
    ['NFL','CFB'].includes(game.sport) && game.footballSituation ? footballSituationMarkup(game) :
    game.sport === 'MLB' && game.baseballSituation ? baseballSituationMarkup(game) : '';

  const status = game.timingUncertain ? 'Clock updating' :
    (game.state === 'live' ? game.live?.phase : '') || game.status;

  const detailClockValue = game.timingUncertain ? '' : String(game.liveRawStatus?.displayClock || String(status || '').match(/\b\d{1,2}:\d{2}\b/)?.[0] || '');
  const detailPeriod = compactClockPeriod(game);
  const betweenPeriods = /halftime|half time|intermission|end of|end[_ ]period|break/i.test([status,game.status,game.liveRawStatus?.type?.name].join(' '));
  const detailClock = game.state === 'live' && !betweenPeriods && !(game.sport==='NCAAB'&&halftimePriorityAdjustment(game)) && (detailClockValue || detailPeriod === 'Shootout')
    ? `<span class="detail-live-clock"><span>${safeText(detailPeriod || 'Live')}</span>${detailPeriod === 'Shootout' ? '' : `<strong>${safeText(detailClockValue)}</strong>`}</span>` : '';

  const venue =
    competition?.venue?.fullName ||
    game.sub;

  const line =
    displayLine(game);

  const lineMeta =
    line.text &&
    line.text !== 'Not listed'
      ? `<span><strong>${safeText(line.label)}</strong> ${safeText(line.text)}${line.provider ? ` · ${safeText(line.provider)}` : ''}</span>`
      : '';

  const opening = game.pregameBaseline?.source === 'observed' &&
    Number.isFinite(game.pregameBaseline.score)
      ? game.pregameBaseline.score
      : null;

  const ratingContext = game.timingUncertain
    ? `${game.heldRatingProvisional?'Last observed rating':'Last confirmed rating'} ${game.score==null?'pending':safeText(game.score)} · Clock updating`
    : game.state==='live'&&game.scoringPartial
      ? `Provisional rating ${game.score==null?'pending':safeText(game.score)} · Awaiting confirmation`
    : game.state === 'upcoming'
      ? `Pregame rating ${safeText(game.score)}`
      : opening !== null
        ? `Opening ${safeText(opening)} · Current ${safeText(game.score)}`
        : `Current rating ${safeText(game.score)}`;
  const scoreClass = scoreHeatClass(game.score);
  const scoreColorStyle = `--score-hue:${scoreHueFor(game.score)};`;

  $('#game-detail-content').innerHTML =
    `<header class="detail-header"><div class="detail-kicker">${safeText(labelForSport(game.sport))} · ${safeText(status)}${detailClock}</div><h2>${safeText(title)}</h2><button type="button" class="detail-watch ${isWatched(game) ? 'active' : ''}" data-watch-id="${safeText(watchKey(game))}" aria-pressed="${isWatched(game)}">${isWatched(game) ? '★ Watching this game' : '☆ Add to watchlist'}</button><div class="detail-scoreboard${game.state === 'upcoming' ? ' pregame' : ''}">${scores}</div>${detailSituation ? `<div class="detail-situation">${detailSituation}</div>` : ''}<div class="detail-meta"><span><strong>Venue</strong> ${safeText(venue)}</span><span><strong>Broadcast</strong> ${safeText(game.channel || 'Channel not listed')}</span>${lineMeta}</div>${broadcastWatchMarkup(game,summary)}${game.moment ? `<section class="detail-moment"><strong>${safeText(game.momentLabel || 'Notable play')}</strong><span>${safeText(displayMoment(game))}</span></section>` : ''}</header><section class="detail-radar" style="${scoreColorStyle}"><div class="detail-excitement-head"><span class="detail-excitement-score ${scoreClass}" style="${scoreColorStyle}">${safeText(game.score)}</span><span class="detail-excitement-copy"><small>${game.state==='live'?'Watch now':game.state==='completed'?'Game quality':'Pregame rating'}</small><strong>${safeText(ratingContext)}</strong>${trendFor(game)}</span></div><div class="detail-radar-why"><h3>${game.state==='upcoming'?'Pregame outlook':`Why ${safeText(game.score)}?`}</h3><p class="detail-explanation detail-why-text">${safeText(explainRating(game,summary))}</p>${game.state==='upcoming'?storylineDetails(game):''}</div></section>${detailTabsMarkup(game,summary)}`;
}

async function fetchGameSummary(game,controller=new AbortController()) {

  const timer =
    setTimeout(
      () => controller.abort(),
      7000
    );

  try {
    const response =
      await fetch(
        summaryUrlFor(
          game.sport,
          game.id
        ),
        {
          cache:'no-store',
          signal:controller.signal
        }
      );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function showDialog(dialog) {
  if (!dialog) return;

  if (
    typeof dialog.showModal === 'function'
  ) {
    dialog.showModal();
  } else {
    dialog.setAttribute(
      'open',
      ''
    );
  }
}

function hideDialog(dialog) {
  if (!dialog) return;

  if (
    typeof dialog.close === 'function'
  ) {
    dialog.close();
  } else {
    dialog.removeAttribute(
      'open'
    );
  }
}

function showGameDetails() {
  // A hash navigation can reuse the open document, including its top-layer
  // Settings/search dialog. Game Center must become the visible destination.
  document.querySelectorAll('dialog[open]').forEach(hideDialog);
  const overlay =
    $('#game-detail-overlay');

  overlay.hidden = false;

  document.body.classList.add(
    'detail-open'
  );

  overlay
    .querySelector('.close-dialog')
    ?.focus();
}

let activeDetailGame = null;
let activeDetailSummary = null;
let linkedGameRequest = null;
let detailReturnHash = '#home';
let detailGeneration = 0;
let detailTimer = null;
let detailRequest = null;
let detailFinalPending = false;
let detailFailed = false;

function stopDetailRequest() {
  linkedGameRequest?.abort();linkedGameRequest=null;
  if (detailRequest && activeDetailGame?.state === 'completed') detailFinalPending = true;
  clearTimeout(detailTimer);
  detailTimer = null;
  detailGeneration++;
  detailRequest?.controller.abort();
  detailRequest = null;
}

function latestDetailGame() {
  if (!activeDetailGame) return null;
  const latest = games.find(game => game.sport === activeDetailGame.sport &&
    String(game.id) === String(activeDetailGame.id));
  if (latest) {
    if (activeDetailGame.state === 'live' && latest.state !== 'live') detailFinalPending = true;
    activeDetailGame = latest;
  }
  return activeDetailGame;
}

function renderActiveDetail() {
  const game = latestDetailGame();
  if (!game) return;
  let summary = activeDetailSummary;
  if (summary) {
    // Source competitions are not serialized into /feed. Rebuild only the
    // validator's scoreboard inputs; this path never calculates a rating.
    const scoreboard = {status:game.liveRawStatus,competitors:game.teams.map(team => ({
      team:{id:team[8] || '',displayName:team[0]},score:team[2]
    }))};
    const summaryState = summary.header?.competitions?.[0]?.status?.type?.state;
    const compatible = game.state === 'live'
      ? globalThis.SportsRadarDetail.validateLiveSummary(game,scoreboard,summary)
      : !summaryState || summaryState === (game.state === 'completed' ? 'post' : 'pre');
    const missing = !summary.sportsRadarGame && !games.some(item => item.sport === game.sport && String(item.id) === String(game.id));
    summary = {...summary,sportsRadarFreshness:{...summary.sportsRadarFreshness,
      stale:detailFailed || missing || !compatible || summary.sportsRadarFreshness?.stale === true}};
  }
  renderDetailContent(game,summary);
}

function syncActiveDetail() {
  renderActiveDetail();
  if (detailFinalPending && !document.hidden && !detailRequest) refreshActiveDetail();
}

async function refreshActiveDetail() {
  const game = latestDetailGame();
  if (!game || document.hidden || detailRequest) return;
  clearTimeout(detailTimer);
  const request = {generation:detailGeneration,controller:new AbortController()};
  detailRequest = request;
  detailFinalPending = false;
  try {
    const summary = await fetchGameSummary(game,request.controller);
    if (request.generation !== detailGeneration || detailRequest !== request) return;
    const resolved=summary?.sportsRadarGame;
    if(resolved && resolved.sport===game.sport && String(resolved.id)===String(game.id) && !games.some(item=>item.sport===game.sport && String(item.id)===String(game.id))) activeDetailGame={...resolved,favorite:favoriteFor(resolved.teams,resolved.sport)};
    const previousVersion = Date.parse(activeDetailSummary?.sportsRadarFreshness?.updatedAt || '');
    const version = Date.parse(summary?.sportsRadarFreshness?.updatedAt || '');
    if (!Number.isFinite(previousVersion) || (Number.isFinite(version) && version >= previousVersion)) {
      activeDetailSummary = summary;
      detailFailed = false;
    } else detailFailed = true;
    renderActiveDetail();
  } catch {
    if (request.generation !== detailGeneration || detailRequest !== request) return;
    detailFailed = true;
    renderActiveDetail();
  } finally {
    if (request.generation === detailGeneration && detailRequest === request) {
      detailRequest = null;
      const latest = latestDetailGame();
      if (!document.hidden && latest && (latest.state === 'live' || detailFinalPending)) {
        detailTimer = setTimeout(refreshActiveDetail,10000);
      }
    }
  }
}

function detailVisibilityChanged() {
  if (document.hidden) stopDetailRequest();
  else {
    const game = latestDetailGame();
    if (game && (game.state === 'live' || detailFinalPending || !activeDetailSummary)) refreshActiveDetail();
  }
}

function hideGameDetails({keepRoute=false}={}) {
  stopDetailRequest();
  $('#game-detail-overlay').hidden = true;
  document.body.classList.remove('detail-open');
  activeDetailGame = null;
  activeDetailSummary = null;
  activeDetailTab = 'overview';
  detailFinalPending = false;
  if(!keepRoute && globalThis.history && gameRouteFromHash()) {
    history.replaceState(null,'',detailReturnHash || '#home');
    handleLocationChange();
  }
}

function rememberGameRoute(game) {
  if(!globalThis.history)return;
  if(location.hash!==gameHash(game)) {
    detailReturnHash=gameRouteFromHash()?'#home':location.hash || '#home';
    history.pushState(null,'',gameHash(game));
  }
}

async function openLinkedGame(id,sport,restore=null) {
  stopDetailRequest();const generation=detailGeneration;
  activeDetailGame=null;activeDetailSummary=null;
  activeDetailTab=restore?.tab || 'overview';activePlayerTeam=restore?.team || '';activePlayerCategory=restore?.category || '';
  const controller=new AbortController();linkedGameRequest=controller;
  $('#game-detail-title').textContent='Game Center';
  $('#game-detail-content').innerHTML='<div class="detail-loading">Loading the latest game data…</div>';
  showGameDetails();
  try {
    const summary=await fetchGameSummary({id,sport},controller);
    if(generation!==detailGeneration || controller.signal.aborted)return;
    const game=summary?.sportsRadarGame;
    if(!game || game.sport!==sport || String(game.id)!==String(id) || game.teams?.length!==2)throw new Error('Game unavailable');
    activeDetailGame={...game,favorite:favoriteFor(game.teams,sport)};activeDetailSummary=summary;detailFailed=false;
    rememberGameRoute(game);renderActiveDetail();
    if(game.state==='live')detailTimer=setTimeout(refreshActiveDetail,10000);
  } catch(error) {
    if(generation!==detailGeneration || controller.signal.aborted)return;
    $('#game-detail-content').innerHTML=`<section class="detail-section"><h2>Game unavailable</h2><p>The game could not be loaded. It may be outside the available archive, or the data service may be temporarily unavailable.</p><button type="button" class="primary-button" data-game-retry="${safeText(id)}" data-game-retry-sport="${safeText(sport)}">Try again</button><button type="button" class="close-dialog">Return to Slate</button></section>`;
  } finally {if(linkedGameRequest===controller)linkedGameRequest=null;}
}

async function openGameDetails(id,sport=null,restore=null) {
  if (sport && !publicSport(sport)) {
    stopDetailRequest();activeDetailGame=null;activeDetailSummary=null;
    $('#game-detail-title').textContent='Sport unavailable';
    $('#game-detail-content').innerHTML=`<section class="detail-section"><h2>${safeText(labelForSport(sport))} is temporarily unavailable</h2><p>SlateMeter currently covers NFL, College Football, NCAAM, NHL, MLB, and NBA.</p><button type="button" class="close-dialog">Return to Slate</button></section>`;
    showGameDetails();return;
  }
  const game = games.find(item => String(item.id) === String(id) && (!sport || item.sport === sport));
  if (!game) {if(sport)return openLinkedGame(id,sport,restore);return;}
  stopDetailRequest();
  activeDetailGame = game;
  activeDetailSummary = null;
  activeDetailTab = 'overview';
  detailFinalPending = false;
  activeDetailTab = restore?.tab || 'overview';
  activePlayerTeam = restore?.team || '';
  activePlayerCategory = restore?.category || '';
  detailFailed = false;
  if(globalThis.history)rememberGameRoute(game);
  renderDetailContent(game,null,true);
  showGameDetails();
  await refreshActiveDetail();
}

function compactPlay(play) {
  const text =
    String(
      play?.text ||
      play?.shortText ||
      play?.type?.text ||
      ''
    )
      .replace(/\s+/g,' ')
      .trim();

  return text.length > 86
    ? `${text.slice(0,83)}…`
    : text;
}

function summarySpecificWhy(game,summary) {
  const scoring =
    scoringEvents(summary)
      .map(play => ({
        play,
        position:
          playPosition(
            game.sport,
            play
          )
      }))
      .filter(item =>
        item.position !== null
      )
      .sort(
        (a,b) =>
          a.position -
          b.position
      );

  const last =
    scoring[
      scoring.length - 1
    ];

  if (!last) {
    return null;
  }

  const text =
    compactPlay(last.play);

  if (!text) {
    return null;
  }

  const time =
    `${playPeriodLabel(game,last.play,summary)} ${last.play.clock?.displayValue || ''}`
      .trim();

  if (
    game.state === 'completed'
  ) {
    // The fallback belongs only to the explicit legacy capture harness.
    const decisive = typeof globalThis.SportsRadarScore?.decisiveScoringPlay === 'function'
      ? globalThis.SportsRadarScore.decisiveScoringPlay(game,summary)
      : /(0:00|last second|game[- ]winning|walk.off)/i.test(`${time} ${text}`) ||
        (Number(last.play.period?.number)>({NHL:3,NFL:4,CFB:4,NBA:4,NCAAB:2})[game.sport] && /goal|field goal|touchdown|basket/i.test(text));
    if (decisive && typeof decisive === 'object') return {label:'Decisive play',text:[playPeriodLabel(game,decisive,summary,`Period ${decisive.period?.number}`),decisive.clock?.displayValue,compactPlay(decisive)].filter(Boolean).join(' \u00b7 ')};

    return {
      label:
        decisive
          ? 'Decisive play'
          : 'Last score',

      text:
        `${time ? `${time} · ` : ''}${text}`
    };
  }

  const current =
    playPosition(
      game.sport,
      {
        period:{
          number:
            game.liveRawStatus?.period
        },
        clock:{
          displayValue:
            game.liveRawStatus?.displayClock
        }
      }
    ) ??
    gameProgress(
      game.sport,
      {
        status:
          game.liveRawStatus ||
          {}
      }
    );

  if (
    current -
    last.position >
    .12
  ) {
    return null;
  }

  return {
    label:'Latest score',
    text:
      `${time ? `${time} · ` : ''}${text}`
  };
}


function render() {
  syncActiveDetail();
  const isInfoPage = state.page === 'info';
  document.body.classList.toggle('info-page-open',isInfoPage);
  $('#info-page').classList.toggle('hidden',!isInfoPage);
  $$('.nav-link').forEach(link => {
    if (link.dataset.page === state.page) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
    link.classList.toggle('active',link.dataset.page === state.page);
  });
  const hiddenRoute=hiddenSportFromHash();
  $('#hidden-sport-notice').classList.toggle('hidden',!hiddenRoute);
  if (hiddenRoute) $('#hidden-sport-notice').textContent=`${labelForSport(hiddenRoute)} is temporarily unavailable. SlateMeter currently covers NFL, College Football, NCAAM, NHL, MLB, and NBA.`;

  $('#cfb-filters').classList.toggle('hidden',state.page!=='home' || state.sport!=='CFB');

  const isTeamPage =
    state.page === 'team' &&
    Boolean(state.teamRoute);

  document.body.classList.toggle(
    'team-page-open',
    isTeamPage
  );

  $('#team-page').classList.toggle(
    'hidden',
    !isTeamPage
  );

  $('#game-list').classList.toggle(
    'hidden',
    isTeamPage || isInfoPage
  );

  if (isInfoPage) {
    document.title = 'About SlateMeter — SlateMeter';
    return;
  }

  if (isTeamPage) {
    $$('.nav-link').forEach(link =>
      link.classList.remove('active')
    );

    renderTeamPage();

    if ($('#search-dialog')?.open) {
      renderGlobalSearch();
    }

    return;
  }

  document.title =
    'SlateMeter — Live sports, ranked by excitement.';
  const isSoccer =
    state.page === 'soccer';

  $('#section-title').textContent =
    isSoccer
      ? 'Soccer Slate'
      : 'Your Slate';

  $$('.nav-link').forEach(link =>
    link.classList.toggle(
      'active',
      link.dataset.page === state.page
    )
  );

  $$('.soccer-chip').forEach(chip =>
    chip.classList.toggle(
      'hidden',
      !isSoccer
    )
  );

  $('#fcs-toggle').classList.toggle(
    'hidden',
    isSoccer ||
    !state.visibleSports.has('CFB')
  );

  $$('.sport-chip[data-sport]').forEach(chip => {
    const sport = chip.dataset.sport;
    if (HOME_SPORTS.includes(sport)) chip.classList.toggle('hidden',!publicSport(sport) || (!isSoccer && !state.visibleSports.has(sport)));
  });

  if (
    !isSoccer &&
    state.sport !== 'all' &&
    !state.visibleSports.has(
      state.sport
    )
  ) {
    state.sport = 'all';
    $('#mobile-sport-filter-label').textContent = 'All';

    $$('.sport-chip[data-sport]')
      .forEach(chip =>
        chip.classList.toggle(
          'active',
          chip.dataset.sport === 'all'
        )
      );
  }

  syncSportFilters();

  const scopeGames =
    games.filter(game =>
      (
        isSoccer
          ? game.sport === 'Soccer'
          : publicSport(game.sport) &&
            state.visibleSports.has(
              game.sport
            ) &&
            (
              state.showFCS ||
              game.division !== 'FCS'
            )
      ) &&
      (
        state.sport === 'all' ||
        game.sport === state.sport
      ) &&
      matchesSportFilters(game)
    );

  const visible =
    scopeGames.filter(game =>
      state.gameState === 'watching'
        ? isWatched(game)
        : visibleInState(
            game,
            state.gameState
          )
    );

  visible.sort(
    state.gameState === 'all'
      ? compareAllGames
      : ['upcoming','completed'].includes(
          state.gameState
        )
        ? (a,b) =>
            compareDatedGames(
              a,
              b,
              state.gameState
            )
        : compareGames
  );

  const gameList = $('#game-list');
  // Only the first empty load needs placeholders. A refresh keeps the existing
  // slate, with no extra provider request or polling changes.
  const initialLoading = state.source === 'loading' && !games.length;
  gameList.setAttribute('aria-busy',String(initialLoading));
  if (initialLoading) {
    if (!gameList.querySelector('.slate-skeleton')) gameList.innerHTML = Array.from({length:6},() => '<div class="slate-skeleton" aria-hidden="true"><i></i><span></span><span></span><b></b><small></small></div>').join('');
  } else {
    // Explicit filter/favorite changes retain the established sort. During a
    // refresh, unchanged membership and game states retain their visible order.
    const viewKey = JSON.stringify([localDayStamp(new Date()),state.page,state.sport,state.gameState,state.showFCS,state.sportFilters,[...state.visibleSports],state.favoriteTeams,[...state.watchedGames],visible.map(game => [watchKey(game),game.state,localDayStamp(game.startTime)]).sort()]);
    const currentCards = [...gameList.querySelectorAll(':scope > .game-card')];
    if (gameList.dataset.viewKey === viewKey) {
      const positions = new Map(currentCards.map((card,index) => [`${card.dataset.sport}:${card.dataset.id}`,index]));
      visible.sort((a,b) => (positions.get(watchKey(a)) ?? Infinity) - (positions.get(watchKey(b)) ?? Infinity));
    }
    gameList.dataset.viewKey = viewKey;
    const template = document.createElement('template');
    template.innerHTML = renderGameList(visible,state.gameState);
    const reusable = new Map(currentCards.map(card => [`${card.dataset.sport}:${card.dataset.id}`,card]));
    const nextChildren = [...template.content.children].map(node => {
      if (!node.classList.contains('game-card')) return node;
      const card = reusable.get(`${node.dataset.sport}:${node.dataset.id}`);
      const markup = node.outerHTML;
      if (!card) { node._slateMarkup = markup; return node; }
      if (card._slateMarkup !== markup) {
        const focused = card.contains(document.activeElement) ? document.activeElement : null;
        const focusSelector = focused?.hasAttribute('data-card-team-index') ? `[data-card-team-index="${focused.dataset.cardTeamIndex}"]` : focused?.hasAttribute('data-open-game') ? '[data-open-game]' : null;
        card.className = node.className;
        card.dataset.division = node.dataset.division;
        card.innerHTML = node.innerHTML;
        card._slateMarkup = markup;
        if (focusSelector) card.querySelector(focusSelector)?.focus({preventScroll:true});
      }
      return card;
    });
    // Moving existing nodes preserves the identity of unchanged cards and logos.
    for (let index = 0; index < nextChildren.length; index++) {
      if (gameList.children[index] !== nextChildren[index]) gameList.insertBefore(nextChildren[index],gameList.children[index] || null);
    }
    while (gameList.children.length > nextChildren.length) gameList.lastElementChild.remove();
  }
  if (typeof recentLiveChanges !== 'undefined' && recentLiveChanges.size) {
    for (const card of $$('#game-list .game-card')) {
      const change = recentLiveChanges.get(`${card.dataset.sport}:${card.dataset.id}`);
      if (change?.scoreChanged) card.classList.add('score-just-changed');
      if (change?.ratingChanged) {
        card.style.setProperty('--previous-score-hue',scoreHueFor(change.previousScore));
        card.classList.add('rating-just-changed');
      }
    }
    recentLiveChanges.clear();
  }


  $('#empty-state').classList.toggle(
    'hidden',
    visible.length !== 0
  );

  $('#empty-state h3').textContent =
    state.source === 'loading' ? 'Loading live scores…' :
    state.source === 'unavailable' ? 'Live scores unavailable' :
    cfbFiltersActive() ? 'No games match these filters' : 'No games in this view';

  $('#empty-clear-filters').classList.toggle('hidden',!cfbFiltersActive());
  const hasUpcoming = scopeGames.some(game => game.state === 'upcoming');
  const suggestUpcoming = state.source === 'live' && state.gameState === 'live' && visible.length === 0 && hasUpcoming && !cfbFiltersActive();
  $('#empty-upcoming').classList.toggle('hidden',!suggestUpcoming);

  $('#empty-message').textContent =
    state.source === 'loading'
      ? 'Connecting to the live feed.'
      : state.source === 'unavailable'
        ? 'The feed could not be reached. Use Refresh to retry.'
        : cfbFiltersActive()
          ? 'Try another conference, turn off Top 25 Only, or clear CFB filters. You can also change the game-state tab.'
        : state.gameState === 'watching'
          ? 'Open a game and tap “Add to watchlist.” Saved games appear here while they are in the current scoreboard feed.'
          : state.sport === 'Tennis'
            ? 'Tennis covers Australian Open, Roland-Garros, Wimbledon and US Open main draws only. No Grand Slam matches are available in this view.'
            : suggestUpcoming ? 'No games are live right now. See what starts next.' : 'Try a different sport or game state.';

  $('#live-count').textContent =
    `${scopeGames.filter(game => game.state === 'live').length} LIVE`;

  $('#all-count').textContent =
    scopeGames.filter(
      game =>
        visibleInState(
          game,
          'all'
        )
    ).length;

  $$('.seg[data-state="live"] span')
    .forEach(node => {
      node.textContent =
        scopeGames.filter(
          game =>
            game.state === 'live'
        ).length;
    });

  $$('.seg[data-state="upcoming"] span')
    .forEach(node => {
      node.textContent =
        scopeGames.filter(
          game =>
            game.state === 'upcoming'
        ).length;
    });

  $$('.seg[data-state="completed"] span')
    .forEach(node => {
      node.textContent =
        scopeGames.filter(
          game =>
            game.state === 'completed'
        ).length;
    });

  $('.seg[data-state="all"]')?.setAttribute('aria-label',`All ${$('#all-count').textContent} games: live games, upcoming games, and today's finals. Older finals remain in Final.`);
  $('.seg[data-state="all"]')?.setAttribute('title',"Live games, upcoming games, and today's finals. Final also includes older completed games.");
  $('.seg[data-state="completed"]')?.setAttribute('title','All retained completed games, including older finals excluded from All.');

  $('#watch-count').textContent =
    scopeGames.filter(
      isWatched
    ).length;

  if ($('#search-dialog')?.open) {
    renderGlobalSearch();
  }
}

$$('.nav-link').forEach(
  link =>
    link.addEventListener(
      'click',
      event => {
        // Info uses the existing hash router without resetting Slate filters.
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
            link.dataset.page === 'info' || state.page === 'info') return;
        state.page =
          link.dataset.page;

        state.teamRoute =
          null;

        state.sport =
          'all';

        location.hash =
          state.page === 'soccer'
            ? 'soccer'
            : 'home';

        $$('.sport-chip[data-sport]')
          .forEach(chip =>
            chip.classList.toggle(
              'active',
              chip.dataset.sport === 'all'
            )
          );

        render();
      }
    )
);

function handleLocationChange() {
    const returning = pendingTeamReturn || (state.page === 'team' && teamReturnStack.at(-1)?.hash === location.hash
      ? teamReturnStack.pop() : null);
    pendingTeamReturn = null;
    const linked=gameRouteFromHash();
    if(linked) {
      if(returning){state.page=returning.page || 'home';state.teamRoute=returning.teamRoute || null;}
      else if(state.page==='team' || state.page==='info'){state.page=linked.sport==='Soccer'?'soccer':'home';state.teamRoute=null;}
      render();
      if(returning?.detail)restoreTeamReturn(returning);
      else if(!activeDetailGame || activeDetailGame.sport!==linked.sport || String(activeDetailGame.id)!==linked.id)openGameDetails(linked.id,linked.sport);
      else {showGameDetails();refreshActiveDetail();}
      return;
    }
    if(activeDetailGame || linkedGameRequest)hideGameDetails({keepRoute:true});
    const route =
      teamRouteFromHash(
        location.hash
      );

    state.teamRoute =
      route;

    state.page =
      route
        ? 'team'
        : location.hash === '#info'
          ? 'info'
        : location.hash === '#soccer' && publicSport('Soccer')
          ? 'soccer'
          : 'home';

    render();
    if (state.page === 'info') $('#info-title').focus({preventScroll:true});

    if (route) {
      const routeKey =
        teamDataKey(route);

      if (
        activeTeamPageKey !==
        routeKey
      ) {
        activeTeamPageKey =
          routeKey;

        teamPageTab =
          'overview';
      }

      loadTeamPageData(route);

      if (['NFL','NHL'].includes(route.sport)) {
        loadTeamStandings(route);
      }

      loadFavoriteCatalog()
        .finally(() => {
          if (
            state.page === 'team' &&
            state.teamRoute?.sport === route.sport &&
            String(state.teamRoute?.id) === String(route.id)
          ) {
            render();
          }
        });
    } else {
      activeTeamPageKey = '';
      teamPageTab = 'overview';
    }
    restoreTeamReturn(returning);
}
window.addEventListener('hashchange',handleLocationChange);

$$('.sport-chip[data-sport]')
  .forEach(chip =>
    chip.addEventListener(
      'click',
      () => {
        state.sport =
          chip.dataset.sport;

        $$('.sport-chip[data-sport]')
          .forEach(item =>
            item.classList.toggle(
              'active',
              item === chip
            )
          );

        render();
      }
    )
  );

$('#fcs-toggle')
  .addEventListener(
    'click',
    () => {
      state.showFCS =
        !state.showFCS;

      const clearedFcsConference=!state.showFCS && selectedCfbConference()?.division==='FCS';
      if (clearedFcsConference) state.sportFilters.CFB.conference='';

      persistPreferences();
      syncFCSFilter();
      render();
      if (clearedFcsConference) $('#cfb-filter-status').textContent='Conference cleared because FCS is off.';
    }
  );

$('#cfb-conference').addEventListener('change',event=>{
  state.sportFilters.CFB.conference=normalizeCfbFilters({conference:event.target.value}).conference;
  if (selectedCfbConference()?.division==='FCS') {state.showFCS=true;syncFCSFilter();}
  persistPreferences();render();
});
$('#cfb-top25').addEventListener('click',()=>{
  state.sportFilters.CFB.top25=!state.sportFilters.CFB.top25;
  persistPreferences();render();
});
$('#cfb-clear').addEventListener('click',clearCfbFilters);
$('#empty-clear-filters').addEventListener('click',clearCfbFilters);
$('#empty-upcoming').addEventListener('click',()=>$('.seg[data-state="upcoming"]').click());
function retryCfbMetadata() {
  if (state.page!=='home' || state.sport!=='CFB') return;
  for (const [season,entry] of cfbMetadata) {entry.retryAt=0;entry.expires=0;void loadCfbMetadata(season);}
}
$('#refresh-button').addEventListener('click',retryCfbMetadata);
$('#refresh-data').addEventListener('click',retryCfbMetadata);

$$('.seg').forEach(tab =>
  tab.addEventListener(
    'click',
    () => {
      state.gameState =
        tab.dataset.state;

      $$('.seg').forEach(item =>
        item.classList.toggle(
          'active',
          item === tab
        )
      );

      render();
    }
  )
);

$('#refresh-button')
  .addEventListener(
    'click',
    loadLiveGames
  );

$('#refresh-data')
  .addEventListener(
    'click',
    loadLiveGames
  );

function wireDialog(id,opener) {
  const dialog = $(id);

  const trigger =
    opener
      ? $(opener)
      : null;

  if (!dialog) return;

  if (trigger) {
    trigger.addEventListener(
      'click',
      () =>
        showDialog(dialog)
    );
  }

  dialog
    .querySelectorAll('.close-dialog')
    .forEach(button =>
      button.addEventListener(
        'click',
        () =>
          hideDialog(dialog)
      )
    );
}

wireDialog(
  '#search-dialog',
  '#search-button'
);

$('#search-button')
  .addEventListener(
    'click',
    () => {
      renderGlobalSearch();

      loadFavoriteCatalog()
        .finally(() => {
          if ($('#search-dialog')?.open) {
            renderGlobalSearch();
          }
        });

      requestAnimationFrame(() =>
        $('#search-query')?.focus()
      );
    }
  );

$('#search-query')
  .addEventListener(
    'input',
    renderGlobalSearch
  );

$('#search-clear')
  .addEventListener(
    'click',
    () => {
      $('#search-query').value = '';
      renderGlobalSearch();
      $('#search-query').focus();
    }
  );

$('#search-results')
  .addEventListener(
    'click',
    event => {
      const gameButton =
        event.target.closest('[data-search-game]');

      if (gameButton) {
        const sport = gameButton.dataset.searchGame;
        const id = gameButton.dataset.searchGameId;

        hideDialog($('#search-dialog'));
        openGameDetails(id,sport);
        return;
      }

      const teamButton =
        event.target.closest('[data-search-team]');

      if (!teamButton) return;

      const team =
        visibleGlobalSearchTeams[
          Number(teamButton.dataset.searchTeam)
        ];

      if (!team) return;

      hideDialog(
        $('#search-dialog')
      );

      openTeamPage(team);
      return;

      const matching =
        globalSearchTeamGames(team)
          .sort(compareGames);

      if (matching.length === 1) {
        hideDialog($('#search-dialog'));
        openGameDetails(
          matching[0].id,
          matching[0].sport
        );
        return;
      }

      $('#search-query').value =
        team.name;

      renderGlobalSearch();

      $('#search-meta').textContent =
        matching.length
          ? `${matching.length} current-feed games for ${team.name}`
          : `No current-feed game for ${team.name}. Team pages can use this same search result later.`;

      $('#search-query').focus();
    }
  );

$('#team-page')
  .addEventListener(
    'click',
    event => {
      if (
        event.target.closest(
          '[data-team-back]'
        )
      ) {
        returnFromTeamPage();
        return;
      }

      const opponentButton = event.target.closest('[data-opponent-id]');
      if (opponentButton) {
        openTeamPage({sport:state.teamRoute?.sport,id:opponentButton.dataset.opponentId,
          name:opponentButton.dataset.opponentName || '',abbreviation:opponentButton.dataset.opponentAbbreviation || '',
          logo:opponentButton.dataset.opponentLogo || ''});
        return;
      }

      const tabButton =
        event.target.closest(
          '[data-team-tab]'
        );

      if (tabButton) {
        const requestedTab =
          tabButton.dataset.teamTab;

        teamPageTab =
          ['overview','standings','schedule'].includes(requestedTab)
            ? requestedTab
            : 'overview';

        if (teamPageTab === 'standings') {
          const team = teamPageTeam();
          if (team) loadTeamStandings(team);
        }

        renderTeamPage();
        return;
      }

      const standingTeamButton =
        event.target.closest('[data-standing-team]');

      if (standingTeamButton) {
        openTeamPage({
          sport:state.teamRoute?.sport,
          id:String(standingTeamButton.dataset.standingTeam || ''),
          name:standingTeamButton.dataset.standingName || '',
          abbreviation:standingTeamButton.dataset.standingAbbreviation || '',
          logo:standingTeamButton.dataset.standingLogo || ''
        });
        return;
      }

      const gameButton =
        event.target.closest(
          '[data-team-game]'
        );

      if (gameButton) {
        openGameDetails(
          gameButton.dataset.teamGame,
          gameButton.dataset.teamSport ||
          state.teamRoute?.sport ||
          null
        );

        return;
      }

      const favoriteButton =
        event.target.closest(
          '[data-team-favorite]'
        );

      if (!favoriteButton) return;

      const team =
        teamPageTeam();

      if (!team) return;

      const index =
        state.favoriteTeams
          .findIndex(item =>
            sameFavorite(item,team)
          );

      if (index >= 0) {
        state.favoriteTeams.splice(
          index,
          1
        );

        syncFavoriteGames();
        persistFavoriteSelections();
        renderFavoriteTags();
        renderFavoriteResults();
        render();
      } else {
        addFavoriteTeam(team);
      }
    }
  );


wireDialog(
  '#preferences-dialog',
  '#profile-button'
);

wireDialog(
  '#data-dialog',
  '#data-info'
);

wireDialog(
  '#score-guide-dialog',
  '#score-guide-button'
);

let lastTouchOpen = 0;
let touchStart = null;

$('#game-list')
  .addEventListener(
    'pointerdown',
    event => {
      if (event.target.closest('.broadcast-watch-link')) {
        touchStart = null;
        return;
      }
      if (
        event.pointerType === 'touch'
      ) {
        touchStart = {
          x:event.clientX,
          y:event.clientY,
          id:
            event.target
              .closest('.game-card')
              ?.dataset.id
        };
      }
    }
  );

$('#game-list')
  .addEventListener(
    'pointerup',
    event => {
      if (
        event.pointerType !== 'touch' ||
        !touchStart
      ) {
        return;
      }

      const moved =
        Math.hypot(
          event.clientX -
          touchStart.x,
          event.clientY -
          touchStart.y
        );

      const id =
        event.target
          .closest('.game-card')
          ?.dataset.id;

      if (
        event.target.closest('.card-team-link') || event.target.closest('.broadcast-watch-link')
      ) {
        touchStart = null;
        return;
      }

      if (
        id &&
        id === touchStart.id &&
        moved < 12
      ) {
        lastTouchOpen =
          Date.now();

        openGameDetails(id,event.target.closest('.game-card')?.dataset.sport);
      }

      touchStart = null;
    }
  );

$('#game-list')
  .addEventListener(
    'pointercancel',
    () => {
      touchStart = null;
    }
  );

$('#game-list')
  .addEventListener(
    'click',
    event => {
      if (event.target.closest('.broadcast-watch-link')) return;
      const teamButton = event.target.closest('.card-team-link');
      if (teamButton) {
        const card = teamButton.closest('.game-card');
        const game = games.find(item => String(item.id) === card?.dataset.id && item.sport === card?.dataset.sport);
        const team = game?.teams?.[Number(teamButton.dataset.cardTeamIndex)];
        if (team?.[8]) openTeamPage({sport:game.sport,id:String(team[8]),name:team[0],abbreviation:team[1],logo:team[4] || ''});
        return;
      }
      if (
        Date.now() -
        lastTouchOpen <
        600
      ) {
        return;
      }

      const card =
        event.target
          .closest('.game-card');

      if (card) {
        openGameDetails(
          card.dataset.id,card.dataset.sport
        );
      }
    }
  );

$('#game-detail-overlay')
  .addEventListener(
    'click',
    event => {
      if (
        event.target === event.currentTarget ||
        event.target.closest('.close-dialog')
      ) {
        hideGameDetails();
      }
    }
  );

$('#game-detail-content')
  .addEventListener(
    'pointerover',
    event => {
      const point =
        event.target.closest('.timeline-point');

      if (
        point &&
        event.pointerType !== 'touch'
      ) {
        const help =
          point.closest('.timeline-section')
            ?.querySelector('.timeline-point-help');

        if (help) {
          help.textContent =
            point.dataset.timelineExplanation || '';
          help.classList.add('is-visible');
          help.setAttribute('aria-hidden','false');
          point.classList.add('is-open');
          point.setAttribute('aria-expanded','true');
        }
      }
    }
  );

$('#game-detail-content')
  .addEventListener(
    'pointerout',
    event => {
      const point =
        event.target.closest('.timeline-point');

      if (
        !point ||
        event.pointerType === 'touch' ||
        point.contains(event.relatedTarget)
      ) {
        return;
      }

      const section =
        point.closest('.timeline-section');

      const help =
        section?.querySelector('.timeline-point-help');

      const nextPoint =
        event.relatedTarget?.closest?.('.timeline-point');

      const movingToTimelinePoint =
        nextPoint &&
        nextPoint !== point &&
        nextPoint.closest('.timeline-section') === section;

      point.classList.remove('is-open');
      point.setAttribute('aria-expanded','false');

      if (help && !movingToTimelinePoint) {
        help.classList.remove('is-visible');
        help.setAttribute('aria-hidden','true');
        help.textContent = '';
      }
    }
  );

function toggleTimelinePoint(point) {
  const section =
    point.closest('.timeline-section');

  const help =
    section?.querySelector('.timeline-point-help');

  if (!help) {
    return;
  }

  const open =
    !point.classList.contains('is-open');

  section
    .querySelectorAll('.timeline-point.is-open')
    .forEach(item => {
      item.classList.remove('is-open');
      item.setAttribute('aria-expanded','false');
    });

  point.classList.toggle('is-open',open);
  point.setAttribute('aria-expanded',String(open));
  help.classList.toggle('is-visible',open);
  help.setAttribute('aria-hidden',String(!open));
  help.textContent =
    open
      ? point.dataset.timelineExplanation || ''
      : '';
}

$('#game-detail-content')
  .addEventListener(
    'click',
    event => {
      const range=event.target.closest('[data-timeline-range]');
      if(range){
        const section=range.closest('.timeline-section');
        section.querySelectorAll('[data-timeline-range]').forEach(button=>button.setAttribute('aria-pressed',String(button===range)));
        section.querySelectorAll('[data-timeline-view]').forEach(view=>view.hidden=view.dataset.timelineView!==range.dataset.timelineRange);
        const help=section.querySelector('.timeline-point-help');
        if(help){help.textContent='';help.setAttribute('aria-hidden','true');}
        return;
      }
      const retry=event.target.closest('[data-game-retry]');
      if(retry){openLinkedGame(retry.dataset.gameRetry,retry.dataset.gameRetrySport);return;}
      const playerTeam = event.target.closest('[data-player-team]');
      if (playerTeam) {
        activePlayerTeam = playerTeam.dataset.playerTeam;
        renderActiveDetail();
        return;
      }
      const detailTeamButton =
        event.target.closest('[data-detail-team-id]');

      if (detailTeamButton && activeDetailGame) {
        const id = String(detailTeamButton.dataset.detailTeamId || '');
        const teamTuple = activeDetailGame.teams?.find(team =>
          String(team?.[8] || '') === id
        );

        if (id && teamTuple) {
          const sport = detailTeamButton.dataset.detailTeamSport || activeDetailGame.sport;
          const team = {
            sport,
            id,
            name:teamTuple[0] || '',
            abbreviation:teamTuple[1] || '',
            logo:teamTuple[4] || ''
          };
          openTeamPage(team);
          return;
        }
      }

      const whyToggle =
        event.target.closest('.detail-why-toggle');

      if (whyToggle) {
        const why =
          whyToggle
            .closest('.detail-radar-why')
            ?.querySelector('.detail-why-text');

        if (why) {
          const expanded =
            why.classList.toggle('expanded');

          whyToggle.textContent =
            expanded
              ? 'Less'
              : 'More';

          whyToggle.setAttribute(
            'aria-expanded',
            String(expanded)
          );
        }

        return;
      }

      const tabButton =
        event.target.closest('.detail-tab');

      if (tabButton) {
        setActiveDetailTab(tabButton);
        return;
      }

      const point =
        event.target.closest('.timeline-point');

      if (point) {
        toggleTimelinePoint(point);
        return;
      }

      const button =
        event.target
          .closest('.detail-watch');

      if (
        !button ||
        !activeDetailGame
      ) {
        return;
      }

      const watching =
        toggleWatchedGame(
          activeDetailGame
        );

      button.classList.toggle(
        'active',
        watching
      );

      button.setAttribute(
        'aria-pressed',
        String(watching)
      );

      button.textContent =
        watching
          ? '★ Watching this game'
          : '☆ Add to watchlist';
    }
  );

$('#game-detail-content').addEventListener('change',event => {
  if (event.target.matches('[data-player-category]')) {
    activePlayerCategory = event.target.value;
    renderActiveDetail();
    $('#game-detail-content [data-player-category]')?.focus();
  }
});

$('#game-detail-content')
  .addEventListener(
    'keydown',
    event => {
      const tabButton =
        event.target.closest('.detail-tab');

      if (
        tabButton &&
        moveDetailTabFocus(event,tabButton)
      ) {
        return;
      }

      const point =
        event.target.closest('.timeline-point');

      if (
        !point ||
        !['Enter',' '].includes(event.key)
      ) {
        return;
      }

      event.preventDefault();
      toggleTimelinePoint(point);
    }
  );

document.addEventListener(
  'keydown',
  event => {
    if (
      event.key === 'Escape' &&
      !$('#game-detail-overlay').hidden
    ) {
      hideGameDetails();
    }
  }
);

syncSportToggles();
syncFCSFilter();

$('#profile-button')
  .addEventListener(
    'click',
    () => {
      syncSportToggles();
      renderFavoriteTags();
      renderFavoriteResults();
    }
  );

$('#favorite-sport')
  .addEventListener(
    'change',
    renderFavoriteResults
  );

$('#favorite-query')
  .addEventListener(
    'input',
    renderFavoriteResults
  );

$('#favorite-query')
  .addEventListener(
    'keydown',
    event => {
      if (
        event.key === 'Enter'
      ) {
        event.preventDefault();
        addTypedFavorite();
      }
    }
  );

$('#favorite-manual-add')
  .addEventListener(
    'click',
    addTypedFavorite
  );

$('#favorite-results')
  .addEventListener(
    'click',
    event => {
      const button =
        event.target.closest(
          '[data-add-favorite]'
        );

      if (button) {
        addFavoriteTeam(
          visibleFavoriteSuggestions[
            Number(
              button.dataset.addFavorite
            )
          ]
        );
      }
    }
  );

$('#favorite-tags')
  .addEventListener(
    'click',
    event => {
      const button =
        event.target.closest(
          '[data-remove-favorite]'
        );

      if (!button) return;

      state.favoriteTeams.splice(
        Number(
          button.dataset.removeFavorite
        ),
        1
      );

      syncFavoriteGames();
      persistFavoriteSelections();
      renderFavoriteTags();
      renderFavoriteResults();
      render();
    }
  );

$$('[data-visible-sport]')
  .forEach(input =>
    input.addEventListener(
      'change',
      () => {
        const sport =
          input.dataset.visibleSport;

        if (input.checked) {
          state.visibleSports.add(
            sport
          );
        } else {
          state.visibleSports.delete(
            sport
          );
        }

        persistPreferences();
        render();
      }
    )
  );

let deferredInstallPrompt;
const INSTALLED_KEY='sports-radar-installed-v1';
function installedPwa() {
  return Boolean(navigator.standalone || globalThis.matchMedia?.('(display-mode: standalone)').matches);
}
function updateInstallExperience() {
  let remembered=false;try{remembered=localStorage.getItem(INSTALLED_KEY)==='true';}catch{}
  const installed=installedPwa() || remembered;
  if($('#install-status'))$('#install-status').textContent=installed?'Already installed':'Choose your phone below, or use the installation button when your browser offers it.';
  $('#install-button')?.classList.toggle('hidden',installed || !deferredInstallPrompt);
  if($('#settings-install-button'))$('#settings-install-button').hidden=installed || !deferredInstallPrompt;
}
async function installSportsRadar() {
  if(!deferredInstallPrompt || installedPwa())return;
  const prompt=deferredInstallPrompt;deferredInstallPrompt=null;updateInstallExperience();
  await prompt.prompt();await prompt.userChoice;
}
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();if(installedPwa())return;
  // A fresh native offer also handles an app removed since its last install.
  try{localStorage.removeItem(INSTALLED_KEY);}catch{}
  deferredInstallPrompt=event;updateInstallExperience();
});
$('#install-button')?.addEventListener('click',installSportsRadar);
$('#settings-install-button')?.addEventListener('click',installSportsRadar);
window.addEventListener('appinstalled',()=>{
  deferredInstallPrompt=null;try{localStorage.setItem(INSTALLED_KEY,'true');}catch{}
  updateInstallExperience();
});
globalThis.matchMedia?.('(display-mode: standalone)').addEventListener?.('change',updateInstallExperience);
updateInstallExperience();

if (
  'serviceWorker' in navigator
) {
  navigator.serviceWorker
    .register(
      './sw.js?rev=20261030-cfb1'
    )
    .then(
      registration =>
        registration.update()
    )
    .catch(() => {});
}

renderFavoriteTags();
renderFavoriteResults();

if (state.page === 'team') {
  activeTeamPageKey =
    teamDataKey(
      state.teamRoute
    );

  loadTeamPageData(
    state.teamRoute
  );

  if (['NFL','NHL'].includes(state.teamRoute?.sport)) {
    loadTeamStandings(state.teamRoute);
  }

  loadFavoriteCatalog()
    .finally(() => {
      if (state.page === 'team') {
        render();
      }
    });
}

render();
loadLiveGames();
const initialGameRoute=gameRouteFromHash();
if(initialGameRoute)openGameDetails(initialGameRoute.id,initialGameRoute.sport);
document.addEventListener('visibilitychange',() => {
  detailVisibilityChanged();
  if (document.hidden) scheduleLiveRefresh();
  else loadLiveGames();
});

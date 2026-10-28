const LEGACY_DEFAULT_FAVORITES = [{sport:'NFL',name:'Baltimore Ravens'},{sport:'MLB',name:'Baltimore Orioles'},{sport:'NHL',name:'Washington Capitals'}];
const FAVORITE_SPORTS = ['NFL','MLB','NHL','CFB','NBA','NCAAB','Soccer'];
const HOME_SPORTS = ['NFL','MLB','NHL','CFB','NBA','NCAAB','Tennis'];
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

const state = {
  page:location.hash === '#soccer' ? 'soccer' : 'home',
  sport:'all',
  gameState:'all',
  showFCS:savedPreferences.showFCS !== false,
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

function syncSportToggles() {
  $$('[data-visible-sport]').forEach(input => {
    input.checked = state.visibleSports.has(input.dataset.visibleSport);
  });
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

function summaryUrlFor(sport,eventId) {
  return `${String(globalThis.SPORTS_RADAR_ALERTS_URL || '').replace(/\/$/,'')}/game/${encodeURIComponent(sport)}/${encodeURIComponent(eventId)}`;
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

function compareGames(a,b) {
  return Number(pinnedFavorite(b)) -
    Number(pinnedFavorite(a)) ||
    b.score -
    a.score;
}

function visibleInState(game, selectedState) {
  return selectedState === 'all'
    ? game.state !== 'completed' || sameLocalDay(game.startTime)
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
    return dayDifference;
  }

  return b.score - a.score;
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
  const line = game.line || lineSnapshots[game.id]?.line;

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




















function liveRefreshDelay(hasLiveGames,isHidden) {
  return hasLiveGames && !isHidden ? 15000 : 60000;
}

let liveRefreshTimer = null;
let liveRefreshInFlight = false;
let feedHasLiveGames = false;

function scheduleLiveRefresh() {
  clearTimeout(liveRefreshTimer);
  liveRefreshTimer = setTimeout(loadLiveGames,liveRefreshDelay(feedHasLiveGames,document.hidden));
}

function canonicalFeedGames(items) {
  return items.map(game => ({...game,scoreboard:undefined,favorite:favoriteFor(game.teams,game.sport)}));
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
    if (state.updatedAt && Date.parse(feed.updatedAt) < Date.parse(state.updatedAt)) return;
    games = canonicalFeedGames(feed.games);
    feedHasLiveGames = games.some(game => game.state === 'live');
    state.source = 'live';
    state.updatedAt = feed.updatedAt;
    state.feedStale = feed.freshness?.stale === true;
    state.feedDegraded = feed.freshness?.degraded === true;
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
  if (state.source !== 'live') {
    $('#data-status-label').textContent = state.source === 'loading'
      ? 'Connecting to live scoreboards…'
      : 'Live scores unavailable. Retry to reconnect.';
    $('#footer-status').textContent = state.source === 'loading' ? 'Loading feed' : 'Feed unavailable';
    return;
  }
  const stale = state.feedStale || Date.now() - Date.parse(state.updatedAt) > 120000;
  $('#data-status-label').textContent =
    `${stale ? 'Stale scores' : 'Live scores'}${!stale && state.feedDegraded ? ' · some details unavailable' : ''} · updated ${new Date(state.updatedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`;
  $('#footer-status').textContent = stale ? 'Stale feed' : 'Live feed';
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
    state.favoriteTeams.length
      ? state.favoriteTeams.map(
          (team,index) =>
            `<span class="favorite-tag">${
              team.logo
                ? `<img src="${safeText(team.logo)}" alt="" loading="lazy" onerror="this.style.display='none'">`
                : `<span aria-hidden="true">${safeText(iconFor(team.sport))}</span>`
            }<span class="favorite-tag-name">${safeText(team.name)}</span><button type="button" data-remove-favorite="${index}" aria-label="Remove ${safeText(team.name)} from favorites">×</button></span>`
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
          team.logo
            ? `<img src="${safeText(team.logo)}" alt="" loading="lazy" onerror="this.style.display='none'">`
            : `<span aria-hidden="true">${safeText(iconFor(sport))}</span>`
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

function teamMarkup(game, team) {
  const logo =
    team[4] ||
    teamLogoUrl(
      game.sport,
      team[1]
    );

  return `<span class="team-name"><img class="team-logo" src="${safeText(logo)}" alt="" loading="lazy" onerror="this.style.display='none'">${
    team[6]
      ? `<b class="team-rank">#${safeText(team[6])}</b>`
      : ''
  }<span class="team-name-text"><span class="full-team-name">${safeText(team[0])}</span><span class="short-team-name">${safeText(team[7] || team[0])}</span></span>${
    team[5]
      ? `<small class="team-record">${safeText(team[5])}</small>`
      : ''
  }</span>`;
}

function explainRating(game) {
  if (!game.factors?.length) {
    return game.context ||
      'The live feed has not supplied a detailed rating explanation.';
  }

  const labels =
    new Set(
      game.factors.map(
        item => item.label
      )
    );

  if (game.state === 'upcoming') {
    if (labels.has('World Series')) {
      return `Game 1 of the World Series brings championship stakes, so this starts at ${game.score} before the first pitch.`;
    }

    if (labels.has('Championship')) {
      return `This is a championship matchup, so the stakes put it at ${game.score} before play begins.`;
    }

    if (labels.has('Final round')) {
      return `A place in the final round is at stake, which puts this matchup at ${game.score} before play.`;
    }

    if (labels.has('Postseason')) {
      return `It's a postseason game, so its stakes put it at ${game.score} before play begins.`;
    }

    if (labels.has('Major tournament')) {
      return `This match is part of a tennis major, so it starts at ${game.score} before play.`;
    }

    if (game.sport === 'NFL') {
      const division =
        [...labels]
          .find(label =>
            /^(AFC|NFC) (East|North|South|West) matchup$/
              .test(label)
          )
          ?.replace(
            ' matchup',
            ''
          );

      const signals = [];

      if (
        labels.has('Both winning records')
      ) {
        signals.push(
          `both have winning records (${game.teams[0][5]} and ${game.teams[1][5]})`
        );
      }

      if (
        labels.has('Evenly matched winning records')
      ) {
        signals.push(
          'their records are closely matched'
        );
      }

      if (
        labels.has('Both teams below .500')
      ) {
        signals.push(
          `both teams are below .500 (${game.teams[0][5]} and ${game.teams[1][5]}), which tempers the anticipation`
        );
      } else if (
        labels.has('Both teams at least .500')
      ) {
        signals.push(
          `both teams are at least .500 (${game.teams[0][5]} and ${game.teams[1][5]})`
        );
      }

      if (
        labels.has('Unbeaten team')
      ) {
        signals.push(
          'one team is unbeaten'
        );
      }

      if (
        labels.has('Winless team')
      ) {
        signals.push(
          'one team is still winless, which lowers the expectation'
        );
      }

      if (division) {
        signals.push(
          `${game.teams[0][0]} and ${game.teams[1][0]} are ${division} rivals, but that is only a small boost`
        );
      }

      if (
        labels.has('Tight projected spread') ||
        labels.has('Competitive projected spread')
      ) {
        signals.push(
          `the listed spread (${game.line?.spread || 'close'}) suggests a competitive game`
        );
      }

      const possibleQuarterbackDuel =
        Number(
          new Date(game.startTime)
            .getFullYear()
        ) === 2026 &&
        game.teams
          .map(team => team[1])
          .sort()
          .join('-') === 'BAL-CIN'
          ? ' It could also be Lamar Jackson vs. Joe Burrow if both start.'
          : '';

      return signals.length
        ? `${signals.join('; ').replace(/^[a-z]/,character => character.toUpperCase())}. That puts this at ${game.score} before kickoff.${possibleQuarterbackDuel}`
        : `No special matchup stakes or close-line signal are listed yet, so this starts at ${game.score} before kickoff.${possibleQuarterbackDuel}`;
    }

    if (
      ['CFB','NCAAB'].includes(game.sport)
    ) {
      const ranked =
        game.teams.filter(
          team => team[6]
        );

      if (ranked.length === 2) {
        return `Both teams are ranked (${ranked.map(team => `No. ${team[6]}`).join(' and ')}). ${
          labels.has('Unbeaten team')
            ? 'One is unbeaten, adding to the anticipation. '
            : ''
        }This strong matchup starts at ${game.score} before play; no game action is counted yet.`;
      }

      if (ranked.length === 1) {
        return `With No. ${ranked[0][6]} ${ranked[0][0]} in the matchup, this regular-season game starts at ${game.score} before play.`;
      }

      if (
        labels.has('Rivalry')
      ) {
        return `A listed rivalry adds to the anticipation, putting this matchup at ${game.score} before play.`;
      }

      return `Neither team is ranked and no additional rivalry or postseason stakes are listed, so this matchup starts at ${game.score} before play.`;
    }

    if (
      ['NHL','NBA','MLB'].includes(game.sport)
    ) {
      const signals = [];

      if (
        labels.has('Both winning records')
      ) {
        signals.push(
          `both teams have winning records (${game.teams[0][5]} and ${game.teams[1][5]})`
        );
      } else if (
        labels.has('Both teams at least .500')
      ) {
        signals.push(
          `both teams are at least .500 (${game.teams[0][5]} and ${game.teams[1][5]})`
        );
      } else if (
        labels.has('Both teams below .500')
      ) {
        signals.push(
          `both teams are below .500 (${game.teams[0][5]} and ${game.teams[1][5]}), which lowers the expectation`
        );
      }

      if (
        labels.has('Evenly matched winning records')
      ) {
        signals.push(
          'their records are closely matched'
        );
      }

      const division =
        [...labels]
          .find(label =>
            /Division matchup$|^(AL|NL) (East|Central|West) matchup$/
              .test(label)
          );

      if (division) {
        signals.push(
          `this is a ${division.replace(' matchup','')} matchup`
        );
      }

      if (
        labels.has('Near pick’em market')
      ) {
        signals.push(
          'the betting market has the teams very evenly matched'
        );
      } else if (
        labels.has('Competitive betting market') ||
        labels.has('Competitive projected spread') ||
        labels.has('Very close projected spread')
      ) {
        signals.push(
          'the betting market projects a competitive game'
        );
      }

      if (
        labels.has('Rivalry') ||
        labels.has('Rivalry context')
      ) {
        signals.push(
          'there is additional rivalry context'
        );
      }

      const qualitative =
        game.factors.filter(
          factor =>
            factor.contextType &&
            factor.contextText
        );

      qualitative.forEach(
        factor => {
          if (
            !signals.includes(
              factor.contextText
            )
          ) {
            signals.push(
              factor.contextText
            );
          }
        }
      );

      return signals.length
        ? `${signals.join('; ').replace(/^[a-z]/,character => character.toUpperCase())}. Those factors put this matchup at ${game.score} before play.`
        : `This is a standard regular-season ${game.sport} matchup with no additional matchup or player context identified yet. It starts at ${game.score} before play.`;
    }

    if (
      labels.has('Rivalry')
    ) {
      return `A listed rivalry adds to the anticipation, putting this matchup at ${game.score} before play.`;
    }

    return `No additional special stakes or matchup context are listed yet, so this starts at ${game.score} before play.`;
  }

  const why =
    String(game.why || '')
      .replaceAll(
        ' · ',
        ', '
      )
      .replace(
        /^[a-z]/,
        character =>
          character.toUpperCase()
      );

  if (
    game.state === 'completed'
  ) {
    const ending =
      labels.has('Wide margin')
        ? 'The wider margin keeps the rating down.'
        : labels.has('Overtime')
          ? 'Overtime adds to the rating.'
          : 'The close finish raises the rating.';

    return `${why}. ${
      game.momentumText
        ? `${game.momentumText}. `
        : ''
    }${
      game.upsetText
        ? `${game.upsetText}. `
        : ''
    }${ending}`;
  }

  const phase =
    game.live?.phase &&
    game.live.phase !== 'Live'
      ? `At ${game.live.phase}, `
      : '';

  const situation =
    game.live?.note
      ? `${phase}${game.live.note}. `
      : phase
        ? `${phase.replace(/, $/,'. ')} `
        : '';

  const specifics =
    game.live?.reasons?.length
      ? `${game.live.reasons.join('; ')}. `
      : '';

  const action =
    labels.has('Wide margin')
      ? 'The wider margin keeps the rating down.'
      : '';

  return `${why}. ${situation}${
    game.momentumText
      ? `${game.momentumText}. `
      : ''
  }${
    game.upsetText
      ? `${game.upsetText}. `
      : ''
  }${specifics}${action}`.trim();
}

function trendFor(game) {
  if (
    game.state === 'upcoming' ||
    !Number.isFinite(
      game.openingScore
    )
  ) {
    return '';
  }

  const delta =
    game.score -
    game.openingScore;

  const arrow =
    delta > 2
      ? '↗'
      : delta < -2
        ? '↘'
        : '→';

  return `<small class="score-trend" aria-label="${
    delta >= 0
      ? 'Up'
      : 'Down'
  } ${Math.abs(delta)} points from the opening rating">${arrow} ${
    delta > 0
      ? '+'
      : ''
  }${delta} vs start</small>`;
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

function scoreMovementExplanation(game) {
  const score = Number(game.score);
  const opening = Number(game.openingScore);
  const hasOpening = Number.isFinite(opening);
  const delta = hasOpening ? score - opening : 0;

  const why =
    `Why ${score}? ${explainRating(game)}`;

  const movement =
    game.state === 'upcoming' || !hasOpening
      ? `Pregame rating: ${score}.`
      : delta === 0
        ? `Rating stayed at ${score} from the opening rating.`
        : `Rating moved ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} points, from ${opening} to ${score}.`;

  const drivers = (Array.isArray(game.factors) ? game.factors : [])
    .filter(factor =>
      factor?.label &&
      Number.isFinite(Number(factor.points))
    )
    .sort((a,b) =>
      Math.abs(Number(b.points)) -
      Math.abs(Number(a.points))
    )
    .slice(0,3)
    .map(factor => {
      const points = Number(factor.points);
      return `${factor.label} (${points > 0 ? '+' : ''}${points})`;
    });

  return `${why} ${movement} ${drivers.length
    ? `Main drivers: ${drivers.join('; ')}.`
    : 'The detailed rating explanation is available in the game card.'}`;
}

function decorateScoreDots() {
  $$('#game-list .score-circle').forEach(dot => {
    const card = dot.closest('.game-card');
    const game = games.find(item =>
      String(item.id) === card?.dataset.id
    );

    if (!game || dot.closest('.score-dot-wrap')) {
      return;
    }

    const wrap = document.createElement('span');
    wrap.className = 'score-dot-wrap';

    const help = document.createElement('span');
    help.className = 'score-help';
    help.id = `score-help-${String(game.id).replace(/[^a-zA-Z0-9_-]/g,'-')}`;
    help.setAttribute('role','tooltip');
    help.textContent = scoreMovementExplanation(game);

    dot.setAttribute('role','button');
    dot.setAttribute('tabindex','0');
    dot.setAttribute('aria-expanded','false');
    dot.setAttribute('aria-controls',help.id);
    dot.setAttribute(
      'aria-label',
      `Excitement rating ${game.score}. ${scoreMovementExplanation(game)} Tap for details.`
    );

    dot.parentNode.insertBefore(wrap,dot);
    wrap.append(dot,help);
  });
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

function gameCard(game) {
  const scoreColorStyle = (() => {
    const value = Number(game.score);
    const normalized = Number.isFinite(value)
      ? Math.min(100, Math.max(0, value))
      : 50;
    const hue = Math.round(215 - (normalized * 2.15));
    return `--score-hue:${hue};`;
  })();

  const scoreClass =
    game.score >= 85
      ? 'hot'
      : game.score >= 70
        ? 'warm'
        : '';

  const stateLabel =
    game.state === 'live'
      ? `<span class="status-live">● LIVE</span>${
          game.live?.phase &&
          game.live.phase !== 'Live'
            ? `<span class="live-phase">${safeText(game.live.phase)}</span>`
            : ''
        }`
      : `<span class="status-${game.state}">${safeText(game.status)}</span>`;

  const leagueLogo =
    game.leagueLogo ||
    LEAGUE_LOGOS[game.sport];

  const line =
    displayLine(game);

  const compactLineLabel =
    line.label === 'Last listed pregame line'
      ? 'Last pregame line'
      : line.label;

  const situation =
    ['NFL','CFB'].includes(game.sport) ? footballSituationMarkup(game) :
    game.sport === 'MLB' ? baseballSituationMarkup(game) :
    game.state === 'live' &&
    (
      game.live?.note ||
      game.live?.bases
    )
      ? `<span class="live-situation">${basesMarkup(game.live?.bases)}${
          game.live?.note
            ? `<span>${safeText(game.live.note)}</span>`
            : ''
        }</span>`
      : '';

  const momentMarkup =
    game.moment
      ? `<span class="card-moment"><strong>${safeText(game.momentLabel || 'Latest play')}</strong><span>${safeText(game.moment)}</span></span>`
      : '';

  const accessibility = [
    game.teams[0][0],
    game.teams[0][2],
    game.teams[1][0],
    game.teams[1][2],
    game.live?.phase,
    ...(['NFL','CFB'].includes(game.sport) ? footballAccessibleSituation(game) : [game.live?.note]),
    ...(game.sport === 'MLB' ? [game.baseballSituation?.outs != null ? `${game.baseballSituation.outs} outs` : '',game.baseballSituation?.count ? `count ${game.baseballSituation.count}` : ''] : []),
    game.live?.bases
      ? Object.entries(game.live.bases)
          .filter(([,on]) => on)
          .map(([base]) => base)
          .join(' and ')
      : '',
    `excitement ${game.score}`,
    'Open game details'
  ]
    .filter(Boolean)
    .join(', ');

  const completionClass =
    game.state === 'completed'
      ? 'completed-card'
      : '';

  return `<button type="button" class="game-card ${
    game.favorite
      ? 'favorite'
      : ''
  } ${
    isWatched(game)
      ? 'watched'
      : ''
  } ${completionClass}" data-id="${safeText(game.id)}" data-division="${safeText(game.division || '')}" aria-label="${safeText(accessibility)}"><span class="sport-icon"><img class="league-logo" src="${safeText(leagueLogo)}" alt="" loading="lazy" onerror="this.style.display='none'"></span><span class="team-column"><span class="match-meta">${stateLabel}${
    isWatched(game)
      ? '<span class="watch-indicator" aria-hidden="true">★ Watching</span>'
      : ''
  }${
    game.division
      ? `<span>•</span><span>${safeText(game.division)}</span>`
      : ''
  }<span>•</span><span>${safeText(game.sub)}</span></span><span class="team-row ${isWinningTeam(game,game.teams[0]) ? 'winner-row' : ''}">${teamMarkup(game,game.teams[0])}<b class="team-score">${possessionMarkup(game,game.teams[0])}${safeText(game.teams[0][2])}</b></span><span class="team-row ${isWinningTeam(game,game.teams[1]) ? 'winner-row' : ''}">${teamMarkup(game,game.teams[1])}<b class="team-score">${possessionMarkup(game,game.teams[1])}${safeText(game.teams[1][2])}</b></span>${situation}</span>${momentMarkup}<span class="game-context channel-context"><span class="detail-inline"><strong>Broadcast</strong><span>${safeText(game.channel || 'Channel not listed')}</span></span><span class="stats-cue">Stats ›</span><span class="detail-inline line-inline"><strong>${safeText(compactLineLabel)}</strong><span>${safeText(line.text)}</span></span></span><span class="excitement"><span class="score-circle ${scoreClass}" style="${scoreColorStyle}">${game.score}</span>${trendFor(game)}</span></button>`;
}

function footballAccessibleSituation(game) {
  if (game.state !== 'live') return [];
  const situation = game.footballSituation;
  const holder = game.teams.find(team => team[8] && String(team[8]) === situation?.possessionTeamId);
  return [holder ? `${holder[0]} possession` : '',situation?.downAndDistance,situation?.fieldPosition];
}

function possessionMarkup(game,team) {
  if (game.state !== 'live' || !['NFL','CFB'].includes(game.sport) || !team[8] || String(team[8]) !== game.footballSituation?.possessionTeamId || game.teams.filter(item => String(item[8]) === String(team[8])).length !== 1) return '';
  return '<svg class="possession-marker" viewBox="0 0 24 16" aria-hidden="true"><path d="M2 8Q6-2 22 8Q18 18 2 8Z" fill="currentColor"/><path d="M8 8h8m-6-2v4m4-4v4" stroke="var(--surface, #17252d)" stroke-width="1.4"/></svg>';
}

function footballSituationMarkup(game) {
  if (game.state !== 'live') return '';
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

function basketballBoxScoreMarkup(summary,sport) {
  if (!['NBA','NCAAB'].includes(sport)) return '';

  const teams =
    summary?.basketballBoxScore?.teams || [];

  if (!teams.length) {
    return '<section class="detail-section"><h3>Box Score</h3><p class="detail-empty">Box score unavailable</p></section>';
  }

  const columns = [
    ['minutes','MIN'],
    ['fg','FG'],
    ['threePt','3PT'],
    ['ft','FT'],
    ['rebounds','REB'],
    ['assists','AST'],
    ['steals','STL'],
    ['blocks','BLK'],
    ['turnovers','TO'],
    ['fouls','PF'],
    ['points','PTS']
  ];

  const cells =
    stats =>
      columns
        .map(([key]) =>
          `<td>${safeText(stats?.[key] ?? '—')}</td>`
        )
        .join('');

  return `<section class="detail-section basketball-box-score"><h3>Box Score</h3><div class="detail-player-grid">${teams.map(team => `<div class="detail-player-team"><h4>${safeText(team.displayName)}</h4>${team.periods?.length ? `<p class="box-periods">${team.periods.map((period,index) => `${basketballPeriodLabel(sport,index)} ${safeText(period.value)}</`).join(' · ')}</p>` : ''}<div class="detail-table-scroll" tabindex="0" role="region" aria-label="${safeText(team.displayName)} box score, scroll for more statistics"><table class="detail-player-table basketball-player-table"><thead><tr><th scope="col">Player</th>${columns.map(([,label]) => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${(team.players || []).map(player => `<tr class="${player.didNotPlay ? 'box-dnp' : ''}"><th scope="row">${safeText(player.name)}${player.starter === null || player.starter === undefined ? '' : `<small>${player.starter ? 'Starter' : 'Bench'}</small>`}</th>${player.didNotPlay ? `<td colspan="${columns.length}" class="box-dnp-reason">DNP${player.dnpReason ? ` · ${safeText(player.dnpReason)}` : ''}</td>` : cells(player.stats)}</tr>`).join('')}</tbody>${team.totals ? `<tfoot><tr><th scope="row">TEAM</th>${cells(team.totals)}</tr></tfoot>` : ''}</table></div></div>`).join('')}</div></section>`;
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

function detailScoring(summary,sport) {
  const teams = detailCompetitors(summary);
  if (teams.length !== 2 || !teams.some(team => team.linescores?.length)) return '';
  const count = Math.max(...teams.map(team => team.linescores?.length || 0));
  const status = summary?.header?.competitions?.[0]?.status?.type?.detail || '';
  const labels = Array.from({length:count},(_,index) => {
    if (sport === 'MLB') return String(index + 1);
    if (sport === 'Tennis') return `S${index + 1}`;
    if (sport === 'Soccer') return ['1H','2H','ET','Pens'][index] || `ET${index - 1}`;
    if (sport === 'NCAAB') return index < 2 ? `${index + 1}H` : index === 2 ? 'OT' : `OT${index - 1}`;
    if (sport === 'NHL') return index < 3 ? `P${index + 1}` : index === 3 && /shootout/i.test(status) ? 'SO' : index === 3 ? 'OT' : 'SO';
    return index < 4 ? `Q${index + 1}` : index === 4 ? 'OT' : `OT${index - 3}`;
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

function detailStatRow(label,left,right,colors) {
  const display = stat => stat?.displayValue ?? '—';
  const numeric = [detailStatNumber(left),detailStatNumber(right)];
  const total = Math.max(0,numeric[0] || 0) + Math.max(0,numeric[1] || 0);
  const widths = numeric.map(number => number === null || !total ? 50 : 100 * Math.max(0,number) / total);
  return `<div class="detail-comparison-row"><div class="detail-comparison-values"><span>${safeText(display(left))}</span><span>${safeText(label)}</span><span>${safeText(display(right))}</span></div><div class="detail-comparison-bars"><span><i style="width:${widths[0]}%;background:${colors[0]}"></i></span><span><i style="width:${widths[1]}%;background:${colors[1]}"></i></span></div></div>`;
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
  const colors = competitors.map((team,index) => /^#?[0-9a-f]{6}$/i.test(team.team?.color || '') ? `#${String(team.team.color).replace('#','')}` : index ? '#f3bd32' : '#368cf5');
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

function detailPlays(summary) {
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
      }</h3><ul class="detail-plays">${plays.map(play =>
        `<li><span>${safeText(play.clock?.displayValue || play.period?.displayValue || '')}</span>${safeText(play.text || play.shortText || play.type?.text || 'Play recorded')}</li>`
      ).join('')}</ul></section>`
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
                `${group.name || ''} ${group.displayName || ''}`
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
    ].score === game.score
  ) {
    return;
  }

  ratingHistory[key] = [
    ...previous,
    {
      at:now,
      score:game.score,
      phase:
        game.live?.phase ||
        game.status
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
  return {regulation,periods,periodLength:regulation/periods,
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
  const ot = period-format.periods;
  return format.periods && ot > 0 ? (ot === 1 ? 'OT' : `${ot}OT`)
    : play.period?.displayValue || `Period ${period}`;
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
    const scores = timelineFinalScores(game,summary);
    const structured = scores.home !== null && scores.away !== null;
    const matchesFinal = structured ? finalEvent.home === scores.home && finalEvent.away === scores.away
      : /game[- ]winning|walk.off|last.second/i.test(finalEvent.text)
        || (game.sport === 'NHL' && finalEvent.home !== finalEvent.away && /overtime goal/i.test(finalEvent.text));
    const terminal = game.state === 'completed' && finalEvent.overtime && matchesFinal;
    if (terminal) finalEvent.score = game.score;
    const status = game.liveRawStatus || summary?.header?.competitions?.[0]?.status || {};
    const currentPosition = timelineEventPosition(game,{
      period:status.period,clock:{displayValue:status.displayClock,value:status.clock}
    },format,1);
    const endX = Math.max(finalEvent.x,currentPosition ?? 0,
      game.state === 'completed' ? format.regulation : 0);
    const points = [{x:0,score:game.openingScore || SPORT_BASE[game.sport] || 35,
      label:'Start',text:'Opening estimate'},...events];
    if (!terminal && (endX > finalEvent.x || game.score !== finalEvent.score)) {
      points.push({x:endX,score:game.score,
        label:game.state === 'completed' ? 'Final'
          : format.periods && Number(status.period)>format.periods
            ? `${timelinePeriodLabel({period:status.period},format)} ${format.untimed ? '' : status.displayClock || ''}`.trim()
            : game.live?.phase || 'Now',text:'Current rating'});
    }
    const domainEnd = Math.max(format.regulation,endX,...points.map(point => point.x));
    const dividers = [];
    if (format.periods && domainEnd > format.regulation) {
      for (let x=format.regulation,ot=1; x<domainEnd; x+=format.overtime,ot++) {
        dividers.push({x,label:ot === 1 ? 'OT' : `${ot}OT`});
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
        Number.isFinite(point.score)
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
          'Observed rating'
      })),

    source:
      'browser observations'
  };
}

function excitementTimeline(game,summary) {
  if (
    game.state === 'upcoming'
  ) {
    return '<section class="detail-section"><h3>Excitement timeline</h3><p class="detail-empty">The chart starts when the game begins.</p></section>';
  }

  const {
    points,
    source,
    domainEnd = 1,
    dividers = []
  } = timelinePoints(
    game,
    summary
  );

  if (
    points.length < 2
  ) {
    return '<section class="detail-section"><h3>Excitement timeline</h3><p class="detail-empty">Not enough play-by-play or observed ratings to draw a trustworthy timeline yet.</p></section>';
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
          `${index ? 'L' : 'M'} ${px(point).toFixed(1)} ${py(point).toFixed(1)}`
      )
      .join(' ');

  const rises =
    points
      .slice(1)
      .map(
        (point,index) => ({
          ...point,
          delta:
            point.score -
            points[index].score
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
      Number.isFinite(score) && Number.isFinite(prior)
        ? score - prior
        : 0;

    const movement =
      delta === 0
        ? `The rating stayed at ${score}.`
        : `The rating moved ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} points, from ${prior} to ${score}.`;

    const detail =
      point.text && point.text !== 'Current rating'
        ? `${String(point.text).replace(/[.]+$/,'')}.`
        : 'This is the current rating at that point in the game.';

    return `${point.label || 'Timeline point'}: ${movement} ${detail}`;
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

        return `<g class="timeline-point${current ? ' timeline-point-current' : ''}" data-timeline-explanation="${safeText(explanation)}" role="button" tabindex="0" aria-expanded="false" aria-controls="${timelineHelpId}" aria-label="${safeText(explanation)}"><circle class="${current ? 'timeline-end' : ''}" cx="${px(point).toFixed(1)}" cy="${py(point).toFixed(1)}" r="${current ? '5' : '3'}"/><title>${safeText(explanation)}</title></g>`;
      })
      .join('');

  const moments =
    rises.length
      ? `<ol class="timeline-moments">${rises.map(point =>
          `<li><b>+${point.delta}</b><span><strong>${safeText(point.label)}</strong> · ${safeText(point.text)}</span></li>`
        ).join('')}</ol>`
      : '';

  return `<section class="detail-section timeline-section"><h3>Excitement timeline</h3><p class="timeline-note">${
    source === 'scoring plays'
      ? 'Estimated at reported scoring plays; the final point is the current rating.'
      : 'Ratings recorded while this browser was open.'
  }</p><svg class="timeline-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Excitement rating over game time, from ${points[0].score} to ${points[points.length - 1].score}"><line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"/><line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/><line class="timeline-midline" x1="${left}" y1="${py({score:50})}" x2="${width - right}" y2="${py({score:50})}"/><text x="3" y="${top + 4}">100</text><text x="10" y="${py({score:50}) - 4}">50</text><text x="16" y="${height - bottom + 4}">0</text>${overtimeGuides}<path class="timeline-line" d="${path}"/>${markers}<text x="${left}" y="${height - 5}">Start</text><text x="${width - right}" y="${height - 5}" text-anchor="end">${game.state === 'completed' ? 'Final' : 'Now'}</text></svg><div class="timeline-point-help" id="${timelineHelpId}" role="status" aria-live="polite" hidden></div>${moments}</section>`;
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
  const factors = Array.isArray(game.qualitativeContexts) ? game.qualitativeContexts : [];
  if (!factors.length) return '';
  const rows = factors.map(factor => {
    const url = safeStoryUrl(factor.sourceUrl);
    const source = url
      ? `<a href="${safeText(url)}" target="_blank" rel="noopener noreferrer">${safeText(factor.sourceTitle || 'Read source')} ↗</a>`
      : '';
    return `<li><span>${safeText(factor.text)}</span>${source}</li>`;
  }).join('');
  return `<section class="detail-section storyline-section"><h3>Pregame storylines</h3><ul>${rows}</ul><p class="detail-empty">Only recent, source-backed context is included. It fades from the rating as the game unfolds.</p></section>`;
}

const DETAIL_TAB_CONFIG = {
  NFL:[['overview','Overview'],['team-stats','Team Stats'],['players','Players'],['plays','Plays']],
  CFB:[['overview','Overview'],['team-stats','Team Stats'],['players','Players'],['plays','Plays']],
  MLB:[['overview','Overview'],['team-stats','Team Stats'],['plays','Plays']],
  NHL:[['overview','Overview'],['team-stats','Team Stats'],['players','Skaters'],['plays','Plays']],
  NBA:[['overview','Overview'],['box-score','Box Score'],['team-stats','Team Stats'],['plays','Plays']],
  NCAAB:[['overview','Overview'],['box-score','Box Score'],['team-stats','Team Stats'],['plays','Plays']],
  Soccer:[['overview','Overview'],['team-stats','Team Stats'],['plays','Plays']],
  Tennis:[['overview','Overview']]
};

let activeDetailTab = 'overview';

function detailTabSections(game,summary) {
  const overviewParts = [
    storylineDetails(game),
    detailScoring(summary,game.sport),
    detailLeaders(summary)
  ].filter(Boolean);

  const sections = new Map([
    [
      'overview',
      overviewParts.length
        ? overviewParts.join('')
        : '<section class="detail-section"><p class="detail-empty">No additional summary sections are available for this game yet.</p></section>'
    ],
    ['team-stats',detailStats(summary,game.sport)],
    ['players',detailPlayerStats(summary,game.sport)],
    ['box-score',basketballBoxScoreMarkup(summary,game.sport)],
    ['plays',detailPlays(summary)]
  ]);

  return (DETAIL_TAB_CONFIG[game.sport] || DETAIL_TAB_CONFIG.Tennis)
    .map(([id,label]) => ({
      id,
      label,
      content:sections.get(id) || ''
    }))
    .filter(tab =>
      tab.id === 'overview' ||
      Boolean(tab.content)
    );
}

function detailTabsMarkup(game,summary) {
  const tabs = detailTabSections(game,summary);

  if (!tabs.length) return '';

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

  return `<div class="detail-tab-shell"><div class="detail-tabs" role="tablist" aria-label="${safeText(labelForSport(game.sport))} game details">${buttons}</div>${panels}</div>`;
}

function setActiveDetailTab(button) {
  const shell = button?.closest('.detail-tab-shell');
  const nextTab = button?.dataset.detailTab;

  if (!shell || !nextTab) return;

  activeDetailTab = nextTab;

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
  $('#game-detail-title').textContent =
    'Game Center';

  if (loading) {
    $('#game-detail-content').innerHTML =
      `<div class="detail-loading">Loading live game details…</div>`;

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

    return `<div class="detail-team"><img src="${safeText(team[4] || teamLogoUrl(game.sport,team[1]))}" alt="" onerror="this.style.display='none'"><span class="detail-team-copy"><strong>${safeText(team[0])}</strong>${teamMeta.length ? `<small>${safeText(teamMeta.join(' · '))}</small>` : ''}</span><b>${safeText(team[2])}</b></div>`;
  }).join('');

  const status =
    (game.state === 'live' ? game.live?.phase : '') ||
    game.status;

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

  const freshness =
    !summary
      ? `<p class="detail-freshness">The live summary feed did not return additional stats for this game yet. The score, rating explanation, and broadcast are still current.</p>`
      : summary.sportsRadarFreshness?.stale
        ? `<p class="detail-freshness">Cached game details · last updated ${safeText(new Date(summary.sportsRadarFreshness.updatedAt).toLocaleTimeString())}. Rich details may be behind or ahead of the canonical scoreboard; score and rating follow the main feed.</p>`
        : '';

  const rating =
    Number(game.score);

  const normalizedRating =
    Number.isFinite(rating)
      ? Math.min(100,Math.max(0,rating))
      : 50;

  const scoreHue =
    Math.round(
      215 -
      normalizedRating * 2.15
    );

  const opening =
    Number(game.openingScore);

  const ratingContext =
    game.state === 'upcoming'
      ? `Pregame rating ${safeText(game.score)}`
      : Number.isFinite(opening)
        ? `Opening ${safeText(opening)} · Current ${safeText(game.score)}`
        : `Current rating ${safeText(game.score)}`;

  $('#game-detail-content').innerHTML =
    `<header class="detail-header"><div class="detail-kicker">${safeText(labelForSport(game.sport))} · ${safeText(status)}</div><h2>${safeText(title)}</h2><button type="button" class="detail-watch ${isWatched(game) ? 'active' : ''}" data-watch-id="${safeText(watchKey(game))}" aria-pressed="${isWatched(game)}">${isWatched(game) ? '★ Watching this game' : '☆ Add to watchlist'}</button><div class="detail-scoreboard">${scores}</div><div class="detail-meta"><span><strong>Venue</strong> ${safeText(venue)}</span><span><strong>Broadcast</strong> ${safeText(game.channel || 'Channel not listed')}</span>${lineMeta}</div>${freshness}${game.moment ? `<section class="detail-moment"><strong>${safeText(game.momentLabel || 'Notable play')}</strong><span>${safeText(game.moment)}</span></section>` : ''}</header><section class="detail-radar"><div class="detail-excitement-head"><span class="detail-excitement-score" style="--score-hue:${scoreHue}">${safeText(game.score)}</span><span class="detail-excitement-copy"><small>Sports Radar excitement</small><strong>${safeText(ratingContext)}</strong></span></div><div class="detail-radar-why"><h3>Why ${safeText(game.score)}?</h3><p class="detail-explanation detail-why-text">${safeText(explainRating(game))}</p><button type="button" class="detail-why-toggle" aria-expanded="false">More</button></div>${excitementTimeline(game,summary)}</section>${detailTabsMarkup(game,summary)}`;
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
let detailGeneration = 0;
let detailTimer = null;
let detailRequest = null;
let detailFinalPending = false;
let detailFailed = false;

function stopDetailRequest() {
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
    const missing = !games.some(item => item.sport === game.sport && String(item.id) === String(game.id));
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

function hideGameDetails() {
  stopDetailRequest();
  $('#game-detail-overlay').hidden = true;
  document.body.classList.remove('detail-open');
  activeDetailGame = null;
  activeDetailSummary = null;
  activeDetailTab = 'overview';
  detailFinalPending = false;
}

async function openGameDetails(id) {
  const game = games.find(item => String(item.id) === String(id));
  if (!game) return;
  stopDetailRequest();
  activeDetailGame = game;
  activeDetailSummary = null;
  activeDetailTab = 'overview';
  detailFinalPending = false;
  detailFailed = false;
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
    `${last.play.period?.displayValue || ''} ${last.play.clock?.displayValue || ''}`
      .trim();

  if (
    game.state === 'completed'
  ) {
    const decisive =
      /(0:00|last second|game[- ]winning|walk.off)/i
        .test(
          `${time} ${text}`
        ) ||
      (
        Number(
          last.play.period?.number
        ) >
        ({
          NHL:3,
          NFL:4,
          CFB:4,
          NBA:4,
          NCAAB:2
        })[game.sport] &&
        /goal|field goal|touchdown|basket/i
          .test(text)
      );

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
  const isSoccer =
    state.page === 'soccer';

  $('#section-title').textContent =
    isSoccer
      ? 'Soccer radar'
      : 'Your radar';

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

  if (
    !isSoccer &&
    state.sport !== 'all' &&
    !state.visibleSports.has(
      state.sport
    )
  ) {
    state.sport = 'all';

    $$('.sport-chip[data-sport]')
      .forEach(chip =>
        chip.classList.toggle(
          'active',
          chip.dataset.sport === 'all'
        )
      );
  }

  const scopeGames =
    games.filter(game =>
      (
        isSoccer
          ? game.sport === 'Soccer'
          : game.sport !== 'Soccer' &&
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
      )
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

  $('#game-list').innerHTML =
    renderGameList(
      visible,
      state.gameState
    );

  decorateScoreDots();

  $('#empty-state').classList.toggle(
    'hidden',
    visible.length !== 0
  );

  $('#empty-state h3').textContent =
    state.source === 'loading' ? 'Loading live scores…' :
    state.source === 'unavailable' ? 'Live scores unavailable' :
    'No games in this view';

  $('#empty-message').textContent =
    state.source === 'loading'
      ? 'Connecting to the live feed.'
      : state.source === 'unavailable'
        ? 'The feed could not be reached. Use Refresh to retry.'
        : state.gameState === 'watching'
          ? 'Open a game and tap “Add to watchlist.” Saved games appear here while they are in the current scoreboard feed.'
          : 'Try a different sport or game state.';

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

  $('#watch-count').textContent =
    scopeGames.filter(
      isWatched
    ).length;
}

$$('.nav-link').forEach(
  link =>
    link.addEventListener(
      'click',
      () => {
        state.page =
          link.dataset.page;

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

window.addEventListener(
  'hashchange',
  () => {
    state.page =
      location.hash === '#soccer'
        ? 'soccer'
        : 'home';

    render();
  }
);

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

      persistPreferences();
      syncFCSFilter();
      render();
    }
  );

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

function toggleScoreHelp(dot) {
  const wrap = dot.closest('.score-dot-wrap');

  if (!wrap) {
    return;
  }

  const open =
    wrap.classList.toggle('is-open');

  dot.setAttribute(
    'aria-expanded',
    String(open)
  );
}

function closeScoreHelp(except) {
  $$('#game-list .score-dot-wrap.is-open').forEach(wrap => {
    if (wrap !== except) {
      wrap.classList.remove('is-open');
      wrap.querySelector('.score-circle')?.setAttribute(
        'aria-expanded',
        'false'
      );
    }
  });
}

$('#game-list')
  .addEventListener(
    'pointerdown',
    event => {
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
        event.target.closest('.score-circle')
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

        openGameDetails(id);
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
      const dot =
        event.target.closest('.score-circle');

      if (dot) {
        closeScoreHelp(dot.closest('.score-dot-wrap'));
        toggleScoreHelp(dot);
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
          card.dataset.id
        );
      }
    }
  );

$('#game-list')
  .addEventListener(
    'keydown',
    event => {
      const dot =
        event.target.closest('.score-circle');

      if (
        !dot ||
        !['Enter',' '].includes(event.key)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      closeScoreHelp(dot.closest('.score-dot-wrap'));
      toggleScoreHelp(dot);
    }
  );

document.addEventListener(
  'pointerdown',
  event => {
    if (!event.target.closest('.score-dot-wrap')) {
      closeScoreHelp(null);
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
          help.hidden = false;
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

      point.classList.remove('is-open');
      point.setAttribute('aria-expanded','false');

      if (help) {
        help.hidden = true;
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
  help.hidden = !open;
  help.textContent =
    open
      ? point.dataset.timelineExplanation || ''
      : '';
}

$('#game-detail-content')
  .addEventListener(
    'click',
    event => {
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

window.addEventListener(
  'beforeinstallprompt',
  event => {
    event.preventDefault();

    deferredInstallPrompt =
      event;

    $('#install-button')
      .classList.remove(
        'hidden'
      );
  }
);

$('#install-button')
  .addEventListener(
    'click',
    async () => {
      if (
        !deferredInstallPrompt
      ) {
        return;
      }

      deferredInstallPrompt
        .prompt();

      await deferredInstallPrompt
        .userChoice;

      deferredInstallPrompt =
        null;

      $('#install-button')
        .classList.add(
          'hidden'
        );
    }
  );

window.addEventListener(
  'appinstalled',
  () =>
    $('#install-button')
      .classList.add(
        'hidden'
      )
);

if (
  'serviceWorker' in navigator
) {
  navigator.serviceWorker
    .register(
      './sw.js?rev=20261022-feed1'
    )
    .then(
      registration =>
        registration.update()
    )
    .catch(() => {});
}

renderFavoriteTags();
renderFavoriteResults();
render();
loadLiveGames();
document.addEventListener('visibilitychange',() => {
  detailVisibilityChanged();
  if (document.hidden) scheduleLiveRefresh();
  else loadLiveGames();
});

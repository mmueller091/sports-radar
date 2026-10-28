import {normalizeEvent} from '../game-model.js';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const SPORT_PATHS = {NFL:'football/nfl',MLB:'baseball/mlb',NHL:'hockey/nhl',CFB:'football/college-football',NBA:'basketball/nba',NCAAB:'basketball/mens-college-basketball',Tennis:'tennis/atp',Soccer:'soccer/eng.1'};
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

export function createCollector(readJson) {
const scheduleWindowCache = new Map();
async function fetchScoreboard(feed) { const url=new URL(feed.url); url.searchParams.set("limit",String(feed.limit || 100)); return readJson(url.href,{purpose:feed.purpose}); }
function gamesFromScoreboard(feed,payload) {
  const leagueLogo =
    payload.leagues?.[0]?.logos?.[0]?.href;

  const events = (payload.events || [])
    .map(event =>
      normalizeEvent(
        event,
        feed.sport,
        leagueLogo,
        feed.division
      )
    )
    .filter(Boolean);



  events.forEach(game => { game.providerPath = new URL(feed.url).pathname.split("/sports/")[1].split("/scoreboard")[0]; });
  return events;
}
async function fetchFeed(feed) {
  return gamesFromScoreboard(
    feed,
    await fetchScoreboard(feed)
  );
}
function nflWeekMeta(payload) {
  const rawType =
    payload.season?.type ??
    payload.leagues?.[0]?.season?.type;

  const seasonType =
    Number(
      typeof rawType === 'object'
        ? rawType.id ?? rawType.type
        : rawType
    );

  const year =
    Number(
      payload.season?.year ??
      payload.leagues?.[0]?.season?.year
    );

  const week =
    Number(
      payload.week?.number ??
      payload.week?.id ??
      payload.events?.[0]?.week?.number
    );

  return Number.isInteger(year) &&
    Number.isInteger(seasonType) &&
    Number.isInteger(week) &&
    week > 0
      ? {
          year,
          seasonType,
          week
        }
      : null;
}
function nflWeekKey(meta) {
  return meta.year * 1000 +
    meta.seasonType * 100 +
    meta.week;
}
function adjacentNFLWeek(meta,step) {
  const week = meta.week + step;

  const maxWeek =
    meta.seasonType === 2
      ? 18
      : meta.seasonType === 3
        ? 5
        : 4;

  if (week >= 1 && week <= maxWeek) {
    return {
      ...meta,
      week
    };
  }

  if (
    step === 1 &&
    meta.seasonType === 2
  ) {
    return {
      ...meta,
      seasonType:3,
      week:1
    };
  }

  if (
    step === -1 &&
    meta.seasonType === 3
  ) {
    return {
      ...meta,
      seasonType:2,
      week:18
    };
  }

  return null;
}
function nflWeekFeed(base,meta) {
  const url = new URL(base.url);

  url.searchParams.set(
    'dates',
    String(meta.year)
  );

  url.searchParams.set(
    'seasontype',
    String(meta.seasonType)
  );

  url.searchParams.set(
    'week',
    String(meta.week)
  );

  return {
    ...base,
    url:url.toString(),
    limit:100,
    purpose:'adjacent-schedule'
  };
}
function selectNFLWindow(items) {
  const unique = dedupeGames(items);

  const weeks = [
    ...new Set(
      unique.map(game => game.nflWeek)
    )
  ].sort((a,b) => a - b);

  const started = weeks.filter(week =>
    unique.some(game =>
      game.nflWeek === week &&
      game.state !== 'upcoming'
    )
  );

  const latestStarted = started.at(-1);

  const latestComplete = weeks.filter(week => {
    const slate = unique.filter(
      game => game.nflWeek === week
    );

    return slate.length &&
      slate.every(
        game => game.state === 'completed'
      );
  }).at(-1);

  const next =
    weeks.find(
      week => week > latestStarted
    );

  const earliestUpcoming =
    weeks.find(week =>
      unique.some(game =>
        game.nflWeek === week &&
        game.state === 'upcoming'
      )
    );

  return unique.filter(game =>
    game.state === 'live' ||
    (
      game.state === 'completed' &&
      (
        game.nflWeek === latestComplete ||
        game.nflWeek === latestStarted
      )
    ) ||
    (
      game.state === 'upcoming' &&
      (
        latestStarted === undefined
          ? game.nflWeek === earliestUpcoming
          : game.nflWeek === latestStarted ||
            game.nflWeek === next
      )
    )
  );
}
async function fetchNFLWindow() {
  const base =
    LIVE_FEEDS.find(
      feed => feed.sport === 'NFL'
    );

  const payload =
    await fetchScoreboard(base);

  const meta =
    nflWeekMeta(payload);

  const current =
    gamesFromScoreboard(
      base,
      payload
    );

  if (!meta) return current;

  const currentKey =
    nflWeekKey(meta);

  current.forEach(game => {
    game.nflWeek = currentKey;
  });

  const neighbors = [
    adjacentNFLWeek(meta,-1),
    adjacentNFLWeek(meta,1)
  ].filter(Boolean);

  const results =
    await Promise.allSettled(
      neighbors.map(
        async weekMeta => {
          const events =
            await fetchFeed(
              nflWeekFeed(
                base,
                weekMeta
              )
            );

          const key =
            nflWeekKey(weekMeta);

          events.forEach(game => {
            game.nflWeek = key;
          });

          return events;
        }
      )
    );

  return selectNFLWindow([
    ...current,
    ...results.flatMap(
      result =>
        result.status === 'fulfilled'
          ? result.value
          : []
    )
  ]);
}
function dedupeGames(items) {
  const unique = new Map();

  for (const game of items) {
    const key =
      `${game.sport}:${game.id}`;

    const existing =
      unique.get(key);

    if (
      !existing ||
      game.division === 'FCS'
    ) {
      unique.set(key,game);
    }
  }

  return [...unique.values()];
}
function dateToken(value) {
  const date = new Date(value);

  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
}
function datedFeed(feed,value) {
  const url = new URL(feed.url);

  url.searchParams.set(
    'dates',
    dateToken(value)
  );

  return {
    ...feed,
    url:url.toString()
  };
}
async function fetchDailyWindow(feed,futureDays=7) {
  const today = new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'}));
  today.setHours(12,0,0,0);

  const yesterday = new Date(today);
  yesterday.setDate(
    yesterday.getDate() - 1
  );

  const cached =
    scheduleWindowCache.get(feed.sport);

  const activeDatesRequest =
    Promise.allSettled(
      [yesterday,today].map(
        date =>
          fetchFeed(
            datedFeed(
              feed,
              date
            )
          )
      )
    ).then(results =>
      results.flatMap(
        result =>
          result.status === 'fulfilled'
            ? result.value
            : []
      )
    );

  const futureRequest =
    !cached ||
    cached.anchor !== dateToken(today) ||
    cached.expiresAt <= Date.now()
      ? Promise.allSettled(
          Array.from(
            {length:futureDays},
            (_,index) => {
              const date =
                new Date(today);

              date.setDate(
                date.getDate() +
                index +
                1
              );

              return fetchFeed(
                datedFeed(
                  feed,
                  date
                )
              );
            }
          )
        ).then(results => {
          const futureGames =
            results.flatMap(
              result =>
                result.status === 'fulfilled'
                  ? result.value
                  : []
            );

          scheduleWindowCache.set(
            feed.sport,
            {
              anchor:dateToken(today),
              games:futureGames,
              expiresAt:
                Date.now() +
                15 * 60 * 1000
            }
          );

          return futureGames;
        })
      : Promise.resolve(
          cached.games
        );

  const [
    activeGames,
    futureGames
  ] = await Promise.all([
    activeDatesRequest,
    futureRequest
  ]);

  return dedupeGames([
    ...activeGames,
    ...futureGames
  ]);
}
return async () => dedupeGames((await Promise.all([fetchNFLWindow(),...LIVE_FEEDS.filter(f=>f.sport!=="NFL").map(f=>["NBA","NHL"].includes(f.sport)?fetchDailyWindow(f):fetchFeed(f))])).flat());
}
export function summaryUrl(game) { const league=game.sport === "Soccer" && game.sourceEvent?.league?.slug === "uefa.champions" ? "soccer/uefa.champions" : SPORT_PATHS[game.sport]; return `${ESPN_BASE}/${game.providerPath || league}/summary?event=${encodeURIComponent(game.id)}`; }

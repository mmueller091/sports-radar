import {nhlGameCenterStats} from './providers/nhl.js';
import {basketballBoxScore} from './display-model.js';
import {createCollector,summaryUrl,teamResourceUrls,coreTeamProfileUrl,teamLeadersUrl,standingsUrl} from './providers/espn.js';
import {normalizeEvent,preservePregameRecords,applyContextsToGame,enrichGame} from './live-game-model.js';
import runtime from '../../scoring/live-runtime.cjs';
import {contextsForGames} from './storylines.js';
import {fingerprint,summaryCandidate,reusable,refreshBudget,boundedFeedRefresh,REFRESH_LEASE_MS} from './refresh-policy.js';
import {RETENTION_MS,recoverPregameRecords,snapshotHistory,shouldSnapshot} from './snapshot-history.js';

const STALE_MS = 120000;
const LIVE_REFRESH_MS = 12000;
const IDLE_REFRESH_MS = 60000;
export const MODEL_VERSION = runtime.MODEL_VERSION;

export function refreshDue(feed,now=Date.now()) {
  if (!feed || feed.modelVersion !== MODEL_VERSION) return true;
  const updatedAt = Date.parse(feed.updatedAt || '');
  if (!Number.isFinite(updatedAt)) return true;
  const live = (feed.games || []).some(game=>game.state==='live');
  return now-updatedAt >= (live ? LIVE_REFRESH_MS : IDLE_REFRESH_MS);
}

export function withFreshness(feed,now=Date.now()) {
  if (!feed) return null;
  const ageMs = Math.max(0,now-Date.parse(feed.updatedAt));
  return {...feed,freshness:{ageMs,stale:ageMs > STALE_MS || feed.modelVersion !== MODEL_VERSION,degraded:Boolean(feed.sourceErrors?.length),maxAgeMs:STALE_MS}};
}

export async function readFeed(env,now=Date.now()) {
  const row = await env.DB.prepare('SELECT payload FROM sports_feed WHERE id=1').first();
  if (!row) return null;
  const feed = JSON.parse(row.payload);
  if (feed.revision) {
    const parts = await env.DB.prepare('SELECT payload FROM sports_feed_parts WHERE revision=? ORDER BY part').bind(feed.revision).all();
    if (parts.results.length !== feed.parts) throw new Error('Incomplete stored feed');
    feed.games = parts.results.flatMap(part=>JSON.parse(part.payload));
  }
  return withFreshness(feed,now);
}

// A D1 lease coordinates all isolates and regions, including overlapping cron runs.
async function acquire(env,key,now,ttl) {
  const owner = crypto.randomUUID();
  const result = await env.DB.prepare(`INSERT INTO sports_leases (key,owner,expires_at) VALUES (?,?,?)
    ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at
    WHERE sports_leases.expires_at <= ?`).bind(key,owner,now+ttl,now).run();
  return result.meta?.changes ? owner : null;
}
async function release(env,key,owner) {
  await env.DB.prepare('DELETE FROM sports_leases WHERE key=? AND owner=?').bind(key,owner).run();
}

async function fetchSourceJson(url,ttl,budget) {
  budget?.check();
  if (budget) budget.stats.providerRequests++;
  try {
    const response = await fetch(url,{headers:{Accept:'application/json'},signal:budget ? AbortSignal.any([budget.signal,AbortSignal.timeout(7000)]) : AbortSignal.timeout(7000),cf:{cacheTtl:Math.floor(ttl/1000),cacheEverything:true}});
    if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || typeof payload !== 'object' || (url.includes('/scoreboard') && !Array.isArray(payload.events))) throw new Error('Invalid source response');
    return payload;
  } catch(error) {
    if (budget) budget.stats.providerFailures++;
    if (budget && (error?.name==='TimeoutError' || error?.name==='AbortError' || budget.signal.aborted)) budget.stats.providerTimeouts++;
    throw error;
  }
}

// The cron already owns the global refresh lease. Read the small cache index once
// and batch writes, rather than spending four D1 operations on every source URL.
// Summary reads share the per-URL ownership path with public details.
async function refreshReader(env,now,budget) {
  const rows = await env.DB.prepare('SELECT key,updated_at FROM sports_resources').all();
  const dates = new Map(rows.results.map(row=>[row.key,row.updated_at]));
  const pending = new Map();
  const requests = new Map();
  const stored = async url => {
    const row = await env.DB.prepare('SELECT payload FROM sports_resources WHERE key=?').bind(url).first();
    return row ? JSON.parse(row.payload) : null;
  };
  return {
    dates,
    settle:()=>Promise.allSettled([...requests.values()]),
    async cached(url) {
      budget.check();
      const row = await env.DB.prepare('SELECT payload,updated_at FROM sports_resources WHERE key=?').bind(url).first();
      return row ? {payload:JSON.parse(row.payload),updatedAt:row.updated_at} : null;
    },
    read(url,ttl,errors) {
      budget.check();
      if (!requests.has(url)) requests.set(url,(async()=>{
        if (new URL(url).pathname.endsWith('/summary')) return (await providerJson(env,url,ttl,now,errors,budget)).payload;
        if (dates.has(url) && now-dates.get(url)<ttl) return stored(url);
        try {
          const payload = await fetchSourceJson(url,ttl,budget);
          pending.set(url,JSON.stringify(payload));
          return payload;
        } catch(error) {
          errors.push(url);
          budget.check();
          if (dates.has(url)) return stored(url);
          throw error;
        }
      })());
      return requests.get(url);
    },
    async flush() {
      budget.check();
      const entries = [...pending];
      for (let start=0;start<entries.length;start+=20) {
        const group = entries.slice(start,start+20);
        await env.DB.prepare(`INSERT INTO sports_resources (key,payload,updated_at) VALUES ${group.map(()=>'(?,?,?)').join(',')}
          ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at
          WHERE excluded.updated_at > sports_resources.updated_at`)
          .bind(...group.flatMap(([url,payload])=>[url,payload,now])).run();
        group.forEach(([url])=>dates.set(url,now));
      }
      pending.clear();
      requests.clear();
    }
  };
}

async function providerJson(env,url,ttl,now,errors,budget) {
  budget?.check();
  const read = () => env.DB.prepare('SELECT payload,updated_at FROM sports_resources WHERE key=?').bind(url).first();
  const unpack = row => ({payload:JSON.parse(row.payload),updatedAt:row.updated_at});
  let row = await read();
  if (row && now-row.updated_at < ttl) return unpack(row);
  const owner = await acquire(env,url,now,15000);
  if (!owner) {
    errors.push(url);
    row = await read();
    if (row) return unpack(row);
    throw new Error('Source refresh in progress');
  }
  try {
    // Another owner may have committed between our first read and acquisition.
    row = await read();
    if (row && now-row.updated_at < ttl) return unpack(row);
    const payload = await fetchSourceJson(url,ttl,budget);
    budget?.check();
    // Atomic owner fencing plus monotonic versions: an expired owner cannot write
    // after a successor, even if its provider request eventually completes.
    await env.DB.prepare(`INSERT INTO sports_resources (key,payload,updated_at)
      SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM sports_leases WHERE key=? AND owner=?)
      ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at
      WHERE excluded.updated_at > sports_resources.updated_at`)
      .bind(url,JSON.stringify(payload),now,url,owner).run();
    const stored = await read();
    if (!stored) throw new Error('Source lease lost');
    if (stored.updated_at !== now) errors.push(url);
    return unpack(stored);
  } catch (error) {
    errors.push(url);
    budget?.check();
    row = await read();
    if (row) return unpack(row);
    throw error;
  } finally { await release(env,url,owner); }
}

const TEAM_STATIC_TTL_MS = 6 * 60 * 60 * 1000;
const TEAM_LEADER_TTL_MS = 6 * 60 * 60 * 1000;
const TEAM_IDENTITY_TTL_MS = 24 * 60 * 60 * 1000;
const TEAM_STANDINGS_TTL_MS = 15 * 60 * 1000;

function inferredTeamSeason(sport,now) {
  const date =
    new Date(now);

  const year =
    date.getUTCFullYear();

  const month =
    date.getUTCMonth() + 1;

  if ([
    'NBA',
    'NCAAB',
    'NHL'
  ].includes(sport)) {
    return month >= 7
      ? year + 1
      : year;
  }

  if ([
    'NFL',
    'CFB'
  ].includes(sport)) {
    return month === 1
      ? year - 1
      : year;
  }

  return year;
}

function teamSeasonYear(teamPayload,schedulePayload,sport,now) {
  const candidates = [
    schedulePayload?.season?.year,
    schedulePayload?.events?.find(item =>
      Number.isInteger(
        Number(item?.season?.year)
      )
    )?.season?.year,
    teamPayload?.season?.year,
    teamPayload?.team?.season?.year
  ];

  for (const value of candidates) {
    const year = Number(value);

    if (Number.isInteger(year)) {
      return year;
    }
  }

  return inferredTeamSeason(
    sport,
    now
  );
}

function teamScoreValue(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  if (
    typeof value === 'object'
  ) {
    return String(
      value.displayValue ??
      value.value ??
      ''
    );
  }

  return String(value);
}

function teamLogo(team) {
  if (!team) return '';

  if (typeof team.logo === 'string') {
    return team.logo;
  }

  const logos =
    Array.isArray(team.logos)
      ? team.logos
      : [];

  return (
    logos.find(item =>
      item?.rel?.includes?.('default')
    )?.href ||
    logos[0]?.href ||
    ''
  );
}

function teamRecordSummary(team) {
  const items =
    team?.record?.items ||
    team?.records ||
    [];

  const total =
    Array.isArray(items)
      ? items.find(item =>
          String(item?.type || '')
            .toLowerCase() ===
          'total'
        ) || items[0]
      : null;

  return String(
    total?.summary ||
    team?.record?.summary ||
    team?.recordSummary ||
    ''
  );
}

export function normalizeTeamIdentity(teamPayload,schedulePayload,sport,id) {
  const raw =
    teamPayload?.team ||
    schedulePayload?.team ||
    {};

  const scheduleTeam =
    schedulePayload?.team ||
    {};

  return {
    sport,
    id:String(
      raw.id ||
      scheduleTeam.id ||
      id
    ),
    name:
      raw.displayName ||
      scheduleTeam.displayName ||
      raw.name ||
      scheduleTeam.name ||
      '',
    abbreviation:
      raw.abbreviation ||
      scheduleTeam.abbreviation ||
      '',
    shortName:
      raw.shortDisplayName ||
      scheduleTeam.shortDisplayName ||
      raw.nickname ||
      '',
    logo:
      teamLogo(raw) ||
      teamLogo(scheduleTeam),
    record:
      teamRecordSummary(raw) ||
      teamRecordSummary(scheduleTeam),
    standing:
      raw.standingSummary ||
      scheduleTeam.standingSummary ||
      '',
    venue:
      raw.venue?.fullName ||
      scheduleTeam.venue?.fullName ||
      '',
    color:
      raw.color || '',
    alternateColor:
      raw.alternateColor || ''
  };
}


function standingKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g,'');
}

function standingStatMap(entry) {
  const result = {};

  for (const stat of (entry?.stats || [])) {
    const key = standingKey(stat?.name || stat?.abbreviation || stat?.displayName);
    if (!key) continue;

    result[key] = {
      value:stat?.value ?? null,
      displayValue:
        stat?.displayValue ??
        stat?.value ??
        ''
    };
  }

  return result;
}

function standingPick(stats,names) {
  for (const name of names) {
    const value = stats?.[standingKey(name)];
    if (value) return value;
  }
  return null;
}

function standingNumber(stats,names) {
  const stat = standingPick(stats,names);
  const value = Number(stat?.value ?? stat?.displayValue);
  return Number.isFinite(value) ? value : null;
}

function standingText(stats,names) {
  const stat = standingPick(stats,names);
  return stat?.displayValue === null || stat?.displayValue === undefined
    ? ''
    : String(stat.displayValue);
}

function standingTeamLogo(team) {
  if (!team) return '';
  if (typeof team.logo === 'string') return team.logo;
  return team.logos?.find(item => item?.rel?.includes?.('default'))?.href ||
    team.logos?.[0]?.href || '';
}

function standingRecord(sport,stats) {
  const supplied = standingText(stats,['overall','record']);
  if (supplied) return supplied;

  const wins = standingNumber(stats,['wins']);
  const losses = standingNumber(stats,['losses']);
  const ties = standingNumber(stats,['ties','draws']);
  const overtimeLosses = standingNumber(stats,['otLosses','overtimeLosses']);

  if (wins === null || losses === null) return '';

  if (sport === 'NHL' && overtimeLosses !== null) {
    return `${wins}-${losses}-${overtimeLosses}`;
  }

  if (sport === 'Soccer' && ties !== null) {
    return `${wins}-${ties}-${losses}`;
  }

  return ties && ties > 0
    ? `${wins}-${losses}-${ties}`
    : `${wins}-${losses}`;
}

function standingRow(entry,sport,index) {
  const team = entry?.team || {};
  const stats = standingStatMap(entry);
  const divisionRank = standingNumber(stats,['divisionRank']);

  return {
    id:String(team.id || entry?.id || ''),
    name:
      team.displayName ||
      team.shortDisplayName ||
      team.name ||
      team.abbreviation ||
      'Team',
    abbreviation:team.abbreviation || '',
    logo:standingTeamLogo(team),
    rank:divisionRank ?? index + 1,
    record:standingRecord(sport,stats),
    winPercent:standingText(stats,['winPercent','pct']),
    gamesBehind:standingText(stats,['gamesBehind']),
    points:standingText(stats,['points']),
    gamesPlayed:standingText(stats,['gamesPlayed']),
    divisionRecord:standingText(stats,['divisionRecord']),
    conferenceRecord:standingText(stats,['conferenceRecord']),
    streak:standingText(stats,['streak']),
    divisionRank,
    conferenceRank:standingNumber(stats,['conferenceRank']),
    leagueRank:standingNumber(stats,['leagueRank']),
    playoffSeed:standingNumber(stats,['playoffSeed']),
    wildCardRank:standingNumber(stats,['wildCardRank','wildcardRank']),
    clincher:standingText(stats,['clincher']),
    note:
      entry?.note?.description ||
      entry?.note?.text ||
      '',
    stats:Object.fromEntries(
      Object.entries(stats).map(([key,value]) => [
        key,
        value.displayValue
      ])
    )
  };
}

function collectStandingGroups(value,out=[],depth=0) {
  if (!value || depth > 6 || typeof value !== 'object') return out;

  const entries = value?.standings?.entries;
  if (Array.isArray(entries) && entries.length) {
    out.push({
      name:
        value.name ||
        value.displayName ||
        value.standings?.displayName ||
        'Standings',
      abbreviation:value.abbreviation || '',
      entries
    });
  }

  if (Array.isArray(value.children)) {
    value.children.forEach(child =>
      collectStandingGroups(child,out,depth + 1)
    );
  }

  return out;
}

function ordinalStanding(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return '';
  const mod100 = number % 100;
  const suffix = mod100 >= 11 && mod100 <= 13
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

function playoffPicture(sport,row,groupName) {
  if (!['NFL','MLB','NHL','NBA'].includes(sport) || !row) return null;

  const seed = row.playoffSeed ?? row.conferenceRank ?? row.leagueRank;
  const divisionRank = row.divisionRank;
  const wildCardRank = row.wildCardRank;
  let label = '';

  if (sport === 'NFL') {
    if (divisionRank === 1 && seed !== null && seed <= 4) label = 'Division leader';
    else if (seed !== null && seed <= 7) label = 'Wild Card';
    else if (seed !== null) label = 'Outside playoff field';
  } else if (sport === 'MLB') {
    if (divisionRank === 1 && (seed === null || seed <= 3)) label = 'Division leader';
    else if ((wildCardRank !== null && wildCardRank <= 3) || (seed !== null && seed <= 6)) label = 'Wild Card';
    else if (seed !== null) label = 'Outside playoff field';
  } else if (sport === 'NHL') {
    if (divisionRank !== null && divisionRank <= 3) label = 'Division playoff position';
    else if (wildCardRank !== null && wildCardRank <= 2) label = `Wild Card ${wildCardRank}`;
    else if (seed !== null && seed <= 8) label = 'Playoff position';
    else if (seed !== null) label = 'Outside playoff field';
  } else if (sport === 'NBA') {
    if (seed !== null && seed <= 6) label = 'Playoff position';
    else if (seed !== null && seed <= 10) label = 'Play-In position';
    else if (seed !== null) label = 'Outside playoff field';
  }

  if (!label && row.note) label = row.note;
  if (!label && row.clincher) label = row.clincher;
  if (!label) label = 'Playoff position not listed';

  const detail = [
    seed !== null ? `No. ${seed} seed` : '',
    divisionRank !== null && groupName
      ? `${ordinalStanding(divisionRank)} in ${groupName}`
      : '',
    row.note && row.note !== label ? row.note : ''
  ].filter(Boolean).join(' · ');

  return {
    label,
    detail,
    seed,
    wildCardRank,
    divisionRank,
    note:row.note || row.clincher || ''
  };
}


function nflConferenceCode(groupName) {
  const match = /^(AFC|NFC)\b/i.exec(String(groupName || '').trim());
  return match ? match[1].toUpperCase() : '';
}

function nflConferencePlayoffField(groups,group,teamId) {
  const conference = nflConferenceCode(group?.name);
  if (!conference) return null;

  const entriesByTeam = new Map();

  for (const candidate of groups) {
    if (nflConferenceCode(candidate?.name) !== conference) continue;

    for (const row of (candidate?.entries || [])) {
      if (!row?.id || row.playoffSeed === null) continue;

      const enriched = {
        ...row,
        divisionName:candidate.name || ''
      };

      const existing = entriesByTeam.get(row.id);
      if (
        !existing ||
        Number(enriched.playoffSeed) < Number(existing.playoffSeed)
      ) {
        entriesByTeam.set(row.id,enriched);
      }
    }
  }

  const entries = [...entriesByTeam.values()]
    .sort((left,right) => {
      const a = Number(left.playoffSeed);
      const b = Number(right.playoffSeed);
      if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a - b;
      return left.name.localeCompare(right.name);
    });

  if (!entries.length) return null;

  return {
    name:`${conference} Playoff Picture`,
    conference,
    cutoff:7,
    teamId:String(teamId),
    entries
  };
}


function nhlDivisionKey(name) {
  const value = String(name || '');
  if (/Atlantic/i.test(value)) return 'Atlantic';
  if (/Metropolitan/i.test(value)) return 'Metropolitan';
  if (/Central/i.test(value)) return 'Central';
  if (/Pacific/i.test(value)) return 'Pacific';
  return '';
}

function nhlConferenceForDivision(name) {
  const division = nhlDivisionKey(name);
  if (['Atlantic','Metropolitan'].includes(division)) return 'Eastern';
  if (['Central','Pacific'].includes(division)) return 'Western';
  return '';
}

function nhlNumeric(value) {
  const number = Number(String(value ?? '').replace(/[^0-9.-]/g,''));
  return Number.isFinite(number) ? number : null;
}

function nhlWildCardCompare(left,right) {
  const leftWild = Number(left.wildCardRank);
  const rightWild = Number(right.wildCardRank);

  if (Number.isFinite(leftWild) && Number.isFinite(rightWild) && leftWild !== rightWild) {
    return leftWild - rightWild;
  }

  const leftSeed = Number(left.playoffSeed);
  const rightSeed = Number(right.playoffSeed);

  if (Number.isFinite(leftSeed) && Number.isFinite(rightSeed) && leftSeed !== rightSeed) {
    return leftSeed - rightSeed;
  }

  const leftPoints = nhlNumeric(left.points);
  const rightPoints = nhlNumeric(right.points);

  if (leftPoints !== null && rightPoints !== null && leftPoints !== rightPoints) {
    return rightPoints - leftPoints;
  }

  const leftGames = nhlNumeric(left.gamesPlayed);
  const rightGames = nhlNumeric(right.gamesPlayed);

  if (leftGames !== null && rightGames !== null && leftGames !== rightGames) {
    return leftGames - rightGames;
  }

  return String(left.name || '').localeCompare(String(right.name || ''));
}

function nhlPlayoffField(groups,group,teamId) {
  const conference = nhlConferenceForDivision(group?.name);
  if (!conference) return null;

  const divisions = groups
    .filter(candidate =>
      nhlConferenceForDivision(candidate?.name) === conference &&
      nhlDivisionKey(candidate?.name)
    )
    .map(candidate => ({
      name:candidate.name,
      abbreviation:candidate.abbreviation || '',
      entries:[...(candidate.entries || [])]
        .sort((left,right) => {
          const a = Number(left.rank);
          const b = Number(right.rank);
          if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a - b;
          return String(left.name || '').localeCompare(String(right.name || ''));
        })
        .map(row => ({
          ...row,
          divisionName:candidate.name || '',
          divisionKey:nhlDivisionKey(candidate.name)
        }))
    }));

  if (divisions.length < 2) return null;

  const eligible = divisions
    .flatMap(division =>
      division.entries
        .filter(row => Number(row.rank) > 3)
        .map(row => ({
          ...row,
          divisionName:division.name
        }))
    )
    .sort(nhlWildCardCompare)
    .map((row,index) => ({
      ...row,
      wildCardSlot:index < 2 ? index + 1 : null,
      wildCardOrder:index + 1
    }));

  return {
    type:'nhl',
    name:`${conference} Conference Wild Card`,
    conference,
    divisionCutoff:3,
    wildCardCutoff:2,
    teamId:String(teamId),
    divisions,
    wildCards:eligible
  };
}

export function normalizeTeamStandings(payload,sport,id,season) {
  const teamId = String(id);
  const groups = collectStandingGroups(payload)
    .map(group => ({
      name:group.name,
      abbreviation:group.abbreviation,
      entries:group.entries.map((entry,index) =>
        standingRow(entry,sport,index)
      )
    }))
    .filter(group => group.entries.length);

  const matching = groups
    .filter(group =>
      group.entries.some(entry => entry.id === teamId)
    )
    .sort((left,right) =>
      left.entries.length - right.entries.length
    );

  const group = matching[0] || null;
  const team = group?.entries.find(entry => entry.id === teamId) || null;

  if (!group || !team) {
    return {
      sport,
      season:Number(season) || payload?.season?.year || null,
      teamId,
      available:false,
      group:null,
      team:null,
      playoff:null,
      playoffField:null
    };
  }

  group.entries.sort((left,right) => {
    const a = Number(left.rank);
    const b = Number(right.rank);
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a - b;
    return left.name.localeCompare(right.name);
  });

  return {
    sport,
    season:Number(season) || payload?.season?.year || null,
    teamId,
    available:true,
    group,
    team,
    playoff:playoffPicture(sport,team,group.name),
    playoffField:
      sport === 'NFL'
        ? nflConferencePlayoffField(groups,group,teamId)
        : sport === 'NHL'
          ? nhlPlayoffField(groups,group,teamId)
          : null
  };
}

function normalizeTeamScheduleState(status) {
  const raw =
    String(
      status?.type?.state ||
      status?.state ||
      ''
    ).toLowerCase();

  if (
    raw === 'in' ||
    raw === 'live'
  ) {
    return 'live';
  }

  if (
    raw === 'post' ||
    raw === 'completed' ||
    status?.type?.completed === true
  ) {
    return 'completed';
  }

  return 'upcoming';
}

function scheduleBroadcast(competition,event) {
  const broadcasts = [
    ...(competition?.broadcasts || []),
    ...(event?.broadcasts || [])
  ];

  const names =
    broadcasts.flatMap(item =>
      Array.isArray(item?.names)
        ? item.names
        : item?.name
          ? [item.name]
          : item?.market
            ? [item.market]
            : []
    );

  return [
    ...new Set(
      names.filter(Boolean)
    )
  ].join(', ');
}

export function normalizeTeamSchedule(payload,teamId,sport) {
  const requestedId =
    String(teamId);

  return (payload?.events || [])
    .map(event => {
      const competition =
        event?.competitions?.[0] ||
        {};

      const competitors =
        competition.competitors ||
        [];

      const own =
        competitors.find(item =>
          String(
            item?.team?.id ||
            item?.id ||
            ''
          ) === requestedId
        ) ||
        competitors.find(item =>
          String(
            item?.team?.abbreviation ||
            ''
          ).toLowerCase() ===
          String(
            payload?.team?.abbreviation ||
            ''
          ).toLowerCase()
        );

      const opponent =
        competitors.find(item =>
          item !== own
        );

      const status =
        competition.status ||
        event.status ||
        {};

      const state =
        normalizeTeamScheduleState(
          status
        );

      const ownScore =
        teamScoreValue(
          own?.score
        );

      const opponentScore =
        teamScoreValue(
          opponent?.score
        );

      let result = '';

      if (state === 'completed') {
        if (own?.winner === true) {
          result = 'W';
        } else if (opponent?.winner === true) {
          result = 'L';
        } else {
          const left =
            Number(ownScore);

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
      }

      const date =
        event.date ||
        competition.date ||
        '';

      return {
        id:String(
          event.id ||
          competition.id ||
          ''
        ),
        sport,
        startTime:date,
        state,
        status:
          status?.type?.shortDetail ||
          status?.type?.detail ||
          status?.type?.description ||
          '',
        homeAway:
          own?.homeAway || '',
        opponent:{
          id:String(
            opponent?.team?.id ||
            opponent?.id ||
            ''
          ),
          name:
            opponent?.team?.displayName ||
            opponent?.team?.shortDisplayName ||
            opponent?.team?.name ||
            opponent?.team?.abbreviation ||
            'Opponent',
          abbreviation:
            opponent?.team?.abbreviation ||
            '',
          logo:
            teamLogo(
              opponent?.team
            )
        },
        teamScore:ownScore,
        opponentScore,
        result,
        broadcast:
          scheduleBroadcast(
            competition,
            event
          ),
        week:
          event?.week?.text ||
          event?.week?.displayName ||
          event?.week?.number ||
          competition?.week?.text ||
          competition?.week?.number ||
          '',
        note:
          competition?.notes?.[0]?.headline ||
          event?.notes?.[0]?.headline ||
          '',
        seasonType:
          event?.season?.type ??
          payload?.season?.type ??
          null,
        venue:
          competition?.venue?.fullName ||
          ''
      };
    })
    .filter(item =>
      item.id &&
      item.startTime
    )
    .sort((a,b) =>
      Date.parse(a.startTime) -
      Date.parse(b.startTime)
    );
}

function normalizeLeaderKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g,'');
}

function collectLeaderCategories(value,out=[],depth=0) {
  if (
    !value ||
    depth > 5
  ) {
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach(item =>
      collectLeaderCategories(
        item,
        out,
        depth + 1
      )
    );

    return out;
  }

  if (
    typeof value !== 'object'
  ) {
    return out;
  }

  if (
    Array.isArray(value.leaders) &&
    value.leaders.some(item =>
      item?.athlete ||
      item?.player
    )
  ) {
    out.push(value);
  }

  if (Array.isArray(value.categories)) {
    value.categories.forEach(item =>
      collectLeaderCategories(
        item,
        out,
        depth + 1
      )
    );
  }

  for (const key of [
    'leaders',
    'statistics',
    'items'
  ]) {
    if (
      value[key] &&
      value[key] !== value.categories
    ) {
      collectLeaderCategories(
        value[key],
        out,
        depth + 1
      );
    }
  }

  return out;
}

const TEAM_LEADER_PREFERENCES = {
  NFL:[
    ['passingyards'],
    ['rushingyards'],
    ['receivingyards'],
    ['sacks','defensivesacks']
  ],
  CFB:[
    ['passingyards'],
    ['rushingyards'],
    ['receivingyards'],
    ['sacks','defensivesacks']
  ],
  MLB:[
    ['battingaverage','avg'],
    ['homeruns','hr'],
    ['runsbattedin','rbi'],
    ['strikeouts','pitchingstrikeouts']
  ],
  NHL:[
    ['goals','offensive'],
    ['assists'],
    ['points'],
    ['savepercentage','savepct','svpct']
  ],
  NBA:[
    ['pointspergame','points','ppg'],
    ['reboundspergame','rebounds','rpg'],
    ['assistspergame','assists','apg'],
    ['blockspergame','blocks','bpg']
  ],
  NCAAB:[
    ['pointspergame','points','ppg'],
    ['reboundspergame','rebounds','rpg'],
    ['assistspergame','assists','apg'],
    ['blockspergame','blocks','bpg']
  ],
  Soccer:[
    ['goals'],
    ['assists'],
    ['shotsongoal','shots'],
    ['saves']
  ]
};

function leaderCategoryScore(category,aliases) {
  const fields = [
    category?.name,
    category?.displayName,
    category?.shortDisplayName,
    category?.abbreviation
  ]
    .map(normalizeLeaderKey)
    .filter(Boolean);

  let score = 0;

  for (const alias of aliases) {
    const normalized =
      normalizeLeaderKey(alias);

    if (
      fields.some(value =>
        value === normalized
      )
    ) {
      score = Math.max(
        score,
        100
      );
    }
  }

  return score;
}

function canonicalEspnRef(value) {
  return String(value || '')
    .replace(/^http:/,'https:');
}

function leaderItem(category) {
  return category?.leaders?.[0] || null;
}

function selectTeamLeaderCategories(payload,sport) {
  const categories =
    collectLeaderCategories(
      payload
    );

  const unique = [];
  const seen =
    new Set();

  for (const category of categories) {
    const key =
      normalizeLeaderKey(
        category?.name ||
        category?.displayName
      );

    if (
      !key ||
      seen.has(key) ||
      !leaderItem(category)
    ) {
      continue;
    }

    seen.add(key);
    unique.push(category);
  }

  const selected = [];
  const used =
    new Set();

  for (const aliases of (
    TEAM_LEADER_PREFERENCES[sport] ||
    []
  )) {
    let best = null;
    let bestScore = 0;

    unique.forEach((category,index) => {
      if (used.has(index)) return;

      const score =
        leaderCategoryScore(
          category,
          aliases
        );

      if (score > bestScore) {
        best = {
          category,
          index
        };
        bestScore = score;
      }
    });

    if (best && bestScore > 0) {
      selected.push(best.category);
      used.add(best.index);
    }
  }

  return selected.slice(0,4);
}

function normalizedLeader(category,athletePayloads=new Map()) {
  const item =
    leaderItem(category);

  if (!item) return null;

  const rawAthlete =
    item.athlete ||
    item.player ||
    {};

  const ref =
    canonicalEspnRef(
      rawAthlete?.['$ref'] ||
      rawAthlete?.href ||
      ''
    );

  const resolved =
    ref && athletePayloads.has(ref)
      ? athletePayloads.get(ref)
      : rawAthlete;

  const athlete = {
    ...rawAthlete,
    ...(resolved?.athlete || resolved || {})
  };

  const name =
    athlete.displayName ||
    athlete.fullName ||
    athlete.shortName ||
    item.displayName ||
    '';

  const headshot =
    athlete?.headshot?.href ||
    (
      typeof athlete?.headshot ===
      'string'
        ? athlete.headshot
        : ''
    ) ||
    athlete?.images?.[0]?.href ||
    '';

  const refId =
    ref.match(/\/athletes\/(\d+)/)?.[1] ||
    '';

  // A valid stat and athlete ID survive a transient identity failure. The UI
  // already displays "Team leader" for an empty name; never manufacture one.
  if (!name && !athlete.id && !refId) return null;
  if (item.value == null && item.displayValue == null) return null;

  return {
    category:
      category.displayName ||
      category.shortDisplayName ||
      category.name ||
      'Leader',
    abbreviation:
      category.abbreviation ||
      category.shortDisplayName ||
      '',
    displayValue:
      item.displayValue ??
      item.value ??
      '',
    value:
      item.value ?? null,
    athlete:{
      id:String(
        athlete.id ||
        refId ||
        ''
      ),
      name,
      shortName:
        athlete.shortName ||
        name,
      headshot,
      position:
        athlete?.position?.abbreviation ||
        athlete?.position?.name ||
        ''
    }
  };
}

export function normalizeTeamLeaders(payload,sport,athletePayloads=new Map()) {
  return selectTeamLeaderCategories(
    payload,
    sport
  )
    .map(category =>
      normalizedLeader(
        category,
        athletePayloads
      )
    )
    .filter(Boolean)
    .slice(0,4);
}

async function loadCoreTeamLeaders(env,sport,id,season,now) {
  const profileUrl =
    coreTeamProfileUrl(
      sport,
      id,
      season
    );

  if (!profileUrl) return [];

  const errors = [];
  let profile;

  try {
    profile = (
      await providerJson(
        env,
        profileUrl,
        TEAM_IDENTITY_TTL_MS,
        now,
        errors
      )
    ).payload;
  } catch {
    return [];
  }

  const url =
    canonicalEspnRef(
      profile?.leaders?.['$ref'] ||
      ''
    );

  if (!url) return [];

  let payload;

  try {
    payload = (
      await providerJson(
        env,
        url,
        TEAM_LEADER_TTL_MS,
        now,
        errors
      )
    ).payload;
  } catch {
    return [];
  }

  const categories =
    selectTeamLeaderCategories(
      payload,
      sport
    );

  const refs = [
    ...new Set(
      categories
        .map(category =>
          canonicalEspnRef(
            leaderItem(category)
              ?.athlete?.['$ref'] ||
            leaderItem(category)
              ?.athlete?.href ||
            leaderItem(category)
              ?.player?.['$ref'] ||
            leaderItem(category)
              ?.player?.href ||
            ''
          )
        )
        .filter(Boolean)
    )
  ];

  const athletePayloads =
    new Map();

  const results =
    await Promise.allSettled(
      refs.map(async ref => {
        const resource =
          await providerJson(
            env,
            ref,
            TEAM_IDENTITY_TTL_MS,
            now,
            errors
          );

        return [
          ref,
          resource.payload
        ];
      })
    );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      athletePayloads.set(
        result.value[0],
        result.value[1]
      );
    }
  }

  return normalizeTeamLeaders(
    payload,
    sport,
    athletePayloads
  );
}

async function loadTeamLeaders(env,sport,id,season,now) {
  const core = await loadCoreTeamLeaders(env,sport,id,season,now);
  if (core.length === 4 && core.every(leader => leader.athlete.name)) {
    return core;
  }

  const url = teamLeadersUrl(sport,id,season);
  if (!url) return core;

  try {
    const {payload} = await providerJson(env,url,TEAM_LEADER_TTL_MS,now,[]);
    // Before a season starts ESPN can silently answer with last year's stats.
    if (Number(payload?.requestedSeason?.year) !== Number(season)) return core;

    const categories = collectLeaderCategories(payload).map(category => ({
      ...category,
      leaders:category.leaders.filter(item => String(item?.team?.id) === String(id))
    }));
    const fallback = normalizeTeamLeaders({categories},sport);
    const merged = new Map(fallback.map(leader => [normalizeLeaderKey(leader.category),leader]));
    for (const leader of core) {
      const key = normalizeLeaderKey(leader.category);
      if (leader.athlete.name || !merged.has(key)) merged.set(key,leader);
    }
    // Retain sport-specific ordering even when either source is partial.
    const rank = leader => (TEAM_LEADER_PREFERENCES[sport] || []).findIndex(aliases =>
      leaderCategoryScore({displayName:leader.category,abbreviation:leader.abbreviation},aliases) > 0
    );
    return [...merged.values()].sort((a,b) => rank(a) - rank(b)).slice(0,4);
  } catch {
    return core;
  }
}


export async function teamStandings(env,sport,id,now=Date.now()) {
  const season = inferredTeamSeason(sport,now);
  const url = standingsUrl(sport,season);

  if (!url) return null;

  const key = `team-standings:v1:${sport}:${id}:${season}`;
  const read = () =>
    env.DB.prepare(
      'SELECT payload,updated_at FROM sports_resources WHERE key=?'
    ).bind(key).first();

  const unpack = row => ({
    ...JSON.parse(row.payload),
    sportsRadarFreshness:{
      updatedAt:new Date(row.updated_at).toISOString(),
      receivedAt:new Date(now).toISOString()
    }
  });

  let row = await read();
  if (row && now - row.updated_at < TEAM_STANDINGS_TTL_MS) {
    return unpack(row);
  }

  const owner = await acquire(env,key,now,15000);
  if (!owner) {
    if (row) return unpack(row);
    throw new Error('Team standings refresh in progress');
  }

  try {
    row = await read();
    if (row && now - row.updated_at < TEAM_STANDINGS_TTL_MS) {
      return unpack(row);
    }

    const source = await fetchSourceJson(
      url,
      TEAM_STANDINGS_TTL_MS
    );

    const normalized = normalizeTeamStandings(
      source,
      sport,
      id,
      season
    );

    await env.DB.prepare(
      `INSERT INTO sports_resources (key,payload,updated_at)
       SELECT ?,?,? WHERE EXISTS (
         SELECT 1 FROM sports_leases
         WHERE key=? AND owner=?
       )
       ON CONFLICT(key) DO UPDATE
       SET payload=excluded.payload,
           updated_at=excluded.updated_at
       WHERE excluded.updated_at > sports_resources.updated_at`
    ).bind(
      key,
      JSON.stringify(normalized),
      now,
      key,
      owner
    ).run();

    const stored = await read();
    if (!stored) throw new Error('Team standings cache write lost');
    return unpack(stored);
  } catch (error) {
    if (row) return unpack(row);
    throw error;
  } finally {
    await release(env,key,owner);
  }
}

async function teamStaticData(env,sport,id,now) {
  const urls =
    teamResourceUrls(
      sport,
      id
    );

  if (!urls) {
    return null;
  }

  const key =
    `team-details:v3:${sport}:${id}`;

  const read = () =>
    env.DB.prepare(
      'SELECT payload,updated_at FROM sports_resources WHERE key=?'
    )
      .bind(key)
      .first();

  const unpack = row => ({
    ...JSON.parse(row.payload),
    cachedAt:row.updated_at
  });

  let row =
    await read();

  if (
    row &&
    now - row.updated_at <
      TEAM_STATIC_TTL_MS
  ) {
    return unpack(row);
  }

  const owner =
    await acquire(
      env,
      key,
      now,
      15000
    );

  if (!owner) {
    if (row) {
      return unpack(row);
    }

    throw new Error(
      'Team data refresh in progress'
    );
  }

  try {
    row = await read();

    if (
      row &&
      now - row.updated_at <
        TEAM_STATIC_TTL_MS
    ) {
      return unpack(row);
    }

    const [
      teamResult,
      scheduleResult
    ] =
      await Promise.allSettled([
        fetchSourceJson(
          urls.team,
          TEAM_IDENTITY_TTL_MS
        ),
        fetchSourceJson(
          urls.schedule,
          TEAM_STATIC_TTL_MS
        )
      ]);

    const teamPayload =
      teamResult.status ===
      'fulfilled'
        ? teamResult.value
        : null;

    const schedulePayload =
      scheduleResult.status ===
      'fulfilled'
        ? scheduleResult.value
        : null;


    if (
      !teamPayload &&
      !schedulePayload
    ) {
      throw new Error(
        'No team provider data available'
      );
    }

    const season =
      teamSeasonYear(
        teamPayload,
        schedulePayload,
        sport,
        now
      );

    const leaders =
      await loadTeamLeaders(
        env,
        sport,
        id,
        season,
        now
      );

    const payload = {
      team:normalizeTeamIdentity(
        teamPayload,
        schedulePayload,
        sport,
        id
      ),
      schedule:normalizeTeamSchedule(
        schedulePayload,
        id,
        sport
      ),
      leaders,
      updatedAt:
        new Date(now)
          .toISOString()
    };

    await env.DB.prepare(
      `INSERT INTO sports_resources (key,payload,updated_at)
       SELECT ?,?,? WHERE EXISTS (
         SELECT 1 FROM sports_leases
         WHERE key=? AND owner=?
       )
       ON CONFLICT(key) DO UPDATE
       SET payload=excluded.payload,
           updated_at=excluded.updated_at
       WHERE excluded.updated_at >
             sports_resources.updated_at`
    )
      .bind(
        key,
        JSON.stringify(payload),
        now,
        key,
        owner
      )
      .run();

    const stored =
      await read();

    if (!stored) {
      throw new Error(
        'Team cache write lost'
      );
    }

    return unpack(stored);
  } catch (error) {
    if (row) {
      return unpack(row);
    }

    throw error;
  } finally {
    await release(
      env,
      key,
      owner
    );
  }
}

function teamSpotlightIds(schedule) {
  const now =
    Date.now();

  const completed =
    schedule
      .filter(item =>
        item.state === 'completed' ||
        (
          Date.parse(
            item.startTime
          ) < now &&
          item.state !== 'upcoming'
        )
      )
      .sort((a,b) =>
        Date.parse(b.startTime) -
        Date.parse(a.startTime)
      );

  const live =
    schedule
      .filter(item =>
        item.state === 'live'
      )
      .sort((a,b) =>
        Date.parse(a.startTime) -
        Date.parse(b.startTime)
      );

  const upcoming =
    schedule
      .filter(item =>
        item.state === 'upcoming' &&
        Date.parse(item.startTime) >=
          now - 6 * 60 * 60 * 1000
      )
      .sort((a,b) =>
        Date.parse(a.startTime) -
        Date.parse(b.startTime)
      );

  return {
    last:
      completed[0] || null,
    next:
      live[0] ||
      upcoming[0] ||
      null
  };
}

async function historicalSignal(env,sport,id) {
  if (!id) return null;

  const row =
    await env.DB.prepare(
      `SELECT rating
       FROM sports_snapshots
       WHERE game_key=?
         AND state='completed'
       ORDER BY observed_at DESC
       LIMIT 1`
    )
      .bind(
        `${sport}:${id}`
      )
      .first()
      .catch(() => null);

  return Number.isFinite(
    Number(row?.rating)
  )
    ? Number(row.rating)
    : null;
}

export async function teamDetails(env,sport,id,now=Date.now()) {
  const staticData =
    await teamStaticData(
      env,
      sport,
      id,
      now
    );

  if (!staticData) {
    return null;
  }

  const feed =
    await readFeed(
      env,
      now
    ).catch(() => null);

  const spotlights =
    teamSpotlightIds(
      staticData.schedule || []
    );

  const canonicalSignal = row => {
    if (!row) return null;

    const game =
      feed?.games?.find(item =>
        item.sport === sport &&
        String(item.id) ===
          String(row.id)
      );

    return Number.isFinite(
      Number(game?.score)
    )
      ? Number(game.score)
      : null;
  };

  let lastSignal =
    canonicalSignal(
      spotlights.last
    );

  if (
    lastSignal === null &&
    spotlights.last
  ) {
    lastSignal =
      await historicalSignal(
        env,
        sport,
        spotlights.last.id
      );
  }

  const nextSignal =
    canonicalSignal(
      spotlights.next
    );

  return {
    team:staticData.team,
    schedule:staticData.schedule,
    leaders:staticData.leaders,
    spotlights:{
      last:
        spotlights.last
          ? {
              gameId:
                spotlights.last.id,
              signal:lastSignal
            }
          : null,
      next:
        spotlights.next
          ? {
              gameId:
                spotlights.next.id,
              signal:nextSignal
            }
          : null
    },
    sportsRadarFreshness:{
      teamUpdatedAt:
        new Date(
          staticData.cachedAt
        ).toISOString(),
      canonicalUpdatedAt:
        feed?.updatedAt ||
        null,
      receivedAt:
        new Date(now)
          .toISOString()
    }
  };
}


export async function gameDetails(env,sport,id,now=Date.now()) {
  // A notification/bookmark can outlive the scoreboard. Stored game identities
  // remain eligible for details; unknown IDs still cannot proxy upstream calls.
  const feed = await readFeed(env,now);
  let game = feed?.games.find(game => game.sport === sport && String(game.id) === id);
  const archived=!game;
  if (!game) {
    const snapshot=await env.DB.prepare('SELECT normalized_state FROM sports_snapshots WHERE game_key=? ORDER BY observed_at DESC LIMIT 1').bind(`${sport}:${id}`).first();
    if (snapshot) {
      const stored=JSON.parse(snapshot.normalized_state);
      if (stored.sport===sport && String(stored.id)===id && stored.teams?.length===2) game=stored;
    }
  }
  if (!game) return null;
  const errors = [];
  const url = summaryUrl(game);
  let resource;
  try { resource=await providerJson(env,url,game.state==='live' ? LIVE_REFRESH_MS : 55000,now,errors); }
  catch (error) {
    if (!archived) throw error;
    return {sportsRadarGame:game,sportsRadarArchived:true,sportsRadarFreshness:{stale:true,updatedAt:null,receivedAt:new Date(now).toISOString()}};
  }
  const summary = resource.payload;
  if (archived && summary.header?.competitions?.[0]?.competitors?.length===2) {
    const event={...game.sourceEvent,id,season:summary.header.season || game.sourceEvent?.season,competitions:summary.header.competitions};
    const current=normalizeEvent(event,sport);
    if (current) {
      preservePregameRecords(current,game);current.providerPath=game.providerPath;enrichGame(current,summary,game);
      for(const team of current.teams) {
        const identity=summary.header.competitions[0].competitors.find(item=>String(item.team?.id)===String(team[8]))?.team;
        team[4]=identity?.logo || identity?.logos?.find(logo=>logo.rel?.includes('default'))?.href || identity?.logos?.[0]?.href || game.teams.find(item=>String(item[8])===String(team[8]))?.[4] || team[4];
      }
      if(current.channel==='Channel not listed')current.channel=summary.header.competitions[0].broadcasts?.map(item=>item.media?.shortName || item.media?.name).filter(Boolean).join(' · ') || game.channel || current.channel;
      current.sub=summary.header.competitions[0].venue?.fullName || summary.gameInfo?.venue?.fullName || game.sub || current.sub;
      current.division=game.division;game=current;
    }
  }
  let nhlAdvanced=null;
  if (sport==='NHL') {
    const detailBudget=refreshBudget(now,{deadlineMs:2500});
    try {
      nhlAdvanced=await nhlGameCenterStats(game,summary,async (source,ttl)=>{
        const sourceErrors=[];
        const result=await providerJson(env,source,ttl,now,sourceErrors,detailBudget);
        return {...result,stale:sourceErrors.length>0 || now-result.updatedAt>ttl};
      });
    } finally {detailBudget.close();}
  }
  return {...summary,...(nhlAdvanced ? {nhlAdvanced} : {}),...(['NBA','NCAAB'].includes(sport) ? {basketballBoxScore:basketballBoxScore(summary,sport)} : {}),
    sportsRadarGame:{...game,scoreboard:undefined},sportsRadarArchived:archived,
    sportsRadarFreshness:{updatedAt:new Date(resource.updatedAt).toISOString(),canonicalUpdatedAt:feed?.updatedAt || null,canonicalRevision:feed?.revision || Date.parse(feed?.updatedAt) || null,receivedAt:new Date(now).toISOString(),stale:errors.length>0 || now-resource.updatedAt>STALE_MS}};
}

// Owner-qualified revisions keep a late producer's parts separate, even when
// two attempts have the same millisecond start. SQLite's existing non-STRICT
// INTEGER-affinity revision column also accepts these text keys (no migration).
export async function publishFeed(env,feed,owner,at,stage=async(name,fn)=>fn()) {
  const revision = `${Date.parse(feed.updatedAt)}:${owner}`;
  const parts=[];
  await stage('feedWrites',async()=>{
    for (let start=0;start<feed.games.length;start+=50) parts.push(env.DB.prepare(
      'INSERT OR IGNORE INTO sports_feed_parts (revision,part,payload) VALUES (?,?,?)')
      .bind(revision,parts.length,JSON.stringify(feed.games.slice(start,start+50))));
    for (let start=0;start<parts.length;start+=50) await env.DB.batch(parts.slice(start,start+50));
  });
  const header = JSON.stringify({...feed,games:undefined,revision,parts:parts.length});
  const result = await stage('publication',()=>env.DB.prepare(`INSERT INTO sports_feed (id,payload)
    SELECT 1,? WHERE EXISTS (SELECT 1 FROM sports_leases WHERE key='refresh' AND owner=? AND expires_at>?
      AND expires_at>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload
    WHERE json_extract(excluded.payload,'$.updatedAt') > json_extract(sports_feed.payload,'$.updatedAt')`)
    .bind(header,owner,at()).run());
  return result.meta?.changes ? {...feed,revision,parts:parts.length} : null;
}

export async function requestFeedRefresh(env,previous,ctx,options={}) {
  let published;
  const publication = new Promise(resolve=>{published=resolve;});
  const work = refreshSportsData(env,Date.now(),{...options,trigger:'feed',onPublished:published});
  ctx?.waitUntil(work);
  const result = await boundedFeedRefresh(Promise.race([work,publication]),previous,null,options.waitMs);
  const feed=withFreshness(result || previous);
  (options.log || (entry=>console.log(JSON.stringify(entry))))({event:'canonical_feed_response',
    reused:!feed || feed.updatedAt===previous?.updatedAt,stale:feed?.freshness.stale ?? true,
    ageMs:feed?.freshness.ageMs ?? null});
  return feed;
}

export async function refreshSportsData(env,now=Date.now(),options={}) {
  const budget = refreshBudget(now,options);
  const metrics = {event:'canonical_refresh',trigger:options.trigger || 'direct',startedAt:new Date(now).toISOString(),
    outcome:'failed',lease:'pending',published:false,reusedPublication:false,
    candidates:0,liveCandidates:0,criticalCandidates:0,reusedGames:0,cachedEnrichments:0,cachedSummaryReads:0,
    deferredCandidates:0,revalidated:0,providerFailures:0,
    stages:{collection:0,recordRecovery:0,contexts:0,summary:0,snapshots:0,feedWrites:0,publication:0,cleanup:0,maintenance:0}};
  const stage = async (name,fn) => {
    budget.check();
    const start=budget.elapsed();
    try { return await fn(); } finally { metrics.stages[name]+=budget.elapsed()-start; }
  };
  let owner,resources,committed=null,released=false;
  const errors=[];
  try {
    const acquisitionStart=budget.elapsed();
    owner = await acquire(env,'refresh',now,REFRESH_LEASE_MS);
    metrics.leaseAcquisitionMs=budget.elapsed()-acquisitionStart;
    if (!owner) {metrics.lease='lost';metrics.outcome='contended';metrics.reusedPublication=true;return null;}
    metrics.lease='acquired';metrics.owner=owner;
    const previous = await readFeed(env,now);
    if (previous && !refreshDue(previous,now)) {metrics.outcome='not_due';metrics.reusedPublication=true;return previous;}
    resources = await stage('collection',()=>refreshReader(env,now,budget));
    const liveSports = new Set((previous?.games || []).filter(game=>game.state==='live').map(game=>game.sport));
    const readJson = (url,{purpose}={}) => {
      const parsed = new URL(url);
      const dates = parsed.searchParams.get('dates');
      const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).replaceAll('-','');
      const path = parsed.pathname;
      const sport = path.includes('/football/nfl/') ? 'NFL' : path.includes('/baseball/mlb/') ? 'MLB' : path.includes('/hockey/nhl/') ? 'NHL' : path.includes('/football/college-football/') ? 'CFB' : path.includes('/basketball/nba/') ? 'NBA' : path.includes('/basketball/mens-college-basketball/') ? 'NCAAB' : path.includes('/soccer/') ? 'Soccer' : path.includes('/tennis/') ? 'Tennis' : '';
      const futureSchedule = dates?.length === 8 && dates > today;
      const liveScoreboard = path.endsWith('/scoreboard') && liveSports.has(sport);
      const weekKey = Number(dates)*1000 + Number(parsed.searchParams.get('seasontype'))*100 + Number(parsed.searchParams.get('week'));
      const adjacentLive = purpose==='adjacent-schedule' && (previous?.games || []).some(game=>game.sport==='NFL' && game.state==='live' && game.nflWeek===weekKey);
      const ttl = (futureSchedule || (purpose==='adjacent-schedule' && !adjacentLive)) ? 900000 : liveScoreboard ? LIVE_REFRESH_MS : 55000;
      return resources.read(url,ttl,errors);
    };
    const games = await stage('collection',async()=>{
      const collected=await createCollector(readJson)();
      await resources.flush();
      return collected;
    });
    // Do not publish a partial/failed scoreboard refresh as a fresh feed.
    if (errors.length) return null;
    const priorGames = new Map((previous?.games || []).map(game=>[`${game.sport}:${game.id}`,game]));
    games.forEach(game=>preservePregameRecords(game,priorGames.get(`${game.sport}:${game.id}`)));
    await stage('recordRecovery',()=>recoverPregameRecords(env,games,now,previous));
    const contextGames = games.filter(game=>['NFL','MLB','NHL','CFB','NBA','NCAAB'].includes(game.sport));
    const contexts = await stage('contexts',()=>contextsForGames(env,contextGames.map(game=>`${game.sport}:${game.id}`)));
    contextGames.forEach(game=>applyContextsToGame(game,contexts[`${game.sport}:${game.id}`]));

    const candidates = games.filter(summaryCandidate);
    metrics.candidates=candidates.length;
    metrics.liveCandidates=candidates.filter(game=>game.state==='live').length;
    const scoreboardStates = new Map(candidates.map(game=>[game,JSON.parse(JSON.stringify(game))]));
    const reusedGames = new Set(), enrichment={}, deferred=[],critical=[];
    const copyPrior = (game,prior) => {
      // Input fingerprint includes all source and normalized/context fields. This
      // is never used for live games or a transition; no ID-only reuse.
      Object.assign(game,JSON.parse(JSON.stringify(prior)));
      reusedGames.add(game);metrics.reusedGames++;
    };
    const acquireCritical=async entries=>{
      for (let start=0;start<entries.length;start+=6) {
        budget.check();
        await Promise.all(entries.slice(start,start+6).map(async ({game,key,input,url,prior})=>{
          const detailErrors=[];
          try {
            const resource=await providerJson(env,url,game.state==='live'?LIVE_REFRESH_MS:55000,now,detailErrors,budget);
            budget.check();
            enrichGame(game,resource.payload,prior);
            game.detailStale=detailErrors.length>0;
            // Failed acquisitions are retried, not certified as reusable inputs.
            if (!detailErrors.length) enrichment[key]={input,model:MODEL_VERSION,
              summaryHash:await fingerprint(resource.payload),summaryVersion:resource.updatedAt};
          } catch { game.detailStale=true;detailErrors.push(url); }
          errors.push(...detailErrors);
        }));
      }
    };
    await stage('summary',async()=>{
      const live=[];
      for (const game of candidates.filter(game=>game.state==='live')) {
        const key=`${game.sport}:${game.id}`;
        live.push({game,key,input:await fingerprint({game,source:game.sourceEvent,model:MODEL_VERSION}),url:summaryUrl(game),prior:priorGames.get(key)});
      }
      metrics.criticalCandidates=live.length;
      await acquireCritical(live);
      const nonlive=candidates.filter(game=>game.state!=='live').sort((a,b)=>(a.state==='completed'?0:1)-(b.state==='completed'?0:1));
      // Resource versions can advance during maintenance without changing their
      // content. Bound concurrency, but do not serialize every D1 payload read.
      for (let start=0;start<nonlive.length;start+=6) {
        const results=await Promise.allSettled(nonlive.slice(start,start+6).map(async game=>{
          budget.check();
          const key=`${game.sport}:${game.id}`, prior=priorGames.get(key), meta=previous?.enrichment?.[key];
          const input=await fingerprint({game,source:game.sourceEvent,model:MODEL_VERSION});
          const url=summaryUrl(game);
          if (!reusable(game,prior,meta,input,MODEL_VERSION)) {
            critical.push({game,key,input,url,prior});return;
          }
          const version=resources.dates.get(url);
          if (version===meta.summaryVersion) {
            copyPrior(game,prior);enrichment[key]=meta;
          } else {
            metrics.cachedSummaryReads++;
            const cached=await resources.cached(url);
            if (!cached) {critical.push({game,key,input,url,prior});return;}
            const summaryHash=await fingerprint(cached.payload);
            if (summaryHash===meta.summaryHash) copyPrior(game,prior);
            else {enrichGame(game,cached.payload,prior);metrics.cachedEnrichments++;}
            game.detailStale=false;
            enrichment[key]={input,model:MODEL_VERSION,summaryHash,summaryVersion:cached.updatedAt};
          }
          // Keep the existing nonlive 55s resource eligibility. Revalidation does
          // not gate publication when all currently known rating inputs match.
          if (!version || now-version>=55000) deferred.push({url,version:version || 0});
          // A failed/deadline-limited maintenance pass must not make old rich
          // data look newly acquired just because the scoreboard was published.
          game.detailStale=!version || now-version>STALE_MS;
          if (game.detailStale) errors.push(url);
        }));
        const failure=results.find(result=>result.status==='rejected');
        if (failure) throw failure.reason;
      }
      critical.sort((a,b)=>(a.game.state==='completed'?0:1)-(b.game.state==='completed'?0:1));
      metrics.criticalCandidates+=critical.length;
      await acquireCritical(critical);
    });
    games.forEach(game=>{
      const prior = priorGames.get(`${game.sport}:${game.id}`);
      if (!game.line && prior?.line) game.line = prior.line;
      if (scoreboardStates.has(game) && !reusedGames.has(game)) {
        const scoreboard = scoreboardStates.get(game);
        // The browser deliberately renders this pre-enrichment snapshot to keep
        // rating inputs stable; carry refreshed additive situation fields over.
        if (['NFL','CFB'].includes(game.sport)) scoreboard.footballSituation = game.footballSituation || null;
        if (game.sport === 'MLB') {
          scoreboard.baseballSituation = game.baseballSituation || scoreboard.baseballSituation || null;
          game.baseballSituation = scoreboard.baseballSituation;
        }
        game.scoreboard = scoreboard;
      }
    });

    metrics.deferredCandidates=deferred.length;
    const feed = {version:1,modelVersion:MODEL_VERSION,scoringPolicy:runtime.POLICY_ID,updatedAt:new Date(now).toISOString(),source:'ESPN',sourceErrors:[...errors],games,enrichment};
    // History remains before publication: future NFL record recovery and audit
    // ordering depend on it. Do not let concurrent maintenance reorder snapshots.
    await stage('snapshots',async()=>{
      const history=await snapshotHistory(env,games,now);
      budget.check();
      const writes=games.filter(game=>shouldSnapshot(game,history,now,MODEL_VERSION)).map(game=>env.DB.prepare(`INSERT OR IGNORE INTO sports_snapshots
        (game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state,model_version)
        SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM sports_leases WHERE key='refresh' AND owner=? AND expires_at>?
      AND expires_at>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))`)
        .bind(`${game.sport}:${game.id}`,game.state==='completed'?now:Math.floor(now/(game.state==='live'?15000:60000))*(game.state==='live'?15000:60000),
          game.sport,game.state,game.score,String(game.teams[0][2]),String(game.teams[1][2]),String(game.liveRawStatus?.period ?? ''),String(game.liveRawStatus?.displayClock || ''),JSON.stringify({...game,scoreboard:undefined}),MODEL_VERSION,owner,budget.time()));
      for(let start=0;start<writes.length;start+=50){budget.check();await env.DB.batch(writes.slice(start,start+50));}
    });
    committed=await publishFeed(env,feed,owner,()=>{budget.check();return budget.time();},stage);
    if (!committed) {metrics.lease='fenced';metrics.outcome='fenced';return null;}
    metrics.published=true;metrics.outcome='published';metrics.publicationMs=budget.elapsed();
    options.onPublished?.(withFreshness(committed,budget.time()));
    // No network maintenance holds the canonical lease. Per-resource ownership
    // still coordinates detail and canonical callers during revalidation.
    await release(env,'refresh',owner);released=true;
    await stage('cleanup',async()=>{
      await env.DB.prepare('DELETE FROM sports_feed_parts WHERE CAST(revision AS INTEGER) < ?').bind(now-600000).run();
      await env.DB.prepare('DELETE FROM sports_snapshots WHERE observed_at < ?').bind(now-RETENTION_MS).run();
      await env.DB.prepare('DELETE FROM sports_resources WHERE updated_at < ?').bind(now-7*86400000).run();
      await env.DB.prepare('DELETE FROM sports_leases WHERE expires_at < ?').bind(now).run();
    });
    if (deferred.length) await stage('maintenance',async()=>{
      // One opportunistic sweep across isolates; oldest resource first ensures
      // deadline-limited sweeps make progress without a fixed game-count cap.
      const maintenanceOwner=await acquire(env,'summary-maintenance',budget.time(),REFRESH_LEASE_MS);
      if (!maintenanceOwner) return;
      try {
        deferred.sort((a,b)=>a.version-b.version || a.url.localeCompare(b.url));
        for(let start=0;start<deferred.length;start+=6){
          budget.check();
          await Promise.all(deferred.slice(start,start+6).map(async ({url})=>{
            const failures=[];
            try {
              await providerJson(env,url,55000,budget.time(),failures,budget);
              if (!failures.length) metrics.revalidated++;
            } catch {failures.push(url);}
            errors.push(...failures);
          }));
        }
      } finally {await release(env,'summary-maintenance',maintenanceOwner);}
    });
    return withFreshness(committed,budget.time());
  } catch(error) {
    metrics.outcome=committed?'published_maintenance_incomplete':'failed';
    metrics.reason=budget.signal.aborted || String(error).includes('Refresh deadline')?'deadline':'refresh_error';
    return committed ? withFreshness(committed,budget.time()) : null;
  } finally {
    budget.close();
    // A scoreboard Promise.all may reject before sibling fetches settle. Abort
    // and drain them while still owned by waitUntil, rather than orphaning work.
    await resources?.settle();
    if (owner && !released) await release(env,'refresh',owner).catch(()=>{metrics.lease='release_failed';});
    metrics.reusedPublication ||= !metrics.published;
    metrics.degradedResources=new Set(errors).size;
    Object.assign(metrics,budget.stats);
    metrics.totalMs=budget.elapsed();
    (options.log || (entry=>console.log(JSON.stringify(entry))))(metrics);
  }
}

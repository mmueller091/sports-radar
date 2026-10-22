import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..');
export const fixtureDir = path.join(repoRoot, 'test', 'fixtures', 'real-games');
export const expectationsPath = path.join(repoRoot, 'calibration', 'expectations.json');
export const contextOverridesPath = path.join(repoRoot, 'calibration', 'context-overrides.json');

export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (fallback !== null) return fallback;
    throw error;
  }
}

export async function loadCore() {
  const configured = process.env.RATING_CORE_PATH;
  const corePath = configured
    ? path.resolve(configured)
    : path.join(repoRoot, 'rating-core.js');

  if (!fs.existsSync(corePath)) {
    throw new Error(`rating-core.js not found at ${corePath}. Set RATING_CORE_PATH if it lives elsewhere.`);
  }

  delete globalThis.SportsRadarScore;
  await import(`${pathToFileURL(corePath).href}?calibration=${Date.now()}`);
  if (!globalThis.SportsRadarScore) throw new Error('rating-core.js loaded but did not create globalThis.SportsRadarScore.');
  return globalThis.SportsRadarScore;
}

export function stateFromCompetition(competition) {
  const name = String(competition?.status?.type?.name || '').toLowerCase();
  const state = String(competition?.status?.type?.state || '').toLowerCase();
  if (state === 'pre' || /scheduled|pre/.test(name)) return 'upcoming';
  if (state === 'post' || /final|postponed|canceled|cancelled/.test(name)) return 'completed';
  return 'live';
}

export function recordSummary(competitor) {
  const records = competitor?.records || competitor?.team?.records || [];
  return records.find(r => /overall|total/i.test(`${r.type || ''} ${r.name || ''}`))?.summary || records[0]?.summary || '';
}

export function teamArray(competitor, modelSport, core) {
  const team = competitor?.team || competitor?.athlete || {};
  const name = team.displayName || team.name || competitor?.displayName || 'Team';
  const abbr = team.abbreviation || competitor?.abbreviation || name.slice(0, 3).toUpperCase();
  const score = competitor?.score ?? '0';
  const record = recordSummary(competitor);
  const rank = core.rankFor ? core.rankFor(competitor, modelSport) : null;
  const id = String(team.id || competitor?.id || '');
  const arr = [name, abbr, score, '', team.logo || '', record, rank, competitor?.homeAway || '', id];
  arr.score = score;
  arr.id = id;
  return arr;
}

export function mergeCompetition(eventCompetition, summaryCompetition) {
  if (!summaryCompetition) return eventCompetition || {};
  if (!eventCompetition) return summaryCompetition;
  return {
    ...eventCompetition,
    ...summaryCompetition,
    odds: summaryCompetition.odds?.length ? summaryCompetition.odds : eventCompetition.odds,
    competitors: summaryCompetition.competitors?.length ? summaryCompetition.competitors : eventCompetition.competitors,
    status: summaryCompetition.status || eventCompetition.status,
    situation: summaryCompetition.situation || eventCompetition.situation,
    notes: [...(eventCompetition.notes || []), ...(summaryCompetition.notes || [])]
  };
}

export function applyContextOverride(event, competition, eventId, overrides) {
  const override = overrides?.events?.[String(eventId)];
  if (!override) return { event, competition, appliedContext: [] };
  const factors = Array.isArray(override.factors) ? override.factors : [];
  return {
    event: { ...event, sportsRadarContextFactors: factors },
    competition: { ...competition, sportsRadarContextFactors: factors },
    appliedContext: factors
  };
}

export function scoreFixture(fixture, core, overrides = {events:{}}) {
  const event = fixture.event || {};
  const summary = fixture.summary || {};
  const eventCompetition = event.competitions?.[0] || {};
  const summaryCompetition = summary?.header?.competitions?.[0] || null;
  let competition = mergeCompetition(eventCompetition, summaryCompetition);
  const eventId = String(fixture.eventId || event.id || competition.id || '');
  const injected = applyContextOverride(event, competition, eventId, overrides);
  competition = injected.competition;
  const eventWithContext = injected.event;
  const state = stateFromCompetition(competition);
  const teams = (competition.competitors || eventCompetition.competitors || []).map(c => teamArray(c, fixture.modelSport, core));

  if (teams.length !== 2) {
    return { eventId, modelSport: fixture.modelSport, state, error: `Expected 2 competitors, found ${teams.length}` };
  }

  const base = core.rateGame(fixture.modelSport, state, teams, eventWithContext, competition, '');
  const game = {
    id: eventId,
    sport: fixture.modelSport,
    state,
    teams,
    baseScore: base.score,
    score: base.score,
    factors: [...(base.factors || [])],
    openingScore: base.openingScore ?? (state === 'upcoming' ? base.score : undefined),
    underdog: base.underdog,
    upsetText: base.upsetText || '',
    upsetPoints: base.upsetPoints || 0,
    liveRawStatus: competition.status,
    liveRawSituation: competition.situation
  };

  if (state === 'live' && core.applyLiveSnapshot) {
    core.applyLiveSnapshot(game, competition, summary);
  }

  const progress = state === 'completed' ? 1 : core.gameProgress(fixture.modelSport, competition);
  const momentum = state === 'upcoming'
    ? { points:0, factors:[], text:'' }
    : core.momentumImpact(fixture.modelSport, summary, progress, state);

  if (momentum.points) {
    game.score = core.clampScore(game.score + momentum.points);
    game.factors.push(...(momentum.factors || []));
  }

  // Mirror the current app.js final-play bonus so the report can approximate end-to-end UI scoring.
  let decisiveLastPlay = 0;
  if (state === 'completed') {
    const plays = summary?.scoringPlays?.length ? summary.scoringPlays : (summary?.plays || []).filter(p => p.scoringPlay === true);
    const last = plays.at(-1);
    const text = `${last?.clock?.displayValue || ''} ${last?.text || last?.shortText || last?.type?.text || ''}`;
    if (/(0:00|last second|game[- ]winning)/i.test(text) && /field goal|goal|home run|touchdown/i.test(text)) {
      decisiveLastPlay = 14;
      game.score = core.clampScore(game.score + decisiveLastPlay);
    }
  }

  const names = teams.map(t => t[0]);
  const scores = teams.map(t => Number(t[2]));
  const gap = scores.every(Number.isFinite) ? Math.abs(scores[0] - scores[1]) : null;
  const winSeries = core.winProbabilitySeries ? core.winProbabilitySeries(summary) : [];
  const finalWp = winSeries.length ? winSeries.at(-1) : null;
  const maxWpSwing = winSeries.length > 1
    ? winSeries.slice(1).reduce((best, value, i) => Math.max(best, Math.abs(value - winSeries[i])), 0)
    : 0;

  return {
    eventId,
    modelSport: fixture.modelSport,
    date: fixture.date,
    state,
    matchup: names.join(' vs '),
    scoreLine: `${scores[0]}-${scores[1]}`,
    gap,
    openingScore: base.openingScore ?? (state === 'upcoming' ? base.score : null),
    baseScore: base.score,
    liveBonus: game.live?.bonus || 0,
    momentumPoints: momentum.points || 0,
    decisiveLastPlay,
    finalScore: game.score,
    factors: game.factors,
    momentumText: momentum.text || '',
    finalWp,
    maxConsecutiveWpSwing: maxWpSwing,
    appliedContext: injected.appliedContext,
    raw: { event: eventWithContext, competition, summary }
  };
}

export function listFixtureFiles() {
  if (!fs.existsSync(fixtureDir)) return [];
  return fs.readdirSync(fixtureDir)
    .filter(name => name.endsWith('.json'))
    .map(name => path.join(fixtureDir, name))
    .sort();
}

export function loadFixtures() {
  return listFixtureFiles().map(file => readJson(file));
}

export function expectationFor(expectations, eventId) {
  return expectations?.events?.[String(eventId)] || null;
}

export function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

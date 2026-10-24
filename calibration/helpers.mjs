import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/game-model.js';

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
  vm.runInThisContext(fs.readFileSync(corePath,'utf8'),{filename:corePath});
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
  const eventId = String(fixture.eventId || event.id || eventCompetition.id || '');
  const injected = applyContextOverride(event,eventCompetition,eventId,overrides);
  const eventWithContext = {...injected.event,competitions:[injected.competition]};
  const game = normalizeEvent(eventWithContext,fixture.modelSport);
  if (!game) return {eventId,modelSport:fixture.modelSport,error:'Expected 2 competitors'};
  enrichGame(game,summary);
  const state = game.state;
  const teams = game.teams;
  const momentum = {points:game.momentumPoints || 0,text:game.momentumText || ''};
  const decisiveLastPlay = game.factors.some(factor=>factor.label === 'Decisive last play') ? 14 : 0;

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
    openingScore: game.openingScore,
    baseScore: game.baseScore,
    liveBonus: game.live?.bonus || 0,
    momentumPoints: momentum.points || 0,
    decisiveLastPlay,
    finalScore: game.score,
    factors: game.factors,
    components:game.live?.components || null,
    momentumText: momentum.text || '',
    finalWp,
    maxConsecutiveWpSwing: maxWpSwing,
    appliedContext: injected.appliedContext,
    raw: { event: eventWithContext, competition:eventCompetition, summary }
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

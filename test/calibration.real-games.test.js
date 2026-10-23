import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, loadFixtures, readJson, expectationsPath, contextOverridesPath, scoreFixture, expectationFor } from '../calibration/helpers.mjs';

const core = await loadCore();
const fixtures = loadFixtures();
const expectations = readJson(expectationsPath, {events:{}, comparisons:[]});
const overrides = readJson(contextOverridesPath, {events:{}});
const results = new Map(fixtures.map(f => {
  const result = scoreFixture(f, core, overrides);
  return [String(result.eventId), result];
}));

if (!fixtures.length) {
  test('real-game fixtures are available', {skip:'Run node scripts/capture-calibration-fixtures.mjs first'}, () => {});
} else {
  test('every captured real game produces a valid 1-99 score', () => {
    for (const result of results.values()) {
      assert.equal(result.error, undefined, `${result.eventId}: ${result.error}`);
      assert.ok(Number.isInteger(result.finalScore), `${result.eventId}: score should be an integer`);
      assert.ok(result.finalScore >= 1 && result.finalScore <= 99, `${result.eventId}: score=${result.finalScore}`);
      assert.ok(Array.isArray(result.factors), `${result.eventId}: factors missing`);
    }
  });

  test('annotated real games stay inside their expected score ranges', () => {
    let checked = 0;
    for (const [eventId, result] of results) {
      const exp = expectationFor(expectations, eventId);
      if (!exp) continue;
      const min = Number(exp.min);
      const max = Number(exp.max);
      if (Number.isFinite(min)) {
        assert.ok(result.finalScore >= min, `${eventId} ${result.matchup}: ${result.finalScore} < expected min ${min}`);
        checked++;
      }
      if (Number.isFinite(max)) {
        assert.ok(result.finalScore <= max, `${eventId} ${result.matchup}: ${result.finalScore} > expected max ${max}`);
        checked++;
      }
    }
    if (!checked) console.warn('No min/max expectations annotated yet. Add them to calibration/expectations.json.');
  });

  test('annotated pairwise rankings are correct', () => {
    let checked = 0;
    for (const comparison of expectations.comparisons || []) {
      const higher = results.get(String(comparison.higher));
      const lower = results.get(String(comparison.lower));
      if (!higher || !lower) continue;
      const gap = Number(comparison.minGap || 1);
      assert.ok(higher.finalScore >= lower.finalScore + gap,
        `${comparison.higher} (${higher.finalScore}) should outrank ${comparison.lower} (${lower.finalScore}) by >= ${gap}`);
      checked++;
    }
    if (!checked) console.warn('No pairwise comparisons annotated yet. Add them to calibration/expectations.json.');
  });

  test('human-scored games have reasonable aggregate error', () => {
    const annotated = [...results.values()].filter(r => Number.isFinite(Number(expectationFor(expectations, r.eventId)?.humanScore)));
    if (annotated.length < 5) {
      console.warn('Need at least 5 humanScore annotations before MAE/bias is meaningful.');
      return;
    }
    const errors = annotated.map(r => r.finalScore - Number(expectationFor(expectations, r.eventId).humanScore));
    const mae = errors.reduce((s,e) => s + Math.abs(e), 0) / errors.length;
    const bias = errors.reduce((s,e) => s + e, 0) / errors.length;
    assert.ok(mae <= 12, `MAE ${mae.toFixed(2)} is above 12 points`);
    assert.ok(Math.abs(bias) <= 8, `overall bias ${bias.toFixed(2)} is outside ±8 points`);
  });
}

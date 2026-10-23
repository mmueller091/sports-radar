# Sports Radar calibration test pack

This pack is designed to test the current `rating-core.js` with both controlled scenarios and real ESPN games. It uses only Node's built-in modules.

## Where to put it

Copy these folders/files into the Sports Radar repository root:

- `calibration/`
- `scripts/capture-calibration-fixtures.mjs`
- `scripts/calibration-report.mjs`
- `test/calibration.behavior.test.js`
- `test/calibration.real-games.test.js`

Do **not** replace `rating-core.js`. The tests intentionally load the repository's current file.

## 1. Run the behavioral tests first

```bash
node --test test/calibration.behavior.test.js
```

These test relationships rather than brittle exact scores:

- late 50/50 win probability > late 97/3
- pregame context decays as intended
- late NFL 4th-and-goal > early ordinary fourth down
- bottom-9 runner on third > bottom-9 bases empty
- NHL pulled goalie is recognized
- NBA final possession > same margin with minutes left
- tennis match point > ordinary deuce
- momentum caps remain intact

A failure should be investigated. Do not simply change the assertion to match the model.

## 2. Capture real games

```bash
node scripts/capture-calibration-fixtures.mjs
```

The default slate list is in `calibration/slates.json`. It includes recent/representative NFL, CFB, MLB, NHL, NBA, NCAAB and tennis dates. The capture script discovers the real event IDs from ESPN and stores the raw scoreboard event plus summary response in `test/fixtures/real-games/`.

Useful filters:

```bash
node scripts/capture-calibration-fixtures.mjs --sport NFL --date 20261011
node scripts/capture-calibration-fixtures.mjs --sport NHL --date 20261020 --overwrite
```

If an ESPN sport/date endpoint has no games or does not expose summaries, the script warns and continues.

## 3. Generate the calibration report

```bash
node scripts/calibration-report.mjs
```

For every captured game it shows:

- model score
- matchup and final score
- base rating
- live-summary bonus
- momentum contribution
- optional human score/error

It also reports the distribution by sport, including the percentage of games at 70+, 80+ and 90+, and writes `calibration/output/latest.csv`.

Look for systematic problems, not one weird game. Examples:

- NHL average much higher than NFL for ordinary games
- too many 90+ games
- blowouts regularly reaching 70+
- close MLB games systematically too low
- elite pregame matchups staying too high after becoming blowouts

## 4. Add human judgments

After viewing the actual games, add ranges and/or human scores to `calibration/expectations.json`:

```json
{
  "events": {
    "REAL_ESPN_EVENT_ID": {
      "label": "OT thriller",
      "humanScore": 94,
      "min": 88,
      "max": 99,
      "notes": "Multiple late lead changes; outcome uncertain until final play"
    }
  },
  "comparisons": [
    {
      "higher": "THRILLER_EVENT_ID",
      "lower": "BLOWOUT_EVENT_ID",
      "minGap": 25,
      "reason": "The thriller should clearly outrank the blowout"
    }
  ]
}
```

Ranges are more useful than requiring an exact model score.

Once at least five games have `humanScore`, the real-game test calculates aggregate calibration error. The default guardrails are MAE <= 12 and overall bias within ±8. Those are starting guardrails, not sacred constants.

## 5. Test qualitative context with real events

Use `calibration/context-overrides.json` to inject verified qualitative context for a captured real event without changing the raw ESPN fixture:

```json
{
  "events": {
    "REAL_ESPN_EVENT_ID": {
      "factors": [
        {
          "type": "former_captain_return",
          "label": "Former captain returns",
          "text": "Former captain makes his first return against his old team",
          "verified": true,
          "confidence": 0.95
        }
      ]
    }
  }
}
```

Then rerun the report/tests. This verifies that qualitative data actually reaches the model and changes the pregame score by the intended amount.

## 6. Run the real-game assertions

```bash
node --test test/calibration.real-games.test.js
```

With no fixtures, the test skips. With fixtures but no annotations, it still verifies that every real game produces a valid score. Once expectations are added, it also tests ranges, pairwise rankings and aggregate human-model error.

## Recommended Codex instruction

Use the attached calibration test pack against the current repository. Do not redesign the scoring model first. Run the behavioral tests, capture real fixtures, generate the report, and inspect the largest discrepancies. Add human-readable notes for suspicious games. If a failure reveals a real scoring problem, identify the specific factor or weight responsible before editing code. Make the smallest justified scoring change, rerun the same fixtures, and report before/after effects across all sports so a fix for one sport does not create a regression elsewhere. Do not weaken tests merely to make them pass.

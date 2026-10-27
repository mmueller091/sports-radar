// Compare the frozen pre-audit engine, saved prior-audit matrix and current pass.
const fs = require('node:fs');
const vm = require('node:vm');
const {gunzipSync} = require('node:zlib');
const {cases,evaluate} = require('../test/helpers/nfl-calibration.cjs');
const current = require('../rating-core.js');
const source = gunzipSync(fs.readFileSync(require.resolve('../test/fixtures/scoring-core-before-extraction.js.gz'))).toString();
const before = vm.runInNewContext(`${source}\nSportsRadarScore`);
const priorAudit = require('../calibration/nfl-decisive-baseline.json');
console.log('| Case | Pre-audit | Prior audit | After | Situation | History |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: |');
for (const [key,input] of Object.entries(cases)) {
  const old = evaluate(before,input);
  const now = evaluate(current,input);
  console.log(`| ${key} | ${old.score} | ${priorAudit.scores[key]} | ${now.score} | ${now.situation} | ${now.history} |`);
}

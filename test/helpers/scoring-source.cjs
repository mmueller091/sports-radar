const fs = require('node:fs');
const path = require('node:path');

// Explicit legacy scorer; release parity tests load the production bundle.
function scoringSource(corePath = path.resolve(__dirname, '../../rating-core.js')) {
  const directory = path.dirname(corePath);
  const core = fs.readFileSync(corePath, 'utf8');
  if (!core.includes('root.SportsRadarScoring')) return core;
  // Explicit legacy script order for frozen tests and capture baselines.
  const dependencies = ['scoring/shared/config.js', 'scoring/shared/records.js', 'scoring/shared/market.js', 'scoring/shared/time.js', 'scoring/shared/football.js', 'scoring/sports/nfl.js', 'scoring/shared/pregame.js', 'scoring/sports/mlb.js', 'scoring/shared/college.js', 'scoring/shared/basketball.js', 'scoring/sports/basketball.js', 'scoring/sports/cfb.js', 'scoring/sports/tennis.js', 'scoring/shared/context.js', 'scoring/sports/soccer.js', 'scoring/shared/probability.js', 'scoring/shared/trajectory.js', 'scoring/shared/upset.js', 'scoring/sports/nhl.js', 'scoring/models.js', 'scoring/shared/history.js', 'scoring/shared/events.js', 'scoring/shared/pressure.js']
    .map(file => fs.readFileSync(path.join(directory, file), 'utf8'));
  return [...dependencies, core].join('\n');
}

const legacyScripts = [...fs.readFileSync(__filename,'utf8').matchAll(/'(scoring\/[^']+\.js)'/g)].map(match=>match[1]);
module.exports = {scoringSource,legacyScripts};

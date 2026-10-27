const fs = require('node:fs');
const path = require('node:path');

// Execute the same ordered classic scripts as the browser, including its modules.
function scoringSource(corePath = path.resolve(__dirname, '../../rating-core.js')) {
  const directory = path.dirname(corePath);
  const core = fs.readFileSync(corePath, 'utf8');
  if (!core.includes('root.SportsRadarScoring')) return core;
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const dependencies = [...html.matchAll(/<script src="(scoring\/[^"?]+)(?:\?[^" ]*)?"/g)]
    .map(match => fs.readFileSync(path.join(directory, match[1]), 'utf8'));
  return [...dependencies, core].join('\n');
}

module.exports = {scoringSource};

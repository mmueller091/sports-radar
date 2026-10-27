/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {nflModel} = typeof module !== 'undefined' && module.exports
    ? require('./sports/nfl.js')
    : root.SportsRadarScoring.sports_nfl;
  const {mlbModel} = typeof module !== 'undefined' && module.exports
    ? require('./sports/mlb.js')
    : root.SportsRadarScoring.sports_mlb;
  const {nhlModel} = typeof module !== 'undefined' && module.exports
    ? require('./sports/nhl.js')
    : root.SportsRadarScoring.sports_nhl;
  const {nbaModel,ncaabModel} = typeof module !== 'undefined' && module.exports
    ? require('./sports/basketball.js')
    : root.SportsRadarScoring.sports_basketball;
  const {cfbModel} = typeof module !== 'undefined' && module.exports
    ? require('./sports/cfb.js')
    : root.SportsRadarScoring.sports_cfb;
  const {tennisModel} = typeof module !== 'undefined' && module.exports
    ? require('./sports/tennis.js')
    : root.SportsRadarScoring.sports_tennis;
  const {soccerModel} = typeof module !== 'undefined' && module.exports
    ? require('./sports/soccer.js')
    : root.SportsRadarScoring.sports_soccer;

  // Shared helpers never import this registry or the orchestrator.
  const SPORT_MODELS = {
    NFL:nflModel,MLB:mlbModel,NHL:nhlModel,NBA:nbaModel,NCAAB:ncaabModel,
    CFB:cfbModel,Tennis:tennisModel,Soccer:soccerModel
  };

  const api = {SPORT_MODELS};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).models = api;
  }
})(globalThis);

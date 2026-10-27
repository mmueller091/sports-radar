/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {marketPregame} = typeof module !== 'undefined' && module.exports
    ? require('../shared/pregame.js')
    : root.SportsRadarScoring.shared_pregame;
  const {collegePregame} = typeof module !== 'undefined' && module.exports
    ? require('../shared/college.js')
    : root.SportsRadarScoring.shared_college;
  const {recordFor} = typeof module !== 'undefined' && module.exports
    ? require('../shared/records.js')
    : root.SportsRadarScoring.shared_records;
  const {footballGameState,footballSituation,footballMilestone,footballEventShock,footballStagnationImpact} = typeof module !== 'undefined' && module.exports
    ? require('../shared/football.js')
    : root.SportsRadarScoring.shared_football;

  function cfbPregame(sport,competition,competitors,postseason,factors,reason) {
    reason = marketPregame(sport,competition,factors,reason);
    return collegePregame(sport,competition,competitors,postseason,factors,reason,{
      twoRankedPoints:28,rankedPoints:11,topTenPoints:5,matchup:cfbRankedMatchup
    });
  }

  function cfbRankedMatchup({ranks,competitors,postseason,factors,rankingFactors}) {
    if (
      ranks.every(
        rank =>
          rank <= 20
      )
    ) {
      rankingFactors.push({
        label:'Both top 20',
        points:4
      });
    }

    if (
      ranks.some(
        rank =>
          rank <= 10
      )
    ) {
      rankingFactors.push({
        label:'Top 10 team',
        points:5
      });
    }

    const records =
      competitors
        .map(recordFor)
        .map(value =>
          String(value)
            .match(
              /^(\d+)-(\d+)/
            )
        );

    if (
      !postseason &&
      records.every(match =>
        match &&
        Number(match[1]) >
        Number(match[2])
      )
    ) {
      factors.push({
        label:'Both winning records',
        points:3
      });
    }

    if (
      !postseason &&
      records.some(match =>
        match &&
        Number(match[1]) >= 4 &&
        Number(match[2]) === 0
      )
    ) {
      factors.push({
        label:'Unbeaten team',
        points:4
      });
    }
  }

  const cfbModel = {
    pregame:cfbPregame,
    gameState:footballGameState,
    situation:footballSituation,
    milestone:footballMilestone,
    eventShock:footballEventShock,
    history:{threshold:10,units:'points',stagnation:footballStagnationImpact}
  };

  const api = {cfbPregame,cfbRankedMatchup,cfbModel};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).sports_cfb = api;
  }
})(globalThis);

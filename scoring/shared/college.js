/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {listedSpread,footballPregameSpread} = typeof module !== 'undefined' && module.exports
    ? require('./market.js')
    : root.SportsRadarScoring.shared_market;

  function collegePregame(sport,competition,competitors,postseason,factors,reason,rankingRules,options={}) {
    const ranks =
      ['CFB','NCAAB']
        .includes(sport)
        ? competitors
            .map(item =>
              Number(
                item.curatedRank?.current ||
                item.team?.rank
              )
            )
            .filter(rank =>
              rank > 0 &&
              rank <= 25
            )
        : [];

    // A ranking adds interest only when the matchup can plausibly compete.
    // Two ranked teams retain some importance even with a wider line.
    const rankingFactors = [];
    const rankingSpread = sport === 'CFB' && options.calibratedPregame ? footballPregameSpread(competition) : listedSpread(competition);
    const competitiveness = rankingSpread === null
      ? null
      : 1 / (1 + (rankingSpread / 10) ** 2);

    if (ranks.length === 2) {
      rankingFactors.push({
        label:'Two ranked teams',
        points:
          rankingRules.twoRankedPoints
      });

      rankingRules.matchup({ranks,competitors,postseason,factors,rankingFactors});

      reason +=
        ' · two ranked teams';
    } else if (
      ranks.length === 1
    ) {
      rankingFactors.push({
        label:'Ranked team',
        points:
          rankingRules.rankedPoints
      });

      if (ranks[0] <= 10) {
        rankingFactors.push({label:'Top 10 team',points:rankingRules.topTenPoints});
      }

      reason +=
        ' · ranked team';
    }

    if (rankingFactors.length) {
      const multiplier = ranks.length === 2
        ? .15 + .85 * (competitiveness ?? .7)
        : competitiveness ?? .35;
      let rawPoints = 0;
      let scaledPoints = 0;
      for (const factor of rankingFactors) {
        rawPoints += factor.points;
        const next = Math.round(rawPoints * multiplier);
        if (next > scaledPoints) {
          factors.push({...factor,points:next - scaledPoints});
        }
        scaledPoints = next;
      }
    }

    return reason;
  }

  const api = {collegePregame};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).shared_college = api;
  }
})(globalThis);

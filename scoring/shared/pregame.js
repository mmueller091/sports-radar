/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {pregameMarketFactor} = typeof module !== 'undefined' && module.exports
    ? require('./market.js')
    : root.SportsRadarScoring.shared_market;
  const {proRecordFactors,divisionFor} = typeof module !== 'undefined' && module.exports
    ? require('./records.js')
    : root.SportsRadarScoring.shared_records;

  function marketPregame(sport,competition,factors,reason,options={}) {
    if (['MLB','NHL','NBA','CFB','NCAAB'].includes(sport)) {
      const market =
        pregameMarketFactor(
          sport,
          competition,
          options
        );

      if (market) {
        factors.push(market);

        reason +=
          market.points < 0
            ? ' · projected mismatch'
            : market.points >= 5
            ? ' · near pick’em'
            : ' · competitive market';
      }
    }

    return reason;
  }

  function proPregame(sport,competition,competitors,postseason,factors,reason,detail) {
    if (
      ['MLB','NHL','NBA']
        .includes(sport)
    ) {
      const recordFactors = postseason ? [] :
        proRecordFactors(
          sport,
          competitors
        );

      factors.push(
        ...recordFactors
      );

      const division =
        divisionFor(
          sport,
          competitors
        );

      const bothWinning =
        recordFactors.some(
          item =>
            item.label ===
            'Both winning records'
        );

      if (division) {
        factors.push({
          label:`${division} matchup`,
          points:3
        });

        const meaningfulDivisionRace =
          bothWinning &&
          /playoff|postseason|wild card|race|elimination|clinching/
            .test(detail);

        if (meaningfulDivisionRace) {
          factors.push({
            label:'Division matchup between winning teams',
            points:2
          });
        }

        reason +=
          ` · ${division} matchup`;
      }

      if (bothWinning) {
        reason +=
          ' · both teams winning';
      }

    }

    return marketPregame(sport,competition,factors,reason);
  }

  const api = {marketPregame,proPregame};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).shared_pregame = api;
  }
})(globalThis);

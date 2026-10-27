/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {NFL_DIVISIONS} = typeof module !== 'undefined' && module.exports
    ? require('../shared/config.js')
    : root.SportsRadarScoring.shared_config;
  const {recordStats} = typeof module !== 'undefined' && module.exports
    ? require('../shared/records.js')
    : root.SportsRadarScoring.shared_records;
  const {listedSpread} = typeof module !== 'undefined' && module.exports
    ? require('../shared/market.js')
    : root.SportsRadarScoring.shared_market;
  const {footballGameState,footballSituation,footballMilestone,footballEventShock,footballStagnationImpact} = typeof module !== 'undefined' && module.exports
    ? require('../shared/football.js')
    : root.SportsRadarScoring.shared_football;

  function nflDivisionFor(competitors) {
    const divisions =
      competitors.map(item =>
        NFL_DIVISIONS[
          String(
            item.team?.abbreviation ||
            ''
          ).toUpperCase()
        ]
      );

    return (
      divisions.length === 2 &&
      divisions[0] &&
      divisions[0] === divisions[1]
    )
      ? divisions[0]
      : '';
  }

  function nflSpreadPoints(spread) {
    return Math.round(7 * Math.exp(-((spread / 7.5) ** 2)));
  }

  function unbeatenStartImpact(sport,gameState,teams) {
    if (sport !== 'NFL' || gameState !== 'completed' || teams.length !== 2) return 0;
    const scores = teams.map(team => Number(team.score ?? team[2]));
    if (!scores.every(Number.isFinite) || scores[0] === scores[1]) return 0;
    const loser = teams[scores[0] < scores[1] ? 0 : 1];
    const record = String(loser.pregameRecord || '').match(/^(\d+)-(\d+)(?:-(\d+))?$/);
    if (!record || Number(record[1]) < 4 || Number(record[2]) !== 0) return 0;
    return Math.round(Math.min(10,4 + .75 * (Number(record[1]) - 4)));
  }

  function nflPregame(sport,competition,competitors,postseason,factors,reason) {
    if (sport === 'NFL') {
      const division =
        nflDivisionFor(
          competitors
        );

      const records =
        competitors.map(
          recordStats
        );

      const knownRecords =
        !postseason &&
        records.length === 2 &&
        records.every(Boolean);

      const bothWinning =
        knownRecords &&
        records.every(
          record =>
            record.pct > .5
        );

      if (division) {
        factors.push({
          label:`${division} matchup`,
          points:4
        });

        if (bothWinning) {
          factors.push({
            label:'Division race between winning teams',
            points:3
          });
        }

        reason +=
          ` · ${division} rivals`;
      }

      if (bothWinning) {
        factors.push({
          label:'Both winning records',
          points:14
        });

        if (
          Math.abs(
            records[0].pct -
            records[1].pct
          ) <= .1
        ) {
          factors.push({
            label:'Evenly matched winning records',
            points:4
          });
        }

        reason +=
          ' · both teams winning';
      } else if (
        knownRecords &&
        records.every(
          record =>
            record.pct >= .5
        )
      ) {
        factors.push({
          label:'Both teams at least .500',
          points:5
        });
      } else if (
        knownRecords &&
        records.every(
          record =>
            record.pct < .5
        )
      ) {
        factors.push({
          label:'Both teams below .500',
          points:-7
        });
      }

      if (
        knownRecords &&
        records.some(
          record =>
            record.wins === 0 &&
            record.games >= 3
        )
      ) {
        factors.push({
          label:'Winless team',
          points:-5
        });
      }

      if (
        knownRecords &&
        records.some(
          record =>
            record.losses === 0 &&
            record.games >= 3
        )
      ) {
        factors.push({
          label:'Unbeaten team',
          points:7
        });
      }

      const spread =
        listedSpread(
          competition
        );

      const spreadPoints = spread === null
        ? 0
        : nflSpreadPoints(spread);
      if (spreadPoints) {
        const tight = spreadPoints >= 5;
        factors.push({
          label:tight
            ? 'Tight projected spread'
            : 'Competitive projected spread',
          points:spreadPoints
        });

        reason += tight
          ? ' · close line'
          : ' · competitive line';
      }
    }

    return reason;
  }

  const nflModel = {
    pregame:nflPregame,
    gameState:footballGameState,
    situation:footballSituation,
    milestone:footballMilestone,
    completedResult:(sport,gameState,teams) => ({
      label:'Ended unbeaten start',points:unbeatenStartImpact(sport,gameState,teams)
    }),
    eventShock:footballEventShock,
    history:{threshold:7,units:'points',stagnation:footballStagnationImpact}
  };

  const api = {nflDivisionFor,nflSpreadPoints,unbeatenStartImpact,nflPregame,nflModel};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).sports_nfl = api;
  }
})(globalThis);

/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {LEAGUE_DIVISIONS} = typeof module !== 'undefined' && module.exports
    ? require('./config.js')
    : root.SportsRadarScoring.shared_config;

  function recordFor(competitor) {
    const records =
      competitor?.records ||
      competitor?.team?.records ||
      [];

    const overall =
      records.find(item =>
        /overall|total/i.test(
          `${item.type || ''} ${item.name || ''} ${item.abbreviation || ''}`
        )
      ) ||
      records[0];

    return (
      overall?.summary ||
      competitor?.record?.summary ||
      (
        typeof competitor?.record === 'string'
          ? competitor.record
          : ''
      )
    );
  }

  function rankFor(competitor, sport) {
    if (!['CFB','NCAAB'].includes(sport)) {
      return null;
    }

    const rank =
      Number(
        competitor?.curatedRank?.current ??
        competitor?.team?.rank
      );

    return (
      Number.isFinite(rank) &&
      rank >= 1 &&
      rank <= 25
    )
      ? rank
      : null;
  }

  function divisionFor(sport,competitors) {
    const map =
      LEAGUE_DIVISIONS[sport];

    if (
      !map ||
      !Array.isArray(competitors) ||
      competitors.length !== 2
    ) {
      return '';
    }

    const divisions =
      competitors.map(item =>
        map[
          String(
            item.team?.abbreviation ||
            item.abbreviation ||
            ''
          ).toUpperCase()
        ]
      );

    return (
      divisions[0] &&
      divisions[0] === divisions[1]
    )
      ? divisions[0]
      : '';
  }

  function recordStats(competitor) {
    const match =
      String(
        recordFor(competitor)
      ).match(
        /^(\d+)-(\d+)(?:-(\d+))?/
      );

    if (!match) {
      return null;
    }

    const wins =
      Number(match[1]);

    const losses =
      Number(match[2]);

    const ties =
      Number(match[3] || 0);

    const games =
      wins +
      losses +
      ties;

    return games
      ? {
          wins,
          losses,
          ties,
          games,
          pct:
            (
              wins +
              ties / 2
            ) /
            games
        }
      : null;
  }

  function winningRecord(competitor) {
    const record =
      recordStats(competitor);

    return Boolean(
      record &&
      record.pct > .5
    );
  }

  function proRecordFactors(sport,competitors) {
    if (
      !['MLB','NHL','NBA']
        .includes(sport)
    ) {
      return [];
    }

    const records =
      competitors.map(
        recordStats
      );

    if (
      records.length !== 2 ||
      !records.every(Boolean)
    ) {
      return [];
    }

    const minimumGames = {
      MLB:8,
      NHL:4,
      NBA:4
    }[sport] || 4;

    const mature =
      records.every(
        record =>
          record.games >=
          minimumGames
      );

    const bothWinning =
      records.every(
        record =>
          record.pct > .5
      );

    const bothAtLeastEven =
      records.every(
        record =>
          record.pct >= .5
      );

    const bothBelow =
      records.every(
        record =>
          record.pct < .5
      );

    const factors = [];

    factors.push(
      ...proTeamQualityFactors(
        sport,
        records
      )
    );

    if (bothWinning) {
      factors.push({
        label:'Both winning records',
        points:mature ? 7 : 3
      });

      if (
        Math.abs(
          records[0].pct -
          records[1].pct
        ) <= .1
      ) {
        factors.push({
          label:'Evenly matched winning records',
          points:mature ? 3 : 2
        });
      }
    } else if (bothAtLeastEven) {
      factors.push({
        label:'Both teams at least .500',
        points:mature ? 4 : 2
      });
    } else if (bothBelow) {
      factors.push({
        label:'Both teams below .500',
        points:mature ? -4 : -2
      });
    }

    if (
      records.some(
        record =>
          record.losses === 0 &&
          record.games >= 3
      )
    ) {
      factors.push({
        label:'Unbeaten team',
        points:4
      });
    }

    if (
      records.some(
        record =>
          record.wins === 0 &&
          record.games >= 3
      )
    ) {
      factors.push({
        label:'Winless team',
        points:-3
      });
    }

    return factors;
  }

  function proTeamQualityFactors(sport,records) {
    if (
      !['MLB','NHL','NBA'].includes(sport) ||
      !Array.isArray(records) ||
      records.length !== 2 ||
      !records.every(Boolean)
    ) {
      return [];
    }

    const priorGames = 6;
    const adjusted = records.map(record =>
      ((record.pct * record.games) + (.5 * priorGames)) /
      (record.games + priorGames)
    );
    const average =
      adjusted.reduce((sum,value) => sum + value,0) /
      adjusted.length;
    const factors = [];
    let points = 0;

    if (average >= .70) points = 10;
    else if (average >= .64) points = 7;
    else if (average >= .58) points = 4;
    else if (average >= .54) points = 2;

    if (points) {
      factors.push({
        label:'Adjusted team quality',
        points
      });
    }

    if (adjusted.every(value => value >= .64)) {
      factors.push({
        label:'Both teams have strong adjusted quality',
        points:3
      });
    }

    if (adjusted.every(value => value >= .70)) {
      factors.push({
        label:'Both teams have elite adjusted quality',
        points:2
      });
    }

    return factors;
  }

  const api = {recordFor,rankFor,divisionFor,recordStats,winningRecord,proRecordFactors,proTeamQualityFactors};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).shared_records = api;
  }
})(globalThis);

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
  const {footballGameState,footballSituationImpact,footballMilestone,footballEventShock,footballStagnationImpact,footballFieldPosition,footballClockRunway} = typeof module !== 'undefined' && module.exports
    ? require('../shared/football.js')
    : root.SportsRadarScoring.shared_football;
  const {clockSeconds} = typeof module !== 'undefined' && module.exports
    ? require('../shared/time.js')
    : root.SportsRadarScoring.shared_time;

  function nflOvertime(competition,summary) {
    const period = Number(competition?.status?.period);
    const ordinary = {active:period > 4,suddenDeath:false,canWin:false,fieldGoalWins:false};
    if (!ordinary.active) return ordinary;
    const holder = String(competition?.situation?.possession?.id || competition?.situation?.possession || '');
    const teams = competition?.competitors || [];
    const offense = teams.find(t => String(t.team?.id || t.id || '') === holder);
    const defense = teams.find(t => t !== offense);
    if (!holder || teams.length !== 2 || !offense || !defense || offense.score == null || defense.score == null) return ordinary;
    const deficit = Number(defense.score)-Number(offense.score);
    if (!Number.isFinite(deficit)) return ordinary;
    // Use completed, identifiable OT offensive drives. Period alone and the
    // provider's format.overtime metadata say nothing about possession rights.
    const completed = (summary?.drives?.previous || []).filter(d => {
      const plays = d.plays || [];
      const startPeriod = Number(d.start?.period?.number ?? plays[0]?.period?.number);
      return startPeriod > 4 && startPeriod <= period && d.isCurrent !== true &&
        d.result && !/end of|kickoff/i.test(d.result) &&
        plays.some(p => String(p.start?.team?.id || '') === String(d.team?.id || '') &&
          p.start?.team?.id && !/kickoff|timeout|end of/i.test(p.type?.text || p.text || ''));
    });
    const possessed = new Set(completed.map(d => String(d.team?.id || '')));
    const otherHadBall = possessed.has(String(defense.team?.id || defense.id || ''));
    const suddenDeath = deficit === 0 && otherHadBall && possessed.has(holder);
    const year = Number(summary?.header?.season?.year || competition?.season?.year);
    const seasonType = Number(summary?.header?.season?.type || competition?.season?.type);
    const postseason = seasonType === 3;
    // Historical inputs can identify the pre-2025 regular-season / pre-2022
    // postseason opening-TD rule. Unknown year uses today's two-opportunity rule.
    const openingTdWins = year > 0 && (seasonType === 2 || postseason) && year < (postseason ? 2022 : 2025);
    return {active:true,suddenDeath,canWin:deficit >= 0 && deficit <= 7 && (otherHadBall || openingTdWins),
      fieldGoalWins:deficit >= 0 && deficit < 3 && otherHadBall};
  }

  function nflSituation(args) {
    const overtime = nflOvertime(args.competition,args.summary);
    const result = footballSituationImpact(args.game,args.competition,args.status,args.situation,args.progress,args.scoreGap,{overtime});
    const {game,competition,status,situation,scoreGap} = args;
    const holderId = String(situation.possession?.id || situation.possession || '');
    const holder = game.teams.find(team => String(team[8] || '') === holderId);
    const opponent = game.teams.find(team => team !== holder);
    const deficit = holder && opponent ? Number(opponent[2])-Number(holder[2]) : NaN;
    const seconds = clockSeconds(status);
    const regulation = Number(status?.period) === 4;
    const criticalTry = situation.isTwoPointAttempt === true && [1,2].includes(deficit) &&
      regulation && seconds !== null && seconds >= 0 && seconds <= 120;
    // Strengthen the existing competitive floor, never an independent award.
    // Headroom keeps an already compelling upset/stakes state from receiving
    // the same raw increase as a generic decisive possession.
    const base = Number(game.baseScore);
    if (Number.isFinite(base) && (criticalTry || (regulation && seconds > 0 &&
        seconds <= 180 && result.decisiveDrive && deficit >= 0 && deficit <= 8))) {
      const position = footballFieldPosition(game,holder,situation.possessionText,
        situation.downDistanceText || situation.shortDownDistanceText);
      const goal = (situation.isGoalToGo === true || /&\s*goal/i.test(situation.downDistanceText || situation.shortDownDistanceText || '')) &&
        position !== null && position >= 90;
      const territory = position === null ? 0 : Math.max(0,Math.min(1,(position-25)/55));
      const winningRange = deficit < 3 && position !== null && position >= 58;
      let consequence = winningRange ? .80 : .70 + .06*territory;
      // Estimate whether a failed fourth down leaves another possession using
      // the same timeout/runoff math as the existing leading-possession model.
      const afterFailure = footballClockRunway({...competition,status},
        {...situation,possession:opponent?.[8],down:1});
      const finalFourth = Number(situation.down) === 4 && deficit > 0 &&
        (afterFailure ? afterFailure.remaining <= 15 : seconds <= 60);
      if (finalFourth) {
        const distance = Number(situation.distance);
        const shortness = Number.isFinite(distance) && distance > 0
          ? Math.max(0,Math.min(1,(10-distance)/9)) : 0;
        consequence = Math.max(consequence,.82+.04*shortness);
      }
      if (goal) consequence = Math.max(consequence,.86);
      if (criticalTry) consequence = deficit === 1 ? .90 : .86;
      // A full-field march with only seconds left is not a viable drive. A
      // goal-line snap or explicit try can still decide matters immediately.
      const yardsNeeded = position === null ? 75 : Math.max(0,(scoreGap <= 3 ? 65 : 100)-position);
      const viability = criticalTry || goal ? 1 : Math.min(1,seconds/(8+.65*yardsNeeded));
      const urgency = criticalTry ? 1 : result.decisiveDrive.urgency;
      result.competitiveFloor = Math.round(Math.max(0,99-base)*consequence*urgency*viability);
    }
    if (overtime.canWin) result.reasons.push(overtime.suddenDeath ? 'Sudden-death overtime: next score wins' : 'This overtime possession can win the game');
    return result;
  }

  function nflGameState(args) {
    const result = footballGameState(args);
    if (args.gameState !== 'live' || !result.footballState || args.gap == null ||
        !Number.isFinite(args.gap) || args.gap < 0 || args.gap > 8 || args.progress < .75) return result;
    const competition = args.context?.competition || args.context;
    const status = competition?.status;
    const seconds = clockSeconds(status);
    const overtime = nflOvertime(competition,args.context?.summary);
    const state = result.footballState;
    const urgency = Number(status?.period) === 4 && seconds !== null
      ? (seconds > 0 ? Math.max(0,Math.min(1,(600-seconds)/480)) : 0)
      : overtime.canWin ? 1 : 0;
    // Calibrate state watchability, independently of the last play. Direction
    // and timeout runway gate this increase; field position stays in situation.
    const directional = args.gap === 0 || state.possessionState === 'trailing'
      ? 1 : state.possessionState === 'leading' ? state.comebackFeasibility*.4 : .2;
    result.closeCeiling = 14+16*Math.max(0,Math.min(1,args.progress)) + 12*urgency*directional;
    return result;
  }

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
    gameState:nflGameState,
    situation:nflSituation,
    milestone:footballMilestone,
    completedResult:(sport,gameState,teams) => ({
      label:'Ended unbeaten start',points:unbeatenStartImpact(sport,gameState,teams)
    }),
    eventShock:footballEventShock,
    history:{threshold:7,units:'points',stagnation:footballStagnationImpact}
  };

  const api = {nflDivisionFor,nflSpreadPoints,unbeatenStartImpact,nflPregame,nflModel,nflOvertime};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).sports_nfl = api;
  }
})(globalThis);

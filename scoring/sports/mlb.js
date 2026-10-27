/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {proPregame} = typeof module !== 'undefined' && module.exports
    ? require('../shared/pregame.js')
    : root.SportsRadarScoring.shared_pregame;

  function mlbLiveMarginCloseness(gap,progress) {
    if (gap === null || !Number.isFinite(Number(gap))) return 0;
    const p = Math.max(0,Math.min(1,Number(progress) || 0));
    const tolerance = 6.5 - 3.6 * p;
    return Math.max(0,1 - Number(gap) / tolerance);
  }

  function runnerOn(
    situation,
    base
  ) {
    const value =
      situation?.[`on${base}`] ??
      situation?.runners
        ?.[base.toLowerCase()];

    return (
      value === undefined ||
      value === null
    )
      ? null
      : Boolean(value);
  }

  function sideScores(
    game,
    competition
  ) {
    const byId =
      new Map(
        game.teams.map(
          team => [
            String(
              team[8] || ''
            ),
            Number(team[2])
          ]
        )
      );

    const result = {};

    for (
      const item of
      competition?.competitors ||
      []
    ) {
      const side =
        item.homeAway;

      const id =
        String(
          item.team?.id ||
          item.id ||
          ''
        );

      const direct =
        Number(
          item.score
        );

      const fallback =
        byId.get(id);

      if (side) {
        result[side] =
          Number.isFinite(direct)
            ? direct
            : fallback;
      }
    }

    return result;
  }

  function baseballSituationImpact(
    game,
    competition,
    status,
    situation,
    progress,
    scoreGap
  ) {
    const bases = {
      first:
        runnerOn(
          situation,
          'First'
        ),
      second:
        runnerOn(
          situation,
          'Second'
        ),
      third:
        runnerOn(
          situation,
          'Third'
        )
    };

    const occupied =
      Object.entries(bases)
        .filter(
          ([,value]) =>
            value
        )
        .map(
          ([base]) =>
            base
        );

    const outs =
      Number(
        situation.outs
      );

    const hasOuts =
      situation.outs !== undefined &&
      situation.outs !== null &&
      Number.isInteger(outs) &&
      outs >= 0 &&
      outs <= 2;

    const inning =
      Number(
        status?.period || 0
      );

    const detail =
      String(
        status?.type?.detail ||
        status?.type?.shortDetail ||
        ''
      ).toLowerCase();

    const half =
      /bottom|bot\b/.test(detail)
        ? 'bottom'
        : /top\b/.test(detail)
          ? 'top'
          : '';

    const battingSide =
      half === 'bottom'
        ? 'home'
        : half === 'top'
          ? 'away'
          : '';

    const scores =
      sideScores(
        game,
        competition
      );

    const battingScore =
      battingSide
        ? Number(
            scores[battingSide]
          )
        : NaN;

    const fieldingScore =
      battingSide
        ? Number(
            scores[
              battingSide === 'home'
                ? 'away'
                : 'home'
            ]
          )
        : NaN;

    const differential =
      Number.isFinite(battingScore) &&
      Number.isFinite(fieldingScore)
        ? battingScore -
          fieldingScore
        : null;
    const countText = String(situation.count || `${situation.balls ?? ''}-${situation.strikes ?? ''}`);
    const fullCount = /^3-2$/.test(countText.trim());

    if (Number.isFinite(outs) && outs >= 3) {
      return {points:0,note:'3 outs',reasons:[],bases,competitiveFloor:0};
    }

    let points = 0;
    const reasons = [];

    if (occupied.length) {
      const occupiedText =
        occupied.length === 3
          ? `${occupied[0]}, ${occupied[1]}, and ${occupied[2]}`
          : occupied.join(' and ');

      reasons.push(
        `Runners on ${occupiedText}`
      );
    }

    if (
      occupied.length === 3
    ) {
      points +=
        scoreGap <= 2
          ? (inning >= 7 ? 4 : 2)
          : scoreGap <= 4
            ? 1
            : 0;

      if (scoreGap <= 4) reasons.push('The bases are loaded');
    }

    if (
      (
        bases.second ||
        bases.third
      ) &&
      inning >= 7 &&
      scoreGap <= 2 &&
      differential !== null &&
      differential <= 0
    ) {
      points +=
        inning >= 9
          ? 6
          : 4;

      reasons.push(
        'The tying or go-ahead run is in scoring position late'
      );
    }

    if (
      bases.third &&
      inning >= 9 &&
      scoreGap <= 1
    ) {
      points += 2;

      reasons.push(
        'A critical run is 90 feet away'
      );
    }

    if (
      half === 'bottom' &&
      inning >= 9 &&
      differential === 0
    ) {
      points += 7;

      reasons.push(
        'The home team has a walk-off opportunity'
      );
    } else if (
      half === 'bottom' &&
      inning >= 9 &&
      differential === -1 &&
      occupied.length
    ) {
      points += 5;

      reasons.push(
        'The tying run is on base in the bottom of the ninth or later'
      );
    }

    if (
      hasOuts &&
      outs === 2 &&
      occupied.length &&
      inning >= 7 &&
      scoreGap <= 2
    ) {
      points += 2;

      reasons.push(
        'The inning has reached a two-out pressure spot'
      );
    }

    if (inning >= 7 && scoreGap <= 2 && hasOuts && outs === 2 && fullCount) {
      points += 3;
      reasons.push('A full count with two outs raises the plate appearance leverage');
    }

    if (inning >= 7 && scoreGap <= 2 && differential !== null && differential <= 0) {
      if (differential === 0) {
        points += occupied.length ? 3 : 4;
        reasons.push(occupied.length ? 'The go-ahead run is on base' : 'The go-ahead run is at the plate');
      } else {
        const runsToTie = Math.abs(differential);
        if (occupied.length >= runsToTie) {
          points += 3;
          reasons.push('The tying run is on base');
        } else if (occupied.length + 1 === runsToTie) {
          points += 4;
          reasons.push('The tying run is at the plate');
        } else if (occupied.length + 2 === runsToTie && (situation.onDeck || situation.onDeckBatter || situation.nextBatter)) {
          points += 2;
          reasons.push('The tying run is on deck');
        }
      }
    }

    const decisivePlateAppearance = inning >= 9 &&
      (half === 'bottom' || half === 'top' && differential < 0) &&
      differential !== null && differential <= 0 &&
      -differential <= occupied.length + 1 && scoreGap <= 3;
    const competitiveFloor = decisivePlateAppearance
      ? Math.min(20,15 + (hasOuts && outs === 2 ? 2 : 0) +
          (fullCount ? 2 : 0) + (occupied.length ? 1 : 0) +
          (bases.second || bases.third ? 1 : 0))
      : 0;

    return {
      points:
        Math.min(
          12,
          points
        ),

      note:
        hasOuts
          ? `${outs} ${outs === 1 ? 'out' : 'outs'}`
          : '',

      reasons,
      bases,
      competitiveFloor
    };
  }

  function noHitBid(summary) {
    const competitors =
      summary?.header
        ?.competitions?.[0]
        ?.competitors ||
      [];

    for (
      const block of
      summary?.boxscore?.players ||
      []
    ) {
      const opponent =
        competitors.find(item =>
          String(
            item.team?.id ||
            ''
          ) !==
          String(
            block.team?.id ||
            ''
          )
        );

      if (
        !opponent ||
        Number(opponent.hits) !== 0 ||
        opponent.hits == null
      ) {
        continue;
      }

      for (
        const group of
        block.statistics ||
        []
      ) {
        const labels =
          group.labels || [];

        const innings =
          labels.indexOf('IP');

        const hits =
          labels.indexOf('H');

        if (
          innings < 0 ||
          hits < 0
        ) {
          continue;
        }

        const pitcher =
          (group.athletes || [])
            .find(entry =>
              Number.parseFloat(
                entry.stats?.[innings]
              ) >= 6 &&
              Number(
                entry.stats?.[hits]
              ) === 0
            );

        if (pitcher) {
          return {
            text:
              `${pitcher.athlete?.displayName || 'A pitcher'} has thrown ${Math.floor(Number.parseFloat(pitcher.stats[innings]))} hitless innings in a no-hit bid`,
            points:14
          };
        }
      }
    }

    return null;
  }

  function baseballPerformanceMilestone(summary) {
    const candidates = [];

    const noHit =
      noHitBid(summary);

    if (noHit) {
      candidates.push(noHit);
    }

    for (
      const block of
      summary?.boxscore?.players ||
      []
    ) {
      for (
        const group of
        block.statistics ||
        []
      ) {
        const labels =
          group.labels || [];

        const homeRuns =
          labels.findIndex(label =>
            /^HR$|^HOME RUNS$/i
              .test(label)
          );

        const strikeouts =
          labels.findIndex(label =>
            /^K$|^SO$|^STRIKEOUTS$/i
              .test(label)
          );

        for (
          const entry of
          group.athletes ||
          []
        ) {
          const name =
            entry.athlete?.displayName ||
            'A player';

          if (
            homeRuns >= 0
          ) {
            const count =
              Number(
                entry.stats?.[homeRuns]
              );

            if (
              count >= 2
            ) {
              candidates.push({
                text:
                  count >= 3
                    ? `${name} has hit ${count} home runs`
                    : `${name} has hit 2 home runs and is one away from a rare three-homer game`,
                points:
                  count >= 4
                    ? 14
                    : count >= 3
                      ? 12
                      : 6
              });
            }
          }

          if (
            strikeouts >= 0 &&
            /pitch/i.test(
              `${group.name || ''} ${group.displayName || ''}`
            )
          ) {
            const count =
              Number(
                entry.stats?.[strikeouts]
              );

            if (
              count >= 10
            ) {
              candidates.push({
                text:
                  `${name} has struck out ${count} batters`,
                points:
                  count >= 15
                    ? 12
                    : 7
              });
            }
          }
        }
      }
    }

    return candidates
      .sort(
        (a,b) =>
          b.points -
          a.points
      )[0] ||
      null;
  }

  function baseballGameState({sport,gameState,gap,progress,context:footballContext}) {
    const liveSituation = footballContext?.situation || footballContext?.competition?.situation || {};
    const liveStatus = footballContext?.competition?.status || {};
    const inning = Number(liveStatus.period || liveStatus.inning || 0);
    const inningHalf = String(liveSituation.halfInning || liveSituation.inningHalf || liveSituation.lastPlay?.type?.text || `${liveStatus.type?.detail || ''} ${liveStatus.type?.shortDetail || ''}`).toLowerCase();
    const homeTrailing = Array.isArray(footballContext?.teams) && footballContext.teams.length === 2 &&
      Number(footballContext.teams[0][2]) < Number(footballContext.teams[1][2]);
    const guaranteedMlbAtBat = sport === 'MLB' && inning >= 8 &&
      (homeTrailing && /bottom|middle|home/.test(inningHalf) || !homeTrailing && /top|away/.test(inningHalf));
    return {
      marginClose:gameState === 'live' ? mlbLiveMarginCloseness(gap,progress) : undefined,
      minimumComebackViability:guaranteedMlbAtBat ? .9 : 0
    };
  }

  function baseballEventShock({text,positioned,i,play}) {
    let value = 0;
    let label = '';
    if (/\bhome run\b/.test(text) && (/\b(?:tying|go[- ]ahead|game[- ]tying|takes the lead|puts .* ahead)\b.{0,45}\bhome run\b|\bhome run\b.{0,45}\b(?:ties|takes the lead|goes ahead|go[- ]ahead)\b/.test(text) || (()=>{const before=positioned.slice(0,i).reverse().find(item=>Number.isFinite(Number(item.play.homeScore))&&Number.isFinite(Number(item.play.awayScore)));const afterHome=Number(play.homeScore);const afterAway=Number(play.awayScore);if(!before||!Number.isFinite(afterHome)||!Number.isFinite(afterAway))return false;const beforeMargin=Number(before.play.homeScore)-Number(before.play.awayScore);const afterMargin=afterHome-afterAway;return afterMargin===0||beforeMargin===0||beforeMargin*afterMargin<0;})())) { value=6; label='Tying or go-ahead home run'; }
    return value ? {value,label} : null;
  }

  const mlbModel = {
    unit:'run',duration:180,inningEventAge:true,postseasonScarcity:6,championshipContext:true,
    pregame:proPregame,
    gameState:baseballGameState,
    situation:({game,competition,status,situation,progress,scoreGap}) =>
      baseballSituationImpact(game,competition,status,situation,progress,scoreGap),
    milestone:baseballPerformanceMilestone,
    earlyEventShock:baseballEventShock,
    contextAnchors:championship => championship
      ? [[0,.58],[.25,.50],[.5,.40],[.75,.30],[.9,.24],[1,.22]] : null,
    history:{threshold:3,units:'runs'}
  };

  const api = {mlbLiveMarginCloseness,runnerOn,sideScores,baseballSituationImpact,noHitBid,baseballPerformanceMilestone,baseballGameState,baseballEventShock,mlbModel};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).sports_mlb = api;
  }
})(globalThis);

/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {footballLiveCloseness} = typeof module !== 'undefined' && module.exports
    ? require('./football.js')
    : root.SportsRadarScoring.shared_football;

  function upsetImpact(
    candidate,
    teams,
    gameState,
    progress,
    sport='',
    competition=null
  ) {
    if (
      !candidate ||
      gameState === 'upcoming'
    ) {
      return {
        points:0,
        text:''
      };
    }

    const index =
      teams.findIndex(team =>
        candidate.teamId &&
        String(
          team.id ||
          team[8] ||
          ''
        ) ===
        candidate.teamId
      );

    const teamIndex =
      index >= 0
        ? index
        : candidate.teamIndex;

    if (
      teamIndex < 0 ||
      teamIndex > 1 ||
      teams.length !== 2
    ) {
      return {
        points:0,
        text:''
      };
    }

    const score =
      Number(
        teams[teamIndex].score ??
        teams[teamIndex][2]
      );

    const other =
      Number(
        teams[1-teamIndex].score ??
        teams[1-teamIndex][2]
      );

    if (
      !Number.isFinite(score) ||
      !Number.isFinite(other)
    ) {
      return {
        points:0,
        text:''
      };
    }

    const margin =
      score -
      other;

    const activation = Number.isFinite(candidate.activation)
      ? candidate.activation
      : 1;
    const scaled = points => Math.round(points * activation);

    if (
      gameState === 'completed'
    ) {
      return margin > 0
        ? {
            points:
              scaled(Math.min(
                22,
                18 +
                Math.round(
                  4 *
                  candidate.strength
                )
              )),

            text:
              `${candidate.teamName} won outright after entering as a ${candidate.description}`
          }
        : {
            points:0,
            text:''
          };
    }

    if (
      margin > 0 &&
      progress >= .35
    ) {
      return {
        points:
          scaled(Math.min(
            18,
            7 +
            Math.round(
              7 *
              progress
            ) +
            Math.round(
              4 *
              candidate.strength
            )
          )),

        text:
          `${candidate.teamName}, a ${candidate.description}, leads ${score}–${other}`
      };
    }

    if (
      margin === 0 &&
      progress >= .7
    ) {
      return {
        points:
          scaled(Math.min(
            12,
            4 +
            Math.round(
              5 *
              progress
            ) +
            Math.round(
              2 *
              candidate.strength
            )
          )),

        text:
          `${candidate.teamName}, a ${candidate.description}, is tied ${score}–${other} late`
      };
    }

    if (
      margin < 0 &&
      progress >= .7 &&
      ['NFL','CFB'].includes(sport)
    ) {
      const footballState = footballLiveCloseness(
        sport,-margin,progress,competition
      );
      const tiedPoints = Math.min(12,
        4 + Math.round(5 * progress) + Math.round(2 * candidate.strength)
      );
      // The margin curve measures upset threat, while the ordinary state
      // score handles game closeness. Possession and remaining chances decide
      // how much of the tied upset bonus is still in play.
      const possessionWeight = footballState.possessionState === 'trailing'
        ? 1
        : footballState.possessionState === 'leading'
          ? .68
          : .8;
      const fieldWeight = footballState.possessionState === 'trailing' &&
        footballState.fieldPosition !== null
          ? 1 + .08 * Math.max(0,(footballState.fieldPosition - 50) / 50)
          : 1;
      const marginWeight = Math.exp(-Math.pow(-margin / 10,1.6));
      const points = scaled(Math.round(
        tiedPoints * marginWeight * footballState.comebackFeasibility *
        possessionWeight * fieldWeight
      ));
      return {
        points,
        text:points
          ? `${candidate.teamName}, a ${candidate.description}, trails ${score}–${other} but remains an upset threat`
          : ''
      };
    }

    return {
      points:0,
      text:''
    };
  }

  const api = {upsetImpact};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).shared_upset = api;
  }
})(globalThis);

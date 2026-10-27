/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {proPregame} = typeof module !== 'undefined' && module.exports
    ? require('../shared/pregame.js')
    : root.SportsRadarScoring.shared_pregame;

  function nhlLiveMarginCloseness(gap,progress=0,situation={}) {
    if (
      gap === null ||
      !Number.isFinite(Number(gap))
    ) {
      return 0;
    }

    const goals =
      Math.max(
        0,
        Number(gap)
      );

    if (goals === 0) return 1;
    if (goals === 1) return .90;
    if (goals > 2) return 0;
    const p = Math.max(0,Math.min(1,Number(progress) || 0));
    const tolerance = 4.4 - 2 * p + (situation.trailingGoaliePulled ? .35 : 0) + (situation.trailingPowerPlay ? .25 : 0);
    return Math.max(0,1-goals/tolerance);
  }

  function hockeyOnIceState(
    summary,
    teams
  ) {
    const onIce =
      summary?.onIce || [];

    const blocks =
      summary?.boxscore?.players ||
      [];

    if (
      onIce.length !== 2
    ) {
      return null;
    }

    const goalieIds =
      new Map(
        blocks.map(block => [
          String(
            block.team?.id ||
            ''
          ),

          new Set(
            (block.statistics || [])
              .filter(group =>
                /goalie/i.test(
                  group.name ||
                  group.displayName ||
                  ''
                )
              )
              .flatMap(group =>
                (group.athletes || [])
                  .map(entry =>
                    String(
                      entry.athleteid ||
                      entry.athleteId ||
                      entry.athlete?.id ||
                      ''
                    )
                  )
              )
          )
        ])
      );

    const sides =
      onIce.map(side => {
        const id =
          String(
            side.teamId ||
            side.team?.id ||
            ''
          );

        const entries =
          side.entries || [];

        const goalies =
          goalieIds.get(id) ||
          new Set();

        const hasGoalie =
          entries.some(entry =>
            goalies.has(
              String(
                entry.athleteid ||
                entry.athleteId ||
                entry.athlete?.id ||
                ''
              )
            )
          );

        return {
          id,
          count:
            entries.length,
          hasGoalie,
          name:
            teams.find(team =>
              String(
                team[8] || ''
              ) === id
            )?.[0] ||
            'A team'
        };
      });

    let powerPlayTeam = null;
    let powerPlayTeamId = null;
    let powerPlayAdvantage = 0;
    let pulledGoalieTeam = null;
    let pulledGoalieTeamId = null;

    if (
      sides.every(
        side =>
          side.hasGoalie
      ) &&
      sides[0].count !==
      sides[1].count
    ) {
      const high =
        sides[0].count >
        sides[1].count
          ? sides[0]
          : sides[1];

      const low =
        high === sides[0]
          ? sides[1]
          : sides[0];

      powerPlayTeam =
        high.name;
      powerPlayTeamId = high.id;

      powerPlayAdvantage =
        high.count -
        low.count;
    }

    const noGoalie =
      sides.find(side =>
        !side.hasGoalie &&
        side.count >= 5
      );

    const withGoalie =
      sides.find(side =>
        side.hasGoalie
      );

    if (
      noGoalie &&
      withGoalie
    ) {
      pulledGoalieTeam =
        noGoalie.name;
      pulledGoalieTeamId = noGoalie.id;
    }

    return {
      sides,
      powerPlayTeam,
      powerPlayTeamId,
      powerPlayAdvantage,
      pulledGoalieTeam,
      pulledGoalieTeamId
    };
  }

  function hockeyPowerPlay(
    summary,
    teams
  ) {
    const state =
      hockeyOnIceState(
        summary,
        teams
      );

    return (
      state?.powerPlayTeam ||
      null
    );
  }

  function hockeySituationImpact(
    game,
    competition,
    summary,
    status,
    progress,
    scoreGap
  ) {
    const state =
      summary
        ? hockeyOnIceState(
            summary,
            game.teams
          )
        : null;

    let points = 0;
    let note = '';

    const reasons = [];
    const scored = game.teams.map(team => Number(team[2]));
    const trailingId = scored.length === 2 && scored.every(Number.isFinite) && scored[0] !== scored[1]
      ? String(game.teams[scored[0] < scored[1] ? 0 : 1][8] || '')
      : '';
    const leadingId = scored.length === 2 && scored.every(Number.isFinite) && scored[0] !== scored[1]
      ? String(game.teams[scored[0] > scored[1] ? 0 : 1][8] || '')
      : '';

    if (
      state?.powerPlayTeam
    ) {
      points += state.powerPlayTeamId && state.powerPlayTeamId === trailingId
        ? (progress >= .82 ? 8 : 6)
        : state.powerPlayTeamId && state.powerPlayTeamId === leadingId
          ? 1
          : state.powerPlayAdvantage >= 2 ? 6 : 4;

      note =
        `${state.powerPlayTeam} power play`;

      reasons.push(
        state.powerPlayAdvantage >= 2
          ? `${state.powerPlayTeam} has a two-skater advantage`
          : `${state.powerPlayTeam} is on the power play`
      );
    }

    if (
      state?.pulledGoalieTeam
    ) {
      points += state.pulledGoalieTeamId && state.pulledGoalieTeamId === trailingId
        ? (scoreGap <= 1 ? (progress >= .82 ? 8 : 7) : 3)
        : state.pulledGoalieTeamId && state.pulledGoalieTeamId === leadingId
          ? 0
          : scoreGap <= 1 ? 7 : 4;

      note =
        `${state.pulledGoalieTeam} goalie pulled`;

      reasons.push(
        `${state.pulledGoalieTeam} pulled the goalie for an extra attacker`
      );
    }

    if (
      progress >= .82 &&
      scoreGap <= 1
    ) {
      points +=
        progress >= .93
          ? 6
          : 4;

      reasons.push(
        'It is a one-goal game late in the third period'
      );
    }

    const detail =
      String(
        status?.type?.detail ||
        status?.type?.shortDetail ||
        ''
      );

    if (
      /shootout/i.test(detail)
    ) {
      points += 10;

      reasons.push(
        'The game is in a shootout'
      );
    } else if (
      Number(
        status?.period
      ) > 3 ||
      /overtime|\bOT\b/i
        .test(detail)
    ) {
      points += 8;

      reasons.push(
        'The game is in overtime'
      );
    }

    return {
      points:
        Math.min(
          12,
          points
        ),
      note,
      reasons
    };
  }

  function hockeyGoalMilestone(summary) {
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
        if (
          /goalie/i.test(
            group.name ||
            group.displayName ||
            ''
          )
        ) {
          continue;
        }

        const goals =
          (group.labels || [])
            .indexOf('G');

        if (
          goals < 0
        ) {
          continue;
        }

        const scorer =
          (group.athletes || [])
            .filter(entry =>
              Number(
                entry.stats?.[goals]
              ) >= 2
            )
            .sort(
              (a,b) =>
                Number(
                  b.stats[goals]
                ) -
                Number(
                  a.stats[goals]
                )
            )[0];

        if (scorer) {
          const count =
            Number(
              scorer.stats[goals]
            );

          const name =
            scorer.athlete?.displayName ||
            'A player';

          return {
            text:
              count >= 3
                ? `${name} has a hat trick (${count} goals)`
                : `${name} has 2 goals and is one away from a hat trick`,
            points:
              count >= 3
                ? 12
                : 7
          };
        }
      }
    }

    return null;
  }

  function hockeyGameState({gameState,gap,progress,context:footballContext}) {
    const hockeyTeams = footballContext?.teams?.[0]?.[0]
      ? footballContext.teams
      : (footballContext?.competition?.competitors || []).map(item=>[
          item.team?.displayName || item.team?.name || '', '', item.score, '', '', '', null, '', String(item.team?.id || item.id || '')
        ]);
    const hockeySituation = footballContext?.summary
      ? hockeyOnIceState(footballContext.summary,hockeyTeams)
      : null;
    const hockeyScores = hockeyTeams.map(team=>Number(team[2]));
    const hockeyTrailingIndex = hockeyScores.length === 2 && hockeyScores[0] !== hockeyScores[1] ? (hockeyScores[0] < hockeyScores[1] ? 0 : 1) : -1;
    const hockeyTrailingName = hockeyTrailingIndex >= 0 ? String(hockeyTeams[hockeyTrailingIndex][0]).toLowerCase() : '';
    const hockeyTrailingId = hockeyTrailingIndex >= 0 ? String(hockeyTeams[hockeyTrailingIndex][8] || '') : '';
    const hockeyMarginSituation = {
      trailingGoaliePulled:Boolean(hockeyTrailingId && hockeySituation?.pulledGoalieTeamId
        ? hockeySituation.pulledGoalieTeamId === hockeyTrailingId
        : hockeySituation?.pulledGoalieTeam && hockeySituation.pulledGoalieTeam.toLowerCase() === hockeyTrailingName),
      trailingPowerPlay:Boolean(hockeyTrailingId && hockeySituation?.powerPlayTeamId
        ? hockeySituation.powerPlayTeamId === hockeyTrailingId
        : hockeySituation?.powerPlayTeam && hockeySituation.powerPlayTeam.toLowerCase() === hockeyTrailingName)
    };

    return {
      marginClose:gameState === 'live' ? nhlLiveMarginCloseness(gap,progress,hockeyMarginSituation) : undefined,
      minimumComebackViability:gap === 1 ? .82 : 0
    };
  }

  function hockeyEventShock({text,positioned,i,play}) {
    let value = 0;
    let label = '';
    if (/shorthanded goal|short-handed goal/.test(text)) { value=6; label='Shorthanded goal'; }
    return value ? {value,label} : null;
  }

  const nhlModel = {
    unit:'goal',pregame:proPregame,
    gameState:hockeyGameState,
    situation:({game,competition,summary,status,progress,scoreGap}) =>
      hockeySituationImpact(game,competition,summary,status,progress,scoreGap),
    milestone:hockeyGoalMilestone,
    eventShock:hockeyEventShock,
    pressure:{maxGap:2},
    contextAnchors:() => [[0,.40],[.25,.34],[.5,.27],[.67,.21],[.82,.13],[.93,.08],[1,.06]],
    history:{threshold:2,units:'goals'}
  };

  const api = {nhlLiveMarginCloseness,hockeyOnIceState,hockeyPowerPlay,hockeySituationImpact,hockeyGoalMilestone,hockeyGameState,hockeyEventShock,nhlModel};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).sports_nhl = api;
  }
})(globalThis);

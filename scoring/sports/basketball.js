/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {proPregame,marketPregame} = typeof module !== 'undefined' && module.exports
    ? require('../shared/pregame.js')
    : root.SportsRadarScoring.shared_pregame;
  const {collegePregame} = typeof module !== 'undefined' && module.exports
    ? require('../shared/college.js')
    : root.SportsRadarScoring.shared_college;
  const {basketballLiveCloseness,basketballSituationImpact,basketballScoringMilestone} = typeof module !== 'undefined' && module.exports
    ? require('../shared/basketball.js')
    : root.SportsRadarScoring.shared_basketball;

  function basketballLeadChanges({sport,state,flipPositions,currentProgress,basketballDramaBucket,basketballLatePhase,factors,details}) {
    /*
     * Basketball lead changes are common early and become meaningful
     * only as leverage rises. Ignore first-half flips, lightly value
     * middle-game flips, and heavily weight changes in the closing
     * portion of the game.
     */
    const weightedLeadChanges =
      flipPositions.reduce(
        (sum,position) => {
          if (
            position === null ||
            !Number.isFinite(position) ||
            position < .5
          ) {
            return sum;
          }

          if (position < .75) {
            return sum + .5;
          }

          if (position < .875) {
            return sum + 1.5;
          }

          if (position < .95) {
            return sum + 3;
          }

          return sum + 4;
        },
        0
      );

    const leadChangePoints =
      Math.min(
        state === 'completed'
          ? 12
          : 10,
        Math.round(
          weightedLeadChanges
        )
      );

    if (leadChangePoints) {
      const lateLeadChanges =
        flipPositions.filter(
          position =>
            Number.isFinite(position) &&
            position >= .75
        ).length;

      factors.push({
        label:
          lateLeadChanges
            ? `${lateLeadChanges} late lead change${lateLeadChanges === 1 ? '' : 's'}`
            : 'Second-half lead changes',
        points:
          leadChangePoints,
        bucket:
          basketballDramaBucket
      });

      details.push(
        lateLeadChanges
          ? `the lead changed ${lateLeadChanges} time${lateLeadChanges === 1 ? '' : 's'} in the ${basketballLatePhase}`
          : 'the lead changed after halftime'
      );
    }

    /*
     * A burst of lead changes in a short late window is more dramatic
     * than the same number spread across the game. For live games use
     * the most recent 12.5% of regulation; for completed games use the
     * final 12.5% outright.
     */
    const clusterStart =
      state === 'completed'
        ? .875
        : Math.max(
            .75,
            currentProgress -
            .125
          );

    const clusteredLateFlips =
      flipPositions.filter(
        position =>
          Number.isFinite(position) &&
          position >=
          clusterStart
      ).length;

    if (clusteredLateFlips >= 2) {
      const clusterPoints =
        clusteredLateFlips >= 5
          ? 7
          : clusteredLateFlips === 4
            ? 6
            : clusteredLateFlips === 3
              ? 4
              : 2;

      factors.push({
        label:'Late back-and-forth lead changes',
        points:
          clusterPoints,
        bucket:
          basketballDramaBucket
      });

      details.push(
        `${clusteredLateFlips} lead changes came in a compressed late-game window`
      );
    }
  }

  function basketballLateTies({basketball,tiePositions,basketballDramaBucket,basketballLatePhase,factors,details}) {
    if (basketball) {
      const lateTies =
        tiePositions.filter(
          position =>
            position >= .75
        );

      if (lateTies.length) {
        const lastLateTie =
          lateTies.at(-1);

        const tiePoints =
          lastLateTie >= .95
            ? Math.min(
                4,
                2 +
                lateTies.length
              )
            : Math.min(
                3,
                lateTies.length
              );

        factors.push({
          label:
            lateTies.length === 1
              ? 'Late tie'
              : `${lateTies.length} late ties`,
          points:
            tiePoints,
          bucket:
            basketballDramaBucket
        });

        details.push(
          lastLateTie >= .95
            ? 'the game was tied in the final 5% of regulation'
            : `the game was tied ${lateTies.length} time${lateTies.length === 1 ? '' : 's'} in the ${basketballLatePhase}`
        );
      }
    }

  }

  function basketballRankedMatchup({ranks,rankingFactors}) {
    if (ranks.every(rank => rank <= 10)) {
      rankingFactors.push({label:'Both top 10',points:6});
    } else if (ranks.every(rank => rank <= 20)) {
      rankingFactors.push({label:'Both top 20',points:3});
    }
    if (ranks.some(rank => rank <= 10)) {
      rankingFactors.push({label:'Top 10 team',points:3});
    }
  }

  function basketballPregame(sport,competition,competitors,postseason,factors,reason,detail) {
    if (sport === 'NBA') return proPregame(sport,competition,competitors,postseason,factors,reason,detail);
    reason = marketPregame(sport,competition,factors,reason);
    return collegePregame(sport,competition,competitors,postseason,factors,reason,{
      twoRankedPoints:9,rankedPoints:4,topTenPoints:3,matchup:basketballRankedMatchup
    });
  }

  function basketballGameState({sport,gameState,gap,progress,context:footballContext,closeLimit}) {
    const basketballState =
      ['NBA','NCAAB'].includes(sport) && gameState === 'live'
        ? basketballLiveCloseness(sport,gap,progress,footballContext || {})
        : null;

    // Completed NBA margins use the existing wider curve and gradual penalty;
    // live NBA/NCAAB closeness uses remaining possessions and comeback feasibility.
    const completedNba = sport === 'NBA' && gameState === 'completed';
    return {
      basketballState,
      completedCloseLimit:completedNba ? 24 : closeLimit,
      marginClose:basketballState?.close,
      comebackViability:basketballState?.comebackFeasibility,
      stateBase:completedNba ? 23 : undefined,
      closeCeiling:completedNba ? 35 : undefined,
      widePenalty:completedNba
        ? gap !== null && gap >= 20
          ? Math.min(28,Math.round(2 + (gap - 20) * 1.1))
          : 0
        : basketballState
          ? gap !== null && gap >= 4 && basketballState.comebackFeasibility < .45
            ? Math.min(14,Math.round((.45-basketballState.comebackFeasibility)/.45 * 14 * (.5+.5*progress)))
            : 0
          : undefined,
      limitedRunway:Boolean(basketballState && basketballState.comebackFeasibility < .45)
    };
  }

  function basketballEventShock({text,positioned,i,play}) {
    let value = 0;
    let label = '';
    if (/buzzer[- ]beater|at the buzzer|game[- ]tying three|ties the game with (?:a )?three|three.{0,30}(?:ties|tie) the game/.test(text)) { value=10; label='Buzzer-beater or tying three'; }
    return value ? {value,label} : null;
  }

  const nbaModel = {
    duration:48,pregame:basketballPregame,
    gameState:basketballGameState,
    situation:({game,status,progress,scoreGap,situation}) =>
      basketballSituationImpact(game,status,progress,scoreGap,situation),
    milestone:basketballScoringMilestone,
    eventShock:basketballEventShock,
    history:{threshold:10,units:'points',dramaBucket:'basketball-late-drama',dramaCap:15,
      latePhase:'fourth quarter',leadChanges:basketballLeadChanges,lateTies:basketballLateTies}
  };

  const ncaabModel = {
    ...nbaModel,duration:40,
    history:{...nbaModel.history,latePhase:'final 10 minutes'}
  };

  const api = {basketballLeadChanges,basketballLateTies,basketballRankedMatchup,basketballPregame,basketballGameState,basketballEventShock,nbaModel,ncaabModel};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).sports_basketball = api;
  }
})(globalThis);

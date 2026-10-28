/* Shared browser/Worker scoring orchestrator. Sport rules live in scoring/. */
(function (root) {
  const {SPORT_MODELS} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/models.js')
    : root.SportsRadarScoring.models;
  const {eventSignalText,isPostseasonGame,championshipSeriesFactors,playoffSeriesLeverage,specificStakesFactors,pregameContextFactors,completedStakesImpact,contextWeightFor} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/shared/context.js')
    : root.SportsRadarScoring.shared_context;
  const {SPORT_FLOOR,SCHEDULE_SCARCITY,CLOSE_MARGIN,SPORT_BASE,NFL_DIVISIONS,NHL_DIVISIONS,NBA_DIVISIONS,MLB_DIVISIONS,CONTEXT_WEIGHTS} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/shared/config.js')
    : root.SportsRadarScoring.shared_config;
  const {normalizeWinProbability,winProbabilityImpact,winProbabilitySeries} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/shared/probability.js')
    : root.SportsRadarScoring.shared_probability;
  const {gameProgress,livePhase,normalizedTime,eventPosition,ordinal,clockSeconds} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/shared/time.js')
    : root.SportsRadarScoring.shared_time;
  const {underdogCandidate,parseLine,lineFromSummary,listedSpread,moneylinePrices,pregameMarketFactor} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/shared/market.js')
    : root.SportsRadarScoring.shared_market;
  const {upsetImpact:sharedUpsetImpact} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/shared/upset.js')
    : root.SportsRadarScoring.shared_upset;
  const {historyImpact} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/shared/history.js')
    : root.SportsRadarScoring.shared_history;
  const {eventShockFor} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/shared/events.js')
    : root.SportsRadarScoring.shared_events;
  const {pressureImpact} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/shared/pressure.js')
    : root.SportsRadarScoring.shared_pressure;
  const {recordFor,rankFor,recordStats,divisionFor,winningRecord,proRecordFactors} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/shared/records.js')
    : root.SportsRadarScoring.shared_records;
  const {nflDivisionFor,unbeatenStartImpact} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/sports/nfl.js')
    : root.SportsRadarScoring.sports_nfl;
  const {footballStagnationImpact,defensiveFinishFactor,footballMarginCloseness,footballLiveCloseness:sharedFootballLiveCloseness,footballRunwayPenalty,footballFieldPosition,footballSituationImpact,footballMilestone} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/shared/football.js')
    : root.SportsRadarScoring.shared_football;
  const {nhlLiveMarginCloseness,hockeyOnIceState,hockeyPowerPlay,hockeySituationImpact,hockeyGoalMilestone} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/sports/nhl.js')
    : root.SportsRadarScoring.sports_nhl;
  const {mlbLiveMarginCloseness,runnerOn,baseballSituationImpact,noHitBid,baseballPerformanceMilestone} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/sports/mlb.js')
    : root.SportsRadarScoring.sports_mlb;
  const {basketballSituationImpact,basketballScoringMilestone} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/shared/basketball.js')
    : root.SportsRadarScoring.shared_basketball;
  const {tennisSituationImpact} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/sports/tennis.js')
    : root.SportsRadarScoring.sports_tennis;
  const {soccerSituationImpact,soccerScoringMilestone} = typeof module !== 'undefined' && module.exports
    ? require('./scoring/sports/soccer.js')
    : root.SportsRadarScoring.sports_soccer;

  // Retain opening context across the existing browser and Worker adapters.
  // Weak keys release it when each scoreboard snapshot is discarded.
  const liveRatingContexts = new WeakMap();

  // Keep the public API and generic helpers stable while allowing independent
  // sport calibration. Models without these hooks retain the original path.
  function footballLiveCloseness(sport,gap,progress,context=null) {
    return (SPORT_MODELS[sport]?.liveCloseness || sharedFootballLiveCloseness)(sport,gap,progress,context);
  }

  function upsetImpact(candidate,teams,gameState,progress,sport='',competition=null) {
    return SPORT_MODELS[sport]?.upset?.(candidate,teams,gameState,progress,sport,competition) ??
      sharedUpsetImpact(candidate,teams,gameState,progress,sport,competition);
  }

  const clampScore = value =>
    Math.max(1,Math.min(99,Math.round(value)));

  function factorText(factors,score) {
    const parts = factors.map(
      factor =>
        `${factor.label} ${factor.points > 0 ? '+' : ''}${factor.points}`
    );

    if (
      factors.reduce((sum,item) => sum + item.points,0) > 99 &&
      score === 99
    ) {
      parts.push('capped at 99');
    }

    return parts.join(' · ');
  }

  function pregameRating(sport,event,competition,context) {
    const model = SPORT_MODELS[sport] || {};
    const detail =
      eventSignalText(
        event,
        competition,
        context
      );

    const factors = [{
      label:'Sport baseline',
      points:SPORT_FLOOR
    }];

    const scheduleScarcity = SCHEDULE_SCARCITY[sport] || 0;
    if (scheduleScarcity) {
      factors.push({
        label:'Schedule scarcity',
        points:scheduleScarcity
      });
    }

    const mlbPostseasonScarcity = model.postseasonScarcity || 0;
    const postseason = isPostseasonGame(sport,event,competition,detail);
    const championshipSeries = championshipSeriesFactors(sport,competition,detail);

    const majorTournament = model.majorTournament?.(detail);
    let reason =
      'Regular-season matchup · no extra stakes listed';

    if (championshipSeries) {
      factors.push(...championshipSeries);
      reason = 'Championship series';
    } else if (
      /world series/.test(detail)
    ) {
      factors.push({
        label:'World Series',
        points:42
      });

      if (mlbPostseasonScarcity) {
        factors.push({
          label:'Postseason scarcity',
          points:mlbPostseasonScarcity
        });
      }

      reason =
        'World Series championship';
    } else if (
      /super bowl|stanley cup final|champions league final|national championship|grand slam final/
        .test(detail)
    ) {
      factors.push({
        label:'Championship',
        points:40
      });

      reason =
        'Championship game';
    } else if (
      /conference final|league final|finals|championship|title game/
        .test(detail)
    ) {
      factors.push({
        label:'Final round',
        points:30
      });

      reason =
        'Final-round stakes';
    } else if (
      /playoff|postseason|wild card|divisional round|quarterfinal|semifinal|knockout/
        .test(detail) ||
      Number(
        event?.season?.type?.id ??
        event?.season?.type
      ) === 3
    ) {
      factors.push({
        label:'Postseason',
        points:22
      });

      if (mlbPostseasonScarcity) {
        factors.push({
          label:'Postseason scarcity',
          points:mlbPostseasonScarcity
        });
      }

      reason =
        'Postseason game';
    } else if (majorTournament) {
      factors.push(majorTournament.factor);
      reason = majorTournament.reason;
    }

    if (!championshipSeries) {
      const seriesLeverage = playoffSeriesLeverage(sport,competition,detail);
      if (seriesLeverage) factors.push(seriesLeverage);
    }

    if (
      !championshipSeries &&
      factors.length > 1 &&
      /game\s*1\b|game one\b|g1\b/
        .test(detail)
    ) {
      factors.push({
        label:'Series opener',
        points:5
      });

      reason +=
        ' · Game 1';
    }

    const seriesLeverage = playoffSeriesLeverage(sport,competition,detail);
    const specificStakes = championshipSeries ? [] :
      specificStakesFactors(
        sport,
        detail
      ).filter(item => !seriesLeverage || !['Deciding game','Elimination stakes','Clinching opportunity'].includes(item.label));

    if (specificStakes.length) {
      factors.push(
        ...specificStakes
      );

      reason +=
        ` · ${specificStakes
          .map(item => item.label)
          .join(', ')}`;
    }

    const competitors =
      competition?.competitors || [];

    reason = model.pregame
      ? model.pregame(sport,competition,competitors,postseason,factors,reason,detail)
      : reason;

    if (
      /rivalry|rival\b|derby/
        .test(detail) &&
      !factors.some(
        item =>
          item.label.endsWith('matchup')
      )
    ) {
      factors.push({
        label:'Rivalry',
        points:7
      });

      reason +=
        ' · rivalry';
    }

    const contextFactors =
      pregameContextFactors(
        event,
        competition
      );

    if (contextFactors.length) {
      factors.push(
        ...contextFactors
      );

      reason +=
        ' · verified matchup context';
    }

    const rawPregameScore = factors.reduce((sum,item) => sum + item.points,0);
    return {
      score:Math.min(90,clampScore(rawPregameScore)),
      rawPregameScore,
      factors,
      reason,
      contextFactors
    };
  }

  function stateRating(
    openingScore,
    sport,
    gameState,
    gap,
    progress,
    homeWinProbability=null,
    footballContext=null,
    openingFactors=[]
  ) {
    // Every caller, including restored snapshots, uses the capped opening basis.
    openingScore = Math.min(90,openingScore);
    const closeLimit =
      CLOSE_MARGIN[sport] || 10;

    const modelState = SPORT_MODELS[sport]?.gameState?.({
      sport,gameState,gap,progress,context:footballContext,closeLimit
    }) || {};
    const {footballState=null,basketballState=null} = modelState;
    const completedCloseLimit = modelState.completedCloseLimit ?? closeLimit;
    const marginClose = gap === null ? 0 : modelState.marginClose ??
      Math.max(0,1-gap/completedCloseLimit);

    const probability =
      normalizeWinProbability(
        homeWinProbability
      );

    const uncertainty =
      probability === null
        ? null
        : 1 -
          2 *
          Math.abs(
            probability -
            .5
          );

    const close =
      uncertainty === null ||
      gameState === 'completed'
        ? marginClose
        : .3 *
          marginClose +
          .7 *
          Math.min(uncertainty,modelState.uncertaintyCeiling ?? 1);

    // Keep postseason stakes separate from records, market, matchup quality,
    // and ordinary narrative. Those transient factors continue to use the
    // established context decay curve; stakes get their own live viability.
    const persistentStakeLabels =
      /world series|championship|final round|finals|title game|semifinal|postseason|playoff|elimination|clinching|deciding game|winner[- ]take[- ]all|aggregate tie|second-leg consequences/i;
    const persistentStakes =
      gameState === 'live'
        ? Math.min(openingScore,openingFactors
            .filter(item => persistentStakeLabels.test(item.label))
            .reduce((sum,item) => sum + Math.max(0,Number(item.points) || 0),0))
        : 0;

    const contextWeight =
      contextCarryWeight(
        progress,
        gameState,
        sport,
        false
      );

    const transientOpeningScore = Math.max(0,openingScore-persistentStakes);
    const comebackViability = modelState.comebackViability ?? Math.max(
      Math.sqrt(Math.max(0,Math.min(1,marginClose))),
      modelState.minimumComebackViability || 0
    );
    const retainedStakeWeight = .68 * Math.max(0,Math.min(1,comebackViability));
    const retainedContextWeight = contextWeight * (modelState.contextViability ?? 1);
    const contextPoints =
      Math.round(
        transientOpeningScore *
        retainedContextWeight
      );
    const retainedStakePoints = Math.round(persistentStakes * retainedStakeWeight);

    const stateBase = modelState.stateBase ?? (gameState === 'completed' ? 18 : 12);
    const closeCeiling = modelState.closeCeiling ?? (gameState === 'completed'
      ? 24 : 14 + 16 * Math.max(0,Math.min(1,progress)));

    const closePoints =
      Math.round(
        closeCeiling *
        close
      );

    const phasePoints =
      gameState === 'completed'
        ? 0
        : Math.round(
            (
              2 +
              5 *
              progress
            ) *
            close
          );

    const widePenalty = modelState.widePenalty ?? (
      gap !== null && gap >= closeLimit && progress > .3
        ? Math.min(28,Math.round((gap / closeLimit) * 13 * progress))
        : 0
    );

    const factors = [{
      label:'Game-state baseline',
      points:stateBase
    }];

    if (contextPoints) {
      factors.push({
        label:'Pregame context carried into play',
        points:contextPoints
      });
    }

    if (retainedStakePoints) {
      factors.push({label:'Persistent postseason stakes',points:retainedStakePoints});
    }

    if (closePoints) {
      factors.push({
        label:
          gameState === 'completed'
            ? 'Final margin'
            : uncertainty === null
              ? 'Score closeness and leverage'
              : 'Outcome uncertainty and score closeness',
        points:closePoints
      });
    }

    if (phasePoints) {
      factors.push({
        label:'Late-game leverage',
        points:phasePoints
      });
    }

    if (widePenalty) {
      factors.push({
        label:
          modelState.limitedRunway
            ? 'Limited comeback runway'
            : 'Wide margin',
        points:-widePenalty
      });
    }

    return {
      score:
        clampScore(
          factors.reduce(
            (sum,item) =>
              sum + item.points,
            0
          )
        ),

      factors,
      closePoints,
      widePenalty,
      contextWeight,
      retainedContextWeight,
      persistentStakes,
      retainedStakeWeight,
      comebackViability,
      uncertainty,
      footballState,
      basketballState
    };
  }

  function rateGame(
    sport,
    gameState,
    teams,
    event,
    competition,
    context
  ) {
    competition = SPORT_MODELS[sport]?.prepareCompetition?.(competition,event) ?? competition;
    const opening =
      pregameRating(
        sport,
        event,
        competition,
        context
      );

    const factors =
      opening.factors.map(
        item => ({
          ...item
        })
      );

    if (
      gameState === 'upcoming'
    ) {
      return {
        ...opening,
        openingScore:
          opening.score,
        underdog:null,
        upsetText:'',
        upsetPoints:0
      };
    }

    const values =
      teams
        .map(team =>
          Number(team.score)
        )
        .filter(
          Number.isFinite
        );

    const gap =
      values.length === 2
        ? Math.abs(
            values[0] -
            values[1]
          )
        : null;

    const progress =
      gameState === 'completed'
        ? 1
        : gameProgress(
            sport,
            competition
          );

    const championship = (Boolean(SPORT_MODELS[sport]?.championshipContext) && opening.factors.some(item =>
      /world series|championship|final round|finals|title game/i.test(item.label)
    )) || Boolean(gameState === 'live' && SPORT_MODELS[sport]?.decisiveStakes?.(eventSignalText(event,competition,context)));

    const stateValue =
      stateRating(
        opening.score,
        sport,
        gameState,
        gap,
        progress,
        null,
        {
          competition,
          teams,
          championship
        },
        opening.factors
      );

    factors.length = 0;

    factors.push(
      ...stateValue.factors
    );

    const detail =
      `${competition?.status?.type?.detail || ''} ${competition?.status?.type?.shortDetail || ''}`;

    const completedStakes =
      gameState === 'completed'
        ? completedStakesImpact(
            sport,
            event,
            competition,
            context
          )
        : {
            points:0,
            factors:[]
          };

    if (completedStakes.points) {
      factors.push(
        ...completedStakes.factors
      );
    }

    if (
      gameState === 'completed' &&
      !SPORT_MODELS[sport]?.ownsCompletedOvertime && /overtime|\b\d*ot\b/i
        .test(detail)
    ) {
      factors.push({
        label:'Overtime',
        points:13
      });
    }

    const underdog =
      underdogCandidate(
        sport,
        competition,
        competition?.odds?.[0]
      );

    const upset =
      upsetImpact(
        underdog,
        teams,
        gameState,
        progress,
        sport,
        competition
      );

    if (upset.points) {
      factors.push({
        label:
          gameState === 'completed'
            ? 'Underdog won outright'
            : 'Underdog threatens upset',
        points:upset.points
      });
    }

    const completedResult = SPORT_MODELS[sport]?.completedResult?.(sport,gameState,teams,event,competition,context);
    if (completedResult?.points) {
      factors.push(completedResult);
    }

    const score =
      clampScore(
        factors.reduce(
          (sum,item) =>
            sum + item.points,
          0
        )
      );

    let reason =
      opening.reason;

    const unit = SPORT_MODELS[sport]?.unit || 'point';

    if (
      gameState === 'live'
    ) {
      reason =
        gap === 0
          ? `Tied ${teams[0].score}–${teams[1].score}${progress > .65 ? ' late' : ''}`
          : gap !== null &&
            stateValue.closePoints > 0
            ? `${gap}-${unit} game${progress > .65 ? ' late' : ''}`
            : `Game in progress · ${Math.round(progress * 100)}% elapsed`;
    }

    if (
      gameState === 'completed'
    ) {
      reason =
        /overtime|\b\d*ot\b/i
          .test(detail)
          ? `Overtime finish · ${gap}-${unit} margin`
          : gap !== null
            ? `Decided by ${gap} ${unit}${gap === 1 ? '' : 's'}`
            : 'Final result';
    }

    if (
      gameState === 'live' &&
      competition?.status
    ) {
      liveRatingContexts.set(competition.status,{
        openingScore:opening.score,
        openingFactors:opening.factors,
        championshipStakes:championship,
        underdog,
        competition
      });
    }

    return {
      score,
      factors,
      reason,
      openingScore:
        opening.score,
      rawPregameScore:opening.rawPregameScore,
      openingFactors:opening.factors,
      ...(championship ? {championshipStakes:true} : {}),
      underdog,
      upsetText:
        upset.text,
      upsetPoints:
        upset.points,
      contextFactors:
        opening.contextFactors || []
    };
  }

  function liveMilestone(sport,summary) {
    return SPORT_MODELS[sport]?.milestone?.(summary,sport) ?? null;
  }

  function liveSnapshot(
    game,
    competition,
    summary
  ) {
    const status =
      competition?.status ||
      game.liveRawStatus;

    const situation =
      competition?.situation ||
      game.liveRawSituation ||
      {};

    const snapshot = {
      phase:
        livePhase(
          game.sport,
          status,
          competition?.format || game.sourceCompetition?.format || game.sourceEvent?.competitions?.[0]?.format || game.format
        ),

      note:'',
      reasons:[],
      bonus:0,
      bases:null,
      winProbability:null,

      components:{
        probability:0,
        situation:0,
        pressure:0,
        milestone:0,
        eventShock:0
      }
    };

    const progress =
      gameProgress(
        game.sport,
        {
          ...competition,
          status
        }
      );

    const scoreGap =
      Math.abs(
        Number(
          game.teams?.[0]?.[2]
        ) -
        Number(
          game.teams?.[1]?.[2]
        )
      );

    const probability =
      summary
        ? winProbabilityImpact(
            summary,
            progress,
            'live',
            game.sport
          )
        : {
            points:0,
            text:'',
            probability:null,
            uncertainty:null
          };

    snapshot.winProbability =
      probability.probability;

    snapshot.components.probability =
      probability.points;

    if (
      probability.text
    ) {
      snapshot.reasons.push(
        probability.text
      );
    }

    const sportImpact = SPORT_MODELS[game.sport]?.situation?.({
      game,competition,summary,status,situation,progress,scoreGap
    }) || {points:0,note:'',reasons:[],bases:null};

    if (
      sportImpact.note
    ) {
      snapshot.note =
        sportImpact.note;
    }

    if (
      sportImpact.bases
    ) {
      snapshot.bases =
        sportImpact.bases;
    }

    snapshot.reasons.push(
      ...(
        sportImpact.reasons ||
        []
      )
    );

    snapshot.components.situation =
      Math.min(
        12,
        Math.max(
          0,
          Number(
            sportImpact.points
          ) ||
          0
        )
      );

    const pressure =
      dangerousChanceImpact(
        game.sport,
        summary,
        progress,
        scoreGap,
        competition
      );

    snapshot.components.pressure =
      pressure.points;

    snapshot.reasons.push(
      ...(pressure.reasons || [])
    );

    const milestone =
      summary
        ? (SPORT_MODELS[game.sport]?.liveMilestone?.(summary,{game,competition,status,progress,scoreGap}) ?? liveMilestone(
            game.sport,
            summary
          ))
        : null;

    if (
      milestone
    ) {
      snapshot.reasons.push(
        milestone.text
      );

      snapshot.components.milestone =
        Math.min(
          14,
          Math.max(
            0,
            milestone.points
          )
        );
    }

    const shock = eventShockImpact(game.sport,summary,status);
    snapshot.components.eventShock = Math.max(0,Math.min(12,shock.points));
    if (snapshot.components.eventShock) snapshot.reasons.push(...shock.reasons);

    const probabilityPositive =
      Math.max(
        0,
        snapshot.components.probability
      );

    const probabilityNegative =
      Math.min(
        0,
        snapshot.components.probability
      );

    // An active tying or winning drive has immediate competitive leverage
    // even when the leader's win probability is high. Keep that estimate
    // untouched. NFL decisive states can raise the competitive floor beyond
    // the ordinary cap; overlapping situation/probability points still use max.
    const driveFloor = sportImpact.decisiveDrive
      ? Math.round(
          sportImpact.decisiveDrive.urgency *
          (18 + Math.min(2,sportImpact.decisiveDrive.positionBonus))
        )
      : 0;
    const decisiveFloor = game.sport === 'NFL' || SPORT_MODELS[game.sport]?.decisiveFloor ? Math.max(0,Number(sportImpact.competitiveFloor) || 0) : 0;
    const competitiveSituation =
      SPORT_MODELS[game.sport]?.decisiveFloor && decisiveFloor > 0 ? decisiveFloor : Math.min(
        Math.max(20,decisiveFloor),
        Math.max(
          driveFloor,
          Number(sportImpact.competitiveFloor) || 0,
          probabilityPositive +
          snapshot.components.situation +
          snapshot.components.pressure
        )
      );

    const positiveBonus =
      Math.min(
        Math.max(30,decisiveFloor),
        competitiveSituation +
        snapshot.components.milestone +
        snapshot.components.eventShock
      );

    const negativeBonus =
      Math.max(
        -8,
        probabilityNegative
      );

    snapshot.bonus =
      decisiveFloor > 0
        ? Math.max(decisiveFloor,positiveBonus + negativeBonus)
        : positiveBonus + negativeBonus;

    // Sport-owned floors consume already-earned context and live leverage.
    const liveFloor = SPORT_MODELS[game.sport]?.liveFloor?.({game,competition,progress,scoreGap});
    if (Number.isFinite(liveFloor) && liveFloor>0) snapshot.bonus = Math.max(snapshot.bonus,Math.round(liveFloor)-game.baseScore);

    return snapshot;
  }

  function refreshLiveState(game,competition,summary,validateOnly=false) {
    const context =
      liveRatingContexts.get(
        game.liveRawStatus
      ) ||
      liveRatingContexts.get(
        competition?.status
      );

    const previous = {
      ...(
        context?.competition ||
        game.sourceCompetition
      ),

      status:
        game.liveRawStatus ||
        context?.competition?.status,

      situation:
        game.liveRawSituation ||
        context?.competition?.situation
    };

    // The scoreboard is the live authority.  A summary may enrich it, but it
    // must never become the source of score, clock, possession, or situation.
    const candidate = competition || previous;
    const summaryCandidate = summary?.header?.competitions?.[0];
    const validationCandidate = summaryCandidate || candidate;

    const type =
      validationCandidate.status?.type;

    const competitors =
      validationCandidate.competitors ||
      [];

    const matched =
      game.teams.map(team => {
        const id =
          String(
            team[8] ||
            team.id ||
            ''
          );

        if (id) {
          return competitors.find(item =>
            String(
              item.team?.id ||
              item.athlete?.id ||
              item.id ||
              ''
            ) === id
          );
        }

        const names =
          competitors.filter(item =>
            (
              item.team?.displayName ||
              item.athlete?.displayName
            ) === team[0]
          );

        return names.length === 1
          ? names[0]
          : undefined;
      });

    const wrongTeams =
      competitors.length > 0 &&
      matched.some(team =>
        !team
      );

    // A summary at the same nominal clock can still be one scoring play
    // behind. Its win probability then describes a different game state.
    const summaryScoreConflict = Boolean(summaryCandidate && candidate.competitors) &&
      game.teams.some(team => {
        const id = String(team[8] || team.id || '');
        const find = items => items.find(item => id
          ? String(item.team?.id || item.athlete?.id || item.id || '') === id
          : (item.team?.displayName || item.athlete?.displayName) === team[0]);
        const fromSummary = find(summaryCandidate.competitors || []);
        const fromScoreboard = find(candidate.competitors || []);
        return Number.isFinite(Number(fromSummary?.score)) &&
          Number.isFinite(Number(fromScoreboard?.score)) &&
          Number(fromSummary.score) !== Number(fromScoreboard.score);
      });

    const older =
      previous.status?.period &&
      validationCandidate.status?.period &&
      gameProgress(
        game.sport,
        validationCandidate
      ) <
      gameProgress(
        game.sport,
        previous
      );

    const lastAccepted = game.summaryState;
    const summaryRegressed = Boolean(summaryCandidate && lastAccepted?.status) &&
      gameProgress(game.sport,summaryCandidate) < gameProgress(game.sport,lastAccepted);

    const rejected =
      wrongTeams ||
      summaryScoreConflict ||
      older ||
      summaryRegressed ||
      type?.completed === true ||
      (
        type?.state &&
        type.state !== 'in'
      );

    if (validateOnly) return Boolean(summaryCandidate?.status) && !rejected;

    game.lastSummaryAccepted = Boolean(summary) && !rejected;

    if (game.lastSummaryAccepted && summaryCandidate) {
      game.summaryState = {
        status:summaryCandidate.status,
        competitors:(summaryCandidate.competitors || []).map(team => ({
          team:{id:team.team?.id || team.athlete?.id || team.id || ''},
          score:team.score
        }))
      };
    }

    const current =
      rejected
        ? previous
        : {
            ...previous,
            ...candidate,

            status:
              candidate.status ||
              previous.status,

            situation:
              candidate.status
                ? candidate.situation ||
                  {}
                : previous.situation
          };

    if (
      !rejected &&
      matched.length === 2 &&
      matched.every(team =>
        team &&
        team.score != null &&
        team.score !== '' &&
        Number.isFinite(
          Number(team.score)
        )
      )
    ) {
      // Scores always come from the scoreboard candidate, never the summary.
      const scoreboardCompetitors = candidate.competitors || [];
      const scoreboardMatched = candidate === validationCandidate
        ? matched
        : game.teams.map(team => {
            const id = String(team[8] || team.id || '');
            if (id) return scoreboardCompetitors.find(item => String(item.team?.id || item.athlete?.id || item.id || '') === id);
            const names = scoreboardCompetitors.filter(item => (item.team?.displayName || item.athlete?.displayName) === team[0]);
            return names.length === 1 ? names[0] : undefined;
          });
      if (scoreboardMatched.some(team => !team)) return {competition:current,summary:rejected ? null : summary};
      scoreboardMatched.forEach(
        (team,index) => {
          game.teams[index][2] =
            String(team.score);

          if (
            'score' in
            game.teams[index]
          ) {
            game.teams[index].score =
              String(team.score);
          }
        }
      );
    }

    const openingScore = Math.min(90,
      game.openingScore ??
      context?.openingScore);

    const openingFactors = game.openingFactors || context?.openingFactors || [];

    if (game.championshipStakes || context?.championshipStakes) game.championshipStakes = true;
    else delete game.championshipStakes;

    if (
      Number.isFinite(
        openingScore
      )
    ) {
      const gap =
        Math.abs(
          Number(
            game.teams[0][2]
          ) -
          Number(
            game.teams[1][2]
          )
        );

      const progress =
        gameProgress(
          game.sport,
          current
        );

      const state =
        stateRating(
          openingScore,
          game.sport,
          'live',
          Number.isFinite(gap)
            ? gap
            : null,
          progress,
          null,
          {
            competition:current,
            teams:game.teams,
            championship:game.championshipStakes,
            situation:current.situation,
            summary:rejected ? null : summary
          },
          openingFactors
        );

      const underdog =
        game.underdog ||
        context?.underdog;

      const upset =
        upsetImpact(
          underdog,
          game.teams,
          'live',
          progress,
          game.sport,
          current
        );

      const factors = [
        ...state.factors
      ];

      if (
        upset.points
      ) {
        factors.push({
          label:
            'Underdog threatens upset',
          points:
            upset.points
        });
      }

      game.baseScore =
        clampScore(
          factors.reduce(
            (sum,item) =>
              sum +
              item.points,
            0
          )
        );

      game.factors =
        factors;

      game.openingScore =
        openingScore;

      game.openingFactors = openingFactors;

      game.underdog =
        underdog;

      game.upsetPoints =
        upset.points;

      game.upsetText =
        upset.text;

      const unit = SPORT_MODELS[game.sport]?.unit || 'point';

      game.why =
        gap === 0
          ? `Tied ${game.teams[0][2]}–${game.teams[1][2]}${progress > .65 ? ' late' : ''}`
          : state.closePoints > 0
            ? `${gap}-${unit} game${progress > .65 ? ' late' : ''}`
            : `Game in progress · ${Math.round(progress * 100)}% elapsed`;

      if (
        current.status
      ) {
        liveRatingContexts.set(
          current.status,
          {
            openingScore,
            underdog,
            competition:current
          }
        );
      }
    }

    game.liveRawStatus =
      current.status;

    game.liveRawSituation =
      current.situation;

    game.status =
      current.status?.type?.shortDetail ||
      current.status?.type?.detail ||
      game.status;

    return {
      competition:current,
      summary:
        rejected
          ? null
          : summary
    };
  }

  function applyLiveSnapshot(
    game,
    competition,
    summary
  ) {
    if (
      game.state !== 'live'
    ) {
      return;
    }

    const current =
      refreshLiveState(
        game,
        competition,
        summary
      );

    game.live =
      liveSnapshot(
        game,
        current.competition,
        current.summary
      );

    game.score =
      clampScore(
        game.baseScore +
        game.live.bonus
      );
  }

  function momentumImpact(sport,summary,progress,state,completedContext=null) {
    const history = SPORT_MODELS[sport]?.historyImpact
      ? SPORT_MODELS[sport].historyImpact(summary,progress,state)
      : historyImpact(sport,summary,progress,state,SPORT_MODELS[sport]?.history);
    // The optional adapter context supplies the actual base and finishing award.
    // Standalone histories, public arity, and every non-completed path stay intact.
    return state === 'completed' && completedContext
      ? SPORT_MODELS[sport]?.completedHistory?.(summary,history,completedContext) ?? history
      : history;
  }

  function contextCarryWeight(progress,gameState,sport='',championship=false) {
    const anchors = SPORT_MODELS[sport]?.contextAnchors?.(championship) || [
            [0,.38],
            [.25,.30],
            [.5,.20],
            [.75,.12],
            [.9,.08],
            [1,.06]
          ];
    return contextWeightFor(progress,gameState,anchors);
  }

  function eventShockImpact(sport,summary,status) {
    return eventShockFor(sport,summary,status,SPORT_MODELS[sport]);
  }

  function dangerousChanceImpact(sport,summary,progress,scoreGap,competition=null) {
    return pressureImpact(summary,progress,scoreGap,competition,SPORT_MODELS[sport]?.pressure);
  }

  const api = {
    SPORT_FLOOR,
    SCHEDULE_SCARCITY,
    SPORT_BASE,
    NFL_DIVISIONS,
    NHL_DIVISIONS,
    NBA_DIVISIONS,
    MLB_DIVISIONS,
    CONTEXT_WEIGHTS,
    CLOSE_MARGIN,
    clampScore,
    factorText,
    recordFor,
    rankFor,
    recordStats,
    parseLine,
    lineFromSummary,
    eventSignalText,
    nflDivisionFor,
    divisionFor,
    winningRecord,
    listedSpread,
    moneylinePrices,
    pregameMarketFactor,
    proRecordFactors,
    pregameContextFactors,
    specificStakesFactors,
    completedStakesImpact,
    pregameRating,
    gameProgress,
    normalizedTime,
    eventPosition,
    normalizeWinProbability,
    winProbabilitySeries,
    winProbabilityImpact,
    footballStagnationImpact,
    momentumImpact,
    defensiveFinishFactor,
    underdogCandidate,
    upsetImpact,
    unbeatenStartImpact,
    contextCarryWeight,
    nhlLiveMarginCloseness,
    mlbLiveMarginCloseness,
    footballMarginCloseness,
    footballLiveCloseness,
    footballRunwayPenalty,
    stateRating,
    rateGame,
    ordinal,
    livePhase,
    runnerOn,
    clockSeconds,
    footballFieldPosition,
    footballSituationImpact,
    baseballSituationImpact,
    hockeyOnIceState,
    hockeyPowerPlay,
    hockeySituationImpact,
    basketballSituationImpact,
    tennisSituationImpact,
    dangerousChanceImpact,
    eventShockImpact,
    soccerSituationImpact,
    noHitBid,
    hockeyGoalMilestone,
    footballMilestone,
    basketballScoringMilestone,
    baseballPerformanceMilestone,
    soccerScoringMilestone,
    liveMilestone,
    liveSnapshot,
    applyLiveSnapshot
  };

  // Detail validation shares chronology rules without extending the scoring API.
  root.SportsRadarDetail = {
    validateLiveSummary:(game,competition,summary) => refreshLiveState(game,competition,summary,true)
  };
  root.SportsRadarScore = api;

  if (
    typeof module !== 'undefined' &&
    module.exports
  ) {
    module.exports = api;
  }
})(globalThis);

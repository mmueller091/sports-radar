/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {eventPosition} = typeof module !== 'undefined' && module.exports
    ? require('./time.js')
    : root.SportsRadarScoring.shared_time;
  const {winProbabilitySeries} = typeof module !== 'undefined' && module.exports
    ? require('./probability.js')
    : root.SportsRadarScoring.shared_probability;

  function historyImpact(
    sport,
    summary,
    progress,
    state,
    history={},
    options={}
  ) {
    if (
      state === 'upcoming'
    ) {
      return {
        points:0,
        text:'',
        factors:[]
      };
    }

    const plays =
      summary?.scoringPlays?.length
        ? summary.scoringPlays
        : (summary?.plays || [])
            .filter(
              play =>
                play.scoringPlay === true
            );

    const moments =
      plays
        .map(play => {
          const home =
            Number(play.homeScore);

          const away =
            Number(play.awayScore);

          const period =
            Number(
              play.period?.number ||
              play.period ||
              0
            );

          const position =
            period
              ? eventPosition(
                  sport,
                  {
                    status:{
                      period,
                      displayClock:
                        play.clock?.displayValue ||
                        '',
                      clock:play.clock?.value,
                      type:{
                        detail:
                          play.period?.displayValue ||
                          ''
                      }
                    }
                  }
                )
              : null;

          return (
            Number.isFinite(home) &&
            Number.isFinite(away)
          )
            ? {
                home,
                away,
                position,
                text:
                  String(
                    play.text ||
                    play.shortText ||
                    ''
                  )
              }
            : null;
        })
        .filter(Boolean)
        .sort(
          (a,b) =>
            (a.position ?? 0) -
            (b.position ?? 0)
        );

    const threshold = history.threshold || 7;
    const units = history.units || 'points';

    const competitors =
      summary?.header
        ?.competitions?.[0]
        ?.competitors ||
      [];

    const nameFor =
      side =>
        competitors.find(
          item =>
            item.homeAway === side
        )?.team?.displayName ||
        (
          side === 'home'
            ? 'The home team'
            : 'The away team'
        );

    const possessive =
      name =>
        `${name}${/s$/i.test(name) ? "'" : "'s"}`;

    const currentProgress =
      state === 'completed'
        ? 1
        : Math.max(
            0,
            Math.min(
              1,
              Number(progress) || 0
            )
          );

    let previousLeader = 0;
    let leadChanges = 0;
    let lastFlip = -1;

    const flipPositions = [];
    const tiePositions = [];

    let deepestHomeDeficit = 0;
    let deepestAwayDeficit = 0;
    let comeback = null;

    let previousHome = 0;
    let previousAway = 0;

    let runSide = '';
    let runPoints = 0;
    let runCount = 0;
    let runUsefulPoints = 0;
    let cfbRun = null;

    for (const moment of moments) {
      const margin =
        moment.home -
        moment.away;

      deepestHomeDeficit =
        Math.max(
          deepestHomeDeficit,
          -margin
        );

      deepestAwayDeficit =
        Math.max(
          deepestAwayDeficit,
          margin
        );

      if (
        margin >= 0 &&
        deepestHomeDeficit >= threshold &&
        (
          !comeback ||
          deepestHomeDeficit >
          comeback.deficit
        )
      ) {
        comeback = {
          side:'home',
          deficit:
            deepestHomeDeficit
        };
      }

      if (
        margin <= 0 &&
        deepestAwayDeficit >= threshold &&
        (
          !comeback ||
          deepestAwayDeficit >
          comeback.deficit
        )
      ) {
        comeback = {
          side:'away',
          deficit:
            deepestAwayDeficit
        };
      }

      const leader =
        Math.sign(margin);

      if (
        margin === 0 &&
        moment.position !== null &&
        Number.isFinite(moment.position)
      ) {
        tiePositions.push(
          moment.position
        );
      }

      if (
        leader &&
        previousLeader &&
        leader !== previousLeader
      ) {
        leadChanges++;

        lastFlip =
          moment.position ?? -1;

        flipPositions.push(
          lastFlip
        );
      }

      if (leader) {
        previousLeader =
          leader;
      }

      const homeGain =
        moment.home -
        previousHome;

      const awayGain =
        moment.away -
        previousAway;

      const scorer =
        homeGain > 0 &&
        awayGain === 0
          ? 'home'
          : awayGain > 0 &&
            homeGain === 0
            ? 'away'
            : '';

      if (scorer) {
        if (
          runSide !== scorer
        ) {
          runSide = scorer;
          runPoints = 0;
          runCount = 0;
          runUsefulPoints = 0;
        }

        const before = scorer === 'home' ? previousHome-previousAway : previousAway-previousHome;
        const gain = scorer === 'home' ? homeGain : awayGain;
        // Count recovery and the score that first takes a one-possession lead.
        // Subsequent scores extending that lead are not a second comeback.
        if (before <= 0) runUsefulPoints += Math.min(gain,-before+8);

        runPoints +=
          scorer === 'home'
            ? homeGain
            : awayGain;

        runCount++;
      } else {
        runSide = '';
        runPoints = 0;
        runCount = 0;
        runUsefulPoints = 0;
      }

      previousHome =
        moment.home;

      previousAway =
        moment.away;
    }

    const factors = [];
    const details = [];
    const basketball = Boolean(history.dramaBucket);
    const basketballLatePhase = history.latePhase;
    const basketballDramaBucket = history.dramaBucket;

    if (leadChanges) {
      if (basketball) {
        history.leadChanges({sport,state,flipPositions,currentProgress,basketballDramaBucket,basketballLatePhase,factors,details});
      } else {
        const points =
          state === 'live'
            ? Math.min(
                7,
                flipPositions.reduce(
                  (sum,position) =>
                    sum +
                    (
                      position >=
                      currentProgress -
                      .1
                        ? 3
                        : position >=
                          currentProgress -
                          .25
                          ? 2
                          : 1
                    ),
                  0
                )
              )
            : Math.min(
                9,
                leadChanges * 3
              );

        factors.push({
          label:
            `${leadChanges} lead change${leadChanges === 1 ? '' : 's'}`,
          points
        });

        details.push(
          `the lead changed ${leadChanges} time${leadChanges === 1 ? '' : 's'}`
        );
      }
    }

    if (comeback) {
      factors.push({
        label:'Erased a large deficit',
        points:
          Math.min(
            8,
            4 +
            Math.floor(
              comeback.deficit /
              threshold
            ) *
            2
          )
      });

      details.push(
        `${nameFor(comeback.side)} erased a deficit of ${comeback.deficit} ${units}`
      );
    }

    if (
      !basketball &&
      lastFlip >= .65 &&
      currentProgress -
      lastFlip <= .16
    ) {
      factors.push({
        label:'Recent late lead change',
        points:5
      });

      details.push(
        'the lead flipped late'
      );
    }

    history.lateTies?.({basketball,tiePositions,basketballDramaBucket,basketballLatePhase,factors,details});

    const latestPosition =
      moments.at(-1)?.position ??
      null;

    if (
      state === 'live' &&
      runCount >= 2 &&
      runPoints >= threshold &&
      latestPosition !== null &&
      currentProgress -
      latestPosition <= .1
    ) {
      const points = sport === 'CFB' && options.cfbCompetitionHistory
        ? Math.round(4*Math.min(1,runUsefulPoints/runPoints)) : 4;
      if (sport === 'CFB' && options.cfbCompetitionHistory) cfbRun = {
        side:runSide,runPoints,usefulPoints:runUsefulPoints,rawPoints:4,points,overlapDiscount:4-points
      };
      if (points) factors.push({label:'Recent unanswered scoring run',points});

      details.push(
        `${nameFor(runSide)} scored ${runPoints} unanswered ${units} recently`
      );
    }

    if (
      !(state === 'live' && options.replaceSustained) &&
      moments.length >= 3 &&
      currentProgress >= .4
    ) {
      let competitiveTime = 0;
      let priorPosition = 0;
      let priorMargin = 0;

      for (const moment of moments) {
        const position =
          Math.min(
            currentProgress,
            Math.max(
              priorPosition,
              moment.position ??
              priorPosition
            )
          );

        if (
          Math.abs(priorMargin) <=
          threshold
        ) {
          competitiveTime +=
            position -
            priorPosition;
        }

        priorPosition =
          position;

        priorMargin =
          moment.home -
          moment.away;
      }

      if (
        Math.abs(priorMargin) <=
        threshold
      ) {
        competitiveTime +=
          Math.max(
            0,
            currentProgress -
            priorPosition
          );
      }

      const competitiveShare =
        currentProgress
          ? competitiveTime /
            currentProgress
          : 0;

      if (
        competitiveShare >= .55
      ) {
        const points =
          state === 'completed'
            ? (
                competitiveShare >= .75
                  ? 7
                  : 5
              )
            : 3;

        factors.push({
          label:'Sustained competitive game',
          points
        });

        details.push(
          `the score stayed within ${threshold} ${units} for about ${Math.round(competitiveShare * 100)}% of the game`
        );
      }
    }

    const winChances =
      winProbabilitySeries(
        summary
      );

    let controlSwings = 0;
    let controlSide = 0;

    for (const chance of winChances) {
      const side =
        chance >= .65
          ? 1
          : chance <= .35
            ? -1
            : 0;

      if (
        side &&
        controlSide &&
        side !== controlSide
      ) {
        controlSwings++;
      }

      if (side) {
        controlSide = side;
      }
    }

    if (
      controlSwings >= 2 &&
      leadChanges < 2
    ) {
      factors.push({
        label:'Repeated swings in control',
        points:
          Math.min(
            7,
            3 +
            controlSwings
          ),
        bucket:
          basketball
            ? basketballDramaBucket
            : undefined
      });

      details.push(
        `win probability swung decisively between both teams ${controlSwings} times`
      );
    }

    let strongestSwing = {
      size:0,
      end:-1,
      direction:0
    };

    for (
      let end = 1;
      end < winChances.length;
      end++
    ) {
      for (
        let start =
          Math.max(
            0,
            end - 10
          );
        start < end;
        start++
      ) {
        const change =
          winChances[end] -
          winChances[start];

        if (
          Math.abs(change) >
          strongestSwing.size
        ) {
          strongestSwing = {
            size:
              Math.abs(change),
            end,
            direction:
              Math.sign(change)
          };
        }
      }
    }

    if (
      strongestSwing.size >= .2
    ) {
      const points =
        Math.min(
          state === 'completed'
            ? 9
            : 7,
          Math.round(
            strongestSwing.size *
            15
          ) +
          (
            state === 'live' &&
            strongestSwing.end >=
            winChances.length -
            10
              ? 1
              : 0
          )
        );

      factors.push({
        label:'Big win-chance swing',
        points,
        bucket:
          basketball
            ? basketballDramaBucket
            : undefined
      });

      details.push(
        `${possessive(nameFor(strongestSwing.direction > 0 ? 'home' : 'away'))} estimated win chance swung by ${Math.round(strongestSwing.size * 100)} percentage points`
      );
    }

    if (
      state === 'completed' &&
      winChances.length >= 8
    ) {
      const uncertainties =
        winChances.map(
          probability =>
            1 -
            2 *
            Math.abs(
              probability -
              .5
            )
        );

      const averageUncertainty =
        uncertainties.reduce(
          (sum,value) =>
            sum + value,
          0
        ) /
        uncertainties.length;

      const lateSlice =
        uncertainties.slice(
          Math.max(
            0,
            Math.floor(
              uncertainties.length *
              .75
            )
          )
        );

      const lateUncertainty =
        lateSlice.length
          ? lateSlice.reduce(
              (sum,value) =>
                sum + value,
              0
            ) /
            lateSlice.length
          : 0;

      if (
        averageUncertainty >= .58
      ) {
        factors.push({
          label:'Competitive throughout',
          points:6
        });

        details.push(
          'win probability stayed balanced for much of the game'
        );
      } else if (
        averageUncertainty >= .45
      ) {
        factors.push({
          label:'Competitive for much of game',
          points:4
        });
      }

      if (
        lateUncertainty >= .65
      ) {
        factors.push({
          label:'High late uncertainty',
          points:5,
          bucket:
            basketball
              ? basketballDramaBucket
              : undefined
        });

        details.push(
          'the outcome remained highly uncertain late'
        );
      }
    }

    if (
      state === 'completed' &&
      moments.length
    ) {
      const decisive =
        moments.at(-1);

      const prior =
        moments.length > 1
          ? moments.at(-2)
          : {
              home:0,
              away:0
            };

      const finalMargin =
        decisive.home -
        decisive.away;

      const priorMargin =
        prior.home -
        prior.away;

      const finalLeader =
        Math.sign(finalMargin);

      const changedOutcome =
        finalLeader &&
        (
          priorMargin === 0 ||
          Math.sign(priorMargin) !==
            finalLeader
        );

      if (
        decisive.position >= .94 &&
        changedOutcome &&
        Math.abs(finalMargin) <= threshold
      ) {
        factors.push({
          label:'Decisive final score',
          points:8,
          bucket:
            basketball
              ? basketballDramaBucket
              : undefined
        });

        details.push(
          decisive.text
            ? `the decisive score came at the end: ${decisive.text}`
            : 'the decisive score came in the final moments'
        );
      }
    }

    // Shadow-only ownership replacement is injected before shared/bucket caps.
    // Default callers and completed scoring retain their original calculation.
    if (state === 'live' && options.replaceSustained && options.trajectoryPositive > 0) {
      factors.push({label:'Trajectory sustained history',points:options.trajectoryPositive});
    }
    // Explicit experimental callers only. Scale raw competition-history
    // allocations before global/bucket caps; current milestones live elsewhere.
    const relevance = state === 'live' && Number.isFinite(options.liveRelevance)
      ? Math.max(0,Math.min(1,options.liveRelevance)) : null;
    const allocations = [];
    // Reserve removed run credit so WP swings or trajectory cannot refill it.
    const cap =
      state === 'completed'
        ? 25
        : 15-(cfbRun?.overlapDiscount || 0)*(relevance ?? 1);

    let remaining =
      cap;

    const bucketRemaining =
      new Map();

    if (basketball) {
      bucketRemaining.set(
        basketballDramaBucket,
        history.dramaCap
      );
    }

    const cappedFactors =
      factors
        .map(factor => {
          const bucketLimit =
            factor.bucket &&
            bucketRemaining.has(
              factor.bucket
            )
              ? bucketRemaining.get(
                  factor.bucket
                )
              : remaining;

          const points =
            Math.min(
              Math.max(
                0,
                factor.points * (relevance ?? 1)
              ),
              remaining,
              bucketLimit
            );

          remaining -=
            points;

          if (relevance !== null) allocations.push({label:factor.label,
            rawPoints:factor.points,relevantPoints:factor.points*relevance,retainedPoints:points,
            relevanceReduction:factor.points*(1-relevance),capReduction:factor.points*relevance-points});

          if (
            factor.bucket &&
            bucketRemaining.has(
              factor.bucket
            )
          ) {
            bucketRemaining.set(
              factor.bucket,
              bucketLimit -
              points
            );
          }

          const {
            bucket,
            ...visibleFactor
          } = factor;

          return {
            ...visibleFactor,
            points
          };
        })
        .filter(
          factor =>
            factor.points > 0
        );

    const stagnation =
      history.stagnation?.(
        sport,
        summary,
        currentProgress,
        state
      ) || {points:0,text:''};

    if (
      stagnation.points
    ) {
      cappedFactors.push({
        label:
          'Offensive stagnation',
        points:
          -stagnation.points
      });

      details.push(
        stagnation.text
      );
    }

    return {
      ...(cfbRun ? {cfbRun} : {}),
      ...(relevance === null ? {} : {relevance:{retention:relevance,cap,
        bucketCap:basketball ? history.dramaCap : null,factors:allocations}}),
      points:
        cap -
        remaining -
        stagnation.points,

      text:
        details
          .join('; ')
          .replace(
            /^[a-z]/,
            character =>
              character.toUpperCase()
          ),

      factors:
        cappedFactors
    };
  }

  const api = {historyImpact};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).shared_history = api;
  }
})(globalThis);

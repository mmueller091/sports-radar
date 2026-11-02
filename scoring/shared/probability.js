/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {gameProgress,eventPosition} = typeof module !== 'undefined' && module.exports
    ? require('./time.js')
    : root.SportsRadarScoring.shared_time;

  function normalizeWinProbability(value) {
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return null;
    }

    let probability =
      Number(value);

    if (
      !Number.isFinite(probability)
    ) {
      return null;
    }

    if (
      probability > 1 &&
      probability <= 100
    ) {
      probability /= 100;
    }

    return (
      probability >= 0 &&
      probability <= 1
    )
      ? probability
      : null;
  }

  const winProbabilityFor = item => normalizeWinProbability(
    item?.homeWinPercentage ?? item?.homeWinProbability ??
    item?.homeWinPct ?? item?.value
  );

  function winProbabilitySeries(summary) {
    return (
      summary?.winprobability ||
      []
    )
      .map(winProbabilityFor)
      .filter(
        value =>
          value !== null
      );
  }

  function winProbabilityObservations(sport,summary) {
    const plays = summary?.plays || [];
    const playsById = new Map(plays
      .filter(play => play?.id != null)
      .map(play => [String(play.id),play]));

    return (summary?.winprobability || []).map((item,index) => {
      const probability = winProbabilityFor(item);
      const play = item?.playId == null ? null : playsById.get(String(item.playId));
      const timed = play || item;
      const period = Number(timed?.period?.number || timed?.period || 0);
      const rawPosition = period ? eventPosition(sport,{status:{
        period,
        displayClock:timed?.clock?.displayValue || timed?.displayClock || '',
        clock:timed?.clock?.value ?? timed?.clockValue,
        ...(sport === 'NHL' ? {clockMode:'elapsed'} : {}),
        type:{detail:timed?.period?.displayValue || timed?.periodText || ''}
      }}) : Number(item?.position ?? item?.gameProgress);
      const position = Number.isFinite(rawPosition)
        ? Math.max(0,rawPosition)
        : null;
      return probability === null ? null : {probability,position,index,playId:item?.playId ?? null};
    }).filter(Boolean);
  }

  function winProbabilityImpact(summary,progress,state='live',sport='') {
    const competition =
      summary?.header?.competitions?.[0];

    const summaryStatus =
      competition?.status?.type;

    const estimate =
      (summary?.winprobability || [])
        .filter(item => winProbabilityFor(item) !== null)
        .at(-1);

    const estimatePlay =
      estimate?.playId == null
        ? null
        : (summary?.plays || []).find(play =>
            String(play.id) === String(estimate.playId)
          );

    // A prediction for an earlier score or a finished game is not a live
    // estimate. Keep valid one-sided predictions, even in close games.
    const scoreChanged =
      estimatePlay &&
      (competition?.competitors || []).some(team => {
        const value = team.homeAway === 'home'
          ? estimatePlay.homeScore
          : team.homeAway === 'away'
            ? estimatePlay.awayScore
            : null;
        return value != null && team.score != null &&
          Number.isFinite(Number(value)) &&
          Number.isFinite(Number(team.score)) &&
          Number(value) !== Number(team.score);
      });

    const estimatePeriod =
      Number(estimatePlay?.period?.number || 0);

    const estimateProgress =
      sport && estimatePeriod
        ? gameProgress(sport,{
            status:{
              period:estimatePeriod,
              displayClock:estimatePlay.clock?.displayValue,
              type:{detail:estimatePlay.period?.displayValue}
            }
          })
        : null;

    if (
      state !== 'live' ||
      summaryStatus?.completed === true ||
      summaryStatus?.state === 'post' ||
      summaryStatus?.state === 'pre' ||
      scoreChanged ||
      /end (?:of )?game/i.test(
        `${estimatePlay?.type?.text || ''} ${estimatePlay?.text || ''}`
      ) ||
      (
        estimateProgress !== null &&
        Math.abs(Number(progress) - estimateProgress) > .05
      )
    ) {
      return {
        points:0,
        text:'',
        probability:null,
        uncertainty:null
      };
    }

    const series =
      winProbabilitySeries(summary);

    if (!series.length) {
      return {
        points:0,
        text:'',
        probability:null,
        uncertainty:null
      };
    }

    const probability =
      series.at(-1);

    const uncertainty =
      Math.max(
        0,
        1 -
        2 *
        Math.abs(
          probability -
          .5
        )
      );

    const p =
      Math.max(
        0,
        Math.min(
          1,
          Number(progress) || 0
        )
      );

    const leverageWeight =
      .35 +
      .65 *
      Math.pow(
        p,
        1.5
      );

    const bonus =
      Math.round(
        16 *
        uncertainty *
        leverageWeight
      );

    let penalty = 0;

    if (
      p >= .55 &&
      uncertainty < .35
    ) {
      penalty =
        Math.round(
          (
            (
              .35 -
              uncertainty
            ) /
            .35
          ) *
          12 *
          (
            .4 +
            .6 * p
          )
        );
    }

    const points =
      Math.max(
        -8,
        Math.min(
          16,
          bonus -
          penalty
        )
      );

    const pct =
      Math.round(
        probability *
        100
      );

    let text = '';

    if (
      uncertainty >= .8
    ) {
      text =
        `Win probability is nearly even (${pct}% / ${100-pct}%)`;
    } else if (
      uncertainty >= .55 &&
      p >= .65
    ) {
      text =
        `The outcome is still highly uncertain (${pct}% / ${100-pct}%)`;
    } else if (
      points < 0
    ) {
      text =
        `The feed estimates a one-sided outcome (${pct}% / ${100-pct}%)`;
    }

    return {
      points,
      text,
      probability,
      uncertainty
    };
  }

  const api = {normalizeWinProbability,winProbabilitySeries,winProbabilityObservations,winProbabilityImpact};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).shared_probability = api;
  }
})(globalThis);

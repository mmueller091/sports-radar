/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {clockSeconds} = typeof module !== 'undefined' && module.exports
    ? require('./time.js')
    : root.SportsRadarScoring.shared_time;

  function basketballLiveCloseness(sport,gap,progress,context={}) {
    if (!['NBA','NCAAB'].includes(sport) || !Number.isFinite(Number(gap))) return null;
    const points = Math.max(0,Number(gap));
    const marginClose = Math.max(0,1-points/24);
    const status = context.competition?.status || context.status || {};
    const seconds = clockSeconds(status);
    if (seconds === null) return {close:marginClose,marginClose,comebackFeasibility:1,expectedPossessions:null,requiredPossessions:Math.ceil(points/3)};
    const regulationPeriods = sport === 'NCAAB' ? 2 : 4;
    const periodLength = sport === 'NCAAB' ? 20 : 12;
    const period = Number(status.period || 0);
    const remaining = period > regulationPeriods ? seconds : seconds + Math.max(0,regulationPeriods-period) * periodLength * 60;
    const situation = context.situation || context.competition?.situation || {};
    const teams = context.teams || [];
    const scores = teams.map(team=>Number(Array.isArray(team) ? team[2] : team.score));
    const trailingIndex = scores.length === 2 && scores[0] !== scores[1] ? (scores[0] < scores[1] ? 0 : 1) : -1;
    const trailingId = trailingIndex >= 0 ? String(Array.isArray(teams[trailingIndex]) ? teams[trailingIndex][8] || '' : teams[trailingIndex].team?.id || teams[trailingIndex].id || '') : '';
    const possessionId = String(situation.possession?.id || situation.possession || '');
    let expectedPossessions = remaining / 24 + .5;
    if (possessionId && trailingId) expectedPossessions += possessionId === trailingId ? .65 : -.65;
    const timeoutSource = situation.timeoutsRemaining || situation.timeouts || {};
    const rawCompetitor = (context.competition?.competitors || []).find(item=>String(item.team?.id || item.id || '')===trailingId);
    const trailingSide = rawCompetitor?.homeAway || (Array.isArray(teams[trailingIndex]) ? teams[trailingIndex]?.[7] : teams[trailingIndex]?.homeAway) || '';
    const rawTimeouts = rawCompetitor?.timeoutsRemaining ?? rawCompetitor?.timeouts?.remaining ?? rawCompetitor?.timeouts;
    const trailingTimeouts = Number(timeoutSource[trailingId] ?? timeoutSource[trailingSide] ?? situation[`${trailingSide}TimeoutsRemaining`] ?? rawTimeouts);
    if (Number.isFinite(trailingTimeouts)) expectedPossessions += Math.min(2,Math.max(0,trailingTimeouts)) * .4;
    expectedPossessions = Math.max(0,expectedPossessions);
    const requiredPossessions = Math.ceil(points/3);
    const slack = expectedPossessions-requiredPossessions;
    const comebackFeasibility = requiredPossessions === 0 ? 1 : 1/(1+Math.exp(-2*(slack+.4)));
    const close = marginClose * (.25 + .75*comebackFeasibility);
    return {close,marginClose,comebackFeasibility,expectedPossessions,requiredPossessions,slack};
  }

  function basketballSituationImpact(game,status,progress,scoreGap,situation={}) {
    let points = 0;
    const reasons = [];
    const seconds = clockSeconds(status);
    const regulationPeriods = game.sport === 'NCAAB' ? 2 : 4;
    const possessionId = String(situation.possession?.id || situation.possession || '');
    const holderIndex = possessionId ? game.teams.findIndex(team => String(team[8] || '') === possessionId) : -1;
    const holder = holderIndex >= 0 ? game.teams[holderIndex] : null;
    const other = holderIndex >= 0 ? game.teams[1-holderIndex] : null;
    const holderScore = holder ? Number(holder[2]) : NaN;
    const otherScore = other ? Number(other[2]) : NaN;
    const finalPossession = seconds !== null &&
      Number(status?.period) >= regulationPeriods &&
      scoreGap <= 3 && holder &&
      Number.isFinite(holderScore) && Number.isFinite(otherScore) &&
      holderScore <= otherScore && seconds < 40
        ? {urgency:Math.max(0,Math.min(1,(40-seconds)/28))}
        : null;

    if (progress >= .78 && scoreGap <= 6) {
      if (scoreGap === 0) points += progress >= .9 ? 9 : 6;
      else if (scoreGap <= 3) points += progress >= .9 ? 7 : 5;
      else points += 3;
      reasons.push(scoreGap === 0 ? 'The game is tied late' : `It is a ${scoreGap}-point game late`);
    }

    if (seconds !== null && Number(status?.period) >= regulationPeriods && seconds <= 24 && scoreGap <= 3) {
      if (holder && Number.isFinite(holderScore) && Number.isFinite(otherScore) && holderScore <= otherScore) {
        points += 5;
        reasons.push(`${holder[0]} has a potential tying or go-ahead final possession`);
      } else {
        points += 3;
        reasons.push('The game may come down to the final possession');
      }
    }

    if (Number(status?.period) > regulationPeriods) {
      points += 6;
      reasons.push('The game is in overtime');
    }

    return {points:Math.min(12,points),note:holder ? `${holder[1] || holder[0]} possession` : '',reasons,
      competitiveFloor:finalPossession ? Math.round(20*finalPossession.urgency) : 0,
      finalPossession};
  }

  function basketballScoringMilestone(
    summary,
    sport
  ) {
    const threshold =
      sport === 'NCAAB'
        ? 30
        : 40;

    let leader = null;

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
        const points =
          (group.labels || [])
            .findIndex(label =>
              /^PTS$|^POINTS$/i
                .test(label)
            );

        if (
          points < 0
        ) {
          continue;
        }

        for (
          const entry of
          group.athletes ||
          []
        ) {
          const count =
            Number(
              entry.stats?.[points]
            );

          if (
            count >= threshold &&
            (
              !leader ||
              count > leader.count
            )
          ) {
            leader = {
              count,
              name:
                entry.athlete?.displayName ||
                'A player'
            };
          }
        }
      }
    }

    if (!leader) {
      return null;
    }

    const rare =
      leader.count >=
      (
        sport === 'NCAAB'
          ? 40
          : 50
      );

    return {
      text:
        `${leader.name} has scored ${leader.count} points`,
      points:
        rare
          ? 12
          : 7
    };
  }

  const api = {basketballLiveCloseness,basketballSituationImpact,basketballScoringMilestone};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).shared_basketball = api;
  }
})(globalThis);

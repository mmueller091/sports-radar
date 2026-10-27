/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {aggregateScoreFromText} = typeof module !== 'undefined' && module.exports
    ? require('../shared/context.js')
    : root.SportsRadarScoring.shared_context;
  const {normalizedTime} = typeof module !== 'undefined' && module.exports
    ? require('../shared/time.js')
    : root.SportsRadarScoring.shared_time;

  function soccerSituationImpact(competition,summary,status,progress,scoreGap) {
    const situation =
      competition?.situation ||
      summary?.situation ||
      {};

    const text = [
      status?.type?.detail,
      status?.type?.shortDetail,
      status?.displayClock,
      situation?.description,
      situation?.displayValue,
      ...(competition?.notes || []).map(note => note.headline),
      competition?.series?.summary,
      competition?.series?.title
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const cardCounts = (summary?.boxscore?.teams || []).map(team => ({
      id:String(team.team?.id || team.id || ''),
      count:(team.statistics || [])
        .filter(stat => /redcards|red cards|\brc\b/i.test(
          `${stat.name || ''} ${stat.displayName || ''} ${stat.abbreviation || ''}`))
        .reduce((sum,stat) => sum + (Number(stat.value ?? stat.displayValue) || 0),0)
    }));
    const cardsById = new Map(cardCounts.filter(team => team.id).map(team => [team.id,team.count]));
    const teamRedCards = cardCounts.reduce((sum,team) => sum + team.count,0);
    const scoredTeams = (competition?.competitors || [])
      .map(item => ({id:String(item.team?.id || item.id || ''),score:Number(item.score)}));
    const haveCardDirection = scoredTeams.length === 2 &&
      scoredTeams.every(team => team.id && Number.isFinite(team.score)) &&
      scoredTeams[0].score !== scoredTeams[1].score &&
      scoredTeams.some(team => cardsById.has(team.id));

    let points = 0;
    const reasons = [];

    if (
      teamRedCards > 0 ||
      /\bred card\b|\bsent off\b|\bdown to (?:ten|10)\b/.test(text)
    ) {
      const generic = progress >= .55 && scoreGap <= 1 ? 5 : 3;
      const leader = haveCardDirection
        ? scoredTeams[scoredTeams[0].score > scoredTeams[1].score ? 0 : 1]
        : null;
      const trailer = haveCardDirection
        ? scoredTeams[scoredTeams[0].score < scoredTeams[1].score ? 0 : 1]
        : null;
      const cardDifference = leader
        ? ((cardsById.get(leader.id) || 0) - (cardsById.get(trailer.id) || 0))
        : 0;
      points += scoreGap <= 1 && progress >= .55 && cardDifference !== 0
        ? (cardDifference > 0 ? 7 : 2)
        : generic;

      reasons.push(
        'A red card has changed the match conditions'
      );
    }

    const aggregate =
      aggregateScoreFromText(text);

    if (aggregate) {
      const aggregateGap =
        Math.abs(
          aggregate[0] -
          aggregate[1]
        );

      if (aggregateGap <= 1) {
        points +=
          progress >= .7
            ? 6
            : 4;

        reasons.push(
          aggregateGap === 0
            ? 'The knockout tie is level on aggregate'
            : 'The knockout tie is separated by one goal on aggregate'
        );
      }
    }

    if (
      /penalty shootout|penalties|shootout/
        .test(text)
    ) {
      points += 10;

      reasons.push(
        'The match is being decided by penalties'
      );
    } else if (
      (/stoppage time|added time|90'?\+\d+/.test(text) ||
        Number(status?.period) === 2 && normalizedTime('Soccer',{status}).elapsedSeconds > 90 * 60) &&
      scoreGap <= 1
    ) {
      points += 3;

      reasons.push(
        'A close match is in stoppage time'
      );
    }

    return {
      points:Math.min(12,points),
      note:'',
      reasons
    };
  }

  function soccerScoringMilestone(summary) {
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
        const goals =
          (group.labels || [])
            .findIndex(label =>
              /^G$|^GOALS$/i
                .test(label)
            );

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
                  b.stats?.[goals]
                ) -
                Number(
                  a.stats?.[goals]
                )
            )[0];

        if (scorer) {
          const count =
            Number(
              scorer.stats[goals]
            );

          return {
            text:
              count >= 3
                ? `${scorer.athlete?.displayName || 'A player'} has a hat trick`
                : `${scorer.athlete?.displayName || 'A player'} has scored twice`,
            points:
              count >= 3
                ? 12
                : 6
          };
        }
      }
    }

    return null;
  }

  function soccerPressureWeight(points,scoreGap,dangerous,competition) {
    if (scoreGap === 1 && dangerous.length) {
      const teams = (competition?.competitors || [])
        .map(item => ({id:String(item.team?.id || item.id || ''),score:Number(item.score)}));
      if (teams.length === 2 && teams.every(team => team.id && Number.isFinite(team.score))) {
        const trailingId = teams[teams[0].score < teams[1].score ? 0 : 1].id;
        const leadingId = teams[teams[0].score > teams[1].score ? 0 : 1].id;
        const trailing = dangerous.filter(play => play.teamId === trailingId).length;
        const leading = dangerous.filter(play => play.teamId === leadingId).length;
        points = Math.round(points * (1 + .4*trailing/dangerous.length - .6*leading/dangerous.length));
      }
    }

    return points;
  }

  const soccerModel = {
    unit:'goal',duration:90,
    situation:({competition,summary,status,progress,scoreGap}) =>
      soccerSituationImpact(competition,summary,status,progress,scoreGap),
    milestone:soccerScoringMilestone,
    pressure:{maxGap:1,weight:soccerPressureWeight},
    history:{threshold:2,units:'goals'}
  };

  const api = {soccerSituationImpact,soccerScoringMilestone,soccerPressureWeight,soccerModel};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).sports_soccer = api;
  }
})(globalThis);

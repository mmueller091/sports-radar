/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {lineFromSummary,parseLine} = typeof module !== 'undefined' && module.exports
    ? require('./market.js')
    : root.SportsRadarScoring.shared_market;
  const {ordinal,clockSeconds} = typeof module !== 'undefined' && module.exports
    ? require('./time.js')
    : root.SportsRadarScoring.shared_time;

  function defensiveFinishFactor(sport,summary) {
    if (!['NFL','CFB'].includes(sport)) return null;
    const competition = summary?.header?.competitions?.[0];
    const teams = competition?.competitors || [];
    const home = teams.find(team => team.homeAway === 'home');
    const away = teams.find(team => team.homeAway === 'away');
    if (!home || !away) return null;

    const drives = [...(summary?.drives?.previous || []),...(summary?.drives?.current ? [summary.drives.current] : [])];
    const plays = summary?.plays?.length ? summary.plays : drives.flatMap(drive =>
      (drive.plays || []).map(play => ({...play,driveTeam:drive.team?.id})));
    const textFor = play => String(play?.text || play?.shortText || '');
    const administrative = play => /kneel|end of (?:game|quarter|period)|timeout|two.minute warning/i.test(textFor(play));
    const offenseFor = play => String(play?.start?.team?.id || play?.driveTeam || '');
    const turnover = /intercept(?:ed|ion)|fumble.*(?:lost|recover)|turnover on downs|defensive stop/i;

    // Match the adapter's existing decisive-scoring award. A finish gets one kind of credit.
    const scoring = summary?.scoringPlays?.length ? summary.scoringPlays : plays.filter(play => play.scoringPlay === true);
    const lastScore = scoring.at(-1);
    const scoringText = `${lastScore?.clock?.displayValue || ''} ${textFor(lastScore)}`;
    if (/(0:00|last second|game[- ]winning)/i.test(scoringText) &&
        /field goal|goal|home run|touchdown/i.test(scoringText)) return null;

    for (let index = plays.length - 1; index >= 0; index--) {
      const play = plays[index];
      const text = textFor(play);
      if (administrative(play) || play.scoringPlay) continue;
      const fourthDown = Number(play.start?.down) === 4 || /\b4th\b|fourth.down/i.test(text);
      if (!turnover.test(text) && !(fourthDown && /incomplete|stopped|no gain|sack/i.test(text))) continue;
      if (/nullified|no play|overturned/i.test(text)) continue;

      const offense = offenseFor(play);
      const offenseHome = offense === String(home.team?.id);
      if (!offense || (!offenseHome && offense !== String(away.team?.id))) continue;
      const finalMargin = Number(home.score) - Number(away.score);
      if (!Number.isFinite(finalMargin) || (offenseHome ? finalMargin >= 0 : finalMargin <= 0)) continue;
      const previous = plays[index - 1];
      const homeScore = Number(play.homeScore ?? previous?.homeScore);
      const awayScore = Number(play.awayScore ?? previous?.awayScore);
      const deficit = offenseHome ? awayScore - homeScore : homeScore - awayScore;
      if (!Number.isFinite(deficit) || deficit < 0 || deficit > 8) continue;

      const later = plays.slice(index + 1).filter(item => !administrative(item));
      // Reject another chance for the trailing offense, another score/turnover,
      // or an unknown later possession. Ordinary winning-team clock runouts are fine.
      if (later.some(item => !offenseFor(item) || offenseFor(item) === offense || item.scoringPlay || turnover.test(textFor(item)))) continue;
      const changedPossession = play.end?.team?.id && String(play.end.team.id) !== offense;
      const lostBall = /intercept(?:ed|ion)|turnover on downs|fumble.*lost/i.test(text) || changedPossession || fourthDown;
      if (!lostBall && !/defensive stop.*(?:seal|end.*game)|(?:seal|end.*game).*defensive stop/i.test(text)) continue;

      const period = Number(play.period?.number || play.period || 0);
      const clock = String(play.clock?.displayValue || '').match(/^(\d+):(\d{2})$/);
      const seconds = clock ? Number(clock[1]) * 60 + Number(clock[2]) : Infinity;
      const late = period > 4 || (period === 4 && seconds <= 120);
      const explicitFinal = period >= 4 && /final (?:meaningful )?possession|seals? (?:the )?(?:game|win)|game[- ]sealing/i.test(text);
      if (!late && !explicitFinal) continue;

      const endZone = /intercept(?:ed|ion)/i.test(text) && /end zone|endzone/i.test(text);
      const yards = Number(play.start?.yardsToEndzone);
      const redZone = (Number.isFinite(yards) && yards >= 0 && yards <= 20) || /goal.to.go|\band goal\b|red zone/i.test(text);
      return {label:'Decisive defensive finish',points:endZone ? 14 : redZone ? 12 : 9};
    }
    return null;
  }

  function footballStagnationImpact(
    sport,
    summary,
    progress,
    state='live'
  ) {
    if (
      !['NFL','CFB'].includes(sport) ||
      !summary ||
      (state !== 'completed' && !(sport === 'NFL' && state === 'live' && progress >= .65))
    ) {
      return {
        points:0,
        text:''
      };
    }

    const p =
      state === 'completed'
        ? 1
        : Math.max(
            0,
            Math.min(
              1,
              Number(progress) || 0
            )
          );

    const competition =
      summary?.header
        ?.competitions?.[0];

    const scores =
      (competition?.competitors || [])
        .map(team =>
          Number(team?.score)
        )
        .filter(Number.isFinite);

    const combinedScore =
      scores.length === 2
        ? scores[0] + scores[1]
        : null;

    const normalize =
      value =>
        String(value || '')
          .toLowerCase()
          .replace(
            /[^a-z0-9]/g,
            ''
          );

    const statMaps =
      (summary?.boxscore?.teams || [])
        .map(team =>
          new Map(
            (team.statistics || [])
              .map(stat => [
                normalize(
                  stat.name ||
                  stat.abbreviation ||
                  stat.label ||
                  stat.displayName
                ),
                stat
              ])
              .filter(([name]) =>
                Boolean(name)
              )
          )
        );

    const findStat =
      (map,names) => {
        for (const name of names) {
          const stat =
            map.get(
              normalize(name)
            );

          if (stat) {
            return stat;
          }
        }

        return null;
      };

    const numberValue =
      stat => {
        if (!stat) {
          return null;
        }

        const direct =
          Number(stat.value);

        if (
          Number.isFinite(direct)
        ) {
          return direct;
        }

        const match =
          String(
            stat.displayValue ?? ''
          ).match(
            /-?\d+(?:\.\d+)?/
          );

        return match
          ? Number(match[0])
          : null;
      };

    const efficiency =
      stat => {
        if (!stat) {
          return null;
        }

        const text =
          String(
            stat.displayValue ?? ''
          );

        const match =
          text.match(
            /(\d+)\s*[-/]\s*(\d+)/
          );

        if (match) {
          const made =
            Number(match[1]);

          const attempts =
            Number(match[2]);

          return {
            rate:
              attempts
                ? made / attempts
                : 0,
            attempts
          };
        }

        const value =
          numberValue(stat);

        if (value === null) {
          return null;
        }

        return {
          rate:
            Math.max(
              0,
              Math.min(
                1,
                value > 1
                  ? value / 100
                  : value
              )
            ),
          attempts:null
        };
      };

    const average =
      values => {
        const usable =
          values.filter(
            Number.isFinite
          );

        return usable.length
          ? usable.reduce(
              (sum,value) =>
                sum + value,
              0
            ) /
            usable.length
          : null;
      };

    const yardsPerPlay =
      average(
        statMaps.map(map =>
          numberValue(
            findStat(
              map,
              [
                'yardsPerPlay',
                'yardsPerPlayAverage'
              ]
            )
          )
        )
      );

    const thirdDowns =

      statMaps
        .map(map =>
          efficiency(
            findStat(
              map,
              [
                'thirdDownEff',
                'thirdDownEfficiency'
              ]
            )
          )
        )
        .filter(Boolean);

    const thirdDownRate =
      thirdDowns.length
        ? average(
            thirdDowns.map(
              item =>
                item.rate
            )
          )
        : null;

    const redZones =
      statMaps
        .map(map =>
          efficiency(
            findStat(
              map,
              [
                'redZoneAttempts',
                'redZoneEfficiency',
                'redZoneEff'
              ]
            )
          )
        )
        .filter(Boolean);

    const redZoneAttempts =
      redZones.length &&
      redZones.every(item =>
        Number.isFinite(
          item.attempts
        )
      )
        ? redZones.reduce(
            (sum,item) =>
              sum +
              item.attempts,
            0
          )
        : null;

    const redZoneTouchdowns =
      redZoneAttempts !== null
        ? redZones.reduce(
            (sum,item) =>
              sum +
              item.rate *
              item.attempts,
            0
          )
        : null;

    const drives = [
      ...(summary?.drives?.previous || []),
      ...(
        state === 'completed' && summary?.drives?.current
          ? [summary.drives.current]
          : []
      )
    ].filter(drive =>
      drive &&
      drive.isCurrent !== true &&
      !/end of (?:half|game)|kneel/i
        .test(
          String(
            drive.result ||
            drive.description ||
            ''
          )
        )
    );

    const puntRate =
      drives.length >= 4
        ? drives.filter(drive =>
            /punt/i.test(
              String(
                drive.result ||
                drive.description ||
                ''
              )
            )
          ).length /
          drives.length
        : null;

    const puntTotal =
      (summary?.boxscore?.players || [])
        .flatMap(block =>
          (block.statistics || [])
            .filter(group =>
              group.name === 'punting'
            )
            .flatMap(group =>
              (group.athletes || [])
                .map(athlete =>
                  Number(
                    athlete.stats?.[0]
                  ) || 0
                )
            )
        )
        .reduce(
          (sum,value) =>
            sum + value,
          0
        );

    const clamp01 =
      value =>
        Math.max(
          0,
          Math.min(
            1,
            value
          )
        );

    const signals = [];

    if (
      combinedScore !== null
    ) {
      const total =
        [
          lineFromSummary(
            summary,
            sport
          )?.total,
          parseLine(
            competition?.odds?.[0],
            competition,
            sport
          )?.total,
          parseLine(
            summary?.odds?.[0],
            competition,
            sport
          )?.total
        ].find(value =>
          Number.isFinite(value) &&
          value > 0
        );

      const expectedLowEnd =
        (
          total !== undefined
            ? total
            : sport === 'CFB'
              ? 28
              : 22
        ) * p;

      signals.push({
        label:'very little scoring',
        weight:.30,
        value:
          expectedLowEnd
            ? clamp01(
                (
                  expectedLowEnd -
                  combinedScore
                ) /
                expectedLowEnd
              )
            : 0
      });
    }

    if (
      yardsPerPlay !== null
    ) {
      signals.push({
        label:'low yards per play',
        weight:.25,
        value:
          clamp01(
            (
              4.9 -
              yardsPerPlay
            ) /
            1.4
          )
      });
    }

    if (
      puntRate !== null
    ) {
      signals.push({
        label:'repeated empty possessions',
        weight:.20,
        value:
          clamp01(
            (
              puntRate -
              .35
            ) /
            .40
          )
      });
    } else if (
      puntTotal
    ) {
      signals.push({
        label:'repeated punts',
        weight:.15,
        value:
          clamp01(
            (
              puntTotal -
              6
            ) / 6
          )
      });
    }

    if (
      redZoneAttempts !== null
    ) {
      const expected =
        (
          sport === 'CFB'
            ? 5
            : 4
        ) *
        p;

      const fewOpportunities =
        expected
          ? clamp01(
              (
                expected -
                redZoneAttempts
              ) /
              expected
            )
          : 0;

      const failedConversions =
        redZoneAttempts
          ? clamp01(
              (
                .5 -
                redZoneTouchdowns /
                redZoneAttempts
              ) / .5
            ) *
            clamp01(
              redZoneAttempts / 3
            )
          : 0;

      signals.push({
        label:
          failedConversions > fewOpportunities
            ? 'poor red-zone touchdown conversion'
            : 'few scoring opportunities',
        weight:.15,
        value:
          Math.max(
            fewOpportunities,
            failedConversions
          )
      });
    }

    if (
      thirdDownRate !== null
    ) {
      signals.push({
        label:'poor third-down offense',
        weight:.10,
        value:
          clamp01(
            (
              .34 -
              thirdDownRate
            ) /
            .22
          )
      });
    }

    const scoringPlays =
      summary?.scoringPlays || [];

    if (
      scoringPlays.length >= 4
    ) {
      signals.push({
        label:'no touchdowns',
        weight:.10,
        value:
          scoringPlays.some(play =>
            /touchdown/i.test(
              `${play.text || ''} ${play.type?.text || ''}`
            )
          )
            ? 0
            : 1
      });
    }

    // Low scoring by itself is not enough. Require several independent signs
    // that both offenses are failing to create meaningful action.
    const meaningful =
      signals.filter(
        signal =>
          signal.value >= .35
      );

    if (
      (state === 'live' ? meaningful.filter(signal => signal.label !== 'no touchdowns').length : meaningful.length) < 3
    ) {
      return {
        points:0,
        text:''
      };
    }

    const totalWeight =
      signals.reduce(
        (sum,signal) =>
          sum +
          signal.weight,
        0
      );

    let index =
      totalWeight
        ? signals.reduce(
            (sum,signal) =>
              sum +
              signal.value *
              signal.weight,
            0
          ) /
          totalWeight
        : 0;

    // Defensive playmaking can make a low-scoring game entertaining, so
    // turnovers, sacks, fourth-down drama, blocks and explosive plays soften
    // the penalty without erasing genuine prolonged stagnation.
    let action = 0;

    const defensivePlays =
      summary?.plays?.length
        ? summary.plays
        : (summary?.drives?.previous || [])
            .flatMap(drive =>
              drive.plays || []
            );

    for (
      const play of
      defensivePlays
    ) {
      const text =
        String(
          play.text ||
          play.shortText ||
          play.type?.text ||
          ''
        ).toLowerCase();

      if (state === 'live' && /no play|nullified|overturned/i.test(text)) continue;

      if (
        /intercept(?:ed|ion)|fumble.*(?:lost|recover)/
          .test(text)
      ) {
        action += .75;

        const returnYards =
          Number(
            text.match(
              /return(?:ed)?(?: for)?\s+(\d+)\s+yards/
            )?.[1] || 0
          );

        if (
          returnYards >= 20
        ) {
          action += 3;
        }

        if (
          Number(
            play.period?.number ||
            play.period
          ) >= 4 &&
          Number.isFinite(
            Number(play.homeScore)
          ) &&
          Number.isFinite(
            Number(play.awayScore)
          ) &&
          Math.abs(
            Number(play.homeScore) -
            Number(play.awayScore)
          ) <= 8
        ) {
          action += 2;
        }
      }

      if (
        /\bsack(?:ed)?\b/
          .test(text)
      ) {
        action += .5;
      }

      if (
        (state === 'live'
          ? /turnover on downs|stopped on fourth|fourth.down stop/.test(text) ||
            (Number(play.start?.down) === 4 && /incomplete|no gain|sack/.test(text))
          : /turnover on downs|4th down|fourth down|stopped on fourth/.test(text))
      ) {
        action += 2;
      }

      if (
        /blocked (?:punt|field goal|kick)|\bsafety\b/
          .test(text)
      ) {
        action += 5;
      }

      if (
        /defensive touchdown|interception return.*touchdown|fumble return.*touchdown/
          .test(text)
      ) {
        action += 8;
      }

      const yards =
        Number(
          play.statYardage ??
          play.yards ??
          play.statYards
        );

      if (
        Number.isFinite(yards) &&
        Math.abs(yards) >= 20
      ) {
        action += 1;
      }
    }

    const severeCompleted =
      meaningful.length >= 5;

    if (state === 'live') {
      // Boxscore evidence may cover more plays than a partial play feed.
      // Take the larger evidence estimate; never add the same action twice.
      const statAction = statMaps.reduce((sum,map) => sum + [
        [['turnovers'],.75], [['sacks'],.5], [['fourthDownStops'],2],
        [['blockedKicks','kicksBlocked'],5], [['safeties'],5],
        [['defensiveTouchdowns'],8], [['explosivePlays'],1]
      ].reduce((value,[names,weight]) => value+Math.max(0,numberValue(findStat(map,names)) || 0)*weight,0),0);
      action = Math.max(action,statAction);
    }

    index *=
      1 -
      Math.min(
        state === 'live' ? 1 : severeCompleted
          ? .9
          : .25,
        state === 'live' ? action / 12 : severeCompleted
          ? action / 24
          : action / 40
      );

    if (
      index < .45
    ) {
      return {
        points:0,
        text:''
      };
    }

    const progressMultiplier =
      state === 'completed'
        ? 1
        : clamp01((p-.65)/.20);

    const cap =
      state === 'live' ? 10 : severeCompleted
        ? 36
        : 20;

    const points =
      Math.max(
        state === 'live' ? 0 : 1,
        Math.round(
          cap *
          progressMultiplier *
          index
        )
      );

    const strongest =
      [...signals]
        .sort(
          (a,b) =>
            b.value -
            a.value
        )
        .filter(
          signal =>
            signal.value >= .35
        )
        .slice(0,3)
        .map(
          signal =>
            signal.label
        );

    return {
      points,
      text:
        `Offensive stagnation: ${strongest.join(', ')}`
    };
  }

  function footballMarginCloseness(gap) {
    if (
      gap === null ||
      !Number.isFinite(Number(gap))
    ) {
      return 0;
    }

    const points =
      Math.max(
        0,
        Number(gap)
      );

    const anchors = [
      [0,1],
      [3,.98],
      [8,.90],
      [9,.82],
      [11,.72],
      [14,.58],
      [16,.52],
      [24,.28],
      [32,0]
    ];

    if (points <= anchors[0][0]) {
      return anchors[0][1];
    }

    for (
      let i = 1;
      i < anchors.length;
      i++
    ) {
      if (points <= anchors[i][0]) {
        const [x0,y0] = anchors[i-1];
        const [x1,y1] = anchors[i];
        const t =
          (points - x0) /
          (x1 - x0);

        return (
          y0 +
          (y1 - y0) * t
        );
      }
    }

    return 0;
  }

  function footballCompetitorId(item) {
    return String(
      item?.team?.id ||
      item?.id ||
      ''
    );
  }

  function footballCompetitorAbbreviation(item) {
    return String(
      item?.team?.abbreviation ||
      item?.abbreviation ||
      ''
    ).toUpperCase();
  }

  function footballSituationFieldPosition(
    situation,
    holderAbbr
  ) {
    const text =
      `${situation?.possessionText || ''} ${situation?.downDistanceText || ''} ${situation?.shortDownDistanceText || ''}`
        .toUpperCase();

    const match =
      text.match(
        /\b([A-Z]{2,4})\s+(\d{1,2})\b/
      );

    if (!match) {
      return /\b50\b/.test(text)
        ? 50
        : null;
    }

    const code = match[1];
    const yard = Number(match[2]);

    if (
      !Number.isFinite(yard) ||
      yard < 0 ||
      yard > 50
    ) {
      return null;
    }

    return code === holderAbbr
      ? yard
      : 100 - yard;
  }

  function footballLiveCloseness(
    sport,
    gap,
    progress,
    context=null
  ) {
    const points =
      Number(gap);

    if (
      !['NFL','CFB'].includes(sport) ||
      !Number.isFinite(points)
    ) {
      return null;
    }

    const p =
      Math.max(
        0,
        Math.min(
          1,
          Number(progress) || 0
        )
      );

    const requiredPossessions =
      points <= 0
        ? 0
        : Math.ceil(
            points / 8
          );

    const fullGamePossessions =
      sport === 'CFB'
        ? 12.5
        : 10.5;

    let possessionAdjustment = 0;
    let possessionState = '';
    let fieldPosition = null;

    const competition =
      context?.competition ||
      context ||
      null;

    const situation =
      context?.situation ||
      competition?.situation ||
      {};

    const competitors =
      competition?.competitors ||
      [];

    if (
      points > 0 &&
      competitors.length === 2
    ) {
      const scored =
        competitors
          .map(item => ({
            item,
            score:Number(item?.score)
          }))
          .filter(item =>
            Number.isFinite(item.score)
          );

      if (scored.length === 2) {
        const trailing =
          scored[0].score < scored[1].score
            ? scored[0].item
            : scored[1].score < scored[0].score
              ? scored[1].item
              : null;

        const holderId =
          String(
            situation?.possession?.id ||
            situation?.possession ||
            ''
          );

        const trailingId =
          footballCompetitorId(
            trailing
          );

        if (
          trailing &&
          holderId &&
          trailingId
        ) {
          if (holderId === trailingId) {
            possessionAdjustment += .45;
            possessionState = 'trailing';

            const holderAbbr =
              footballCompetitorAbbreviation(
                trailing
              );

            fieldPosition =
              footballSituationFieldPosition(
                situation,
                holderAbbr
              );

            if (
              fieldPosition !== null &&
              fieldPosition >= 70
            ) {
              possessionAdjustment += .25;
            }
          } else if (p >= .9 && (sport !== 'NFL' || competitors.some(item => footballCompetitorId(item) === holderId))) {
            possessionAdjustment -= .35;
            possessionState = 'leading';
          }
        }
      }
    }

    let expectedPossessions =
      Math.max(
        0,
        fullGamePossessions *
          (1 - p) +
          .5 +
          possessionAdjustment
      );

    // NFL timeout information changes the available runway, not a flat bonus.
    // Missing/invalid fields leave the established possession estimate intact.
    const runway = sport === 'NFL' ? footballClockRunway(competition,situation) : null;
    if (runway) expectedPossessions = runway.expectedPossessions;

    const possessionSlack =
      expectedPossessions -
      requiredPossessions;

    const comebackFeasibility =
      requiredPossessions === 0
        ? 1
        : 1 /
          (
            1 +
            Math.exp(
              -2 *
              (
                possessionSlack +
                .8
              )
            )
          );

    const marginClose =
      footballMarginCloseness(
        points
      );

    const close =
      marginClose *
      (
        .45 +
        .55 *
        comebackFeasibility
      );

    return {
      close,
      marginClose,
      comebackFeasibility,
      requiredPossessions,
      expectedPossessions,
      possessionSlack,
      possessionAdjustment,
      possessionState,
      fieldPosition
    };
  }

  function footballTimeouts(competition,situation,team) {
    const value = situation?.[`${team?.homeAway}Timeouts`] ?? team?.timeouts;
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    const count = Number(value);
    return Number.isInteger(count) && count >= 0 && count <= 3 ? count : null;
  }

  function footballClockRunway(competition,situation=competition?.situation) {
    const status = competition?.status;
    const seconds = clockSeconds(status);
    if (Number(status?.period) !== 4 || seconds === null || seconds > 180) return null;
    const teams = competition?.competitors || [];
    if (teams.length !== 2 || teams.some(t => t.score == null || !Number.isFinite(Number(t.score)))) return null;
    const trailing = teams.find(t => Number(t.score) < Number(teams.find(other => other !== t).score));
    const holder = teams.find(t => footballCompetitorId(t) === String(situation?.possession?.id || situation?.possession || ''));
    if (!trailing || !holder || holder === trailing) return null;
    const timeouts = footballTimeouts(competition,situation,trailing);
    const down = Number(situation?.down);
    if (timeouts === null || down < 1 || down > 4 || !Number.isInteger(down)) return null;
    // Estimate a stop without a first down. The two-minute warning supplies
    // one clock stop; whether the clock is running is often absent, so reserve
    // only the intervals after the remaining scrimmage downs (conservative).
    const snaps = 4-down;
    const stops = timeouts + (seconds > 120 ? 1 : 0);
    const drain = 6*snaps + 40*Math.max(0,snaps-stops);
    const remaining = Math.max(0,seconds-drain-8); // punt/change of possession
    return {timeouts,remaining,expectedPossessions:remaining === 0 ? 0 : Math.min(1.4,.25+remaining/100)};
  }

  function footballRunwayPenalty(
    gap,
    progress,
    footballState
  ) {
    if (
      !footballState ||
      gap === null ||
      !Number.isFinite(Number(gap))
    ) {
      return 0;
    }

    const points = Number(gap);
    const p =
      Math.max(
        0,
        Math.min(
          1,
          Number(progress) || 0
        )
      );

    const possessionMismatch =
      Math.max(
        0,
        footballState.requiredPossessions -
        footballState.expectedPossessions
      );

    const lowFeasibility =
      Math.max(
        0,
        .55 -
        footballState.comebackFeasibility
      ) / .55;

    const runwayPenalty =
      points >= 9
        ? lowFeasibility *
          16 *
          (.5 + .5 * p) +
          Math.min(
            8,
            possessionMismatch * 4
          )
        : 0;

    const marginPenalty =
      points >= 17
        ? Math.min(
            14,
            (
              (points - 16) /
              16
            ) *
            10 *
            (.5 + .5 * p)
          )
        : 0;

    return Math.min(
      28,
      Math.round(
        runwayPenalty +
        marginPenalty
      )
    );
  }

  function footballFieldPosition(
    game,
    holder,
    spot,
    downText
  ) {
    const text =
      `${spot || ''} ${downText || ''}`
        .toUpperCase();

    const match =
      text.match(
        /\b([A-Z]{2,4})\s+(\d{1,2})\b/
      );

    if (!match) {
      return /\b50\b/.test(text)
        ? 50
        : null;
    }

    const code =
      match[1];

    const yard =
      Number(match[2]);

    if (
      !Number.isFinite(yard) ||
      yard < 0 ||
      yard > 50
    ) {
      return null;
    }

    const holderAbbr =
      String(
        holder?.[1] || ''
      ).toUpperCase();

    return code === holderAbbr
      ? yard
      : 100 - yard;
  }

  function footballSituationImpact(
    game,
    competition,
    status,
    situation,
    progress,
    scoreGap,
    options=null
  ) {
    const possessionId =
      String(
        situation.possession?.id ||
        situation.possession ||
        ''
      );

    const holder =
      game.teams.find(team =>
        String(
          team[8] || ''
        ) ===
        possessionId
      );

    const down =
      Number(
        situation.down
      );

    const distance =
      Number(
        situation.distance
      );

    const downText =
      String(
        situation.downDistanceText ||
        situation.shortDownDistanceText ||
        (
          down >= 1 &&
          down <= 4
            ? `${ordinal(down)} & ${Number.isFinite(distance) ? distance : 'goal'}`
            : ''
        )
      ).trim();

    const spot =
      String(
        situation.possessionText ||
        ''
      ).trim();

    const redZone =
      situation.isRedZone === true ||
      (
        /\b(?:[A-Z]{2,4}\s)?(?:[1-9]|1\d|20)\b/
          .test(spot) &&
        /red zone/i
          .test(
            String(
              situation.shortText ||
              situation.text ||
              ''
            )
          )
      );

    const goalToGo =
      situation.isGoalToGo === true ||
      /&\s*goal/i
        .test(downText);

    const fieldPosition =
      footballFieldPosition(
        game,
        holder,
        spot,
        downText
      );

    const lateOneScore =
      progress >= .72 &&
      scoreGap <= 8;

    const competitive =
      scoreGap <= 14;

    const holderIndex = holder ? game.teams.indexOf(holder) : -1;
    const holderScore = Number(game.teams?.[holderIndex]?.[2]);
    const opponentScore = Number(game.teams?.[1-holderIndex]?.[2]);
    // A goal-line possession matters most when it can tie or change the lead.
    const offenseTrailingOrTied = holderIndex >= 0 && Number.isFinite(holderScore) && Number.isFinite(opponentScore) && holderScore <= opponentScore;
    const offenseCanTieOrLead = offenseTrailingOrTied && holderScore + 7 >= opponentScore;
    const nfl = game.sport === 'NFL';
    const seconds = clockSeconds(status);
    const period = Number(status?.period);
    const runway = nfl ? footballClockRunway({...competition,status},situation) : null;

    let points = 0;
    let fourthPoints = 0;
    const reasons = [];

    if (redZone) {
      const goalLine = goalToGo && fieldPosition !== null && fieldPosition >= 95;
      const redZonePoints = offenseCanTieOrLead
        ? (goalLine ? 5 : lateOneScore ? 4 : 3)
        : offenseTrailingOrTied
          ? (goalLine ? 3 : 2)
          : 0;
      points += redZonePoints;

      if (redZonePoints) reasons.push(
        goalLine
          ? `${holder?.[0] || 'The offense'} is goal-to-go at the doorstep`
          : `${holder?.[0] || 'The offense'} is in the red zone`
      );
    }

    if (
      down === 4 &&
      downText
    ) {
      let fourth = 1;

      if (
        competitive &&
        (
          redZone ||
          fieldPosition > 50
        )
      ) {
        fourth++;
      }

      if (
        competitive &&
        Number.isFinite(distance) &&
        distance <= 2
      ) {
        fourth += 2;
      }

      if (lateOneScore) {
        fourth += 3;
      }

      if (competitive && redZone) {
        fourth += 1;
      } else if (
        competitive &&
        fieldPosition !== null &&
        fieldPosition >= 70
      ) {
        fourth += 1;
      }

      if (competitive && goalToGo) {
        fourth += 2;
      }

      if (
        progress >= .9 &&
        lateOneScore
      ) {
        fourth += 2;
      }

      fourth =
        Math.min(
          10,
          fourth
        );

      if (nfl) {
        const urgent = period >= 4 && (period > 4 || (seconds !== null && seconds <= 240));
        const liveDrive = offenseTrailingOrTied && scoreGap <= 8;
        fourth = urgent && liveDrive
          ? (seconds !== null && seconds <= 120 ? 10 : 7) + (fieldPosition >= 65 ? 1 : 0)
          : urgent && scoreGap <= 8 && holderIndex >= 0
            ? (runway?.remaining === 0 ? 2 : 6)
            : competitive ? Math.min(3,1 + (distance > 0 && distance <= 2 ? 1 : 0) + (fieldPosition >= 70 ? 1 : 0)) : 1;
      }

      fourthPoints = fourth;
      points += fourth;

      reasons.push(
        fourth > 1
          ? `${downText} is a pivotal down`
          : downText
      );
    }

    if (
      !redZone &&
      fieldPosition !== null &&
      fieldPosition >= 80 &&
      scoreGap <= 8 &&
      offenseTrailingOrTied
    ) {
      points += 2;

      reasons.push(
        `${holder?.[0] || 'The offense'} is deep in opponent territory`
      );
    }

    if (lateOneScore && !nfl) {
      points +=
        progress >= .9
          ? 4
          : 2;

      reasons.push(
        `It is a one-possession game late in the ${Number(status?.period) >= 4 ? 'fourth quarter' : 'game'}`
      );
    }

    if (
      seconds !== null &&
      Number(status?.period) >= 4 &&
      seconds <= 120 &&
      scoreGap <= 8 && !nfl
    ) {
      points += 2;

      reasons.push(
        'The game is in a two-minute decision window'
      );
    }

    // A live tying or winning possession has leverage even when the leader's
    // win probability has grown. Share the existing situation cap with the
    // clock, field-position and fourth-down bonuses rather than stacking them.
    if (nfl && lateOneScore) {
      const direction = holderIndex < 0 ? 1 : offenseTrailingOrTied ? 4 : runway?.remaining === 0 ? 0 : 2;
      points = Math.max(points,direction);
      if (direction) reasons.push(offenseTrailingOrTied ? 'A tying or winning possession is available late' : 'A late one-possession game');
    }
    const decisiveDrive =
      Number(status?.period) >= 4 &&
      holderIndex >= 0 &&
      (nfl ? holderScore <= opponentScore : holderScore < opponentScore) &&
      scoreGap <= 8;
    const clockUrgency = seconds === null || (nfl && seconds <= 0)
      ? 0
      : Math.max(0,Math.min(1,(240 - seconds) / 120));
    const driveUrgency = Number(status?.period) > 4
      ? (nfl ? (options?.overtime?.canWin ? 1 : .35) : Math.max(.6,seconds === null ? 1 : clockUrgency))
      : clockUrgency;
    let driveLeverage = null;
    if (decisiveDrive && driveUrgency > 0) {
      const positionBonus = goalToGo && fieldPosition >= 95
        ? 3
        : redZone
          ? 2
          : fieldPosition >= (nfl && scoreGap <= 3 && (!options?.overtime?.active || options.overtime.fieldGoalWins) ? 58 : 70)
            ? 2
            : fieldPosition > 50
              ? 1
              : 0;
      const drivePoints = Math.round(
        driveUrgency * ((nfl && scoreGap === 0 ? 10 : scoreGap >= 4 ? 9 : 8) + positionBonus)
      );
      driveLeverage = {urgency:driveUrgency,positionBonus};
      points = Math.max(points,drivePoints + Math.min(2,fourthPoints));
      reasons.push(
        `${holder?.[0] || 'The trailing team'} has a ${scoreGap >= 4 ? 'tying or winning TD' : !nfl ? 'tying or winning score' : scoreGap === 0 ? 'go-ahead scoring' : scoreGap === 3 ? 'tying FG or winning TD' : 'winning FG or TD'} drive in progress`
      );
    }

    // Explicit pending tries only: last-play touchdown/try text can be stale.
    if (nfl && situation.isTwoPointAttempt === true && holderIndex >= 0 &&
        period >= 4 && (period > 4 || (seconds !== null && seconds <= 180))) {
      const deficit = opponentScore-holderScore;
      if ([1,2,9,10].includes(deficit)) {
        points = 12;
        driveLeverage = {urgency:1,positionBonus:2};
        reasons.push(deficit === 1 ? 'Two-point try to take the lead' : deficit === 2 ? 'Two-point try to tie' : 'Two-point try needed to stay within one possession');
      }
    }

    return {
      points:
        Math.min(
          12,
          points
        ),

      note:
        [
          holder
            ? `${holder[1] || holder[0]} ball`
            : '',
          downText,
          spot &&
          !downText.includes(spot)
            ? spot
            : ''
        ]
          .filter(Boolean)
          .join(' · '),

      reasons,
      decisiveDrive:driveLeverage
    };
  }

  function footballMilestone(summary) {
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
          !/pass/i.test(
            group.name ||
            group.displayName ||
            ''
          )
        ) {
          continue;
        }

        const touchdowns =
          (group.labels || [])
            .findIndex(label =>
              /^TD$|^PASS TD$/i
                .test(label)
            );

        if (
          touchdowns < 0
        ) {
          continue;
        }

        const passer =
          (group.athletes || [])
            .filter(entry =>
              Number(
                entry.stats?.[touchdowns]
              ) >= 3
            )
            .sort((a,b) =>
              Number(b.stats?.[touchdowns]) -
              Number(a.stats?.[touchdowns])
            )[0];

        if (passer) {
          const count =
            Number(
              passer.stats[touchdowns]
            );

          return {
            text:
              `${passer.athlete?.displayName || 'A quarterback'} has thrown ${count} touchdown passes`,
            points:
              count >= 5
                ? 12
                : count >= 4
                  ? 8
                  : 5
          };
        }
      }
    }

    return null;
  }

  function footballGameState({sport,gameState,gap,progress,context:footballContext}) {
    const footballState =
      ['NFL','CFB'].includes(sport) &&
      gameState === 'live'
        ? footballLiveCloseness(
            sport,
            gap,
            progress,
            footballContext
          )
        : null;

    return {
      footballState,
      marginClose:footballState?.close,
      comebackViability:footballState?.comebackFeasibility,
      widePenalty:footballState ? footballRunwayPenalty(gap,progress,footballState) : undefined,
      limitedRunway:Boolean(footballState)
    };
  }

  function footballEventShock({text,positioned,i,play}) {
    let value = 0;
    let label = '';
    if (/touchdown|\btd\b/.test(text) && /\b(?:[4-9]\d|1\d\d)[ -]?(?:yard|yd)s?\b/.test(text)) { value=5; label='40-plus-yard touchdown'; }
    return value ? {value,label} : null;
  }

  function footballSituation({game,competition,status,situation,progress,scoreGap}) {
    return footballSituationImpact(game,competition,status,situation,progress,scoreGap);
  }

  const api = {defensiveFinishFactor,footballStagnationImpact,footballMarginCloseness,footballCompetitorId,footballCompetitorAbbreviation,footballSituationFieldPosition,footballLiveCloseness,footballRunwayPenalty,footballFieldPosition,footballSituationImpact,footballMilestone,footballGameState,footballEventShock,footballSituation,footballTimeouts,footballClockRunway};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).shared_football = api;
  }
})(globalThis);

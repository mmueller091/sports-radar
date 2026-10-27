/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {CONTEXT_WEIGHTS,CONTEXT_LABELS} = typeof module !== 'undefined' && module.exports
    ? require('./config.js')
    : root.SportsRadarScoring.shared_config;

  function eventSignalText(event, competition, context) {
    return [
      event?.name,
      event?.shortName,
      (competition?.notes || [])
        .map(note => note.headline)
        .join(' '),
      competition?.series?.summary,
      competition?.series?.title,
      competition?.series?.type,
      event?.season?.type?.name,
      event?.season?.type?.slug,
      event?.season?.slug,
      context
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function normalizeContextType(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(
        /[\s-]+/g,
        '_'
      );
  }

  function pregameContextFactors(event,competition) {
    const sources = [
      event?.sportsRadarContextFactors,
      competition?.sportsRadarContextFactors,
      event?.sportsRadarContext,
      competition?.sportsRadarContext,
      event?.contextFactors,
      competition?.contextFactors
    ];

    const items =
      sources
        .flatMap(source =>
          Array.isArray(source)
            ? source
            : Array.isArray(source?.factors)
              ? source.factors
              : []
        )
        .filter(Boolean);

    const candidates = [];
    for (const item of items) {
      if (
        item?.verified === false
      ) {
        continue;
      }

      const confidence =
        Number(
          item?.confidence
        );

      if (
        Number.isFinite(confidence) &&
        confidence < .7
      ) {
        continue;
      }

      const type =
        normalizeContextType(
          item?.type
        );

      const points =
        CONTEXT_WEIGHTS[type];

      if (
        !Number.isFinite(points)
      ) {
        continue;
      }

      candidates.push({
        type,

        label:
          String(
            item?.label ||
            CONTEXT_LABELS[type] ||
            type
          ).trim(),

        text:
          String(
            item?.text ||
            item?.description ||
            item?.label ||
            CONTEXT_LABELS[type] ||
            ''
          ).trim(),

        points,

        dedupeKey:
          String(
            item?.dedupeKey ||
            (
              [
                'former_captain_return',
                'first_game_back',
                'former_star_return'
              ].includes(type)
                ? 'former-team-return'
                : [
                    'championship_rematch',
                    'playoff_rematch'
                  ].includes(type)
                  ? 'rematch'
                  : type
            )
          )
      });
    }

    candidates.sort(
      (a,b) =>
        Math.abs(b.points) -
        Math.abs(a.points)
    );

    const factors = [];
    const seen = new Set();

    let positiveRemaining = 22;
    let negativeRemaining = 10;

    for (const item of candidates) {
      if (
        !item.label ||
        seen.has(item.dedupeKey)
      ) {
        continue;
      }

      seen.add(item.dedupeKey);

      let points =
        item.points;

      if (points > 0) {
        points =
          Math.min(
            points,
            positiveRemaining
          );

        positiveRemaining -=
          points;
      } else if (points < 0) {
        points =
          -Math.min(
            Math.abs(points),
            negativeRemaining
          );

        negativeRemaining -=
          Math.abs(points);
      }

      if (!points) {
        continue;
      }

      factors.push({
        label:item.label,
        points,
        contextType:item.type,
        contextText:item.text
      });
    }

    return factors;
  }

  function aggregateScoreFromText(value) {
    const text =
      String(value || '')
        .toLowerCase();

    const match =
      text.match(
        /(?:aggregate(?: score)?|on aggregate)[^0-9]{0,12}(\d+)\D{1,5}(\d+)/
      ) ||
      text.match(
        /(\d+)\s*[-–:]\s*(\d+)[^.;]{0,24}(?:on aggregate|aggregate score)/
      );

    return match
      ? [
          Number(match[1]),
          Number(match[2])
        ]
      : null;
  }

  function specificStakesFactors(sport,detail) {
    const text =
      String(detail || '')
        .toLowerCase();

    const factors = [];

    if (
      /\bgame\s*(?:7|seven)\b|\bdeciding game\b/
        .test(text)
    ) {
      factors.push({
        label:'Deciding game',
        points:12
      });
    } else if (
      /\belimination game\b|\bwin or go home\b|\bwinner advances\b|\bmust[- ]win\b/
        .test(text)
    ) {
      factors.push({
        label:'Elimination stakes',
        points:9
      });
    }

    if (
      /\bclinches?\b|\bclinching (?:game|opportunity|scenario)\b|\bcan clinch\b/
        .test(text)
    ) {
      factors.push({
        label:'Clinching opportunity',
        points:6
      });
    }

    if (
      sport === 'Soccer' &&
      /\bsecond leg\b|\b2nd leg\b|\bon aggregate\b|\baggregate score\b/
        .test(text)
    ) {
      const aggregate =
        aggregateScoreFromText(text);

      const closeAggregate =
        aggregate &&
        Math.abs(
          aggregate[0] -
          aggregate[1]
        ) <= 1;

      factors.push({
        label:
          closeAggregate
            ? 'Close aggregate tie'
            : 'Second-leg consequences',
        points:
          closeAggregate
            ? 7
            : 4
      });
    }

    return factors;
  }

  function singleEliminationRound(sport,detail) {
    if (sport === 'NFL') {
      return /\bwild[- ]card\b(?!\s+(?:race|berth|spot|picture|contention|hunt))|\bdivisional (?:round|playoff)\b|\b(?:afc|nfc|conference) championship\b|\bsuper bowl\b(?!\s+rematch)/.test(detail);
    }
    if (sport === 'CFB') {
      return /\b(?:college football playoff|cfp)\b(?!\s+(?:race|berth|spot|picture|contention|hunt))|\bnational championship\b(?!\s+rematch)/.test(detail);
    }
    return sport === 'NCAAB' &&
      /\bncaa (?:tournament|championship)\b|\bmarch madness\b|\bfirst four\b|\bsweet (?:16|sixteen)\b|\belite (?:8|eight)\b|\bfinal four\b|\bnational championship\b/.test(detail);
  }

  function isPostseasonGame(sport,event,competition,detail) {
    return Number(event?.season?.type?.id ?? event?.season?.type) === 3 ||
      singleEliminationRound(sport,detail) ||
      /\bworld series\b|\bsuper bowl\b|\bstanley cup final\b|\b(?:nba|wnba) finals\b|\bnational championship\b|\bconference (?:finals?|championship)\b|\b(?:quarterfinal|semifinal|knockout)\b|\b(?:wild[- ]card|divisional) (?:round|game|playoff)\b|\b(?:playoffs?|postseason) (?:game|round|series)\b/.test(detail) ||
      (sport === 'CFB' && /\bbowl\b/.test(detail)) ||
      /^(?:postseason|playoffs?)$/.test(String(event?.season?.type?.name || '').toLowerCase());
  }

  function playoffSeriesLeverage(sport,competition,detail) {
    if (!['MLB','NHL','NBA'].includes(sport)) return null;
    const seriesData = competition?.series || {};
    const series = String([seriesData.summary,seriesData.title,seriesData.type].filter(Boolean).join(' ')).toLowerCase();
    if (!isPostseasonGame(sport,{},competition,detail) && !series) return null;
    const game = Number(detail.match(/\bgame\s*([1-7])\b/)?.[1] || series.match(/\bgame\s*([1-7])\b/)?.[1] || seriesData.gameNumber || 0);
    const winsMatch = series.match(/\b([0-3])\s*[-–]\s*([0-3])\b/);
    const structuredWins = [seriesData.homeWins ?? seriesData.homeTeamWins,seriesData.awayWins ?? seriesData.awayTeamWins].map(value=>value == null ? NaN : Number(value));
    const wins = winsMatch ? [Number(winsMatch[1]),Number(winsMatch[2])] : structuredWins.every(Number.isFinite) ? structuredWins : [];
    const bestOf = Number(seriesData.bestOf || series.match(/best[- ]of[- ]([357])/i)?.[1] || 7);
    const clinchWins = Number(seriesData.winsRequired || Math.ceil(bestOf / 2));
    const winsNeeded = seriesData.winsNeeded;
    const clinchOpportunity = (Array.isArray(winsNeeded) ? winsNeeded : Object.values(winsNeeded && typeof winsNeeded === 'object' ? winsNeeded : {value:winsNeeded})).some(value=>value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) <= 1);
    const deciding = seriesData.winnerTakeAll === true || game === bestOf || /\bdeciding game\b|\bwinner[- ]take[- ]all\b/.test(detail) ||
      (wins.length === 2 && wins[0] === wins[1] && wins[0] === clinchWins - 1);
    const clinchChance = Number(seriesData.clinchChance);
    const elimination = seriesData.eliminationRisk === true || seriesData.clinchChance === true || Number.isFinite(clinchChance) && clinchChance >= .5 || clinchOpportunity || /\belimination game\b|\bwin or go home\b|\bmust[- ]win\b|\bcan clinch\b|\bclinching (?:game|opportunity|scenario)\b|\bclinches?\b/.test(detail) ||
      (wins.length === 2 && Math.max(...wins) >= clinchWins - 1);
    const tiedGameFive = game === 5 && wins.length === 2 && wins[0] === 2 && wins[1] === 2;
    const points = deciding ? 16 : elimination ? 10 : tiedGameFive ? 5 : ({2:2,3:3,4:4,5:4,6:4}[game] || 0);
    return points ? {label:deciding ? 'Playoff winner-take-all' : elimination ? 'Playoff elimination / clinch' : 'Playoff series leverage',points} : null;
  }

  function championshipSeriesFactors(sport,competition,detail) {
    const championship =
      (sport === 'MLB' && /\bworld series\b/.test(detail)) ||
      (sport === 'NBA' && /\bnba finals\b/.test(detail)) ||
      (sport === 'NHL' && /\bstanley cup finals?\b/.test(detail));
    if (!championship) return null;

    const seriesLeverage = playoffSeriesLeverage(sport,competition,detail);
    const game = Number(detail.match(/\bgame\s*([1-7])\b/)?.[1] || 0);
    const series = String(competition?.series?.summary || '').toLowerCase();
    const record = series.match(/\b([0-3])\s*[-–]\s*([0-3])\b/);
    const wins = record ? [Number(record[1]),Number(record[2])] : [];
    // One prestige factor and one highest applicable leverage factor.
    // Neither postseason scarcity nor the generic series-opener stacks here.
    const deciding = game === 7 || /\bgame seven\b|\bdeciding game\b|\bwinner[- ]take[- ]all\b/.test(detail) ||
      (wins.length === 2 && wins.every(value => value === 3));
    const elimination = /\belimination game\b|\bwin or go home\b|\bmust[- ]win\b|\bcan clinch\b|\bclinching (?:game|opportunity|scenario)\b|\bclinches?\b/.test(detail) ||
      wins.some(value => value === 3);
    const leverage = seriesLeverage?.points ?? (deciding ? 16 : elimination ? 10 : ({2:1,3:3,4:5,5:6,6:7}[game] || 0));
    return [
      {label:sport === 'MLB' ? 'World Series' : sport === 'NHL' ? 'Championship' : 'Final round',points:sport === 'MLB' ? 50 : 45},
      ...(leverage ? [{
        label:deciding ? 'Championship winner-take-all' : elimination ? 'Championship elimination / clinch' : 'Championship series leverage',
        points:leverage
      }] : [])
    ];
  }

  function completedStakesImpact(
    sport,
    event,
    competition,
    context
  ) {
    const detail =
      eventSignalText(
        event,
        competition,
        context
      );

    let stage = null;
    let consequence = null;

    if (
      /world series|super bowl|stanley cup final|champions league final|national championship|grand slam final/
        .test(detail)
    ) {
      stage = {
        label:'Championship stakes',
        points:18
      };
    } else if (
      /\bnba finals\b|\bwnba finals\b|\bleague final\b|\bchampionship series\b|\btitle series\b|\bfinals\b/
        .test(detail)
    ) {
      stage = {
        label:'Final-round stakes',
        points:15
      };
    } else if (
      /conference final|conference championship|\bsemifinal\b|\bsemi-final\b/
        .test(detail)
    ) {
      stage = {
        label:'Semifinal stakes',
        points:13
      };
    } else if (
      /playoff|postseason|wild card|divisional round|quarterfinal|knockout/
        .test(detail) ||
      singleEliminationRound(sport,detail) ||
      Number(
        event?.season?.type?.id ??
        event?.season?.type
      ) === 3
    ) {
      stage = {
        label:'Postseason stakes',
        points:10
      };
    }

    if (
      /\bgame\s*(?:7|seven)\b|\bdeciding game\b|\bwinner[- ]take[- ]all\b/
        .test(detail) ||
      /super bowl|national championship|champions league final|grand slam final/
        .test(detail)
    ) {
      consequence = {
        label:'Winner-take-all consequence',
        points:10
      };
    } else if (
      /\bwinner advances\b|\badvances? to\b|\badvanced to\b|\beliminates?\b|\beliminated\b|\bloser (?:is )?eliminated\b/
        .test(detail)
    ) {
      consequence = {
        label:'Advancement or elimination decided',
        points:8
      };
    } else if (
      /\bwinner (?:wins|takes) (?:the )?(?:division|league|conference)\b/
        .test(detail) ||
      /\b(?:wins|won|clinches|clinched|secures|secured|captures|captured|takes|took)\b[^.;]{0,50}\b(?:division|league|conference) (?:title|championship)\b/
        .test(detail) ||
      /\b(?:division|league|conference) (?:title|championship) (?:decided|clinched|secured|won)\b/
        .test(detail)
    ) {
      consequence = {
        label:'Division or conference title decided',
        points:8
      };
    } else if (
      /\b(?:clinches|clinched|secures|secured|earns|earned)\b[^.;]{0,40}\bplayoff berth\b/
        .test(detail) ||
      /\bplayoff berth\b[^.;]{0,30}\b(?:clinched|secured|earned|decided)\b/
        .test(detail)
    ) {
      consequence = {
        label:'Playoff berth decided',
        points:7
      };
    } else if (
      /\bwinner (?:takes|gets) (?:the )?(?:first place|top seed|no\.?\s*1 seed|number one seed)\b/
        .test(detail) ||
      /\b(?:clinches|clinched|secures|secured|takes|took|wins|won)\b[^.;]{0,45}\b(?:first place|top seed|no\.?\s*1 seed|number one seed)\b/
        .test(detail) ||
      /\b(?:first place|top seed|no\.?\s*1 seed|number one seed)\b[^.;]{0,30}\b(?:decided|clinched|secured|won)\b/
        .test(detail)
    ) {
      consequence = {
        label:'First place or major seeding decided',
        points:6
      };
    } else if (
      /\b(?:clinched|secured|captured|earned)\b/
        .test(detail) &&
      !/\b(?:can|could|may|might) clinch\b|\bclinching (?:opportunity|scenario)\b/
        .test(detail)
    ) {
      consequence = {
        label:'Competitive consequence clinched',
        points:5
      };
    } else if (
      /\bavoids? elimination\b|\bstays? alive\b|\bsurvives? elimination\b/
        .test(detail)
    ) {
      consequence = {
        label:'Elimination survival',
        points:5
      };
    }

    if (!consequence && singleEliminationRound(sport,detail)) {
      consequence = {label:'Advancement or elimination decided',points:8};
    }

    const factors = [];
    let remaining = 24;

    for (const factor of [stage,consequence]) {
      if (
        !factor ||
        remaining <= 0
      ) {
        continue;
      }

      const points =
        Math.min(
          factor.points,
          remaining
        );

      if (points) {
        factors.push({
          ...factor,
          points
        });

        remaining -=
          points;
      }
    }

    return {
      points:
        24 -
        remaining,
      factors
    };
  }

  function contextWeightFor(
    progress,
    gameState,
    anchors
  ) {
    if (
      gameState === 'completed'
    ) {
      return .05;
    }

    const p =
      Math.max(
        0,
        Math.min(
          1,
          Number(progress) || 0
        )
      );

    for (
      let i = 1;
      i < anchors.length;
      i++
    ) {
      if (
        p <= anchors[i][0]
      ) {
        const [
          x0,
          y0
        ] = anchors[i-1];

        const [
          x1,
          y1
        ] = anchors[i];

        const t =
          (
            p -
            x0
          ) /
          (
            x1 -
            x0
          );

        return (
          y0 +
          (
            y1 -
            y0
          ) *
          t
        );
      }
    }

    return .06;
  }

  const api = {eventSignalText,normalizeContextType,pregameContextFactors,aggregateScoreFromText,specificStakesFactors,singleEliminationRound,isPostseasonGame,playoffSeriesLeverage,championshipSeriesFactors,completedStakesImpact,contextWeightFor};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).shared_context = api;
  }
})(globalThis);

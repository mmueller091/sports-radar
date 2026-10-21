/* Shared, browser/server scoring rules. The alert checker imports this same model. */
(function (root) {
  const SPORT_BASE = {NFL:38,MLB:38,NHL:35,CFB:36,NBA:37,NCAAB:35,Tennis:38,Soccer:35};

  const NFL_DIVISIONS = {
    BUF:'AFC East',MIA:'AFC East',NE:'AFC East',NYJ:'AFC East',
    BAL:'AFC North',CIN:'AFC North',CLE:'AFC North',PIT:'AFC North',
    HOU:'AFC South',IND:'AFC South',JAX:'AFC South',TEN:'AFC South',
    DEN:'AFC West',KC:'AFC West',LAC:'AFC West',LV:'AFC West',
    DAL:'NFC East',NYG:'NFC East',PHI:'NFC East',WSH:'NFC East',
    CHI:'NFC North',DET:'NFC North',GB:'NFC North',MIN:'NFC North',
    ATL:'NFC South',CAR:'NFC South',NO:'NFC South',TB:'NFC South',
    ARI:'NFC West',LAR:'NFC West',SF:'NFC West',SEA:'NFC West'
  };

  const NHL_DIVISIONS = {
    BOS:'Atlantic Division',BUF:'Atlantic Division',DET:'Atlantic Division',FLA:'Atlantic Division',
    MTL:'Atlantic Division',OTT:'Atlantic Division',TB:'Atlantic Division',TOR:'Atlantic Division',

    CAR:'Metropolitan Division',CBJ:'Metropolitan Division',NJ:'Metropolitan Division',
    NYI:'Metropolitan Division',NYR:'Metropolitan Division',PHI:'Metropolitan Division',
    PIT:'Metropolitan Division',WSH:'Metropolitan Division',

    CHI:'Central Division',COL:'Central Division',DAL:'Central Division',
    MIN:'Central Division',NSH:'Central Division',STL:'Central Division',
    UTA:'Central Division',WPG:'Central Division',

    ANA:'Pacific Division',CGY:'Pacific Division',EDM:'Pacific Division',
    LA:'Pacific Division',LAK:'Pacific Division',
    SJ:'Pacific Division',SJS:'Pacific Division',
    SEA:'Pacific Division',VAN:'Pacific Division',VGK:'Pacific Division'
  };

  const NBA_DIVISIONS = {
    BOS:'Atlantic Division',BKN:'Atlantic Division',NY:'Atlantic Division',
    NYK:'Atlantic Division',PHI:'Atlantic Division',TOR:'Atlantic Division',

    CHI:'Central Division',CLE:'Central Division',DET:'Central Division',
    IND:'Central Division',MIL:'Central Division',

    ATL:'Southeast Division',CHA:'Southeast Division',MIA:'Southeast Division',
    ORL:'Southeast Division',WSH:'Southeast Division',

    DEN:'Northwest Division',MIN:'Northwest Division',OKC:'Northwest Division',
    POR:'Northwest Division',UTA:'Northwest Division',

    GS:'Pacific Division',GSW:'Pacific Division',LAC:'Pacific Division',
    LAL:'Pacific Division',PHX:'Pacific Division',SAC:'Pacific Division',

    DAL:'Southwest Division',HOU:'Southwest Division',MEM:'Southwest Division',
    NO:'Southwest Division',NOP:'Southwest Division',
    SA:'Southwest Division',SAS:'Southwest Division'
  };

  const MLB_DIVISIONS = {
    BAL:'AL East',BOS:'AL East',NYY:'AL East',TB:'AL East',TOR:'AL East',

    CWS:'AL Central',CHW:'AL Central',CLE:'AL Central',DET:'AL Central',
    KC:'AL Central',KCR:'AL Central',MIN:'AL Central',

    ATH:'AL West',OAK:'AL West',HOU:'AL West',LAA:'AL West',SEA:'AL West',TEX:'AL West',

    ATL:'NL East',MIA:'NL East',NYM:'NL East',PHI:'NL East',WSH:'NL East',

    CHC:'NL Central',CIN:'NL Central',MIL:'NL Central',PIT:'NL Central',STL:'NL Central',

    ARI:'NL West',COL:'NL West',LAD:'NL West',
    SD:'NL West',SDP:'NL West',SF:'NL West',SFG:'NL West'
  };

  const LEAGUE_DIVISIONS = {
    NFL:NFL_DIVISIONS,
    NHL:NHL_DIVISIONS,
    NBA:NBA_DIVISIONS,
    MLB:MLB_DIVISIONS
  };

  /*
   * Qualitative pregame context.
   *
   * These factors are intentionally deterministic. Another part of the app
   * can discover and verify the underlying facts, but this shared model
   * decides how many excitement points those facts are worth.
   */
  const CONTEXT_WEIGHTS = {
    former_captain_return:10,
    first_game_back:10,
    former_star_return:8,
    star_injury_return:8,
    championship_rematch:8,
    playoff_rematch:6,
    rivalry:7,
    major_trade_storyline:6,
    historic_streak:6,
    season_debut:5,
    milestone_chase:5,
    playoff_race:5,
    coach_return:4,
    star_hot_streak:4,
    team_win_streak:3,
    star_absence:-5,
    multiple_stars_out:-8
  };

  const CONTEXT_LABELS = {
    former_captain_return:'Former captain returns',
    first_game_back:'First game back against former team',
    former_star_return:'Former star returns',
    star_injury_return:'Star player returns from injury',
    championship_rematch:'Championship rematch',
    playoff_rematch:'Playoff rematch',
    rivalry:'Rivalry context',
    major_trade_storyline:'Major trade storyline',
    historic_streak:'Historic streak',
    season_debut:'Notable season debut',
    milestone_chase:'Major milestone chase',
    playoff_race:'Playoff race implications',
    coach_return:'Coach returns to former team',
    star_hot_streak:'Star player hot streak',
    team_win_streak:'Team winning streak',
    star_absence:'Notable star absence',
    multiple_stars_out:'Multiple major absences'
  };

  const CLOSE_MARGIN = {
    NFL:14,
    MLB:3,
    NHL:3,
    CFB:14,
    NBA:12,
    NCAAB:12,
    Tennis:3,
    Soccer:3
  };

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

  function recordFor(competitor) {
    const records =
      competitor?.records ||
      competitor?.team?.records ||
      [];

    const overall =
      records.find(item =>
        /overall|total/i.test(
          `${item.type || ''} ${item.name || ''} ${item.abbreviation || ''}`
        )
      ) ||
      records[0];

    return (
      overall?.summary ||
      competitor?.record?.summary ||
      (
        typeof competitor?.record === 'string'
          ? competitor.record
          : ''
      )
    );
  }

  function rankFor(competitor,sport) {
    if (!['CFB','NCAAB'].includes(sport)) return null;

    const rank = Number(
      competitor?.curatedRank?.current ??
      competitor?.team?.rank
    );

    return Number.isFinite(rank) && rank >= 1 && rank <= 25
      ? rank
      : null;
  }

  function parseLine(raw,competition,sport) {
    if (!raw) return null;

    const listed =
      raw.close ||
      raw.closing ||
      raw;

    const totalValue =
      listed.overUnder ??
      listed.over_under ??
      listed.total?.overUnder ??
      listed.total?.value;

    const total =
      totalValue == null || totalValue === ''
        ? NaN
        : Number(totalValue);

    const details =
      String(
        listed.details ||
        listed.displayValue ||
        ''
      ).trim();

    const isMoneyline =
      /[+-]\d{3,}\b/.test(details) &&
      !/[+-]\d+\.\d+/.test(details);

    let spread =
      isMoneyline
        ? ''
        : String(
            listed.spread?.displayValue ||
            details
          ).trim();

    if (
      !spread &&
      listed.spread != null &&
      Number.isFinite(Number(listed.spread)) &&
      (!isMoneyline || Math.abs(Number(listed.spread)) <= 10)
    ) {
      const amount = Math.abs(Number(listed.spread));

      const home =
        (competition?.competitors || [])
          .find(team => team.homeAway === 'home');

      const away =
        (competition?.competitors || [])
          .find(team => team.homeAway === 'away');

      const favored =
        listed.homeTeamOdds?.favorite
          ? home
          : listed.awayTeamOdds?.favorite
            ? away
            : null;

      if (favored) {
        spread =
          amount === 0
            ? 'PK'
            : `${favored.team?.abbreviation || favored.abbreviation || 'Favorite'} -${amount}`;
      }
    }

    if (
      !spread &&
      !details &&
      !Number.isFinite(total)
    ) {
      return null;
    }

    return {
      spread:spread || '',
      moneyline:isMoneyline ? details : '',
      total:Number.isFinite(total) ? total : null,
      provider:
        listed.provider?.name ||
        raw.provider?.name ||
        '',
      verifiedClose:Boolean(
        raw.close ||
        raw.closing
      )
    };
  }

  function lineFromSummary(summary,sport) {
    const competition =
      summary?.header?.competitions?.[0];

    return parseLine(
      summary?.pickcenter?.[0] ||
      competition?.odds?.[0] ||
      summary?.odds?.[0],
      competition,
      sport
    );
  }

  function eventSignalText(event,competition,context) {
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

  function nflDivisionFor(competitors) {
    const divisions =
      competitors.map(item =>
        NFL_DIVISIONS[
          String(
            item.team?.abbreviation ||
            ''
          ).toUpperCase()
        ]
      );

    return (
      divisions.length === 2 &&
      divisions[0] &&
      divisions[0] === divisions[1]
    )
      ? divisions[0]
      : '';
  }

  function divisionFor(sport,competitors) {
    const map = LEAGUE_DIVISIONS[sport];

    if (
      !map ||
      !Array.isArray(competitors) ||
      competitors.length !== 2
    ) {
      return '';
    }

    const divisions =
      competitors.map(item =>
        map[
          String(
            item.team?.abbreviation ||
            item.abbreviation ||
            ''
          ).toUpperCase()
        ]
      );

    return (
      divisions[0] &&
      divisions[0] === divisions[1]
    )
      ? divisions[0]
      : '';
  }

  function recordStats(competitor) {
    const match =
      String(recordFor(competitor))
        .match(/^(\d+)-(\d+)(?:-(\d+))?/);

    if (!match) return null;

    const wins = Number(match[1]);
    const losses = Number(match[2]);
    const ties = Number(match[3] || 0);

    const games =
      wins +
      losses +
      ties;

    return games
      ? {
          wins,
          losses,
          ties,
          games,
          pct:(wins + ties / 2) / games
        }
      : null;
  }

  function winningRecord(competitor) {
    const record = recordStats(competitor);

    return Boolean(
      record &&
      record.pct > .5
    );
  }

  function listedSpread(competition) {
    const spread =
      parseLine(
        competition?.odds?.[0],
        competition,
        'NFL'
      )?.spread || '';

    const match =
      spread.match(
        /[+-](\d+(?:\.\d+)?)/
      );

    return match
      ? Number(match[1])
      : null;
  }

  function numberFromLine(value) {
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return null;
    }

    const n =
      Number(
        String(value)
          .replace(/[^+\-.\d]/g,'')
      );

    return Number.isFinite(n)
      ? n
      : null;
  }

  /*
   * Extract American moneyline prices from several ESPN shapes.
   */
  function moneylinePrices(raw) {
    if (!raw) return [];

    const odds =
      raw.close ||
      raw.closing ||
      raw;

    const candidates = [
      odds.homeTeamOdds?.moneyLine,
      odds.awayTeamOdds?.moneyLine,
      odds.homeTeamOdds?.moneyline,
      odds.awayTeamOdds?.moneyline,

      odds.moneyline?.home?.close?.odds,
      odds.moneyline?.away?.close?.odds,
      odds.moneyline?.home?.open?.odds,
      odds.moneyline?.away?.open?.odds,

      odds.moneyLine?.home?.close?.odds,
      odds.moneyLine?.away?.close?.odds,
      odds.moneyLine?.home?.open?.odds,
      odds.moneyLine?.away?.open?.odds
    ];

    const details =
      String(
        odds.details ||
        odds.displayValue ||
        ''
      ).match(/[+-]\d{3,4}\b/g) || [];

    return [
      ...new Set(
        [
          ...candidates,
          ...details
        ]
          .map(numberFromLine)
          .filter(
            value =>
              value !== null &&
              Math.abs(value) >= 100
          )
      )
    ];
  }

  /*
   * Market competitiveness.
   *
   * NBA uses the point spread.
   * NHL and MLB commonly expose moneyline prices instead.
   */
  function pregameMarketFactor(sport,competition) {
    const raw =
      competition?.odds?.[0];

    if (!raw) return null;

    if (
      ['NBA','CFB','NCAAB']
        .includes(sport)
    ) {
      const spread =
        listedSpread(competition);

      if (
        spread !== null &&
        spread <= 2.5
      ) {
        return {
          label:'Very close projected spread',
          points:5
        };
      }

      if (
        spread !== null &&
        spread <= 5.5
      ) {
        return {
          label:'Competitive projected spread',
          points:3
        };
      }

      return null;
    }

    if (
      ['NHL','MLB']
        .includes(sport)
    ) {
      const prices =
        moneylinePrices(raw);

      if (!prices.length) {
        return null;
      }

      const shortest =
        Math.min(
          ...prices.map(
            value => Math.abs(value)
          )
        );

      if (shortest <= 125) {
        return {
          label:'Near pick’em market',
          points:5
        };
      }

      if (shortest <= 150) {
        return {
          label:'Competitive betting market',
          points:3
        };
      }
    }

    return null;
  }

  /*
   * Regular-season quality scoring for the major professional leagues.
   *
   * We wait for a few games before giving full weight to records so that
   * a 2-0 team in October does not receive the same treatment as an
   * established winning team later in the season.
   */
  function proRecordFactors(sport,competitors) {
    if (
      !['MLB','NHL','NBA']
        .includes(sport)
    ) {
      return [];
    }

    const records =
      competitors.map(recordStats);

    if (
      records.length !== 2 ||
      !records.every(Boolean)
    ) {
      return [];
    }

    const minimumGames = {
      MLB:8,
      NHL:4,
      NBA:4
    }[sport] || 4;

    const mature =
      records.every(
        record =>
          record.games >= minimumGames
      );

    const bothWinning =
      records.every(
        record =>
          record.pct > .5
      );

    const bothAtLeastEven =
      records.every(
        record =>
          record.pct >= .5
      );

    const bothBelow =
      records.every(
        record =>
          record.pct < .5
      );

    const factors = [];

    if (bothWinning) {
      factors.push({
        label:'Both winning records',
        points:mature ? 7 : 3
      });

      if (
        Math.abs(
          records[0].pct -
          records[1].pct
        ) <= .1
      ) {
        factors.push({
          label:'Evenly matched winning records',
          points:mature ? 3 : 2
        });
      }
    } else if (bothAtLeastEven) {
      factors.push({
        label:'Both teams at least .500',
        points:mature ? 4 : 2
      });
    } else if (bothBelow) {
      factors.push({
        label:'Both teams below .500',
        points:mature ? -4 : -2
      });
    }

    if (
      records.some(
        record =>
          record.losses === 0 &&
          record.games >= 3
      )
    ) {
      factors.push({
        label:'Unbeaten team',
        points:4
      });
    }

    if (
      records.some(
        record =>
          record.wins === 0 &&
          record.games >= 3
      )
    ) {
      factors.push({
        label:'Winless team',
        points:-3
      });
    }

    return factors;
  }

  function normalizeContextType(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g,'_');
  }

  /*
   * Qualitative context can be attached to either the ESPN-like event or
   * competition object.
   *
   * Supported input shapes:
   *
   * event.sportsRadarContextFactors = [...]
   *
   * or:
   *
   * event.sportsRadarContext = {
   *   factors:[...]
   * }
   *
   * Example:
   *
   * {
   *   type:'former_captain_return',
   *   label:"Brady Tkachuk's first game back in Ottawa",
   *   text:'Former Senators captain returns to Ottawa for the first time',
   *   confidence:.98,
   *   verified:true
   * }
   */
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
      if (item?.verified === false) {
        continue;
      }

      const confidence =
        Number(item?.confidence);

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

      if (!Number.isFinite(points)) {
        continue;
      }

      candidates.push({
        type,
        label:String(
          item?.label ||
          CONTEXT_LABELS[type] ||
          type
        ).trim(),

        text:String(
          item?.text ||
          item?.description ||
          item?.label ||
          CONTEXT_LABELS[type] ||
          ''
        ).trim(),

        points,

        dedupeKey:String(
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

  function pregameRating(sport,event,competition,context) {
    const detail =
      eventSignalText(
        event,
        competition,
        context
      );

    const factors = [{
      label:'Sport baseline',
      points:SPORT_BASE[sport] || 35
    }];

    let reason =
      'Regular-season matchup · no extra stakes listed';

    if (/world series/.test(detail)) {
      factors.push({
        label:'World Series',
        points:42
      });

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

      reason =
        'Postseason game';
    } else if (
      sport === 'Tennis' &&
      /wimbledon|australian open|french open|roland garros|us open/
        .test(detail)
    ) {
      factors.push({
        label:'Major tournament',
        points:18
      });

      reason =
        'Tennis major';
    }

    if (
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

    const competitors =
      competition?.competitors || [];

    /*
     * NFL-specific pregame context.
     */
    if (sport === 'NFL') {
      const division =
        nflDivisionFor(competitors);

      const records =
        competitors.map(recordStats);

      const knownRecords =
        records.length === 2 &&
        records.every(Boolean);

      const bothWinning =
        knownRecords &&
        records.every(
          record =>
            record.pct > .5
        );

      if (division) {
        factors.push({
          label:`${division} matchup`,
          points:4
        });

        if (bothWinning) {
          factors.push({
            label:'Division race between winning teams',
            points:3
          });
        }

        reason +=
          ` · ${division} rivals`;
      }

      if (bothWinning) {
        factors.push({
          label:'Both winning records',
          points:14
        });

        if (
          Math.abs(
            records[0].pct -
            records[1].pct
          ) <= .1
        ) {
          factors.push({
            label:'Evenly matched winning records',
            points:4
          });
        }

        reason +=
          ' · both teams winning';
      } else if (
        knownRecords &&
        records.every(
          record =>
            record.pct >= .5
        )
      ) {
        factors.push({
          label:'Both teams at least .500',
          points:5
        });
      } else if (
        knownRecords &&
        records.every(
          record =>
            record.pct < .5
        )
      ) {
        factors.push({
          label:'Both teams below .500',
          points:-7
        });
      }

      if (
        knownRecords &&
        records.some(
          record =>
            record.wins === 0 &&
            record.games >= 3
        )
      ) {
        factors.push({
          label:'Winless team',
          points:-5
        });
      }

      if (
        knownRecords &&
        records.some(
          record =>
            record.losses === 0 &&
            record.games >= 3
        )
      ) {
        factors.push({
          label:'Unbeaten team',
          points:7
        });
      }

      const spread =
        listedSpread(competition);

      if (
        spread !== null &&
        spread <= 3
      ) {
        factors.push({
          label:'Tight projected spread',
          points:7
        });

        reason +=
          ' · close line';
      } else if (
        spread !== null &&
        spread <= 6
      ) {
        factors.push({
          label:'Competitive projected spread',
          points:4
        });

        reason +=
          ' · competitive line';
      }
    }

    /*
     * MLB, NHL and NBA now get meaningful regular-season matchup scoring.
     */
    if (
      ['MLB','NHL','NBA']
        .includes(sport)
    ) {
      const recordFactors =
        proRecordFactors(
          sport,
          competitors
        );

      factors.push(
        ...recordFactors
      );

      const division =
        divisionFor(
          sport,
          competitors
        );

      const bothWinning =
        recordFactors.some(
          item =>
            item.label ===
            'Both winning records'
        );

      if (division) {
        factors.push({
          label:`${division} matchup`,
          points:3
        });

        if (bothWinning) {
          factors.push({
            label:'Division matchup between winning teams',
            points:2
          });
        }

        reason +=
          ` · ${division} matchup`;
      }

      if (bothWinning) {
        reason +=
          ' · both teams winning';
      }

      const market =
        pregameMarketFactor(
          sport,
          competition
        );

      if (market) {
        factors.push(market);

        reason +=
          market.points >= 5
            ? ' · near pick’em'
            : ' · competitive market';
      }
    }

    /*
     * College rankings.
     */
    const ranks =
      ['CFB','NCAAB']
        .includes(sport)
        ? competitors
            .map(item =>
              Number(
                item.curatedRank?.current ||
                item.team?.rank
              )
            )
            .filter(
              rank =>
                rank > 0 &&
                rank <= 25
            )
        : [];

    if (ranks.length === 2) {
      factors.push({
        label:'Two ranked teams',
        points:
          sport === 'CFB'
            ? 28
            : 9
      });

      if (sport === 'CFB') {
        if (
          ranks.every(
            rank =>
              rank <= 20
          )
        ) {
          factors.push({
            label:'Both top 20',
            points:4
          });
        }

        if (
          ranks.some(
            rank =>
              rank <= 10
          )
        ) {
          factors.push({
            label:'Top 10 team',
            points:5
          });
        }

        const records =
          competitors
            .map(recordFor)
            .map(value =>
              String(value)
                .match(
                  /^(\d+)-(\d+)/
                )
            );

        if (
          records.every(
            match =>
              match &&
              Number(match[1]) >
              Number(match[2])
          )
        ) {
          factors.push({
            label:'Both winning records',
            points:3
          });
        }

        if (
          records.some(
            match =>
              match &&
              Number(match[1]) >= 4 &&
              Number(match[2]) === 0
          )
        ) {
          factors.push({
            label:'Unbeaten team',
            points:4
          });
        }
      }

      reason +=
        ' · two ranked teams';
    } else if (ranks.length === 1) {
      factors.push({
        label:'Ranked team',
        points:
          sport === 'CFB'
            ? 11
            : 4
      });

      if (
        sport === 'CFB' &&
        ranks[0] <= 10
      ) {
        factors.push({
          label:'Top 10 team',
          points:5
        });
      }

      reason +=
        ' · ranked team';
    }

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

    /*
     * Verified qualitative context supplied by the enrichment layer.
     */
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

    return {
      score:clampScore(
        factors.reduce(
          (sum,item) =>
            sum + item.points,
          0
        )
      ),
      factors,
      reason,
      contextFactors
    };
  }

  function gameProgress(sport,competition) {
    const status =
      competition?.status || {};

    const period =
      Number(
        status.period || 0
      );

    const total = {
      NFL:4,
      CFB:4,
      NHL:3,
      NBA:4,
      NCAAB:2,
      MLB:9,
      Soccer:2,
      Tennis:3
    }[sport] || 4;

    if (!period) {
      return 0;
    }

    if (sport === 'MLB') {
      return Math.min(
        1,
        period / total
      );
    }

    const length = {
      NFL:15,
      CFB:15,
      NHL:20,
      NBA:12,
      NCAAB:20,
      Soccer:45
    }[sport];

    const clock =
      String(
        status.displayClock || ''
      ).match(
        /^(\d+):(\d+)/
      );

    const remaining =
      clock && length
        ? Math.min(
            length * 60,
            Number(clock[1]) * 60 +
            Number(clock[2])
          )
        : length
          ? length * 30
          : 0;

    return Math.max(
      0,
      Math.min(
        1,
        (
          (period - 1) +
          (
            length
              ? 1 -
                remaining /
                (length * 60)
              : .5
          )
        ) / total
      )
    );
  }

  function momentumImpact(
    sport,
    summary,
    progress,
    state
  ) {
    if (state === 'upcoming') {
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
              ? gameProgress(
                  sport,
                  {
                    status:{
                      period,
                      displayClock:
                        play.clock?.displayValue ||
                        ''
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
                position
              }
            : null;
        })
        .filter(Boolean)
        .sort(
          (a,b) =>
            (a.position ?? 0) -
            (b.position ?? 0)
        );

    const threshold = {
      NFL:7,
      CFB:10,
      NHL:2,
      MLB:3,
      NBA:10,
      NCAAB:10,
      Soccer:2,
      Tennis:2
    }[sport] || 7;

    const units = {
      NFL:'points',
      CFB:'points',
      NHL:'goals',
      MLB:'runs',
      NBA:'points',
      NCAAB:'points',
      Soccer:'goals',
      Tennis:'sets'
    }[sport] || 'points';

    const competitors =
      summary?.header
        ?.competitions?.[0]
        ?.competitors || [];

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
            Number(progress) || 0
          );

    let previousLeader = 0;
    let leadChanges = 0;
    let lastFlip = -1;

    const flipPositions = [];

    let deepestHomeDeficit = 0;
    let deepestAwayDeficit = 0;
    let comeback = null;

    let previousHome = 0;
    let previousAway = 0;

    let runSide = '';
    let runPoints = 0;
    let runCount = 0;

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
          deficit:deepestHomeDeficit
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
          deficit:deepestAwayDeficit
        };
      }

      const leader =
        Math.sign(margin);

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
        if (runSide !== scorer) {
          runSide = scorer;
          runPoints = 0;
          runCount = 0;
        }

        runPoints +=
          scorer === 'home'
            ? homeGain
            : awayGain;

        runCount++;
      } else {
        runSide = '';
        runPoints = 0;
        runCount = 0;
      }

      previousHome =
        moment.home;

      previousAway =
        moment.away;
    }

    const factors = [];
    const details = [];

    if (leadChanges) {
      const points =
        state === 'live'
          ? Math.min(
              8,
              flipPositions.reduce(
                (sum,position) =>
                  sum +
                  (
                    position >=
                    currentProgress - .25
                      ? 3
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

    if (comeback) {
      factors.push({
        label:'Erased a large deficit',
        points:Math.min(
          8,
          4 +
          Math.floor(
            comeback.deficit /
            threshold
          ) * 2
        )
      });

      details.push(
        `${nameFor(comeback.side)} erased a deficit of ${comeback.deficit} ${units}`
      );
    }

    if (
      lastFlip >= .65 &&
      currentProgress -
      lastFlip <= .18
    ) {
      factors.push({
        label:'Recent late lead change',
        points:5
      });

      details.push(
        'the lead flipped late'
      );
    }

    const latestPosition =
      moments.at(-1)
        ?.position ??
      null;

    if (
      state === 'live' &&
      runCount >= 2 &&
      runPoints >= threshold &&
      latestPosition !== null &&
      currentProgress -
      latestPosition <= .12
    ) {
      factors.push({
        label:'Recent unanswered scoring run',
        points:4
      });

      details.push(
        `${nameFor(runSide)} scored ${runPoints} unanswered ${units} recently`
      );
    }

    if (
      moments.length >= 3 &&
      currentProgress >= .45
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
        factors.push({
          label:'Sustained competitive game',
          points:
            state === 'completed'
              ? 6
              : 4
        });

        details.push(
          `the score stayed within ${threshold} ${units} for about ${Math.round(competitiveShare * 100)}% of the game`
        );
      }
    }

    const winChances =
      (summary?.winprobability || [])
        .map(item =>
          Number(
            item.homeWinPercentage
          )
        )
        .filter(
          value =>
            Number.isFinite(value) &&
            value >= 0 &&
            value <= 1
        );

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
          Math.max(0,end - 10);
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
            size:Math.abs(change),
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
          8,
          Math.round(
            strongestSwing.size *
            16
          ) +
          (
            state === 'live' &&
            strongestSwing.end >=
            winChances.length - 12
              ? 2
              : 0
          )
        );

      factors.push({
        label:'Big win-chance swing',
        points
      });

      details.push(
        `${possessive(
          nameFor(
            strongestSwing.direction > 0
              ? 'home'
              : 'away'
          )
        )} estimated win chance swung by ${Math.round(strongestSwing.size * 100)} percentage points`
      );
    }

    let remaining = 20;

    const cappedFactors =
      factors
        .map(factor => {
          const points =
            Math.min(
              factor.points,
              remaining
            );

          remaining -=
            points;

          return {
            ...factor,
            points
          };
        })
        .filter(
          factor =>
            factor.points > 0
        );

    return {
      points:
        20 - remaining,

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

  function underdogCandidate(
    sport,
    competition,
    raw
  ) {
    if (
      !raw ||
      !competition?.competitors ||
      competition.competitors.length !== 2
    ) {
      return null;
    }

    const odds =
      raw.close ||
      raw.closing ||
      raw;

    const sides =
      ['home','away']
        .map(side => {
          const competitor =
            competition.competitors
              .find(
                item =>
                  item.homeAway === side
              );

          if (!competitor) {
            return null;
          }

          const spread =
            numberFromLine(
              odds.pointSpread
                ?.[side]
                ?.close
                ?.line ??
              odds.pointSpread
                ?.[side]
                ?.open
                ?.line
            );

          const moneyline =
            numberFromLine(
              odds.moneyline
                ?.[side]
                ?.close
                ?.odds ??
              odds.moneyline
                ?.[side]
                ?.open
                ?.odds
            );

          return {
            side,
            competitor,
            spread,
            moneyline
          };
        })
        .filter(Boolean);

    if (sides.length !== 2) {
      return null;
    }

    const spreadMinimum = {
      NFL:7,
      CFB:10,
      NBA:8,
      NCAAB:8
    }[sport];

    const moneylineMinimum = {
      MLB:180,
      NHL:180,
      Soccer:250,
      Tennis:180
    }[sport];

    let pick =
      spreadMinimum
        ? sides.find(
            item =>
              item.spread !== null &&
              item.spread >=
              spreadMinimum
          )
        : null;

    let type =
      pick
        ? 'spread'
        : '';

    if (
      !pick &&
      spreadMinimum
    ) {
      const amount =
        Math.abs(
          numberFromLine(
            odds.spread
          ) ??
          numberFromLine(
            odds.details
              ?.match(
                /[+-]\d+(?:\.\d+)?/
              )?.[0]
          ) ??
          0
        );

      if (
        amount >=
        spreadMinimum
      ) {
        pick =
          sides.find(
            item =>
              odds[
                `${item.side}TeamOdds`
              ]?.underdog === true ||
              odds[
                `${item.side}TeamOdds`
              ]?.favorite === false
          );

        if (pick) {
          pick = {
            ...pick,
            spread:amount
          };

          type =
            'spread';
        }
      }
    }

    if (
      !pick &&
      moneylineMinimum
    ) {
      pick =
        sides.find(
          item =>
            item.moneyline !== null &&
            item.moneyline >=
            moneylineMinimum
        );

      if (pick) {
        type =
          'moneyline';
      }
    }

    if (!pick) {
      return null;
    }

    const value =
      type === 'spread'
        ? pick.spread
        : pick.moneyline;

    const minimum =
      type === 'spread'
        ? spreadMinimum
        : moneylineMinimum;

    const teamIndex =
      competition.competitors
        .indexOf(
          pick.competitor
        );

    return {
      side:pick.side,

      teamId:String(
        pick.competitor.team?.id ||
        pick.competitor.id ||
        ''
      ),

      teamIndex,

      teamName:
        pick.competitor.team
          ?.displayName ||
        pick.competitor.team
          ?.name ||
        'The underdog',

      type,

      value,

      strength:
        Math.min(
          1,
          Math.max(
            0,
            (
              value -
              minimum
            ) /
            (
              type === 'spread'
                ? minimum
                : 200
            )
          )
        ),

      description:
        type === 'spread'
          ? `${value}-point underdog`
          : `+${value} moneyline underdog`
    };
  }

  function upsetImpact(
    candidate,
    teams,
    gameState,
    progress
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
      teams.findIndex(
        team =>
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
        teams[1 - teamIndex].score ??
        teams[1 - teamIndex][2]
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

    if (gameState === 'completed') {
      return margin > 0
        ? {
            points:
              20 +
              Math.round(
                5 *
                candidate.strength
              ),

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
          8 +
          Math.round(
            8 * progress
          ) +
          Math.round(
            5 *
            candidate.strength
          ),

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
          4 +
          Math.round(
            6 * progress
          ) +
          Math.round(
            3 *
            candidate.strength
          ),

        text:
          `${candidate.teamName}, a ${candidate.description}, is tied ${score}–${other} late`
      };
    }

    return {
      points:0,
      text:''
    };
  }

  function stateRating(
    openingScore,
    sport,
    gameState,
    gap,
    progress
  ) {
    const closeLimit =
      CLOSE_MARGIN[sport] || 10;

    const close =
      gap === null
        ? 0
        : Math.max(
            0,
            1 -
            gap /
            closeLimit
          );

    const contextWeight =
      gameState === 'completed'
        ? .22
        : Math.max(
            .26,
            .44 -
            .18 * progress
          );

    const contextPoints =
      Math.round(
        openingScore *
        contextWeight
      );

    const stateBase =
      gameState === 'completed'
        ? 24
        : 14;

    const closeCeiling =
      gameState === 'completed'
        ? 42
        : 16 +
          24 * progress;

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
              3 +
              7 * progress
            ) *
            close
          );

    const widePenalty =
      gap !== null &&
      gap >= closeLimit &&
      progress > .3
        ? Math.min(
            24,
            Math.round(
              (
                gap /
                closeLimit
              ) *
              12 *
              progress
            )
          )
        : 0;

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

    if (closePoints) {
      factors.push({
        label:
          gameState === 'completed'
            ? 'Final margin'
            : 'Score closeness and leverage',
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
        label:'Wide margin',
        points:-widePenalty
      });
    }

    return {
      score:clampScore(
        factors.reduce(
          (sum,item) =>
            sum + item.points,
          0
        )
      ),

      factors,
      closePoints,
      widePenalty
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
        openingScore:opening.score,
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

    /*
     * Once play starts, actual game state matters more than reputation.
     * A marquee matchup cannot remain near the top if it turns into a blowout.
     */
    const stateValue =
      stateRating(
        opening.score,
        sport,
        gameState,
        gap,
        progress
      );

    factors.length = 0;

    factors.push(
      ...stateValue.factors
    );

    const detail =
      `${competition?.status?.type?.detail || ''} ${competition?.status?.type?.shortDetail || ''}`;

    if (
      gameState === 'completed' &&
      /overtime|\bot\b/i
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
        progress
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

    const unit =
      sport === 'NHL' ||
      sport === 'Soccer'
        ? 'goal'
        : sport === 'MLB'
          ? 'run'
          : sport === 'Tennis'
            ? 'set'
            : 'point';

    if (gameState === 'live') {
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
        /overtime|\bot\b/i
          .test(detail)
          ? `Overtime finish · ${gap}-${unit} margin`
          : gap !== null
            ? `Decided by ${gap} ${unit}${gap === 1 ? '' : 's'}`
            : 'Final result';
    }

    return {
      score,
      factors,
      reason,
      openingScore:
        opening.score,
      underdog,
      upsetText:
        upset.text,
      upsetPoints:
        upset.points,
      contextFactors:
        opening.contextFactors || []
    };
  }

  function ordinal(value) {
    const n =
      Number(value);

    return `${n}${
      n % 100 >= 11 &&
      n % 100 <= 13
        ? 'th'
        : (
            {
              1:'st',
              2:'nd',
              3:'rd'
            }[n % 10] ||
            'th'
          )
    }`;
  }

  function livePhase(
    sport,
    status
  ) {
    const detail =
      String(
        status?.type?.detail ||
        status?.type?.shortDetail ||
        ''
      ).trim();

    const period =
      Number(
        status?.period || 0
      );

    if (sport === 'MLB') {
      const half =
        detail.match(
          /\b(top|bottom|bot)\b/i
        )?.[1] ||
        status?.inningHalf;

      return half && period
        ? `${/^bot/i.test(half) ? 'Bottom' : 'Top'} ${ordinal(period)}`
        : detail ||
          (
            period
              ? `${ordinal(period)} inning`
              : 'Live'
          );
    }

    if (
      /halftime|intermission|end of/i
        .test(detail)
    ) {
      return detail;
    }

    const clock =
      String(
        status?.displayClock || ''
      ).trim();

    if (
      sport === 'NHL' &&
      period
    ) {
      return `${
        clock &&
        /^\d+:\d+$/.test(clock)
          ? `${clock} · `
          : ''
      }${
        period > 3
          ? 'OT'
          : `${ordinal(period)} period`
      }`;
    }

    if (
      ['NFL','CFB','NBA','NCAAB']
        .includes(sport) &&
      period
    ) {
      return `${
        clock &&
        /^\d+:\d+$/.test(clock)
          ? `${clock} · `
          : ''
      }${ordinal(period)} ${
        ['NFL','CFB','NBA']
          .includes(sport)
          ? 'quarter'
          : 'half'
      }`;
    }

    return (
      detail ||
      (
        clock &&
        clock !== '0.0'
          ? clock
          : 'Live'
      )
    );
  }

  function runnerOn(
    situation,
    base
  ) {
    const value =
      situation?.[`on${base}`] ??
      situation?.runners
        ?.[base.toLowerCase()];

    return (
      value === undefined ||
      value === null
    )
      ? null
      : Boolean(value);
  }

  function hockeyPowerPlay(
    summary,
    teams
  ) {
    const onIce =
      summary?.onIce || [];

    const blocks =
      summary?.boxscore
        ?.players || [];

    if (onIce.length !== 2) {
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
                      entry.athlete?.id ||
                      ''
                    )
                  )
              )
          )
        ])
      );

    const sides =
      onIce.map(side => ({
        id:String(
          side.teamId || ''
        ),

        count:
          (side.entries || [])
            .length,

        hasGoalie:
          (side.entries || [])
            .some(entry =>
              goalieIds
                .get(
                  String(
                    side.teamId ||
                    ''
                  )
                )
                ?.has(
                  String(
                    entry.athleteid ||
                    ''
                  )
                )
            )
      }));

    if (
      !sides.every(
        side =>
          side.hasGoalie
      ) ||
      sides[0].count ===
      sides[1].count ||
      Math.max(
        ...sides.map(
          side =>
            side.count
        )
      ) !== 6 ||
      Math.min(
        ...sides.map(
          side =>
            side.count
        )
      ) < 4
    ) {
      return null;
    }

    const advantaged =
      sides.find(
        side =>
          side.count === 6
      );

    return (
      teams.find(
        team =>
          String(
            team[8] || ''
          ) ===
          advantaged.id
      )?.[0] ||
      null
    );
  }

  function noHitBid(summary) {
    const competitors =
      summary?.header
        ?.competitions?.[0]
        ?.competitors || [];

    for (
      const block of
      summary?.boxscore?.players || []
    ) {
      const opponent =
        competitors.find(
          item =>
            String(
              item.team?.id ||
              ''
            ) !==
            String(
              block.team?.id ||
              ''
            )
        );

      if (
        !opponent ||
        Number(opponent.hits) !== 0 ||
        opponent.hits == null
      ) {
        continue;
      }

      for (
        const group of
        block.statistics || []
      ) {
        const labels =
          group.labels || [];

        const innings =
          labels.indexOf('IP');

        const hits =
          labels.indexOf('H');

        if (
          innings < 0 ||
          hits < 0
        ) {
          continue;
        }

        const pitcher =
          (group.athletes || [])
            .find(entry =>
              Number.parseFloat(
                entry.stats?.[innings]
              ) >= 6 &&
              Number(
                entry.stats?.[hits]
              ) === 0
            );

        if (pitcher) {
          return {
            text:
              `${pitcher.athlete?.displayName || 'A pitcher'} has thrown ${Math.floor(Number.parseFloat(pitcher.stats[innings]))} hitless innings in a no-hit bid`,

            points:14
          };
        }
      }
    }

    return null;
  }

  function hockeyGoalMilestone(summary) {
    for (
      const block of
      summary?.boxscore?.players || []
    ) {
      for (
        const group of
        block.statistics || []
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

        if (goals < 0) {
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
            scorer.athlete
              ?.displayName ||
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

  function footballMilestone(summary) {
    for (
      const block of
      summary?.boxscore?.players || []
    ) {
      for (
        const group of
        block.statistics || []
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
            .findIndex(
              label =>
                /^TD$|^PASS TD$/i
                  .test(label)
            );

        if (touchdowns < 0) {
          continue;
        }

        const passer =
          (group.athletes || [])
            .find(entry =>
              Number(
                entry.stats
                  ?.[touchdowns]
              ) >= 3
            );

        if (passer) {
          return {
            text:
              `${passer.athlete?.displayName || 'A quarterback'} has thrown ${passer.stats[touchdowns]} touchdown passes`,

            points:6
          };
        }
      }
    }

    return null;
  }

  function liveMilestone(
    sport,
    summary
  ) {
    return sport === 'MLB'
      ? noHitBid(summary)
      : sport === 'NHL'
        ? hockeyGoalMilestone(summary)
        : ['NFL','CFB']
            .includes(sport)
          ? footballMilestone(summary)
          : null;
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
      phase:livePhase(
        game.sport,
        status
      ),

      note:'',
      reasons:[],
      bonus:0,
      bases:null
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

    if (
      ['NFL','CFB']
        .includes(game.sport)
    ) {
      const possessionId =
        String(
          situation.possession?.id ||
          situation.possession ||
          ''
        );

      const holder =
        game.teams.find(
          team =>
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

      snapshot.note =
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
          .join(' · ');

      if (
        situation.isRedZone === true
      ) {
        snapshot.reasons.push(
          `${holder?.[0] || 'The offense'} is in the red zone`
        );

        snapshot.bonus += 4;
      }

      if (
        down === 4 &&
        downText
      ) {
        snapshot.reasons.push(
          `${downText} is a pivotal down`
        );

        snapshot.bonus += 3;
      }

      if (
        progress >= .78 &&
        scoreGap <= 8
      ) {
        snapshot.reasons.push(
          `It is a one-possession game late in the ${
            Number(status?.period) >= 4
              ? 'fourth quarter'
              : 'game'
          }`
        );

        snapshot.bonus += 6;
      }
    } else if (
      game.sport === 'MLB'
    ) {
      const bases = {
        first:
          runnerOn(
            situation,
            'First'
          ),

        second:
          runnerOn(
            situation,
            'Second'
          ),

        third:
          runnerOn(
            situation,
            'Third'
          )
      };

      snapshot.bases =
        Object.values(bases)
          .some(
            value =>
              value !== null
          )
          ? bases
          : null;

      const outs =
        Number(
          situation.outs
        );

      const hasOuts =
        situation.outs !== undefined &&
        situation.outs !== null &&
        Number.isInteger(outs) &&
        outs >= 0 &&
        outs <= 2;

      snapshot.note =
        hasOuts
          ? `${outs} ${outs === 1 ? 'out' : 'outs'}`
          : '';

      const occupied =
        Object.entries(bases)
          .filter(
            ([,value]) =>
              value
          )
          .map(
            ([base]) =>
              base
          );

      if (occupied.length) {
        snapshot.reasons.push(
          `Runners on ${occupied.join(' and ')}`
        );
      }

      if (
        (
          bases.second ||
          bases.third
        ) &&
        Number(
          status?.period || 0
        ) >= 7 &&
        scoreGap <= 1
      ) {
        snapshot.reasons.push(
          'The tying or go-ahead run is in scoring position late'
        );

        snapshot.bonus +=
          Number(
            status?.period || 0
          ) >= 9
            ? 8
            : 5;
      }
    } else if (
      game.sport === 'NHL'
    ) {
      const powerPlayTeam =
        summary
          ? hockeyPowerPlay(
              summary,
              game.teams
            )
          : null;

      if (powerPlayTeam) {
        snapshot.note =
          `${powerPlayTeam} power play`;

        snapshot.bonus += 4;
      }

      if (
        progress >= .82 &&
        scoreGap <= 1
      ) {
        snapshot.reasons.push(
          'It is a one-goal game late in the third period'
        );

        snapshot.bonus += 6;
      }
    } else if (
      ['NBA','NCAAB']
        .includes(game.sport) &&
      progress >= .86 &&
      scoreGap <= 6
    ) {
      snapshot.reasons.push(
        `It is a ${scoreGap || 'tied'}-point game in the closing minutes`
      );

      snapshot.bonus +=
        scoreGap <= 3
          ? 8
          : 5;
    }

    const milestone =
      summary
        ? liveMilestone(
            game.sport,
            summary
          )
        : null;

    if (milestone) {
      snapshot.reasons.push(
        milestone.text
      );

      snapshot.bonus +=
        milestone.points;
    }

    return snapshot;
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

    game.live =
      liveSnapshot(
        game,
        competition,
        summary
      );

    game.score =
      clampScore(
        game.baseScore +
        game.live.bonus
      );
  }

  const api = {
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
    pregameRating,
    gameProgress,
    momentumImpact,
    underdogCandidate,
    upsetImpact,
    stateRating,
    rateGame,
    ordinal,
    livePhase,
    runnerOn,
    hockeyPowerPlay,
    noHitBid,
    hockeyGoalMilestone,
    footballMilestone,
    liveMilestone,
    liveSnapshot,
    applyLiveSnapshot
  };

  root.SportsRadarScore = api;

  if (
    typeof module !== 'undefined' &&
    module.exports
  ) {
    module.exports = api;
  }
})(globalThis);

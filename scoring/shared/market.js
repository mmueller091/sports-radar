/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  function parseLine(raw, competition, sport) {
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
      totalValue == null ||
      totalValue === ''
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
      (
        !isMoneyline ||
        Math.abs(Number(listed.spread)) <= 10
      )
    ) {
      const amount =
        Math.abs(
          Number(listed.spread)
        );

      const home =
        (competition?.competitors || [])
          .find(
            team =>
              team.homeAway === 'home'
          );

      const away =
        (competition?.competitors || [])
          .find(
            team =>
              team.homeAway === 'away'
          );

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

  function lineFromSummary(summary, sport) {
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
          .replace(
            /[^+\-.\d]/g,
            ''
          )
      );

    return Number.isFinite(n)
      ? n
      : null;
  }

  function moneylinePrices(raw) {
    if (!raw) {
      return [];
    }

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
      ).match(
        /[+-]\d{3,4}\b/g
      ) || [];

    return [
      ...new Set(
        [
          ...candidates,
          ...details
        ]
          .map(numberFromLine)
          .filter(value =>
            value !== null &&
            Math.abs(value) >= 100
          )
      )
    ];
  }

  function spreadMarketPoints(spread) {
    return Math.round(5 / (1 + (spread / 6) ** 2));
  }

  function pregameMarketFactor(sport,competition) {
    const raw =
      competition?.odds?.[0];

    if (!raw) {
      return null;
    }

    if (
      ['NBA','CFB','NCAAB']
        .includes(sport)
    ) {
      const spread =
        listedSpread(competition);
      const points = spread === null
        ? 0
        : spreadMarketPoints(spread);
      return points ? {
        label:points >= 4
          ? 'Very close projected spread'
          : 'Competitive projected spread',
        points
      } : null;
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
            value =>
              Math.abs(value)
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

  function underdogCandidate(sport,competition,raw) {
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

    if (
      sides.length !== 2
    ) {
      return null;
    }

    const spreadMinimum = ({
      NFL:7,
      // Ramp CFB impact through ten instead of creating a +9.5/+10 cliff.
      CFB:7,
      NBA:8,
      NCAAB:8
    })[sport];

    const moneylineMinimum = ({
      MLB:180,
      NHL:180,
      Soccer:250,
      Tennis:180
    })[sport];

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
      side:
        pick.side,

      teamId:
        String(
          pick.competitor.team?.id ||
          pick.competitor.id ||
          ''
        ),

      teamIndex,

      teamName:
        pick.competitor.team?.displayName ||
        pick.competitor.team?.name ||
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

      activation:
        sport === 'CFB' && type === 'spread'
          ? Math.min(1,Math.max(0,(value - 7) / 3))
          : 1,

      description:
        type === 'spread'
          ? `${value}-point underdog`
          : `+${value} moneyline underdog`
    };
  }

  const api = {parseLine,lineFromSummary,listedSpread,numberFromLine,moneylinePrices,spreadMarketPoints,pregameMarketFactor,underdogCandidate};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).shared_market = api;
  }
})(globalThis);

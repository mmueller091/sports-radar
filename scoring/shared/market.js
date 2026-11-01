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

  // Pregame football only; leave live/final and other-sport parsers unchanged.
  function footballPregameSpread(competition) {
    const raw = competition?.odds?.[0];
    const odds = raw?.close || raw?.closing || raw;
    if (!odds) return null;
    const number = value => {
      if (value == null || typeof value === 'boolean' || typeof value === 'object' || String(value).trim() === '') return null;
      const text = String(value).trim().replace(/[−–]/g,'-');
      if (/^(?:pk|pick(?:['’]?em)?|even)$/i.test(text)) return 0;
      return /^[+-]?\d+(?:\.\d+)?$/.test(text) && Number.isFinite(Number(text)) ? Math.abs(Number(text)) : null;
    };
    for (const value of [odds.spread?.displayValue,odds.spread,
      odds.pointSpread?.home?.close?.line,odds.pointSpread?.away?.close?.line]) {
      const spread = number(value);
      if (spread !== null) return spread;
    }
    const details = String(odds.details || odds.displayValue || '').trim().replace(/[−–]/g,'-');
    if (/\b(?:pk|pick(?:['’]?em)?|even)\b/i.test(details)) return 0;
    const match = details.match(/(?:^|\s)[+-](\d+(?:\.\d+)?)\s*$/);
    return match && Number(match[1]) < 100 ? Number(match[1]) : null;
  }

  const FOOTBALL_SPREAD_ANCHORS = {
    NFL:[[0,7],[3,6],[3.5,5.625],[6,2],[7,0],[8,-2],[10,-4],[14,-6],[17,-8],[21,-10]],
    CFB:[[0,5],[3,4],[7,2],[10,1],[14,0],[20,-4],[27,-7],[35,-10]]
  };
  function footballSpreadAdjustment(sport,spread) {
    if (spread == null || typeof spread !== 'number' || !Number.isFinite(spread)) return 0;
    const anchors = FOOTBALL_SPREAD_ANCHORS[sport];
    if (!anchors) return 0;
    const value = Math.abs(spread);
    for (let i=1;i<anchors.length;i++) {
      const [x,y]=anchors[i-1],[nextX,nextY]=anchors[i];
      if (value <= nextX) {
        if(sport!=='NFL')return y+(nextY-y)*(value-x)/(nextX-x);
        // Monotone cubic Hermite interpolation: continuous values AND slopes,
        // no threshold jumps or overshoot. The final slope meets the flat tail.
        const tangent=index=>{
          if(index===0)return (anchors[1][1]-anchors[0][1])/(anchors[1][0]-anchors[0][0]);
          if(index===anchors.length-1)return 0;
          const [px,py]=anchors[index-1],[cx,cy]=anchors[index],[nx,ny]=anchors[index+1];
          const left=(cy-py)/(cx-px),right=(ny-cy)/(nx-cx);
          if(left*right<=0)return 0;
          const a=2*(nx-cx)+(cx-px),b=(nx-cx)+2*(cx-px);
          return (a+b)/(a/left+b/right);
        };
        const width=nextX-x,t=(value-x)/width;
        return (2*t**3-3*t**2+1)*y+(t**3-2*t**2+t)*width*tangent(i-1)
          +(-2*t**3+3*t**2)*nextY+(t**3-t**2)*width*tangent(i);
      }
    }
    return anchors.at(-1)[1];
  }

  function pregameMarketFactor(sport,competition,options={}) {
    const raw =
      competition?.odds?.[0];

    if (!raw) {
      return null;
    }

    if (sport === 'CFB' && options.calibratedPregame) {
      const spread = footballPregameSpread(competition);
      const points = footballSpreadAdjustment(sport,spread);
      return points ? {label:points < 0 ? 'Projected spread mismatch' : points >= 4 ? 'Very close projected spread' : 'Competitive projected spread',points:Number(points.toFixed(2))} : null;
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

  const api = {parseLine,lineFromSummary,listedSpread,numberFromLine,moneylinePrices,spreadMarketPoints,pregameMarketFactor,underdogCandidate,footballPregameSpread,footballSpreadAdjustment,FOOTBALL_SPREAD_ANCHORS};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).shared_market = api;
  }
})(globalThis);

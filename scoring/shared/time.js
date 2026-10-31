/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  function normalizedTime(sport,competition) {
    const status =
      competition?.status || {};

    const period =
      Number(
        status.period || 0
      );

    const total = ({
      NFL:4,
      CFB:4,
      NHL:3,
      NBA:4,
      NCAAB:2,
      MLB:9,
      Soccer:2,
      Tennis:3
    })[sport] || 4;

    if (!period) return {progress:0,elapsedSeconds:null,remainingSeconds:null};

    if (sport === 'MLB') {
      const detail =
        String(
          status.type?.detail ||
          status.type?.shortDetail ||
          ''
        ).toLowerCase();

      const half =
        /bottom|bot\b/.test(detail)
          ? .75
          : /top\b/.test(detail)
            ? .25
            : .5;

      const elapsed = (period - 1) + half;
      return {elapsedSeconds:elapsed * 20 * 60,remainingSeconds:null,progress:Math.max(
        0,
        Math.min(
          1,
          elapsed /
          9
        )
      )};
    }

    if (sport === 'Tennis') {
      const bestOf =
        Number(
          competition?.format?.regulation?.periods ||
          competition?.format?.bestOf ||
          total
        ) ||
        total;

      const elapsed = (period - 1) + .5;
      return {elapsedSeconds:null,remainingSeconds:null,progress:Math.max(
        0,
        Math.min(
          .98,
          elapsed /
          Math.max(
            1,
            bestOf
          )
        )
      )};
    }

    const length = ({
      NFL:15,
      CFB:15,
      NHL:20,
      NBA:12,
      NCAAB:20,
      Soccer:45
    })[sport];

    const display = String(status.displayClock || '').trim();
    const colon = display.match(/^(\d+):(\d+(?:\.\d+)?)$/);
    const decimal = display.match(/^(\d+\.\d+)$/);
    const soccer = display.match(/^(\d+)'?(?:\+(\d+)'?)?$/);
    const numeric = Number(status.clock);
    let elapsedSeconds = null;
    let remainingSeconds = null;
    if (sport === 'Soccer') {
      const minute = soccer ? Number(soccer[1]) + Number(soccer[2] || 0) : null;
      elapsedSeconds = soccer?.[2] ? minute * 60
        : Number.isFinite(numeric) && status.clock != null ? numeric
        : minute !== null ? minute * 60
        : colon ? (Number(colon[1]) * 60 + Number(colon[2])) : null;
    } else {
      remainingSeconds = colon ? Number(colon[1]) * 60 + Number(colon[2])
        : decimal ? Number(decimal[1])
        : Number.isFinite(numeric) && status.clock != null ? numeric : null;
      if (remainingSeconds !== null) {
        if (status.clockMode === 'elapsed') {
          elapsedSeconds = ((period - 1) * length * 60) + remainingSeconds;
          remainingSeconds = Math.max(0,length * 60 - remainingSeconds);
        } else {
          elapsedSeconds = ((period - 1) * length * 60) + Math.max(0,length * 60 - remainingSeconds);
        }
      }
    }
    const elapsedPeriods = elapsedSeconds === null ? period - .5 : elapsedSeconds / (length * 60);
    return {elapsedSeconds,remainingSeconds,progress:Math.max(0,Math.min(1,elapsedPeriods / total))};
  }

  function gameProgress(sport,competition) {
    return normalizedTime(sport,competition).progress;
  }

  function eventPosition(sport,competition) {
    const time = normalizedTime(sport,competition);
    const regulationMinutes = {NFL:60,CFB:60,NHL:60,NBA:48,NCAAB:40,MLB:180,Soccer:90}[sport];
    return time.elapsedSeconds !== null && regulationMinutes
      ? time.elapsedSeconds / (regulationMinutes * 60) : time.progress;
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

  function livePhase(sport,status,format={}) {
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

    if (
      sport === 'MLB'
    ) {
      const half =
        detail.match(
          /\b(top|bottom|bot)\b/i
        )?.[1] ||
        status?.inningHalf;

      return (
        half &&
        period
      )
        ? `${/^bot/i.test(half) ? 'Bottom' : 'Top'} ${ordinal(period)}`
        : detail ||
          (
            period
              ? `${ordinal(period)} inning`
              : 'Live'
          );
    }

    if (
      sport === 'Tennis'
    ) {
      return (
        detail ||
        (
          period
            ? `${ordinal(period)} set`
            : 'Live'
        )
      );
    }

    const regulationPeriods = sport === 'NCAAB'
      ? Number(format?.regulation?.periods) || 2
      : ({NFL:4,CFB:4,NBA:4,NHL:3})[sport];
    const overtime = regulationPeriods && period > regulationPeriods
      ? period - regulationPeriods : 0;
    const overtimeLabel = overtime === 1 ? 'OT' : `${overtime}OT`;

    if (/halftime|intermission|end of/i.test(detail)) {
      return overtime
        ? detail.replace(/\b\d+(?:st|nd|rd|th)?\s+(?:quarter|half|period)\b/gi,overtimeLabel)
        : detail;
    }

    const clock = String(status?.displayClock || '').trim();
    if (regulationPeriods && period) {
      const unit = sport === 'NHL' ? 'period'
        : sport === 'NCAAB' && regulationPeriods === 2 ? 'half' : 'quarter';
      return `${clock && /^\d+:\d+$/.test(clock) ? `${clock} · ` : ''}${
        overtime ? overtimeLabel : `${ordinal(period)} ${unit}`
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

  function clockSeconds(status) {
    return normalizedTime('NBA',{status:{...status,period:status?.period || 1}}).remainingSeconds;
  }

  function isHalftimeStatus(status) {
    const type=status?.type || {};
    if (type.completed || ['post','pre'].includes(type.state)) return false;
    const text=[type.name,type.description,type.detail,type.shortDetail,status?.displayPeriod].filter(Boolean).join(' ');
    if (/half[ -]?time/i.test(text)) return true;
    return Number(status?.period)===2 && /^(?:0+:)?0+(?:\.0+)?$/.test(String(status?.displayClock || ''));
  }

  const api = {isHalftimeStatus,normalizedTime,gameProgress,eventPosition,ordinal,livePhase,clockSeconds};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).shared_time = api;
  }
})(globalThis);

/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  function tennisSituationImpact(game,competition,summary,status,progress) {
    const situation = competition?.situation || summary?.header?.competitions?.[0]?.situation || summary?.situation || {};
    const text = [status?.type?.detail,status?.type?.shortDetail,situation?.displayValue,situation?.description,situation?.pointScore,situation?.score].filter(Boolean).join(' ');
    const period = Number(status?.period || 0);
    const bestOf = Number(competition?.format?.regulation?.periods || competition?.format?.bestOf || (period >= 5 ? 5 : 3));
    const sets = game.teams.map(team => Number(team[2]));
    const deciding = /deciding|final set|fifth set|third set/i.test(text) && period >= bestOf ||
      period >= bestOf && sets.length === 2 && sets.every(Number.isFinite) && Math.abs(sets[0]-sets[1]) <= 1;
    const late = Math.max(0,Math.min(1,(progress-.45)/.5));
    const tiebreak = situation.tiebreak === true || situation.isTiebreak === true || /tie.?break/i.test(text);
    const matchPoint = situation.matchPoint === true || situation.isMatchPoint === true || /match point/i.test(text);
    let points = 0;
    const reasons = [];

    if (matchPoint) {
      points = Math.max(points,Math.round((deciding ? 10 : 6) + 2*late + (tiebreak ? 1 : 0)));
      reasons.push('The match is at match point');
    } else if (situation.setPoint === true || situation.isSetPoint === true || /set point/i.test(text)) {
      points = Math.max(points,Math.round(4 + 2*late + (deciding ? 2 : 0)));
      reasons.push('The current set is at set point');
    }

    if (situation.breakPoint === true || situation.isBreakPoint === true || /break point/i.test(text)) {
      points = Math.max(points,Math.round(2 + 2*late + (deciding ? 1 : 0)));
      reasons.push('A break point is in progress');
    }

    if (tiebreak) {
      points = Math.max(points,Math.round(4 + 2*late + (deciding ? 2 : 0)));
      reasons.push('The match is in a tiebreak');
    }

    if (/\bdeuce\b/i.test(text)) {
      points = Math.max(points,Math.round(1 + late + (deciding ? 1 : 0)));
      reasons.push('The current game is at deuce');
    }

    if (deciding && progress >= .75) {
      points = Math.max(points,5);
      reasons.push('The match is deep in a deciding set');
    }

    return {points:Math.min(12,points),note:text.slice(0,80),reasons,
      competitiveFloor:matchPoint && deciding ? (tiebreak ? 20 : 19) : 0};
  }

  function tennisMajor(detail) {
    return /wimbledon|australian open|french open|roland garros|us open/.test(detail)
      ? {factor:{label:'Major tournament',points:18},reason:'Tennis major'}
      : null;
  }

  const tennisModel = {
    unit:'set',majorTournament:tennisMajor,
    situation:({game,competition,summary,status,progress}) =>
      tennisSituationImpact(game,competition,summary,status,progress),
    history:{threshold:2,units:'sets'}
  };

  const api = {tennisSituationImpact,tennisMajor,tennisModel};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).sports_tennis = api;
  }
})(globalThis);

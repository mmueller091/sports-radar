/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {gameProgress,eventPosition} = typeof module !== 'undefined' && module.exports
    ? require('./time.js')
    : root.SportsRadarScoring.shared_time;

  function eventShockFor(sport,summary,status,model={}) {
    const plays = summary?.plays?.length ? summary.plays : summary?.scoringPlays || [];
    const duration = model.duration || 60;
    const currentProgress = gameProgress(sport,{status});
    const positioned = plays.map((play,index) => {
      const period = Number(play.period?.number || play.period || 0);
      const position = period ? eventPosition(sport,{status:{period,displayClock:play.clock?.displayValue || '',clock:play.clock?.value,type:{detail:play.period?.displayValue || ''}}}) : null;
      return {play,index,position};
    }).filter(item => item.position !== null && item.position <= eventPosition(sport,{status}) + .01).sort((a,b) => a.position-b.position || a.index-b.index);
    let points = 0;
    const reasons = [];
    for (let i=0;i<positioned.length;i++) {
      const {play,position} = positioned[i];
      const text = String(play.text || play.shortText || play.type?.text || '').toLowerCase();
      let value = 0;
      let label = '';
      let shock;
      if (/blocked.{0,30}(?:punt|kick|field goal)|(?:punt|kick|field goal).{0,30}blocked/.test(text) && /touchdown|\btd\b/.test(text)) { value=12; label='Blocked kick or punt returned for a touchdown'; }
      else if (/pick[- ]six|intercept(?:ion|ed).{0,80}(?:touchdown|\btd\b)|fumble.{0,40}(?:returned|touchdown)|defensive touchdown/.test(text)) { value=10; label='Defensive touchdown'; }
      else if (/\bsafety\b/.test(text)) { value=6; label='Safety'; }
      else if (/grand slam/.test(text)) { value=8; label='Grand slam'; }
      else if (model.earlyEventShock && (shock = model.earlyEventShock({text,positioned,i,play}))) { ({value,label} = shock); }
      else if (/\bturnover\b|intercepted|fumble recovered by|picked off|caught stealing/.test(text)) { value=4; label='Turnover'; }
      else if (model.eventShock && (shock = model.eventShock({text,positioned,i,play}))) { ({value,label} = shock); }
      if (model.eventShockWeight) value *= model.eventShockWeight({text,positioned,i,play});
      if (!value) continue;
      const playsSince = positioned.length - 1 - i;
      const periodGap = Math.abs(Number(status?.period || 0)-Number(play.period?.number || play.period || 0));
      const currentEventPosition = eventPosition(sport,{status});
      const ageMinutes = model.inningEventAge ? periodGap * 20 : Math.max(0,currentEventPosition-position) * duration;
      const decay = Math.min(Math.max(0,1-playsSince/7),Math.max(0,1-ageMinutes/3));
      if (decay <= 0) continue;
      points += value * decay;
      reasons.push(label);
    }
    return {points:Math.min(12,Math.round(points)),reasons:[...new Set(reasons)]};
  }

  const api = {eventShockFor};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).shared_events = api;
  }
})(globalThis);

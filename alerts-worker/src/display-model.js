import time from '../../scoring/shared/time.js';
// Additive presentation data only; never participates in rating calculations.
export function footballSituation(game,summary=null) {
  if (!['NFL','CFB'].includes(game.sport) || game.state !== 'live' || time.isHalftimeStatus(game.liveRawStatus)) return null;
  const liveSituation = game.liveRawSituation || {};
  const plays = summary?.drives?.current?.plays;
  const lastPlayEnd = Array.isArray(plays) ? plays.at(-1)?.end : null;
  // ESPN's competition.situation is often absent for CFB; the current drive's
  // last play end carries the same explicit possession and down/spot fields.
  const source = {...(lastPlayEnd ? {...lastPlayEnd,possession:lastPlayEnd.team?.id} : {}),...liveSituation};
  const possession = String(source.possession?.id ?? source.possession ?? '');
  const holders = game.teams.filter(team => team[8] && String(team[8]) === possession);
  const text = String(liveSituation.shortDownDistanceText || liveSituation.downDistanceText || source.shortDownDistanceText || source.downDistanceText || '');
  const parsed = text.match(/\b([1-4])(?:st|nd|rd|th)\s*(?:&|and)\s*(goal|\d+)/i);
  const down = Number(source.down ?? parsed?.[1]);
  const distance = source.distance == null || source.distance === '' ? (parsed && !/goal/i.test(parsed[2]) ? Number(parsed[2]) : null) : Number(source.distance);
  const goalToGo = source.isGoalToGo === true || /\bgoal\b/i.test(text);
  const downAndDistance = Number.isInteger(down) && down >= 1 && down <= 4 && (goalToGo || (distance !== null && Number.isFinite(distance) && distance >= 0))
    ? `${['','1st','2nd','3rd','4th'][down]} & ${goalToGo ? 'Goal' : distance}` : '';
  // Use explicit field-side text, never infer the side from possession/yardLine.
  const spot = `${liveSituation.possessionText || ''} ${liveSituation.downDistanceText || ''} ${source.possessionText || ''} ${source.downDistanceText || ''}`.match(/\b([A-Z][A-Z0-9]{1,5})\s+(\d{1,2})\b/);
  const fieldPosition = spot && Number(spot[2]) <= 50 && game.teams.some(team => team[1] === spot[1]) ? `${spot[1]} ${Number(spot[2])}` : '';
  return {possessionTeamId:holders.length === 1 ? possession : null,downAndDistance,fieldPosition};
}

export function baseballSituation(game) {
  if (game.sport !== 'MLB' || game.state !== 'live') return null;
  const source = game.liveRawSituation || {};
  const bases = {};
  for (const [key, field] of [['first','onFirst'],['second','onSecond'],['third','onThird']]) {
    const value = source[field] ?? source.runners?.[key];
    if (typeof value === 'boolean') bases[key] = value;
  }
  const validCount = (value,max) => value !== null && value !== undefined && value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= max ? Number(value) : null;
  const outs = validCount(source.outs,3);
  const balls = validCount(source.balls,3);
  const strikes = validCount(source.strikes,2);
  return Object.keys(bases).length || outs !== null || (balls !== null && strikes !== null)
    ? {bases:Object.keys(bases).length ? bases : null,outs,count:balls !== null && strikes !== null ? `${balls}-${strikes}` : ''}
    : null;
}

const columns = {
  minutes:['MIN','minutes'], fg:['FG','fieldGoalsMade-fieldGoalsAttempted'],
  threePt:['3PT','threePointFieldGoalsMade-threePointFieldGoalsAttempted'],
  ft:['FT','freeThrowsMade-freeThrowsAttempted'], rebounds:['REB','rebounds'],
  assists:['AST','assists'], steals:['STL','steals'], blocks:['BLK','blocks'],
  turnovers:['TO','turnovers'], fouls:['PF','fouls'], points:['PTS','points']
};
export function basketballBoxScore(summary,sport) {
  if (!['NBA','NCAAB'].includes(sport)) return null;
  const competitors = summary?.header?.competitions?.[0]?.competitors || [];
  const teams = (summary?.boxscore?.players || []).map(block => {
    const players = [];
    let totals = null;
    for (const group of block.statistics || []) {
      const statsFor = values => Object.fromEntries(Object.entries(columns).map(([key,aliases]) => {
        const index = Math.max(...['labels','names','keys'].map(field => (group[field] || []).findIndex(label => aliases.some(alias => alias.toLowerCase() === String(label).toLowerCase()))));
        return [key,index >= 0 && values?.[index] != null ? String(values[index]) : null];
      }));
      for (const entry of group.athletes || []) {
        players.push({id:String(entry.athlete?.id || ''),name:entry.athlete?.displayName || entry.athlete?.shortName || 'Player',
          starter:typeof entry.starter === 'boolean' ? entry.starter : null,
          didNotPlay:entry.didNotPlay === true,dnpReason:entry.didNotPlay ? String(entry.reason || '') : '',stats:statsFor(entry.stats)});
      }
      if (Array.isArray(group.totals) && group.totals.length) totals = statsFor(group.totals);
    }
    const team = block.team || {};
    const competitor = competitors.find(item => String(item.team?.id) === String(team.id));
    return {teamId:String(team.id || ''),abbreviation:team.abbreviation || '',displayName:team.displayName || 'Team',
      periods:(competitor?.linescores || []).map((line,index) => ({label:line.period?.displayValue || String(index+1),value:String(line.displayValue ?? line.value ?? '')})),players,totals};
  }).filter(team => team.players.length);
  return teams.length ? {teams} : null;
}

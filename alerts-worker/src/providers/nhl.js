import advanced from '../../../scoring/nhl-advanced.cjs';
import hockey from '../../../scoring/sports/nhl.js';
const BASE='https://api-web.nhle.com/v1';
const abbrev=advanced.nhlAbbreviation;
const unavailable=reason=>({available:false,reason,source:'NHL public play-by-play'});

// NHL and ESPN IDs are unrelated. Match both sides and scheduled start from the
// public weekly schedule; never interpret an ESPN event ID as an NHL game ID.
export async function nhlGameCenterStats(game,summary,readResource) {
  if (game.sport!=='NHL' || game.state==='upcoming') return unavailable('Available after play begins');
  const comp=summary?.header?.competitions?.[0] || game.sourceCompetition;
  const competitors=comp?.competitors || [];
  const home=competitors.find(c=>c.homeAway==='home'),away=competitors.find(c=>c.homeAway==='away');
  const start=Date.parse(game.sourceEvent?.date || comp?.date || game.startTime);
  if (!home || !away || !Number.isFinite(start)) return unavailable('Game identity unavailable');
  try {
    // Noon offset maps early UTC starts to the preceding NHL schedule date.
    const date=new Date(start-12*3600000).toISOString().slice(0,10);
    const schedule=await readResource(`${BASE}/schedule/${date}`,6*3600000);
    const matches=(schedule.payload?.gameWeek || []).flatMap(day=>day.games || []).filter(g=>
      g.homeTeam?.abbrev===abbrev(home.team?.abbreviation) && g.awayTeam?.abbrev===abbrev(away.team?.abbreviation) &&
      Math.abs(Date.parse(g.startTimeUTC)-start)<6*3600000);
    if (matches.length!==1 || !/^\d{10}$/.test(String(matches[0].id))) return unavailable('NHL game mapping unresolved');
    const resource=await readResource(`${BASE}/gamecenter/${matches[0].id}/play-by-play`,game.state==='live'?12000:55000);
    const pbp=resource.payload;
    if (String(pbp?.id)!==String(matches[0].id) || pbp.homeTeam?.abbrev!==abbrev(home.team?.abbreviation) ||
      pbp.awayTeam?.abbrev!==abbrev(away.team?.abbreviation)) return unavailable('NHL play-by-play identity mismatch');
    // Details use their summary clock and explicitly mark score disagreement.
    const timing=hockey.hockeyLiveTiming(game.sourceEvent,comp,summary);
    const stats=advanced.nhlAdvancedStats(pbp,{asOfElapsed:game.state==='live'?timing.elapsed:null});
    if (!stats.available) return stats;
    // Shootout deciding goals belong in the final scoreboard, not in attempts.
    const shootoutFinal=game.state==='completed' && pbp.periodDescriptor?.periodType==='SO';
    const scoreMatches=(shootoutFinal?pbp.homeTeam.score:stats.score[String(pbp.homeTeam.id)])===Number(home.score) &&
      (shootoutFinal?pbp.awayTeam.score:stats.score[String(pbp.awayTeam.id)])===Number(away.score);
    return {...stats,updatedAt:new Date(resource.updatedAt).toISOString(),stale:Boolean(resource.stale),scoreMatches,
      pressureEligible:stats.pressureEligible && scoreMatches && !resource.stale && (game.state!=='live' || timing.elapsed!==null),
      teamIdMap:{[String(home.team.id)]:String(pbp.homeTeam.id),[String(away.team.id)]:String(pbp.awayTeam.id)}};
  } catch { return unavailable('NHL play-by-play temporarily unavailable'); }
}

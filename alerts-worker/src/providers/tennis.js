// ESPN Tennis scoreboards contain tournaments, then groups, then matches.
// Normalize matches only; tournament state is never a match's live status.
import '../../../tennis-coverage.js';
export const {tournamentIdentity,mainDrawMatch,tournamentWindow,currentGameAllowed}=globalThis.SportsRadarTennisCoverage;
function setScore(competitor,status) {
  if(competitor.score!=null && typeof competitor.score!=='boolean' && String(competitor.score).trim()!=='' && Number.isFinite(Number(competitor.score)))return String(Number(competitor.score));
  const lines=competitor.linescores,period=Number(status?.period);
  if(!Array.isArray(lines) || !lines.length || status?.type?.state==='pre')return undefined;
  const completed=status?.type?.completed || status?.type?.state==='post';
  const prior=completed?lines:lines.slice(0,Math.max(0,period-1));
  if(!completed && (!Number.isInteger(period) || period<1 || lines.length<period))return undefined;
  if(prior.some(line=>typeof line.winner!=='boolean'))return undefined;
  // Completed-set winner flags are provider evidence. Do not reconstruct set
  // winners from game margins, infer missing sets, or call an active set won.
  return String(lines.filter(line=>line.winner===true).length);
}

function competitorForMatch(competitor,status) {
  const id=String(competitor.id || competitor.athlete?.id || competitor.team?.id || '');
  const name=competitor.athlete?.displayName || competitor.roster?.displayName || competitor.team?.displayName;
  if(!id || !name)return null;
  const shortName=competitor.athlete?.shortName || competitor.roster?.shortDisplayName || competitor.team?.shortDisplayName || name;
  const period=Number(status?.period),lines=competitor.linescores;
  const linescores=status?.type?.state==='in' && Number.isInteger(period) && period>0 && Array.isArray(lines)?lines.slice(0,period):lines;
  const score=setScore({...competitor,linescores},status);
  return {...competitor,linescores,score,...(lines?.length>linescores?.length?{futureSetRecordsExcluded:lines.length-linescores.length}:{}),team:{...competitor.team,id,displayName:name,shortDisplayName:shortName,
    abbreviation:competitor.abbreviation || shortName,logo:competitor.team?.logo || competitor.athlete?.flag?.href || ''}};
}

function matchEvent(tournament,raw,grouping) {
  if(!mainDrawMatch(tournament,raw,grouping))return null;
  if(!raw?.id || !raw.status?.type || !['pre','in','post'].includes(raw.status.type.state))return null;
  const competitors=(raw.competitors || []).map(c=>competitorForMatch(c,raw.status));
  if(competitors.length!==2 || competitors.some(c=>!c))return null;
  const competition={...raw,competitors};
  return {id:String(raw.id),date:raw.date || raw.startDate,name:tournament.name || competitors.map(c=>c.team.displayName).join(' vs '),
    season:tournament.season,league:tournament.league,competitions:[competition],
    tennisTournament:{id:String(tournament.id),name:tournament.name,shortName:tournament.shortName,major:tournament.major,
      season:tournament.season,date:tournament.date,endDate:tournament.endDate,grouping,
      group:grouping?.displayName || raw.type?.text || '',round:raw.round?.displayName || ''}};
}

export function tennisEvents(payload,now=null) {
  const events=[];
  for(const tournament of payload?.events || []){
    // Reject before normalizing competitors or invoking the scoring adapter.
    if(!tournamentIdentity(tournament) || (now!==null && !tournamentWindow(tournament,now)))continue;
    for(const group of tournament.groupings || [])for(const match of group.competitions || []){
      const event=matchEvent(tournament,match,group.grouping);if(event)events.push(event);
    }
    for(const match of tournament.competitions || []){
      const event=matchEvent(tournament,{...match,id:match.id || tournament.id},match.type);if(event)events.push(event);
    }
  }
  const unique=new Map();
  for(const event of events)if(!unique.has(event.id))unique.set(event.id,event);
  return [...unique.values()];
}

function compactCompetitor(c) {
  return {id:c.id,type:c.type,order:c.order,homeAway:c.homeAway,winner:c.winner,score:c.score,
    possession:c.possession,curatedRank:c.curatedRank,linescores:c.linescores,statistics:c.statistics,
    point:c.point,pointScore:c.pointScore,currentScore:c.currentScore,
    futureSetRecordsExcluded:c.futureSetRecordsExcluded,
    team:c.team,athlete:c.athlete?{displayName:c.athlete.displayName,shortName:c.athlete.shortName,flag:c.athlete.flag}:undefined,
    roster:c.roster?{displayName:c.roster.displayName,shortDisplayName:c.roster.shortDisplayName,
      athletes:c.roster.athletes?.map(a=>({id:a.id,displayName:a.displayName,shortName:a.shortName}))}:undefined};
}

export function attachTennisMatch(game) {
  const event=game.sourceEvent,competition=game.sourceCompetition;
  if(game.sport!=='Tennis' || !competition)return game;
  // Persist the actual scoreboard fields for detail rendering. The sourceEvent
  // property is non-enumerable and is intentionally absent from stored feeds.
  game.tennisMatch={id:String(competition.id),date:competition.date,status:competition.status,
    venue:competition.venue,format:competition.format,situation:competition.situation,
    competitors:competition.competitors.map(compactCompetitor),tournamentId:competition.tournamentId,
    type:competition.type,round:competition.round};
  game.tennisTournament=event.tennisTournament;
  return qualifyTennisCoverage(game);
}

export function qualifyTennisCoverage(game) {
  if(game.sport!=='Tennis')return game;
  const sets=Boolean(game.tennisMatch?.competitors?.every(c=>Array.isArray(c.linescores) && c.linescores.length));
  const available=sets?'set scores are available':game.state==='upcoming'?'match schedule and participants are available':'match status and participants are available; set scores are unavailable';
  game.tennisCoverage={source:'scoreboard',sets,pointByPoint:false,history:false,
    reason:`Scoreboard coverage: ${available}; point-by-point history and detailed point state are not verified.`};
  if(game.state!=='upcoming')game.scoringPartial=true;
  return game;
}

export function tennisDetailSummary(game) {
  if(!game.tennisMatch)return null;
  return {header:{id:game.id,competitions:[game.tennisMatch]},gameInfo:{venue:game.tennisMatch.venue},
    sportsRadarCoverage:game.tennisCoverage || {source:'scoreboard',pointByPoint:false,history:false},
    sportsRadarTournament:game.tennisTournament};
}

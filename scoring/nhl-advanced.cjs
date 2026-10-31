// Pure NHL public PBP reducer. Rebuild from each complete snapshot: corrections,
// removals and late arrivals must never be accumulated as additional attempts.
const ATTEMPTS = new Set(['goal','shot-on-goal','missed-shot','blocked-shot']);
const aliases={TB:'TBL',NJ:'NJD',SJ:'SJS',LA:'LAK',MON:'MTL',WAS:'WSH',UTAH:'UTA'};
const nhlAbbreviation=value=>aliases[value] || value;
const seconds = value => /^\d+:\d{2}$/.test(String(value || '')) && Number(value.split(':')[1]) < 60
  ? value.split(':').map(Number).reduce((m,s)=>m*60+s) : null;
function eventTime(play,gameType) {
  const {number:period,periodType:type}=play.periodDescriptor || {};
  if (type==='SO' || !(period>0)) return null;
  const length=period<=3 || Number(gameType)===3 ? 1200 : 300;
  const elapsed=seconds(play.timeInPeriod);
  return elapsed===null || elapsed>length ? null : (period<=3 ? (period-1)*1200 : 3600+(period-4)*length)+elapsed;
}
function manpower(code) {
  if (!/^[01][3-6][3-6][01]$/.test(String(code))) return null;
  const [awayGoalie,awaySkaters,homeSkaters,homeGoalie]=String(code).split('').map(Number);
  return {awayGoalie,awaySkaters,homeSkaters,homeGoalie,
    fiveOnFive:code==='1551',emptyNet:!awayGoalie || !homeGoalie,
    powerPlay:awaySkaters-(awayGoalie?0:1)!==homeSkaters-(homeGoalie?0:1)};
}
function canonicalPlays(plays) {
  const unique=new Map(); let duplicates=0,missingIds=0;
  for (const play of plays || []) {
    if (play?.eventId==null) {missingIds++;continue;}
    const key=String(play.eventId),previous=unique.get(key);
    if (previous) duplicates++;
    const revision=p=>Date.parse(p.updatedAt || p.modified || '') || 0;
    if (!previous || revision(play)>=revision(previous)) unique.set(key,play);
  }
  return {plays:[...unique.values()],duplicates,missingIds};
}
function scope(attempts,ids) {
  return Object.fromEntries(ids.map(id=>{
    const own=attempts.filter(a=>a.teamId===id),against=attempts.filter(a=>a.teamId!==id);
    const cf=own.length,ca=against.length,ff=own.filter(a=>a.type!=='blocked-shot').length,
      fa=against.filter(a=>a.type!=='blocked-shot').length;
    return [id,{cf,ca,ff,fa,cfPct:cf+ca?100*cf/(cf+ca):null,ffPct:ff+fa?100*ff/(ff+fa):null}];
  }));
}
function nhlAdvancedStats(pbp,{asOfElapsed=null}={}) {
  const ids=[String(pbp?.awayTeam?.id || ''),String(pbp?.homeTeam?.id || '')];
  if (!pbp || !Array.isArray(pbp.plays) || ids.some(id=>!id) || ids[0]===ids[1])
    return {available:false,reason:'NHL play-by-play unavailable'};
  const canonical=canonicalPlays(pbp.plays);
  const timed=canonical.plays.map(play=>({play,time:eventTime(play,pbp.gameType)}))
    .filter(p=>p.time!==null).sort((a,b)=>a.time-b.time || Number(a.play.sortOrder)-Number(b.play.sortOrder));
  const latest=timed.at(-1)?.time ?? 0;
  const now=Number.isFinite(asOfElapsed) ? Math.max(0,asOfElapsed) : latest;
  const scores=Object.fromEntries(ids.map(id=>[id,0]));
  const roster=new Map((pbp.rosterSpots || []).map(p=>[String(p.playerId),String(p.teamId)]));
  let unknownTeam=0,unknownStrength=0,lastGoalOrder=-1;
  const attempts=[];
  for (const {play,time} of timed) {
    if (time>now || !ATTEMPTS.has(play.typeDescKey)) continue;
    // NHL eventOwnerTeamId is the attempting side, including blocked attempts.
    // Prefer the actual shooter's roster team when supplied.
    const teamId=roster.get(String(play.details?.shootingPlayerId || play.details?.scoringPlayerId))
      || String(play.details?.eventOwnerTeamId || '');
    if (!ids.includes(teamId)) {unknownTeam++;continue;}
    const state=manpower(play.situationCode);
    if (!state) unknownStrength++;
    const opponent=ids.find(id=>id!==teamId);
    attempts.push({id:String(play.eventId),time,type:play.typeDescKey,teamId,state,order:attempts.length,
      trailingAtAttempt:scores[teamId]<scores[opponent]});
    if (play.typeDescKey==='goal') {scores[teamId]++;lastGoalOrder=attempts.length-1;}
  }
  const recent=attempts.filter(a=>a.time>now-300);
  const pressure=recent.filter(a=>a.time>now-120 && a.order>lastGoalOrder && a.type!=='goal');
  const trailingId=scores[ids[0]]===scores[ids[1]] ? null : ids[scores[ids[0]]<scores[ids[1]]?0:1];
  const trailing=trailingId ? pressure.filter(a=>a.teamId===trailingId && a.trailingAtAttempt) : [];
  const weighted=items=>items.reduce((sum,a)=>sum+(a.state?.emptyNet ? .5 : a.state?.powerPlay ? .65 : 1),0);
  const unknownTime=canonical.plays.filter(p=>ATTEMPTS.has(p.typeDescKey) && p.periodDescriptor?.periodType!=='SO' && eventTime(p,pbp.gameType)===null).length;
  return {available:true,source:'NHL public play-by-play',gameId:String(pbp.id),asOfElapsed:now,
    sourceElapsed:Math.min(now,latest),lagSeconds:Math.max(0,now-latest),
    teams:ids.map((id,i)=>({id,side:i?'home':'away',abbreviation:(i?pbp.homeTeam:pbp.awayTeam).abbrev})),
    score:scores,gap:Math.abs(scores[ids[0]]-scores[ids[1]]),trailingTeamId:trailingId,
    fullGame:scope(attempts,ids),fiveOnFive:scope(attempts.filter(a=>a.state?.fiveOnFive),ids),
    rollingFiveMinutes:{seconds:Math.min(300,now),teams:scope(recent,ids),
      fiveOnFive:scope(recent.filter(a=>a.state?.fiveOnFive),ids),
      powerPlayAttempts:recent.filter(a=>a.state?.powerPlay).length,
      emptyNetAttempts:recent.filter(a=>a.state?.emptyNet).length},
    recentPressure:{seconds:Math.min(120,now),teams:scope(pressure,ids),
      weightedAttempts:weighted(pressure),
      trailingAttempts:trailing.length,trailingUnblocked:trailing.filter(a=>a.type!=='blocked-shot').length,
      weightedTrailingAttempts:weighted(trailing),
      latestTrailingAttempt:trailing.at(-1)?.time ?? null},
    quality:{duplicates:canonical.duplicates,missingIds:canonical.missingIds,unknownTeam,unknownStrength,unknownTime},
    // Null strength never becomes inferred 5-on-5; this also gates the experiment.
    pressureEligible:unknownTeam===0 && unknownStrength===0 && unknownTime===0 && canonical.missingIds===0 && now-latest<=30};
}
module.exports={nhlAdvancedStats,eventTime,canonicalPlays,manpower,nhlAbbreviation};

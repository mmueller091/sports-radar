/* Deterministic NFL pregame evidence. No requests or team-specific weights. */
(function(root) {
  const unit=x=>Math.max(0,Math.min(1,x));
  const round=x=>Number(x.toFixed(2));
  const stat=(row,name)=>row?.stats?.find(s=>s.name===name)?.value;
  function standing(row) {
    const wins=stat(row,'wins'),losses=stat(row,'losses'),ties=stat(row,'ties') ?? 0;
    if (![wins,losses,ties].every(x=>typeof x==='number' && Number.isFinite(x) && x>=0)) return null;
    const games=wins+losses+ties;
    return {id:String(row.id || row.team?.id || ''),wins,losses,ties,games,pct:games?(wins+ties/2)/games:0,
      differential:Number.isFinite(stat(row,'pointsFor')) && Number.isFinite(stat(row,'pointsAgainst')) ? stat(row,'pointsFor')-stat(row,'pointsAgainst') : null};
  }
  function evidenceFromSummary(event,summary,opposition=[]) {
    const competition=event?.competitions?.[0],start=Date.parse(event?.date);
    const ids=(competition?.competitors || []).map(t=>String(t.team?.id || ''));
    const header=summary?.header;
    if (ids.length!==2 || !ids[0] || !ids[1] || String(header?.id)!==String(event.id) || !Number.isFinite(start) ||
        Number(header?.season?.year)!==Number(event.season?.year)) return null;
    const groups=(summary.standings?.groups || []).map(group=>({name:group.divisionHeader,
      sourceUrl:group.href,entries:(group.standings?.entries || []).map(standing).filter(Boolean)}));
    const teams=ids.map(id=>groups.flatMap(g=>g.entries).find(r=>r.id===id));
    // Stale standings cannot be silently mixed with a newer scoreboard record.
    if (teams.some((row,i)=>!row || !(competition.competitors[i].records || []).some(r=>
      (r.type==='total' || r.name==='overall' || !r.type) && r.summary===`${row.wins}-${row.losses}${row.ties?'-'+row.ties:''}`))) return null;
    const recent=ids.map(id=>({id,events:[...new Map(((summary.lastFiveGames || []).find(t=>String(t.team?.id)===id)?.events || [])
      .filter(e=>e.id && Date.parse(e.gameDate)<start && Date.parse(e.gameDate)>=Date.parse(`${event.season.year}-08-01`) &&
        ['W','L','T'].includes(e.gameResult) && [e.homeTeamScore,e.awayTeamScore].every(x=>x!=null && x!=='' && typeof x!=='boolean' && Number.isFinite(Number(x))))
      .map(e=>[String(e.id),e])).values()]
      .sort((a,b)=>Date.parse(b.gameDate)-Date.parse(a.gameDate)).slice(0,5).map(e=>({id:String(e.id),date:e.gameDate,
        opponentId:String(e.opponent?.id || ''),opponent:opposition.map(standing).find(t=>t?.id===String(e.opponent?.id)),result:e.gameResult,
        margin:(Number(e.homeTeamScore)-Number(e.awayTeamScore))*(String(e.homeTeamId)===id?1:-1),
        sourceUrl:e.links?.[0]?.href}))}));
    return {season:Number(event.season.year),eventId:String(event.id),start:event.date,teams,recent,
      division:groups.find(g=>ids.every(id=>g.entries.some(r=>r.id===id))) || null,
      sourceUrl:`https://www.espn.com/nfl/preview?gameId=${event.id}`};
  }
  function nflEvidenceFactors(competition,records,division) {
    const e=competition?.sportsRadarNflPregame;
    if (!e || records.length!==2 || !records.every(Boolean) || e.teams?.length!==2 ||
        e.teams.some((row,i)=>String(row.id)!==String(competition.competitors[i]?.team?.id) ||
          row.wins!==records[i].wins || row.losses!==records[i].losses || row.games!==records[i].games) ||
        Number(competition.season?.year)!==e.season) return [];
    const factors=[],maturity=unit((Math.min(...records.map(r=>r.games))-2)/4);
    const add=(label,points,detail,sourceUrl=e.sourceUrl)=>{points=round(points);if(points)factors.push({label,points,detail,sourceUrl});};
    const group=e.division;
    if (division && group?.name===division && group.entries.length===4 && maturity) {
      const leader=group.entries.reduce((a,b)=>a.pct>b.pct?a:b);
      const behind=row=>((leader.wins-row.wins)+(row.losses-leader.losses))/2;
      const bothNear=e.teams.every(row=>behind(row)<=1);
      const canLead=e.teams.map((row,i)=>{
        const pct=(row.wins+1+row.ties/2)/(row.games+1);
        return group.entries.every(other=>other.id===row.id ||
          pct >= (other.id===e.teams[1-i].id ? (other.wins+other.ties/2)/(other.games+1) : other.pct));
      });
      const stakes=bothNear ? (canLead.every(Boolean)?7:5) :
        e.teams.every(row=>row.pct>=.5 && behind(row)<=2)?2:0;
      add(canLead.every(Boolean)&&bothNear?'Division lead at stake':'Division race positioning',stakes*maturity,
        canLead.every(Boolean)&&bothNear?`Either winner can take at least a share of the ${division} lead`:
          `Both teams are within ${bothNear?'one':'two'} games of the ${division} lead`,group.sourceUrl);
      const meeting=e.recent.flatMap(t=>t.events).find(g=>e.teams.some(t=>t.id===g.opponentId));
      if (meeting && stakes) add('Season-series tiebreaker',Math.min(1,8-stakes)*maturity,
        'A verified earlier meeting makes the division season series relevant',meeting.sourceUrl);
    }
    if (records.every(r=>r.pct<.5) && e.teams.every(t=>Number.isFinite(t.differential))) {
      // Restore part of the blunt losing-record deduction when actual play is stronger.
      const recovery=e.teams.reduce((sum,t)=>sum+2*unit((t.differential/t.games+3)/6),0);
      add('Performance beyond losing records',recovery*maturity,
        e.teams.map((t,i)=>`${competition.competitors[i].team.abbreviation}: ${t.differential>0?'+':''}${t.differential} point differential`).join('; '));
    } else if (e.teams.every(t=>Number.isFinite(t.differential))) {
      const strength=e.teams.reduce((sum,t)=>sum+t.differential/t.games,0)/2;
      add('Season point differential',Math.max(-2,Math.min(2,strength/4))*maturity,
        'Season scoring margins provide a small quality adjustment');
    }
    const form=e.recent.map(t=>t.events.slice(0,3));
    if (form.every(g=>g.length===3)) {
      const average=form.flat().reduce((sum,g)=>sum+Math.max(-21,Math.min(21,g.margin)),0)/6;
      add('Recent performance',Math.max(-1,Math.min(2,average/6))*maturity,'Scoring margins over each team’s last three games; individual margins capped at 21');
    }
    const strongWins=e.recent.map(t=>t.events[0]).filter(g=>g?.result==='W' && g.opponent?.games>=4 && g.opponent.pct>=.6);
    if(strongWins.length) add('Recent win over winning opposition',strongWins.length*.75*maturity,
      'Latest result includes a win over an opponent currently winning at least 60% of its games',strongWins[0].sourceUrl);
    const streak=e.recent.reduce((sum,t)=>{
      const first=t.events[0]?.result;
      let length=0;for(const g of t.events){if(g.result!==first)break;length++;}
      return sum+(length>=3 && first!=='T' ? (first==='W'?1:-1)*Math.min(1,(length-2)*.25):0);
    },0);
    add('Sustained recent form',streak*maturity,'Verified consecutive wins or losses, limited to the available five-game history');
    return factors;
  }
  const api={evidenceFromSummary,nflEvidenceFactors};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else (root.SportsRadarScoring ||= {}).shared_nfl_pregame=api;
})(globalThis);

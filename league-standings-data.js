/* Read-only league views over the same ESPN identities used by team pages.
 * No scoring, preference storage, ingestion, or polling lives here. */
(function(root) {
  'use strict';
  const paths = {NFL:'football/nfl',MLB:'baseball/mlb',NHL:'hockey/nhl',CFB:'football/college-football',NBA:'basketball/nba',NCAAB:'basketball/mens-college-basketball'};
  const college = sport => sport === 'CFB' || sport === 'NCAAB';
  const site = path => `https://site.api.espn.com/apis/site/v2/sports/${path}`;
  const key = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g,'');
  function stat(entry,...names) {
    // Split-record stats repeat names such as "wins"; never overwrite overall
    // values with home/away/ranked-opponent splits.
    const wanted = names.map(key);
    const found = (entry?.stats || []).find(s => !String(s.type || '').includes('_') &&
      [s.type,s.name].some(name => wanted.includes(key(name))));
    return found?.displayValue ?? found?.summary ?? found?.value ?? '';
  }
  function teamIdentity(team) {
    return {id:String(team?.id || ''),name:team?.displayName ||
      [team?.location,team?.name].filter(Boolean).join(' ') || team?.nickname || team?.abbreviation || 'Team',
      abbreviation:team?.abbreviation || '',logo:team?.logo ||
        team?.logos?.find(l => l.rel?.includes('default'))?.href || team?.logos?.[0]?.href || ''};
  }
  function standingsRow(entry,sport) {
    const seed=Number(stat(entry,'playoffSeed'));
    let record = stat(entry,'overall','total');
    if (!record) {
      const parts = [stat(entry,'wins'),stat(entry,'losses')];
      if (sport === 'NHL') parts.push(stat(entry,'otLosses','overtimeLosses'));
      else if (Number(stat(entry,'ties')) > 0) parts.push(stat(entry,'ties'));
      if (parts.every(p => p !== '')) record = parts.join('-');
    }
    return {...teamIdentity(entry.team),record:String(record).split(',')[0],
      playoffSeed:Number.isInteger(seed) && seed>0 ? seed : null,
      conferenceRecord:String(stat(entry,'conferenceRecord','vsconf')),
      winPercent:String(stat(entry,'winPercent')),gamesBehind:String(stat(entry,'gamesBehind')),
      points:String(stat(entry,'points')),gamesPlayed:String(stat(entry,'gamesPlayed')),
      regulationWins:String(stat(entry,'regWins')),streak:String(stat(entry,'streak'))};
  }
  function normalizeStandings(payload,sport,division='') {
    const sections=[];
    function visit(node,parents=[],conference=null) {
      const name=node.name || node.displayName || 'Standings';
      const currentConference=college(sport) && !conference ? {id:String(node.id),name} : conference;
      const entries=node.standings?.entries;
      if (Array.isArray(entries) && entries.length) sections.push({
        id:[division,...parents.map(p=>p.id),node.id || name].join('/'),name,
        parent:parents.map(p=>p.name).join(' · '),division,
        conferenceId:currentConference?.id || '',conference:currentConference?.name || '',
        // The endpoint is explicitly ordered; retain provider tiebreak order.
        entries:entries.map(e=>standingsRow(e,sport)).filter(e=>e.id)
      });
      for (const child of node.children || []) visit(child,[...parents,{id:node.id || name,name}],currentConference);
    }
    for (const node of payload.children || []) visit(node);
    if (!payload.children?.length && payload.standings) visit(payload);
    return {sport,season:payload.season,sections};
  }
  function normalizePoll(payload,sport,standings) {
    const poll=payload.rankings?.find(p=>p.type === 'ap');
    if (!poll?.ranks?.length) return null;
    const season=poll.season?.year || payload.requestedSeason?.year || payload.latestSeason?.year;
    if (standings?.season?.year && Number(season) !== Number(standings.season.year)) return null;
    const teams=new Map((standings?.sections || []).flatMap(s=>s.entries.map(t=>[t.id,{...t,conference:s.conference}])));
    const entries=poll.ranks.filter(r=>Number.isInteger(r.current) && r.current>=1 && r.current<=25 && r.team?.id)
      .sort((a,b)=>a.current-b.current).map(r=>{
        const team=teams.get(String(r.team.id));
        return {...teamIdentity(r.team),rank:r.current,
          record:team?.record || r.recordSummary || r.record?.summary || '',
          conference:team?.conference || (r.team.groups?.isConference ? r.team.groups.shortName : '') || ''};
      });
    return entries.length ? {name:poll.name || 'AP Top 25',date:poll.date,week:poll.occurrence?.displayValue ||
      payload.requestedSeason?.week?.displayValue || '',season,entries} : null;
  }
  function playoffSections(standings,sport) {
    if (!['NFL','NBA','MLB','NHL'].includes(sport)) return [];
    const conferences=new Map(),result=[];
    for (const section of standings?.sections || []) {
      if (!section.parent) return [];
      if (!conferences.has(section.parent)) conferences.set(section.parent,[]);
      conferences.get(section.parent).push(section);
    }
    for (const [conference,divisions] of conferences) {
      // Use the source's tiebreak order, never recompute seeds from records.
      // Missing or duplicate seeds cannot support a reliable playoff picture.
      const rows=divisions.flatMap(s=>s.entries).slice().sort((a,b)=>a.playoffSeed-b.playoffSeed);
      if (!rows.length || new Set(rows.map(r=>r.id)).size!==rows.length ||
          rows.some((row,index)=>row.playoffSeed!==index+1)) return [];
      function group(name,entries,detail) {
        if (entries.length) result.push({name,parent:`${conference} · ${detail}`,playoff:true,entries});
      }
      if (sport==='NHL') {
        if (divisions.length!==2 || divisions.some(d=>d.entries.length<3)) return [];
        const qualified=new Set();
        for (const division of divisions) {
          const entries=division.entries.slice().sort((a,b)=>a.playoffSeed-b.playoffSeed).slice(0,3)
            .map((row,index)=>{qualified.add(row.id);return {...row,position:index+1};});
          group(division.name,entries,'Division positions 1–3');
        }
        const race=rows.filter(row=>!qualified.has(row.id)).map((row,index)=>({...row,position:index+1}));
        group('Wild cards',race.slice(0,2),'Wild-card positions 1–2');
        group('Outside the field',race.slice(2),'Wild-card race');
      } else {
        const first=sport==='NFL'?4:sport==='MLB'?3:6;
        const cutoff=sport==='NFL'?7:sport==='MLB'?6:10;
        const seeded=rows.map(row=>({...row,position:row.playoffSeed}));
        group(sport==='NBA'?'Playoff positions':'Division leaders',seeded.slice(0,first),`Seeds 1–${first}`);
        group(sport==='NBA'?'Play-in positions':'Wild cards',seeded.slice(first,cutoff),`Seeds ${first+1}–${cutoff}`);
        group('Outside the field',seeded.slice(cutoff),`Seeds ${cutoff+1}–${rows.length}`);
      }
    }
    return result;
  }
  async function readJson(url,signal=AbortSignal.timeout(15000)) {
    const target=root.SLATEMETER_STANDINGS_PROXY
      ? `${root.SLATEMETER_STANDINGS_PROXY}?url=${encodeURIComponent(url)}` : url;
    const response=await fetch(target,{signal});
    if (!response.ok) throw new Error(`Data source HTTP ${response.status}`);
    return response.json();
  }
  async function loadStandings(sport) {
    const path=paths[sport];
    if (!path) throw new Error('Standings are not available for this sport.');
    // Use the same current-season metadata as the source's scoreboard. Do not
    // derive college membership from the bundled (older) team directory.
    const metadata=await readJson(`${site(path)}/scoreboard?limit=1`);
    const season=metadata.leagues?.[0]?.season?.year || metadata.season?.year;
    if (!Number.isInteger(season)) throw new Error('Current season unavailable');
    const sort=college(sport) || sport==='NFL' ? 'playoffseed:asc' : sport==='NHL' ? 'points:desc,playoffseed:asc' : 'winpercent:desc,playoffseed:asc';
    const url=`https://site.api.espn.com/apis/v2/sports/${path}/standings?season=${season}&seasontype=2&type=0&level=3&sort=${encodeURIComponent(sort)}`;
    const parts=await Promise.all((sport==='CFB' ? [['80','FBS'],['81','FCS']] : [['','']]).map(async([group,label])=>{
      const payload=await readJson(url+(group?`&group=${group}`:''));
      if (Number(payload.season?.year)!==season) throw new Error('Standings season mismatch');
      return normalizeStandings(payload,sport,label);
    }));
    return {...parts[0],sections:parts.flatMap(p=>p.sections),sourceUrl:url,loadedAt:Date.now()};
  }
  async function loadPoll(sport,standings) {
    const base=`${site(paths[sport])}/rankings`;
    let payload=await readJson(base),sourceUrl=base;
    // Polls are released at different times. The default response can be a
    // newer Coaches week while the current AP poll remains on the previous one.
    const available=payload.availableRankings?.find(p=>String(p.id)==='1');
    if (available && !payload.rankings?.some(p=>p.type==='ap' && p.ranks?.length)) {
      const params=new URLSearchParams({seasons:String(standings.season.year),
        seasontypes:String(available.seasonType),weeks:String(available.week)});
      sourceUrl=`${base}?${params}`;
      payload=await readJson(sourceUrl);
    }
    const poll=normalizePoll(payload,sport,standings);
    return poll ? {...poll,sourceUrl,loadedAt:Date.now()} : null;
  }
  async function loadScheduledSummary(row,team,signal) {
    // The existing /game endpoint deliberately accepts only feed/archive IDs.
    // A real, full-schedule fixture may precede either. Read its source summary
    // for the same Game Center, with no calculated or placeholder rating.
    if (!row?.id || !paths[team?.sport] || !team?.id || !row.opponent?.id) return null;
    const payload=await readJson(`${site(paths[team.sport])}/summary?event=${encodeURIComponent(row.id)}`,signal);
    const competition=payload.header?.competitions?.[0];
    const competitors=competition?.competitors;
    if (String(payload.header?.id || competition?.id)!==String(row.id) || competitors?.length!==2 ||
        ![String(team.id),String(row.opponent.id)].every(id=>competitors.some(c=>String(c.team?.id)===id))) return null;
    const ordered=['away','home'].map(side=>competitors.find(c=>c.homeAway===side));
    if (ordered.some(c=>!c)) return null;
    const status=competition.status || {},type=status.type;
    // Same completed-first ESPN lifecycle used by the canonical event adapter.
    const state=type?.completed || type?.state==='post' ? 'completed' : type?.state==='in' ? 'live' : 'upcoming';
    const game={id:String(row.id),sport:team.sport,state,startTime:competition.date || row.startTime,
      status:type?.shortDetail || type?.detail || row.status,liveRawStatus:status,
      teams:ordered.map(c=>{const identity=teamIdentity(c.team);return [identity.name,identity.abbreviation,
        c.score?.displayValue ?? c.score ?? '', 'white',identity.logo,c.record?.[0]?.summary || '',null,c.team.shortDisplayName || '',identity.id];}),
      sub:competition.venue?.fullName || payload.gameInfo?.venue?.fullName || '',
      channel:(competition.broadcasts || []).map(b=>b.media?.shortName || b.media?.name).filter(Boolean).join(' · '),
      standingsUnrated:true,score:null,baseScore:null,openingScore:null,factors:[],line:null};
    return {...payload,sportsRadarGame:game,sportsRadarFreshness:{updatedAt:new Date().toISOString(),stale:false}};
  }
  function matchesTeam(game,team) {
    return game?.sport===team.sport && game.teams?.some(t=>String(t[8] || '')===String(team.id));
  }
  function eligible(row,now) {
    if (!row || row.state==='completed' || row.liveRawStatus?.type?.completed ||
        row.liveRawStatus?.type?.state==='post' || /cancel|postpon|suspend|abandon/i.test(row.status || '')) return false;
    return row.state==='live' || row.state==='upcoming' && Date.parse(row.startTime)>now;
  }
  function nextGame(team,schedule,canonicalGames,now=Date.now()) {
    const byId=new Map((schedule || []).map(row=>[String(row.id),{...row,sport:team.sport}]));
    for (const game of canonicalGames || []) {
      if (!matchesTeam(game,team)) continue;
      const own=game.teams.findIndex(t=>String(t[8] || '')===String(team.id));
      const opponent=game.teams[own===0?1:0];
      const previous=byId.get(String(game.id));
      byId.set(String(game.id),{...previous,id:String(game.id),sport:game.sport,state:game.state,
        startTime:game.startTime,status:game.status,liveRawStatus:game.liveRawStatus,
        homeAway:previous?.homeAway || (own===0?'away':'home'),
        opponent:{id:String(opponent[8]),name:opponent[0],abbreviation:opponent[1],logo:opponent[4]},game});
    }
    return [...byId.values()].filter(row=>eligible(row,now)).sort((a,b)=>
      Number(b.state==='live')-Number(a.state==='live') || Date.parse(a.startTime)-Date.parse(b.startTime))[0] || null;
  }
  const api={college,stat,normalizeStandings,normalizePoll,playoffSections,loadStandings,loadPoll,loadScheduledSummary,matchesTeam,nextGame,eligible};
  root.SlateMeterStandingsData=api;
  if (typeof module!=='undefined' && module.exports) module.exports=api;
})(globalThis);

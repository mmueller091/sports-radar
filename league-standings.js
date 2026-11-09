/* Feature UI. Uses app.js's selection, team cache, shared refresh, logos,
 * rating presentation and Game Center. It never adds games to the home slate. */
const leagueStandings = {
  sport:'',view:'conference',proView:'standings',conference:new Map(),data:new Map(),polls:new Map(),
  requests:new Map(),errors:new Map(),details:new Map(),detailRequests:new Map(),
  scheduleRequests:new Map(),scheduleChecked:new Map(),knownGames:new Map(),queue:[],running:0,paintPending:false
};
const leagueData = globalThis.SlateMeterStandingsData;
const leagueStandingsMarkup = new WeakMap();

function standingsSelectedSports() {
  return HOME_SPORTS.filter(sport=>publicSport(sport) && state.visibleSports.has(sport));
}
function standingsTask(task) {
  return new Promise((resolve,reject)=>{
    leagueStandings.queue.push({task,resolve,reject});
    function drain() {
      while (leagueStandings.running<4 && leagueStandings.queue.length) {
        const next=leagueStandings.queue.shift();leagueStandings.running++;
        Promise.resolve().then(next.task).then(next.resolve,next.reject).finally(()=>{
          leagueStandings.running--;drain();
        });
      }
    }
    drain();
  });
}
function standingsPaint() {
  if (leagueStandings.paintPending || state.page!=='standings') return;
  leagueStandings.paintPending=true;
  queueMicrotask(()=>{leagueStandings.paintPending=false;renderLeagueStandings();});
}
function standingsLoad(sport,kind,force=false) {
  const cache=kind==='poll'?leagueStandings.polls:leagueStandings.data;
  const key=`${kind}:${sport}`;
  if (leagueStandings.requests.has(key) || (!force && (cache.has(sport) || leagueStandings.errors.has(key)))) return;
  leagueStandings.errors.delete(key);
  const request=(kind==='poll' ? leagueData.loadPoll(sport,leagueStandings.data.get(sport)) : leagueData.loadStandings(sport))
    .then(data=>cache.set(sport,data))
    .catch(()=>leagueStandings.errors.set(key,'The data source could not be reached. Try again.'))
    .finally(()=>{leagueStandings.requests.delete(key);standingsPaint();});
  leagueStandings.requests.set(key,request);
}
function standingsSchedule(team,force=false) {
  const key=teamDataKey(team);
  if (leagueStandings.scheduleRequests.has(key) || (!force && (teamPageData.has(key) || teamPageErrors.has(key)))) return;
  const request=standingsTask(()=>loadTeamPageData(team,{force}))
    .finally(()=>{leagueStandings.scheduleRequests.delete(key);leagueStandings.scheduleChecked.set(key,Date.now());standingsPaint();});
  leagueStandings.scheduleRequests.set(key,request);
}
function standingsCanonicalGames() {
  const current=new Map([...leagueStandings.details].map(([key,item])=>[key,item.game]).filter(([,game])=>game));
  if (typeof activeDetailGame!=='undefined' && activeDetailGame) current.set(watchKey(activeDetailGame),activeDetailGame);
  // /feed always wins for the same snapshot, just as it does in Game Center.
  games.forEach(game=>current.set(watchKey(game),game));
  return [...current.values()];
}
function standingsResolveGame(row) {
  const key=`${row.sport}:${row.id}`;
  if (games.some(g=>watchKey(g)===key) || leagueStandings.detailRequests.has(key)) return;
  // The open Game Center already owns its detail refresh. Reuse its snapshot.
  if (typeof activeDetailGame!=='undefined' && activeDetailGame && watchKey(activeDetailGame)===key) return;
  const cached=leagueStandings.details.get(key);
  const epoch=state.updatedAt || '';
  if (cached && (cached.epoch===epoch || (row.state!=='live' && Date.now()-cached.at<900000))) return;
  const request=standingsTask(async()=>{
    try {
      const payload=await fetchGameSummary(row);
      const game=payload?.sportsRadarGame;
      if (!game || watchKey(game)!==key || (!game.standingsUnrated && game.modelVersion!==globalThis.SportsRadarScore.MODEL_VERSION) ||
          !Array.isArray(game.teams) || game.teams.length!==2) throw new Error('Game unavailable');
      const previous=leagueStandings.details.get(key);
      const timestamp=Date.parse(payload.sportsRadarFreshness?.updatedAt || '');
      if (Number.isFinite(previous?.timestamp) && (!Number.isFinite(timestamp) || timestamp<previous.timestamp)) throw new Error('Older snapshot');
      leagueStandings.details.set(key,{game,epoch,at:Date.now(),timestamp,
        stale:payload.sportsRadarFreshness?.stale===true});
    } catch {
      leagueStandings.details.set(key,{...cached,epoch,at:Date.now(),stale:true});
    }
  }).finally(()=>{leagueStandings.detailRequests.delete(key);standingsPaint();});
  leagueStandings.detailRequests.set(key,request);
}
function standingsScheduleSummary(game,signal) {
  const known=leagueStandings.knownGames.get(watchKey(game));
  return known ? leagueData.loadScheduledSummary(known.row,known.team,signal) : Promise.resolve(null);
}
function standingsGameMarkup(team) {
  const key=teamDataKey(team),payload=teamPageData.get(key);
  const schedule=payload?.team?.id===String(team.id) ? payload.schedule || [] : [];
  standingsSchedule(team);
  const canonical=standingsCanonicalGames();
  const row=leagueData.nextGame(team,schedule,canonical);
  // A cached schedule must not strand a row on a finished or past-start game.
  // Revalidate on the existing feed cycle, without another timer/poller.
  const checked=leagueStandings.scheduleChecked.get(key) || 0;
  if (payload && Date.now()-checked>60000 && schedule.some(s=>s.state!=='completed' && Date.parse(s.startTime)<=Date.now() &&
      !games.some(g=>String(g.id)===String(s.id) && g.sport===team.sport))) standingsSchedule(team,true);
  if (!row) {
    const pending=leagueStandings.scheduleRequests.has(key);
    return `<span class="ls-game-empty">${pending?'Loading schedule…':teamPageErrors.has(key)?'Schedule unavailable':!payload?'Schedule unavailable':'No scheduled next game'}</span>`;
  }
  leagueStandings.knownGames.set(`${team.sport}:${row.id}`,{row,team});
  standingsResolveGame(row);
  const game=row.game,detail=leagueStandings.details.get(`${team.sport}:${row.id}`);
  const fromFeed=games.some(g=>g===game);
  const score=game?.score;
  const rated=typeof score==='number' && Number.isFinite(score);
  const stale=fromFeed ? state.feedStale || (state.updatedAt && Date.now()-Date.parse(state.updatedAt)>120000) : detail?.stale;
  const status=[stale?'Last available data':'',game?.timingUncertain?'Clock updating':game?.scoringPartial?'Provisional rating':''].filter(Boolean).join(' · ');
  return `<button type="button" class="ls-game" data-ls-game="${safeText(row.id)}" data-ls-sport="${safeText(team.sport)}" aria-label="Open Game Center: ${safeText(team.name)} ${row.homeAway==='away'?'at':'versus'} ${safeText(row.opponent?.name || 'opponent')}">
    <span class="ls-matchup"><strong><small class="ls-game-kind">${row.state==='live'?'Live game':'Next game'} · </small>${row.homeAway==='away'?'@':'vs'} ${safeText(row.opponent?.name || 'Opponent unavailable')}</strong>
    <span>${row.state==='live'?'<span class="status-live">LIVE</span> ':''}${safeText(teamGameTimeLabel(row))}</span>
    ${row.state==='live'?`<small>${safeText(row.status)}</small>`:''}${status?`<small>${safeText(status)}</small>`:''}</span>
    ${rated?teamSignalMarkup(score,row.state==='live'?'Live rating':'Pregame rating'):'<span class="ls-unrated">Not yet rated</span>'}</button>`;
}
function standingsColumns(sport,poll=false,playoff=false) {
  if (poll) return [['record','Overall'],['conference','Conference']];
  if (leagueData.college(sport)) return [['conferenceRecord','Conf W–L'],['record','Overall W–L']];
  if (sport==='NHL') return [['gamesPlayed','GP'],['record','W–L–OTL'],['points','PTS'],['regulationWins','RW']];
  return [['record',sport==='NFL'?'W–L–T':'W–L'],['winPercent','PCT'],
    ...(['MLB','NBA'].includes(sport)?[['gamesBehind',playoff?'Div GB':'GB']]:[]),['streak','Streak']];
}
function standingsTable(section,sport,poll=false) {
  const columns=standingsColumns(sport,poll,section.playoff);
  return `<section class="ls-group"><header><h2>${safeText(section.name)}</h2>${section.parent?`<p>${safeText(section.parent)}</p>`:''}</header>
    <div class="ls-table${poll?' ls-ranking-table':''}" role="table" aria-label="${safeText(section.name)}" style="--ls-stats:${columns.length}">
    <div class="ls-head" role="row"><span role="columnheader">${poll?'Rank':'#'}</span><span role="columnheader">Team</span>${columns.map(([,label])=>`<span role="columnheader">${safeText(label)}</span>`).join('')}<span role="columnheader">Live / next game · Excitement</span></div>
    ${section.entries.map((row,index)=>`<div class="ls-row" role="row"><div class="ls-summary" role="presentation"><span class="ls-rank" role="cell">${poll?row.rank:section.playoff?row.position:index+1}</span>
      <span class="ls-team-cell" role="cell"><a class="ls-team" href="${safeText(teamHash({sport,id:row.id}))}" data-ls-team="${safeText(row.id)}" data-ls-sport="${safeText(sport)}"><span class="ls-logo team-logo-shell">${teamLogoWithFallback(row.logo,row.abbreviation,'team-logo')}</span><strong>${safeText(row.name)}</strong></a></span>
      <span class="ls-stats" role="presentation">${columns.map(([key,label])=>`<span class="ls-stat${key==='conference'?' ls-stat-text':''}" role="cell"><small>${safeText(label)}</small><b>${safeText(row[key] || '—')}</b></span>`).join('')}</span></div>
      <span class="ls-game-cell" role="cell">${standingsGameMarkup({...row,sport})}</span></div>`).join('')}</div></section>`;
}
function standingsReplace(element,markup) {
  if (leagueStandingsMarkup.get(element)===markup) return;
  const active=document.activeElement;
  const focusKey=element.contains(active) ? active.id || active.dataset.lsGame || active.dataset.lsTeam : '';
  element.innerHTML=markup;
  leagueStandingsMarkup.set(element,markup);
  if (focusKey) [...element.querySelectorAll('button,a,select')].find(e=>(e.id || e.dataset.lsGame || e.dataset.lsTeam)===focusKey)?.focus({preventScroll:true});
}
function renderLeagueStandings() {
  const root=$('#league-standings-page');
  if (!root || state.page!=='standings') return;
  const sports=standingsSelectedSports();
  if (!sports.includes(leagueStandings.sport)) leagueStandings.sport=sports[0] || '';
  const sport=leagueStandings.sport,college=leagueData.college(sport);
  const controls=$('#ls-controls'),content=$('#ls-content');
  if (!sport) {
    standingsReplace(controls,'');
    standingsReplace(content,'<div class="ls-state"><h2>No sports selected</h2><p>Select sports in Preferences to see their standings.</p></div>');
    $('#ls-freshness').textContent='';return;
  }
  standingsLoad(sport,'standings');
  const data=leagueStandings.data.get(sport);
  const conferences=[...new Map((data?.sections || []).map(s=>[s.conferenceId,{id:s.conferenceId,name:s.conference,division:s.division}])).values()];
  if (!conferences.some(c=>c.id===leagueStandings.conference.get(sport))) leagueStandings.conference.set(sport,conferences[0]?.id || '');
  const poll=college && leagueStandings.view==='rankings';
  const pro=['NFL','NBA','MLB','NHL'].includes(sport);
  const playoff=pro && leagueStandings.proView==='playoffs';
  if (poll && data) standingsLoad(sport,'poll');
  standingsReplace(controls,`<label>League<select id="ls-league">${sports.map(s=>`<option value="${s}"${s===sport?' selected':''}>${safeText(labelForSport(s))}</option>`).join('')}</select></label>
    ${college?`<div class="ls-views" role="group" aria-label="College view"><button type="button" class="team-tab ${!poll?'active':''}" data-ls-view="conference" aria-pressed="${!poll}">Conference Standings</button><button type="button" class="team-tab ${poll?'active':''}" data-ls-view="rankings" aria-pressed="${poll}">National Rankings</button></div>`:''}
    ${pro?`<div class="ls-views" role="group" aria-label="${safeText(sport)} view"><button id="ls-view-standings" type="button" class="team-tab ${!playoff?'active':''}" data-ls-view="standings" aria-pressed="${!playoff}">Standings</button><button id="ls-view-playoffs" type="button" class="team-tab ${playoff?'active':''}" data-ls-view="playoffs" aria-pressed="${playoff}">Playoff Picture</button></div>`:''}
    ${college && !poll && conferences.length?`<label>Conference<select id="ls-conference">${conferences.map(c=>`<option value="${safeText(c.id)}"${c.id===leagueStandings.conference.get(sport)?' selected':''}>${safeText(c.name)}${c.division?` (${c.division})`:''}</option>`).join('')}</select></label>`:''}`);
  const error=leagueStandings.errors.get(`${poll?'poll':'standings'}:${sport}`) || (!data && leagueStandings.errors.get(`standings:${sport}`));
  let markup='';
  if (error) markup=`<div class="ls-state" role="status"><h2>${poll?'National rankings':'Standings'} unavailable</h2><p>${safeText(error)}</p><button type="button" class="outline-button" data-ls-retry>Try again</button></div>`;
  else if (!data || (poll && !leagueStandings.polls.has(sport))) markup=`<div class="ls-state" role="status">Loading ${poll?'AP Top 25':'standings'}…</div>`;
  else if (poll) {
    const ranking=leagueStandings.polls.get(sport);
    markup=ranking ? `<p class="ls-source">${safeText(ranking.name)} · ${safeText(ranking.week || '')}${ranking.date?` · Released ${safeText(new Date(ranking.date).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'}))}`:''} · <a href="${safeText(ranking.sourceUrl)}" target="_blank" rel="noopener noreferrer">ESPN source</a></p>${standingsTable({name:'National Rankings',entries:ranking.entries},sport,true)}`
      : '<div class="ls-state" role="status"><h2>AP Top 25 unavailable</h2><p>The source has not supplied a published AP poll for this season.</p><button type="button" class="outline-button" data-ls-retry>Try again</button></div>';
  } else if (playoff) {
    const sections=leagueData.playoffSections(data,sport);
    markup=`<p class="ls-source">${safeText(data.season?.displayName || data.season?.year || '')} · Regular-season playoff picture · <a href="${safeText(data.sourceUrl)}" target="_blank" rel="noopener noreferrer">ESPN standings</a></p>`+
      (sections.length?sections.map(s=>standingsTable(s,sport)).join(''):'<div class="ls-state" role="status">Playoff positions are not available from the standings source.</div>');
  } else {
    const sections=college?data.sections.filter(s=>s.conferenceId===leagueStandings.conference.get(sport)):data.sections;
    markup=`<p class="ls-source">${safeText(data.season?.displayName || data.season?.year || '')} · Regular season · <a href="${safeText(data.sourceUrl)}" target="_blank" rel="noopener noreferrer">ESPN standings</a></p>`+
      (sections.length?sections.map(s=>standingsTable(s,sport)).join(''):'<div class="ls-state">Standings have not been published for this season.</div>');
  }
  standingsReplace(content,markup);
  $('#ls-freshness').textContent=state.source==='live'
    ? `${state.feedStale?'Last available':'Shared live'} ratings · ${state.updatedAt?new Date(state.updatedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):''}`
    : 'Live ratings are loading or unavailable. Schedules are independent of your Slate filters.';
}
function initLeagueStandings() {
  const root=$('#league-standings-page');
  root.addEventListener('change',event=>{
    if (event.target.id==='ls-league') leagueStandings.sport=event.target.value;
    if (event.target.id==='ls-conference') leagueStandings.conference.set(leagueStandings.sport,event.target.value);
    // Dismiss the native touch picker before replacement can restore its focus.
    if (['ls-league','ls-conference'].includes(event.target.id) && globalThis.matchMedia?.('(pointer: coarse)').matches) event.target.blur();
    renderLeagueStandings();
  });
  root.addEventListener('click',event=>{
    const view=event.target.closest('[data-ls-view]');
    if (view) {
      if (leagueData.college(leagueStandings.sport)) leagueStandings.view=view.dataset.lsView;
      else leagueStandings.proView=view.dataset.lsView;
      renderLeagueStandings();return;
    }
    if (event.target.closest('[data-ls-retry]')) {
      const sport=leagueStandings.sport;
      standingsLoad(sport,!leagueStandings.data.has(sport)?'standings':leagueStandings.view==='rankings' && leagueData.college(sport)?'poll':'standings',true);
      for (const section of leagueStandings.data.get(sport)?.sections || []) for (const team of section.entries) {
        if (teamPageErrors.has(teamDataKey({...team,sport}))) standingsSchedule({...team,sport},true);
      }
      renderLeagueStandings();return;
    }
    const game=event.target.closest('[data-ls-game]');
    if (game) {openGameDetails(game.dataset.lsGame,game.dataset.lsSport);return;}
    const team=event.target.closest('[data-ls-team]');
    if (team && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();openTeamPage({sport:team.dataset.lsSport,id:team.dataset.lsTeam});
    }
  });
}

(function(root) {
  'use strict';
  // ESPN site-v2 ATP/WTA contracts, captured for all four majors in 2024/2025.
  // IDs are tournament identities; the suffix is the edition, not part of the
  // allowlist. Names corroborate IDs and never independently admit an event.
  const tournaments = {
    '154':['australian open'],
    '172':['roland garros','french open'],
    '188':['wimbledon','the championships wimbledon'],
    '189':['us open','u s open']
  };
  const draws = {'1':'mens singles','2':'womens singles','3':'mens doubles','4':'womens doubles','6':'mixed doubles'};
  const rounds = {'1':['round 1'],'2':['round 2'],'3':['round 3'],'4':['round 4'],
    '5':['quarterfinal','quarterfinals'],'6':['semifinal','semifinals'],'7':['final']};
  const text = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,' ').trim();

  function tournamentIdentity(tournament) {
    const edition = /^(154|172|188|189)-(\d{4})$/.exec(String(tournament?.id || ''));
    if(!edition || tournament.major!==true || Number(tournament.season?.year)!==Number(edition[2]))return null;
    const aliases=tournaments[edition[1]],year=edition[2];
    const names=[tournament.name,tournament.shortName].filter(value=>value!=null && String(value).trim());
    if(!names.length || names.some(value=>{
      const name=text(value).replace(new RegExp(`^${year} | ${year}$`),'');
      return !aliases.includes(name);
    }))return null;
    return {id:edition[1],year:Number(year)};
  }

  function mainDrawMatch(tournament,match,grouping) {
    const identity=tournamentIdentity(tournament);
    if(!identity || String(match?.tournamentId)!==identity.id)return false;
    if(match.isQualifying || match.qualifying || match.isExhibition || match.exhibition || match.isJunior || match.isWheelchair)return false;
    const types=[grouping,match.type].filter(Boolean);
    if(!types.length)return false;
    const ids=types.map(type=>String(type.id || ''));
    const label=draws[ids[0]];
    if(!label || ids.some(id=>id!==ids[0]))return false;
    // All supplied labels must agree; an adult ID with a junior/qualifying label
    // is contradictory evidence, not permission to broaden coverage.
    if(types.some(type=>{
      const labels=[type.slug,type.displayName,type.text].filter(value=>value!=null && String(value).trim());
      return !labels.length || labels.some(value=>text(value)!==label);
    }))return false;
    const allowedRounds=rounds[String(match.round?.id || '')];
    return Boolean(allowedRounds?.includes(text(match.round?.displayName)));
  }

  function tournamentWindow(tournament,now) {
    const start=Date.parse(tournament?.date || ''),end=Date.parse(tournament?.endDate || '');
    return Number.isFinite(start) && Number.isFinite(end) && start<=end && start<=now && now<=end;
  }

  function currentGameAllowed(game,now=Date.now()) {
    if(game?.sport!=='Tennis')return true;
    return tournamentWindow(game.tennisTournament,now) &&
      mainDrawMatch(game.tennisTournament,game.tennisMatch,game.tennisTournament?.grouping);
  }

  root.SportsRadarTennisCoverage=Object.freeze({tournamentIdentity,mainDrawMatch,tournamentWindow,currentGameAllowed});
})(globalThis);

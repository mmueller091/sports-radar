/* Shared, browser/server scoring rules. The alert checker imports this same model. */
(function (root) {
  const SPORT_BASE = {NFL:38,MLB:38,NHL:35,CFB:36,NBA:37,NCAAB:35,Tennis:38,Soccer:35};
  const NFL_DIVISIONS = {BUF:'AFC East',MIA:'AFC East',NE:'AFC East',NYJ:'AFC East',BAL:'AFC North',CIN:'AFC North',CLE:'AFC North',PIT:'AFC North',HOU:'AFC South',IND:'AFC South',JAX:'AFC South',TEN:'AFC South',DEN:'AFC West',KC:'AFC West',LAC:'AFC West',LV:'AFC West',DAL:'NFC East',NYG:'NFC East',PHI:'NFC East',WSH:'NFC East',CHI:'NFC North',DET:'NFC North',GB:'NFC North',MIN:'NFC North',ATL:'NFC South',CAR:'NFC South',NO:'NFC South',TB:'NFC South',ARI:'NFC West',LAR:'NFC West',SF:'NFC West',SEA:'NFC West'};
  const CLOSE_MARGIN = {NFL:14,MLB:3,NHL:3,CFB:14,NBA:12,NCAAB:12,Tennis:3,Soccer:3};
  const clampScore = value => Math.max(1,Math.min(99,Math.round(value)));
  function factorText(factors,score) { const parts = factors.map(factor => `${factor.label} ${factor.points > 0 ? '+' : ''}${factor.points}`); if (factors.reduce((sum,item) => sum + item.points,0) > 99 && score === 99) parts.push('capped at 99'); return parts.join(' · '); }
  function recordFor(competitor) {
    const records = competitor?.records || competitor?.team?.records || [];
    const overall = records.find(item => /overall|total/i.test(`${item.type || ''} ${item.name || ''} ${item.abbreviation || ''}`)) || records[0];
    return overall?.summary || competitor?.record?.summary || (typeof competitor?.record === 'string' ? competitor.record : '');
  }
  function rankFor(competitor, sport) {
    if (!['CFB','NCAAB'].includes(sport)) return null;
    const rank = Number(competitor?.curatedRank?.current ?? competitor?.team?.rank);
    return Number.isFinite(rank) && rank >= 1 && rank <= 25 ? rank : null;
  }
  function parseLine(raw, competition, sport) {
    if (!raw) return null;
    const listed = raw.close || raw.closing || raw;
    const totalValue = listed.overUnder ?? listed.over_under ?? listed.total?.overUnder ?? listed.total?.value;
    const total = totalValue == null || totalValue === '' ? NaN : Number(totalValue);
    const details = String(listed.details || listed.displayValue || '').trim();
    const isMoneyline = /[+-]\d{3,}\b/.test(details) && !/[+-]\d+\.\d+/.test(details);
    let spread = isMoneyline ? '' : String(listed.spread?.displayValue || details).trim();
    if (!spread && listed.spread != null && Number.isFinite(Number(listed.spread)) && (!isMoneyline || Math.abs(Number(listed.spread)) <= 10)) {
      const amount = Math.abs(Number(listed.spread));
      const home = (competition?.competitors || []).find(team => team.homeAway === 'home');
      const away = (competition?.competitors || []).find(team => team.homeAway === 'away');
      const favored = listed.homeTeamOdds?.favorite ? home : listed.awayTeamOdds?.favorite ? away : null;
      if (favored) spread = amount === 0 ? 'PK' : `${favored.team?.abbreviation || favored.abbreviation || 'Favorite'} -${amount}`;
    }
    if (!spread && !details && !Number.isFinite(total)) return null;
    return {spread:spread || '',moneyline:isMoneyline ? details : '',total:Number.isFinite(total) ? total : null,provider:listed.provider?.name || raw.provider?.name || '',verifiedClose:Boolean(raw.close || raw.closing)};
  }
  function lineFromSummary(summary, sport) { const competition = summary?.header?.competitions?.[0]; return parseLine(summary?.pickcenter?.[0] || competition?.odds?.[0] || summary?.odds?.[0],competition,sport); }
  function eventSignalText(event, competition, context) { return [event?.name,event?.shortName,(competition?.notes || []).map(note => note.headline).join(' '),competition?.series?.summary,competition?.series?.title,competition?.series?.type,event?.season?.type?.name,event?.season?.type?.slug,event?.season?.slug,context].filter(Boolean).join(' ').toLowerCase(); }
  function nflDivisionFor(competitors) { const divisions = competitors.map(item => NFL_DIVISIONS[String(item.team?.abbreviation || '').toUpperCase()]); return divisions.length === 2 && divisions[0] && divisions[0] === divisions[1] ? divisions[0] : ''; }
  function winningRecord(competitor) { const match = String(recordFor(competitor)).match(/^(\d+)-(\d+)/); return Boolean(match && Number(match[1]) > Number(match[2])); }
  function listedSpread(competition) { const spread = parseLine(competition?.odds?.[0],competition,'NFL')?.spread || ''; const match = spread.match(/[+-](\d+(?:\.\d+)?)/); return match ? Number(match[1]) : null; }
  function pregameRating(sport,event,competition,context) {
    const detail = eventSignalText(event,competition,context);
    const factors = [{label:'Sport baseline',points:SPORT_BASE[sport] || 35}];
    let reason = 'Regular-season matchup · no extra stakes listed';
    if (/world series/.test(detail)) { factors.push({label:'World Series',points:42}); reason = 'World Series championship'; }
    else if (/super bowl|stanley cup final|champions league final|national championship|grand slam final/.test(detail)) { factors.push({label:'Championship',points:40}); reason = 'Championship game'; }
    else if (/conference final|league final|finals|championship|title game/.test(detail)) { factors.push({label:'Final round',points:30}); reason = 'Final-round stakes'; }
    else if (/playoff|postseason|wild card|divisional round|quarterfinal|semifinal|knockout/.test(detail) || Number(event?.season?.type?.id ?? event?.season?.type) === 3) { factors.push({label:'Postseason',points:22}); reason = 'Postseason game'; }
    else if (sport === 'Tennis' && /wimbledon|australian open|french open|roland garros|us open/.test(detail)) { factors.push({label:'Major tournament',points:18}); reason = 'Tennis major'; }
    if (factors.length > 1 && /game\s*1\b|game one\b|g1\b/.test(detail)) { factors.push({label:'Series opener',points:5}); reason += ' · Game 1'; }
    const competitors = competition?.competitors || [];
    if (sport === 'NFL') {
      const division = nflDivisionFor(competitors);
      if (division) { factors.push({label:`${division} matchup`,points:18}); reason += ` · ${division} rivals`; }
      if (competitors.length === 2 && competitors.every(winningRecord)) { factors.push({label:'Both winning records',points:8}); reason += ' · both teams winning'; }
      const spread = listedSpread(competition);
      if (spread !== null && spread <= 3) { factors.push({label:'Tight projected spread',points:7}); reason += ' · close line'; }
      else if (spread !== null && spread <= 6) { factors.push({label:'Competitive projected spread',points:4}); reason += ' · competitive line'; }
    }
    const ranks = ['CFB','NCAAB'].includes(sport) ? competitors.map(item => Number(item.curatedRank?.current || item.team?.rank)).filter(rank => rank > 0 && rank <= 25) : [];
    if (ranks.length === 2) {
      factors.push({label:'Two ranked teams',points:sport === 'CFB' ? 28 : 9});
      if (sport === 'CFB') {
        if (ranks.every(rank => rank <= 20)) factors.push({label:'Both top 20',points:4});
        if (ranks.some(rank => rank <= 10)) factors.push({label:'Top 10 team',points:5});
        const records = competitors.map(recordFor).map(value => String(value).match(/^(\d+)-(\d+)/));
        if (records.every(match => match && Number(match[1]) > Number(match[2]))) factors.push({label:'Both winning records',points:3});
        if (records.some(match => match && Number(match[1]) >= 4 && Number(match[2]) === 0)) factors.push({label:'Unbeaten team',points:4});
      }
      reason += ' · two ranked teams';
    }
    else if (ranks.length === 1) { factors.push({label:'Ranked team',points:sport === 'CFB' ? 11 : 4}); if (sport === 'CFB' && ranks[0] <= 10) factors.push({label:'Top 10 team',points:5}); reason += ' · ranked team'; }
    if (/rivalry|rival\b|derby/.test(detail) && !factors.some(item => item.label.endsWith('matchup'))) { factors.push({label:'Rivalry',points:7}); reason += ' · rivalry'; }
    return {score:clampScore(factors.reduce((sum,item) => sum + item.points,0)),factors,reason};
  }
  function gameProgress(sport,competition) {
    const status = competition?.status || {};
    const period = Number(status.period || 0);
    const total = ({NFL:4,CFB:4,NHL:3,NBA:4,NCAAB:2,MLB:9,Soccer:2,Tennis:3})[sport] || 4;
    if (!period) return 0;
    if (sport === 'MLB') return Math.min(1,period / total);
    const length = ({NFL:15,CFB:15,NHL:20,NBA:12,NCAAB:20,Soccer:45})[sport];
    const clock = String(status.displayClock || '').match(/^(\d+):(\d+)/);
    const remaining = clock && length ? Math.min(length * 60,Number(clock[1]) * 60 + Number(clock[2])) : length ? length * 30 : 0;
    return Math.max(0,Math.min(1,((period - 1) + (length ? 1 - remaining / (length * 60) : .5)) / total));
  }
  function numberFromLine(value) { if (value === null || value === undefined || value === '') return null; const n = Number(String(value).replace(/[^+\-.\d]/g,'')); return Number.isFinite(n) ? n : null; }
  function underdogCandidate(sport,competition,raw) {
    if (!raw || !competition?.competitors || competition.competitors.length !== 2) return null;
    const odds = raw.close || raw.closing || raw;
    const sides = ['home','away'].map(side => {
      const competitor = competition.competitors.find(item => item.homeAway === side);
      if (!competitor) return null;
      const spread = numberFromLine(odds.pointSpread?.[side]?.close?.line ?? odds.pointSpread?.[side]?.open?.line);
      const moneyline = numberFromLine(odds.moneyline?.[side]?.close?.odds ?? odds.moneyline?.[side]?.open?.odds);
      return {side,competitor,spread,moneyline};
    }).filter(Boolean);
    if (sides.length !== 2) return null;
    const spreadMinimum = ({NFL:7,CFB:10,NBA:8,NCAAB:8})[sport];
    const moneylineMinimum = ({MLB:180,NHL:180,Soccer:250,Tennis:180})[sport];
    let pick = spreadMinimum ? sides.find(item => item.spread !== null && item.spread >= spreadMinimum) : null;
    let type = pick ? 'spread' : '';
    if (!pick && spreadMinimum) {
      const amount = Math.abs(numberFromLine(odds.spread) ?? numberFromLine(odds.details?.match(/[+-]\d+(?:\.\d+)?/)?.[0]) ?? 0);
      if (amount >= spreadMinimum) { pick = sides.find(item => odds[`${item.side}TeamOdds`]?.underdog === true || odds[`${item.side}TeamOdds`]?.favorite === false); if (pick) { pick = {...pick,spread:amount}; type = 'spread'; } }
    }
    if (!pick && moneylineMinimum) { pick = sides.find(item => item.moneyline !== null && item.moneyline >= moneylineMinimum); if (pick) type = 'moneyline'; }
    if (!pick) return null;
    const value = type === 'spread' ? pick.spread : pick.moneyline;
    const minimum = type === 'spread' ? spreadMinimum : moneylineMinimum;
    const teamIndex = competition.competitors.indexOf(pick.competitor);
    return {side:pick.side,teamId:String(pick.competitor.team?.id || pick.competitor.id || ''),teamIndex,teamName:pick.competitor.team?.displayName || pick.competitor.team?.name || 'The underdog',type,value,strength:Math.min(1,Math.max(0,(value - minimum) / (type === 'spread' ? minimum : 200))),description:type === 'spread' ? `${value}-point underdog` : `+${value} moneyline underdog`};
  }
  function upsetImpact(candidate,teams,gameState,progress) {
    if (!candidate || gameState === 'upcoming') return {points:0,text:''};
    const index = teams.findIndex(team => candidate.teamId && String(team.id || team[8] || '') === candidate.teamId);
    const teamIndex = index >= 0 ? index : candidate.teamIndex;
    if (teamIndex < 0 || teamIndex > 1 || teams.length !== 2) return {points:0,text:''};
    const score = Number(teams[teamIndex].score ?? teams[teamIndex][2]);
    const other = Number(teams[1-teamIndex].score ?? teams[1-teamIndex][2]);
    if (!Number.isFinite(score) || !Number.isFinite(other)) return {points:0,text:''};
    const margin = score - other;
    if (gameState === 'completed') return margin > 0 ? {points:20 + Math.round(5*candidate.strength),text:`${candidate.teamName} won outright after entering as a ${candidate.description}` } : {points:0,text:''};
    if (margin > 0 && progress >= .35) return {points:8 + Math.round(8*progress) + Math.round(5*candidate.strength),text:`${candidate.teamName}, a ${candidate.description}, leads ${score}–${other}`};
    if (margin === 0 && progress >= .7) return {points:4 + Math.round(6*progress) + Math.round(3*candidate.strength),text:`${candidate.teamName}, a ${candidate.description}, is tied ${score}–${other} late`};
    return {points:0,text:''};
  }
  function rateGame(sport,gameState,teams,event,competition,context) {
    const opening = pregameRating(sport,event,competition,context);
    const factors = opening.factors.map(item => ({...item}));
    if (gameState === 'upcoming') return {...opening,openingScore:opening.score,underdog:null,upsetText:'',upsetPoints:0};
    const values = teams.map(team => Number(team.score)).filter(Number.isFinite);
    const gap = values.length === 2 ? Math.abs(values[0] - values[1]) : null;
    const closeLimit = CLOSE_MARGIN[sport] || 10;
    const close = gap === null ? 0 : Math.max(0,1 - gap / closeLimit);
    const progress = gameState === 'completed' ? 1 : gameProgress(sport,competition);
    const closePoints = gameState === 'completed' ? Math.round(28 * close) : Math.round(24 * close * (.35 + .65 * progress));
    if (closePoints) factors.push({label:gameState === 'completed' ? 'Final margin' : 'Score closeness',points:closePoints});
    if (gap !== null && gap >= closeLimit && progress > .3) factors.push({label:'Wide margin',points:-Math.min(26,Math.round((gap / closeLimit) * 13 * progress))});
    const phasePoints = gameState === 'completed' ? 15 : Math.round(progress * 14);
    if (phasePoints) factors.push({label:gameState === 'completed' ? 'Reached final' : 'Game progress',points:phasePoints});
    const detail = `${competition?.status?.type?.detail || ''} ${competition?.status?.type?.shortDetail || ''}`;
    if (gameState === 'completed' && /overtime|\bot\b/i.test(detail)) factors.push({label:'Overtime',points:13});
    const underdog = underdogCandidate(sport,competition,competition?.odds?.[0]);
    const upset = upsetImpact(underdog,teams,gameState,progress);
    if (upset.points) factors.push({label:gameState === 'completed' ? 'Underdog won outright' : 'Underdog threatens upset',points:upset.points});
    const score = clampScore(factors.reduce((sum,item) => sum + item.points,0));
    let reason = opening.reason;
    const unit = sport === 'NHL' || sport === 'Soccer' ? 'goal' : sport === 'MLB' ? 'run' : sport === 'Tennis' ? 'set' : 'point';
    if (gameState === 'live') reason = gap === 0 ? `Tied ${teams[0].score}–${teams[1].score}${progress > .65 ? ' late' : ''}` : gap !== null && closePoints > 0 ? `${gap}-${unit} game${progress > .65 ? ' late' : ''}` : `Game in progress · ${Math.round(progress * 100)}% elapsed`;
    if (gameState === 'completed') reason = /overtime|\bot\b/i.test(detail) ? `Overtime finish · ${gap}-${unit} margin` : gap !== null ? `Decided by ${gap} ${unit}${gap === 1 ? '' : 's'}` : 'Final result';
    return {score,factors,reason,openingScore:opening.score,underdog,upsetText:upset.text,upsetPoints:upset.points};
  }
  function ordinal(value) { const n = Number(value); return `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({1:'st',2:'nd',3:'rd'}[n % 10] || 'th')}`; }
  function livePhase(sport,status) {
    const detail = String(status?.type?.detail || status?.type?.shortDetail || '').trim();
    const period = Number(status?.period || 0);
    if (sport === 'MLB') {
      const half = detail.match(/\b(top|bottom|bot)\b/i)?.[1] || status?.inningHalf;
      return half && period ? `${/^bot/i.test(half) ? 'Bottom' : 'Top'} ${ordinal(period)}` : detail || (period ? `${ordinal(period)} inning` : 'Live');
    }
    if (/halftime|intermission|end of/i.test(detail)) return detail;
    const clock = String(status?.displayClock || '').trim();
    if (sport === 'NHL' && period) return `${clock && /^\d+:\d+$/.test(clock) ? `${clock} · ` : ''}${period > 3 ? 'OT' : `${ordinal(period)} period`}`;
    if (['NFL','CFB','NBA','NCAAB'].includes(sport) && period) return `${clock && /^\d+:\d+$/.test(clock) ? `${clock} · ` : ''}${ordinal(period)} ${['NFL','CFB','NBA'].includes(sport) ? 'quarter' : 'half'}`;
    return detail || (clock && clock !== '0.0' ? clock : 'Live');
  }
  function runnerOn(situation,base) {
    const value = situation?.[`on${base}`] ?? situation?.runners?.[base.toLowerCase()];
    return value === undefined || value === null ? null : Boolean(value);
  }
  function hockeyPowerPlay(summary,teams) {
    const onIce = summary?.onIce || [];
    const blocks = summary?.boxscore?.players || [];
    if (onIce.length !== 2) return null;
    const goalieIds = new Map(blocks.map(block => [String(block.team?.id || ''),new Set((block.statistics || []).filter(group => /goalie/i.test(group.name || group.displayName || '')).flatMap(group => (group.athletes || []).map(entry => String(entry.athlete?.id || ''))))]));
    const sides = onIce.map(side => ({id:String(side.teamId || ''),count:(side.entries || []).length,hasGoalie:(side.entries || []).some(entry => goalieIds.get(String(side.teamId || ''))?.has(String(entry.athleteid || '')))}));
    if (!sides.every(side => side.hasGoalie) || sides[0].count === sides[1].count || Math.max(...sides.map(side => side.count)) !== 6 || Math.min(...sides.map(side => side.count)) < 4) return null;
    const advantaged = sides.find(side => side.count === 6);
    return teams.find(team => String(team[8] || '') === advantaged.id)?.[0] || null;
  }
  function noHitBid(summary) {
    const competitors = summary?.header?.competitions?.[0]?.competitors || [];
    for (const block of summary?.boxscore?.players || []) {
      const opponent = competitors.find(item => String(item.team?.id || '') !== String(block.team?.id || ''));
      if (!opponent || Number(opponent.hits) !== 0 || opponent.hits == null) continue;
      for (const group of block.statistics || []) {
        const labels = group.labels || [];
        const innings = labels.indexOf('IP'); const hits = labels.indexOf('H');
        if (innings < 0 || hits < 0) continue;
        const pitcher = (group.athletes || []).find(entry => Number.parseFloat(entry.stats?.[innings]) >= 6 && Number(entry.stats?.[hits]) === 0);
        if (pitcher) return {text:`${pitcher.athlete?.displayName || 'A pitcher'} has thrown ${Math.floor(Number.parseFloat(pitcher.stats[innings]))} hitless innings in a no-hit bid`,points:14};
      }
    }
    return null;
  }
  function hockeyGoalMilestone(summary) {
    for (const block of summary?.boxscore?.players || []) for (const group of block.statistics || []) {
      if (/goalie/i.test(group.name || group.displayName || '')) continue;
      const goals = (group.labels || []).indexOf('G');
      if (goals < 0) continue;
      const scorer = (group.athletes || []).filter(entry => Number(entry.stats?.[goals]) >= 2).sort((a,b) => Number(b.stats[goals]) - Number(a.stats[goals]))[0];
      if (scorer) { const count = Number(scorer.stats[goals]); const name = scorer.athlete?.displayName || 'A player'; return {text:count >= 3 ? `${name} has a hat trick (${count} goals)` : `${name} has 2 goals and is one away from a hat trick`,points:count >= 3 ? 12 : 7}; }
    }
    return null;
  }
  function footballMilestone(summary) {
    for (const block of summary?.boxscore?.players || []) for (const group of block.statistics || []) {
      if (!/pass/i.test(group.name || group.displayName || '')) continue;
      const touchdowns = (group.labels || []).findIndex(label => /^TD$|^PASS TD$/i.test(label));
      if (touchdowns < 0) continue;
      const passer = (group.athletes || []).find(entry => Number(entry.stats?.[touchdowns]) >= 3);
      if (passer) return {text:`${passer.athlete?.displayName || 'A quarterback'} has thrown ${passer.stats[touchdowns]} touchdown passes`,points:6};
    }
    return null;
  }
  function liveMilestone(sport,summary) { return sport === 'MLB' ? noHitBid(summary) : sport === 'NHL' ? hockeyGoalMilestone(summary) : ['NFL','CFB'].includes(sport) ? footballMilestone(summary) : null; }
  function liveSnapshot(game,competition,summary) {
    const status = competition?.status || game.liveRawStatus;
    const situation = competition?.situation || game.liveRawSituation || {};
    const snapshot = {phase:livePhase(game.sport,status),note:'',reasons:[],bonus:0,bases:null};
    if (['NFL','CFB'].includes(game.sport)) {
      const possessionId = String(situation.possession?.id || situation.possession || '');
      const holder = game.teams.find(team => String(team[8] || '') === possessionId);
      const down = Number(situation.down);
      const distance = Number(situation.distance);
      const downText = String(situation.downDistanceText || situation.shortDownDistanceText || (down >= 1 && down <= 4 ? `${ordinal(down)} & ${Number.isFinite(distance) ? distance : 'goal'}` : '')).trim();
      const spot = String(situation.possessionText || '').trim();
      snapshot.note = [holder ? `${holder[1] || holder[0]} ball` : '',downText,spot && !downText.includes(spot) ? spot : ''].filter(Boolean).join(' · ');
      if (situation.isRedZone === true) { snapshot.reasons.push(`${holder?.[0] || 'The offense'} is in the red zone`); snapshot.bonus += 4; }
      if (down === 4 && downText) { snapshot.reasons.push(`${downText} is a pivotal down`); snapshot.bonus += 3; }
    } else if (game.sport === 'MLB') {
      const bases = {first:runnerOn(situation,'First'),second:runnerOn(situation,'Second'),third:runnerOn(situation,'Third')};
      snapshot.bases = Object.values(bases).some(value => value !== null) ? bases : null;
      const outs = Number(situation.outs);
      const hasOuts = situation.outs !== undefined && situation.outs !== null && Number.isInteger(outs) && outs >= 0 && outs <= 2;
      snapshot.note = hasOuts ? `${outs} ${outs === 1 ? 'out' : 'outs'}` : '';
      const occupied = Object.entries(bases).filter(([,value]) => value).map(([base]) => base);
      if (occupied.length) snapshot.reasons.push(`Runners on ${occupied.join(' and ')}`);
      if ((bases.second || bases.third) && Number(status?.period || 0) >= 7 && Math.abs(Number(game.teams[0][2]) - Number(game.teams[1][2])) <= 1) snapshot.bonus += 4;
    } else if (game.sport === 'NHL' && summary) {
      const powerPlayTeam = hockeyPowerPlay(summary,game.teams);
      if (powerPlayTeam) { snapshot.note = `${powerPlayTeam} power play`; snapshot.bonus += 4; }
    }
    const milestone = summary ? liveMilestone(game.sport,summary) : null;
    if (milestone) { snapshot.reasons.push(milestone.text); snapshot.bonus += milestone.points; }
    return snapshot;
  }
  function applyLiveSnapshot(game,competition,summary) {
    if (game.state !== 'live') return;
    game.live = liveSnapshot(game,competition,summary);
    game.score = clampScore(game.baseScore + game.live.bonus);
  }
  
  const api = {SPORT_BASE,NFL_DIVISIONS,CLOSE_MARGIN,clampScore,factorText,recordFor,rankFor,parseLine,lineFromSummary,eventSignalText,nflDivisionFor,winningRecord,listedSpread,pregameRating,gameProgress,underdogCandidate,upsetImpact,rateGame,ordinal,livePhase,runnerOn,hockeyPowerPlay,noHitBid,hockeyGoalMilestone,footballMilestone,liveMilestone,liveSnapshot,applyLiveSnapshot};
  root.SportsRadarScore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

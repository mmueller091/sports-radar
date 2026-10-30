// Historical replay v1 only: preserves the faulty input path for frozen evidence.
import {createRequire} from 'node:module';
import {readJson,contextOverridesPath,applyContextOverride} from '../calibration/helpers.mjs';
const require=createRequire(import.meta.url);
const {eventPosition}=require('../scoring/shared/time.js');
const overrides=readJson(contextOverridesPath,{events:{}});
const clone=value=>structuredClone(value);
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
const numeric=v=>v!=null&&v!==''&&Number.isFinite(Number(v));
function footballStream(summary) {
  const drives = summary?.drives || {};
  const sourceDrives = [...(drives.previous || []),...(drives.current ? [drives.current] : [])];
  return sourceDrives.flatMap((drive,driveIndex) =>
    (drive?.plays || []).map((play,playIndex) => ({play,drive,driveIndex,playIndex,sourceDrives}))
  );
}

function chronologicalStream(fixture) {
  const summary = fixture.summary || {};
  const football = ['NFL','CFB'].includes(fixture.modelSport) ? footballStream(summary) : [];
  const entries = football.length ? football : (summary.plays || []).map(play => ({play}));
  const byId = new Map(entries.filter(entry => entry.play.id != null)
    .map(entry => [String(entry.play.id),entry]));
  for (const play of [...(football.length ? summary.plays || [] : []),...(summary.scoringPlays || [])]) {
    const existing = play.id == null ? null : byId.get(String(play.id));
    if (existing) existing.play = {...play,...existing.play};
    else {
      const entry = {play};
      entries.push(entry);
      if (play.id != null) byId.set(String(play.id),entry);
    }
  }
  // MLB sequence numbers restart for every at-bat; its archive array is chronological.
  // Other captured streams supply game-wide sequence numbers (ties retain source order).
  if (fixture.modelSport !== 'MLB' && entries.every(entry => numeric(entry.play.sequenceNumber))) {
    entries.sort((a,b) => Number(a.play.sequenceNumber)-Number(b.play.sequenceNumber));
  } else if (fixture.modelSport !== 'MLB') {
    entries.sort((a,b) => (playPosition(fixture.modelSport,a.play) ?? Infinity) -
      (playPosition(fixture.modelSport,b.play) ?? Infinity));
  }
  const seen = new Set();
  return entries.filter(entry => {
    if (entry.play.id == null) return true;
    const id = String(entry.play.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function playPosition(sport,play) {
  if (numeric(play?.position ?? play?.gameProgress)) return Number(play.position ?? play.gameProgress);
  if (!periodFor(play)) return null;
  if (sport === 'MLB' && !/top|bottom|bot/i.test(play?.period?.type || play?.inningHalf || '')) return null;
  if (!['MLB','Tennis'].includes(sport) && !play?.clock?.displayValue &&
    !play?.displayClock && !numeric(play?.clock?.value ?? play?.clockValue)) return null;
  return eventPosition(sport,{status:statusFor(sport,play)});
}

function periodFor(play) {
  return Number(play?.period?.number || play?.period?.value || play?.period || 0);
}

function statusFor(sport,play) {
  const period = periodFor(play);
  const displayClock = play?.clock?.displayValue || play?.displayClock || '';
  const periodText = play?.period?.displayValue || '';
  const half = sport === 'MLB' ? String(play?.period?.type || play?.inningHalf || '') : '';
  const detail = [half,periodText || (period ? `Period ${period}` : ''),displayClock]
    .filter(Boolean).join(' ');
  return {
    period,
    displayClock,
    ...(numeric(play?.clock?.value ?? play?.clockValue) ? {clock:play.clock?.value ?? play.clockValue} : {}),
    ...(sport === 'NHL' ? {clockMode:'elapsed'} : {}),
    type:{
      state:'in',completed:false,name:'STATUS_IN_PROGRESS',
      detail,
      shortDetail:detail
    }
  };
}

function copyDefined(source,keys) {
  return Object.fromEntries(keys.filter(key => source?.[key] != null).map(key => [key,clone(source[key])]));
}

function footballSituation(play) {
  // These are after-play checkpoints: a start-only record cannot establish its result.
  const source = play?.end;
  if (!source) return {};
  const situation = copyDefined(source,[
    'down','distance','yardLine','yardsToEndzone','downDistanceText',
    'shortDownDistanceText','possessionText','isGoalToGo','isRedZone',
    'homeTimeouts','awayTimeouts','isTwoPointAttempt'
  ]);
  const possession = source.team?.id;
  if (possession != null) situation.possession = String(possession);
  const downText = `${source.downDistanceText || ''} ${source.shortDownDistanceText || ''}`;
  if (/&\s*goal\b/i.test(downText)) situation.isGoalToGo = true;
  const yardsToEndzone = Number(source.yardsToEndzone);
  if (numeric(source.yardsToEndzone) && yardsToEndzone >= 0 && yardsToEndzone <= 20) situation.isRedZone = true;
  return situation;
}

function baseballSituation(play) {
  const count = play?.resultCount;
  const situation = {};
  if (numeric(play?.outs)) situation.outs = Number(play.outs);
  if (numeric(count?.balls)) situation.balls = Number(count.balls);
  if (numeric(count?.strikes)) situation.strikes = Number(count.strikes);
  if (Number.isFinite(situation.balls) && Number.isFinite(situation.strikes)) {
    situation.count = `${situation.balls}-${situation.strikes}`;
  }
  // Captured ESPN at-bat records encode occupied bases sparsely. Only use that
  // contract on identifiable at-bat/count/outs records, never arbitrary scoring plays.
  const sparseBases = play?.atBatId != null && numeric(play.outs) && count;
  for (const key of ['onFirst','onSecond','onThird']) {
    if (sparseBases || has(play,key)) situation[key] = Boolean(play[key]);
  }
  const half = String(play?.period?.type || play?.inningHalf || '').toLowerCase();
  if (half) situation.inningHalf = half;
  if (/top/.test(half)) situation.battingSide = 'away';
  else if (/bottom|bot/.test(half)) situation.battingSide = 'home';
  return situation;
}

function situationFor(sport,play) {
  if (['NFL','CFB'].includes(sport)) return footballSituation(play);
  if (sport === 'MLB') return baseballSituation(play);
  if (['NBA','NCAAB'].includes(sport)) {
    const situation = copyDefined(play?.situation,['possession','timeoutsRemaining','homeTimeoutsRemaining',
      'awayTimeoutsRemaining','fouls','bonus']);
    // A rebound/steal explicitly awards control. The team attached to a shot,
    // foul, substitution, or generic jump-ball event does not establish possession.
    if (play.team?.id != null && (/^(Offensive Rebound|Defensive Rebound|Steal)$/i.test(play.type?.text || '') ||
      /jump ball won by/i.test(play.text || ''))) situation.possession = String(play.team.id);
    return situation;
  }
  if (sport === 'NHL') {
    return {
      ...(play?.strength ? {strength:clone(play.strength)} : {}),
      ...(play?.team?.id != null ? {eventTeam:String(play.team.id)} : {})
    };
  }
  if (sport === 'Tennis') return copyDefined(play?.situation,[
    'pointScore','score','tiebreak','isTiebreak','matchPoint','isMatchPoint',
    'setPoint','isSetPoint','breakPoint','isBreakPoint','displayValue','description'
  ]);
  if (sport === 'Soccer') return copyDefined(play?.situation,['displayValue','description','aggregateScore']);
  return {};
}

function partialDrives(entry) {
  if (!entry.sourceDrives) return undefined;
  const previous = entry.sourceDrives.slice(0,entry.driveIndex)
    .map(drive => ({...drive,plays:[...(drive?.plays || [])]}));
  // The archived current drive's result/end/totals describe its eventual outcome.
  const current = {...copyDefined(entry.drive,['id','team','start']),
    plays:(entry.drive?.plays || []).slice(0,entry.playIndex+1)};
  return {previous,current};
}

function scoringThrough(sourceSummary,acceptedPlays) {
  const scoringIds = new Set((sourceSummary.scoringPlays || []).map(play => String(play.id)));
  return acceptedPlays.filter(play => play.scoringPlay === true || scoringIds.has(String(play.id)));
}

function wpIndex(item,positionById,stream,sport) {
  if (item.playId != null && positionById.has(String(item.playId))) return positionById.get(String(item.playId));
  const position = playPosition(sport,item);
  if (position === null) return null;
  // Attach time-only observations at the last record at that clock so a later
  // event sharing the clock cannot leak backward into an earlier checkpoint.
  let found = -1;
  for (let i=0;i<stream.length;i++) {
    const at = playPosition(sport,stream[i].play);
    if (at !== null && at <= position) found = i;
  }
  if (found < 0) return -1;
  const at = playPosition(sport,stream[found].play);
  return at === position ? found : found+1;
}

function checkpointSignature(competition,summary,play) {
  const scores = (competition.competitors || []).map(team => `${team.homeAway}:${team.score}`).sort();
  const wp = summary.winprobability?.at(-1);
  const signal = play.scoringPlay || play.shootingPlay || play.isTurnover ||
    /turnover|intercept|fumble|fourth|4th|penalty|power play|empty net|red card|match point|rebound|steal|foul|timeout/i
    .test(`${play?.type?.text || ''} ${play?.text || ''}`)
    ? String(play?.id || play?.text || '') : '';
  return JSON.stringify({
    scores,
    period:competition.status?.period,
    clock:competition.status?.displayClock,
    numericClock:competition.status?.clock,
    situation:competition.situation,
    wp:wp?.homeWinPercentage ?? wp?.homeWinProbability ?? wp?.value ?? null,
    signal
  });
}

function availableFields(competition,summary) {
  const fields = [];
  if (competition.status?.period) fields.push('period');
  if (competition.status?.displayClock) fields.push('clock');
  fields.push(...Object.keys(competition.situation || {}));
  if (summary.onIce?.length) fields.push('onIce');
  return [...new Set(fields)].sort();
}

function situationUsable(sport,competition,summary) {
  const situation = competition.situation || {};
  if (['NFL','CFB'].includes(sport)) {
    return Boolean(situation.possession && [1,2,3,4].includes(Number(situation.down)) &&
      numeric(situation.distance) && (numeric(situation.yardsToEndzone) || situation.possessionText));
  }
  if (['NBA','NCAAB'].includes(sport)) {
    return Boolean(competition.status?.period && (competition.status?.displayClock || numeric(competition.status?.clock)));
  }
  if (sport === 'MLB') {
    return Boolean(situation.battingSide && numeric(situation.outs) && Number.isInteger(Number(situation.outs)) &&
      ['onFirst','onSecond','onThird'].every(key => has(situation,key)));
  }
  if (sport === 'NHL') return Boolean(summary.onIce?.length === 2);
  if (sport === 'Soccer') return Boolean(competition.status?.period && competition.status?.displayClock);
  if (sport === 'Tennis') return Object.keys(situation).length > 0;
  return false;
}

function historicalCompetition(source) {
  const competition = clone(source);
  for (const key of ['leaders','headlines','highlights','lastPlay']) delete competition[key];
  for (const team of competition.competitors || []) {
    for (const key of ['winner','linescores','statistics','leaders','hits','errors','timeouts','timeoutsRemaining',
      'possession','probables']) delete team[key];
  }
  return competition;
}

function reconstructedCheckpoint(fixture,entry,index,stream,acceptedPlays,rollingScore,wpEntries) {
  const sourceEvent = fixture.event || {};
  const sourceCompetition = sourceEvent.competitions?.[0];
  const sourceSummary = fixture.summary || {};
  const play = entry.play;
  for (const side of ['home','away']) {
    const value = play?.[`${side}Score`];
    if (numeric(value)) rollingScore[side] = Number(value);
  }
  if (!sourceCompetition || !periodFor(play) || !['home','away'].every(side => numeric(rollingScore[side]))) return null;

  const competition = historicalCompetition(sourceCompetition);
  competition.status = statusFor(fixture.modelSport,play);
  competition.situation = situationFor(fixture.modelSport,play);
  for (const competitor of competition.competitors || []) {
    if (competitor.homeAway in rollingScore) competitor.score = String(rollingScore[competitor.homeAway]);
  }

  const injected = applyContextOverride(
    sourceEvent,competition,String(fixture.eventId || sourceEvent.id || ''),overrides
  );
  const event = {...injected.event,status:competition.status,competitions:[injected.competition]};
  const summary = {
    header:{...copyDefined(sourceSummary.header,['id','uid','season','week','league']),competitions:[injected.competition]},
    plays:acceptedPlays.slice(),
    scoringPlays:scoringThrough(sourceSummary,acceptedPlays),
    winprobability:wpEntries.filter(entry => entry.index !== null && entry.index <= index).map(entry => entry.item)
  };
  const drives = partialDrives(entry);
  if (drives) summary.drives = drives;

  const latestWp = summary.winprobability.at(-1);
  const missingSituationFields = [];
  const sport = fixture.modelSport;
  const usable = situationUsable(sport,injected.competition,summary);
  if (!usable) missingSituationFields.push('usable sport situation');
  if (['NBA','NCAAB'].includes(sport) && !competition.situation.possession) missingSituationFields.push('possession');
  if (sport === 'NHL') missingSituationFields.push('historical skaters/goalie state');
  if (sport === 'MLB' && !competition.situation.count) missingSituationFields.push('count');
  if (['NFL','CFB','NBA','NCAAB','NHL','Soccer'].includes(sport) &&
    !competition.status.displayClock && !numeric(competition.status.clock)) missingSituationFields.push('clock');
  return {
    view:'high-fidelity',event,competition:injected.competition,summary,play,
    nextPlayScoring:stream[index+1]?.play?.scoringPlay === true,
    fullStreamAvailable:Boolean(sourceSummary.plays?.length || footballStream(sourceSummary).length),
    wpSourceAvailable:Boolean(sourceSummary.winprobability?.length),
    wpHistoryPositioned:true,
    latestWpPositioned:Boolean(latestWp),
    unpositionedWpExcluded:wpEntries.filter(entry => entry.index === null).length,
    missingSituationFields,
    availableSituationFields:availableFields(injected.competition,summary),
    sportSpecificSituationUsable:usable
  };
}

export function highFidelityCheckpoints(fixture) {
  const stream = chronologicalStream(fixture);
  if (!stream.length) return [];
  const positionById = new Map(stream.map((item,index) => [item,index])
    .filter(([item]) => item.play?.id != null)
    .map(([item,index]) => [String(item.play.id),index]));
  const wpEntries = (fixture.summary?.winprobability || []).map((item,sourceIndex) => ({
    item,index:wpIndex(item,positionById,stream,fixture.modelSport),sourceIndex
  })).sort((a,b) => (a.index ?? Infinity)-(b.index ?? Infinity) || a.sourceIndex-b.sourceIndex);
  const acceptedPlays = [];
  const rollingScore = {home:null,away:null};
  const checkpoints = [];
  let previousSignature = null;
  for (let index=0; index<stream.length; index++) {
    acceptedPlays.push(stream[index].play);
    const checkpoint = reconstructedCheckpoint(
      fixture,stream[index],index,stream,acceptedPlays,rollingScore,wpEntries
    );
    if (!checkpoint) continue;
    // Terminal records belong to completed-game analysis, not live calibration.
    if (/end (?:of (?:the )?)?game|game (?:over|end)|final score/i.test(
      `${checkpoint.play.type?.text || ''} ${checkpoint.play.text || ''}`)) continue;
    const signature = checkpointSignature(checkpoint.competition,checkpoint.summary,checkpoint.play);
    if (signature === previousSignature) continue;
    previousSignature = signature;
    checkpoints.push(checkpoint);
  }
  return checkpoints;
}


export {statusFor,periodFor,playPosition,situationFor,historicalCompetition,availableFields,situationUsable,copyDefined,checkpointSignature};

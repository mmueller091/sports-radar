import {createRequire} from 'node:module';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/game-model.js';
const require=createRequire(import.meta.url);
const core=require('../rating-core.js');
const {nhlAdvancedStats,eventTime,manpower,canonicalPlays}=require('../scoring/nhl-advanced.cjs');
const {experimentalNhlRating}=require('./nhl-pressure-experiment.cjs');

export function publicCheckpoint(pbp,plays,at=plays.at(-1),completed=false) {
  const elapsed=eventTime(at,pbp.gameType),stats=nhlAdvancedStats({...pbp,plays},{asOfElapsed:elapsed});
  const shootout=completed && pbp.periodDescriptor?.periodType==='SO';
  const period=shootout?5:at.periodDescriptor.number;
  const status={period,displayClock:at.timeRemaining,clockMode:'remaining',type:{state:completed?'post':'in',completed,
    detail:completed?(shootout?'Final/SO':period>3?'Final/OT':'Final'):period>3?`${period-3}OT`:`P${period}`,shortDetail:completed?'Final':`${period>3?'OT':'P'+period} ${at.timeRemaining}`}};
  const competitors=[['away',pbp.awayTeam],['home',pbp.homeTeam]].map(([homeAway,t])=>({homeAway,score:String(completed?t.score:stats.score[t.id]),
    team:{id:String(t.id),abbreviation:t.abbrev,displayName:`${t.placeName?.default || ''} ${t.commonName?.default || t.abbrev}`.trim()}}));
  const competition={date:pbp.startTimeUTC,status,competitors};
  const event={id:String(pbp.id),date:pbp.startTimeUTC,name:pbp.gameType===3?`Stanley Cup Final${String(pbp.id).endsWith('7')?' Game 7':''}`:`${pbp.awayTeam.abbrev} at ${pbp.homeTeam.abbrev}`,
    season:{type:pbp.gameType},competitions:[competition]};
  let home=0,away=0;
  const espnPlays=canonicalPlays(plays).plays.sort((a,b)=>eventTime(a,pbp.gameType)-eventTime(b,pbp.gameType) || a.sortOrder-b.sortOrder)
    .filter(p=>eventTime(p,pbp.gameType)!==null).map(p=>{
      const id=String(p.details?.eventOwnerTeamId || '');
      if (p.typeDescKey==='goal') {if(id===String(pbp.homeTeam.id))home++;else if(id===String(pbp.awayTeam.id))away++;}
      const state=manpower(p.situationCode);
      const homePenaltySkaters=state ? state.homeSkaters-(state.homeGoalie?0:1) : null;
      const awayPenaltySkaters=state ? state.awaySkaters-(state.awayGoalie?0:1) : null;
      const shorthanded=state?.powerPlay && (id===String(pbp.homeTeam.id)?homePenaltySkaters<awayPenaltySkaters:awayPenaltySkaters<homePenaltySkaters);
      const extraAttacker=Boolean(state?.emptyNet && (id===String(pbp.homeTeam.id)?!state.homeGoalie:!state.awayGoalie));
      const reason=p.details?.reason || '';
      const text=p.typeDescKey==='shot-on-goal'?'Shot on goal':p.typeDescKey==='goal'?
        `${shorthanded?'Shorthanded ':''}Goal${extraAttacker?' (extra attacker)':state?.emptyNet?' (empty net)':''}`:
        p.typeDescKey==='missed-shot' && /hit-.*post/.test(reason)?'Shot hit the post':
        p.typeDescKey==='missed-shot' && reason==='hit-crossbar'?'Shot hit the crossbar':p.typeDescKey;
      return {id:String(p.eventId),sequenceNumber:p.sortOrder,period:{number:p.periodDescriptor.number},clock:{displayValue:p.timeInPeriod},
        homeScore:home,awayScore:away,team:{id},scoringPlay:p.typeDescKey==='goal',
        text,type:{text:p.typeDescKey},extraAttacker:p.typeDescKey==='goal' && extraAttacker};
    });
  const state=manpower(at.situationCode);
  const summary={header:{season:event.season,competitions:[competition]},plays:espnPlays,scoringPlays:espnPlays.filter(p=>p.scoringPlay),winprobability:[],
    onIce:state?competitors.map(c=>{
      const side=c.homeAway,id=c.team.id;
      return {teamId:id,entries:[...Array.from({length:state[side+'Skaters']},(_,i)=>({athleteid:`${id}-${i}`})),
        ...(state[side+'Goalie']?[{athleteid:`${id}-g`}]:[])]};
    }):[],boxscore:{players:competitors.map(c=>({team:c.team,statistics:[{name:'goalies',athletes:[{athlete:{id:`${c.team.id}-g`}}]}]}))}};
  const game=normalizeEvent(event,'NHL');enrichGame(game,summary);
  return {game,competition,summary,stats,elapsed};
}
export function compareCheckpoint(pbp,plays,at=plays.at(-1),completed=false) {
  const input=publicCheckpoint(pbp,plays,at,completed),snapshot={...pbp,plays};
  const old=experimentalNhlRating(core,input.game,input.competition,input.summary,snapshot);
  const experimental=experimentalNhlRating(core,input.game,input.competition,input.summary,snapshot,{nhlAdvancedPressure:true});
  return {...input,old,experimental};
}
export function replayPublicGame(pbp) {
  const plays=canonicalPlays(pbp.plays).plays.sort((a,b)=>a.sortOrder-b.sortOrder);
  const history=[];
  const timed=plays.filter(p=>eventTime(p,pbp.gameType)!==null && p.typeDescKey!=='game-end');
  for (let i=0;i<=timed.length;i++) {
    const completed=i===timed.length;
    const p=completed?timed.at(-1):timed[i];
    const prefix=completed?plays:plays.slice(0,plays.indexOf(p)+1);
    const r=compareCheckpoint(pbp,prefix,p,completed);
    history.push({eventId:p.eventId,period:p.periodDescriptor.number,timeRemaining:p.timeRemaining,elapsed:r.elapsed,
      score:r.stats.score,gap:r.stats.gap,manpower:p.situationCode,
      old:r.old.score,experimental:r.experimental.score,delta:r.experimental.score-r.old.score,
      oldPressure:r.old.live?.components?.pressure || 0,pressure:r.experimental.pressureExperiment?.points ?? null,
      applied:r.experimental.pressureExperiment?.applied || false,
      oldTarget:r.old.live?.sportImpact?.competitiveTarget ?? null,newTarget:r.experimental.live?.sportImpact?.competitiveTarget ?? null,
      oldHistory:r.old.historyOwnership?.combinedPoints ?? r.game.momentumPoints ?? 0,
      newHistory:r.experimental.historyOwnership?.combinedPoints ?? r.game.momentumPoints ?? 0,
      final:completed});
  }
  const peak=key=>Math.max(...history.map(h=>h[key]));
  return {gameId:String(pbp.id),date:pbp.gameDate,matchup:`${pbp.awayTeam.abbrev} at ${pbp.homeTeam.abbrev}`,
    finalScore:`${pbp.awayTeam.score}-${pbp.homeTeam.score}`,checkpoints:history.length,
    oldPeak:peak('old'),experimentalPeak:peak('experimental'),oldFinal:history.at(-1).old,experimentalFinal:history.at(-1).experimental,
    changed:history.filter(h=>h.delta).length,minDelta:Math.min(...history.map(h=>h.delta)),maxDelta:Math.max(...history.map(h=>h.delta)),history};
}

// Controlled arrival/revision scenarios based on a real late-game prefix.
// These are injected perturbations, never claimed as captured live revisions.
export function correctionReplay(pbp) {
  const end=pbp.plays.findIndex(p=>p.periodDescriptor.number===3 && eventTime(p,pbp.gameType)>3450);
  const plays=pbp.plays.slice(0,end+1),at=plays.at(-1);
  const attempt=plays.findLast(p=>['blocked-shot','missed-shot','shot-on-goal'].includes(p.typeDescKey));
  const corrected={...attempt,typeDescKey:attempt.typeDescKey==='blocked-shot'?'missed-shot':'blocked-shot'};
  const other=attempt.details.eventOwnerTeamId===pbp.homeTeam.id?pbp.awayTeam.id:pbp.homeTeam.id;
  const ownerCorrection={...corrected,details:{...corrected.details,eventOwnerTeamId:other}};
  delete ownerCorrection.details.shootingPlayerId;
  const variants=[['delayed',plays.filter(p=>p!==attempt)],['arrived',plays],['duplicate', [...plays,attempt]],
    ['type-corrected',plays.map(p=>p===attempt?corrected:p)],
    ['owner-corrected',plays.map(p=>p===attempt?ownerCorrection:p)],['removed',plays.filter(p=>p!==attempt)]];
  return {gameId:String(pbp.id),eventId:attempt.eventId,kind:'Injected snapshot sequence on historical prefix',
    history:variants.map(([snapshot,events])=>{
      const r=compareCheckpoint(pbp,events,at);
      return {snapshot,old:r.old.score,experimental:r.experimental.score,delta:r.experimental.score-r.old.score,
        pressure:r.experimental.pressureExperiment?.points,fullGame:r.stats.fullGame,
        rollingFiveMinutes:r.stats.rollingFiveMinutes,recentPressure:r.stats.recentPressure};
    })};
}

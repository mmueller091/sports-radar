/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {marketPregame} = typeof module !== 'undefined' && module.exports
    ? require('../shared/pregame.js')
    : root.SportsRadarScoring.shared_pregame;
  const {collegePregame} = typeof module !== 'undefined' && module.exports
    ? require('../shared/college.js')
    : root.SportsRadarScoring.shared_college;
  const {recordFor,rankFor} = typeof module !== 'undefined' && module.exports
    ? require('../shared/records.js')
    : root.SportsRadarScoring.shared_records;
  const {footballGameState,footballLiveCloseness,footballTimeouts,footballCompetitorId,footballSituationFieldPosition,footballMilestone,footballEventShock,footballStagnationImpact} = typeof module !== 'undefined' && module.exports
    ? require('../shared/football.js')
    : root.SportsRadarScoring.shared_football;
  const {clockSeconds} = typeof module !== 'undefined' && module.exports
    ? require('../shared/time.js')
    : root.SportsRadarScoring.shared_time;

  const unit = value => Math.max(0,Math.min(1,value));
  const smooth = value => { const x=unit(value); return x*x*(3-2*x); };

  function cfbMidgameFloor({progress,scoreGap}) {
    if (!Number.isFinite(scoreGap) || progress <= 23/60 || progress >= 11/12) return 0;
    const ramp=smooth((progress-23/60)/(5/60));
    // Add one point over the final two minutes of Q3, then carry the target
    // gently into Q4 until the existing leverage model overtakes it.
    const boundaryLift=smooth((progress-43/60)/(2/60));
    const target=60+44*Math.max(0,Math.min(.75,progress)-.5)+boundaryLift+
      6*Math.max(0,progress-.75);
    const anchors=[[0,1],[3,.955],[7,.85],[10,.72],[14,.62],[21,.30],[28,0]];
    let viability=0;
    for (let i=1;i<anchors.length;i++) if (scoreGap<=anchors[i][0]) {
      const [x,y]=anchors[i-1], [xx,yy]=anchors[i];
      viability=y+(yy-y)*smooth((scoreGap-x)/(xx-x)); break;
    }
    // Carryover is for close games. Smoothly remove it beyond ten points
    // after the accepted 2:00-Q3 calibration point.
    const carryMargin=progress<=43/60 ? 1 : smooth((14-scoreGap)/4);
    return target*ramp*viability*carryMargin;
  }

  function cfbEventShockWeight({text,positioned,i,play}) {
    if (!/touchdown|\btd\b|\bsafety\b/.test(text)) return 1;
    // Consecutive verified score states establish direction without guessing
    // possession, team names in prose, or whether the PAT was already added.
    const previous=positioned[i-1]?.play;
    const scores=p => p && [p.homeScore,p.awayScore].every(v=>v!==null && v!=='' && Number.isFinite(Number(v)))
      ? [Number(p.homeScore),Number(p.awayScore)] : null;
    const before=scores(previous),after=scores(play);
    if (!before || !after) return 0;
    const delta=after.map((v,j)=>v-before[j]);
    if (!((delta[0]>0 && delta[1]===0) || (delta[1]>0 && delta[0]===0))) return 0;
    const oldGap=Math.abs(before[0]-before[1]),gap=Math.abs(after[0]-after[1]);
    if (gap<oldGap) return 1-smooth((gap-8)/13);
    return oldGap===0 && gap<=8 ? .6 : 0;
  }

  function cfbPossession(competition,situation=competition?.situation) {
    const teams = competition?.competitors || [];
    const id = String(situation?.possession?.id || situation?.possession || '');
    const offense = id && teams.find(t => footballCompetitorId(t) === id);
    const defense = teams.find(t => t !== offense);
    if (teams.length !== 2 || !offense || !defense || teams.some(t => t.score == null || t.score === '' || !Number.isFinite(Number(t.score)))) return null;
    const abbr = String(offense.team?.abbreviation || offense.abbreviation || '').toUpperCase();
    const otherAbbr = String(defense.team?.abbreviation || defense.abbreviation || '').toUpperCase();
    const text = `${situation?.possessionText || ''} ${situation?.downDistanceText || situation?.shortDownDistanceText || ''}`.toUpperCase();
    const spot = text.match(/\b([A-Z][A-Z0-9]{1,6})\s+(\d{1,2})\b/);
    let position = footballSituationFieldPosition(situation,abbr);
    // College abbreviations can exceed four letters. Validate the side before
    // interpreting provider text; an unrelated abbreviation is not territory.
    if (spot) position = [abbr,otherAbbr].includes(spot[1]) && Number(spot[2]) <= 50
      ? (spot[1] === abbr ? Number(spot[2]) : 100-Number(spot[2])) : null;
    return {offense,defense,deficit:Number(defense.score)-Number(offense.score),position};
  }

  function cfbClockRunway(competition,situation=competition?.situation) {
    const seconds = clockSeconds(competition?.status);
    const possession = cfbPossession(competition,situation);
    if (Number(competition?.status?.period) !== 4 || seconds === null || seconds < 0 || seconds > 900 || !possession) return null;
    const {offense,defense,deficit,position} = possession;
    const trailing = deficit >= 0 ? offense : defense;
    const timeouts = footballTimeouts(competition,situation,trailing);
    const down = Number(situation?.down);
    let remaining = seconds;
    let offensiveTimeouts = timeouts ?? 0;
    if (deficit < 0) {
      if (timeouts === null || !Number.isInteger(down) || down < 1 || down > 4) return null;
      // Conditional stop, not a guaranteed next possession. NCAA's two-minute
      // timeout began in 2024; do not grant it to historical/unknown seasons.
      const year = Number(competition?.season?.year);
      const warning = year >= 2024 && seconds > 120 ? 1 : 0;
      const stops = timeouts + warning;
      const snaps = 4-down;
      remaining = Math.max(0,seconds-6*snaps-40*Math.max(0,snaps-stops)-8);
      offensiveTimeouts = Math.max(0,timeouts-Math.max(0,snaps-warning));
    }
    // In-bounds first downs stop the college clock in the last two minutes.
    // This is an opportunity estimate, not an assumed scoring drive. Unknown
    // field position budgets a full 75 yards; no text-derived timeout counts.
    const yards = deficit >= 0 ? Math.max(0,100-(position ?? 25)) : 75;
    const driveSeconds = 12 + (remaining <= 120 ? .42 : .60)*yards;
    const usable = remaining + offensiveTimeouts*5;
    // Hurry-up cycles must not extrapolate to seven possessions in a quarter.
    // Pace budget includes the current drive plus a fractional emergency chance.
    const paceBudget = 14*remaining/3600+1.5;
    const expectedPossessions = remaining <= 0 ? 0 : Math.min(paceBudget,
      Math.min(1,usable/driveSeconds) + Math.max(0,usable-driveSeconds)/145);
    return {remaining,timeouts,offensiveTimeouts,expectedPossessions:expectedPossessions*(deficit < 0 ? .78 : 1),driveSeconds};
  }

  // Immediate tension is lower than comeback feasibility in multi-score games.
  // Smoothly taper beyond a field goal; never introduce a possession-count step.
  function cfbImmediateTension(gap,runwayCloseness) {
    return runwayCloseness*(1-.18*smooth((gap-3)/11));
  }

  function cfbMarginCloseness(gap) {
    const anchors = [[0,1],[3,.99],[7,.95],[10,.87],[14,.76],[17,.64],[21,.49],[28,.28],[35,.10],[42,0]];
    for (let i=1;i<anchors.length;i++) {
      if (gap <= anchors[i][0]) {
        const [x,y] = anchors[i-1], [nextX,nextY] = anchors[i];
        return y+(nextY-y)*unit((gap-x)/(nextX-x));
      }
    }
    return 0;
  }

  function cfbLiveCloseness(sport,gap,progress,context=null) {
    if (gap == null || !Number.isFinite(Number(gap)) || Number(gap) < 0) return null;
    gap = Number(gap);
    const state = footballLiveCloseness('CFB',gap,progress,context);
    const competition = context?.competition || context;
    const situation = context?.situation || competition?.situation;
    const possession = cfbPossession(competition,situation);
    const p = unit(Number(progress) || 0);
    const runway = cfbClockRunway(competition,situation);
    const broad = Math.max(0,14*(1-p)+.5+state.possessionAdjustment);
    // A Q3 pace estimate, not the Q4 timeout/runoff simulation. Fade the
    // correction into the unchanged Q4 authority over the final two minutes.
    const q3Weight=smooth((p-.5)/(43/60-.5))*smooth((.75-p)/(2/60));
    const q3Opportunities=Math.max(0,2.1+6*Math.max(0,43/60-p)+.15*state.possessionAdjustment);
    const expectedPossessions = runway?.expectedPossessions ?? broad+(q3Opportunities-broad)*q3Weight;
    // Fractional scoring opportunities avoid an artificial 8-to-9 point cliff
    // while still charging for the conversion needed at an eight-point margin.
    const requiredPossessions = gap > 0 ? Math.max(1,gap/7) : 0;
    const possessionSlack = expectedPossessions-requiredPossessions;
    const comebackFeasibility = gap === 0 ? 1 : expectedPossessions === 0 ? 0 : 1/(1+Math.exp(-2.8*(possessionSlack+.45)));
    const marginClose = cfbMarginCloseness(gap);
    return {...state,requiredPossessions,expectedPossessions,possessionSlack,comebackFeasibility,marginClose,
      possessionState:gap > 0 && possession ? (possession.deficit > 0 ? 'trailing' : 'leading') : '',
      fieldPosition:possession?.deficit > 0 ? possession.position : null,
      close:marginClose*(.20+.80*comebackFeasibility),runway};
  }

  function cfbGameState(args) {
    if (args.gameState !== 'live') return footballGameState(args);
    const state = cfbLiveCloseness('CFB',args.gap,args.progress,args.context);
    if (!state) return {};
    const competition = args.context?.competition || args.context;
    const possession = cfbPossession(competition,args.context?.situation || competition?.situation);
    const seconds = clockSeconds(competition?.status);
    const urgency = Number(competition?.status?.period) === 4 && seconds > 0 ? unit((660-seconds)/540) : 0;
    const direction = possession?.deficit >= 0 ? 1 : possession ? state.comebackFeasibility*.45 : .2;
    const mismatch = Math.max(0,state.requiredPossessions-state.expectedPossessions);
    return {footballState:state,marginClose:state.close,comebackViability:state.comebackFeasibility,
      contextViability:.15+.85*state.comebackFeasibility,
      uncertaintyCeiling:state.comebackFeasibility,
      closeCeiling:14+16*unit(args.progress)+10*urgency*direction,
      widePenalty:args.gap >= 9 ? Math.round(Math.min(30,20*(1-state.comebackFeasibility)*unit(args.progress)+4*mismatch)) : 0,
      limitedRunway:true};
  }

  function cfbOvertime(competition,summary) {
    const period = Number(competition?.status?.period);
    const basic = {active:period > 4,response:false,decisive:false,shootout:false};
    const possession = cfbPossession(competition);
    if (!basic.active || !possession) return basic;
    const {offense,defense,deficit} = possession;
    // Only completed offensive series in THIS extra period establish order.
    // Older OT drives, period number, and pending/current drives do not.
    const completed = (summary?.drives?.previous || []).filter(d =>
      d.isCurrent !== true && d.result && !/end of|kickoff/i.test(d.result) &&
      Number(d.start?.period?.number ?? d.plays?.[0]?.period?.number) === period &&
      d.plays?.some(p => String(p.start?.team?.id || '') === String(d.team?.id || '') &&
        p.start?.team?.id && !/kickoff|timeout|end of/i.test(p.type?.text || p.text || '')));
    const year = Number(summary?.header?.season?.year || competition?.season?.year);
    const explicitTry = competition?.situation?.isTwoPointAttempt === true;
    const shootout = explicitTry && ((year >= 2021 && period >= 7) || (year >= 2019 && year < 2021 && period >= 9));
    const own = completed.filter(d => String(d.team?.id) === footballCompetitorId(offense));
    const other = completed.filter(d => String(d.team?.id) === footballCompetitorId(defense));
    const pendingResponseTry = explicitTry && !shootout && own.length === 1 && other.length === 1 &&
      completed.indexOf(own[0]) > completed.indexOf(other[0]) && /touchdown/i.test(own[0].result);
    const response = other.length === 1 && (own.length === 0 || pendingResponseTry);
    return {...basic,response,shootout,decisive:response && deficit >= 0 && deficit <= (shootout ? 2 : 8)};
  }

  function cfbSituation({game,competition,status,situation,summary}) {
    const current = {...competition,status,situation};
    const possession = cfbPossession(current);
    const result = {points:0,note:'',reasons:[],competitiveFloor:0};
    if (!possession) return result;
    const {offense,defense,deficit,position} = possession;
    const down = Number(situation.down), distance = Number(situation.distance);
    const seconds = clockSeconds(status), period = Number(status.period);
    const overtime = cfbOvertime(current,summary);
    const tryState = situation.isTwoPointAttempt === true;
    const goal = (situation.isGoalToGo === true || /&\s*goal/i.test(situation.downDistanceText || situation.shortDownDistanceText || '')) && position !== null && position >= 90;
    result.note = [offense.team?.abbreviation ? `${offense.team.abbreviation} ball` : '',situation.downDistanceText || situation.shortDownDistanceText,situation.possessionText].filter(Boolean).join(' · ');
    // Early fourth downs and tries are modest; late consequences replace them.
    result.points = tryState ? 2 : down === 4 ? Math.min(3,1+(distance > 0 && distance <= 2 ? 1 : 0)+(position >= 70 ? 1 : 0)) : 0;
    let consequence = 0, viability = 1, urgency = 0;
    const criticalTry = tryState && [1,2].includes(deficit) && period === 4 && seconds !== null && seconds >= 0 && seconds <= 150;
    if (period === 4 && deficit >= 0 && deficit <= 8 && (seconds > 0 || criticalTry)) {
      urgency = criticalTry ? 1 : unit((600-seconds)/480);
      const winningRange = deficit < 3 && position !== null && position >= 60;
      consequence = winningRange ? .84 : .73+.06*unit(((position ?? 25)-25)/55);
      const afterFailure = cfbClockRunway(current,{...situation,possession:footballCompetitorId(defense),down:1});
      const finalFourth = down === 4 && deficit > 0 && (afterFailure ? afterFailure.remaining <= 15 : seconds <= 45);
      if (finalFourth) consequence = Math.max(consequence,.87+.03*(Number.isFinite(distance) && distance > 0 ? unit((10-distance)/9) : 0));
      if (goal) consequence = Math.max(consequence,.91);
      if (criticalTry) consequence = deficit === 1 ? .95 : .92;
      if (game.championshipStakes && (criticalTry || finalFourth || goal)) consequence = Math.min(.98,consequence+.04);
      const ranks = [rankFor(offense,'CFB'),rankFor(defense,'CFB')];
      // Matchup significance scales the decisive interaction's remaining
      // headroom; it is not another permanent ranked-team live award.
      if (ranks.every(Boolean)) consequence = Math.min(.98,consequence+.04*Math.pow((26-Math.max(...ranks))/25,2));
      const yards = Math.max(0,(deficit < 3 ? 65 : 100)-(position ?? 25));
      viability = criticalTry || goal ? 1 : Math.min(1,seconds/(10+.42*yards));
      if (urgency > 0) result.reasons.push(criticalTry ? 'Critical two-point try to tie or win' : finalFourth ? 'Final meaningful fourth down' : goal ? 'Decisive goal-to-go snap' : 'A viable tying or winning possession');
    }
    if (overtime.active && Math.abs(deficit) <= 8 && (deficit >= 0 || tryState)) {
      urgency = 1;
      consequence = overtime.decisive ? (overtime.shootout || tryState ? .97 : .94) : .82;
      // A championship maximum requires observed response rights, not merely OT.
      const championship = game.championshipStakes;
      if (overtime.decisive && championship && (tryState || goal || down === 4)) consequence = 1;
      result.reasons.push(overtime.decisive ? 'Overtime response: this possession can decide the game' : 'College overtime possession; response rights unconfirmed');
    }
    if (urgency > 0) {
      result.points = Math.max(result.points,Math.round(12*urgency*viability));
      if (Number.isFinite(Number(game.baseScore))) result.competitiveFloor = Math.round(Math.max(0,99-Number(game.baseScore))*consequence*urgency*viability);
    }
    return result;
  }

  function cfbUpsetImpact(candidate,teams,gameState,progress,sport,competition) {
    if (gameState !== 'live' || !candidate) return null;
    if (candidate.type !== 'spread' || !Number.isFinite(Number(candidate.value))) return null;
    const index = teams.findIndex(t => String(t.id || t[8] || t.team?.id || '') === candidate.teamId);
    const i = index >= 0 ? index : candidate.teamIndex;
    if (teams.length !== 2 || ![0,1].includes(i)) return {points:0,text:''};
    const margin = Number(teams[i].score ?? teams[i][2])-Number(teams[1-i].score ?? teams[1-i][2]);
    if (!Number.isFinite(margin) || progress < (margin > 0 ? .35 : .7)) return {points:0,text:''};
    const state = cfbLiveCloseness('CFB',Math.abs(margin),progress,competition);
    const x = unit((Number(candidate.value)-7)/23);
    const magnitude = x*x*(3-2*x);
    const competitors = competition?.competitors || [];
    const dog = competitors.find(t => footballCompetitorId(t) === candidate.teamId);
    const favorite = competitors.find(t => t !== dog);
    const favoriteRank = rankFor(favorite,'CFB'), dogRank = rankFor(dog,'CFB');
    const rankThreat = favoriteRank && dog ? ((26-favoriteRank)/25)*unit(((dogRank || 35)-favoriteRank)/20) : 0;
    const possessionWeight = margin < 0 ? (state.possessionState === 'trailing' ? 1 : state.possessionState === 'leading' ? .65 : .8) : 1;
    const fieldWeight = margin < 0 && state.possessionState === 'trailing' && state.fieldPosition !== null
      ? 1+.08*unit((state.fieldPosition-50)/50) : 1;
    const viability = state.comebackFeasibility*Math.exp(-Math.pow(Math.abs(margin)/(margin < 0 ? 8 : 22),1.6))*possessionWeight*fieldWeight*(margin > 0 ? 1.25 : 1);
    // Qualification is unchanged. A qualifying +7 now has half activation,
    // ramping smoothly to full at +10 instead of receiving zero live tension.
    const activation = .5+.5*unit(candidate.activation ?? 1);
    const points = Math.min(36,Math.round((12+16*magnitude+6*rankThreat*unit((progress-.5)/.4))*(.35+.65*unit(progress))*viability*activation));
    return {points,text:points ? `${candidate.teamName}, a ${candidate.description}, ${margin > 0 ? 'leads' : margin === 0 ? 'is tied' : 'remains within reach'} in a viable upset` : ''};
  }

  function cfbPregame(sport,competition,competitors,postseason,factors,reason,detail,options={}) {
    reason = marketPregame(sport,competition,factors,reason,options);
    return collegePregame(sport,competition,competitors,postseason,factors,reason,{
      twoRankedPoints:28,rankedPoints:11,topTenPoints:5,matchup:cfbRankedMatchup
    },options);
  }

  function cfbRankedMatchup({ranks,competitors,postseason,factors,rankingFactors}) {
    if (
      ranks.every(
        rank =>
          rank <= 20
      )
    ) {
      rankingFactors.push({
        label:'Both top 20',
        points:4
      });
    }

    if (
      ranks.some(
        rank =>
          rank <= 10
      )
    ) {
      rankingFactors.push({
        label:'Top 10 team',
        points:5
      });
    }

    const records =
      competitors
        .map(recordFor)
        .map(value =>
          String(value)
            .match(
              /^(\d+)-(\d+)/
            )
        );

    if (
      !postseason &&
      records.every(match =>
        match &&
        Number(match[1]) >
        Number(match[2])
      )
    ) {
      factors.push({
        label:'Both winning records',
        points:3
      });
    }

    if (
      !postseason &&
      records.some(match =>
        match &&
        Number(match[1]) >= 4 &&
        Number(match[2]) === 0
      )
    ) {
      factors.push({
        label:'Unbeaten team',
        points:4
      });
    }
  }

  // Completed rules are deliberately independent of possession/runway/live OT.
  function cfbCompletedUpset(candidate,teams,gameState,progress,sport,competition) {
    if (!candidate || candidate.type !== 'spread' || !Number.isFinite(Number(candidate.value))) return null;
    const competitors = competition?.competitors || [];
    const index = teams.findIndex(t => String(t.id || t[8] || t.team?.id || '') === candidate.teamId);
    const i = index >= 0 ? index : candidate.teamIndex;
    if (teams.length !== 2 || ![0,1].includes(i)) return {points:0,text:''};
    const margin = Number(teams[i].score ?? teams[i][2])-Number(teams[1-i].score ?? teams[1-i][2]);
    if (!Number.isFinite(margin) || margin <= 0) return {points:0,text:''};
    const magnitude = unit((Number(candidate.value)-7)/23);
    const dog = competitors.find(t => footballCompetitorId(t) === candidate.teamId);
    const favorite = dog && competitors.find(t => t !== dog);
    const favoriteRank = rankFor(favorite,'CFB'), dogRank = rankFor(dog,'CFB');
    const rank = favoriteRank ? (26-favoriteRank)/25*unit(((dogRank || 35)-favoriteRank)/20) : 0;
    const significance = 6+16*magnitude+6*rank*(.35+.65*magnitude);
    const quality = unit((28-margin)/25);
    // Extraordinary expectation reversals matter most in close games. The
    // convex magnitude saturates at +30; squared quality leaves blowout result
    // credit unchanged. Verified late pull-aways still use the existing path
    // floor, which consumes this contribution rather than awarding it twice.
    const extraordinary = quality*quality*(20*Math.pow(magnitude,1.5)+3*rank*(.35+.65*magnitude));
    const points = Math.round(significance*(.25+.75*quality)+extraordinary);
    return {points,text:`${candidate.teamName} won outright as a ${candidate.description}; result significance is scaled by competitiveness`};
  }

  function cfbCompletedPath(summary,competition) {
    // Missing clocks must not become fabricated mid-quarter timestamps. Require
    // a consistent scoring ledger ending at the actual final before retention.
    const plays = summary?.scoringPlays?.length ? summary.scoringPlays : (summary?.plays || []).filter(p => p.scoringPlay === true);
    const moments = [];
    let valid = plays.length >= 3;
    let previous = {home:0,away:0,position:0};
    let lastCompetitivePosition = 0, competitiveShare = 0, comeback = 0;
    let homeDeficit = 0, awayDeficit = 0;
    for (const play of plays) {
      const period = Number(play.period?.number ?? play.period);
      const seconds = clockSeconds({displayClock:play.clock?.displayValue,clock:play.clock?.value});
      const home = Number(play.homeScore), away = Number(play.awayScore);
      if (play.homeScore == null || play.awayScore == null || play.homeScore === '' || play.awayScore === '' ||
          !Number.isFinite(home) || !Number.isFinite(away) || !Number.isInteger(period) || period < 1 ||
          seconds === null || seconds < 0 || seconds > 900) {valid=false;continue;}
      const position = Math.min(1,((period-1)*900+900-seconds)/3600);
      const homeGain=home-previous.home, awayGain=away-previous.away;
      if (position < previous.position || homeGain < 0 || awayGain < 0 || homeGain > 8 || awayGain > 8 || (homeGain > 0 && awayGain > 0)) valid=false;
      if (Math.abs(previous.home-previous.away) <= 8) {
        competitiveShare += Math.max(0,position-previous.position);
        lastCompetitivePosition = position;
      }
      const margin = home-away;
      homeDeficit = Math.max(homeDeficit,-margin);
      awayDeficit = Math.max(awayDeficit,margin);
      if (margin >= 0) comeback = Math.max(comeback,homeDeficit);
      if (margin <= 0) comeback = Math.max(comeback,awayDeficit);
      previous = {home,away,position};
      moments.push(previous);
    }
    const home = competition?.competitors?.find(t => t.homeAway === 'home');
    const away = competition?.competitors?.find(t => t.homeAway === 'away');
    if (!home || !away || home.score == null || away.score == null || Number(home.score)!==previous.home || Number(away.score)!==previous.away) valid=false;
    if (Math.abs(previous.home-previous.away) <= 8) {
      competitiveShare += 1-previous.position;
      lastCompetitivePosition=1;
    }
    return {valid,lastCompetitivePosition,competitiveShare:unit(competitiveShare),comeback,moments};
  }

  function cfbCompletedHistory(summary,history,{game,finishPoints=0}) {
    if (!game || game.sport !== 'CFB' || game.state !== 'completed') return history;
    const competition = game.sourceCompetition || summary?.header?.competitions?.[0];
    const scores = (competition?.competitors || []).map(t => t.score == null || t.score === '' ? NaN : Number(t.score));
    if (scores.length !== 2 || !scores.every(Number.isFinite)) return history;
    const gap = Math.abs(scores[0]-scores[1]);
    const path = cfbCompletedPath(summary,competition);
    const status = competition?.status || {};
    const detail = `${status.type?.detail || ''} ${status.type?.shortDetail || ''}`;
    const depthText = detail.match(/\b(\d+)\s*OT\b/i);
    const period = Number(status.period);
    const depth = Number.isInteger(period) && period > 4 ? period-4 : depthText ? Number(depthText[1]) : /\bot\b|overtime/i.test(detail) ? 1 : 0;
    const year = Number(game.sourceEvent?.season?.year || summary?.header?.season?.year);
    const shootoutStart = year >= 2021 ? 7 : year >= 2019 ? 9 : Infinity;
    const tries = new Set((summary?.plays || []).filter(p => Number(p.period?.number ?? p.period) >= shootoutStart &&
      /two[ -]point|2[ -]point/i.test(`${p.type?.text || ''} ${p.text || ''}`)).map(p => p.id || JSON.stringify(p)));
    const shootout = depth >= shootoutStart-4 && tries.size >= 2;
    const stagnation = history.factors.filter(f => f.label === 'Offensive stagnation').reduce((sum,f)=>sum+f.points,0);
    const positiveHistory = history.points-stagnation;
    const existing = Number(game.score)+history.points+finishPoints;
    if (!Number.isFinite(existing)) return history;
    const adjustments = [];
    let total = existing;
    // Existing generic OT, histories, upset and finishing awards all consume
    // this floor. No per-OT addition; successive targets approach 96.
    if (depth > 0 && gap <= 8) {
      const stakes = game.factors.filter(f => /stakes|consequence|advancement|elimination/i.test(f.label)).reduce((sum,f)=>sum+Math.max(0,f.points),0);
      const overlap = Math.max(0,stakes-8);
      if (overlap) {adjustments.push({label:'Completed OT correlated stakes cap',points:-overlap});total-=overlap;}
      const target = Math.min(99,78+18*(1-Math.exp(-.85*(depth-1)))+(shootout?2:0)+Math.min(8,stakes*.5))+stagnation;
      const delta = Math.max(0,Math.round(target-total));
      if (delta) {adjustments.push({label:`Completed ${depth}OT${shootout?' conversion shootout':''} depth retention`,points:delta});total+=delta;}
    }
    // A late window is mandatory: neither an early comeback nor WP sample
    // order alone can rescue a full-half blowout. History informs a floor,
    // rather than earning a second comeback/lead-change award.
    if (path.valid && path.lastCompetitivePosition >= .75) {
      const late = unit((path.lastCompetitivePosition-.75)/.20);
      const evidence = unit(positiveHistory/25);
      const magnitude = unit(path.comeback/21);
      const marginWeight = 1-unit((gap-21)/21);
      let target = 0;
      if (gap > 8 && path.competitiveShare >= .35) target = (35+30*late+12*magnitude+8*evidence)*marginWeight;
      if (gap <= 8 && path.comeback >= 14) target = 65+18*magnitude+5*evidence;
      target += stagnation;
      const delta = Math.max(0,Math.round(target-total));
      if (delta) {adjustments.push({label:'Completed competitive path retention',points:delta});total+=delta;}
    }
    // Completed stakes are already present. Cap their contribution when the
    // verified path offers no late contest, including ranked upset blowouts.
    if (gap >= 21 && path.valid && path.lastCompetitivePosition < .75) {
      const stakes = game.factors.filter(f => /stakes|consequence|advancement|elimination/i.test(f.label)).reduce((sum,f)=>sum+Math.max(0,f.points),0);
      const reduction = Math.min(Math.max(0,stakes-5),Math.max(0,total-1));
      if (reduction) {adjustments.push({label:'Completed stakes limited by noncompetitive path',points:-reduction});total-=reduction;}
    }
    // Clamping a negative final-margin base must not erase even the small,
    // competitiveness-gated result contribution. This cannot create a classic.
    const resultFloor = 1+(Number(game.upsetPoints)||0)+stagnation;
    if (resultFloor > total) adjustments.push({label:'Completed upset result retention',points:Math.round(resultFloor-total)});
    return adjustments.length ? {points:history.points+adjustments.reduce((sum,f)=>sum+f.points,0),
      text:[history.text,...adjustments.map(f=>f.label)].filter(Boolean).join('; '),factors:[...history.factors,...adjustments]} : history;
  }

  const cfbModel = {
    pregame:cfbPregame,
    // Scoreboards usually put season metadata on the event, not competition.
    // Preserve it through the core's existing live context without mutating feeds.
    prepareCompetition:(competition,event) => ({...competition,season:competition?.season || event?.season}),
    gameState:cfbGameState,
    liveFloor:cfbMidgameFloor,
    liveCloseness:cfbLiveCloseness,
    upset:(...args) => args[2] === 'completed' ? cfbCompletedUpset(...args) : cfbUpsetImpact(...args),
    completedHistory:cfbCompletedHistory,
    decisiveStakes:detail => /\b(?:college football playoff|cfp)\b(?!\s+(?:race|berth|spot|picture|contention|hunt|rematch))|\b(?:national|conference) championship\b(?!\s+rematch)/i.test(detail),
    decisiveFloor:true,
    situation:cfbSituation,
    milestone:footballMilestone,
    eventShock:footballEventShock,
    eventShockWeight:cfbEventShockWeight,
    history:{threshold:10,units:'points',stagnation:footballStagnationImpact}
  };

  const api = {cfbImmediateTension,cfbPregame,cfbRankedMatchup,cfbModel,cfbClockRunway,cfbOvertime,cfbLiveCloseness,cfbMarginCloseness};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).sports_cfb = api;
  }
})(globalThis);

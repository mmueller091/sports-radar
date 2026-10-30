/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {proPregame} = typeof module !== 'undefined' && module.exports
    ? require('../shared/pregame.js')
    : root.SportsRadarScoring.shared_pregame;

  const {clockSeconds,normalizedTime} = typeof module !== 'undefined' && module.exports
    ? require('../shared/time.js') : root.SportsRadarScoring.shared_time;
  const {eventSignalText,isPostseasonGame,playoffSeriesLeverage} = typeof module !== 'undefined' && module.exports
    ? require('../shared/context.js') : root.SportsRadarScoring.shared_context;
  const {upsetImpact} = typeof module !== 'undefined' && module.exports
    ? require('../shared/upset.js') : root.SportsRadarScoring.shared_upset;

  function nhlLiveMarginCloseness(gap,progress=0,situation={}) {
    if (
      gap === null ||
      !Number.isFinite(Number(gap))
    ) {
      return 0;
    }

    const goals =
      Math.max(
        0,
        Number(gap)
      );

    if (goals <= 1) return 1 - .1 * goals;
    const p = Math.max(0,Math.min(1,Number(progress) || 0));
    // Continuous deficit/runway decay. Manpower buys limited runway, not a
    // separate closeness bonus; even six-on-four cannot rescue a dead game.
    const extra = Math.min(.45,(situation.trailingGoaliePulled ? .22 : 0) +
      (situation.trailingPowerPlay ? .23 : 0));
    // Preserve meaningful third-period runway at exactly two goals without
    // lifting larger deficits. Both the time activation and margin taper are
    // continuous, so this does not restore the former two/three-goal cliff.
    const third = Math.max(0,Math.min(1,(p-.67)/.1));
    const thirdRamp = third*third*(3-2*third);
    const secondsRemaining = Math.max(0,(1-p)*3600);
    const twoGoalRunway = 1.6*(1-Math.exp(-Math.pow(secondsRemaining/500,1.8))) *
      Math.exp(-Math.pow(Math.max(0,goals-2)/.32,2)) * thirdRamp;
    const runway = 2.1 - 1.85 * p + extra + twoGoalRunway;
    return .9 * Math.exp(-Math.pow(goals - 1,1.35) / runway);
  }

  function smoothNhlTarget(seconds,anchors) {
    const s=Math.max(0,Math.min(1200,Number(seconds) || 0));
    for(let i=1;i<anchors.length;i++) {
      const high=anchors[i-1],low=anchors[i];
      if(s<=high[0] && s>=low[0]) {
        const x=(high[0]-s)/(high[0]-low[0]);
        const eased=x*x*(3-2*x);
        return high[1]+(low[1]-high[1])*eased;
      }
    }
    return s>anchors[0][0] ? anchors[0][1] : anchors.at(-1)[1];
  }

  function hockeyOnIceState(
    summary,
    teams
  ) {
    const onIce =
      summary?.onIce || [];

    const blocks =
      summary?.boxscore?.players ||
      [];

    if (
      onIce.length !== 2
    ) {
      return null;
    }

    const goalieIds =
      new Map(
        blocks.map(block => [
          String(
            block.team?.id ||
            ''
          ),

          new Set(
            (block.statistics || [])
              .filter(group =>
                /goalie/i.test(
                  group.name ||
                  group.displayName ||
                  ''
                )
              )
              .flatMap(group =>
                (group.athletes || [])
                  .map(entry =>
                    String(
                      entry.athleteid ||
                      entry.athleteId ||
                      entry.athlete?.id ||
                      ''
                    )
                  )
              )
          )
        ])
      );

    const sides =
      onIce.map(side => {
        const id =
          String(
            side.teamId ||
            side.team?.id ||
            ''
          );

        const entries =
          side.entries || [];

        const goalies =
          goalieIds.get(id) ||
          new Set();

        const hasGoalie =
          entries.some(entry =>
            goalies.has(
              String(
                entry.athleteid ||
                entry.athleteId ||
                entry.athlete?.id ||
                ''
              )
            )
          );

        return {
          id,
          count:
            entries.length,
          hasGoalie,
          goalieKnown:goalies.size > 0,
          skaters:entries.length - (hasGoalie ? 1 : 0),
          name:
            teams.find(team =>
              String(
                team[8] || ''
              ) === id
            )?.[0] ||
            'A team'
        };
      });

    let powerPlayTeam = null;
    let powerPlayTeamId = null;
    let powerPlayAdvantage = 0;
    let pulledGoalieTeam = null;
    let pulledGoalieTeamId = null;

    if (sides.every(side => side.goalieKnown && side.count >= 4)) {
      const high = sides[0].skaters > sides[1].skaters ? sides[0] : sides[1];
      const low = high === sides[0] ? sides[1] : sides[0];
      // Removing a goalie alone is not a penalty advantage.
      powerPlayAdvantage = Math.max(0,high.skaters-low.skaters-(high.hasGoalie ? 0 : 1));
      if (powerPlayAdvantage) {
        powerPlayTeam = high.name;
        powerPlayTeamId = high.id;
      }
    }

    const noGoalie =
      sides.find(side =>
        side.goalieKnown && !side.hasGoalie &&
        side.count >= 5
      );

    const withGoalie =
      sides.find(side =>
        side.hasGoalie
      );

    if (
      noGoalie &&
      withGoalie
    ) {
      pulledGoalieTeam =
        noGoalie.name;
      pulledGoalieTeamId = noGoalie.id;
    }

    return {
      sides,
      powerPlayTeam,
      powerPlayTeamId,
      powerPlayAdvantage,
      pulledGoalieTeam,
      pulledGoalieTeamId
    };
  }

  function hockeyPowerPlay(
    summary,
    teams
  ) {
    const state =
      hockeyOnIceState(
        summary,
        teams
      );

    return (
      state?.powerPlayTeam ||
      null
    );
  }

  function hockeyOvertime(event,competition,summary,context='',normalized=false) {
    const status = competition?.status || {};
    const detail = `${status.type?.detail || ''} ${status.type?.shortDetail || ''}`;
    const signal = eventSignalText(event,competition,context) + ' ' + eventSignalText(summary?.header,competition,'');
    const postseason = isPostseasonGame('NHL',event,competition,signal) ||
      Number(summary?.header?.season?.type?.id ?? summary?.header?.season?.type) === 3;
    let shootout = /shootout|\bSO\b/i.test(detail) || (!postseason && Number(status.period) >= 5);
    let depth = shootout ? 0 : Math.max(0,Number(status.period || 0)-3,
      Number(detail.match(/(\d+)\s*OT\b/i)?.[1] || (/overtime|\bOT\b/i.test(detail) ? 1 : 0)));
    const leverage = playoffSeriesLeverage('NHL',competition,signal);
    const deciding = /game\s*7|deciding|winner.take.all/i.test(signal) || /deciding/i.test(leverage?.label || '');
    const result={shootout,depth,postseason,deciding,final:/stanley cup final/i.test(signal)};
    if (!normalized) return result;
    const seasonTypes=[event?.season,competition?.season,summary?.header?.season]
      .map(season=>Number(season?.type?.id ?? season?.type)).filter(type=>[2,3].includes(type));
    const conflict=new Set(seasonTypes).size>1;
    const resolvedPostseason=!conflict && (seasonTypes.length ? seasonTypes[0]===3 : postseason);
    const formatKnown=!conflict && (resolvedPostseason || seasonTypes.length>0);
    const regulation=Number(competition?.format?.regulation?.periods) || 3;
    const period=Number(status.period?.number ?? status.period);
    const structured=Number.isInteger(period) && period>0;
    // Remove entire clocks before reading standalone OT tokens. In particular,
    // joining "OT 2:28" twice must never turn the trailing 28 into 28OT.
    const tokens=detail.replace(/\b\d+:\d+(?:\.\d+)?\b/g,' ');
    const counts=[...tokens.matchAll(/\b(\d+)\s*OT\b/gi)].map(m=>Number(m[1]));
    const labelShootout=/shootout|\bSO\b/i.test(tokens);
    const labelDepth=counts.length ? (new Set(counts).size===1 ? counts[0] : null)
      : /\bovertime\b|\bOT\b/i.test(tokens) ? 1 : null;
    const issues=conflict ? ['Conflicting season metadata; overtime format unknown'] : [];
    shootout=false;depth=null;
    let source='unknown';
    if (structured) {
      source='structured-period';
      if (period<=regulation) depth=0;
      else if (resolvedPostseason || period===regulation+1) depth=period-regulation;
      else if (formatKnown && !resolvedPostseason && period===regulation+2) {shootout=true;depth=0;}
      else issues.push('Overtime format/depth unresolved');
      if ((labelDepth!==null && labelDepth!==depth) || (labelShootout && !shootout))
        issues.push('Label conflicts with structured period/format');
    } else if (labelShootout && !resolvedPostseason) {shootout=true;depth=0;source='label';}
    else if (labelDepth>0 && !(formatKnown && !resolvedPostseason && labelDepth>1)) {depth=labelDepth;source='label';}
    else if (/\b[123](?:st|nd|rd)\b|\bregulation\b/i.test(tokens)) {depth=0;source='label';}
    if (depth===null) issues.push('No reliable overtime count');
    return {...result,postseason:resolvedPostseason,shootout,depth,source,formatKnown,regulation,period:structured?period:null,issues};
  }

  // One opt-in NHL resolver for regulation/OT clock conventions and depth.
  // normalizedTime parses the clock; NHL supplies its own OT period length.
  function hockeyLiveTiming(event,competition,summary) {
    const ot=hockeyOvertime(event,competition,summary,'',true),status=competition?.status || {};
    const raw=normalizedTime('NHL',{status:{...status,period:1,clockMode:'remaining'}}).remainingSeconds;
    const length=ot.shootout ? null : ot.depth>0 ? (ot.formatKnown ? (ot.postseason?1200:300) : null)
      : ot.period && ot.period<=ot.regulation ? 1200 : null;
    const valid=raw!==null && length!==null && raw>=0 && raw<=length;
    const seconds=valid ? (status.clockMode==='elapsed' ? length-raw : raw) : null;
    const elapsed=seconds===null ? null : ot.depth>0 ? ot.regulation*1200+(ot.depth-1)*length+length-seconds
      : (ot.period-1)*1200+length-seconds;
    return {...ot,seconds,elapsed,periodLength:length,clockMode:status.clockMode || 'remaining',
      issues:[...ot.issues,...(raw!==null && !valid && !ot.shootout ? ['Clock/period length unresolved or out of range'] : [])]};
  }

  function hockeySituationImpact(game,competition,summary,status,progress,scoreGap,allocation=null) {
    const state = summary ? hockeyOnIceState(summary,game.teams) : null;
    const scores = game.teams.map(team => Number(team[2]));
    const trailing = scores.length === 2 && scores.every(Number.isFinite) && scores[0] !== scores[1]
      ? String(game.teams[scores[0] < scores[1] ? 0 : 1][8] || '') : '';
    const pulled = Boolean(trailing && state?.pulledGoalieTeamId === trailing);
    const powerPlay = Boolean(trailing && state?.powerPlayTeamId === trailing);
    const advantage = powerPlay || scoreGap === 0 ? state?.powerPlayAdvantage || 0 : 0;
    const timing=allocation ? hockeyLiveTiming(game.sourceEvent,{...competition,status},summary) : null;
    const seconds = timing ? timing.seconds : clockSeconds(status);
    const late = (timing ? timing.period : Number(status?.period)) === 3 && seconds !== null;
    const ot = timing || hockeyOvertime(game.sourceEvent,{...competition,status},summary);
    let target = 0;
    let note = '';
    if (ot.shootout) { target=90; note='Shootout'; }
    else if (ot.depth && scoreGap === 0) {
      target = ot.postseason ? Math.min(98,95 + 2 * (ot.depth-1))
        : Math.round(smoothNhlTarget(seconds ?? 300,allocation ? [[300,88],[0,90]] : [[300,92],[0,94]]));
      if (ot.postseason && ot.deciding) target=Math.max(target,96);
      if (ot.postseason && ot.final) target=Math.max(target,95);
      if (ot.postseason && ot.final && ot.deciding) target=99;
      note=ot.postseason ? `Playoff sudden-death ${ot.depth > 1 ? ot.depth : ''}OT` : '3-on-3 overtime';
    } else if (late && scoreGap <= 1) {
      if (scoreGap === 0) target=smoothNhlTarget(seconds,allocation ? [
        [1200,52],[720,62],[600,68],[300,78],[120,83],[60,85],[0,87]
      ] : [[1200,52],[720,58],[600,65],[300,77],[120,84],[60,88],[0,90]]);
      else if (allocation) target=smoothNhlTarget(seconds,[
        [1200,52],[720,60],[600,64],[300,72],[120,78],[60,80],[0,82]
      ]);
      else if (seconds <= 60) target=78;
      else if (seconds <= 120) target=74;
      else if (seconds <= 300) target=69;
      if (!allocation) target=Math.round(target);
      // Ramp existing manpower targets from the period start rather than add
      // a new bonus at an arbitrary clock boundary. End targets are unchanged.
      const reach=(limit,value)=>allocation ? target+(Math.max(target,value)-target)*
        smoothNhlTarget(seconds,[[1200,0],[limit,1],[0,1]]) : seconds<=limit ? Math.max(target,value) : target;
      if (powerPlay) target=reach(300,scoreGap===0?84:82);
      if (advantage>=2) target=reach(180,89);
      if (pulled) target=reach(180,powerPlay?91:85);
      note = pulled ? (powerPlay ? 'Pulled the goalie with a power play' : 'Pulled the goalie')
        : advantage >= 2 ? 'Two-skater advantage' : powerPlay ? 'Trailing-team power play' : '';
    } else if (late && scoreGap === 2 && (allocation || seconds <= 180) && (pulled || powerPlay)) {
      target = (pulled && powerPlay ? 55 : 46)*(allocation ? smoothNhlTarget(seconds,[[1200,0],[180,1],[0,1]]) : 1);
      note='Two-goal comeback with extra manpower';
    }
    if (target && !ot.depth && !ot.shootout) {
      if (ot.postseason) target=Math.min(96,target+(ot.final ? 5 : 2));
      target=Math.min(96,target+Math.round(hockeyPressure(summary,progress,scoreGap,competition,allocation).points/2));
    }
    if (!note && state?.powerPlayTeam) note=`${state.powerPlayTeam} power play`;
    if (!note && state?.pulledGoalieTeam) note=`${state.pulledGoalieTeam} pulled the goalie`;
    const viability=nhlLiveMarginCloseness(scoreGap,progress,{trailingGoaliePulled:pulled,trailingPowerPlay:powerPlay});
    const points=Math.round((powerPlay ? 5 : pulled ? 3 : state?.powerPlayTeam ? (scoreGap === 0 ? 4 : 1) : 0)*viability);
    const base=Number(game.baseScore);
    // Preserve only already-earned non-stakes context. Postseason is owned by
    // the target; subtracting carried stakes here would pay it a second time.
    const floorBase=base-(allocation?.context || 0);
    return {points,note,reasons:note ? [note] : [],
      competitiveFloor:Number.isFinite(base) && target ? Math.max(0,target-floorBase) : 0,
      competitiveTarget:target,manpower:{pulled,powerPlay,advantage},overtime:ot,
      ...(allocation ? {allocation:{context:allocation.context || 0,floorBase,timing}} : {})};
  }

  function hockeyGoalMilestone(summary) {
    for (
      const block of
      summary?.boxscore?.players ||
      []
    ) {
      for (
        const group of
        block.statistics ||
        []
      ) {
        if (
          /goalie/i.test(
            group.name ||
            group.displayName ||
            ''
          )
        ) {
          continue;
        }

        const goals =
          (group.labels || [])
            .indexOf('G');

        if (
          goals < 0
        ) {
          continue;
        }

        const scorer =
          (group.athletes || [])
            .filter(entry =>
              Number(
                entry.stats?.[goals]
              ) >= 2
            )
            .sort(
              (a,b) =>
                Number(
                  b.stats[goals]
                ) -
                Number(
                  a.stats[goals]
                )
            )[0];

        if (scorer) {
          const count =
            Number(
              scorer.stats[goals]
            );

          const name =
            scorer.athlete?.displayName ||
            'A player';

          return {
            scorerName:name,
            text:
              count >= 3
                ? `${name} has a hat trick (${count} goals)`
                : `${name} has 2 goals and is one away from a hat trick`,
            points:
              count >= 3
                ? 6
                : 3
          };
        }
      }
    }

    return null;
  }

  function hockeyGameState({gameState,gap,progress,context}) {
    const teams = context?.teams?.[0]?.[0] ? context.teams :
      (context?.competition?.competitors || []).map(item => [item.team?.displayName || '', '', item.score, '', '', '', null, '', String(item.team?.id || '')]);
    const state = context?.summary ? hockeyOnIceState(context.summary,teams) : null;
    const scores = teams.map(team => Number(team[2]));
    const trailing = scores.length === 2 && scores[0] !== scores[1]
      ? String(teams[scores[0] < scores[1] ? 0 : 1][8] || '') : '';
    const marginClose=nhlLiveMarginCloseness(gap,progress,{
      trailingGoaliePulled:Boolean(trailing && state?.pulledGoalieTeamId === trailing),
      trailingPowerPlay:Boolean(trailing && state?.powerPlayTeamId === trailing)
    });
    const seconds=context?.nhlAllocation ? hockeyLiveTiming(null,context.competition,context.summary).seconds
      : clockSeconds(context?.competition?.status);
    const finalMinute=Number(context?.competition?.status?.period) === 3 && seconds !== null
      ? Math.max(0,Math.min(1,(120-seconds)/60)) : 0;
    const twoGoalWeight=Math.exp(-Math.pow((Number(gap)-2)/.32,2));
    const lateTwoGoalPenalty=Math.round(3*finalMinute*finalMinute*(3-2*finalMinute)*twoGoalWeight);
    return gameState === 'live' ? {marginClose,minimumComebackViability:gap === 1 ? .82 : 0,
      // Avoid the generic integer-margin penalty reintroducing a cliff at 3.
      widePenalty:gap == null || !Number.isFinite(gap) ? 0 :
        Math.round(20*progress*(1-marginClose)*Math.min(1,Math.max(0,gap-1)/4))+lateTwoGoalPenalty}
      : {};
  }

  function hockeyLiveMilestone(summary,{scoreGap,progress,status}) {
    const milestone=hockeyGoalMilestone(summary);
    if (!milestone) return {points:0,text:''};
    let points=milestone.points * nhlLiveMarginCloseness(scoreGap,progress);
    if (milestone.points === 6) {
      // A completed hat trick is an event, not a permanent live surcharge.
      const goals=(summary.scoringPlays?.length ? summary.scoringPlays : (summary.plays || []).filter(p=>p.scoringPlay))
        .filter(p=>String(p.text || '').toLowerCase().includes(milestone.scorerName.toLowerCase()));
      const latest=goals.at(-1);
      const postseason=hockeyOvertime(null,{status},summary).postseason;
      const now=hockeyElapsed(status,postseason);
      const then=hockeyElapsed({period:latest?.period?.number,displayClock:latest?.clock?.displayValue,clockMode:hockeyPlayClockMode(summary)},postseason);
      const age=now !== null && then !== null ? now-then : NaN;
      points*=Number.isFinite(age) ? Math.max(0,1-age/180) : .5;
    }
    return {...milestone,points:Math.round(points)};
  }

  function hockeyUpset(candidate,teams,state,progress,sport,competition) {
    const impact=upsetImpact(candidate,teams,state,progress,sport,competition);
    if (!impact.points) return impact;
    // +180 is modest; +250 stronger, +300 major, extreme prices approach 22.
    const value=Number(candidate.value) || 180;
    const magnitude=Math.min(22,4+18*(1-Math.exp(-Math.max(0,value-180)/210)));
    const oldMaximum=Math.min(22,18+Math.round(4*candidate.strength));
    return {...impact,points:Math.round(impact.points*magnitude/oldMaximum)};
  }

  // Physical elapsed time is local to NHL scoring. Display/timeline geometry
  // remains unchanged; regulation and playoff periods are twenty minutes.
  function hockeyElapsed(status,postseason=true) {
    const period=Number(status?.period?.number ?? status?.period);
    // Parse the raw clock once; the generic parser uses NBA period lengths
    // when given clockMode=elapsed, so NHL applies that mode locally below.
    const seconds=clockSeconds({...status,clockMode:undefined});
    if (!(period > 0) || seconds === null) return null;
    const length=period <= 3 || postseason ? 1200 : 300;
    const elapsed=status.clockMode === 'elapsed' ? seconds : length-seconds;
    return (period<=3 ? (period-1)*1200 : 3600+(period-4)*length)+elapsed;
  }

  function hockeyPlayClockMode(summary) {
    // Archived NHL play clocks count UP, unlike scoreboard clocks. Infer this
    // only from provider sequence numbers or an increasing goal ledger; never
    // assume arbitrary recent-record ordering is chronological.
    const plays=summary?.plays || [];
    const sequenced=plays.length>1 && plays.every(p=>p.sequenceNumber != null && Number.isFinite(Number(p.sequenceNumber)));
    const ordered=sequenced ? [...plays].sort((a,b)=>Number(a.sequenceNumber)-Number(b.sequenceNumber))
      : summary?.scoringPlays?.length ? summary.scoringPlays : plays.filter(p=>p.scoringPlay);
    let up=0,down=0;
    for(let i=1;i<ordered.length;i++) {
      const a=ordered[i-1],b=ordered[i];
      if(Number(a.period?.number || a.period)!==Number(b.period?.number || b.period)) continue;
      if(!sequenced && !(Number(b.homeScore)>=Number(a.homeScore) && Number(b.awayScore)>=Number(a.awayScore))) continue;
      const first=clockSeconds({displayClock:a.clock?.displayValue,clock:a.clock?.value});
      const second=clockSeconds({displayClock:b.clock?.displayValue,clock:b.clock?.value});
      if(first===null || second===null) continue;
      if(second>first) up++; else if(second<first) down++;
    }
    return up>down ? 'elapsed' : 'remaining';
  }

  function hockeyPressure(summary,progress,gap,competition,allocation=null) {
    if (!summary || gap > 2) return {points:0,reasons:[]};
    const timing=allocation ? hockeyLiveTiming(null,competition,summary) : null;
    const postseason=timing ? timing.postseason : hockeyOvertime(null,competition,summary).postseason;
    const now=timing ? timing.elapsed : hockeyElapsed(competition?.status || summary.header?.competitions?.[0]?.status,postseason);
    const plays=summary.plays || [];
    const clockMode=hockeyPlayClockMode(summary);
    const timed=plays.map(play => ({play,time:hockeyElapsed({period:play.period?.number || play.period,displayClock:play.clock?.displayValue,clock:play.clock?.value,clockMode},postseason)}));
    const hasTime=now !== null && timed.some(item => item.time !== null);
    const recent=hasTime ? timed.filter(item => item.time !== null && now-item.time >= 0 && now-item.time <= 90).map(item=>item.play) : plays.slice(-18);
    const dangerous=recent.filter(play => !play.scoringPlay && /shot on goal|saved by|\bsave\b|breakaway|penalty shot|hit (?:the )?(?:post|crossbar)|off (?:the )?(?:post|crossbar)|big chance|close range|point-blank/i.test(play.text || play.shortText || play.type?.text || ''));
    const competitors=competition?.competitors || summary.header?.competitions?.[0]?.competitors || [];
    const trailing=competitors.length === 2 && Number(competitors[0].score) !== Number(competitors[1].score)
      ? String(competitors[Number(competitors[0].score)<Number(competitors[1].score) ? 0 : 1].team?.id || '') : '';
    let trailingCount=0,leadingCount=0,premium=0;
    for (const play of dangerous) {
      const text=play.text || play.shortText || play.type?.text || '';
      let id=String(play.team?.id || play.teamId || '');
      // Standalone save records identify the defending team, not the shooter.
      if (/^(?:save\b|.* makes (?:a )?save)/i.test(text) && !/shot|breakaway|saved by/i.test(text)) {
        id=String(competitors.find(c => String(c.team?.id) !== id)?.team?.id || '');
      }
      if (trailing && id) { if (id === trailing) trailingCount++; else leadingCount++; }
      if (/breakaway|penalty shot|post|crossbar|point-blank|big chance/i.test(text)) premium++;
    }
    const known=trailingCount+leadingCount;
    const direction=known ? .45+1.1*trailingCount/known : 1;
    const activity=Math.min(7,dangerous.length*.8+Math.min(3,premium*1.2));
    const leverage=(.3+.7*progress)*nhlLiveMarginCloseness(gap,progress);
    const points=Math.min(7,Math.round(activity*direction*leverage));
    return {points,reasons:points ? [`${dangerous.length} dangerous chances ${hasTime ? 'in the last 90 seconds' : 'in recent records'}${trailingCount > leadingCount ? ', led by the trailing team' : ''}`] : []};
  }

  function hockeyCompletedResult(sport,state,teams,event,competition,context) {
    if (state !== 'completed') return null;
    const ot=hockeyOvertime(event,competition,null,context);
    const points=ot.shootout ? 9 : ot.depth ? (ot.postseason ? Math.min(28,18+4*(ot.depth-1)) : 13) : 0;
    return points ? {label:ot.shootout ? 'Shootout finish' : `${ot.postseason ? 'Playoff sudden-death' : 'Overtime'} winner${ot.depth>1 ? ` (${ot.depth}OT)` : ''}`,points} : null;
  }

  function hockeyCompletedHistory(summary,history,{game,finishPoints=0}={}) {
    const ot=hockeyOvertime(game?.sourceEvent,game?.sourceCompetition,summary);
    if (!ot.shootout && !ot.depth) return history;
    const floor=ot.shootout ? 61 : ot.postseason
      ? [0,78,85,90,93][Math.min(4,ot.depth)]
      : 63;
    const existing=Number(game?.score)+history.points+Number(finishPoints || 0);
    const delta=Number.isFinite(existing) ? Math.max(0,Math.round(floor-existing)) : 0;
    if (!delta) return history;
    const factor={label:`Completed ${ot.shootout ? 'shootout' : ot.postseason ? `${ot.depth}OT playoff` : 'overtime'} floor`,points:delta};
    return {points:history.points+delta,text:[history.text,factor.label].filter(Boolean).join('; '),
      factors:[...history.factors,factor],handlesFinish:history.handlesFinish};
  }

  function hockeyHistory(summary,progress,state,options={}) {
    if (state === 'upcoming') return {points:0,text:'',factors:[]};
    const comp=summary?.header?.competitions?.[0] || {};
    const allocation=state==='live' ? options.nhlAllocation : null;
    const ot=allocation?.timing || (allocation ? hockeyLiveTiming(null,comp,summary) : hockeyOvertime(null,comp,summary));
    const current=state === 'completed' ? Math.max(3600,hockeyElapsed(comp.status,ot.postseason) || 0)
      : (allocation ? ot.elapsed : hockeyElapsed(comp.status,ot.postseason)) ?? progress*3600;
    const plays=(summary?.scoringPlays?.length ? summary.scoringPlays : (summary?.plays || []).filter(p=>p.scoringPlay)) || [];
    const clockMode=hockeyPlayClockMode(summary);
    const moments=plays.filter(p=>p.homeScore != null && p.awayScore != null && !(ot.shootout && Number(p.period?.number || p.period)>4))
      .map(p=>({home:Number(p.homeScore),away:Number(p.awayScore),time:hockeyElapsed({period:p.period?.number || p.period,displayClock:p.clock?.displayValue,clock:p.clock?.value,clockMode},ot.postseason),text:p.text || '',extraAttacker:p.extraAttacker===true || p.goaliePulled===true}))
      // Final summaries often omit period/clock. Their recorded OT winner must
      // still be included; only a live summary is bounded by the current clock.
      .filter(p=>Number.isFinite(p.home) && Number.isFinite(p.away) && p.time !== null && (state === 'completed' || p.time <= current))
      .sort((a,b)=>a.time-b.time);
    if (!moments.length) return {points:0,text:'',factors:[],handlesFinish:true};
    const completeLedger=moments.every((moment,i)=>{
      const prior=moments[i-1] || {home:0,away:0};
      const homeGain=moment.home-prior.home,awayGain=moment.away-prior.away;
      return (homeGain===1 && awayGain===0) || (homeGain===0 && awayGain===1);
    });
    let lastTime=0,margin=0,leader=0,changes=0,lateChanges=0,tiedTime=0,oneGoalTime=0,homeDeficit=0,awayDeficit=0,comeback=0,lateTie=0,lateAhead=0,pulledComeback=false,dramaticTime=null,majorDrama=false;
    for (const moment of moments) {
      const duration=Math.max(0,Math.min(3600,moment.time)-Math.min(3600,lastTime));
      if (margin===0) tiedTime+=duration;
      if (Math.abs(margin)<=1) oneGoalTime+=duration;
      const next=moment.home-moment.away;
      homeDeficit=Math.max(homeDeficit,-next); awayDeficit=Math.max(awayDeficit,next);
      if (next>=0) comeback=Math.max(comeback,homeDeficit);
      if (next<=0) comeback=Math.max(comeback,awayDeficit);
      const leadChange=next && leader && Math.sign(next)!==leader;
      const tyingGoal=next===0 && margin!==0;
      const goAheadGoal=next!==0 && (margin===0 || Math.sign(next)!==Math.sign(margin));
      const multiGoalComeback=tyingGoal && (margin<0 ? homeDeficit : awayDeficit)>=2;
      if (leadChange) {
        changes++;
        if (moment.time>=3300 && moment.time<=3600) lateChanges++;
      }
      if (tyingGoal || goAheadGoal || leadChange || multiGoalComeback) dramaticTime=moment.time;
      if (multiGoalComeback) majorDrama=true;
      if (next) leader=Math.sign(next);
      const recent=state === 'completed' || current-moment.time<=180;
      if (moment.time>=3300 && moment.time<=3600 && recent) {
        if (next===0 && margin!==0) {
          lateTie=moment.time>=3480 ? 9 : 6;
          if (moment.extraAttacker || /extra attacker|goalie pulled|6.on.[45]/i.test(moment.text)) pulledComeback=true;
        }
        if (next!==0 && (margin===0 || Math.sign(next)!==Math.sign(margin))) lateAhead=moment.time>=3480 ? 10 : 7;
      }
      margin=next; lastTime=moment.time;
    }
    const tail=Math.max(0,Math.min(3600,current)-Math.min(3600,lastTime));
    if (margin===0) tiedTime+=tail;
    if (Math.abs(margin)<=1) oneGoalTime+=tail;
    const duration=Math.max(1,Math.min(3600,current));
    const factors=[];
    const add=(label,points)=>{if(points) factors.push({label,points});};
    add('Late tying goal',lateTie);
    add('Late go-ahead goal',lateAhead);
    add('Goalie-pull comeback',pulledComeback ? 3 : 0);
    add('Erased a multi-goal deficit',comeback>=2 ? Math.min(10,4+2*(comeback-1)) : 0);
    add(`${changes} lead change${changes===1 ? '' : 's'}`,Math.min(9,changes*3));
    // Time tied is a subset of within-one time; award the combined path once.
    if (!(state === 'live' && options.replaceSustained) && completeLedger && current>=1440) add('Time tied or within one goal',Math.round((state==='completed' ? 8 : 3)*(.7*oneGoalTime/duration+.3*tiedTime/duration)));
    if (state === 'live' && options.replaceSustained) add('Trajectory sustained history',Math.max(0,Number(options.trajectoryPositive)||0));
    const relevance=state==='live' && Number.isFinite(options.liveRelevance)
      ? Math.max(0,Math.min(1,options.liveRelevance)) : null;
    let remaining=state==='completed' ? 32 : 12;
    const capped=factors.map(f=>{const points=Math.min(remaining,f.points*(relevance??1));remaining-=points;return {...f,points};}).filter(f=>f.points);
    let finalFactors=capped;
    let liveHeadroom=null;
    if (state === 'live') {
      const status=comp.status || {};
      const period=Number(status.period || 0);
      const seconds=allocation ? ot.seconds : clockSeconds(status);
      const scores=(comp.competitors || []).map(team=>Number(team.score));
      const tied=scores.length === 2 && scores.every(Number.isFinite) && scores[0] === scores[1];
      let headroom=null;
      if (allocation) {
        // Independent of the target: retain the existing ordinary OT allowance
        // of two, with up to four more for actual event history (not sustained
        // trajectory). Lowering a target never releases extra history capacity.
        // Fade the established 12-point budget over the final ten minutes,
        // using the target's time knots (not its values). Matching easing and
        // one final score round prevent a declining cap outrunning target
        // growth at a knot. The budget is independent of target/context/base.
        const events=factors.filter(f=>f.label!=='Trajectory sustained history')
          .reduce((sum,f)=>sum+Math.max(0,f.points)*(relevance??1),0);
        const endBudget=2+Math.min(4,events);
        if (!ot.postseason && (ot.depth || ot.shootout)) headroom=endBudget;
        else if (!ot.postseason && period===3 && seconds!==null)
          headroom=smoothNhlTarget(seconds,[1200,720,600,300,120,60,0]
            .map(s=>[s,endBudget+(12-endBudget)*Math.min(1,s/600)]));
      } else if (tied && !ot.postseason && period === 3 && seconds !== null && seconds <= 15) {
        const age=dramaticTime === null ? Infinity : Math.max(0,current-dramaticTime);
        // At regulation's edge, history survives only in proportion to how
        // recently a real tying/go-ahead/lead-change event occurred. A major
        // comeback, goalie pull or repeated late lead changes can buy one more
        // point, but only while that sequence is itself fresh.
        const recency=smoothNhlTarget(age,[[300,0],[240,2],[120,3],[60,4],[0,4]]);
        const significant=majorDrama || pulledComeback || lateChanges>=2;
        const significance=significant ? smoothNhlTarget(age,[[90,0],[60,1],[0,1]]) : 0;
        headroom=Math.max(0,Math.min(5,Math.round(recency+significance)));
      } else if (tied && !ot.postseason && ot.shootout) {
        headroom=2;
      } else if (tied && !ot.postseason && ot.depth) {
        const target=Math.round(smoothNhlTarget(seconds ?? 300,[[300,92],[0,94]]));
        headroom=Math.max(0,94-target);
      }
      if (headroom !== null) {
        liveHeadroom=headroom;
        let available=headroom;
        finalFactors=capped.map(f=>{const points=Math.min(available,f.points);available-=points;return {...f,points};}).filter(f=>f.points);
      }
    }
    return {points:finalFactors.reduce((sum,f)=>sum+f.points,0),text:finalFactors.map(f=>f.label).join('; '),factors:finalFactors,
      ...(relevance===null ? {} : {relevance:{retention:relevance,cap:12,headroom:liveHeadroom,
        factors:factors.map(f=>{const retainedPoints=finalFactors.find(a=>a.label===f.label)?.points||0;
          return {label:f.label,rawPoints:f.points,relevantPoints:f.points*relevance,retainedPoints,
            relevanceReduction:f.points*(1-relevance),capReduction:f.points*relevance-retainedPoints};})}}),
      handlesFinish:true,tiedShare:tiedTime/duration,withinOneShare:oneGoalTime/duration};
  }

  function hockeyEventShock({text,positioned,i,play}) {
    let value = 0;
    let label = '';
    if (/shorthanded goal|short-handed goal/.test(text)) { value=6; label='Shorthanded goal'; }
    return value ? {value,label} : null;
  }

  const nhlModel = {
    unit:'goal',pregame:proPregame,
    gameState:hockeyGameState,
    liveFloor:({game,progress,scoreGap}) => {
      if (!Number.isFinite(scoreGap) || progress>=2/3) return 0;
      const elapsed=Math.max(0,progress*60);
      const anchors=[[0,1],[10,1],[20,.88],[30,.55],[40,0]];
      let retention=0;
      for (let i=1;i<anchors.length;i++) if (elapsed<=anchors[i][0]) {
        const [a,y]=anchors[i-1], [b,z]=anchors[i], x=(elapsed-a)/(b-a);
        retention=y+(z-y)*x*x*(3-2*x); break;
      }
      // A lone early goal is weak evidence against the opening matchup.
      // Its protection fades faster once the first ten minutes are played.
      const oneGoal=.98-.04*Math.max(0,Math.min(1,(elapsed-10)/10));
      const margin=scoreGap<=1 ? 1-(1-oneGoal)*scoreGap : oneGoal*Math.exp(-3*Math.pow(scoreGap-1,2));
      return Math.min(90,Math.max(0,Number(game.openingScore)||0))*retention*margin;
    },
    situation:({game,competition,summary,status,progress,scoreGap,nhlAllocation}) =>
      hockeySituationImpact(game,competition,summary,status,progress,scoreGap,nhlAllocation),
    milestone:hockeyGoalMilestone,
    liveMilestone:hockeyLiveMilestone,
    decisiveFloor:true,
    upset:hockeyUpset,
    completedResult:hockeyCompletedResult,
    completedHistory:hockeyCompletedHistory,
    ownsCompletedOvertime:true,
    historyImpact:hockeyHistory,
    eventShock:hockeyEventShock,
    pressure:{maxGap:2,impact:hockeyPressure},
    contextAnchors:() => [[0,.40],[.25,.34],[.5,.27],[.67,.21],[.82,.13],[.93,.08],[1,.06]],
    history:{threshold:2,units:'goals'}
  };

  const api = {nhlLiveMarginCloseness,hockeyOnIceState,hockeyPowerPlay,hockeySituationImpact,hockeyGoalMilestone,hockeyGameState,hockeyEventShock,hockeyOvertime,hockeyLiveTiming,hockeyPlayClockMode,hockeyHistory,hockeyCompletedHistory,hockeyPressure,hockeyUpset,hockeyElapsed,nhlModel};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).sports_nhl = api;
  }
})(globalThis);

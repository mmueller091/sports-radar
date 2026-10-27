/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const {proPregame} = typeof module !== 'undefined' && module.exports
    ? require('../shared/pregame.js')
    : root.SportsRadarScoring.shared_pregame;

  const {clockSeconds} = typeof module !== 'undefined' && module.exports
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

  function hockeyOvertime(event,competition,summary,context='') {
    const status = competition?.status || {};
    const detail = `${status.type?.detail || ''} ${status.type?.shortDetail || ''}`;
    const signal = eventSignalText(event,competition,context) + ' ' + eventSignalText(summary?.header,competition,'');
    const postseason = isPostseasonGame('NHL',event,competition,signal) ||
      Number(summary?.header?.season?.type?.id ?? summary?.header?.season?.type) === 3;
    const shootout = /shootout|\bSO\b/i.test(detail) || (!postseason && Number(status.period) >= 5);
    const depth = shootout ? 0 : Math.max(0,Number(status.period || 0)-3,
      Number(detail.match(/(\d+)\s*OT\b/i)?.[1] || (/overtime|\bOT\b/i.test(detail) ? 1 : 0)));
    const leverage = playoffSeriesLeverage('NHL',competition,signal);
    const deciding = /game\s*7|deciding|winner.take.all/i.test(signal) || /deciding/i.test(leverage?.label || '');
    return {shootout,depth,postseason,deciding,final:/stanley cup final/i.test(signal)};
  }

  function hockeySituationImpact(game,competition,summary,status,progress,scoreGap) {
    const state = summary ? hockeyOnIceState(summary,game.teams) : null;
    const scores = game.teams.map(team => Number(team[2]));
    const trailing = scores.length === 2 && scores.every(Number.isFinite) && scores[0] !== scores[1]
      ? String(game.teams[scores[0] < scores[1] ? 0 : 1][8] || '') : '';
    const pulled = Boolean(trailing && state?.pulledGoalieTeamId === trailing);
    const powerPlay = Boolean(trailing && state?.powerPlayTeamId === trailing);
    const advantage = powerPlay || scoreGap === 0 ? state?.powerPlayAdvantage || 0 : 0;
    const seconds = clockSeconds(status);
    const late = Number(status?.period) === 3 && seconds !== null;
    const ot = hockeyOvertime(game.sourceEvent,{...competition,status},summary);
    let target = 0;
    let note = '';
    if (ot.shootout) { target=82; note='Shootout'; }
    else if (ot.depth && scoreGap === 0) {
      target = ot.postseason ? Math.min(97,90 + 3 * (ot.depth-1)) : 80;
      if (ot.postseason && ot.deciding) target=Math.max(target,96);
      if (ot.postseason && ot.final) target=Math.max(target,95);
      if (ot.postseason && ot.final && ot.deciding) target=99;
      note=ot.postseason ? `Playoff sudden-death ${ot.depth > 1 ? ot.depth : ''}OT` : '3-on-3 overtime';
    } else if (late && scoreGap <= 1) {
      if (scoreGap === 0) target=Math.round(smoothNhlTarget(seconds,[
        [1200,52],[720,58],[600,65],[300,77],[120,84],[60,88],[0,90]
      ]));
      else if (seconds <= 60) target=78;
      else if (seconds <= 120) target=74;
      else if (seconds <= 300) target=69;
      if (seconds <= 300 && powerPlay) target=Math.max(target,scoreGap === 0 ? 84 : 82);
      if (seconds <= 180 && advantage >= 2) target=Math.max(target,89);
      if (seconds <= 180 && pulled) target=Math.max(target,powerPlay ? 91 : 85);
      note = pulled ? (powerPlay ? 'Pulled the goalie with a power play' : 'Pulled the goalie')
        : advantage >= 2 ? 'Two-skater advantage' : powerPlay ? 'Trailing-team power play' : '';
    } else if (late && scoreGap === 2 && seconds <= 180 && (pulled || powerPlay)) {
      target = pulled && powerPlay ? 55 : 46;
      note='Two-goal comeback with extra manpower';
    }
    if (target && !ot.depth && !ot.shootout) {
      if (ot.postseason) target=Math.min(96,target+(ot.final ? 5 : 2));
      target=Math.min(96,target+Math.round(hockeyPressure(summary,progress,scoreGap,competition).points/2));
    }
    if (!note && state?.powerPlayTeam) note=`${state.powerPlayTeam} power play`;
    if (!note && state?.pulledGoalieTeam) note=`${state.pulledGoalieTeam} pulled the goalie`;
    const viability=nhlLiveMarginCloseness(scoreGap,progress,{trailingGoaliePulled:pulled,trailingPowerPlay:powerPlay});
    const points=Math.round((powerPlay ? 5 : pulled ? 3 : state?.powerPlayTeam ? (scoreGap === 0 ? 4 : 1) : 0)*viability);
    const base=Number(game.baseScore);
    return {points,note,reasons:note ? [note] : [],
      competitiveFloor:Number.isFinite(base) && target ? Math.max(0,target-base) : 0,
      competitiveTarget:target,manpower:{pulled,powerPlay,advantage},overtime:ot};
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
    const seconds=clockSeconds(context?.competition?.status);
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

  function hockeyPressure(summary,progress,gap,competition) {
    if (!summary || gap > 2) return {points:0,reasons:[]};
    const postseason=hockeyOvertime(null,competition,summary).postseason;
    const now=hockeyElapsed(competition?.status || summary.header?.competitions?.[0]?.status,postseason);
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

  function hockeyHistory(summary,progress,state) {
    if (state === 'upcoming') return {points:0,text:'',factors:[]};
    const comp=summary?.header?.competitions?.[0] || {};
    const ot=hockeyOvertime(null,comp,summary);
    const current=state === 'completed' ? Math.max(3600,hockeyElapsed(comp.status,ot.postseason) || 0) : hockeyElapsed(comp.status,ot.postseason) ?? progress*3600;
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
    let lastTime=0,margin=0,leader=0,changes=0,tiedTime=0,oneGoalTime=0,homeDeficit=0,awayDeficit=0,comeback=0,lateTie=0,lateAhead=0,pulledComeback=false;
    for (const moment of moments) {
      const duration=Math.max(0,Math.min(3600,moment.time)-Math.min(3600,lastTime));
      if (margin===0) tiedTime+=duration;
      if (Math.abs(margin)<=1) oneGoalTime+=duration;
      const next=moment.home-moment.away;
      homeDeficit=Math.max(homeDeficit,-next); awayDeficit=Math.max(awayDeficit,next);
      if (next>=0) comeback=Math.max(comeback,homeDeficit);
      if (next<=0) comeback=Math.max(comeback,awayDeficit);
      if (next && leader && Math.sign(next)!==leader) changes++;
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
    if (completeLedger && current>=1440) add('Time tied or within one goal',Math.round((state==='completed' ? 8 : 3)*(.7*oneGoalTime/duration+.3*tiedTime/duration)));
    let remaining=state==='completed' ? 32 : 12;
    const capped=factors.map(f=>{const points=Math.min(remaining,f.points);remaining-=points;return {...f,points};}).filter(f=>f.points);
    return {points:capped.reduce((sum,f)=>sum+f.points,0),text:capped.map(f=>f.label).join('; '),factors:capped,
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
    situation:({game,competition,summary,status,progress,scoreGap}) =>
      hockeySituationImpact(game,competition,summary,status,progress,scoreGap),
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

  const api = {nhlLiveMarginCloseness,hockeyOnIceState,hockeyPowerPlay,hockeySituationImpact,hockeyGoalMilestone,hockeyGameState,hockeyEventShock,hockeyOvertime,hockeyHistory,hockeyCompletedHistory,hockeyPressure,hockeyUpset,hockeyElapsed,nhlModel};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).sports_nhl = api;
  }
})(globalThis);

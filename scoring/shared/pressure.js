/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const calculation=typeof module!=='undefined'&&module.exports?require('./calculation.js'):null;
  const {normalizedTime} = typeof module !== 'undefined' && module.exports
    ? require('./time.js') : root.SportsRadarScoring.shared_time;
  function aggregateLiveBonus({
    probabilityPoints=0,
    situationPoints=0,
    pressurePoints=0,
    milestonePoints=0,
    eventShockPoints=0,
    sportImpact={},
    decisiveFloorEnabled=false,
    preserveCompetitiveSupport=false,
    nfl=false
  }={}) {
    const probabilityPositive = Math.max(0,Number(probabilityPoints) || 0);
    const probabilityNegative = Math.min(0,Number(probabilityPoints) || 0);
    const driveFloor = sportImpact.decisiveDrive
      ? Math.round(sportImpact.decisiveDrive.urgency *
          (18 + Math.min(2,sportImpact.decisiveDrive.positionBonus)))
      : 0;
    const decisiveFloor = nfl || decisiveFloorEnabled
      ? Math.max(0,Number(sportImpact.competitiveFloor) || 0)
      : 0;
    const competitiveSituation = decisiveFloorEnabled && decisiveFloor > 0 && !preserveCompetitiveSupport
      ? decisiveFloor
      : Math.min(Math.max(20,decisiveFloor),Math.max(
          driveFloor,
          Number(sportImpact.competitiveFloor) || 0,
          probabilityPositive + situationPoints + pressurePoints
        ));
    const positiveBonus = Math.min(
      Math.max(30,decisiveFloor),
      competitiveSituation + milestonePoints + eventShockPoints
    );
    const negativeBonus = Math.max(-8,probabilityNegative);
    const bonus = decisiveFloor > 0
      ? Math.max(decisiveFloor,positiveBonus + negativeBonus)
      : positiveBonus + negativeBonus;

    const result={bonus,probabilityPositive,probabilityNegative,driveFloor,decisiveFloor,
      competitiveSituation,positiveBonus,negativeBonus};
    if(calculation){
      const rows=[];
      const row=(label,points,kind)=>calculation.append(rows,label,points,kind);
      row('Positive win-probability contribution',probabilityPositive);
      row('Live situation',situationPoints);row('Recent scoring pressure',pressurePoints);
      const rawSituation=probabilityPositive+situationPoints+pressurePoints;
      // These are the exact competing floor/cap operands of the calculation above.
      const support=Math.max(driveFloor,Number(sportImpact.competitiveFloor)||0,rawSituation);
      if(decisiveFloorEnabled&&decisiveFloor>0&&!preserveCompetitiveSupport){
        row('Decisive situation replaces ordinary live support',calculation.difference(competitiveSituation,rawSituation),'floor');
      }else{
        row('Competitive situation floor',calculation.difference(support,rawSituation),'floor');
        row('Competitive situation ceiling',calculation.difference(competitiveSituation,support),'cap');
      }
      row('Player milestone',milestonePoints);row('Immediate event impact',eventShockPoints);
      row('Positive live bonus ceiling',calculation.difference(positiveBonus,competitiveSituation+milestonePoints+eventShockPoints),'cap');
      row('Negative win-probability contribution',probabilityNegative);
      row('Negative live bonus floor',calculation.difference(negativeBonus,probabilityNegative),'floor');
      row('Decisive live bonus floor',calculation.difference(bonus,positiveBonus+negativeBonus),'floor');
      if(calculation.reconcileArithmetic(rows,bonus))calculation.set(result,{rows,total:bonus});
    }
    return result;
  }

  function pressureImpact(summary,progress,scoreGap,competition,policy) {
    if (policy?.impact) return policy.impact(summary,progress,scoreGap,competition);
    if (!policy || !summary || scoreGap > policy.maxGap) {
      return {points:0,reasons:[]};
    }

    const records = [...new Map((summary.plays || []).map(play=>[
      play?.id != null ? `id:${play.id}` : JSON.stringify(play),play
    ])).values()];
    const currentTime = policy.sport ? normalizedTime(policy.sport,competition).elapsedSeconds : null;
    const currentWallclock = Date.parse(competition?.status?.wallclock || competition?.wallclock || '');
    const isRecent = play => {
      if (!policy.recentSeconds) return true;
      if (Number(play?.period?.number || play?.period)>0 && Number(competition?.status?.period)>0 &&
          Number(play?.period?.number || play?.period)!==Number(competition.status.period)) return false;
      const eventTime=normalizedTime(policy.sport,{status:{period:play?.period?.number || play?.period,
        displayClock:play?.clock?.displayValue || play?.displayClock || '',clock:play?.clock?.value ?? play?.clockValue}}).elapsedSeconds;
      const occurred=Date.parse(play?.wallclock || play?.occurredAt || '');
      const age=currentTime !== null && eventTime !== null ? currentTime-eventTime
        : Number.isFinite(currentWallclock) && Number.isFinite(occurred) ? (currentWallclock-occurred)/1000 : null;
      // Publication/receipt timestamps are deliberately not event times. An
      // unpositioned or future event cannot be called recent pressure.
      return age !== null && age>=0 && age<=policy.recentSeconds;
    };
    const recent = (policy.recentSeconds ? records.filter(isRecent) : records.slice(-18))
      .filter(play => !play?.scoringPlay)
      .map(play => ({
        text:String(play?.text || play?.shortText || play?.type?.text || '').toLowerCase(),
        teamId:String(play?.team?.id || play?.teamId || play?.team?.team?.id || '')
      }))
      .filter(play => play.text);

    const dangerous = recent.filter(play =>
      /shot on goal|saved by|\bsave\b|breakaway|penalty shot|hit (?:the )?(?:post|crossbar)|off (?:the )?(?:post|crossbar)|big chance|close range|point-blank/.test(play.text)
    );

    const premium = recent.filter(play =>
      /breakaway|penalty shot|hit (?:the )?(?:post|crossbar)|off (?:the )?(?:post|crossbar)|big chance|point-blank/.test(play.text)
    );

    let points = 0;
    const reasons = [];

    if (premium.length) {
      points += Math.min(4,2 + premium.length);
      reasons.push(`${premium.length} premium scoring chance${premium.length === 1 ? '' : 's'} recently`);
    }

    if (dangerous.length >= 4) {
      points += dangerous.length >= 7 ? 3 : 2;
      reasons.push(`${dangerous.length} dangerous attempts or saves in the recent action`);
    }

    if (points && progress >= .78) points++;

    if (policy.weight) points = policy.weight(points,scoreGap,dangerous,competition);

    return {
      points:Math.min(7,points),
      reasons
    };
  }

  const api = {pressureImpact,aggregateLiveBonus};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).shared_pressure = api;
  }
})(globalThis);

/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
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

    return {bonus,probabilityPositive,probabilityNegative,driveFloor,decisiveFloor,
      competitiveSituation,positiveBonus,negativeBonus};
  }

  function pressureImpact(summary,progress,scoreGap,competition,policy) {
    if (policy?.impact) return policy.impact(summary,progress,scoreGap,competition);
    if (!policy || !summary || scoreGap > policy.maxGap) {
      return {points:0,reasons:[]};
    }

    const recent = (summary.plays || [])
      .slice(-18)
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

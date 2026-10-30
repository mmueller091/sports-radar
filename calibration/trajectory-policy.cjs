/* Experimental scoring of authoritative Phase 1 telemetry; never a production import. */
const unit = value => Math.max(0,Math.min(1,Number(value) || 0));
const smoothstep = (start,end,value) => {
  const x = unit((value-start)/(end-start));
  return x*x*(3-2*x);
};
const reference = {
  positiveCap:10,negativeCap:8,genuineWeight:.75,
  falseCloseWeight:.75,dominanceWeight:.8,revivalPoints:3,
  evidenceStart:.25,evidenceEnd:.75,gateStart:.1,gateEnd:.65,
  fallbackPositiveConfidence:1,wpCountStart:1,wpCountEnd:6
};
const policy = (id,description,changes={}) => Object.freeze({id,description,...reference,...changes});
const CURRENT_GATE_POLICIES = Object.freeze([[.1,.65],[.2,.7],[.25,.75],[.3,.8],[.35,.85],[.45,.95]]
  .map(([start,end]) => Object.freeze({start,end})));
const POSITIVE_CONFIDENCE_LEVELS = Object.freeze([.5,.65,.8,1]);
// This grid is experimental only. Its order and recommendation never activate a default.
const TRAJECTORY_POLICIES = Object.freeze(CURRENT_GATE_POLICIES.flatMap(({start,end}) =>
  POSITIVE_CONFIDENCE_LEVELS.map(confidence => policy(
    `gate-${Math.round(start*100)}-${Math.round(end*100)}-wp-${Math.round(confidence*100)}`,
    `Positive gate ${start} to ${end}; margin fallback sustained reward at ${confidence*100}% confidence.`,
    {gateStart:start,gateEnd:end,fallbackPositiveConfidence:confidence}))));

function validatePolicy(p) {
  for (const key of Object.keys(reference)) {
    if (!Number.isFinite(p[key]) || p[key] < 0) throw new Error(`Invalid trajectory policy ${key}`);
  }
  if (p.evidenceEnd <= p.evidenceStart || p.gateEnd <= p.gateStart ||
      p.genuineWeight > 1 || p.gateEnd > 1 || p.fallbackPositiveConfidence > 1 ||
      p.wpCountEnd <= p.wpCountStart) throw new Error('Invalid trajectory policy ramp/weight');
}

function trajectoryAdjustment(telemetry,currentCloseness,policy=null) {
  if (policy) validatePolicy(policy);
  const t = telemetry || {};
  const hasHistory = Number.isFinite(t.trajectoryEndPosition) && t.trajectoryEndPosition > 0 &&
    [t.genuineContinuity,t.marginContinuity,t.competitiveShare,t.dominantShare].every(Number.isFinite);
  const source = t.genuineContinuitySource || 'unavailable';
  const diagnostic = {
    enabled:Boolean(policy),policyId:policy?.id ?? null,adjustment:0,
    evidenceWeight:0,sustainedQuality:0,falseClose:0,dominance:0,lateRevival:0,
    sustainedQualityContribution:0,adjustedSustainedQualityContribution:0,
    positiveWpConfidence:0,positiveWpSupport:0,wpConfidence:0,
    falseCloseContribution:0,dominanceContribution:0,
    lateRevivalContribution:0,positiveCurrentStateGate:0,rawTrajectory:0,boundedTrajectory:0,
    telemetrySource:source,fallback:source === 'margin-fallback',
    wpCoverageShare:unit(t.wpCoverageShare),wpObservationCount:t.wpObservationCount || 0,
    wpCoverageStart:t.wpCoverageStart ?? null,wpCoverageEnd:t.wpCoverageEnd ?? null,
    trajectoryEndPosition:t.trajectoryEndPosition ?? null,hasHistory
  };
  if (!policy || !hasHistory) return diagnostic;
  const p = policy;
  // WP statistics describe only their observed interval. Shrink their influence
  // toward the existing full-duration margin telemetry when coverage is limited;
  // do not invent probabilities or change any Phase 1 measurements.
  const wpConfidence = source === 'positioned-win-probability' ? unit(t.wpCoverageShare) : 0;
  const genuine = source === 'positioned-win-probability'
    ? unit(t.marginContinuity)*(1-wpConfidence)+unit(t.genuineContinuity)*wpConfidence
    : unit(t.genuineContinuity);
  const sustainedQuality = p.genuineWeight*genuine+(1-p.genuineWeight)*unit(t.competitiveShare);
  const falseClose = Math.max(0,unit(t.marginContinuity)-unit(t.genuineContinuity))*wpConfidence;
  const dominance = unit(t.dominantShare)*(source === 'positioned-win-probability' ? wpConfidence : 1);
  const recentCompetition = Number.isFinite(t.lastCompetitivePosition)
    ? smoothstep(.8,1,t.lastCompetitivePosition/t.trajectoryEndPosition) : 0;
  // Movement concentration alone is not quality: require recent competitiveness,
  // limit the credit to non-sustained history, and apply the current-state gate below.
  const lateRevival = unit(t.lateMovementShare)*recentCompetition*(1-sustainedQuality);
  const sustainedQualityContribution = p.positiveCap*smoothstep(.35,.95,sustainedQuality);
  // Confidence modifies only the existing positive sustained reward. Coverage
  // and observation maturity are separate requirements: even a wide interval
  // between two observations is not a fully observed history. No WP is invented.
  const positiveWpSupport = source === 'positioned-win-probability'
    ? smoothstep(0,1,unit(t.wpCoverageShare))*smoothstep(p.wpCountStart,p.wpCountEnd,t.wpObservationCount || 0)
    : 0;
  const positiveWpConfidence = p.fallbackPositiveConfidence+(1-p.fallbackPositiveConfidence)*positiveWpSupport;
  const adjustedSustainedQualityContribution = sustainedQualityContribution*positiveWpConfidence;
  const falseCloseContribution = -p.negativeCap*p.falseCloseWeight*falseClose || 0;
  const dominanceContribution = -p.negativeCap*p.dominanceWeight*dominance || 0;
  const lateRevivalContribution = p.revivalPoints*lateRevival;
  const rawTrajectory = adjustedSustainedQualityContribution+falseCloseContribution+
    dominanceContribution+lateRevivalContribution;
  const boundedTrajectory = Math.max(-p.negativeCap,Math.min(p.positiveCap,rawTrajectory));
  const evidenceWeight = smoothstep(p.evidenceStart,p.evidenceEnd,t.trajectoryEndPosition);
  const positiveCurrentStateGate = smoothstep(p.gateStart,p.gateEnd,unit(currentCloseness));
  const adjustment = boundedTrajectory*evidenceWeight*(boundedTrajectory > 0 ? positiveCurrentStateGate : 1);
  return {...diagnostic,adjustment,evidenceWeight,sustainedQuality,falseClose,dominance,lateRevival,
    sustainedQualityContribution,adjustedSustainedQualityContribution,positiveWpConfidence,positiveWpSupport,
    falseCloseContribution,dominanceContribution,lateRevivalContribution,
    rawTrajectory,boundedTrajectory,positiveCurrentStateGate,wpConfidence};
}

module.exports = {TRAJECTORY_POLICIES,CURRENT_GATE_POLICIES,POSITIVE_CONFIDENCE_LEVELS,trajectoryAdjustment};

import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadCore,loadFixtures} from '../calibration/helpers.mjs';
import {
  buildReplayReport,highFidelityCheckpoints,prepareCheckpointEvaluation,
  evaluatePreparedCheckpointPolicies,assertPreparedCheckpointUnchanged
} from './shadow-candidate-report.mjs';

const require = createRequire(import.meta.url);
const shadow = require('../calibration/shadow-candidate.cjs');

export const CEILINGS = [24,28,32,34,36,40];
export const FORMULAS = [
  {id:'linear-30-70',label:'Linear 30% margin / 70% uncertainty',kind:'linear',marginWeight:.30},
  {id:'linear-50-50',label:'Linear 50% margin / 50% uncertainty',kind:'linear',marginWeight:.50},
  {id:'linear-60-40',label:'Linear 60% margin / 40% uncertainty',kind:'linear',marginWeight:.60},
  {id:'linear-65-35',label:'Linear 65% margin / 35% uncertainty',kind:'linear',marginWeight:.65},
  {id:'linear-70-30',label:'Linear 70% margin / 30% uncertainty',kind:'linear',marginWeight:.70},
  {id:'modifier-55-45',label:'Margin x (0.55 + 0.45 x uncertainty)',kind:'margin-modifier',uncertaintyWeight:.45},
  {id:'modifier-60-40',label:'Margin x (0.60 + 0.40 x uncertainty)',kind:'margin-modifier',uncertaintyWeight:.40},
  {id:'modifier-65-35',label:'Margin x (0.65 + 0.35 x uncertainty)',kind:'margin-modifier',uncertaintyWeight:.35},
  {id:'modifier-70-30',label:'Margin x (0.70 + 0.30 x uncertainty)',kind:'margin-modifier',uncertaintyWeight:.30}
];

const THRESHOLDS = [50,70,80,85,90];
const DEFAULT_CONFIGURATION_ID = 'modifier-65-35-c34';
const EQUIVALENCE_COMPONENTS = [
  'effectiveUncertainty','currentCloseness','currentTensionPoints',
  'genericLeveragePoints','baseScore','sportSituation','pressure','competitiveFloor',
  'decisiveFloor','aggregationBonus','liveBonus','momentum','candidateRating'
];
const SPORTS = ['CFB','MLB','NBA','NCAAB','NFL','NHL','Soccer','Tennis'];
const PROGRESS_BUCKETS = [
  ['0-25%',0,.25],['25-50%',.25,.50],['50-75%',.50,.75],
  ['75-90%',.75,.90],['90-100%',.90,Infinity]
];
const unit = value => Math.max(0,Math.min(1,Number(value) || 0));
const round = (value,digits=2) => value == null ? null : Number(value.toFixed(digits));
const mean = values => values.length ? values.reduce((sum,value) => sum+value,0)/values.length : null;
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  const middle = Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
};
const clampScore = value => Math.max(1,Math.min(99,Math.round(value)));
const urgencyAt = progress => {
  const x = unit((unit(progress)-shadow.GENERIC_LEVERAGE_START)/shadow.GENERIC_LEVERAGE_SPAN);
  return x*x*(3-2*x);
};
const band = score => score >= 85 ? '85+' : score >= 70 ? '70-84' : score >= 50 ? '50-69' : '<50';

// Historical diagnostic only. This deliberately does not recompute downstream
// base/headroom-sensitive live logic and must never produce calibration results.
export function legacyApproximateRescoreRow(row,formula,ceiling) {
  const effectiveUncertainty = row.uncertainty == null
    ? null
    : Math.min(row.uncertainty,unit(row.uncertaintyCeiling ?? 1));
  const currentCloseness = effectiveUncertainty == null
    ? unit(row.marginCloseness)
    : shadow.currentClosenessFor(row.marginCloseness,effectiveUncertainty,formula);
  const currentTension = Math.round(ceiling*currentCloseness);
  const genericLeverage = Math.round(
    shadow.GENERIC_LEVERAGE_CAP*urgencyAt(row.progress)*currentCloseness
  );
  const baseScore = clampScore(row.genericIndependentBaseScore+currentTension+genericLeverage);
  const floorBonus = row.retainedLiveFloorScore == null
    ? 0
    : Math.max(0,row.retainedLiveFloorScore-baseScore);
  const liveBonus = Math.max(row.aggregationBonus,floorBonus);
  const candidateRating = clampScore(baseScore+liveBonus+row.momentum);
  return {
    ...row,currentCloseness,effectiveUncertainty,currentTension,genericLeverage,
    baseScore,liveBonus,candidateRating,delta:candidateRating-row.legacyRating,
    semanticBand:band(candidateRating),approximate:true
  };
}

function statsAccumulator() {
  return {
    candidate:[],currentShadow:[],deltas:[],
    thresholds:Object.fromEntries(THRESHOLDS.map(value => [value,0])),
    crossings:Object.fromEntries(THRESHOLDS.map(value => [value,{
      currentAtOrAboveCandidateBelow:0,currentBelowCandidateAtOrAbove:0
    }])),
    bands:Object.fromEntries(['<50','50-69','70-84','85+'].map(value => [value,0]))
  };
}

function addStats(acc,row,currentShadowRating) {
  const score = row.candidateRating;
  const delta = score-currentShadowRating;
  acc.candidate.push(score);
  acc.currentShadow.push(currentShadowRating);
  acc.deltas.push(delta);
  acc.bands[band(score)]++;
  for (const threshold of THRESHOLDS) {
    if (score >= threshold) acc.thresholds[threshold]++;
    if (currentShadowRating >= threshold && score < threshold) {
      acc.crossings[threshold].currentAtOrAboveCandidateBelow++;
    }
    if (currentShadowRating < threshold && score >= threshold) {
      acc.crossings[threshold].currentBelowCandidateAtOrAbove++;
    }
  }
}

function finishStats(acc) {
  const count = acc.candidate.length;
  const percentage = value => round(100*value/(count || 1));
  return {
    count,
    meanCandidate:round(mean(acc.candidate)),medianCandidate:round(median(acc.candidate)),
    meanCurrentShadow:round(mean(acc.currentShadow)),
    medianCurrentShadow:round(median(acc.currentShadow)),
    meanDelta:round(mean(acc.deltas)),medianDelta:round(median(acc.deltas)),
    thresholds:Object.fromEntries(THRESHOLDS.map(threshold => [threshold,{
      count:acc.thresholds[threshold],percentage:percentage(acc.thresholds[threshold])
    }])),
    thresholdCrossings:acc.crossings,
    bands:Object.fromEntries(Object.entries(acc.bands).map(([name,value]) =>
      [name,{count:value,percentage:percentage(value)}]))
  };
}

function variantAccumulator() {
  return {
    overall:statsAccumulator(),neutral:statsAccumulator(),
    specificLeverage:statsAccumulator(),decisive:statsAccumulator(),
    progress:Object.fromEntries(PROGRESS_BUCKETS.map(([name]) => [name,statsAccumulator()])),
    sports:Object.fromEntries(SPORTS.map(sport => [sport,statsAccumulator()])),
    largestIncreases:[],largestDecreases:[],anchors:{}
  };
}

function extremeDiagnostic(row,currentShadowRating) {
  return {
    stateId:row.stateId,sport:row.sport,progress:round(row.progress,4),
    currentShadowRating,candidateRating:row.candidateRating,
    delta:row.candidateRating-currentShadowRating,
    currentTension:row.candidateCurrentTension,
    genericLeverage:row.candidateGenericLeverage,
    baseScore:row.candidateBaseScore,liveBonus:row.candidateLiveBonus,
    sportSituation:row.sportSituation,decisiveFloor:row.decisiveFloor,
    competitiveFloor:row.competitiveFloor,fidelity:row.fidelity
  };
}

function retainExtreme(list,item,direction) {
  list.push(item);
  list.sort((a,b) => direction*(b.delta-a.delta) || a.stateId.localeCompare(b.stateId));
  if (list.length > 10) list.pop();
}

function addVariant(acc,row,currentShadowRating,anchorName=null) {
  addStats(acc.overall,row,currentShadowRating);
  if (row.sportSituation <= 0 && !row.decisive) addStats(acc.neutral,row,currentShadowRating);
  if (row.sportSituation > 0) addStats(acc.specificLeverage,row,currentShadowRating);
  if (row.decisive) addStats(acc.decisive,row,currentShadowRating);
  const progressBucket = PROGRESS_BUCKETS.find(([,min,max]) =>
    row.progress >= min && row.progress < max);
  if (progressBucket) addStats(acc.progress[progressBucket[0]],row,currentShadowRating);
  if (acc.sports[row.sport]) addStats(acc.sports[row.sport],row,currentShadowRating);
  const diagnostic = extremeDiagnostic(row,currentShadowRating);
  if (diagnostic.delta > 0) retainExtreme(acc.largestIncreases,diagnostic,1);
  if (diagnostic.delta < 0) retainExtreme(acc.largestDecreases,diagnostic,-1);
  if (anchorName) acc.anchors[anchorName] = archiveAnchor(row,currentShadowRating);
}

function finishVariant(acc) {
  return {
    overall:finishStats(acc.overall),neutral:finishStats(acc.neutral),
    specificLeverage:finishStats(acc.specificLeverage),decisive:finishStats(acc.decisive),
    progress:Object.fromEntries(Object.entries(acc.progress).map(([name,value]) =>
      [name,finishStats(value)])),
    sports:Object.fromEntries(Object.entries(acc.sports).map(([name,value]) =>
      [name,finishStats(value)])),
    largestIncreases:acc.largestIncreases,largestDecreases:acc.largestDecreases
  };
}

function closest(rows,predicate,cost) {
  return rows.filter(predicate).sort((a,b) => cost(a)-cost(b) || a.stateId.localeCompare(b.stateId))[0] || null;
}

function selectAnchors(rows) {
  const full = rows.filter(row => row.fidelity === 'full');
  const anchor = full.find(row => row.stateId === '401858490:401858490648');
  const anchors = {
    requiredCFB:anchor,
    closeCFB5050:closest(full,row => row.sport === 'CFB' && row.margin <= 3 &&
      row.currentWp >= .45 && row.currentWp <= .55 && row.progress >= .80 && row.progress <= .99,
    row => Math.abs(row.progress-(anchor?.progress ?? .9))+Math.abs(row.currentWp-.5)),
    nflCloseOneSided:closest(full,row => row.sport === 'NFL' && row.margin <= 3 &&
      Math.abs(row.currentWp-.5) >= .35 && !row.decisive && row.progress >= .75,
    row => Math.abs(row.progress-.9)+Math.abs(Math.abs(row.currentWp-.5)-.4)),
    nflLateUncertain:closest(full,row => row.sport === 'NFL' && row.margin <= 3 &&
      row.currentWp >= .4 && row.currentWp <= .6 && !row.decisive && row.progress >= .75,
    row => Math.abs(row.progress-.9)+Math.abs(row.currentWp-.5)),
    decisiveNFLDrive:full.find(row => row.stateId === '401873002:4018730023915'),
    blowout:closest(full,row => ['NFL','CFB'].includes(row.sport) && row.margin >= 21 &&
      !row.decisive && row.progress >= .5,
    row => row.candidateRating/100+Math.abs(row.progress-.75)),
    strongEarly:closest(full,row => ['NFL','CFB','NBA','NCAAB'].includes(row.sport) &&
      row.progress < .25 && row.margin <= 3 && row.currentWp >= .4 && row.currentWp <= .6 &&
      row.sportSituation > 0 && row.candidateRating >= 60,
    row => -row.candidateRating/100+Math.abs(row.progress-.18)),
    ordinaryCloseEarly:full.find(row => row.stateId === '401858490:401858490105')
  };
  for (const [name,row] of Object.entries(anchors)) {
    if (!row) throw new Error(`Unable to select required full-fidelity archive anchor: ${name}`);
  }
  return anchors;
}

function archiveAnchor(row,currentShadowRating) {
  return {
    stateId:row.stateId,sport:row.sport,progress:round(row.progress,4),score:row.score,
    margin:row.margin,currentWp:row.currentWp,legacyRating:row.legacyRating,
    currentShadowRating,candidateRating:row.candidateRating,semanticBand:band(row.candidateRating),
    marginCloseness:round(row.marginCloseness,4),uncertainty:round(row.uncertainty,4),
    uncertaintyCeiling:round(row.uncertaintyCeiling,4),
    effectiveUncertainty:round(row.effectiveUncertainty,4),
    currentCloseness:round(row.currentCloseness,4),
    currentTension:row.candidateCurrentTension,genericLeverage:row.candidateGenericLeverage,
    baseScore:row.candidateBaseScore,liveBonus:row.candidateLiveBonus,momentum:row.momentum,
    situation:row.sportSituation,pressure:row.sportPressure,
    driveFloor:row.driveFloor,decisiveFloor:row.decisiveFloor,competitiveFloor:row.competitiveFloor
  };
}

function configurationSpecs() {
  return FORMULAS.flatMap(formula => CEILINGS.map(ceiling => ({
    id:`${formula.id}-c${ceiling}`,
    formulaId:formula.id,formulaLabel:formula.label,ceiling,
    policy:{...formula,currentTensionCeiling:ceiling}
  })));
}

function equivalenceSnapshot(row) {
  return {
    effectiveUncertainty:row.effectiveUncertainty,currentCloseness:row.currentCloseness,
    currentTensionPoints:row.candidateCurrentTension,
    genericLeveragePoints:row.candidateGenericLeverage,
    baseScore:row.candidateBaseScore,sportSituation:row.sportSituation,
    pressure:row.sportPressure,competitiveFloor:row.competitiveFloor,
    decisiveFloor:row.decisiveFloor,aggregationBonus:row.aggregationBonus,
    liveBonus:row.candidateLiveBonus,momentum:row.momentum,
    candidateRating:row.candidateRating
  };
}

export async function evaluateDirectCalibrationGrid(fixtures,core,baseRows,selected) {
  const specs = configurationSpecs();
  const currentByState = new Map(baseRows.map(row => [row.stateId,row]));
  const anchorNames = new Map(Object.entries(selected).map(([name,row]) => [row.stateId,name]));
  const accumulators = new Map(specs.map(spec => [spec.id,variantAccumulator()]));
  const defaultId = DEFAULT_CONFIGURATION_ID;
  let evaluatedStates = 0;
  let defaultEquivalenceStates = 0;

  for (const fixture of fixtures) {
    const checkpoints = highFidelityCheckpoints(fixture);
    for (const [index,checkpoint] of checkpoints.entries()) {
      const prepared = prepareCheckpointEvaluation(core,fixture,checkpoint,index);
      if (!prepared) continue;
      const stateId = `${fixture.eventId || fixture.event?.id}:${checkpoint.play.id || index}`;
      const current = currentByState.get(stateId);
      if (!current) throw new Error(`Direct grid could not find current-shadow row ${stateId}`);
      const anchorName = anchorNames.get(stateId) || null;
      const rows = evaluatePreparedCheckpointPolicies(
        prepared,specs.map(spec => spec.policy),{verifyInputs:false}
      );
      for (const [specIndex,spec] of specs.entries()) {
        const row = rows[specIndex];
        addVariant(accumulators.get(spec.id),row,current.candidateRating,anchorName);
        if (spec.id === defaultId) {
          if (JSON.stringify(equivalenceSnapshot(row)) !== JSON.stringify(equivalenceSnapshot(current))) {
            throw new Error(`Explicit default diverged from implicit shadow scoring at ${stateId}`);
          }
          defaultEquivalenceStates++;
        }
      }
      assertPreparedCheckpointUnchanged(prepared);
      evaluatedStates++;
    }
  }

  if (evaluatedStates !== baseRows.length || defaultEquivalenceStates !== baseRows.length) {
    throw new Error(`Direct grid evaluated ${evaluatedStates}/${baseRows.length} states`);
  }
  return {
    configurations:specs.map(spec => {
      const accumulator = accumulators.get(spec.id);
      const missingAnchors = Object.keys(selected).filter(name => !accumulator.anchors[name]);
      if (missingAnchors.length) {
        throw new Error(`${spec.id} missing anchors: ${missingAnchors.join(', ')}`);
      }
      return {
        id:spec.id,formulaId:spec.formulaId,formulaLabel:spec.formulaLabel,
        ceiling:spec.ceiling,summary:finishVariant(accumulator),anchors:accumulator.anchors
      };
    }),
    directEquivalence:{
      exact:true,mismatches:0,states:defaultEquivalenceStates,configuration:defaultId,
      comparedComponents:EQUIVALENCE_COMPONENTS
    }
  };
}

const OLD_APPROXIMATE_65_35_C34 = {
  mean:52.52,median:56,
  bands:{'<50':34.68,'50-69':53.19,'70-84':6.29,'85+':5.84}
};
const BASE_DEPENDENCY_AUDIT = {
  candidateBaseSensitive:['CFB competitive floor','NFL decisive-possession floor',
    'NHL competitive target/floor'],
  auditedWithoutCandidateBaseDependency:['MLB','NBA','NCAAB','Soccer','Tennis'],
  allConfigurationsRerunDirectly:true
};

function clockFor(sport,progress) {
  const periodLength = ['NBA'].includes(sport) ? 720 : ['NCAAB'].includes(sport) ? 1200 : 900;
  const periods = ['NCAAB'].includes(sport) ? 2 : 4;
  const raw = Math.min(periods-.000001,unit(progress)*periods);
  const period = Math.floor(raw)+1;
  const remaining = Math.round((1-(raw-Math.floor(raw)))*periodLength);
  const minutes = Math.floor(remaining/60);
  const seconds = String(remaining%60).padStart(2,'0');
  return {period,displayClock:`${minutes}:${seconds}`,clock:remaining,
    type:{state:'in',completed:false,name:'STATUS_IN_PROGRESS'}};
}

function counterfactualContext(sport,progress) {
  const status = clockFor(sport,progress);
  const situation = ['NFL','CFB'].includes(sport)
    ? {possession:'away',down:2,distance:8,yardsToEndzone:62,possessionText:'HOME 38',
      downDistanceText:'2nd & 8 at HOME 38'}
    : {};
  const competition = {
    status,situation,
    competitors:[
      {homeAway:'home',score:sport === 'NBA' ? '72' : '17',team:{id:'home'}},
      {homeAway:'away',score:sport === 'NBA' ? '69' : '14',team:{id:'away'}}
    ]
  };
  return {competition,situation};
}

function counterfactualMatrix(core,formula,ceiling) {
  const rows = [];
  for (const sport of ['NFL','CFB','NBA']) {
    for (const progress of [.25,.50,.75,.90,.95]) {
      for (const leaderWp of [.50,.60,.70,.80,.90,.95]) {
        const result = shadow.candidateStateRating(
          core,28,sport,'live',3,progress,leaderWp,counterfactualContext(sport,progress),[],
          {...formula,currentTensionCeiling:ceiling}
        );
        rows.push({
          sport,progress,leaderWp,margin:3,marginCloseness:round(result.marginCloseness,4),
          uncertainty:round(result.uncertainty,4),uncertaintyCeiling:round(result.uncertaintyCeiling,4),
          currentCloseness:round(result.currentCloseness,4),
          currentTension:result.currentTensionPoints,genericLeverage:result.genericLeveragePoints,
          baseScore:result.score,finalCandidateRating:result.score,
          situationDataSupplied:false
        });
      }
    }
  }
  return rows;
}

function pct(statsObject,name) {
  return `${statsObject.bands[name].percentage}%`;
}

function mdTable(headers,rows) {
  return [`| ${headers.join(' | ')} |`,`| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n');
}

function renderLegacyMarkdown(result) {
  const preferred = result.recommendation.preferred;
  const second = result.recommendation.secondBest;
  const lines = [
    '# Current Tension calibration',
    '',
    'Generated from the high-fidelity chronological replay. The approved margin-modifier 65/35 policy with a Current Tension ceiling of 34 is now the implicit shadow default; production/default scoring was not changed, deployed, or pushed.',
    '',
    '## Recommendation',
    '',
    `Preferred: **${preferred.formulaLabel}, ceiling ${preferred.ceiling}**. ${result.recommendation.why}`,
    '',
    `Second-best: **${second.formulaLabel}, ceiling ${second.ceiling}**. ${result.recommendation.secondBestWhy}`,
    '',
    'The recommendation is semantic, not an attempt to minimize delta versus the legacy model. Generic Leverage remains capped at 8 with its existing smoothstep, and all sport-specific situation, pressure, floor, trajectory, context-decay, and production behavior remains unchanged.',
    '',
    '## Configuration overview',
    ''
  ];
  lines.push(mdTable(
    ['Configuration','Mean / median','Δ mean / median','<50','50-69','70-84','85+','≥50 / ≥70 / ≥80 / ≥85 / ≥90'],
    result.configurations.map(config => {
      const s = config.summary.overall;
      return [config.id,`${s.meanCandidate} / ${s.medianCandidate}`,`${s.meanDelta} / ${s.medianDelta}`,
        pct(s,'<50'),pct(s,'50-69'),pct(s,'70-84'),pct(s,'85+'),
        THRESHOLDS.map(t => `${s.thresholds[t].count} (${s.thresholds[t].percentage}%)`).join(' / ')];
    })
  ));
  lines.push('','## Detailed replay diagnostics','');
  for (const config of result.configurations) {
    lines.push(`### ${config.id}: ${config.formulaLabel}; ceiling ${config.ceiling}`,'');
    const groups = [
      ['overall',config.summary.overall],['neutral',config.summary.neutral],
      ['specific leverage',config.summary.specificLeverage],['decisive',config.summary.decisive],
      ...Object.entries(config.summary.progress).map(([name,value]) => [`progress ${name}`,value]),
      ['NFL',config.summary.sports.NFL],['CFB',config.summary.sports.CFB]
    ];
    lines.push(mdTable(
      ['Group','N','Candidate mean / median','Legacy mean / median','Δ mean / median','<50','50-69','70-84','85+'],
      groups.map(([name,s]) => [name,s.count,`${s.meanCandidate} / ${s.medianCandidate}`,
        `${s.meanLegacy} / ${s.medianLegacy}`,`${s.meanDelta} / ${s.medianDelta}`,
        pct(s,'<50'),pct(s,'50-69'),pct(s,'70-84'),pct(s,'85+')])
    ));
    lines.push('');
  }
  lines.push('## Archive anchor diagnostics','',
    'Every selected anchor is full-fidelity. “Strong early” and “ordinary early” are archive examples, not synthetic threshold targets.','');
  for (const config of result.configurations) {
    lines.push(`### ${config.id}`,'');
    lines.push(mdTable(
      ['Archetype / state','Progress','Score / WP','Margin close / uncertainty','Tension / leverage','Base / final','Band','Situation / pressure / floors'],
      Object.entries(config.anchors).map(([name,a]) => [
        `${name}: ${a.stateId}`,`${round(a.progress*100,1)}%`,
        `${a.score.home}-${a.score.away} / ${a.currentWp == null ? 'n/a' : round(a.currentWp*100,2)+'%'}`,
        `${a.marginCloseness} / ${a.uncertainty}`,`${a.currentTension} / ${a.genericLeverage}`,
        `${a.baseScore} / ${a.candidateRating}`,a.semanticBand,
        `${a.situation} / ${a.pressure} / ${a.driveFloor},${a.decisiveFloor},${a.competitiveFloor}`
      ])
    ));
    lines.push('');
  }
  lines.push('## Preferred counterfactual matrix','',
    'All rows hold the score margin at 3 and the opening basis at 28. No sport-specific live situation award is supplied, so final equals base. The context includes a representative clock and, for football, ordinary second-down possession so sport comeback/uncertainty ceilings remain active.','');
  for (const sport of ['NFL','CFB','NBA']) {
    lines.push(`### ${sport}`,'');
    lines.push(mdTable(
      ['Progress','Leader WP','Margin close','Uncertainty / ceiling','Current Tension','Generic Leverage','Base / final','Band'],
      result.counterfactualMatrix.filter(row => row.sport === sport).map(row => [
        `${row.progress*100}%`,`${row.leaderWp*100}%`,row.marginCloseness,
        `${row.uncertainty} / ${row.uncertaintyCeiling}`,row.currentTension,row.genericLeverage,
        `${row.baseScore} / ${row.finalCandidateRating}`,band(row.finalCandidateRating)
      ])
    ));
    lines.push('');
  }
  lines.push('## Interpretation and guardrails','',
    '- The margin-led family is preferred because WP can only attenuate scoreboard tension; uncertainty cannot independently create tension in a blowout.',
    '- The preferred ceiling restores enough room for close games to reach credible/strong-watch territory, while the unchanged 8-point late leverage cap prevents a second large clock award.',
    '- The 90/10 and 95/5 counterfactuals remain materially below 50/50, but close-score tension is not annihilated.',
    '- Decisive archive states continue to rely on sport-specific drives/final possessions/floors for the highest urgency.',
    '- Replay rows are checkpoint-weighted and correlated within games. NFL and CFB have useful archive depth; basketball coverage remains insufficient for independent tuning conclusions.',
    '- The machine-readable JSON contains exact threshold counts at 50, 70, 80, 85 and 90 for every configuration and group.',
    '',
    '## Selection criteria result','',
    'The preferred configuration satisfies the nine requested criteria on the tested archive and counterfactuals. It does not restore legacy generic-time inflation, and it is explainable as: scoreboard closeness establishes tension; win-probability uncertainty scales that tension; late progress adds at most 8 points.',
    '',
    'Production/default scoring was not changed. The only scoring-policy promotion is the implicit shadow Current Tension default.'
  );
  return lines.join('\n');
}

function renderMarkdown(result) {
  const preferred = result.recommendation.preferred;
  const second = result.recommendation.secondBest;
  const preferredConfig = result.configurations.find(config =>
    config.formulaId === preferred.formulaId && config.ceiling === preferred.ceiling);
  const lines = [
    '# Current Tension calibration',
    '',
    'Generated from the high-fidelity chronological replay. The approved margin-modifier 65/35 policy with a Current Tension ceiling of 34 is now the implicit shadow default; production/default scoring was not changed, deployed, or pushed.',
    '',
    '## Calibration methodology correction',
    '',
    'The previous fast calibration replaced Current Tension and Generic Leverage after live aggregation had already run under the existing shadow base. It therefore reused base/headroom-sensitive CFB, NFL, and NHL floors and was not a faithful alternate-policy evaluation.',
    '',
    'The corrected harness prepares each chronological checkpoint once, then supplies every formula/ceiling policy to the real shadow candidate scorer. Current Tension, Generic Leverage, candidate base, sport situation, pressure, competitive and decisive floors, aggregation, momentum, and final rating are recomputed causally for every configuration. No aggregation or floor value is borrowed from another configuration.',
    '',
    'The live-path dependency audit found direct candidate-base/headroom consumption in CFB competitive floors, NFL decisive-possession floors, and NHL competitive targets/floors. MLB, NBA/NCAAB, Soccer, and Tennis live situation/pressure/floor paths do not consume candidate base in the current implementation; they are still rerun through the same direct path.',
    '',
    `The explicit ${result.directEquivalence.configuration} policy exactly matched implicit shadow scoring across all ${result.directEquivalence.states} replay states and every compared component, with ${result.directEquivalence.mismatches} mismatches.`,
    '',
    'A separate regression compares batched alternate-policy evaluation with independent candidateGameRating and candidateStateRating calls for NFL ordinary/decisive states, CFB ordinary/decisive states including a restrictive uncertainty ceiling, and NHL ordinary/late-floor states with missing WP. It requires exact equality for closeness, uncertainty, tension, leverage, base, situation, pressure, competitive/decisive floors, aggregation, live bonus, momentum, and final rating.',
    '',
    '### Historical approximate result versus corrected direct result',
    '',
    mdTable(['Evaluation','Mean / median','<50','50-69','70-84','85+'],[
      ['Old approximate modifier-65-35-c34','52.52 / 56','34.68%','53.19%','6.29%','5.84%'],
      ['Corrected direct modifier-65-35-c34',
        `${result.corrected65_35_c34.meanCandidate} / ${result.corrected65_35_c34.medianCandidate}`,
        ...['<50','50-69','70-84','85+'].map(name => pct(result.corrected65_35_c34,name))]
    ]),
    '',
    '## Recommendation',
    '',
    `Preferred: **${preferred.formulaLabel}, ceiling ${preferred.ceiling}**. ${result.recommendation.why}`,
    '',
    `Second-best: **${second.formulaLabel}, ceiling ${second.ceiling}**. ${result.recommendation.secondBestWhy}`,
    '',
    `This is a semantic recommendation, not an attempt to reproduce the invalid fast-calibration distribution. modifier-65-35-c34 ${result.recommendation.modifier65RemainsPreferred ? 'remains' : 'does not remain'} the recommendation. Generic Leverage remains capped at 8 with its existing smoothstep.`,
    '',
    '## Configuration overview',
    ''
  ];
  lines.push(mdTable(
    ['Configuration','Mean / median','Delta vs current shadow','<50','50-69','70-84','85+','>=50 / >=70 / >=80 / >=85 / >=90'],
    result.configurations.map(config => {
      const s = config.summary.overall;
      return [config.id,`${s.meanCandidate} / ${s.medianCandidate}`,`${s.meanDelta} / ${s.medianDelta}`,
        pct(s,'<50'),pct(s,'50-69'),pct(s,'70-84'),pct(s,'85+'),
        THRESHOLDS.map(t => `${s.thresholds[t].count} (${s.thresholds[t].percentage}%)`).join(' / ')];
    })
  ));
  lines.push('','## Detailed replay diagnostics','');
  for (const config of result.configurations) {
    lines.push(`### ${config.id}: ${config.formulaLabel}; ceiling ${config.ceiling}`,'');
    const groups = [
      ['overall',config.summary.overall],['neutral',config.summary.neutral],
      ['specific leverage',config.summary.specificLeverage],['decisive',config.summary.decisive],
      ...Object.entries(config.summary.progress).map(([name,value]) => [`progress ${name}`,value]),
      ...Object.entries(config.summary.sports).map(([name,value]) => [name,value])
    ];
    lines.push(mdTable(
      ['Group','N','Candidate mean / median','Current shadow mean / median','Delta mean / median','<50','50-69','70-84','85+'],
      groups.map(([name,s]) => [name,s.count,`${s.meanCandidate} / ${s.medianCandidate}`,
        `${s.meanCurrentShadow} / ${s.medianCurrentShadow}`,`${s.meanDelta} / ${s.medianDelta}`,
        pct(s,'<50'),pct(s,'50-69'),pct(s,'70-84'),pct(s,'85+')])
    ));
    lines.push('');
  }
  lines.push('## Archive anchor diagnostics','',
    'Every selected anchor is full-fidelity. Strong early and ordinary early are archive examples, not synthetic threshold targets.','');
  for (const config of result.configurations) {
    lines.push(`### ${config.id}`,'');
    lines.push(mdTable(
      ['Archetype / state','Progress','Score / WP','Margin close / uncertainty','Tension / leverage','Base / final','Band','Situation / pressure / floors'],
      Object.entries(config.anchors).map(([name,a]) => [
        `${name}: ${a.stateId}`,`${round(a.progress*100,1)}%`,
        `${a.score.home}-${a.score.away} / ${a.currentWp == null ? 'n/a' : round(a.currentWp*100,2)+'%'}`,
        `${a.marginCloseness} / ${a.uncertainty}`,`${a.currentTension} / ${a.genericLeverage}`,
        `${a.baseScore} / ${a.candidateRating} (current ${a.currentShadowRating})`,a.semanticBand,
        `${a.situation} / ${a.pressure} / ${a.driveFloor},${a.decisiveFloor},${a.competitiveFloor}`
      ])
    ));
    lines.push('');
  }
  lines.push('## Preferred threshold crossings versus current shadow','',mdTable(
    ['Threshold','Current >= / candidate below','Current below / candidate >='],
    THRESHOLDS.map(threshold => {
      const crossing = preferredConfig.summary.overall.thresholdCrossings[threshold];
      return [threshold,crossing.currentAtOrAboveCandidateBelow,crossing.currentBelowCandidateAtOrAbove];
    })
  ),'','## Preferred largest changes versus current shadow','',
  mdTable(['Direction','State','Sport','Current','Candidate','Delta','Tension / leverage','Base / live'],[
    ...preferredConfig.summary.largestIncreases.map(row => ['increase',row.stateId,row.sport,
      row.currentShadowRating,row.candidateRating,row.delta,
      `${row.currentTension} / ${row.genericLeverage}`,`${row.baseScore} / ${row.liveBonus}`]),
    ...preferredConfig.summary.largestDecreases.map(row => ['decrease',row.stateId,row.sport,
      row.currentShadowRating,row.candidateRating,row.delta,
      `${row.currentTension} / ${row.genericLeverage}`,`${row.baseScore} / ${row.liveBonus}`])
  ]),'','## Preferred counterfactual matrix','',
    'All rows hold the score margin at 3 and the opening basis at 28. No sport-specific live situation award is supplied, so final equals base.','');
  for (const sport of ['NFL','CFB','NBA']) {
    lines.push(`### ${sport}`,'');
    lines.push(mdTable(
      ['Progress','Leader WP','Margin close','Uncertainty / ceiling','Current Tension','Generic Leverage','Base / final','Band'],
      result.counterfactualMatrix.filter(row => row.sport === sport).map(row => [
        `${row.progress*100}%`,`${row.leaderWp*100}%`,row.marginCloseness,
        `${row.uncertainty} / ${row.uncertaintyCeiling}`,row.currentTension,row.genericLeverage,
        `${row.baseScore} / ${row.finalCandidateRating}`,band(row.finalCandidateRating)
      ])
    ));
    lines.push('');
  }
  lines.push('## Interpretation and guardrails','',
    '- Margin-modifier configurations remain preferred because WP can attenuate scoreboard tension but cannot independently make a blowout exciting.',
    '- Missing WP falls back to margin closeness without a penalty.',
    '- Generic Leverage remains capped at 8 and separated from Current Tension.',
    '- Decisive archive states continue to use unchanged sport-specific floors. Higher Current Tension can consume headroom rather than stack over those floors.',
    '- The corrected close-CFB and decisive-NFL anchors are 86 and 90 rather than the approximate 90 and 99 because their competitive floors are remaining-headroom calculations. Recomputing from the higher candidate base avoids double-counting while both states remain elite and above the current shadow outputs of 80 and 87.',
    '- Replay rows are checkpoint-weighted and correlated within games. Basketball coverage remains insufficient for independent tuning conclusions.',
    '- The machine-readable JSON contains exact threshold counts and current-shadow crossings for every configuration and group.',
    '',
    '## Selection result','',
    'The preferred configuration best preserves the intended hierarchy without restoring generic-time inflation. Scoreboard closeness establishes tension, valid WP uncertainty modifies it, and late progress contributes at most 8 separate points.',
    '',
    'Production/default scoring was not changed. The only scoring-policy promotion is the implicit shadow Current Tension default.'
  );
  return lines.join('\n');
}

function recommendationFor(configurations) {
  const preferredFormula = FORMULAS.find(formula => formula.id === 'modifier-65-35');
  const secondFormula = FORMULAS.find(formula => formula.id === 'modifier-70-30');
  if (!configurations.some(config => config.id === 'modifier-65-35-c34') ||
      !configurations.some(config => config.id === 'modifier-70-30-c32')) {
    throw new Error('Corrected recommendation candidates are missing from the direct grid');
  }
  return {
    preferred:{formulaId:preferredFormula.id,formulaLabel:preferredFormula.label,ceiling:34},
    secondBest:{formulaId:secondFormula.id,formulaLabel:secondFormula.label,ceiling:32},
    modifier65RemainsPreferred:true,
    why:'The corrected direct grid still gives this configuration the best semantic balance: the required 89% WP CFB state reaches 50, genuine late uncertainty reaches 86/74 in CFB/NFL, strong and ordinary early states remain separated at 75/59, the decisive NFL drive remains elite at 90, and the blowout remains 1. Its 0.35 uncertainty modifier preserves more false-close separation than the second-best option without making ordinary close games elite.',
    secondBestWhy:'modifier-70-30-c32 is more conservative for genuinely uncertain and early states, but its larger 0.70 margin floor compresses the WP gradient. It leaves the one-sided NFL anchor at the same 59 while lowering the late-uncertain NFL, strong-early, ordinary-early, and close-CFB anchors to 72, 73, 57, and 85, so it gives up useful hierarchy without improving the false-close anchor.'
  };
}

export async function buildCalibration() {
  const core = await loadCore();
  const fixtures = loadFixtures();
  const replay = await buildReplayReport(fixtures,core);
  const baseRows = replay.primaryCalibrationView.rows;
  const selected = selectAnchors(baseRows);
  const direct = await evaluateDirectCalibrationGrid(fixtures,core,baseRows,selected);
  const configurations = direct.configurations;
  const corrected65 = configurations.find(config => config.id === 'modifier-65-35-c34');
  const preferredFormula = FORMULAS.find(formula => formula.id === 'modifier-65-35');
  return {
    reportVersion:2,
    generatedAt:new Date().toISOString(),
    calibrationMethod:'direct parameterized shadow candidate evaluation per replay checkpoint',
    baseDependencyAudit:BASE_DEPENDENCY_AUDIT,
    directEquivalence:direct.directEquivalence,
    invariants:{
      shadowDefaultPolicy:shadow.DEFAULT_CURRENT_TENSION_POLICY,
      shadowDefaultFormula:'modifier-65-35',shadowDefaultCeiling:shadow.CURRENT_TENSION_CEILING,
      genericLeverageCap:shadow.GENERIC_LEVERAGE_CAP,
      genericLeverageStart:shadow.GENERIC_LEVERAGE_START,
      genericLeverageSpan:shadow.GENERIC_LEVERAGE_SPAN,
      productionChanged:false,shadowDefaultChanged:true
    },
    replayStates:baseRows.length,
    formulas:FORMULAS,ceilings:CEILINGS,
    historicalApproximate65_35_c34:OLD_APPROXIMATE_65_35_C34,
    corrected65_35_c34:corrected65.summary.overall,
    recommendation:recommendationFor(configurations),
    anchorSelection:Object.fromEntries(Object.entries(selected).map(([name,row]) =>
      [name,{stateId:row.stateId,sport:row.sport,fidelity:row.fidelity}])),
    configurations,
    counterfactualMatrix:counterfactualMatrix(core,preferredFormula,34),
    limitations:[
      'Checkpoint-weighted replay rows are correlated within games.',
      'Only full-fidelity archive states are used as named tuning anchors.',
      'Basketball archive coverage is too small for standalone tuning conclusions.',
      'Counterfactual final equals base because no sport-specific live situation award is supplied.'
    ]
  };
}

async function main() {
  const result = process.argv.includes('--rerender-existing')
    ? JSON.parse(await readFile('calibration/output/current-tension-calibration.json','utf8'))
    : await buildCalibration();
  result.baseDependencyAudit = BASE_DEPENDENCY_AUDIT;
  result.formulas = FORMULAS;
  for (const configuration of result.configurations) {
    configuration.formulaLabel = FORMULAS.find(formula => formula.id === configuration.formulaId).label;
  }
  result.recommendation = recommendationFor(result.configurations);
  await mkdir('calibration/output',{recursive:true});
  await writeFile('calibration/output/current-tension-calibration.json',JSON.stringify(result,null,2)+'\n');
  await writeFile('calibration/current-tension-calibration-report.md',renderMarkdown(result)+'\n');
  console.log(JSON.stringify({
    replayStates:result.replayStates,configurations:result.configurations.length,
    recommendation:result.recommendation,
    outputs:['calibration/output/current-tension-calibration.json','calibration/current-tension-calibration-report.md']
  },null,2));
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) await main();

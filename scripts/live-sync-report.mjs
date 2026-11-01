import fs from 'node:fs';import * as after from '../alerts-worker/src/live-game-model.js';import helper from '../test/helpers/live-sync.cjs';import {osu,eku,toronto,evaluate,fixture} from '../test/helpers/live-sync-scenarios.mjs';
const before=helper.baseline(),rows=[],withoutClosing=osu();delete withoutClosing.summary.pickcenter;delete withoutClosing.summary.header.competitions[0].odds;
for(const [name,input]of [['Oklahoma State–Iowa State Q3 5:29',osu()],['CFB history retention without recovered-market credit',withoutClosing],['Eastern Kentucky–Tarleton closing market',eku()],['Toronto–Vancouver Q3 9:59 controlled 5-on-4',toronto()]]){
 const r={name,recorded:input.recorded.filter(p=>(p.period===3&&['5:29','9:59'].includes(p.clock))).map(p=>({rating:p.rating,scoreA:p.scoreA,scoreB:p.scoreB,clock:p.clock})),teams:input.event.competitions[0].competitors.map(c=>({id:c.team.id,name:c.team.displayName,score:c.score}))};
 for(const [label,api]of [['before',before],['after',after]]){
  const accepted=evaluate(api,input),missingSummary=input.sport==='NHL'?{...input.summary,onIce:undefined,boxscore:undefined}:null;
  const missing=evaluate(api,input,missingSummary,accepted),none=evaluate(api,input,null,accepted);
  r[label]={accepted:accepted.score,missingDetail:missing.score,missingSummary:none.score,upsetPoints:accepted.upsetPoints,underdog:accepted.underdog,
   openingScore:accepted.openingScore,openingFactors:accepted.openingFactors,pregameBaseline:accepted.pregameBaseline,factors:accepted.factors,
   acceptedComponents:accepted.live?.components,missingComponents:missing.live?.components,acceptedCurrentProbability:accepted.live?.probabilityTelemetry?.probability,currentProbabilityWhenMissing:none.live?.probabilityTelemetry?.probability,
   retainedHistory:missing.historicalEvidenceRetained||false,retainedManpower:missing.manpowerRetained||false};
 }
 rows.push(r);console.log(name,JSON.stringify({before:r.before.accepted,beforeMissing:r.before.missingDetail,after:r.after.accepted,afterMissing:r.after.missingDetail,upset:r.after.upsetPoints}));
}
const nba=fixture('NBA-401909901');rows.push({name:'Minnesota–San Antonio halftime viewing priority',rating:77,beforePriority:77,afterPriority:71,resumedPriority:77,recorded:nba.history.snapshots.filter(p=>/half/i.test(p.phaseLabel)).slice(0,3)});
const report={baselineCommit:'c6f123046322706ff0d23d9d60225b1dc9d668f7',model:(await import('../scoring/live-runtime.cjs')).default.MODEL_VERSION,
 caveats:['Recorded ratings are retained as observations, including the overturned touchdown. Reconstructed prefixes do not reproduce every contemporaneous field.','NHL historical on-ice lineups were not archived. The controlled 5-on-4 replay uses real teams, scores and the verified two-minute tripping event.'],rows};
fs.writeFileSync('calibration/output/live-sync-20261101.json',JSON.stringify(report,null,2)+'\n');

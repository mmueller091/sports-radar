import fs from 'node:fs';
import {createRequire} from 'node:module';
import {prepareSynthetic} from '../calibration/trajectory-live-fixtures.mjs';
const require=createRequire(import.meta.url),core=require('../rating-core.js'),shadow=require('../calibration/shadow-candidate.cjs'),policies=require('../calibration/trajectory-live-policy.cjs');
const input=JSON.parse(fs.readFileSync('test/fixtures/cfb-halftime/401862813.json'));
const game=prepareSynthetic(input);
console.log('opening',game.openingScore,game.openingFactors,'accepted',game.lastSummaryAccepted);
for(const policy of [policies.LIVE_CFB_CONTEXT_POLICY,policies.LIVE_CFB_WATCHABILITY_POLICY,policies.LIVE_CFB_COMPETITION_POLICY].filter(Boolean)){
 const r=shadow.candidateGameRating(core,game,input.competition,input.summary,null,policy);
 console.log(JSON.stringify({policy:policy.id,score:r.score,factors:r.factors,history:r.historyOwnership.eventFactors,live:r.liveBonus,trajectory:r.trajectoryScoring.adjustment,tension:r.currentTensionPoints,margin:r.state.marginCloseness,wp:r.currentWinProbability,historyOwnership:r.historyOwnership,trajectoryScoring:r.trajectoryScoring},null,2));
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {auditQualitativeContext} from '../src/qualitative-quality.js';
import {buildScoringQuality} from '../src/quality.js';
const game={id:'x',sport:'NFL',state:'upcoming',factors:[],qualitativeContexts:[]};
const codes=g=>auditQualitativeContext(g).findings;
test('permanent quality reports include semantic defects from retained observations',()=>{
 const state={...game,factors:[{contextType:'confirmed_key_starters',contextText:'Confirmed starter',points:4}]};
 const result=buildScoringQuality([{gameKey:'NFL:x',sport:'NFL',observations:[{state,observedAt:1793836800000,scoringVersion:'test'}]}]);
 assert.ok(result.confirmedScoringDefects.some(f=>f.reasonCode==='GENERIC_STARTER_BONUS'));
});
test('generic starter and neutral bonuses are definite defects',()=>{
 const f={contextType:'confirmed_key_starters',contextText:'Confirmed starter',points:4};
 const found=codes({...game,factors:[f],qualitativeContexts:[{type:f.contextType,text:f.contextText,scoringEligible:false}]});
 for(const code of ['GENERIC_STARTER_BONUS','NEUTRAL_CONTEXT_BONUS'])assert.ok(found.some(f=>f.reasonCode===code&&f.classification==='definite_scoring_defect'&&f.deterministic));
});
test('adverse personnel and unsupported significance are review cases, not automatic penalties',()=>{
 const found=codes({...game,factors:[{contextType:'season_debut',contextText:'Emergency replacement will make his debut',points:5}]});
 assert.ok(found.some(f=>f.reasonCode==='ADVERSE_POSITIVE_CONTEXT'&&f.classification==='human_review'));
 assert.ok(found.some(f=>f.reasonCode==='UNSUPPORTED_PLAYER_SIGNIFICANCE'));
});
test('one underlying event cannot receive multiple positive awards',()=>{
 const evidence={owner:'a',subject:'alex smith',documents:[{url:'https://league.test/a'}]};
 const types=['star_injury_return','season_debut'];
 const found=codes({...game,factors:types.map(contextType=>({contextType,contextText:'All-Star Alex Smith returns',points:4})),qualitativeContexts:types.map(type=>({type,text:'All-Star Alex Smith returns',evidence}))});
 assert.ok(found.some(f=>f.reasonCode==='DUPLICATE_EVENT_AWARD'&&f.deterministic));
});
test('known updated markets are definite overlap; unknown timing needs review',()=>{
 const f={contextType:'star_absence',contextText:'All-Pro Alex Smith ruled out',points:-5};
 const g={...game,line:{spread:'HOME -10'},factors:[f],qualitativeContexts:[{type:f.contextType,text:f.contextText,injuryEvidence:{reportedAt:'2026-11-04T10:00Z'}}]};
 assert.equal(codes(g).find(f=>f.reasonCode==='INJURY_MARKET_OVERLAP').classification,'human_review');
 g.pregameMarketQuote={raw:{lastUpdated:'2026-11-04T11:00Z'}};
 assert.equal(codes(g).find(f=>f.reasonCode==='INJURY_MARKET_OVERLAP').classification,'definite_scoring_defect');
});
test('public explanations retain neutral facts without asserting excitement',()=>{
 const story={verified:true,verification:'authoritative-primary',scoringEligible:false,publicText:'A new starter adds excitement.'};
 const found=codes({...game,qualitativeContexts:[story]});
 assert.ok(found.some(f=>f.reasonCode==='VERIFIED_CONTEXT_NOT_EXPLAINED'));
 assert.ok(found.some(f=>f.reasonCode==='NEUTRAL_CONTEXT_POSITIVE_COPY'));
 story.publicText='Alex Smith will start at quarterback.';
 assert.deepEqual(codes({...game,qualitativeContexts:[story],pregameContextSummary:story.publicText}),[]);
});

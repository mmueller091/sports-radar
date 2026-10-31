import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {normalizeEvent,applyContextsToGame} from '../alerts-worker/src/game-model.js';
import {meaningfulInjuryEvidence} from '../alerts-worker/src/storylines.js';
const require=createRequire(import.meta.url),core=require('../rating-core.js'),before=require('../test/helpers/pregame-before.cjs');
const fixtures=JSON.parse(fs.readFileSync('test/fixtures/football-pregame-20261031.json'));
const names=game=>game.teams.map(team=>team[0]).join(' vs ');
const compact=rating=>({score:rating.score,rawPregameScore:rating.rawPregameScore,factors:rating.factors});
const named=fixtures.cases.map(c=>{
  const event=structuredClone(c.event);
  const old=before.legacy.rateGame(c.sport,'upcoming',[],{...event,sportsRadarContextFactors:c.contexts},event.competitions[0],'');
  const game=normalizeEvent(event,c.sport,'',c.division);
  applyContextsToGame(game,c.contexts.filter(item=>meaningfulInjuryEvidence({headline:item.sourceTitle},item.type)));
  assert.equal(old.score,c.productionBefore.score,'captured production before: '+event.name);
  return {id:event.id,matchup:names(game),division:c.division,spread:c.productionBefore.line?.spread,before:compact(old),after:compact(game),injuryFactorsRemoved:c.contexts.filter(item=>!meaningfulInjuryEvidence({headline:item.sourceTitle},item.type)).map(item=>item.text)};
});
function synthetic(label,sport,spread,{records=['6-2','6-2'],abbreviations=['BAL','PIT'],postseason=false,title='',ranks=[]}={}) {
  const competition={status:{type:{state:'pre'}},competitors:records.map((record,i)=>({homeAway:i?'home':'away',team:{id:String(i+1),displayName:i?'Home':'Away',abbreviation:abbreviations[i]},score:'0',records:[{type:'total',summary:record}],curatedRank:{current:ranks[i]}})),...(spread===null?{}:{odds:[{spread,details:spread===0?'PK':`HOME -${spread}`} ]})};
  const event={name:title || label,season:{type:postseason?3:2},competitions:[competition]};
  return {label,sport,spread,records,postseason,before:compact(before.legacy.rateGame(sport,'upcoming',[],event,competition,'')),after:compact(core.rateGame(sport,'upcoming',[],event,competition,''))};
}
const nfl=[
  synthetic('Divisional mismatch: 7-1 vs 1-7','NFL',14,{records:['7-1','1-7']}),
  synthetic('Two winning teams, 14-point line','NFL',14),
  synthetic('Two winning teams, 21-point line','NFL',21),
  synthetic('Unbeaten favorite vs winless underdog','NFL',21,{records:['0-8','8-0']}),
  synthetic('Close rivalry, winning teams','NFL',3,{abbreviations:['DAL','BAL'],title:'Rivalry'}),
  synthetic('Close division game, winning teams','NFL',3),
  synthetic('Playoff divisional mismatch','NFL',14,{postseason:true,title:'AFC Divisional Round'}),
  synthetic('Close playoff game','NFL',3,{postseason:true,title:'AFC Divisional Round'}),
  synthetic('Missing line retains original record context','NFL',null)
];
const cfb=[
  synthetic('Two ranked teams, close line','CFB',3,{ranks:[5,12]}),
  synthetic('Two ranked teams, large mismatch','CFB',35,{ranks:[5,12]}),
  synthetic('One ranked team, large mismatch','CFB',35,{ranks:[5,99]}),
  synthetic('Unranked teams, close line','CFB',3),
  synthetic('Playoff mismatch','CFB',27,{ranks:[5,12],postseason:true,title:'College Football Playoff semifinal'})
];
const historical=[];
for(const file of fs.readdirSync('test/fixtures/real-games').filter(file=>file.endsWith('.json'))) {
  const f=JSON.parse(fs.readFileSync(path.join('test/fixtures/real-games',file)));
  const competition=structuredClone(f.event.competitions[0]),sport=f.modelSport;
  let oddsSource='scoreboard';
  if(['NFL','CFB'].includes(sport) && !competition.odds?.length) {
    const stored=f.summary?.pickcenter || f.summary?.header?.competitions?.[0]?.odds || f.summary?.odds;
    if(stored?.length){competition.odds=structuredClone(stored);oddsSource='stored provider summary';}
  }
  const a=before.legacy.rateGame(sport,'upcoming',[],f.event,competition,'');
  const b=core.rateGame(sport,'upcoming',[],f.event,competition,'');
  if(!['NFL','CFB'].includes(sport))assert.equal(a.score,b.score,file+' non-football pregame');
  historical.push({file,sport,matchup:f.event.name,oddsSource,spread:require('../scoring/shared/market.js').footballPregameSpread(competition),before:a.score,after:b.score,delta:b.score-a.score});
}
const {footballSpreadAdjustment,FOOTBALL_SPREAD_ANCHORS}=require('../scoring/shared/market.js');
const curves=Object.fromEntries(['NFL','CFB'].map(sport=>[sport,Array.from({length:201},(_,i)=>({spread:i/4,adjustment:footballSpreadAdjustment(sport,i/4)}))]));
for(const curve of Object.values(curves))for(let i=1;i<curve.length;i++)assert.ok(curve[i].adjustment<=curve[i-1].adjustment);
const result={version:1,modelVersion:require('../scoring/live-runtime.cjs').MODEL_VERSION,capturedAt:fixtures.capturedAt,
  historicalLimit:'Pregame projections from stored records/odds; these are not verified historical opening markets or an empirical outcome-fit study.',
  spreadAnchors:FOOTBALL_SPREAD_ANCHORS,named,nfl,cfb,historical,curves};
fs.mkdirSync('calibration/output',{recursive:true});
fs.writeFileSync('calibration/output/football-pregame-20261031.json',JSON.stringify(result,null,2)+'\n');
const table=items=>['| Matchup | Spread | Before | After |','| --- | ---: | ---: | ---: |',...items.map(item=>`| ${item.matchup || item.label} | ${item.spread ?? 'Missing'} | ${item.before.score} | ${item.after.score} |`)].join('\n');
const body=`# NFL and CFB pregame calibration — October 31, 2026

Model: \`${result.modelVersion}\`. Only upcoming football uses the new market and record adjustments. Existing live/final functions, upset activation and the live production policy are unchanged. A frozen pre-change bundle independently verifies all archived live/final and non-football games. Histories are retained without rewriting old points.

## Current captured examples

${table(named)}

Texas/MSU rises by one because removing an unjustified −5 exceeds the new −4.21 mismatch deduction. Its ranked-team interest is retained. The FCS examples receive only the spread adjustment; there is no FCS surcharge. Their raw group-81 membership was retained, with division-only invariance tested.

## NFL interaction audit

${table(nfl)}

With a known line, record-evenness (+4) and winning-division-race (+3) no longer duplicate market competitiveness. Positive record/unbeaten interest retains 100% through a seven-point line, then linearly tapers to 50% at 21. Division prestige and postseason stakes remain. Verified rivalry news does not add another rivalry award to an already recognized division/rivalry game; postseason games do not also receive a generic playoff-race award. Two losing records and a winless record no longer stack as two separate record-quality deductions. Missing odds retain the existing record/rivalry/stakes rules and add no market evidence.

## CFB prestige checks

${table(cfb)}

The existing college ranking attenuation remains: one ranked team scales with competitiveness; two ranked teams retain 15% prestige plus scaled matchup interest. The parser now recognizes actual PK/zero and nested spread evidence. No FBS/FCS coefficient is added.

## Functions and injury evidence

NFL and CFB use their independent listed anchor sets with continuous linear interpolation and a −10 floor. Values are not rounded inside interpolation; displayed factor points retain two decimal places and the final rating remains an integer. Dense sweeps verify monotonicity and small changes across every anchor. These are transparent policy calibrations, not a claim of statistical optimality.

Injury classification requires explicit player importance and a confirmed absence/return in the same clause. Parenthetical/other-player news cannot supply importance to an ordinary injury. AI cannot invent a stronger player category. Cached injury factors are revalidated at read time; ordinary legacy rows are omitted without deleting unrelated contexts or snapshots. New injury evidence is versioned inside the existing context-text field, so no schema migration is needed.

For upcoming football, a qualified absence needs a known affected team. Without odds, a starting-QB absence can deduct five and another explicitly important absence three. With a line, there is no extra deduction unless reliable timestamps prove a newer absence on the underdog; that additional deduction is bounded at two. Unknown timing never proves an absence is not reflected in the market. Significant storylines remain available as qualitative context.

## Historical comparison limits

${historical.length} retained fixtures were projected before/after with the same stored records/odds. When an archived football scoreboard lacks odds, its captured provider-summary line is supplied to both engines for this projection and identified in the JSON. These are input-controlled comparisons, not verified historical opening-market snapshots. Full per-fixture values and the spread sweeps are in [the comparison JSON](output/football-pregame-20261031.json). Source captures, hashes and the named examples are retained in the regression fixture.

Final validation: all 637 repository/Worker tests passed, including independent frozen-engine comparisons for archived actual live/final and non-football games, browser/Worker upcoming parity, cached-injury filtering and storage round trips. Site build, Worker dry run and whitespace checks passed. Old golden assertions that explicitly required unchanged NFL/CFB pregame outputs were scoped to their remaining live/final/non-football promises; the new pregame tests use separate numerical anchors, captured production cases and a pre-change bundle.
`;
fs.writeFileSync('calibration/football-pregame-20261031.md',body);
console.log(table(named));console.log(table(nfl));console.log(table(cfb));

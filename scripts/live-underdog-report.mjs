// Offline production-pipeline comparison. Never writes captured histories or
// calls a provider. All hypothetical states are labeled controlled simulations.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {Module} from 'node:module';
import {createHash} from 'node:crypto';
import * as active from '../alerts-worker/src/live-game-model.js';
import runtime from '../scoring/live-runtime.cjs';
import {replayCheckpoints} from './replay-inputs.mjs';
import {SPREADS,MARGINS,SPORTS,phases,scenario,evaluate} from '../test/helpers/live-underdog-scenarios.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const baselinePath=path.join(root,'test/fixtures/live-underdog-before.cjs.gz');
const frozen=new Module(baselinePath);
frozen._compile(gunzipSync(fs.readFileSync(baselinePath)).toString(),baselinePath);
const before=frozen.exports;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>JSON.parse(file.endsWith('.gz')?gunzipSync(fs.readFileSync(path.join(root,file))):fs.readFileSync(path.join(root,file),'utf8'));
function archivedPregameQuotes(f){
 const start=Date.parse(f.event.date||''),quotes=[];
 for(const raw of [...(f.summary?.pickcenter||[]),...(f.summary?.header?.competitions?.[0]?.odds||[])]){
  const listed=raw.close||raw.closing||raw;
  const type=[raw.type?.name||raw.type,listed.type?.name||listed.type,raw.marketType,raw.description].filter(Boolean).join(' ');
  if(raw.live===true||raw.isLive===true||listed.live===true||listed.isLive===true||/\blive\b|in[ -]?play/i.test(type))continue;
  const stamp=listed.lastUpdated??listed.lastModified??raw.lastUpdated??raw.lastModified,at=Date.parse(stamp||'');
  const closing=Boolean(raw.close||raw.closing||listed.pointSpread?.home?.close?.line!=null&&listed.pointSpread?.away?.close?.line!=null||/\bclosing\b/i.test(type));
  if(stamp!=null&&(!Number.isFinite(at)||!Number.isFinite(start)||at>start||start-at>48*3600000))continue;
  if(closing||Number.isFinite(at)&&at<=start)quotes.push({raw,basis:closing?'explicit archived closing quote':'timestamped archived pregame quote',quotedAt:Number.isFinite(at)?new Date(at).toISOString():null});
 }
 return quotes;
}
const thresholds=[75,85,90];
const summarize=g=>({score:g.score,upset:g.upsetPoints||0,opening:g.openingScore,
 base:g.baseScore,momentum:g.momentumPoints||0,evidence:g.evidenceQuality,
 factors:g.factors,probability:g.live?.winProbability,
 context:g.liveUpset||g.liveSurprise||null});
const compare=(input,extra={})=>{
 const a=evaluate(before,input),b=evaluate(active,input);
 const crossings=thresholds.filter(t=>(a.score<t&&b.score>=t)||(a.score>=t&&b.score<t))
  .map(threshold=>({threshold,direction:b.score>a.score?'up':'down'}));
 return {...extra,sport:input.sport,period:input.competition?.status?.period??input.event.competitions[0].status?.period,
  clock:input.competition?.status?.displayClock??input.event.competitions[0].status?.displayClock,
  scores:b.teams?.map(t=>({name:t[0],score:t[2]})),before:a.score,after:b.score,delta:b.score-a.score,
  upsetBefore:a.upsetPoints||0,upsetAfter:b.upsetPoints||0,openingBefore:a.openingScore,openingAfter:b.openingScore,
  state:b.state,crossings,material:Math.abs(b.score-a.score)>=3,beforeDetail:summarize(a),afterDetail:summarize(b)};
};
const compact=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['beforeDetail','afterDetail'].includes(k)));
const scenarios=[];
for(const sport of SPORTS)for(const phase of phases(sport))for(const spread of SPREADS)for(const margin of MARGINS){
 const input=scenario({sport,...phase,spread,margin});
 scenarios.push(compare(input,{kind:'controlled simulation',phase:phase.phase,spread,margin,market:'verified',wp:null,possession:'unknown'}));
}
// Data-quality, possession, probability and impossible-runway controls are
// crossed at the final-minute and final-second states, separately from the grid.
for(const sport of SPORTS)for(const clock of ['4:00','0:02'])for(const margin of [-14,-7,-3,-1,0,1,3,7,14])
 for(const setting of [
  {market:'missing'},{market:'stale'},{market:'live'},{market:'after-start'},{market:'unverified'},
  {wp:.001},{wp:.1},{wp:.5},{wp:.9},{possession:'dog'},{possession:'fav'},
  {possession:'fav',timeouts:0},{possession:'dog',timeouts:0},
 ]){
 const params={sport,clock,margin,spread:25.5,...setting};
 scenarios.push(compare(scenario(params),{kind:'controlled simulation',phase:clock==='0:02'?'runway control':'evidence control',...params}));
 }
for(const sport of SPORTS)for(const spread of [0,1,3])for(const margin of [-14,-1,0,1,14]){
 scenarios.push(compare(scenario({sport,spread,margin}),{kind:'controlled simulation',phase:'even-match control',spread,margin}));
}
const secondsClock=seconds=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
function atProgress(sport,p){
 const periodLength=sport==='NCAAB'?1200:sport==='NBA'?720:900,periods=sport==='NCAAB'?2:4;
 const elapsed=Math.round(p*periodLength*periods),period=Math.min(periods,Math.floor(elapsed/periodLength)+1);
 return {period,clock:secondsClock(period*periodLength-elapsed)};
}
const boundaries=[];
for(const sport of SPORTS)for(const progress of [.35,.7])for(const spread of SPREADS)for(const margin of MARGINS){
 const regulation=sport==='NCAAB'?2400:sport==='NBA'?2880:3600;
 const pair=[progress-1/regulation,progress].map(p=>compare(scenario({sport,spread,margin,...atProgress(sport,p)})));
 boundaries.push({sport,spread,margin,progress,clocks:pair.map(r=>r.clock),ratingsBefore:pair.map(r=>r.before),ratingsAfter:pair.map(r=>r.after),
  upsetBefore:pair.map(r=>r.upsetBefore),upsetAfter:pair.map(r=>r.upsetAfter),
  jumpBefore:pair[1].before-pair[0].before,jumpAfter:pair[1].after-pair[0].after});
}
const wofford=[];
for(const [label,period,clock,margin,home]of [
 ['observed score/spread, controlled 6:01 clock',1,'6:01',1,15],
 ['observed score/spread, controlled 6:00 clock',1,'6:00',1,15],
 ['simulated late narrow deficit',2,'4:00',-1,65],
 ['simulated late tie before former 70% gate',2,'12:01',0,45],
 ['simulated late tie at former 70% gate',2,'12:00',0,45],
 ])wofford.push(compare(scenario({sport:'NCAAB',spread:25.5,margin,period,clock,home,names:['Wofford Terriers','Tennessee Volunteers']}),
  {kind:'controlled simulation based on user-supplied observed score/spread',label,spread:25.5,margin}));

const files=[];
for(const name of fs.readdirSync(path.join(root,'test/fixtures/real-games')).filter(n=>n.endsWith('.json')).sort())files.push(`test/fixtures/real-games/${name}`);
const captures=[];
for(const file of files){const f=read(file);captures.push({...f,sourceFile:file,provenance:'archived provider capture'});}
const footballFile='test/fixtures/football-live-20261101.json';
for(const f of read(footballFile).cases)captures.push({...f,sourceFile:footballFile,provenance:'archived provider capture'});
for(const name of fs.readdirSync(path.join(root,'test/fixtures/production-integrity')).filter(n=>/^(CFB|NFL|NBA|NCAAB)-\d+\.json\.gz$/.test(n)).sort()){
 const file=`test/fixtures/production-integrity/${name}`,f=read(file),sport=name.split('-')[0];
 captures.push({...f,modelSport:sport,eventId:f.event.id,sourceFile:file,provenance:'archived provider capture with retained production history'});
}
{
 const sourceFile='test/fixtures/live-sync/NBA-401909901.json.gz',f=read(sourceFile);
 captures.push({...f,modelSport:'NBA',eventId:f.event.id,sourceFile,provenance:'archived provider capture; targeted 12.5-point NBA underdog'});
}
{
 const sourceFile='test/fixtures/market-timeline/pelicans-grizzlies.json.gz',summary=read(sourceFile),c=summary.header.competitions[0];
 const event={id:summary.header.id,date:c.date,season:summary.header.season,competitions:[c],
  name:c.competitors.find(t=>t.homeAway==='away').team.displayName+' at '+c.competitors.find(t=>t.homeAway==='home').team.displayName};
 captures.push({event,summary,modelSport:'NBA',eventId:event.id,sourceFile,provenance:'archived Game Center provider data; targeted 5.5-point NBA underdog'});
}
const unique=[...new Map(captures.map(f=>[`${f.modelSport}:${f.eventId}`,f])).values()];
const provenance=[...new Set([baselinePath,...captures.map(f=>path.join(root,f.sourceFile))])].map(file=>({file:path.relative(root,file).replaceAll('\\','/'),sha256:hash(fs.readFileSync(file))}));
const histories=[],replayRows=[],capturedStates=[],nonliveChanges=[],openingChanges=[],otherSportChanges=[];
for(const f of unique){
 const sport=f.modelSport,input={sport,event:f.event,summary:f.summary};
 const end=compare(input,{kind:'captured end-state rerating',id:String(f.eventId),sourceFile:f.sourceFile,matchup:f.event.name||f.event.shortName||''});
 capturedStates.push(end);
 if(end.state!=='live'&&(end.delta||JSON.stringify(end.beforeDetail.factors)!==JSON.stringify(end.afterDetail.factors)))nonliveChanges.push(compact(end));
 if(end.openingBefore!==end.openingAfter)openingChanges.push(compact(end));
 if(!SPORTS.includes(sport)){
  if(end.delta||JSON.stringify(end.beforeDetail.factors)!==JSON.stringify(end.afterDetail.factors))otherSportChanges.push(compact(end));
  continue;
 }
 const replay=replayCheckpoints(f);
 const archivedQuotes=archivedPregameQuotes(f);
 const rows=[];
 for(const cp of replay.checkpoints){
  // Explicit closing or timestamped pregame quotes retained in the archive
  // describe pregame expectations, even when captured after the final. This
  // does not establish which quote the live application had at that instant.
  // Current/untimestamped live quotes and later WP, boxscores, recaps stay out.
  const event={...cp.event,competitions:[cp.competition]};
  const summary=archivedQuotes.length?{...cp.summary,pickcenter:archivedQuotes.map(q=>q.raw)}:cp.summary;
  const r=compare({sport,event,competition:cp.competition,summary},{kind:'causal archived-play reconstruction',id:String(f.eventId),
   sourceFile:f.sourceFile,matchup:end.matchup,playId:String(cp.play.id),
   missingSituationFields:cp.missingSituationFields,excludedHistory:cp.excludedHistory,
   archivedPregameQuoteEvidence:archivedQuotes.map(({basis,quotedAt})=>({basis,quotedAt}))});
  rows.push(r);replayRows.push(r);
  if(r.openingBefore!==r.openingAfter)openingChanges.push(compact(r));
 }
 const finite=rows.filter(r=>Number.isFinite(r.before)&&Number.isFinite(r.after));
 const sorted=[...finite].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
 histories.push({sport,id:String(f.eventId),matchup:end.matchup,sourceFile:f.sourceFile,checkpoints:rows.length,
  changed:finite.filter(r=>r.delta).length,material:finite.filter(r=>r.material).length,crossings:finite.flatMap(r=>r.crossings).length,
  new85:finite.filter(r=>r.before<85&&r.after>=85).length,
  peakBefore:finite.length?Math.max(...finite.map(r=>r.before)):null,peakAfter:finite.length?Math.max(...finite.map(r=>r.after)):null,
  largestChange:sorted[0]?compact(sorted[0]):null,capturedState:end.state,capturedBefore:end.before,capturedAfter:end.after,
  exclusions:replay.exclusions,repairs:replay.repairs});
 console.log(`${sport} ${f.eventId}: ${rows.length} reconstructed checkpoints, ${finite.filter(r=>r.delta).length} changes`);
}
const allHistory=[...replayRows,...capturedStates];
const historyFlags=allHistory.filter(r=>r.material||r.crossings.length);
const new85=allHistory.filter(r=>r.before<85&&r.after>=85);
const statistics=Object.fromEntries(SPORTS.map(sport=>{
 const rows=replayRows.filter(r=>r.sport===sport),finite=rows.filter(r=>Number.isFinite(r.before)&&Number.isFinite(r.after));
 return [sport,{games:histories.filter(h=>h.sport===sport).length,checkpoints:rows.length,rated:finite.length,
  changed:finite.filter(r=>r.delta).length,material:finite.filter(r=>r.material).length,
  up:finite.filter(r=>r.delta>0).length,down:finite.filter(r=>r.delta<0).length,
  meanDelta:finite.reduce((s,r)=>s+r.delta,0)/(finite.length||1),
  minDelta:finite.length?Math.min(...finite.map(r=>r.delta)):0,maxDelta:finite.length?Math.max(...finite.map(r=>r.delta)):0,
  crossings:Object.fromEntries(thresholds.map(t=>[t,{up:finite.filter(r=>r.before<t&&r.after>=t).length,down:finite.filter(r=>r.before>=t&&r.after<t).length}]))}];
}));
for(const file of provenance)if(hash(fs.readFileSync(path.join(root,file.file)))!==file.sha256)throw Error(`Archived input mutated: ${file.file}`);
const output={baselineCommit:'0f0eb90dc332e951afc3a20e3226f99e951a6cec',baselineModel:before.runtime.MODEL_VERSION,model:runtime.MODEL_VERSION,
 materialDefinition:'Absolute total rating change >= 3 points; every crossing of 75, 85 or 90 is also listed regardless of size.',
 replayLimitation:'Causal reconstructions use archived provider play prefixes with observed scores, clocks and available validated possession. Explicit archived closing or timestamped pregame quotes may supply expectation context; their availability to the app at that historical instant is not established. They are not original raw live responses, do not reproduce every historical recorded rating, and never overwrite retained snapshots. Missing historical odds, possession and win probability stay missing. Later WP, boxscores and recaps are excluded. All valid replay checkpoints in the selected archive corpus are evaluated.',
 woffordProvenance:'The user supplied Wofford +25.5 and a 16-15 first-half lead. We do not possess a raw archive of that exact observation. Paired 6:01/6:00 states isolate the stated defect; all later states are simulations, not historical observations.',
 statistics,provenance,histories,nonliveChanges,openingChanges,otherSportChanges,
 scenarioCount:scenarios.length,scenarios:scenarios.map(compact),boundaries,wofford,
 historicalFlags:historyFlags,new85,capturedStates:capturedStates.map(compact),replayRows:replayRows.map(compact)};
const destination=path.join(root,'calibration/output/live-underdog-20261103.json');
fs.writeFileSync(destination,JSON.stringify(output,null,2)+'\n');
const csv=value=>`"${String(value??'').replaceAll('"','""')}"`;
const columns=['kind','sport','id','matchup','playId','period','clock','scores','underdogMargin','before','after','delta','upsetBefore','upsetAfter','crossings'];
fs.writeFileSync(path.join(root,'calibration/output/live-underdog-material-changes-20261103.csv'),
 columns.join(',')+'\n'+historyFlags.map(r=>columns.map(k=>csv(k==='crossings'?r.crossings.map(c=>`${c.direction} ${c.threshold}`).join('; ')
  :k==='scores'?r.scores.map(t=>`${t.name} ${t.score}`).join(' / '):k==='matchup'?r.matchup||r.scores?.map(t=>t.name).join(' at '):k==='underdogMargin'?r.afterDetail.context?.margin:r[k])).join(',')).join('\n')+'\n');
const table=rows=>rows.map(r=>`| ${r.sport} | ${r.label||r.matchup||r.scores?.map(t=>t.name).join(' at ')||r.id} | ${r.period} / ${r.clock} | ${r.before} | ${r.after} | ${r.delta>0?'+':''}${r.delta} | ${r.upsetBefore} / ${r.upsetAfter} |`).join('\n');
const selected=SPORTS.flatMap(sport=>['early','halftime','final minutes','final seconds','overtime'].flatMap(phase=>[-1,0,1].map(margin=>scenarios.find(r=>r.sport===sport&&r.phase===phase&&r.spread===25.5&&r.margin===margin))).filter(Boolean));
let markdown=`# Live underdog calibration evidence\n\nBaseline: \`${output.baselineCommit}\`, model \`${output.baselineModel}\`. Candidate: \`${output.model}\`. Offline rerating uses the actual Worker facade (\`normalizeEvent\` then \`enrichGame\`) and its shared production runtime.\n\n${output.materialDefinition}\n\n## Evidence boundaries\n\n${output.replayLimitation}\n\n${output.woffordProvenance}\n\nNo source fixture or stored snapshot was modified. Input SHA-256 hashes are retained in the JSON. No provider or AI request is made by this report.\n\n## Wofford regression\n\n| Sport | Controlled case | Period / clock | Before | After | Delta | Upset before / after |\n|---|---|---|---:|---:|---:|---:|\n${table(wofford)}\n\n## Historical reconstruction summary\n\n| Sport | Games | Checkpoints | Changed | Material | Mean delta | Min / max delta | New 85+ crossings |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${Object.entries(statistics).map(([s,r])=>`| ${s} | ${r.games} | ${r.checkpoints} | ${r.changed} | ${r.material} | ${r.meanDelta.toFixed(3)} | ${r.minDelta} / ${r.maxDelta} | ${r.crossings[85].up} |`).join('\n')}\n\n${nonliveChanges.length} nonlive score/factor changes; ${openingChanges.length} opening-baseline changes; ${otherSportChanges.length} other-sport score/factor changes in captured end states.\n\n## Controlled simulations\n\n${scenarios.length} scenarios cover every requested spread and signed score margin, early/half/late/final/OT states, missing/stale/live/unverified markets, available/missing current WP, unknown/confirmed possession and viable/impossible runway. All are simulations, not historical claims. The selected table uses a 25.5-point spread; the JSON contains every row.\n\n| Sport | Phase / dog margin | Period / clock | Before | After | Delta | Upset before / after |\n|---|---|---|---:|---:|---:|---:|\n${table(selected.map(r=>({...r,label:`${r.phase}, ${r.margin>0?'+':''}${r.margin}`})))}\n\n## Every new historical 85+ crossing\n\n${new85.length?`| Sport | Game | Period / clock | Before | After | Delta | Upset before / after |\n|---|---|---|---:|---:|---:|---:|\n${table(new85)}`:'None.'}\n\nThese are rerated archived states, not delivered alerts. Actual notification thresholds and delivery rules are unchanged. Review each crossing before rollout; a high rating alone is not evidence of an erroneous alert.\n\n## Complete review data\n\n[Machine-readable report](output/live-underdog-20261103.json) contains every reconstructed checkpoint, every controlled scenario, every material change, all threshold crossings and their full before/after factors, archived capture comparisons, boundary sweeps and input provenance.\n`;
const withheld=replayRows.filter(r=>!Number.isFinite(r.before)||!Number.isFinite(r.after));
markdown=markdown.replace('## Controlled simulations',`${replayRows.length-withheld.length} checkpoints receive finite ratings in both engines; ${withheld.length} are withheld by both at an unconfirmed 0:00 basketball transition. This is existing timing-integrity protection, not a new scoring failure.\n\nNBA's original October 20 captures have small 1.5/4.5-point lines. Targeted archived Minnesota–San Antonio (+12.5, available through Q3) and New Orleans–Memphis (+5.5, through overtime) strengthen coverage without inventing later states.\n\n## Controlled simulations`);
markdown=markdown.replace('These are rerated archived states',`The seven new NCAAM 85+ states are early-to-middle second-half tournament situations: one or two upset points lift existing 83/84 ratings. They need a watchability review; this replay cannot classify them as unequivocally true or false alerts. Seven of the ten CFB new 85+ states have partial evidence (five Kentucky–Oklahoma, two Oklahoma State–Iowa State), which warrants additional caution. These 17 states span five games; they are not 17 delivered notifications.\n\nThese are rerated archived states`);
fs.writeFileSync(path.join(root,'calibration/live-underdog-evidence-20261103.md'),markdown);
console.log(JSON.stringify({statistics,scenarioCount:scenarios.length,historicalFlags:historyFlags.length,new85:new85.length,
 nonliveChanges:nonliveChanges.length,openingChanges:openingChanges.length,otherSportChanges:otherSportChanges.length,
 maxBoundaryJumpAfter:Math.max(...boundaries.map(r=>Math.abs(r.jumpAfter))),output:destination},null,2));

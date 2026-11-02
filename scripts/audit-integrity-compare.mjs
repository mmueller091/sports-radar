// Offline audit artifact generation. Never imported by a production scorer.
// node scripts/audit-integrity-compare.mjs [artifact-directory]
// Source manifests and runner hashes, not timestamps, verify ablation identity.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const FILES={baseline:'baseline-replay.json',candidate:'final-replay.json',
  trajectory:'restore-trajectory-replay.json',mlb:'restore-mlb-replay.json',
  cfbRetention:'restore-cfb-retention-replay.json',all:'restore-all-replay.json'};
const RESTORED={trajectory:['trajectory'],mlb:['mlb'],cfbRetention:['cfb-retention'],
  all:['trajectory','mlb','cfb-retention']};
const sha=data=>createHash('sha256').update(data).digest('hex');
const key=(game,row)=>JSON.stringify([game.sport,String(game.id),String(row.playId)]);
const countBy=(rows,field)=>Object.fromEntries([...new Set(rows.map(row=>row[field]))].sort()
  .map(value=>[value,rows.filter(row=>row[field]===value).length]));
const scoreState=row=>JSON.stringify((row.score||[]).map(([side,score])=>[side,String(score)]).sort(([a],[b])=>a.localeCompare(b)));
const sameBoundary=(a,b)=>a.period===b.period && a.clock===b.clock && scoreState(a)===scoreState(b);

function indexReplay(replay,label) {
  if(!Array.isArray(replay?.results))throw Error(`${label}: missing replay results`);
  const indexed=new Map();
  for(const game of replay.results)for(const row of game.rows||[]) {
    const id=key(game,row);
    if(indexed.has(id))throw Error(`${label}: duplicate checkpoint ${id}`);
    for(const field of ['rating','sequential','repeat'])if(!Number.isFinite(row[field]))
      throw Error(`${label}: invalid ${field} at ${id}`);
    indexed.set(id,{...row,sport:game.sport,game:String(game.id)});
  }
  return indexed;
}

function determinism(indexed) {
  const rows=[...indexed.values()];
  const summarize=items=>({checkpoints:items.length,
    freshSequentialDifferences:items.filter(row=>row.rating!==row.sequential).length,
    sequentialRepeatDifferences:items.filter(row=>row.sequential!==row.repeat).length,
    rejectedUpdates:items.filter(row=>row.rejected===true).length,
    maximumFreshSequentialDifference:Math.max(0,...items.map(row=>Math.abs(row.rating-row.sequential)))});
  return {...summarize(rows),bySport:Object.fromEntries([...new Set(rows.map(row=>row.sport))]
    .map(sport=>[sport,summarize(rows.filter(row=>row.sport===sport))]))};
}

function sourceVerification(inputs) {
  const fingerprint=(value,label)=>{
    if(!value)return null;
    if(!value.files||Object.values(value.files).some(hash=>!/^[a-f0-9]{64}$/.test(hash))||
      sha(JSON.stringify(value.files))!==value.sha256)throw Error(`${label}: invalid source fingerprint manifest`);
    return value.sha256;
  };
  const baseline=fingerprint(inputs.baseline.sourceFingerprint,'baseline');
  const candidate=fingerprint(inputs.candidate.sourceFingerprint,'candidate');
  const baselineRunner=inputs.baseline.runnerSha256,candidateRunner=inputs.candidate.runnerSha256;
  if(baselineRunner&&candidateRunner&&baselineRunner!==candidateRunner)throw Error('Baseline/candidate runner fingerprints differ');
  const verified={};
  for(const name of Object.keys(RESTORED)) {
    const data=inputs[name];
    if(!data){verified[name]=false;continue;}
    const source=fingerprint(data.sourceFingerprint,name),original=fingerprint(data.baselineFingerprint,`${name} baseline`);
    if(source&&candidate&&source!==candidate)throw Error(`${name}: source fingerprint differs from final candidate`);
    if(original&&baseline&&original!==baseline)throw Error(`${name}: baseline fingerprint differs from original replay`);
    if(data.runnerSha256&&candidateRunner&&data.runnerSha256!==candidateRunner)throw Error(`${name}: runner fingerprint differs`);
    verified[name]=Boolean(source&&candidate&&original&&baseline&&data.runnerSha256&&baselineRunner&&candidateRunner);
  }
  return {baseline,candidate,runner:candidateRunner??null,verified};
}

function attribution(before,after,ablations,verification) {
  const supported={trajectory:'F3',...(after.sport==='CFB'?{cfbRetention:'C1'}:{}),
    ...(after.sport==='MLB'?{mlb:'C2'}:{})};
  const evidence=Object.fromEntries(Object.keys(supported).concat('all').map(name=>{
    const row=ablations[name];
    return [name,row?{rating:row.rating,deltaFromCorrected:row.rating-after.rating,
      returnsOriginal:row.rating===before.rating}:null];
  }));
  const contributing=Object.entries(supported).filter(([name])=>
    ablations[name]&&ablations[name].rating!==after.rating).map(([,cause])=>cause);
  const restoration=Object.keys(supported).length===1?'trajectory':'all';
  const restored=ablations[restoration];
  const reasons=[];
  const required=[...Object.keys(supported),...(restoration==='all'?['all']:[])];
  for(const name of required)if(!verification.verified[name])reasons.push(`${name}: complete final source, baseline and runner fingerprints are not available.`);
  if(!restored)reasons.push(`Missing ${restoration} restoration at this checkpoint.`);
  else if(restored.rating!==before.rating)reasons.push('Restoring all applicable audited mechanisms does not reproduce the original rating.');
  if(Object.keys(supported).some(name=>!ablations[name]))reasons.push('An applicable individual mechanism ablation is missing.');
  // Nonlinear floors/caps can require both restorations even when each single
  // restoration is unchanged. Preserve that interaction instead of inventing
  // a single additive contribution.
  const jointOnlyInteraction=contributing.length===0&&restored?.rating===before.rating;
  const causes=jointOnlyInteraction?Object.values(supported):contributing;
  if(!causes.length)reasons.push('No tested mechanism explains the rating change.');
  const known=reasons.length===0;
  return {cause:known?causes.join('+'):'unknown',intentional:known?true:null,
    supportedMechanisms:contributing,interaction:contributing.length>1||jointOnlyInteraction,jointOnlyInteraction,
    restorationUsed:restoration,restoredRating:restored?.rating??null,
    unexplainedRestorationDelta:restored?restored.rating-before.rating:null,
    ablations:evidence,unresolvedReasons:reasons};
}

export function compareReplays(inputs) {
  const indices=Object.fromEntries(Object.entries(inputs).map(([name,replay])=>[name,indexReplay(replay,name)]));
  const baseline=indices.baseline,candidate=indices.candidate;
  if(!baseline||!candidate)throw Error('Baseline and candidate are required');
  const verification=sourceVerification(inputs);
  if(baseline.size!==candidate.size)throw Error('Baseline/candidate checkpoint counts differ');
  if(inputs.baseline.model===inputs.candidate.model)throw Error('Expected the audit to advance the model version');
  for(const [name,expected] of Object.entries(RESTORED))if(inputs[name]) {
    const actual=String(inputs[name].offlineRestoredMechanism||'').split(',').sort();
    if(JSON.stringify(actual)!==JSON.stringify([...expected].sort()))throw Error(`${name}: wrong restoration metadata`);
    if(inputs[name].model!==inputs.candidate.model)throw Error(`${name}: different candidate model version`);
  }
  const differences=[],sequentialDifferences=[];
  for(const [id,before] of baseline) {
    const after=candidate.get(id);
    if(!after)throw Error(`Missing candidate checkpoint ${id}`);
    if(!sameBoundary(before,after))throw Error(`Changed input boundary ${id}`);
    const ablations=Object.fromEntries(Object.keys(RESTORED).map(name=>[name,indices[name]?.get(id)]));
    for(const [name,row] of Object.entries(ablations))if(row&&!sameBoundary(before,row))
      throw Error(`${name}: changed input boundary ${id}`);
    const identity={sport:after.sport,game:after.game,playId:String(after.playId),index:after.index,
      period:after.period,clock:after.clock};
    if(before.sequential!==after.sequential)sequentialDifferences.push({...identity,
      original:before.sequential,corrected:after.sequential,delta:after.sequential-before.sequential});
    if(before.rating===after.rating)continue;
    differences.push({...identity,original:before.rating,corrected:after.rating,delta:after.rating-before.rating,
      ...attribution(before,after,ablations,verification),weightsChanged:false,modelChanged:true,
      originalSequential:before.sequential,correctedSequential:after.sequential});
  }
  const baselineDeterminism=determinism(baseline),candidateDeterminism=determinism(candidate);
  const checkpointsBySport=countBy([...baseline.values()],'sport');
  const changedBySport=Object.fromEntries(Object.keys(checkpointsBySport).map(sport=>
    [sport,differences.filter(row=>row.sport===sport).length]));
  return {schemaVersion:1,models:{original:inputs.baseline.model,corrected:inputs.candidate.model},
    provenance:{sourceVerification:verification,
      limitation:'Attribution requires matching candidate source manifests, original baseline source manifests and replay runner hashes. Ablations score fresh inputs only and cannot attribute stateful update-rejection differences. The recorded source manifest defines the scope of source verification.',
      contextPolicy:inputs.candidate.contextPolicy},
    summary:{checkpoints:baseline.size,changedCheckpoints:differences.length,unchangedCheckpoints:baseline.size-differences.length,
      checkpointsBySport,changedBySport,causes:countBy(differences,'cause'),
      unattributedChanges:differences.filter(row=>row.cause==='unknown').length,
      weightsChanged:false,modelChanged:true,baselineDeterminism,candidateDeterminism,
      zeroRepeatDifferences:baselineDeterminism.sequentialRepeatDifferences===0&&candidateDeterminism.sequentialRepeatDifferences===0,
      sequentialChangedCheckpoints:sequentialDifferences.length,sequentialChangedBySport:countBy(sequentialDifferences,'sport')},
    differences,sequentialDifferences};
}

export function differencesCsv(rows) {
  const columns=['sport','game','playId','period','clock','original','corrected','delta','cause','intentional','weightsChanged','modelChanged'];
  const escape=value=>value==null?'':/[",\r\n]/.test(String(value))?`"${String(value).replaceAll('"','""')}"`:String(value);
  return [columns,...rows.map(row=>columns.map(key=>row[key]))].map(row=>row.map(escape).join(',')).join('\n')+'\n';
}

export function generateComparison(directory) {
  const inputs={},provenance={};
  for(const [name,file] of Object.entries(FILES)) {
    const filename=path.join(directory,file);
    if(!fs.existsSync(filename)&&!['baseline','candidate'].includes(name))continue;
    const bytes=fs.readFileSync(filename);
    const data=JSON.parse(bytes.toString(bytes[0]===255?'utf16le':'utf8').replace(/^\uFEFF/,''));
    inputs[name]=data;
    provenance[name]={file,sha256:sha(bytes),
      generatedAt:data.generatedAt,model:data.model,sourceRoot:data.sourceRoot,
      sourceFingerprint:data.sourceFingerprint?.sha256??null,baselineFingerprint:data.baselineFingerprint?.sha256??null,
      runnerSha256:data.runnerSha256??null,
      restoredMechanism:data.offlineRestoredMechanism??null,
      sports:data.results.map(game=>({sport:game.sport,game:String(game.id),checkpoints:game.rows.length}))};
  }
  const result=compareReplays(inputs);
  result.provenance.inputs=provenance;
  fs.writeFileSync(path.join(directory,'replay-differences.json'),JSON.stringify(result,null,2)+'\n');
  fs.writeFileSync(path.join(directory,'replay-differences.csv'),differencesCsv(result.differences));
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2);
  if(args.some(arg=>arg.startsWith('--'))||args.length>1)
    throw Error('Usage: node scripts/audit-integrity-compare.mjs [artifact-directory]');
  const result=generateComparison(path.resolve(args[0]||'audit/integrity-20261101'));
  console.log(JSON.stringify(result.summary,null,2));
}

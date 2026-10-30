// Presentation audit only: read the frozen key; never evaluate or tune a policy.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {historicalFixtureSha256} from '../calibration/fixture-provenance.mjs';
import {pathToFileURL} from 'node:url';
import {highFidelityCheckpoints} from './replay-inputs.historical.mjs';
import {renderReviewerPack} from './trajectory-review-pack.mjs';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root));
const json=path=>JSON.parse(read(path));
const hash=data=>createHash('sha256').update(data).digest('hex');
const frozenPaths=['calibration/trajectory-diagnostic-key.json','calibration/trajectory-reviewer-pack.md',
  'calibration/trajectory-focused-validation.md','calibration/trajectory-checkpoint-manifest.json',
  'calibration/trajectory-checkpoint-manifest.md','calibration/output/trajectory-calibration.json',
  'calibration/output/trajectory-live-calibration.json'];
const sample=items=>items.length<=10?items:Array.from({length:10},(_,i)=>items[Math.round(i*(items.length-1)/9)]);
const projection=p=>({period:p.period?.number||p.period,clock:p.clock?.displayValue||'',home:p.homeScore,away:p.awayScore});
const evidence=p=>({id:String(p.id),sequenceNumber:p.sequenceNumber,period:p.period,clock:p.clock,
  homeScore:p.homeScore,awayScore:p.awayScore,wallclock:p.wallclock,type:p.type,text:p.text,start:p.start,end:p.end});

export function buildCorrectedReview() {
  const frozen=json('calibration/trajectory-diagnostic-key.json'),key=structuredClone(frozen);
  key.version=2;
  key.correction={generator:'scripts/trajectory-review-correction.mjs',
    basis:'Retained fixture audit, not external re-verification. Frozen results copied verbatim, not recalculated or validated.',
    sources:frozenPaths.map(path=>({path,sha256:hash(read(path))})),
    originalCaseIds:frozen.cases.map(c=>c.id),scoringRerun:false,policyChanges:false,
    calibrationValidity:'Pending replay and shared football input validation; previous calibration is not established as valid by this correction.',
    requiredValidation:[
      'Resolve inconsistent sequence metadata with explicit chronology validation. Rebuild affected NCAAB checkpoints, scores, accepted play/scoring/WP membership and partial histories; test causality before recalibration.',
      'Define transition-aware football replay inputs and guard active-drive/field-position scoring in shared NFL/CFB paths. Validate timeout, scoring/try/kickoff transitions, explicit tries and valid scrimmage downs without guessing possession.',
      'After input fixes, rerun affected high-fidelity shadow/trajectory/live calibration comparisons and regenerate their review diagnostics. Run broader shared-scoring regressions if those shared guards change. No grid was run for this presentation audit.'
    ]};
  const fixtures=new Map();
  function source(c) {
    const id=c.provenance.eventId;
    if(!fixtures.has(id)) {
      const name=readdirSync(new URL('test/fixtures/real-games/',root)).find(n=>n.endsWith(`-${id}.json`));
      assert.ok(name,`Missing retained fixture ${id}`);
      const path=`test/fixtures/real-games/${name}`;
      fixtures.set(id,{path,sha256:historicalFixtureSha256(path),fixture:json(path)});
    }
    return fixtures.get(id);
  }
  for(const c of key.cases) {
    c.reviewAudit={status:'eligible with stated unknowns',verifiedContext:[],unverifiedInputs:[],issues:[]};
    c.public.answers={switchNow:'',urgencyTier:'',matchedPreference:'',evidence:''};
    if(c.provenance.syntheticId?.startsWith('ordinary-')) {
      c.reviewAudit.verifiedContext=['Synthetic matched example: possession and situation information are unavailable. No ordinary possession is verified.'];
      c.public.unknowns=c.public.unknowns.filter(s=>s!=='No additional stakes or extraordinary current events encoded.');
      c.public.unknowns.push('Possession, down and field position are unavailable; absence of these inputs does not establish an ordinary possession. Stakes and current events are not verified.');
    }
  }
  for(const id of ['R02','R10']) {
    const c=key.cases.find(c=>c.id===id),s=source(c),f=s.fixture;
    assert.equal(f.event.season.slug,'post-season');
    assert.equal(f.event.season.type,3);
    assert.equal(f.summary.header.season.type,3);
    const notes=f.event.competitions[0].notes;
    c.reviewAudit.fixture={path:s.path,sha256:s.sha256,source:f.source,capturedAt:f.capturedAt};
    c.reviewAudit.contextEvidence={eventSeason:f.event.season,summarySeason:f.summary.header.season,notes};
    c.reviewAudit.verifiedContext=[id==='R10'
      ? 'Retained provider fixture identifies a postseason NCAA tournament Elite Eight game (single elimination).'
      : 'Retained provider fixture identifies a postseason league championship series game.'];
    c.reviewAudit.unverifiedInputs=[id==='R02'
      ? 'Exact game number, series standing and elimination/clinching stakes are unverified: the retained game label and series snapshots conflict.'
      : 'Additional stakes beyond the retained tournament round are unverified.'];
    if(id==='R02') c.reviewAudit.contextEvidence.series=f.summary.header.competitions[0].series;
    c.public.unknowns=c.public.unknowns.map(s=>s.startsWith('Stakes and historical')
      ? 'Historical box-score/manpower details are unverified. Postseason context is supported only to the extent stated above.' : s);
  }
  {
    const c=key.cases.find(c=>c.id==='R10'),s=source(c),f=s.fixture;
    const cp=highFidelityCheckpoints(f).find(cp=>String(cp.play.id)===c.provenance.playId);
    assert.ok(cp);
    assert.equal(hash(JSON.stringify([cp.competition.status,cp.competition.situation,cp.summary.scoringPlays,cp.summary.winprobability])),c.provenance.checkpointHash,'R10 frozen replay provenance');
    const accepted=new Set(cp.summary.scoringPlays.map(p=>String(p.id)));
    const sourceHistory=f.summary.plays.filter(p=>accepted.has(String(p.id)));
    assert.equal(sourceHistory.length,accepted.size);
    const end=f.summary.plays.findIndex(p=>String(p.id)===c.provenance.playId);
    assert.ok(sourceHistory.every(p=>f.summary.plays.indexOf(p)<=end),'No future source records in repaired display');
    assert.deepEqual(sourceHistory.map(p=>String(p.id)).sort(),f.summary.plays.slice(0,end+1).filter(p=>p.scoringPlay===true).map(p=>String(p.id)).sort(),'Complete causal source scoring prefix');
    const reversals=[];
    for(let i=1;i<cp.summary.scoringPlays.length;i++) {
      const a=cp.summary.scoringPlays[i-1],b=cp.summary.scoringPlays[i];
      if(a.period.number===b.period.number && a.clock.displayValue.localeCompare(b.clock.displayValue,undefined,{numeric:true})<0)
        reversals.push([evidence(a),evidence(b)]);
    }
    assert.ok(reversals.length);
    c.reviewAudit.status='context only; exclude from confident calibration judgment pending replay validation';
    c.reviewAudit.issues=['Replay sequence ordering conflicts with source array, clocks, wall-clock timestamps and cumulative scores. Display rebuilt from retained source order with the same accepted scoring IDs; no scores or source records changed.'];
    c.reviewAudit.chronology={cause:'Replay sorts inconsistent provider sequenceNumber values; ten-point display sampling preserves that erroneous order.',
      providerCorrection:'Not established: only one retained capture; no revision history. No evidence that the score rollback represents an actual provider score correction.',
      originalDisplay:c.public.scoringUpdates,replayReversals:reversals,
      sourceOrder:sourceHistory.map(evidence),replayOrder:cp.summary.scoringPlays.map(evidence),
      affectedPath:'chronologicalStream -> reconstructedCheckpoint rollingScore/acceptedPlays/wpIndex/scoringThrough -> prepareCheckpointEvaluation -> history/trajectory -> publicInput',
      trajectoryScope:'trajectory.scoringMoments and history.momentumImpact sort moments by position, so final moment ordering is normalized there; replay membership, current score and WP causality are still exposed at affected checkpoints.'};
    c.public.scoringUpdates=sample(sourceHistory).map(projection);
  }
  for(const id of ['R21','R05']) {
    const c=key.cases.find(c=>c.id===id),s=source(c),f=s.fixture;
    const cp=highFidelityCheckpoints(f).find(cp=>String(cp.play.id)===c.provenance.playId);
    assert.equal(cp.play.type.text,'Timeout');
    assert.equal(hash(JSON.stringify([cp.competition.status,cp.competition.situation,cp.summary.scoringPlays,cp.summary.winprobability])),c.provenance.checkpointHash,`${id} frozen replay provenance`);
    assert.equal(cp.competition.situation.down,id==='R21'?-1:0);
    const accepted=cp.summary.plays,i=accepted.findIndex(p=>String(p.id)===c.provenance.playId);
    c.reviewAudit.status='unsuitable for confident judgment; excluded';
    c.reviewAudit.fixture={path:s.path,sha256:s.sha256,source:f.source,capturedAt:f.capturedAt};
    c.reviewAudit.transition={record:evidence(cp.play),previousAccepted:evidence(accepted[i-1]),
      replaySituation:cp.competition.situation,originalDisplay:c.public.situation,
      affectedPath:id==='R21'
        ? 'footballSituation(end.team -> possession; yardsToEndzone=0 -> isRedZone) -> footballSituationImpact -> nflSituation competitiveFloor -> live aggregation -> trajectory decisive protection'
        : 'footballSituation(end.team -> possession with down=0) -> cfbPossession/cfbSituation -> competitiveFloor -> live aggregation -> trajectory decisive protection'};
    c.reviewAudit.issues=[id==='R21'
      ? 'Timeout at 0:45 following an accepted touchdown record. Endpoint down=-1, distance=0 and yardsToEndzone=0 describe an unresolved scoring transition; they do not establish an active drive, red zone or next possession. No explicit pending try is supplied.'
      : 'Timeout at 1:18 after an accepted own-fumble recovery. The preceding accepted record ends at fourth-and-16 in Away territory; the timeout endpoint down=0 and its distance/field position conflict with that record. No normal down or authoritative current possession is reconstructed.'];
    c.reviewAudit.unverifiedInputs=['Endpoint team is an unverified possession input. Frozen active-possession classification and its downstream floor/protection are not validated.'];
    c.public.situation={};
    c.public.unknowns.push('Timeout transition: current possession, down, distance and field position are not established.');
  }
  assert.deepEqual(key.cases.map(c=>c.results),frozen.cases.map(c=>c.results));
  return JSON.parse(JSON.stringify(key));
}

export function renderCorrectedReviewer(key) {
  let text=renderReviewerPack(key).replace('# Blind live-watchability review','# Corrected blind live-watchability review');
  text=text.replace('Answers are intentionally blank.','Answers are intentionally blank. Game scorelines are retained; model scores, policy identities and contribution points are hidden. Verified below means supported by the retained provider fixture, not independently re-verified. Three flagged cases are excluded from confident calibration judgments.');
  for(const c of key.cases) {
    const a=c.reviewAudit;
    const heading=`## ${c.id} - ${c.public.sport} - ${c.kind}${c.matchGroup?` - matched group ${c.matchGroup}`:''}`;
    text=text.replace(heading,[heading,`Review suitability: ${a.status}.`,
      `Verified watchability context: ${a.verifiedContext.join(' ')||'No additional context verified.'}`,
      ...(a.issues.length?[`Input limitations: ${a.issues.join(' ')}`]:[]),
      ...(a.unverifiedInputs.length?[`Unverified inputs: ${a.unverifiedInputs.join(' ')}`]:[])].join('\n\n'));
  }
  return text;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const key=buildCorrectedReview();
  writeFileSync(new URL('calibration/trajectory-diagnostic-key.corrected.json',root),JSON.stringify(key,null,2)+'\n');
  writeFileSync(new URL('calibration/trajectory-reviewer-pack.corrected.md',root),renderCorrectedReviewer(key));
  console.log(JSON.stringify({cases:key.cases.length,excluded:key.cases.filter(c=>/exclude/.test(c.reviewAudit.status)).map(c=>c.id),scoringRerun:false}));
}

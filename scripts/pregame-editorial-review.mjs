import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const draftRevision='338de5c',fixture=JSON.parse(fs.readFileSync('test/fixtures/pregame-corpus-20261103.json'));
class AuditDate extends Date {static now(){return Date.parse(fixture.capturedAt);}}
const api=source=>vm.runInNewContext(source.slice(source.indexOf('function explainRating('),source.indexOf('function trendFor('))+';({explainRating})',{Date:AuditDate,Intl});
const before=api(execFileSync('git',['show',draftRevision+':app.js'],{encoding:'utf8',maxBuffer:4e6}));
const after=api(fs.readFileSync('app.js','utf8'));
// Explicit editorial judgments, made after reading the generated copy against
// the supplied evidence. These are not model scores or an independent review.
// Columns: event, readability, distinctiveness, usefulness, judgment.
const judgments=[
 ['401856743',5,4,5,'Rankings, identical records and a narrow line now explain the watch recommendation. No unsupported claim about Saturday slate rank or postseason stakes.'],
 ['401856741',5,4,5,'The same compositional rule works for unequal records and different teams. Repeated watch wording is acceptable for the same supported reason, rather than artificial synonym rotation.'],
 ['401856849',5,5,5,'Keeps the verified rivalry, unbeaten Utah and top-10 meeting together; a modest favorite does not undermine the appeal.'],
 ['401858291',5,4,5,'Unbeaten Miami against another top-10 team supplies distinct stakes without inventing a rivalry or playoff consequence.'],
 ['401856740',4,3,4,'Ranks and a moderate favorite give a useful watch outlook. No rivalry is inferred from familiar school names. Some ranked-matchup phrasing remains shared.'],
 ['401856745',4,3,4,'Shows that a lower-ranked team is favored without trying to reconcile rankings and odds through invented injury or form claims.'],
 ['401892635',5,5,5,'Division context plus the clear Lightning favorite makes the Red Wings test concrete. No puck-line-as-points mistake, false return story or singular collective verb.'],
 ['401892644',5,4,5,'Division opportunity and near-even market replace the awkward standings-percentage sentence. Buffalo is not mislabeled as having more wins than all losses.'],
 ['401892636',5,4,4,'Both clubs actually have more wins than all losses, so winning records is valid. Close market supports suspense without claiming league-leading attacks.'],
 ['401892634',4,3,4,'The market, not the raw record difference, supplies the competitiveness claim. The poor Winnipeg record remains visible; no automatic mismatch is imposed.'],
 ['401873038',5,4,5,'Close spread and 52.5 total explain suspense and scoring appeal. The existing useful wording is retained; no elite-offense claim is added.'],
 ['401873051',5,4,5,'Matching 6-1 records become a direct test between strong teams; the small spread gives a concrete reason to expect a contest.'],
 ['401873040',4,4,4,'Losing records remain an honest limitation alongside a competitive spread and high total. Low rating is not turned into a marquee matchup.'],
 ['401873046',4,3,4,'Both difficult starts and the modest Houston favorite are clear. Does not invent a quarterback return or assume the Chargers cannot win.'],
 ['401873037',5,3,4,'The double-digit spread supplies a concrete warning about a one-sided game, with no invented player explanation. Existing useful wording retained.'],
 ['401909922',5,4,5,'Strong actual records and a 1.5-point spread are enough to establish appeal; no claim of a conference final preview or sustainable pace. Existing useful wording retained.'],
 ['401909923',5,4,4,'Southeast Division context gives ordinary records a specific reason to care; no missing-lines filler and no unsupported lead-at-stake claim.'],
 ['401909924',5,3,4,'Plainly identifies Boston as stronger on results. Removes the rhetorical bridge-that-gap ending without making up form, injuries or a betting line.'],
 ['401909925',5,3,4,'Separates the prospect of a close game from team quality. Losing starts remain visible without a generic dismissal of the matchup.'],
 ['401909929',5,3,4,'Winning records and a close spread are valid and readable; distinctiveness is limited by the available evidence, so useful existing copy is retained.'],
 ['401906848',5,4,4,'Season opener and ranked Tennessee are accurate; a 25.5-point favorite is honestly described. Zero records do not become unbeaten-season claims.'],
 ['401858290',5,3,3,'Names the ranked side and stronger record without inventing a close game. Cross-division FCS classification does not change the rating.'],
 ['401867964',5,2,3,'Sparse FCS example remains modest: school names, records and the stronger side. Limited distinctiveness is accepted instead of inventing context.'],
 ['401866453',5,3,4,'A substantial favorite gives a clear watch limitation. Ohio-Akron receives no unsupported rivalry or conference-race claim. Existing useful wording retained.']
];
const rows=judgments.map(([id,readability,distinctiveness,usefulness,judgment])=>{
 const item=fixture.games.find(r=>r.game.id===id);assert.ok(item,id);
 const game=structuredClone(item.game),frozen=JSON.stringify(game),text=after.explainRating(game);assert.equal(JSON.stringify(game),frozen);
 assert.doesNotMatch(text,/half the available|share of standings points|Lightning has|algorithm|calibration|\+\d/);
 return {id,sport:game.sport,matchup:game.teams.map(t=>t[0]).join(' – '),rating:game.score,
   evidence:{teams:game.teams.map(t=>({name:t[0],record:t[5],rank:t[6]})),line:game.line||null,factors:game.factors.map(f=>f.label)},
   productionBefore:item.before,phase1Before:before.explainRating(game),after:text,
   assessment:{accuracy:5,readability,distinctiveness,usefulness,judgment,pass:true}};
});
assert.equal(rows.length,24);
const report={capturedAt:fixture.capturedAt,draftRevision,productionBaseline:fixture.baseline,
 reviewer:'Implementation agent editorial review; not independent human visual verification',
 rubric:'1–5. Accuracy requires all factual clauses to follow supplied evidence or preserved verified context; readability >=4 and usefulness >=3. Distinctiveness may be 2 for documented sparse evidence. The watch recommendation is editorial judgment, not a new rating category.',
 decision:'Pass for integration; visual verification still required',rows};
const dir='audit/pregame-editorial-20261103';fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(dir+'/examples.json',JSON.stringify(report,null,2)+'\n');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
fs.writeFileSync(dir+'/examples.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SlateMeter final editorial review</title><style>body{font:16px/1.6 system-ui;background:#101820;color:#eef3f6;margin:0}main{max-width:1100px;margin:auto;padding:24px}article{border-top:1px solid #537080;padding:24px 0}.cols{display:grid;grid-template-columns:1fr 1fr;gap:30px}small{color:#bfd1dc}b{color:#70dfdd}@media(max-width:650px){.cols{display:block}}</style><main><h1>24 pregame editorial comparisons</h1><p>${esc(report.reviewer)}. ${esc(report.rubric)}.</p><p>${esc(report.decision)}. Evidence captured ${esc(report.capturedAt)}.</p>${rows.map(r=>`<article id="game-${r.id}"><small>${r.sport} · ${r.id} · unchanged rating ${r.rating}</small><h2>${esc(r.matchup)}</h2><div class="cols"><div><b>Before this editorial pass</b><p>${esc(r.phase1Before)}</p></div><div><b>After</b><p>${esc(r.after)}</p></div></div><p><b>Assessment:</b> Accuracy ${r.assessment.accuracy}/5 · Readability ${r.assessment.readability}/5 · Distinctiveness ${r.assessment.distinctiveness}/5 · Usefulness ${r.assessment.usefulness}/5</p><p>${esc(r.assessment.judgment)}</p><details><summary>Original production wording</summary><p>${esc(r.productionBefore)}</p></details></article>`).join('')}</main></html>`);
console.log(JSON.stringify({examples:rows.length,changedSincePhase1:rows.filter(r=>r.phase1Before!==r.after).length,decision:report.decision}));

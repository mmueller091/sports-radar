import fs from 'node:fs';import {Module} from 'node:module';import {gunzipSync} from 'node:zlib';
import * as active from '../alerts-worker/src/live-game-model.js';
import {fixture,rows,frame,evaluate} from '../test/helpers/production-integrity.mjs';
const baseline=new Module('production-integrity-baseline');
baseline._compile(gunzipSync(fs.readFileSync(new URL('../test/fixtures/production-integrity/before-runtime.cjs.gz',import.meta.url))).toString(),'production-integrity-baseline.cjs');
const before=baseline.exports;
const cases=[['CFB','401856847'],['CFB','401858282'],['NFL','401873033'],['NCAAB','401920982'],['NFL','401873028'],['NBA','401909903'],['NFL','401873034'],['NHL','401892627'],['NFL','401873024']];
const games=cases.map(([sport,id])=>{const f=fixture(sport,id),a=evaluate(before,f),b=evaluate(active,f);
 return {sport,id,teams:f.game.teams.map(t=>t[1]).join('-'),state:b.state,before:a.score,after:b.score,beforeMoment:a.momentLabel,afterMoment:b.momentLabel,moment:b.moment,facts:b.completedFacts};});
const reconstructed=[['CFB:401856847',82],['CFB:401858282',72],['NFL:401873033',73],['NFL:401873034',44]].map(([id,rating])=>{
 const f=frame(rows.find(r=>r.game_key===id&&r.rating===rating)),a=evaluate(before,f),b=evaluate(active,f);
 return {id,recordedRating:rating,clock:f.saved.liveRawStatus.displayClock,before:[a.score,evaluate(before,f,null,a).score],after:[b.score,evaluate(active,f,null,b).score],
  evidenceBytes:b.liveInputEvidence&&JSON.stringify(b.liveInputEvidence).length};});
const report={baseline:'359d2b8b65dd03e812a7ee8295eb69b5364c3e77',model:active.normalizeEvent(fixture('NFL','401873028').event,'NFL').modelVersion,
 games,reconstructed,replayLimitation:'Reconstructed live inputs use captured provider plays trimmed to recorded clocks/scores. Original raw summaries are not retained; reconstructed ratings need not equal historical recorded ratings.'};
fs.mkdirSync('audit',{recursive:true});fs.writeFileSync('audit/production-integrity-comparison.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

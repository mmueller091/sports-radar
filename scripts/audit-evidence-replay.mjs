// Re-run the exact audited NHL observation reconstruction and controlled probes.
// AUDIT_BASELINE_ROOT may point to the pinned source archive; no source is edited.
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
const root=process.env.AUDIT_BASELINE_ROOT;
const source=p=>root?pathToFileURL(path.join(root,p)).href:new URL(`../${p}`,import.meta.url).href;
const {default:runtime}=await import(source('scoring/live-runtime.cjs'));
const active=await import(source('alerts-worker/src/live-game-model.js'));
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('../test/fixtures/audit-evidence-20261101/nhl-delayed-goal.json.gz',import.meta.url))));
const output={modelVersion:runtime.MODEL_VERSION,provenance:fixture.source,scenarios:[]};
const details=g=>({rating:g.score,evidenceQuality:g.evidenceQuality??null,scoringPartial:g.scoringPartial,
 reasons:g.evidenceReasons??[],currentTension:g.factors.find(f=>f.label==='Current Tension')?.points,
 history:g.trajectoryScoring.adjustment,historyEvents:g.historyOwnership.eventFactors,
 liveReasons:g.live.reasons,momentumText:g.momentumText,inputEvidence:g.inputEvidence??null});
for(const f of fixture.observations){
 const game=structuredClone(f.game),competition=structuredClone(f.competition);
 game.sourceCompetition=competition;game.sourceEvent={season:{year:2026,type:2}};
 runtime.applyLiveSnapshot(game,competition,structuredClone(f.summary));
 output.scenarios.push({finding:'F2/F3',game:'NHL:401892628',round:f.round,observedRating:f.observedRating,...details(game)});
}
const c={status:{period:2,displayClock:'5:00',type:{state:'in',completed:false}},competitors:[
 {homeAway:'home',score:'7',team:{id:'h',displayName:'Home',abbreviation:'H'}},
 {homeAway:'away',score:'7',team:{id:'a',displayName:'Away',abbreviation:'A'}}],situation:{}};
const event={id:'audit-synthetic',name:'Away at Home',season:{year:2026,type:2},competitions:[c]};
for(const count of [1,2,3]){
 const summary={header:{competitions:[structuredClone(c)]},plays:Array.from({length:count},()=>({id:'same-turnover',period:{number:2},clock:{displayValue:'5:00'},homeScore:7,awayScore:7,text:'Pass intercepted at the 50',scoringPlay:false}))};
 const game=active.normalizeEvent(structuredClone(event),'NFL');active.enrichGame(game,summary);
 output.scenarios.push({finding:'F4',scenario:`${count} identical interception copies`,...details(game),eventShock:game.live.components.eventShock});
}
for(const future of [false,true]){
 const comp=structuredClone(c);comp.status.period=4;comp.status.displayClock='1:00';comp.competitors.forEach(t=>t.score='14');
 const play=(id,clock)=>({id,period:{number:4},clock:{displayValue:clock},homeScore:14,awayScore:14,text:'Pass complete',scoringPlay:false});
 const summary={header:{competitions:[structuredClone(comp)]},plays:[play('current','1:00')],winprobability:[{playId:'current',homeWinPercentage:.5}]};
 if(future){summary.header.competitions[0].status.displayClock='0:50';summary.plays.push(play('future','0:50'));summary.winprobability.push({playId:'future',homeWinPercentage:.99});}
 const game=active.normalizeEvent({...structuredClone(event),competitions:[comp]},'NFL');active.enrichGame(game,summary);
 output.scenarios.push({finding:'F5',scenario:future?'future summary play appended':'canonical checkpoint',...details(game),probability:game.live.winProbability});
}
console.log(JSON.stringify(output,null,2));

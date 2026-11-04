import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Module} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as active from '../../alerts-worker/src/live-game-model.js';
import time from '../../scoring/shared/time.js';
import {replayCheckpoints} from '../../scripts/replay-inputs.mjs';
import {evaluate} from './live-underdog-scenarios.mjs';
export const directory=new URL('../fixtures/release-basketball-20261103/',import.meta.url);
export const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',directory),'utf8'));
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const filename=fileURLToPath(new URL('../fixtures/live-underdog-before.cjs.gz',import.meta.url));
const frozen=new Module(filename);frozen._compile(gunzipSync(fs.readFileSync(filename)).toString(),filename);
export const before=frozen.exports;
export {active,evaluate,replayCheckpoints};
export const clockSeconds=clock=>time.clockSeconds({displayClock:clock});
export const lateQ4Close=(period,clock,away,home)=>period===4&&clockSeconds(clock)!==null&&clockSeconds(clock)<240&&Math.abs(away-home)<=3;
export function readCapture(capture){return JSON.parse(gunzipSync(fs.readFileSync(new URL(capture.file,directory))));}
// The old archives' untimestamped 'current' quotes are deliberately excluded.
// Requiring an explicit retained close avoids inventing pregame observations.
export function closingQuotes(fixture){return (fixture.summary.pickcenter||[]).filter(q=>
 q.live!==true&&q.isLive!==true&&q.pointSpread?.home?.close?.line!=null&&q.pointSpread?.away?.close?.line!=null);
}
export function inputFor(fixture,cp){
 const quotes=closingQuotes(fixture);
 return {sport:fixture.modelSport,event:{...cp.event,competitions:[cp.competition]},
  summary:quotes.length?{...cp.summary,pickcenter:quotes}:cp.summary};
}
export function details(game){return {score:game.score,upset:game.upsetPoints||0,opening:game.openingScore,
 evidence:game.evidenceQuality,factors:game.factors,context:game.liveUpset,winProbability:game.live?.winProbability};}

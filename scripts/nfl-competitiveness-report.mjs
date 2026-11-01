import fs from 'node:fs';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export const runtime=require('../scoring/live-runtime.cjs');
export const competitivenessData=()=>JSON.parse(gunzipSync(fs.readFileSync('test/fixtures/nfl-pregame/competitiveness-20261101.json.gz')));
export function beforeEngine(){const module={exports:{}};vm.runInNewContext(gunzipSync(fs.readFileSync('test/fixtures/nfl-pregame/competitiveness-before.cjs.gz')).toString(),{module,exports:module.exports,require,Date,console,structuredClone});return module.exports;}
export function competitivenessReport(){
  const data=competitivenessData(),before=beforeEngine();
  const rows=data.games.map(({event,competition,context,baseline})=>{
    const old=before.rateGame('NFL','upcoming',[],event,competition,context),next=runtime.rateGame('NFL','upcoming',[],event,competition,context);
    if(old.score!==baseline.score)throw Error(`${event.id}: frozen inputs diverged from captured production`);
    const labels=[...new Set([...old.factors,...next.factors].map(f=>f.label))];
    const components=labels.map(label=>{const sum=fs=>fs.filter(f=>f.label===label).reduce((n,f)=>n+f.points,0);return{label,before:sum(old.factors),after:sum(next.factors),delta:Number((sum(next.factors)-sum(old.factors)).toFixed(2))};}).filter(c=>c.delta);
    const changes=[];
    const quality=components.filter(c=>/winning|quality/i.test(c.label)).reduce((n,c)=>n+c.delta,0);
    const market=components.filter(c=>/projected/i.test(c.label)).reduce((n,c)=>n+c.delta,0);
    if(quality<-.1)changes.push('Bounded single-team quality');
    if(market<-.1)changes.push('Stronger spread downside');
    if(!changes.length)changes.push('Preserved (rounding only or unchanged)');
    return{id:event.id,date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date(event.date)),matchup:event.shortName,
      spread:baseline.line?.spread || 'Unlisted',before:old.score,after:next.score,change:next.score-old.score,reason:changes.join('; '),
      flagged:Math.abs(next.score-old.score)>4,rawBefore:old.rawPregameScore,rawAfter:next.rawPregameScore,components,factors:next.factors};
  });
  return{model:runtime.MODEL_VERSION,baselineModel:data.baselineModel,capturedAt:data.capturedAt,basis:'Frozen production feed and identical scoreboard/context inputs; November 1 and November 8 in America/New_York. Future records are the current known records, not projected results.',rows};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/nfl-competitiveness-report.mjs')){
  const report=competitivenessReport();fs.writeFileSync('calibration/output/nfl-competitiveness-20261101.json',JSON.stringify(report,null,2)+'\n');
  console.table(report.rows.map(({date,matchup,spread,before,after,change,flagged,reason})=>({date,matchup,spread,before,after,change,flagged,reason})));
}

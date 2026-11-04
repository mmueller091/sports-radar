import fs from 'node:fs';
import {manifest,directory,sha256,readCapture,closingQuotes,inputFor,details,before,active,evaluate,replayCheckpoints,lateQ4Close} from '../test/helpers/release-basketball.mjs';
const rows=[],games=[];
for(const capture of manifest.captures){
 if(sha256(fs.readFileSync(new URL(capture.file,directory)))!==capture.sha256)throw Error(`Modified archive ${capture.file}`);
 const fixture=readCapture(capture),replay=replayCheckpoints(fixture),quotes=closingQuotes(fixture),gameRows=[];
 for(const cp of replay.checkpoints){
  const input=inputFor(fixture,cp),a=evaluate(before,input),b=evaluate(active,input);
  const crossings=[75,85,90].filter(t=>Number.isFinite(a.score)&&Number.isFinite(b.score)&&((a.score<t&&b.score>=t)||(a.score>=t&&b.score<t))).map(threshold=>({threshold,direction:b.score>a.score?'up':'down'}));
  const row={eventId:capture.eventId,sport:fixture.modelSport,matchup:capture.matchup,source:capture.file,kind:'causal archived-play reconstruction',
   playId:cp.play.id,period:cp.play.period.number,clock:cp.play.clock.displayValue,awayScore:cp.play.awayScore,homeScore:cp.play.homeScore,
   before:a.score,after:b.score,delta:Number.isFinite(a.score)&&Number.isFinite(b.score)?b.score-a.score:null,
   upsetBefore:a.upsetPoints||0,upsetAfter:b.upsetPoints||0,openingBefore:a.openingScore,openingAfter:b.openingScore,
   quote:quotes.map(q=>q.details),marketSource:b.liveUpset?.market?.source||null,margin:b.liveUpset?.margin??null,
   wp:b.liveUpset?.currentProbability??null,possession:b.liveUpset?.possessionId??null,
   evidence:b.evidenceQuality,missingSituationFields:cp.missingSituationFields,excludedHistory:cp.excludedHistory,crossings};
  if(Math.abs(row.delta)>=3||crossings.length){row.beforeDetail=details(a);row.afterDetail=details(b);}
  rows.push(row);gameRows.push(row);
 }
 const finite=gameRows.filter(r=>r.delta!==null),late=finite.filter(r=>lateQ4Close(r.period,r.clock,r.awayScore,r.homeScore));
 const dog=quotes.length?fixture.event.competitions[0].competitors.find(t=>t.homeAway===(quotes[0]?.awayTeamOdds?.underdog?'away':'home')).team.id:null;
 games.push({...capture,season:fixture.event.season,quote:quotes.map(q=>q.details),checkpoints:gameRows.length,rated:finite.length,
  changed:finite.filter(r=>r.delta).length,material:finite.filter(r=>Math.abs(r.delta)>=3).length,minDelta:Math.min(...finite.map(r=>r.delta)),maxDelta:Math.max(...finite.map(r=>r.delta)),
  new85:finite.filter(r=>r.before<85&&r.after>=85).length,new90:finite.filter(r=>r.before<90&&r.after>=90).length,
  closeByPeriod:Object.fromEntries([1,2,3,4,5].map(p=>[p,finite.filter(r=>r.period===p&&Math.abs(r.awayScore-r.homeScore)<=3).length])),
  lateQ4OnePossession:late.length,lateQ4Possession:dog?{dog:late.filter(r=>r.possession===dog).length,opponent:late.filter(r=>r.possession&&r.possession!==dog).length,unknown:late.filter(r=>!r.possession).length}:null,
  repairs:replay.repairs,exclusions:replay.exclusions});
 console.log(JSON.stringify(games.at(-1)));
}
const output={candidateCommit:'712f221',baselineCommit:'0f0eb90',method:'Causal play-prefix reconstructions from unchanged public retrospective archives. Only explicit retained closing quotes are included. Historical availability of these quotes to the app is not established. Missing fields stay missing; no postgame recap or future WP/boxscore is injected.',
 games,rows,material:rows.filter(r=>Math.abs(r.delta)>=3),crossings:rows.filter(r=>r.crossings.length),newHigh:rows.filter(r=>r.crossings.some(c=>c.direction==='up'&&c.threshold>=85))};
fs.writeFileSync(new URL('../calibration/output/release-basketball-20261103.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
const columns=['sport','eventId','playId','period','clock','awayScore','homeScore','quote','before','after','delta','upsetBefore','upsetAfter','wp','possession','evidence','crossings'];
const csv=value=>`"${String(value??'').replaceAll('"','""')}"`;
fs.writeFileSync(new URL('../calibration/output/release-basketball-material-20261103.csv',import.meta.url),columns.join(',')+'\n'+rows.filter(r=>Math.abs(r.delta)>=3||r.crossings.length).map(r=>columns.map(k=>csv(k==='crossings'?r.crossings.map(c=>`${c.direction} ${c.threshold}`).join('; '):r[k])).join(',')).join('\n')+'\n');
console.log(JSON.stringify({games:games.length,states:rows.length,rated:rows.filter(r=>r.delta!==null).length,changed:rows.filter(r=>r.delta).length,material:output.material.length,crossings:output.crossings.length,newHigh:output.newHigh.length}));

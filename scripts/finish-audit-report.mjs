import fs from 'node:fs';
import {createRequire} from 'node:module';
import * as after from './finish-audit-entry.mjs';
import {replayCheckpoints} from './replay-inputs.mjs';
import helper from '../test/helpers/finish-audit.cjs';
const require=createRequire(import.meta.url),before=helper.baseline();
const dir='test/fixtures/finish-audit';
const score=(api,event,summary,sport)=>{const g=api.normalizeEvent(structuredClone(event),sport);api.enrichGame(g,structuredClone(summary));return g;};
const rows=[],situationProbes=[];
for(const file of fs.readdirSync(dir).filter(n=>/^(CFB|NHL)-.*\.json.gz$/.test(n))){
 const f=helper.read(file.replace('.json.gz',''));
 const a=score(before,f.event,f.summary,f.modelSport),b=score(after,f.event,f.summary,f.modelSport);
 const replay=replayCheckpoints(f);
 if(f.event.id==='401858505'){
  const p=replay.checkpoints.find(p=>p.competition.status.period===4&&p.competition.status.displayClock==='2:04');
  const e=structuredClone(p.event),s=structuredClone(p.summary);e.competitions[0].status.displayClock='2:00';s.header.competitions[0]=structuredClone(e.competitions[0]);
  situationProbes.push({id:f.event.id,situation:'2:00 third-and-19 own 20',observedBefore:90,reconstructedBefore:score(before,e,s,'CFB').score,after:score(after,e,s,'CFB').score});
 }
 const timeline=replay.checkpoints.map(p=>({period:p.competition.status.period,clock:p.competition.status.displayClock,
  before:score(before,p.event,p.summary,f.modelSport).score,after:score(after,p.event,p.summary,f.modelSport).score,
  situation:p.competition.situation,text:p.play.text}));
 const history=JSON.parse(fs.readFileSync(`${dir}/history-${f.modelSport}-${f.event.id}.json`));
 const transition=[];
 if(b.state==='completed')for(const seconds of [60,10,1,0]){
  const e=structuredClone(f.event),s=structuredClone(f.summary),c=e.competitions[0];
  const extra=/SO/i.test(c.status.type.detail)?5:/OT/i.test(c.status.type.detail)?4:null;
  c.status={period:c.status.period||(f.modelSport==='CFB'?4:extra||3),displayClock:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`,type:{state:'in',completed:false,detail:extra===5?'Shootout':extra?'Overtime':'In Progress'}};
  s.header.competitions[0]=structuredClone(c);
  transition.push({seconds,before:score(before,e,s,f.modelSport).score,after:score(after,e,s,f.modelSport).score});
 }
 rows.push({id:f.event.id,sport:f.modelSport,teams:b.teams.map(t=>t[0]),before:a.score,after:b.score,beforeFactors:a.factors,afterFactors:b.factors,transition,
  replayExclusions:replay.exclusions.length,timeline,recorded:history.snapshots});
 console.log(f.event.id,a.score,'->',b.score,'replay',timeline.length,'last',timeline.at(-1));
 if(f.event.id==='401858505')console.log('NORTHWESTERN',timeline.filter(p=>p.period===4&&['2:00','2:04','1:54'].includes(p.clock)));
}
fs.mkdirSync('calibration/output',{recursive:true});
fs.writeFileSync('calibration/output/finish-audit-20261031.json',JSON.stringify({baselineCommit:'dc201f6',model:after.runtime.MODEL_VERSION,rows,situationProbes},null,2)+'\n');

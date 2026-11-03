import fs from 'node:fs';
import vm from 'node:vm';
import {contextsForGames,pregameStoryEligible,evidenceSupportsType} from '../alerts-worker/src/storylines.js';
const fixture=JSON.parse(fs.readFileSync(new URL('../alerts-worker/test/fixtures/research-trace-20261103.json',import.meta.url)));
const slate=JSON.parse(fs.readFileSync(new URL('../alerts-worker/test/fixtures/research-slate-20261103.json',import.meta.url)));
const now=Date.parse(slate.capturedAt),games=slate.games;
const env={DB:{prepare(){let args=[];return {bind(...v){args=v;return this;},async all(){return {results:fixture.rows.filter(r=>r.expires_at>=args[0]&&args.slice(1).includes(r.event_id))};}};}}};
const accepted=await contextsForGames(env,games.map(g=>`${g.sport}:${g.id}`),games,now);
// Execute the actual public link selector and sentence formatter from app.js.
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const functions=app.slice(app.indexOf('function upcomingLinkedStories('),app.indexOf('function trendFor('));
const context=vm.createContext({URL,Intl,Date});vm.runInContext(functions,context);
export const trace={capturedAt:slate.capturedAt,researchStatus:fixture.researchStatus,workerDeployment:fixture.workerDeployment,
  rows:fixture.rows.map(row=>{
    const game=games.find(g=>g.sport===row.sport&&String(g.id)===row.event_id),key=`${row.sport}:${row.event_id}`;
    let saved;try{saved=JSON.parse(row.context_text);}catch{}
    const readAccepted=(accepted[key]||[]).some(s=>s.type===row.factor_type&&s.sourceUrl===row.source_url);
    const links=game?context.upcomingLinkedStories({...game,qualitativeContexts:accepted[key]||[]},now):[];
    return {key,type:row.factor_type,title:row.source_title,url:row.source_url,updatedAt:new Date(row.updated_at*1000).toISOString(),
      upcomingInCapturedFeed:Boolean(game),stored:true,unexpired:row.expires_at>=now/1000,
      typeEvidenceSupported:evidenceSupportsType({headline:row.source_title,description:saved?.description||''},row.factor_type),
      pregameEvidenceEligible:pregameStoryEligible(row,saved,now),readAccepted,
      publiclyLinked:links.some(s=>s.type===row.factor_type&&s.sourceUrl===row.source_url),
      disposition:!game?'not an upcoming game in captured feed':!readAccepted?'rejected during context read':
        links.some(s=>s.type===row.factor_type&&s.sourceUrl===row.source_url)?'publicly linked':'suppressed by public link selector'};
  })};
if(process.argv.includes('--write')){
  fs.mkdirSync(new URL('../audit/pregame-upgrade-20261103/',import.meta.url),{recursive:true});
  fs.writeFileSync(new URL('../audit/pregame-upgrade-20261103/research-trace.json',import.meta.url),JSON.stringify(trace,null,2)+'\n');
  console.log(JSON.stringify({stored:trace.rows.length,upcoming:trace.rows.filter(r=>r.upcomingInCapturedFeed).length,accepted:trace.rows.filter(r=>r.readAccepted).length,linked:trace.rows.filter(r=>r.publiclyLinked).length}));
}

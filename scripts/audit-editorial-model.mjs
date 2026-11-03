import fs from 'node:fs';
import {createRequire} from 'node:module';
import {articleMetadata,deterministicFactor} from '../alerts-worker/src/storylines.js';
import {discoverEditorialStories,editorialArticleEligible} from '../alerts-worker/src/editorial-context.js';
const require=createRequire(new URL('../alerts-worker/package.json',import.meta.url));
const {getPlatformProxy}=require('wrangler');
const news=JSON.parse(fs.readFileSync('work/final-quality/news.json'));
const feed=JSON.parse(fs.readFileSync('work/final-quality/feed.json'));
const selected=[['CFB',50359646,'201'],['CFB',50360298,'99'],['NFL',50362043,'1'],['NHL',50361048,'12']];
const items=selected.map(([sport,id,team],index)=>{
  const raw=news.find(n=>n.sport===sport).payload.articles.find(a=>a.id===id);
  const source=feed.games.filter(g=>g.sport===sport&&g.state==='upcoming'&&g.teams.some(t=>String(t[8])===team)).sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime))[0];
  if(!raw||!source)throw Error('Missing archived source or matchup '+id);
  const teams=source.teams.map(t=>({id:String(t[8]),name:t[0],abbr:t[1]}));
  return {id:'i'+index,sport,eventId:source.id,gameKey:`${sport}:${source.id}`,matchup:teams.map(t=>t.name).join(' vs '),
    game:{id:source.id,eventId:source.id,sport,state:'upcoming',teamIds:new Set(teams.map(t=>t.id)),teams},article:articleMetadata(raw)};
});
const now=Date.parse(feed.updatedAt),calls=[];
const proxy=await getPlatformProxy({configPath:'work/final-quality/ai-audit.wrangler.json',persist:false});
try{
  const budgetBefore=await proxy.env.DB.prepare('SELECT day,reserved_neurons FROM research_ai_budget ORDER BY day DESC LIMIT 1').all();
  const env={DB:proxy.env.DB,AI:{async run(model,args){try{const result=await proxy.env.AI.run(model,args);calls.push({model,messages:args.messages,result});return result;}catch(error){calls.push({model,error:String(error)});throw error;}}}};
  const accepted=await discoverEditorialStories(env,items,now);
  const report={executedAt:new Date().toISOString(),sourceCapturedAt:feed.updatedAt,
    note:'Actual Workers AI inference through a development binding; both requests reserve the existing production research budget. No production Worker deployment or storyline writes.',
    budgetBefore:budgetBefore.results,items:items.map(i=>({id:i.id,sport:i.sport,eventId:i.eventId,matchup:i.matchup,headline:i.article.headline,description:i.article.description,url:i.article.url,
      published:i.article.published,teamIds:[...i.article.teamIds],eventIds:[...i.article.eventIds],eligible:editorialArticleEligible(i.article,i.game,now),oldDeterministic:deterministicFactor(i.article)})),accepted,calls};
  fs.writeFileSync('work/final-quality/actual-ai-review.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({calls:calls.length,errors:calls.filter(c=>c.error),budgetBefore:report.budgetBefore,accepted:accepted.map(a=>({id:a.id,kind:a.kind})),items:report.items.map(i=>({id:i.id,headline:i.headline,eligible:i.eligible}))},null,2));
}finally{await proxy.dispose();}

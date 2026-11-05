import {SOURCE_LIMITS,officialIndexes,officialLinks,documentFromHtml,sourceAuthority,reportingSourceAllowed} from './source-evidence.js';
const DAY=86400000;
export function retainedDocuments(documents=[],now=Date.now()){
  const ordered=[...new Map(documents.filter(d=>d&&typeof d.url==='string'&&typeof d.body==='string'&&d.body.length<=SOURCE_LIMITS.body&&
    Number.isFinite(d.retrievedAt)&&d.retrievedAt<=now+60000&&now-d.retrievedAt<=SOURCE_LIMITS.historyDays*DAY).map(d=>[d.url,d])).values()]
    .sort((a,b)=>b.retrievedAt-a.retrievedAt).slice(0,SOURCE_LIMITS.documents);
  let bytes=0;
  return ordered.filter(doc=>{const size=new TextEncoder().encode(JSON.stringify(doc)).length;if(bytes+size>SOURCE_LIMITS.cacheBytes)return false;bytes+=size;return true;});
}
async function boundedHtml(url,diagnostics){
  if(diagnostics.requests>=SOURCE_LIMITS.requests)throw Error('Source request budget exhausted');
  diagnostics.requests++;
  const r=await fetch(url,{redirect:'manual',headers:{Accept:'text/html','User-Agent':'SlateMeter/1.0 (https://slatemeter.app)'},signal:AbortSignal.timeout(7000),cf:{cacheTtl:300,cacheEverything:true}});
  if(!r.ok||!r.headers.get('content-type')?.includes('text/html'))throw Error(`Source unavailable (${r.status})`);
  if(Number(r.headers.get('content-length'))>SOURCE_LIMITS.bytes)throw Error('Source exceeds byte limit');
  if(!r.body)throw Error('Empty source');
  const reader=r.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>SOURCE_LIMITS.bytes){await reader.cancel();throw Error('Source exceeds byte limit');}text+=decoder.decode(value,{stream:true});}
  diagnostics.bytes+=bytes;return text+decoder.decode();
}
export function selectOfficialTarget(items,state,classify,now=Date.now()){
  const candidates=new Map();
  for(const item of items){
    const factor=classify(item.article),g=item.game;
    if(!factor||!g||!['confirmed_key_starters','star_absence','star_injury_return','player_injury_return','rivalry','coach_return','former_star_return','former_captain_return','playoff_rematch','championship_rematch','meaningful_rematch','milestone_chase','major_trade_storyline','team_win_streak','ace_pitching_matchup','notable_recent_performance','star_hot_streak','elite_efficiency_profile','strength_of_schedule','playoff_race','season_debut','rivalry_development'].includes(factor.type))continue;
    if(g.publicGame?.qualitativeContexts?.some(f=>f.registryVersion&&f.type===factor.type))continue;
    const key=g.key||`${g.sport}:${g.eventId||g.id}`;
    if(Number(state.sourceFailureUntil?.[key])>now)continue;
    const indexes=officialIndexes(g);
    if(reportingSourceAllowed(item.article.url))indexes.push(item.article.url);
    if(!indexes.length)continue;
    const previous=Number(state.lastVerified?.[key])||0;
    if(previous>now-2*3600000)continue;
    const urgency=Number(['confirmed_key_starters','star_absence','star_injury_return','player_injury_return'].includes(factor.type));
    const ranked=Number(['CFB','NCAAB'].includes(g.sport)&&g.teams.some(t=>Number(t.rank)>=1&&Number(t.rank)<=25));
    const candidate={key,game:g,item,indexes,previous,urgency,ranked};
    const prior=candidates.get(key);if(!prior||urgency>prior.urgency)candidates.set(key,candidate);
  }
  return [...candidates.values()].sort((a,b)=>a.previous-b.previous||b.urgency-a.urgency||b.ranked-a.ranked||b.game.score-a.game.score||a.key.localeCompare(b.key))[0];
}
export async function researchOfficialSources(items,state,classify,now=Date.now()){
  const diagnostics={requests:0,bytes:0,target:null,index:null,url:null,accepted:false,failed:false};
  const documents=retainedDocuments(state.documents,now),target=selectOfficialTarget(items,state,classify,now);
  if(!target)return {documents,diagnostics,lastVerified:state.lastVerified||{},sourceFailureUntil:state.sourceFailureUntil||{},sourceIndex:state.sourceIndex||{}};
  const {key,game,item,indexes}=target;diagnostics.target=key;
  // Index choice rotates after a completed attempt; source hints are trusted
  // only as candidate URLs, never as factual verification.
  const index=indexes[(state.sourceIndex?.[key]||0)%indexes.length];diagnostics.index=index;
  const found=[];
  try{
    const html=await boundedHtml(index,diagnostics);
    if(reportingSourceAllowed(index)){
      const doc=documentFromHtml(html,index,now);
      if(!doc)throw Error('Unsupported reporting structure');
      found.push(doc);diagnostics.url=index;diagnostics.accepted=true;
      // Only follow references actually present in the fetched article. A second
      // URL is discovery, not proof of independence; the verifier checks origins.
      const link=doc.links.find(url=>(reportingSourceAllowed(url)||sourceAuthority(url,game))&&
        /\/news\/|\/article\/|\/story\//.test(new URL(url).pathname)&&!documents.some(d=>d.url===url&&now-d.retrievedAt<6*3600000));
      if(link){const other=documentFromHtml(await boundedHtml(link,diagnostics),link,now);if(other)found.push(other);}
    }else{
      const links=officialLinks(html,index,game,item.article.headline);
      const candidate=links.find(l=>!documents.some(d=>d.url===l.url&&now-d.retrievedAt<6*3600000));
      if(candidate){
        diagnostics.url=candidate.url;
        const doc=documentFromHtml(await boundedHtml(candidate.url,diagnostics),candidate.url,now);
        if(!doc||!sourceAuthority(doc.url,game))throw Error('Unsupported source structure or identity');
        found.push(doc);diagnostics.accepted=true;
      }
    }
  }catch(error){diagnostics.failed=true;diagnostics.error=String(error).slice(0,160);}
  return {documents:retainedDocuments([...found,...documents.filter(d=>!found.some(f=>f.url===d.url))],now),diagnostics,
    lastVerified:{...state.lastVerified,[key]:now},sourceFailureUntil:{...state.sourceFailureUntil,[key]:diagnostics.failed?now+6*3600000:0},
    sourceIndex:{...state.sourceIndex,[key]:(state.sourceIndex?.[key]||0)+1}};
}

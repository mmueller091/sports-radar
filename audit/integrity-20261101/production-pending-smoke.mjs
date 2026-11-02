// Public GET diagnosis of pending rows; no explicit refresh or notification call.
import fs from 'node:fs';
const base='https://sports-radar-alerts.mmueller918.workers.dev';
const requests=[];
async function get(url){const parsed=new URL(url);if(!['sports-radar-alerts.mmueller918.workers.dev','site.api.espn.com'].includes(parsed.hostname))throw new Error('Unexpected host');const r=await fetch(url,{signal:AbortSignal.timeout(20000)});requests.push({url,status:r.status,at:new Date().toISOString()});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
const feed=await get(base+'/feed');
const pending=feed.games.filter(g=>g.enrichmentPending||g.summaryValidationPending);
const groups={};for(const g of pending){const key=g.sport+':'+g.state;const count=groups[key]||={count:0,enrichmentPending:0,summaryValidationPending:0,reasons:{}};count.count++;count.enrichmentPending+=Number(Boolean(g.enrichmentPending));count.summaryValidationPending+=Number(Boolean(g.summaryValidationPending));for(const reason of g.evidenceReasons||[])count.reasons[reason]=(count.reasons[reason]||0)+1;}
const result={executedAt:new Date().toISOString(),feed:{updatedAt:feed.updatedAt,modelVersion:feed.modelVersion,freshness:feed.freshness,enrichmentProgress:feed.enrichmentProgress},pendingCount:pending.length,groups,samples:[],requests};
for(const sport of [...new Set(pending.map(g=>g.sport))]){
  const candidates=pending.filter(g=>g.sport===sport);
  for(const game of [candidates[0],...(candidates.length>1?[candidates.at(-1)]:[])]){
    const source=(feed.sourceErrors||[]).find(url=>new URL(url).searchParams.get('event')===String(game.id));
    const detail=await get(`${base}/game/${sport}/${game.id}`);
    const sample={sport,id:game.id,state:game.state,startTime:game.startTime,status:game.status,teams:game.teams.map(t=>({id:t[8],name:t[0],displayScore:t[2]})),enrichmentPending:game.enrichmentPending,summaryValidationPending:game.summaryValidationPending,evidenceReasons:game.evidenceReasons,detailFreshness:detail.sportsRadarFreshness,detailPending:detail.sportsRadarGame?.enrichmentPending};
    if(source){
      const summary=await get(source),competition=summary.header?.competitions?.[0];
      sample.providerSummary={state:competition?.status?.type?.state,competitors:(competition?.competitors||[]).map(c=>({id:c.team?.id||c.id,scorePresent:Object.hasOwn(c,'score'),score:c.score??null,scoreType:typeof c.score})),headerPresent:Boolean(competition)};
      const url=new URL(source);url.pathname=url.pathname.replace(/\/summary$/,'/scoreboard');url.search='';url.searchParams.set('dates',new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(game.startTime)).replaceAll('-',''));
      const scoreboard=await get(url),event=scoreboard.events?.find(e=>String(e.id)===String(game.id)),current=event?.competitions?.[0];
      sample.providerScoreboard={state:current?.status?.type?.state,competitors:(current?.competitors||[]).map(c=>({id:c.team?.id||c.id,scorePresent:Object.hasOwn(c,'score'),score:c.score??null,scoreType:typeof c.score})),eventPresent:Boolean(event)};
      sample.exactGuardWouldMatch=Boolean(competition&&current&&competition.status?.type?.state===current.status?.type?.state&&current.competitors.every(c=>competition.competitors.some(o=>String(o.team?.id||o.id)===String(c.team?.id||c.id)&&String(o.score)===String(c.score))));
    }
    result.samples.push(sample);
  }
}
fs.writeFileSync(new URL('./production-pending-smoke.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));

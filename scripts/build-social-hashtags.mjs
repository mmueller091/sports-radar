/**
 * Research-only importer. Never run this during a live Worker refresh or from
 * the posting path. Generated output is reviewed and committed as static data.
 *
 * Usage: node scripts/build-social-hashtags.mjs [--verify-x]
 * The X option reads public profiles only; it never signs in or posts.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NFL,NHL,NBA} from '../social/hashtag-seeds.mjs';
import {parseBlinkfire,verifyFromXHtml} from './hashtag-parsers.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const teams=JSON.parse(readFileSync(resolve(root,'teams.json'),'utf8'));
const verifyX=process.argv.includes('--verify-x');
const sourcePages={
  NBA:'https://www.blinkfire.com/publisher/leaguehashtags/nba',
  CFB:'https://www.blinkfire.com/publisher/leaguehashtags/college_football',
  NCAAB:'https://www.blinkfire.com/publisher/leaguehashtags/mens_college_basketball'
};
const nhlSeasonSource='https://puckbeat.com/story/nhl-teams-reveal-2026-27-social-media-hashtags';
const today=new Date().toISOString().slice(0,10);
const verifiedLabels=new Set(['official-bio','official-post','official-site']);

function unique(items){return [...new Set(items.filter(Boolean))];}
function tag(value){return /^#[A-Za-z0-9_]{2,48}$/.test(value||'')?value:null;}
function uniqueTags(items){
  const found=new Map();
  for(const item of items){
    const value=tag(item);
    if(value&&!found.has(value.toLowerCase()))found.set(value.toLowerCase(),value);
  }
  return [...found.values()];
}

async function download(url){
  const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; SlateMeterHashtagResearch/1.0)'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`${url}: HTTP ${response.status}`);
  const length=Number(response.headers.get('content-length')||0);
  if(length>2_000_000)throw new Error(`${url}: source exceeds limit`);
  const text=await response.text();
  if(text.length>2_000_000)throw new Error(`${url}: source exceeds limit`);
  return text;
}

const index=Object.fromEntries(Object.entries(teams).map(([sport,items])=>
  [sport,new Map(items.map(item=>[String(item.id),item]))]));
// Never discard a manually verified record when an incomplete external
// directory is refreshed. Official-site research is not in the directories.
const existing=JSON.parse(readFileSync(resolve(root,'social/hashtags.json'),'utf8'));
if(existing.schemaVersion!==1)throw new Error('Unsupported existing hashtag registry schema');
const registry={schemaVersion:1,generatedAt:today,
  meaning:'First-party confirmed tags may be used in posts. Other entries are discovery leads only.',
  teams:Object.fromEntries(['NFL','NBA','NHL','CFB','NCAAB'].map(sport=>
    [sport,{...(existing.teams?.[sport]||{})}]))};

function put(sport,id,{primary=null,aliases=[],account=null,sourceUrls=[],verification='candidate'}={}){
  const team=index[sport].get(String(id));if(!team)return false;
  const previous=registry.teams[sport][id]||{};
  const suggestions=uniqueTags([previous.primary,primary,...(previous.aliases||[]),...aliases]);
  registry.teams[sport][id]={name:team.name,primary:suggestions[0]||null,
    aliases:suggestions,account:previous.account||account||null,
    verification:verifiedLabels.has(previous.verification)?previous.verification:previous.verification||verification,
    sourceUrls:unique([...(previous.sourceUrls||[]),...sourceUrls]),
    lastVerifiedAt:previous.lastVerifiedAt||null};
  return true;
}

for(const [sport,seeds] of [['NFL',NFL],['NHL',NHL],['NBA',NBA]]){
  const byName=new Map(teams[sport].map(t=>[t.name,t.id]));
  for(const [name,handle,suggestion] of seeds){
    const id=byName.get(name);
    if(!id)throw new Error(`Unknown ${sport} team: ${name}`);
    put(sport,id,{primary:suggestion,account:handle,
      sourceUrls:[...(sport==='NHL'?[nhlSeasonSource]:[]),`https://x.com/${handle}`],
      verification:sport==='NHL'?'seasonal-report':'candidate'});
  }
}

for(const [sport,url] of Object.entries(sourcePages)){
  const rows=parseBlinkfire(await download(url));
  if(rows.length<20)throw new Error(`Incomplete ${sport} discovery source: only ${rows.length} rows`);
  for(const row of rows){
    if(!index[sport].has(row.id)||!row.tags.length)continue;
    put(sport,row.id,{aliases:row.tags,sourceUrls:[url,row.teamUrl]});
  }
  console.log(`Discovered ${sport}: ${rows.length} listed programs, ${rows.filter(x=>x.tags.length).length} with candidate hashtags`);
}

if(verifyX){
  const college=[];
  for(const sport of ['CFB','NCAAB']){
    for(const [id,entry] of Object.entries(registry.teams[sport])){
      if(entry.account)continue;
      const teamUrl=entry.sourceUrls.find(url=>url.includes('/publisher/team/'));
      if(teamUrl)college.push({sport,id,entry,teamUrl});
    }
  }
  let collegeCursor=0,collegeHandles=0;
  await Promise.all(Array.from({length:5},async()=>{
    while(collegeCursor<college.length){
      const row=college[collegeCursor++];
      try{
        const html=await download(row.teamUrl);
        const handles=unique([...html.matchAll(/https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})/g)]
          .map(match=>match[1]).filter(handle=>!/^blinkfire|^share$|^intent$/i.test(handle)));
        if(handles.length===1){
          row.entry.account=handles[0];
          row.entry.sourceUrls.push(`https://x.com/${handles[0]}`);
          collegeHandles++;
        }
      }catch(error){/* Leave ambiguous or unavailable programs unverified. */}
    }
  }));
  console.log(`Resolved ${collegeHandles}/${college.length} college accounts from the discovery directory`);
  const jobs=[];
  for(const [sport,entries] of Object.entries(registry.teams)){
    for(const [id,entry] of Object.entries(entries)){
      if(verifiedLabels.has(entry.verification))continue;
      if(!entry.account||!entry.aliases.length)continue;
      jobs.push({sport,id,entry});
    }
  }
  // Bounded research concurrency. No live scoring or posting requests.
  let cursor=0,checked=0,verified=0,unavailable=0;
  const workers=Array.from({length:5},async()=>{
    while(cursor<jobs.length){
      const job=jobs[cursor++];
      try{
        const html=await download(`https://x.com/${job.entry.account}`);
        const result=verifyFromXHtml(html,job.entry.account,job.entry.aliases);
        checked++;
        if(result){
          job.entry.primary=result.primary;
          job.entry.verification=result.verification;
          job.entry.lastVerifiedAt=today;
          verified++;
        }
      }catch(error){unavailable++;}
    }
  });
  await Promise.all(workers);
  console.log(`Checked ${checked} official profiles, verified ${verified} hashtags; ${unavailable} unavailable`);
}

for(const entries of Object.values(registry.teams)){
  const sorted=Object.entries(entries).sort(([a],[b])=>Number(a)-Number(b));
  for(const key of Object.keys(entries))delete entries[key];
  for(const [id,entry] of sorted)entries[id]=entry;
}
const output=resolve(root,'social/hashtags.json');
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify(registry,null,2)+'\n');
console.log(`Wrote ${output}: `+Object.entries(registry.teams).map(([s,e])=>
  `${s} ${Object.keys(e).length} entries/${Object.values(e).filter(x=>x.verification.startsWith('official-')).length} official confirmations`).join(', '));

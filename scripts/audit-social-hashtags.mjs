/**
 * Offline, read-only coverage audit. This never looks up X accounts, runs a
 * Worker cron, sends a Buffer post, or makes a provider/AI request.
 *
 * Usage:
 *   node scripts/audit-social-hashtags.mjs
 *   node scripts/audit-social-hashtags.mjs --feed saved-feed.json
 *   node scripts/audit-social-hashtags.mjs --json
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import teams from '../teams.json' with {type:'json'};
import registry from '../social/hashtags.json' with {type:'json'};
import {teamHashtag} from '../social/hashtag-registry.mjs';

export const SPORTS=['NFL','NBA','NHL','CFB','NCAAB'];
const canonicalSport=sport=>sport==='NCAAM'?'NCAAB':sport;
const teamId=team=>Array.isArray(team)?team[8]:team?.id??team?.teamId??team?.team?.id;

export function auditSocialHashtags({catalog=teams,hashtags=registry,feed=null}={}){
  const bySport={};
  const knownBySport={};
  const problems=[];
  for(const sport of SPORTS){
    const canonical=catalog[sport]||[];
    const entries=hashtags.teams?.[sport]||{};
    const known=new Map(canonical.map(team=>[String(team.id),team]));
    knownBySport[sport]=known;
    const status={total:canonical.length,verified:0,candidate:0,missing:0,
      unverified:[],unlisted:[],unknownRegistryIds:[]};
    for(const team of canonical){
      const id=String(team.id);
      const entry=entries[id];
      if(!entry){
        status.missing++;
        status.unlisted.push({id,name:team.name});
      }else if(teamHashtag(sport,id,{registry:hashtags})?.primary){
        status.verified++;
      }else{
        status.candidate++;
        status.unverified.push({id,name:team.name,candidate:entry.primary,verification:entry.verification});
      }
      if(entry && entry.name!==team.name){
        problems.push({sport,id,problem:'name-mismatch',canonicalName:team.name,registryName:entry.name});
      }
    }
    for(const id of Object.keys(entries)){
      if(!known.has(id))status.unknownRegistryIds.push(id);
    }
    bySport[sport]=status;
  }
  const total=Object.values(bySport).reduce((acc,row)=>{
    for(const key of ['total','verified','candidate','missing'])acc[key]+=row[key];
    return acc;
  },{total:0,verified:0,candidate:0,missing:0});
  const priority={games:0,teams:0,verified:0,candidate:0,missing:0,items:[]};
  if(feed){
    if(!Array.isArray(feed.games))throw new Error('Feed must contain a games array');
    const seen=new Map();
    for(const game of feed.games){
      const sport=canonicalSport(game.sport);
      if(!SPORTS.includes(sport)||!['live','upcoming'].includes(game.state))continue;
      priority.games++;
      for(const team of (game.teams||[]).slice(0,2)){
        const id=String(teamId(team)||'');
        if(!/^\d+$/.test(id)||!knownBySport[sport].has(id))continue;
        const key=`${sport}:${id}`;
        const previous=seen.get(key);
        if(previous && (previous.state==='live'||game.state!=='live'))continue;
        const entry=hashtags.teams?.[sport]?.[id];
        const verified=teamHashtag(sport,id,{registry:hashtags})?.primary;
        const status=verified?'verified':entry?'candidate':'missing';
        seen.set(key,{sport,id,name:knownBySport[sport].get(id).name,
          status,hashtag:verified||null,candidate:entry?.primary||null,state:game.state});
      }
    }
    priority.items=[...seen.values()].sort((a,b)=>
      (a.state==='live'?-1:0)-(b.state==='live'?-1:0)
      ||SPORTS.indexOf(a.sport)-SPORTS.indexOf(b.sport)||a.name.localeCompare(b.name));
    priority.teams=priority.items.length;
    for(const team of priority.items)priority[team.status]++;
  }
  return {total,bySport,priority,problems};
}

export function formatSocialAudit(report){
  const rows=['Sport  Total  Verified  Candidate  Missing'];
  for(const sport of SPORTS){
    const r=report.bySport[sport];
    rows.push(`${sport.padEnd(6)} ${String(r.total).padStart(5)}  ${String(r.verified).padStart(8)}  ${String(r.candidate).padStart(9)}  ${String(r.missing).padStart(7)}`);
  }
  rows.push(`TOTAL  ${String(report.total.total).padStart(5)}  ${String(report.total.verified).padStart(8)}  ${String(report.total.candidate).padStart(9)}  ${String(report.total.missing).padStart(7)}`);
  rows.push('Only first-party verified tags are auto-posted; candidate and missing tags are omitted.');
  if(report.priority.games){
    const p=report.priority;
    rows.push(`Live/upcoming feed: ${p.games} games, ${p.teams} unique teams, ${p.verified} verified, ${p.candidate} candidate, ${p.missing} missing.`);
    for(const team of p.items.filter(team=>team.status!=='verified').slice(0,30)){
      rows.push(`  ${team.state} ${team.sport} ${team.name} (${team.id}): ${team.status}${team.candidate?` ${team.candidate}`:''}`);
    }
  }
  if(report.problems.length)rows.push(`Registry name mismatches: ${report.problems.length}`);
  return rows.join('\n');
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  const unknown=args.filter((arg,i)=>!['--json','--feed'].includes(arg)&&args[i-1]!=='--feed');
  if(unknown.length||args.includes('--feed')&&!args[args.indexOf('--feed')+1]){
    console.error('Usage: node scripts/audit-social-hashtags.mjs [--json] [--feed saved-feed.json]');
    process.exitCode=2;
  }else{
    const feedPath=args.includes('--feed')?args[args.indexOf('--feed')+1]:null;
    const raw=feedPath?JSON.parse(readFileSync(resolve(feedPath),'utf8')):null;
    const report=auditSocialHashtags({feed:raw?(raw.feed||raw):null});
    process.stdout.write(args.includes('--json')?JSON.stringify(report,null,2)+'\n':formatSocialAudit(report)+'\n');
  }
}

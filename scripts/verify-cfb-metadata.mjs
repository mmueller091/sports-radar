import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {cfbSeason,conferenceSourceUrl,normalizeCfbConferences} from '../alerts-worker/src/cfb-metadata.js';
const season=cfbSeason(),directory='work/cfb-filters';
mkdirSync(directory,{recursive:true});
const sources=await Promise.all([80,81].map(async group=>{
  const response=await fetch(conferenceSourceUrl(group,season));
  assert.equal(response.status,200);
  const data=await response.json();
  writeFileSync(`${directory}/standings-${group}.json`,JSON.stringify(data));
  return data;
}));
const metadata=normalizeCfbConferences(sources,season);
writeFileSync(`${directory}/metadata.json`,JSON.stringify(metadata));
console.log('ESPN conference index:',season,metadata.conferences.length,'groups,',Object.keys(metadata.teams).length,'teams,',JSON.stringify(metadata).length,'bytes');
const worker='https://sports-radar-alerts.mmueller918.workers.dev';
const feedResponse=await fetch(worker+'/feed');assert.equal(feedResponse.status,200);
const feed=await feedResponse.json();
writeFileSync(`${directory}/feed.json`,JSON.stringify(feed));
const cfb=feed.games.filter(g=>g.sport==='CFB');
console.log('Production model:',feed.modelVersion,'CFB games:',cfb.length,'ranked games:',cfb.filter(g=>g.teams.some(t=>Number(t[6])>=1&&Number(t[6])<=25)).length);
console.log('Teams with unknown membership:',[...new Set(cfb.flatMap(g=>g.teams).filter(t=>!metadata.teams[t[8]]).map(t=>t[8]+': '+t[0]))]);
// Compare normalized rankings with the provider's curatedRank, independently of
// the excitement model. Missing rankings must normalize to null.
const ranked=new Map();
for (const group of [80,81]) {
  const response=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=${group}&limit=1000`);
  assert.equal(response.status,200);
  const scoreboard=await response.json();
  writeFileSync(`${directory}/scoreboard-${group}.json`,JSON.stringify(scoreboard));
  for(const event of scoreboard.events || [])for(const competitor of event.competitions?.[0]?.competitors || []) {
    const rank=Number(competitor.curatedRank?.current ?? competitor.team?.rank);
    ranked.set(String(competitor.team?.id),Number.isInteger(rank)&&rank>=1&&rank<=25?rank:null);
  }
}
let checked=0;
for(const team of cfb.flatMap(g=>g.teams))if(ranked.has(String(team[8]))) {
  assert.equal(team[6] ?? null,ranked.get(String(team[8])),`Rank mismatch: ${team[0]}`);checked++;
}
assert.ok(checked>0);
console.log('Verified',checked,'team rankings against ESPN scoreboard curatedRank, including null/unranked.');

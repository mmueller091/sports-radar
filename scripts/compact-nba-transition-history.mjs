import fs from 'node:fs';
import crypto from 'node:crypto';

const games=[
  ['401909907','cavaliers-thunder'],
  ['401909905','clippers-warriors']
].map(([id,name])=>{
  const bytes=fs.readFileSync(`work/${name}-production.json`),raw=JSON.parse(bytes);
  const all=raw.sportsRadarHistory.snapshots;
  const start=all.findIndex(p=>p.state==='live'&&p.period===4&&p.clock==='0.0');
  const resumed=all.findIndex((p,i)=>i>start&&p.state==='live'&&p.period===4&&p.clock!=='0.0');
  if(start<4||resumed<=start)throw Error(`Transition missing in ${name}`);
  const indices=new Set([...Array(resumed-start+8)].map((_,i)=>start-4+i).filter(i=>i<all.length));
  const ending=all.findLastIndex(p=>p.state==='live'&&p.period===4&&p.clock==='0.0'&&/End of 4th Quarter/i.test(p.phaseLabel));
  if(ending>=0)indices.add(ending);
  const final=all.findIndex(p=>p.state==='completed');
  if(final>=0)indices.add(final);
  const snapshots=[...indices].sort((a,b)=>a-b).map(i=>all[i]);
  const scoringPlays=raw.plays.filter(p=>p.scoringPlay).map(p=>({
    id:p.id,period:{number:p.period?.number},clock:{displayValue:p.clock?.displayValue},
    homeScore:p.homeScore,awayScore:p.awayScore,text:p.text,wallclock:p.wallclock,scoringPlay:true
  }));
  return {id,source:`https://sports-radar-alerts.mmueller918.workers.dev/game/NBA/${id}`,
    sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),
    originalSnapshotCount:all.length,originalScoringPlayCount:scoringPlays.length,
    game:{id,sport:'NBA',state:raw.sportsRadarGame.state,score:raw.sportsRadarGame.score,teams:raw.sportsRadarGame.teams},
    snapshots,scoringPlays};
});
fs.writeFileSync('test/fixtures/nba-production-transition.json',JSON.stringify({
  provenance:'Compact, verbatim fields selected from public production responses fetched 2026-11-02; raw responses retained in ignored work/ files.',games
},null,2)+'\n');
console.log(games.map(g=>`${g.id}: ${g.snapshots.length}/${g.originalSnapshotCount} snapshots, ${g.scoringPlays.length} scoring plays`).join('\n'));

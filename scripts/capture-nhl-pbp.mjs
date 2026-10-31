// Explicit, read-only public-source capture. Tests and reports never fetch.
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const ids=process.argv.slice(2);
if (!ids.length || ids.some(id=>!/^\d{10}$/.test(id))) throw new Error('Supply NHL game IDs');
const dir=new URL('../test/fixtures/nhl-public/',import.meta.url);mkdirSync(dir,{recursive:true});
for (const id of ids) {
  const url=`https://api-web.nhle.com/v1/gamecenter/${id}/play-by-play`;
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
  const pbp=await response.json();
  if (String(pbp.id)!==id || !pbp.plays?.length) throw new Error('Invalid PBP');
  const data=JSON.stringify(pbp,null,2)+'\n';
  writeFileSync(new URL(`${id}.json`,dir),data);
  writeFileSync(new URL(`${id}.source.json`,dir),JSON.stringify({url,capturedAt:new Date().toISOString(),
    sha256:createHash('sha256').update(data).digest('hex'),description:'Final corrected NHL public PBP; historical checkpoints reconstructed, not recorded live observations.'},null,2)+'\n');
  console.log(`${id}: ${pbp.awayTeam.abbrev} ${pbp.awayTeam.score} @ ${pbp.homeTeam.abbrev} ${pbp.homeTeam.score}; ${pbp.plays.length} events`);
}

// Optional public archive capture. Never imported by production or test runs.
import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const directory=new URL('../test/fixtures/release-basketball-20261103/',import.meta.url);
fs.mkdirSync(directory,{recursive:true});
const selections=[
 ['NCAAB','mens-college-basketball','20191126','401168219'],
 ['NCAAB','mens-college-basketball','20191112','401169817'],
 ['NCAAB','mens-college-basketball','20231202','401588945'],
 ['NBA','nba','20231228','401585049'],
 ['NCAAB','mens-college-basketball','20261102','401918947'],
 ['NCAAB','mens-college-basketball','20261102','401925733'],
 ['NCAAB','mens-college-basketball','20261102','401909771'],
 ['NBA','nba','20261027','401909877'],
];
const manifestPath=new URL('manifest.json',directory);
const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):{description:'Public provider retrospective archives captured for final release audit. These are causal play-prefix reconstruction sources, not original live observations.',captures:[]};
for(const [modelSport,league,date,eventId] of selections){
 if(manifest.captures.some(c=>c.eventId===eventId))continue;
 const base=`https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/`;
 const urls={scoreboard:`${base}scoreboard?dates=${date}&limit=500`,summary:`${base}summary?event=${eventId}`};
 const responses=await Promise.all(Object.values(urls).map(async url=>{const response=await fetch(url);if(!response.ok)throw Error(`${response.status}: ${url}`);return response.json();}));
 const [scoreboard,summary]=responses,event=scoreboard.events.find(e=>String(e.id)===eventId);
 if(!event)throw Error(`Missing ${eventId}`);
 const capturedAt=new Date().toISOString(),fixture={capturedAt,source:'ESPN public site API retrospective archive',modelSport,league,date,eventId,event,summary};
 const bytes=gzipSync(JSON.stringify(fixture)),file=`${modelSport}-${eventId}.json.gz`;
 if(fs.existsSync(new URL(file,directory)))throw Error(`Refusing to overwrite ${file}`);
 fs.writeFileSync(new URL(file,directory),bytes);
 manifest.captures.push({file,modelSport,eventId,date,matchup:event.name,capturedAt,urls,sha256:createHash('sha256').update(bytes).digest('hex')});
 console.log(JSON.stringify({file,matchup:event.name,plays:summary.plays?.length,wp:summary.winprobability?.length,quotes:summary.pickcenter?.map(q=>q.details)}));
}
fs.writeFileSync(new URL('manifest.json',directory),JSON.stringify(manifest,null,2)+'\n');

/**
 * Apply the SlateMeter owner's 2026-11-05 SEC and Big Ten primary approvals.
 * Uses the site's canonical ESPN IDs in both college sports, retaining
 * existing research aliases without allowing them into automatic posts.
 * This script does not contact X, Buffer, Cloudflare, or GitHub.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const teams=JSON.parse(readFileSync(resolve(root,'teams.json'),'utf8'));
const path=resolve(root,'social/hashtags.json');
const registry=JSON.parse(readFileSync(path,'utf8'));
const official=new Set(['official-bio','official-post','official-site']);

const secTags=new Map([
  ['333','#RollTide'],['8','#WPS'],['2','#WarEagle'],
  ['57','#GoGators'],['61','#GoDawgs'],['96','#BBN'],
  ['99','#GeauxTigers'],['344','#HailState'],['142','#MIZ'],
  ['201','#BoomerSooner'],['145','#HottyToddy'],['2579','#Gamecocks'],
  ['2633','#GBO'],['251','#HookEm'],['245','#GigEm'],['238','#AnchorDown']
]);
const bigTenTags=new Map([
  ['356','#Illini'],['84','#GoIU'],['2294','#FightForIowa'],
  ['120','#FearTheTurtle'],['130','#GoBlue'],['127','#GoGreen'],
  ['135','#SkiUMah'],['158','#GBR'],['77','#GoCats'],
  ['194','#GoBucks'],['2483','#GoDucks'],['213','#WeAre'],
  ['2509','#BoilerUp'],['164','#GoRU'],['26','#GoBruins'],
  ['30','#FightOn'],['264','#GoHuskies'],['275','#OnWisconsin']
]);

if(registry.schemaVersion!==1)throw new Error('Unsupported hashtag registry schema');
for(const sport of ['CFB','NCAAB']){
  const canonical=new Map(teams[sport].map(team=>[String(team.id),team]));
  for(const [id,primary] of [...secTags,...bigTenTags]){
    const team=canonical.get(id);
    if(!team)throw new Error(`${sport} missing canonical approved college team ${id}`);
    const previous=registry.teams[sport][id]||{};
    const unchangedOfficial=official.has(previous.verification)
      &&previous.primary?.toLowerCase()===primary.toLowerCase();
    const aliases=new Map();
    for(const candidate of [primary,...(previous.aliases||[])]){
      if(/^#[A-Za-z0-9_]{2,48}$/.test(candidate))
        aliases.set(candidate.toLowerCase(),aliases.get(candidate.toLowerCase())||candidate);
    }
    registry.teams[sport][id]={
      name:team.name,
      primary,
      aliases:[...aliases.values()],
      account:previous.account||null,
      verification:unchangedOfficial?previous.verification:'owner-approved',
      sourceUrls:previous.sourceUrls||[],
      lastVerifiedAt:unchangedOfficial?previous.lastVerifiedAt||null:null
    };
  }
  registry.teams[sport]=Object.fromEntries(Object.entries(registry.teams[sport])
    .sort(([left],[right])=>Number(left)-Number(right)));
}
writeFileSync(path,JSON.stringify(registry,null,2)+'\n');
console.log('Approved 16 SEC and 18 Big Ten primaries in both college sports (68 canonical team entries).');

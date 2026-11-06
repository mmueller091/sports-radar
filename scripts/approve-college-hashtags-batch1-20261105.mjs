/**
 * Apply 107 owner-approved college hashtags from the supplied batch1 workbook.
 * Resolve by canonical ESPN team ID, including three known naming differences.
 * This script does not contact X, Buffer, Cloudflare, or GitHub.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=JSON.parse(readFileSync(resolve(root,'social/owner-college-hashtags-batch1-20261105.json'),'utf8'));
const teams=JSON.parse(readFileSync(resolve(root,'teams.json'),'utf8'));
const registryPath=resolve(root,'social/hashtags.json');
const registry=JSON.parse(readFileSync(registryPath,'utf8'));

const aliases=new Map([
  ['Appalachian State Mountaineers','App State Mountaineers'],
  ['Louisiana Monroe Warhawks','UL Monroe Warhawks'],
  ['FIU Panthers','Florida International Panthers']
]);
const absentFootball=new Set(['Wichita State Shockers','Grand Canyon Lopes','Gonzaga Bulldogs']);
const official=new Set(['official-bio','official-post','official-site']);
const safeTag=tag=>typeof tag==='string'&&/^#[A-Za-z0-9_]{2,48}$/.test(tag);
const key=name=>String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]/g,'');

if(source.schemaVersion!==1||source.schoolTags?.length!==107)
  throw new Error('Unexpected batch1 spreadsheet data');
if(registry.schemaVersion!==1)throw new Error('Unsupported social registry schema');
const seenSchools=new Set();
for(const [name,tag] of source.schoolTags){
  const normalized=key(name);
  if(seenSchools.has(normalized))throw new Error(`Duplicate source school: ${name}`);
  seenSchools.add(normalized);
  if(!safeTag(tag))throw new Error(`Invalid source hashtag for ${name}: ${tag}`);
}

const counts={CFB:0,NCAAB:0};
for(const sport of ['CFB','NCAAB']){
  const index=new Map();
  for(const team of teams[sport]){
    const normalized=key(team.name);
    const matching=index.get(normalized)||[];
    matching.push(team);
    index.set(normalized,matching);
  }
  const seenIds=new Set();
  for(const [sourceName,primary] of source.schoolTags){
    const canonicalName=aliases.get(sourceName)||sourceName;
    const matching=index.get(key(canonicalName))||[];
    if(matching.length===0&&sport==='CFB'&&absentFootball.has(sourceName))continue;
    if(matching.length!==1)
      throw new Error(`${sport}: expected one ESPN team for ${sourceName}, found ${matching.length}`);
    const team=matching[0],id=String(team.id);
    if(seenIds.has(id))throw new Error(`${sport}: duplicate ESPN team ID ${id}`);
    seenIds.add(id);
    const previous=registry.teams[sport][id]||{};
    const sameOfficial=official.has(previous.verification)
      &&previous.primary?.toLowerCase()===primary.toLowerCase();
    const allTags=new Map();
    for(const tag of [primary,previous.primary,...(previous.aliases||[])]){
      if(safeTag(tag))allTags.set(tag.toLowerCase(),allTags.get(tag.toLowerCase())||tag);
    }
    registry.teams[sport][id]={
      name:team.name,
      primary,
      aliases:[...allTags.values()],
      account:previous.account||null,
      verification:sameOfficial?previous.verification:'owner-approved',
      sourceUrls:previous.sourceUrls||[],
      lastVerifiedAt:sameOfficial?previous.lastVerifiedAt||null:null
    };
    counts[sport]++;
  }
  registry.teams[sport]=Object.fromEntries(Object.entries(registry.teams[sport])
    .sort(([left],[right])=>Number(left)-Number(right)));
}
if(counts.CFB!==104||counts.NCAAB!==107)throw new Error('Unexpected sport coverage for batch1');
writeFileSync(registryPath,JSON.stringify(registry,null,2)+'\n');
console.log(`Approved ${counts.CFB} football and ${counts.NCAAB} basketball team hashtags.`);

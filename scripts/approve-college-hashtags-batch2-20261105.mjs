/**
 * Apply owner-approved primary hashtags from batch 2 to canonical ESPN IDs.
 * Run once with --source-csv /path/to/batch\ 2.csv to archive the raw rows.
 * Subsequent runs use the committed JSON source and are idempotent.
 * Offline only: never calls X, Buffer, Cloudflare, GitHub, or a sports feed.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sourcePath=resolve(root,'social/owner-college-hashtags-batch2-20261105.json');
const registryPath=resolve(root,'social/hashtags.json');
const teams=JSON.parse(readFileSync(resolve(root,'teams.json'),'utf8'));
const registry=JSON.parse(readFileSync(registryPath,'utf8'));
const sourceFlag=process.argv.indexOf('--source-csv');
const checkOnly=process.argv.includes('--check');
const official=new Set(['official-bio','official-post','official-site']);
const key=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
const validTag=value=>typeof value==='string'&&/^#[A-Za-z0-9_]{2,48}$/.test(value);

const exactName=new Map(Object.entries({
  'California':'California Golden Bears',
  'Charlotte':'Charlotte 49ers',
  'Charleston':'Charleston Cougars',
  'Cornell':'Cornell Big Red',
  'Delaware':'Delaware Blue Hens',
  'Idaho':'Idaho Vandals',
  'Jacksonville':'Jacksonville Dolphins',
  'Maine':'Maine Black Bears',
  'Monmouth':'Monmouth Hawks',
  'Montana':'Montana Grizzlies',
  'North Carolina':'North Carolina Tar Heels',
  'Virginia':'Virginia Cavaliers',
  'Ohio':'Ohio Bobcats',
  'Penn':'Pennsylvania Quakers',
  'New Mexico':'New Mexico Lobos',
  'North Dakota':'North Dakota Fighting Hawks',
  'South Dakota':'South Dakota Coyotes',
  'Portland':'Portland Pilots',
  'San Diego':'San Diego Toreros',
  'Southern':'Southern Jaguars',
  'Howard':'Howard Bison',
  'Buffalo':'Buffalo Bulls',
  'Lindenwood':'Lindenwood Lions',
  'Pacific':'Pacific Tigers',
  'USF':'South Florida Bulls',
  'Miami (Florida)':'Miami Hurricanes',
  'Miami (Ohio)':'Miami (OH) RedHawks',
  'FGCU':'Florida Gulf Coast Eagles',
  'USC Upstate':'South Carolina Upstate Spartans',
  'FIU':'Florida International Panthers',
  'IU Indy':'IU Indianapolis Jaguars',
  'NC Central':'North Carolina Central Eagles',
  'Central Connecticut State':'Central Connecticut Blue Devils',
  'FDU':'Fairleigh Dickinson Knights',
  'LIU':'Long Island University Sharks',
  'SIUE':'SIU Edwardsville Cougars',
  'Southeastern Louisiana':'SE Louisiana Lions',
  'UIW':'Incarnate Word Cardinals',
  'UTRGV':'UT Rio Grande Valley Vaqueros',
  'UMass':'Massachusetts Minutemen'
}));

// When one school has different conference-row tags, use its sport's row.
const sportTags=new Map([
  ['Navy',{CFB:'#GoNavy',NCAAB:'#Navy'}],
  ['Northern Illinois',{CFB:'#USvsthem',NCAAB:'#NIU'}],
  ['North Dakota State',{CFB:'#GoBison',NCAAB:'#NDSU'}]
]);

function readRows(){
  if(sourceFlag===-1)return JSON.parse(readFileSync(sourcePath,'utf8'));
  const input=process.argv[sourceFlag+1];
  if(!input||input.startsWith('--'))throw new Error('Expected a CSV path after --source-csv');
  const lines=readFileSync(resolve(input),'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  if(lines.shift()!=='conference,school,primary_hashtag')throw new Error('Unexpected CSV columns');
  const records=lines.map((line,i)=>{
    const parts=line.trim().split(',');
    if(parts.length!==3)throw new Error(`Invalid CSV row ${i+2}`);
    return {conference:parts[0],school:parts[1],primaryHashtag:parts[2]};
  });
  return {schemaVersion:1,source:'Owner-provided batch 2.csv',approvedAt:'2026-11-05',records};
}

const source=readRows();
if(source.schemaVersion!==1||source.records?.length!==277)throw new Error('Unexpected batch2 row count');
if(registry.schemaVersion!==1)throw new Error('Unsupported social registry');
const bySchool=new Map();
for(const record of source.records){
  if(!record.conference||!record.school||!validTag(record.primaryHashtag))
    throw new Error(`Malformed row ${JSON.stringify(record)}`);
  const normalized=key(record.school);
  if(!bySchool.has(normalized))bySchool.set(normalized,[]);
  bySchool.get(normalized).push(record);
}
if(bySchool.size!==272)throw new Error(`Unexpected school count: ${bySchool.size}`);

const expectedDuplicates=new Map([
  ['Army',['#GoArmy']],['Navy',['#GoNavy','#Navy']],
  ['Sacramento State',['#StingersUp']],
  ['Northern Illinois',['#NIU','#USvsthem']],
  ['North Dakota State',['#GoBison','#NDSU']]
]);
for(const variants of bySchool.values()){
  const distinct=[...new Set(variants.map(x=>x.primaryHashtag))];
  if(variants.length===1)continue;
  const expected=expectedDuplicates.get(variants[0].school);
  if(!expected||distinct.length!==expected.length||distinct.some(x=>!expected.includes(x)))
    throw new Error(`Unexpected conflicting rows for ${variants[0].school}`);
}

const stats={CFB:{updated:0,retained:0},NCAAB:{updated:0,retained:0}};
const unmatchedBoth=[];
const mappings=[];
for(const variants of bySchool.values()){
  const school=variants[0].school;
  const target=exactName.get(school)||school;
  const normalized=key(target);
  let matchedAny=false;
  const resolved={school,teams:{}};
  for(const sport of ['CFB','NCAAB']){
    const exact=Boolean(exactName.has(school));
    const matched=teams[sport].filter(team=>{
      const candidate=key(team.name);
      return exact?candidate===normalized: candidate===normalized||candidate.startsWith(`${normalized} `);
    });
    if(matched.length>1)throw new Error(`${sport}: ambiguous match for ${school}: ${matched.map(x=>x.name)}`);
    if(matched.length===0)continue;
    matchedAny=true;
    const team=matched[0],id=String(team.id);
    const chosen=sportTags.get(school)?.[sport]||variants[0].primaryHashtag;
    resolved.teams[sport]={id,primary:chosen};
    if(!variants.some(x=>x.primaryHashtag===chosen))
      throw new Error(`${school}: chosen ${chosen} is absent from provided CSV`);
    const previous=registry.teams[sport][id]||{};
    const sameOfficial=official.has(previous.verification)
      &&previous.primary?.toLowerCase()===chosen.toLowerCase();
    const oldTags=[chosen,previous.primary,...(previous.aliases||[])].filter(validTag);
    const aliasByTag=new Map();
    for(const tag of oldTags)if(!aliasByTag.has(tag.toLowerCase()))aliasByTag.set(tag.toLowerCase(),tag);
    const aliases=[...aliasByTag.values()];
    // Never let two distinct school names overwrite one ESPN team ID.
    if(stats[sport][`id:${id}`])throw new Error(`${sport}: duplicate canonical ID ${id}`);
    stats[sport][`id:${id}`]=true;
    registry.teams[sport][id]={name:team.name,primary:chosen,aliases,
      account:previous.account||null,
      verification:sameOfficial?previous.verification:'owner-approved',
      sourceUrls:previous.sourceUrls||[],
      lastVerifiedAt:sameOfficial?previous.lastVerifiedAt||null:null};
    if(previous.primary===chosen)stats[sport].retained++;
    else stats[sport].updated++;
  }
  mappings.push(resolved);
  if(!matchedAny)unmatchedBoth.push(school);
}
if(sourceFlag===-1&&JSON.stringify(source.mappings)!==JSON.stringify(mappings))
  throw new Error('Stored ESPN team ID mappings drifted; re-review before applying');
source.mappings=mappings;
for(const sport of ['CFB','NCAAB']){
  for(const k of Object.keys(stats[sport]))if(k.startsWith('id:'))delete stats[sport][k];
  registry.teams[sport]=Object.fromEntries(Object.entries(registry.teams[sport])
    .sort(([a],[b])=>Number(a)-Number(b)));
}
console.log(JSON.stringify({sourceRows:source.records.length,uniqueSchools:bySchool.size,stats,unmatchedBoth},null,2));
if(!checkOnly){
  if(sourceFlag!==-1)writeFileSync(sourcePath,JSON.stringify(source,null,2)+'\n');
  writeFileSync(registryPath,JSON.stringify(registry,null,2)+'\n');
}

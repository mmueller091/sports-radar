import data from './hashtags.json' with {type:'json'};

export const HASHTAG_SPORTS=Object.freeze({NFL:'#NFL',NBA:'#NBA',NHL:'#NHL',CFB:'#NCAAFB',NCAAB:'#CBB'});
export const DEFAULT_POST_THRESHOLD=85;

const VERIFIED=new Set(['official-bio','official-post','official-site','owner-approved']);
const safeId=value=>/^\d{1,18}$/.test(String(value||''))?String(value):null;
const safeTag=value=>/^#[A-Za-z0-9_]{2,48}$/.test(value||'')?value:null;
const asSport=value=>value==='NCAAM'?'NCAAB':value;

/**
 * Resolve one ESPN team ID. Officially confirmed or explicitly owner-approved
 * tags are eligible for automatic posts. Candidates are excluded.
 */
export function teamHashtag(sport,teamId,{registry=data}={}){
  const entry=registry.teams?.[asSport(sport)]?.[safeId(teamId)];
  if(!entry)return null;
  return {name:entry.name,account:entry.account,primary:VERIFIED.has(entry.verification)?safeTag(entry.primary):null,
    candidate:safeTag(entry.primary),verification:entry.verification,
    sourceUrls:entry.sourceUrls||[],lastVerifiedAt:entry.lastVerifiedAt};
}

function teamDetails(team){
  if(Array.isArray(team))return {name:team[0],id:team[8]};
  if(team && typeof team==='object')return {name:team.name||team.displayName||team.team?.displayName,
    id:team.id||team.teamId||team.team?.id};
  return {name:null,id:null};
}

export function gameHashtags(game,{registry=data,includeLeague=true}={}){
  const sport=asSport(game?.sport);
  if(!Object.hasOwn(HASHTAG_SPORTS,sport))return [];
  const values=(game?.teams||[]).slice(0,2).map(team=>teamDetails(team))
    .map(team=>teamHashtag(sport,team.id,{registry})?.primary).filter(Boolean);
  if(includeLeague)values.push(HASHTAG_SPORTS[sport]);
  return [...new Map(values.map(value=>[value.toLowerCase(),value])).values()];
}

/** Builds text for a human-approved Buffer/X draft. Does not publish anything. */
export function draftExcitementPost(game,{reason='',registry=data}={}){
  const sport=asSport(game?.sport),id=safeId(game?.id),rating=Number(game?.score);
  if(!Object.hasOwn(HASHTAG_SPORTS,sport)||!id||!Number.isInteger(rating)||rating<1||rating>99)
    throw new Error('Invalid game identity or rating');
  if(!Array.isArray(game.teams)||game.teams.length!==2)throw new Error('Expected two teams');
  const sides=game.teams.map(teamDetails);
  if(sides.some(x=>typeof x.name!=='string'||!x.name.trim()))throw new Error('Missing team name');
  const tags=gameHashtags(game,{registry});
  const link=`https://slatemeter.app/#game/${sport}/${id}`;
  const opening=`This one's worth watching. ${sides[0].name} vs. ${sides[1].name} just hit ${rating}/99 on SlateMeter.`;
  // Reason comes from existing game-specific evidence; never synthesize one.
  const cleanReason=String(reason||'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
  const suffix=`${tags.join(' ')}\n${link}`;
  const budget=270-opening.length-suffix.length-4;
  const note=budget>10&&cleanReason?cleanReason.slice(0,budget).trimEnd():'';
  const text=[opening,note,suffix].filter(Boolean).join('\n\n');
  if(text.length>280)throw new Error('Draft exceeds X character limit');
  const unverifiedTeamTags=sides.map(team=>({team:team.name,entry:teamHashtag(sport,team.id,{registry})}))
    .filter(item=>!item.entry?.primary)
    .map(item=>({team:item.team,candidate:item.entry?.candidate||null,
      verification:item.entry?.verification||'not-covered',sourceUrls:item.entry?.sourceUrls||[]}));
  return {text,hashtags:tags,missingTeamHashtags:unverifiedTeamTags.map(x=>x.team),unverifiedTeamTags,
    eligible:rating>=DEFAULT_POST_THRESHOLD,gameUrl:link};
}

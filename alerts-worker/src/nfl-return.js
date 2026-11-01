// Resolve player significance from existing source identities and explicit
// professional honors. No roster lookups, name lists, or inferred reputation.
export function nflReturnSignificance(article,preview,importance) {
  const players=article.players || [];
  if(players.length!==1)return null;
  const player=players[0],roster=new Map([[player.id,player.name]]);
  const story=String(preview?.story || '');
  for(const match of story.matchAll(/<a[^>]*\/player\/_\/id\/(\d+)[^>]*>([^<]+)<\/a>/gi)) roster.set(match[1],match[2]);
  const surnames=new Map();
  for(const [id,name] of roster){const last=name.split(' ').at(-1);surnames.set(last,[...(surnames.get(last) || []),id]);}
  const aliases=[...roster].flatMap(([id,name])=>[{id,name},...(surnames.get(name.split(' ').at(-1))?.length===1?[{id,name:name.split(' ').at(-1)}]:[])]);
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const sources=[{text:`${article.headline}. ${article.description || ''}`,url:article.url,own:true},
    {text:story.replace(/<[^>]*>/g,' '),url:preview?.links?.web?.href,own:false}];
  for(const source of sources)for(const sentence of source.text.split(/[.!?;\n]|\b(?:versus|against|while|whereas|but)\b/i)) {
    if(/\b(?:not|never|could|might|potential|future|candidate|favorite|odds|hopes?|seeks?|aims?|eyes|college)\b|MVP[- ]caliber|All[- ]Pro[- ]caliber/i.test(sentence))continue;
    for(const honor of sentence.matchAll(/\b(?:NFL MVP|league MVP|(?:first[- ]team )?All[- ]Pro|Pro Bowler|Pro Bowl selection)\b/gi)) {
      const preceding=aliases.flatMap(alias=>[...sentence.slice(0,honor.index).matchAll(new RegExp(`\\b${escape(alias.name)}\\b`,'g'))].map(m=>({...alias,index:m.index})));
      const subject=preceding.sort((a,b)=>b.index-a.index)[0];
      if(subject && !/\b(?:is|was|has|won|earned|named|selected|former|reigning|time)\b|^\s*[,–—-]?\s*$/i.test(sentence.slice(subject.index+subject.name.length,honor.index)))continue;
      const ownFollowing=source.own && !subject && new RegExp(`^.{0,40}\\b${escape(player.name)}\\b`).test(sentence.slice(honor.index+honor[0].length));
      if(subject?.id!==player.id && !ownFollowing)continue;
      if(!/^https?:\/\//.test(source.url || ''))continue;
      return {verified:true,playerId:player.id,tier:importance==='starting-quarterback' && /MVP|All[- ]Pro/i.test(honor[0])?'major-quarterback':'established-star',
        fact:sentence.trim().slice(0,240),sourceUrl:source.url};
    }
  }
  return null;
}

/** Parse public discovery pages. This module performs no network requests. */
const unique=items=>[...new Set(items.filter(Boolean))];
const tag=value=>/^#[A-Za-z0-9_]{2,48}$/.test(value||'')?value:null;
const htmlText=value=>String(value||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").replace(/<[^>]*>/g,'').trim();

export function parseBlinkfire(html){
  const found=[];
  for(const row of html.matchAll(/<tr class="bfTable__row">([\s\S]*?)<\/tr>/g)){
    const href=row[1].match(/href="(\/publisher\/team\/([^"/]+)\/[^\"]+)"/);
    const id=href?.[2]?.match(/_(\d+)$/)?.[1];
    if(!id)continue;
    const name=htmlText(row[1].match(/class="league-hashtags__team"[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/)?.[1]);
    const tags=unique([...row[1].matchAll(/class="bfChip__text">([^<]+)</g)]
      .map(match=>tag(htmlText(match[1]))));
    found.push({id,name,tags,teamUrl:new URL(href[1],'https://www.blinkfire.com').href});
  }
  return found;
}

export function verifyFromXHtml(html,handle,candidates){
  // Require an official account match. Generic login/error HTML cannot
  // accidentally approve a third-party suggested tag.
  const title=htmlText(html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/)?.[1]);
  if(!title.toLowerCase().includes(`@${handle}`.toLowerCase()))return null;
  const bio=htmlText(html.match(/<meta[^>]+(?:name="description"|property="og:description")[^>]+content="([^"]*)"/)?.[1]);
  const bioTags=unique([...bio.matchAll(/#[A-Za-z0-9_]+/g)].map(m=>m[0].toLowerCase()));
  const renderedTags=unique([...html.matchAll(/href="\/hashtag\/([^"/?]+)[^\"]*"/g)]
    .map(m=>`#${decodeURIComponent(m[1])}`.toLowerCase()));
  for(const candidate of candidates){
    if(bioTags.includes(candidate.toLowerCase()))return {primary:candidate,verification:'official-bio'};
  }
  for(const candidate of candidates){
    if(renderedTags.includes(candidate.toLowerCase()))return {primary:candidate,verification:'official-post'};
  }
  return null;
}

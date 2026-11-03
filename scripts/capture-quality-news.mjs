import fs from 'node:fs';
const feeds={NFL:'football/nfl',CFB:'football/college-football',NHL:'hockey/nhl',NBA:'basketball/nba',NCAAB:'basketball/mens-college-basketball'};
const results=await Promise.all(Object.entries(feeds).map(async([sport,path])=>{
  const url=`https://site.api.espn.com/apis/site/v2/sports/${path}/news?limit=100`;
  const response=await fetch(url);if(!response.ok)throw Error(`${response.status}: ${url}`);
  return {sport,url,capturedAt:new Date().toISOString(),payload:await response.json()};
}));
fs.writeFileSync('work/final-quality/news.json',JSON.stringify(results,null,2));
for(const r of results) console.log(r.sport,JSON.stringify(r.payload.articles?.map(a=>({headline:a.headline,description:a.description,url:a.links?.web?.href,published:a.published})).slice(0,18)));

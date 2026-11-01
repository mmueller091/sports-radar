// Schedule evidence only: no team/event IDs, external calls or inferred rivalry.
function eventOccasion(game,c) {
 if(game.sport!=='NCAAB')return null;
 const records=(c?.competitors||[]).map(t=>(t.records||t.record||[]).find(r=>r.type==='total')?.summary);
 const seasonOpener=records.length===2&&records.every(r=>r==='0-0')&&Number(game.sourceEvent?.season?.type)===2;
 const address=c?.venue?.address || {},country=String(address.country || address.state || ''),city=String(address.city || '');
 const countries=/^(?:Italy|France|Germany|Spain|United Kingdom|Ireland|Australia|Japan|Mexico|Bahamas|Greece)$/i;
 const name=(c?.notes||[]).find(n=>n.type==='event')?.headline;
 const international=c?.neutralSite===true&&Boolean(city)&&countries.test(country)&&Boolean(name);
 return seasonOpener||international?{seasonOpener,international,city,name:international?name:''}:null;
}
function factorsFor(game,c) {
 const occasion=eventOccasion(game,c);if(!occasion)return [];
 game.eventOccasion=occasion;
 return [
  ...(occasion.seasonOpener?[{label:'Season opener',contextType:'season_opener',contextText:'Both teams are opening their seasons',points:3}]:[]),
  ...(occasion.international?[{label:'International showcase',contextType:'international_showcase',contextText:`The ${occasion.name} takes place in ${occasion.city}`,points:4}]:[])
 ];
}
module.exports={eventOccasion,factorsFor};

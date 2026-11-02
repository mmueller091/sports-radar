import {mkdirSync,writeFileSync} from 'node:fs';
const dir='alerts-worker/test/fixtures/tennis-grand-slams';
mkdirSync(dir,{recursive:true});
const dates=['20240128','20240609','20240714','20240908','20250126','20250608','20250713','20250907'];
const evidence=[];
for(const datesValue of dates){
  for(const tour of ['atp','wta']){
    const url=`https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/scoreboard?dates=${datesValue}`;
    const response=await fetch(url);
    if(!response.ok)throw new Error(`${url}: ${response.status}`);
    const payload=await response.json();
    const events=payload.events || [];
    evidence.push({url,capturedAt:new Date().toISOString(),events:events.map(e=>({id:e.id,name:e.name,major:e.major,date:e.date,endDate:e.endDate,season:e.season,
      groups:e.groupings?.map(g=>({grouping:g.grouping,count:g.competitions?.length,rounds:[...new Map(g.competitions?.map(c=>[c.round?.id,c.round])).values()]}))}))});
    const selected=events.filter(e=>e.major===true).map(e=>({...e,groupings:e.groupings?.map(g=>({...g,competitions:[
      g.competitions?.find(c=>c.round?.displayName?.startsWith('Qualifying')),
      g.competitions?.find(c=>/^[1-7]$/.test(String(c.round?.id)))
    ].filter(Boolean)}))}));
    writeFileSync(`${dir}/${tour}-${datesValue}.json`,JSON.stringify({source:url,capturedAt:new Date().toISOString(),leagues:payload.leagues,events:selected},null,2)+'\n');
    console.log(tour,datesValue,selected.map(e=>`${e.id} ${e.name}`).join(', '));
  }
}
mkdirSync('audit/tennis-grand-slams-20261102',{recursive:true});
writeFileSync('audit/tennis-grand-slams-20261102/espn-identity-evidence.json',JSON.stringify(evidence,null,2)+'\n');
for(const path of ['feed','health']){
  const response=await fetch(`https://sports-radar-alerts.mmueller918.workers.dev/${path}`);
  const body=await response.text();writeFileSync(`work/baseline-${path}.json`,body);
  if(path==='feed')console.log('production tennis',JSON.parse(body).games?.filter(g=>g.sport==='Tennis').length);
}

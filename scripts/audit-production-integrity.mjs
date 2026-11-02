import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
const dir='test/fixtures/production-integrity';
for(const file of fs.readdirSync(dir).filter(name=>/^(NFL|CFB|NBA|NCAAB|NHL)-\d+\.json\.gz$/.test(name))){
 const f=JSON.parse(gunzipSync(fs.readFileSync(`${dir}/${file}`)));
 const points=f.detail.sportsRadarHistory.snapshots;let regressions=0;
 const swings=points.flatMap((p,i)=>{const prev=points[i-1];if(!prev)return[];
  const lower=Number(p.scoreA)<Number(prev.scoreA)||Number(p.scoreB)<Number(prev.scoreB);if(lower)regressions++;
  const selected=(p.state==='completed'&&prev.state==='live')||Math.abs(p.rating-prev.rating)>=20||f.game.id==='401873033'&&p.clock==='8:55';
  return selected?[{at:new Date(p.observedAt).toISOString(),rating:`${prev.rating}->${p.rating}`,score:`${prev.scoreA}-${prev.scoreB}->${p.scoreA}-${p.scoreB}`,clock:`${prev.period} ${prev.clock}->${p.period} ${p.clock}`,state:p.state,model:p.modelVersion,lower}]:[];
 });
 console.log(JSON.stringify({file,points:points.length,regressions,swings:swings.slice(-32),lastPlays:f.summary.scoringPlays?.slice(-4).map(p=>({id:p.id,score:[p.awayScore,p.homeScore],clock:p.clock?.displayValue,period:p.period?.number,text:p.text})),article:f.summary.article?.headline,articles:f.summary.news?.articles?.map(a=>({headline:a.headline,story:a.story}))},null,2));
}

// Local replay only. The frozen baseline includes the original adapter.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),z=require('node:zlib');
const core=require('../rating-core.js');
const {cases,evaluate}=require('../test/helpers/nhl-calibration.cjs');
const root=path.resolve(__dirname,'..');
const frozen=z.gunzipSync(fs.readFileSync(path.join(root,'test/fixtures/scoring-before-nhl-cap.js.gz'))).toString();
async function main(){
  const display=await import('../alerts-worker/src/display-model.js');
  const adapter=await import('../alerts-worker/src/game-model.js');
  const before=vm.runInNewContext(`${frozen}\n({core:SportsRadarScore,normalizeEvent,enrichGame})`,display);
  const lines=['# NHL before/after calibration','','Baseline: repository commit `848f720f15db76d931ac560854a7c91de5e4dade`, frozen before this change with its original adapter. Synthetic scores include live snapshot and history. Provider results use full normalization and enrichment, without editorial context overrides. **FLAG** marks every absolute change of 10 or more.','','## Synthetic scenarios',''];
  function table(headers,rows){lines.push(`| ${headers.join(' | ')} |`,`| ${headers.map(()=> '---').join(' | ')} |`,...rows.map(row=>`| ${row.join(' | ')} |`),'');}
  const delta=(a,b)=>[a,b,b-a,Math.abs(b-a)>=10?'**FLAG**':''];
  table(['Scenario','Old','New','Difference','10+'],Object.entries(cases).map(([name,input])=>[name,...delta(evaluate(before.core,input).score,evaluate(core,input).score)]));
  lines.push('## Every NHL provider fixture','');
  const results=[];
  for(const file of fs.readdirSync(path.join(root,'test/fixtures/real-games')).filter(f=>f.endsWith('.json')).sort()){
    const input=JSON.parse(fs.readFileSync(path.join(root,'test/fixtures/real-games',file)));
    if(input.modelSport!=='NHL') continue;
    const score=api=>{const game=api.normalizeEvent(structuredClone(input.event),'NHL');api.enrichGame(game,structuredClone(input.summary));return game;};
    const old=score(before),next=score(adapter);
    results.push({eventId:input.eventId,matchup:next.teams.map(t=>t[0]).join(' vs '),final:next.teams.map(t=>t[2]).join('-'),old:old.score,new:next.score,difference:next.score-old.score,oldFactors:old.factors,factors:next.factors});
  }
  table(['Event ID','Matchup','Final','Old','New','Difference','10+'],results.map(r=>[r.eventId,r.matchup,r.final,...delta(r.old,r.new)]));
  lines.push(`${results.length} provider fixtures; ${results.filter(r=>Math.abs(r.difference)>=10).length} movements of 10+ points.`,'');
  fs.writeFileSync(path.join(root,'calibration/nhl-calibration.md'),lines.join('\n'));
  fs.writeFileSync(path.join(root,'calibration/nhl-calibration.json'),JSON.stringify({synthetic:Object.fromEntries(Object.entries(cases).map(([name,input])=>[name,{old:evaluate(before.core,input),new:evaluate(core,input)}])),fixtures:results},null,2)+'\n');
  console.log(lines.join('\n'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

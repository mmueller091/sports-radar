// Immediate pre-upset baseline, distinct from the earlier completed-model pass.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const core=require('../rating-core.js'),c=require('../test/helpers/cfb-completed.cjs'),u=require('../test/helpers/cfb-upset.cjs');
const live=require('../test/helpers/cfb-calibration.cjs'),nfl=require('../test/helpers/nfl-calibration.cjs');
const source=require('../test/helpers/scoring-source.cjs').scoringSource();
const plain=x=>JSON.parse(JSON.stringify(x));
const lines=['# Narrow completed CFB upset calibration — 2026-10-27','','All before values use the immediate pre-upset-pass frozen engine, not the earlier completed redesign baseline. Stored captures only; no live provider verification or deployment.',''];
function table(headers,rows){lines.push(`| ${headers.join(' | ')} |`,`| ${headers.map(()=>'---').join(' | ')} |`,...rows.map(r=>`| ${r.join(' | ')} |`),'');}
async function main(){
 const adapter=await import('../alerts-worker/src/game-model.js'),display=await import('../alerts-worker/src/display-model.js');
 const old=c.providers(c.adapter(u.source,display)),now=c.providers(adapter);
 lines.push('## Synthetic A–S','');
 table(['Case','Before','After','Upset points','Base','History','Path/OT adjustment'],Object.entries(u.cases).map(([k,v])=>{const a=c.evaluate(core,v);return[k,c.evaluate(u.before,v).score,a.score,a.upset,a.base,a.history,a.adjustment];}));
 lines.push('## Equal-path spread and ranking grids','');
 table(['Spread','Close before','Close after','28-point wire-to-wire before','28-point wire-to-wire after'],[7,14,21,28,30].map(spread=>[spread,...[u.before,core].map(x=>c.evaluate(x,{...u.cases.A,spread}).score),...[u.before,core].map(x=>c.evaluate(x,{...u.wide,spread}).score)]));
 table(['Favorite rank','+14 close before','+14 close after','+28 close after','+28 blowout after'],[null,20,10,5,2,1].map(rank=>[rank||'Unranked',...[u.before,core].map(x=>c.evaluate(x,{...u.cases.B,ranks:[rank,null]}).score),c.evaluate(core,{...u.cases.D,ranks:[rank,null]}).score,c.evaluate(core,{...u.wide,spread:28,ranks:[rank,null]}).score]));
 // Expose the existing private path reader in this report's VM only.
 const audit=vm.runInNewContext(`${source.replace('const api = {cfbPregame,','const api = {cfbCompletedPath,cfbPregame,')}\nSportsRadarScoring.sports_cfb.cfbCompletedPath`);
 const ids=['401856719','401856724','401856809','401862803','401856723'];
 lines.push('## Requested stored results','');
 const details=[];
 for(const id of ids){
  const file=Object.keys(now).find(f=>f.includes(id)),g=now[file],prior=old[file];
  const f=JSON.parse(fs.readFileSync(`test/fixtures/real-games/${file}`)),competition=f.event.competitions[0];
  const history=core.momentumImpact('CFB',f.summary,1,'completed'),path=audit(f.summary,competition);
  details.push({matchup:f.event.name,before:prior.score,after:g.score,underdog:g.underdog,ranks:competition.competitors.map(t=>[t.team.displayName,core.rankFor(t,'CFB')]),final:g.teams.map(t=>t[2]),path,history,upsetBefore:prior.upsetPoints,upsetAfter:g.upsetPoints,factors:g.factors});
 }
 table(['Matchup','Before','After','Spread','Ranks (provider order)','Final','Path valid','Competitive share','Last competitive position','History','Upset before → after'],details.map(d=>[d.matchup,d.before,d.after,d.underdog?.value,d.ranks.map(r=>`${r[0]}: ${r[1]||'UR'}`).join('; '),d.final.join('–'),d.path.valid,d.path.competitiveShare.toFixed(3),d.path.lastCompetitivePosition.toFixed(3),d.history.points,`${d.upsetBefore} → ${d.upsetAfter}`]));
 lines.push('## Exact unchanged regression outputs','');
 for(const [title,helper] of [['CFB live A–Y',live],['NFL A–P',nfl]]){
  lines.push(`### ${title}`,'');
  table(['Case','Before','After','All components equal'],Object.entries(helper.cases).map(([k,v])=>{const a=helper.evaluate(u.before,v),b=helper.evaluate(core,v);assert.deepEqual(plain(a),plain(b));return[k,a.score,b.score,'YES'];}));
 }
 table(['Completed case','Before','After','All components equal'],['C','D','E','R','V','F','G','H','I','J','T','U'].map(k=>{const a=c.evaluate(u.before,c.cases[k]),b=c.evaluate(core,c.cases[k]);assert.deepEqual(plain(a),plain(b));return[k,a.score,b.score,'YES'];}));
 const changed=[];let protectedCount=0;
 for(const [file,g] of Object.entries(now)){
  if(g.sport!=='CFB'||g.state!=='completed'){assert.deepEqual(plain(g),plain(old[file]));protectedCount++;}
  if(g.score!==old[file].score)changed.push([file,old[file].score,g.score]);
 }
 lines.push(`Provider replay: ${Object.keys(now).length} fixtures; ${protectedCount} non-CFB/non-completed outputs exactly equal. ${changed.length} scores changed.`,'');
 table(['Changed fixture','Before','After'],changed);
 fs.writeFileSync('calibration/cfb-completed-upset-calibration.md',lines.join('\n'));
 fs.mkdirSync('work/cfb-upset',{recursive:true});fs.writeFileSync('work/cfb-upset/real-details.json',JSON.stringify(details,null,2));
 console.log(JSON.stringify(details,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/index.js';
import {normalizeEvent} from '../src/game-model.js';
import {basketballBoxScore} from '../src/display-model.js';
import {createCollector,summaryUrl} from '../src/providers/espn.js';

const fixture=sport=>JSON.parse(fs.readFileSync(new URL(`./fixtures/provider-contract/${sport}.json`,import.meta.url)));
const groups=sport=>fixture(sport).summary.boxscore.players.flatMap(t=>t.statistics);
function database(t) {
  const db=new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  t.after(()=>db.close());
  return {db,DB:{prepare(sql) {
    let args=[];
    return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},
      async all(){return {results:db.prepare(sql).all(...args)};},
      async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};
  }}};
}

test('real MLB player groups use type, with aligned batting/pitching columns and decisions',()=>{
  const all=groups('MLB');
  const batting=all.find(g=>g.type==='batting'),pitching=all.find(g=>g.type==='pitching');
  assert.equal(batting.name,undefined);
  assert.deepEqual(batting.labels,['H-AB','AB','R','H','RBI','HR','BB','K','#P','AVG','OBP','SLG']);
  assert.deepEqual(pitching.labels,['IP','H','R','ER','BB','K','HR','PC-ST','ERA','PC']);
  for(const g of all)for(const a of g.athletes)assert.equal(a.stats.length,g.labels.length);
  assert.ok(all.flatMap(g=>g.athletes).some(a=>a.notes?.some(n=>n.type==='pitchingDecision')));
  assert.deepEqual(fixture('MLB').summary.boxscore.teams[0].statistics.map(g=>g.name),['batting','pitching','fielding','records']);
});

for(const sport of ['NFL','CFB'])test(`${sport} real non-offensive groups survive as distinct provider groups`,()=>{
  const all=groups(sport);
  assert.deepEqual(all.slice(0,10).map(g=>g.name),['passing','rushing','receiving','fumbles','defensive','interceptions','kickReturns','puntReturns','kicking','punting']);
  assert.ok(all.find(g=>g.name==='defensive').keys.includes(sport==='NFL'?'QBHits':'hurries'));
  assert.ok(fixture(sport).summary.drives.previous[0].plays[0].end.down!==undefined);
});

test('NHL goalie columns and scoring/penalty metadata are available',()=>{
  const g=groups('NHL').find(g=>g.name==='goalies');
  assert.deepEqual(g.labels,['GA','SA','SOS','SOSA','SV','SV%','ESSV','PPSV','SHSV','TOI','YTDG','PIM']);
  assert.equal(g.keys[g.labels.indexOf('SV%')],'savePct');
  assert.ok(fixture('NHL').summary.plays.some(p=>p.type.penaltyMinutes));
  assert.ok(fixture('NHL').summary.plays.some(p=>p.scoringPlay&&p.strength));
});

for(const sport of ['NBA','NCAAB'])test(`${sport} real columns map by label and raw extras remain outside normalized stats`,()=>{
  const summary=fixture(sport).summary, normalized=basketballBoxScore(summary,sport);
  const g=summary.boxscore.players[0].statistics[0],row=g.athletes[0],player=normalized.teams[0].players[0];
  for(const [field,label]of Object.entries({minutes:'MIN',points:'PTS',rebounds:'REB',fg:'FG',threePt:'3PT',ft:'FT',assists:'AST',steals:'STL',blocks:'BLK',turnovers:'TO',fouls:'PF'}))assert.equal(player.stats[field],row.stats[g.labels.indexOf(label)]);
  assert.ok(g.labels.includes('OREB')&&g.labels.includes('DREB'));
  assert.equal(player.stats.offensiveRebounds,undefined);
  assert.ok(normalized.teams.flatMap(t=>t.players).some(p=>p.didNotPlay));
  assert.ok(normalized.teams[0].totals);
  if(sport==='NCAAB'){
    assert.equal(summary.format.regulation.displayName,'Half');
    assert.equal(summary.format.regulation.periods,2);
    assert.deepEqual(normalized.teams[0].periods.map(p=>p.label),['1','2']);
  }else assert.ok(g.labels.includes('+/-'));
});

for(const sport of ['NFL','CFB','MLB','NHL','NBA','NCAAB'])test(`${sport} /game serializes every captured raw field unchanged without upstream fetch`,async t=>{
  const env=database(t),summary=fixture(sport).summary,now=Date.now();
  const game=normalizeEvent({id:summary.header.id,date:summary.header.competitions[0].date,competitions:summary.header.competitions},sport);
  assert.ok(game);
  env.db.prepare('INSERT INTO sports_feed (id,payload) VALUES (1,?)').run(JSON.stringify({games:[game],updatedAt:new Date(now).toISOString()}));
  env.db.prepare('INSERT INTO sports_resources (key,payload,updated_at) VALUES (?,?,?)').run(summaryUrl(game),JSON.stringify(summary),now);
  const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('Offline contract test must not fetch');};t.after(()=>{globalThis.fetch=original;});
  const response=await worker.fetch(new Request(`https://contract.test/game/${sport}/${game.id}`),env,{});
  assert.equal(response.status,200);
  const returned=await response.json();
  for(const [key,value]of Object.entries(summary))assert.deepEqual(returned[key],value,key);
  assert.ok(returned.sportsRadarFreshness);
});

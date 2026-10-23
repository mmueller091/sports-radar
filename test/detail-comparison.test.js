import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const start = source.indexOf('const TEAM_STAT_CONFIG =');
const end = source.indexOf('function detailLeaders(',start);
const context = vm.createContext({safeText:value => String(value).replaceAll('<','&lt;').replaceAll('"','&quot;')});
vm.runInContext(source.slice(start,end),context);

function summary(sport,names,periods=4) {
  const competitors = ['left','right'].map((id,index) => ({
    team:{id,abbreviation:index ? 'RGT' : 'LFT',color:index ? 'f3bd32' : '368cf5'},
    score:String(index + periods),
    hits:sport === 'MLB' ? String(7 + index) : undefined,
    errors:sport === 'MLB' ? String(index) : undefined,
    linescores:Array.from({length:periods},(_,period) => ({displayValue:String((index + period) % 3)}))
  }));
  const statistics = (id,index) => names.map((name,statIndex) => ({
    name,
    label:name,
    displayValue:String(index + statIndex + 1),
    value:index + statIndex + 1
  }));
  const teams = [...competitors].reverse().map((competitor,index) => ({
    team:competitor.team,
    statistics:sport === 'MLB'
      ? [{name:'batting',stats:statistics(competitor.team.id,index)},{name:'fielding',stats:[{name:'errors',label:'Errors',displayValue:String(index),value:index}]}]
      : statistics(competitor.team.id,index)
  }));
  return {header:{competitions:[{competitors,status:{type:{detail:'Final'}}}]},boxscore:{teams}};
}

const cases = {
  NBA:['fieldGoalsMade-fieldGoalsAttempted','fieldGoalPct','totalRebounds','defensiveRebounds'],
  NFL:['totalYards','netPassingYards','rushingYards','firstDowns','totalOffensivePlays'],
  CFB:['totalYards','netPassingYards','rushingYards','firstDowns','totalOffensivePlays'],
  MLB:['runs','hits','runnersLeftOnBase','walks','strikeouts','homeRuns','totalBases','doubles'],
  NHL:['shotsTotal','faceoffPercent','hits','blockedShots','takeaways','giveaways','penalties'],
  Soccer:['possessionPct','totalShots','shotsOnTarget','cornerKicks','foulsCommitted','accuratePassesPercentage','expectedGoals','throwIns'],
  Tennis:['aces','doubleFaults','firstServePercentage','firstServePointsWon','secondServePointsWon','breakPointsWon','winners','unforcedErrors','serviceGamesWon']
};

for (const [sport,names] of Object.entries(cases)) {
  test(`${sport} scoring and team comparisons render supplied values`,() => {
    const periods = sport === 'MLB' ? 9 : sport === 'Soccer' || sport === 'Tennis' ? 2 : sport === 'NHL' ? 3 : 4;
    const payload = summary(sport,names,periods);
    const scoring = context.detailScoring(payload,sport);
    const stats = context.detailStats(payload,sport);
    assert.match(scoring,/Scoring/);
    assert.match(scoring,/detail-table-scroll/);
    assert.match(stats,/Team Stats/);
    assert.match(stats,/detail-comparison-bars/);
    assert.match(stats,/More Stats/);
  });
}

test('sport-specific scoring labels include periods, sets, and baseball totals',() => {
  assert.match(context.detailScoring(summary('NBA',cases.NBA,5),'NBA'),/Q4.*OT.*Total/s);
  assert.match(context.detailScoring(summary('NCAAB',cases.NBA,4),'NCAAB'),/Q1.*Q4.*Total/s);
  assert.match(context.detailScoring(summary('NFL',cases.NFL,5),'NFL'),/Q4.*OT.*Total/s);
  assert.match(context.detailScoring(summary('MLB',cases.MLB,10),'MLB'),/>10<.*>R<.*>H<.*>E</s);
  assert.match(context.detailScoring(summary('NHL',cases.NHL,4),'NHL'),/P3.*OT.*Total/s);
  assert.match(context.detailScoring(summary('Soccer',cases.Soccer,3),'Soccer'),/1H.*2H.*ET.*Total/s);
  assert.match(context.detailScoring(summary('Tennis',cases.Tennis,3),'Tennis'),/S1.*S2.*S3/s);
});

test('missing scoring and team statistics are omitted gracefully',() => {
  assert.equal(context.detailScoring({},'NBA'),'');
  assert.equal(context.detailStats({},'NBA'),'');
  const payload = summary('NBA',[],1);
  assert.match(context.detailScoring(payload,'NBA'),/Q1/);
  assert.equal(context.detailStats(payload,'NBA'),'');
});

test('detail rendering keeps the existing timeline and player-stat sections',() => {
  assert.match(source,/\$\{excitementTimeline\(game,summary\)\}\$\{detailScoring/);
  assert.match(source,/\$\{basketballBoxScoreMarkup\(summary,game\.sport\)\}\$\{detailPlayerStats\(summary,game\.sport\)\}/);
  assert.doesNotMatch(source,/https?:\/\/[^'"\s]*espn[^'"\s]*\/(?:scoreboard|summary)/i);
});

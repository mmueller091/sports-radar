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
  assert.match(context.detailScoring(summary('NCAAB',cases.NBA,2),'NCAAB'),/1H.*2H.*Total/s);
  assert.match(context.detailScoring(summary('NCAAB',cases.NBA,3),'NCAAB'),/1H.*2H.*OT.*Total/s);
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

test('Game Center shell keeps excitement first-class and moves detail into sport-aware tabs',() => {
  assert.match(source,/const DETAIL_TAB_CONFIG =/);
  assert.match(source,/NFL:\[\['overview','Overview'\],\['drives','Drives'\],\['team-stats','Team Stats'\],\['players','Players'\],\['plays','Plays'\]\]/);
  assert.match(source,/NHL:\[\['overview','Overview'\],\['team-stats','Team Stats'\],\['players','Skaters'\],\['plays','Plays'\]\]/);
  assert.match(source,/NBA:\[\['overview','Overview'\],\['box-score','Box Score'\],\['team-stats','Team Stats'\],\['plays','Plays'\]\]/);

  const detailStart = source.indexOf('function renderDetailContent(');
  const detailEnd = source.indexOf('async function fetchGameSummary(',detailStart);
  const detailSource = source.slice(detailStart,detailEnd);

  assert.match(detailSource,/detail-excitement-score/);
  assert.match(detailSource,/\$\{excitementTimeline\(game,summary\)\}/);
  assert.match(detailSource,/\$\{detailTabsMarkup\(game,summary\)\}/);
  assert.ok(
    detailSource.indexOf('${excitementTimeline(game,summary)}') <
    detailSource.indexOf('${detailTabsMarkup(game,summary)}')
  );
  assert.doesNotMatch(source,/https?:\/\/[^'"\s]*espn[^'"\s]*\/(?:scoreboard|summary)/i);
});

test('Game Center selected tab is preserved across live-detail rerenders and resets for a new game',() => {
  assert.match(source,/let activeDetailTab = 'overview'/);
  assert.match(source,/function setActiveDetailTab\(/);
  assert.match(source,/function moveDetailTabFocus\(/);
  assert.match(source,/activeDetailTab = 'overview';\n  detailFinalPending = false;/);
  assert.match(source,/renderDetailContent\(game,summary\);/);
});

test('football Players tab includes defense and special teams from the existing summary payload',() => {
  assert.match(source,/const FOOTBALL_PLAYER_GROUPS = new Set/);
  for (const group of ['fumbles','defensive','interceptions','kickreturns','puntreturns','kicking','punting']) {
    assert.match(source,new RegExp(`['"]${group}['"]`));
  }
  assert.doesNotMatch(source,/\/pass\|rush\|receiv\/i\.test/);
});

test('Game Center refinement uses sport-correct basketball period labels and reduced timeline markers',() => {
  assert.match(source,/function basketballPeriodLabel\(sport,index\)/);
  assert.match(source,/sport === 'NCAAB'/);
  assert.match(source,/Math\.abs\(delta\) >= 5/);
  assert.match(source,/enteredOvertime/);
  assert.match(source,/detail-why-toggle/);
  assert.match(source,/textContent =\s*'Game Center'/);
});

test('player stat tables keep every column scrollable with an accessible pinned-name wrapper',() => {
  assert.match(source,/detail-table-scroll detail-player-scroll/);
  assert.match(source,/tabindex="0"/);
  assert.match(source,/role="region"/);
  assert.match(source,/horizontally scroll for more columns/);
});

test('NFL and CFB Drives tab renders current and previous drives from the existing summary payload',() => {
  const payload = {
    drives:{
      current:{
        id:'drive-2',
        team:{abbreviation:'BAL'},
        result:'Touchdown',
        offensivePlays:8,
        yards:75,
        timeElapsed:{displayValue:'4:12'},
        start:{text:'BAL 25'},
        end:{text:'BUF 0'},
        plays:[
          {
            period:{number:4},
            clock:{displayValue:'1:02'},
            start:{shortDownDistanceText:'3rd & 4'},
            text:'Touchdown pass',
            scoringPlay:true
          }
        ]
      },
      previous:[
        {
          id:'drive-1',
          team:{abbreviation:'BUF'},
          result:'Punt',
          offensivePlays:3,
          yards:4,
          timeElapsed:{displayValue:'1:11'},
          plays:[
            {
              period:{number:1},
              clock:{displayValue:'13:45'},
              text:'Run for 2 yards'
            }
          ]
        }
      ]
    }
  };

  const nfl = context.detailDrives(payload,'NFL');
  assert.match(nfl,/Drives/);
  assert.match(nfl,/Latest first/);
  assert.match(nfl,/Current drive/);
  assert.match(nfl,/BAL/);
  assert.match(nfl,/Touchdown/);
  assert.match(nfl,/Q4 1:02/);
  assert.match(nfl,/3rd &amp; 4|3rd & 4/);
  assert.match(nfl,/Touchdown pass/);
  assert.match(nfl,/BUF/);
  assert.match(nfl,/Punt/);
  assert.match(nfl,/Run for 2 yards/);

  assert.match(context.detailDrives(payload,'CFB'),/Drives/);
  assert.equal(context.detailDrives(payload,'NBA'),'');
  assert.equal(context.detailDrives({},'NFL'),'');
});

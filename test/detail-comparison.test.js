import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const start = source.indexOf('function basketballPeriodLabel(');
const end = source.indexOf('function readRatingHistory(',start);
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
  assert.match(source,/NHL:\[\['overview','Overview'\],\['team-stats','Team Stats'\],\['players','Skaters'\],\['goalies','Goalies'\],\['plays','Plays'\]\]/);
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

test('MLB Game Center renders separate Batting and Pitching tabs from existing summary player groups',() => {
  const payload = {
    boxscore:{
      players:[
        {
          team:{displayName:'Baltimore Orioles'},
          statistics:[
            {
              type:'batting',
              displayName:'Batting',
              labels:['H-AB','AB','R','H','RBI','HR','BB','K','#P','AVG','OBP','SLG'],
              athletes:[
                {
                  athlete:{displayName:'Gunnar Henderson'},
                  stats:['2-4','4','1','2','2','1','1','1','18','.285','.362','.512']
                }
              ]
            },
            {
              type:'pitching',
              displayName:'Pitching',
              labels:['IP','H','R','ER','BB','K','HR','PC-ST','ERA','PC'],
              athletes:[
                {
                  athlete:{displayName:'Corbin Burnes'},
                  stats:['7.0','5','1','1','1','8','0','101-67','2.88','101'],
                  notes:[{type:'pitchingDecision',text:'W (12-5)'}]
                }
              ]
            }
          ]
        },
        {
          team:{displayName:'New York Yankees'},
          statistics:[
            {
              type:'batting',
              displayName:'Batting',
              labels:['H-AB','AB','R','H','RBI','HR','BB','K','#P','AVG','OBP','SLG'],
              athletes:[
                {
                  athlete:{displayName:'Aaron Judge'},
                  stats:['1-4','4','0','1','0','0','0','2','16','.310','.425','.640']
                }
              ]
            },
            {
              type:'pitching',
              displayName:'Pitching',
              labels:['IP','H','R','ER','BB','K','HR','PC-ST','ERA','PC'],
              athletes:[
                {
                  athlete:{displayName:'Gerrit Cole'},
                  stats:['6.0','7','3','3','2','6','1','96-62','3.41','96'],
                  notes:[{type:'pitchingDecision',text:'L (8-4)'}]
                }
              ]
            }
          ]
        }
      ]
    }
  };

  const batting = context.detailMlbPlayerStats(payload,'batting');
  const pitching = context.detailMlbPlayerStats(payload,'pitching');

  assert.match(source,/MLB:\[\['overview','Overview'\],\['batting','Batting'\],\['pitching','Pitching'\],\['team-stats','Team Stats'\],\['plays','Plays'\]\]/);

  assert.match(batting,/Batting/);
  assert.match(batting,/Baltimore Orioles/);
  assert.match(batting,/New York Yankees/);
  assert.match(batting,/Gunnar Henderson/);
  assert.match(batting,/Aaron Judge/);
  assert.match(batting,/H-AB/);
  assert.match(batting,/OBP/);
  assert.match(batting,/SLG/);
  assert.doesNotMatch(batting,/Corbin Burnes/);

  assert.match(pitching,/Pitching/);
  assert.match(pitching,/Corbin Burnes/);
  assert.match(pitching,/Gerrit Cole/);
  assert.match(pitching,/PC-ST/);
  assert.match(pitching,/ERA/);
  assert.match(pitching,/Decision/);
  assert.match(pitching,/W \(12-5\)/);
  assert.match(pitching,/L \(8-4\)/);
  assert.doesNotMatch(pitching,/Gunnar Henderson/);

  assert.equal(context.detailMlbPlayerStats(payload,'fielding'),'');
  assert.equal(context.detailMlbPlayerStats({},'batting'),'');
});

test('NHL Game Center separates Skaters and Goalies from the existing summary payload',() => {
  const payload = {
    boxscore:{
      players:[
        {
          team:{displayName:'Washington Capitals'},
          statistics:[
            {
              type:'skaters',
              name:'skaters',
              displayName:'Skaters',
              labels:['S','G','A','+/-','PIM'],
              athletes:[
                {
                  athlete:{displayName:'Alex Ovechkin'},
                  stats:['5','1','0','1','2']
                }
              ]
            },
            {
              type:'goalies',
              name:'goalies',
              displayName:'Goalies',
              labels:['GA','SA','SOS','SOSA','SV','SV%','ESSV','PPSV','SHSV','TOI','YTDG','PIM'],
              athletes:[
                {
                  athlete:{displayName:'Logan Thompson'},
                  stats:['2','31','0','0','29','.935','24','4','1','60:00','12','0']
                }
              ]
            }
          ]
        },
        {
          team:{displayName:'Pittsburgh Penguins'},
          statistics:[
            {
              type:'skaters',
              name:'skaters',
              displayName:'Skaters',
              labels:['S','G','A','+/-','PIM'],
              athletes:[
                {
                  athlete:{displayName:'Sidney Crosby'},
                  stats:['4','1','1','0','0']
                }
              ]
            },
            {
              type:'goalies',
              name:'goalies',
              displayName:'Goalies',
              labels:['GA','SA','SOS','SOSA','SV','SV%','ESSV','PPSV','SHSV','TOI','YTDG','PIM'],
              athletes:[
                {
                  athlete:{displayName:'Tristan Jarry'},
                  stats:['3','28','0','0','25','.893','20','5','0','58:41','8','0']
                }
              ]
            }
          ]
        }
      ]
    }
  };

  const skaters = context.detailPlayerStats(payload,'NHL');
  const goalies = context.detailNhlGoalies(payload);

  assert.match(source,/NHL:\[\['overview','Overview'\],\['team-stats','Team Stats'\],\['players','Skaters'\],\['goalies','Goalies'\],\['plays','Plays'\]\]/);

  assert.match(skaters,/Skaters/);
  assert.match(skaters,/Alex Ovechkin/);
  assert.match(skaters,/Sidney Crosby/);
  assert.doesNotMatch(skaters,/Logan Thompson/);
  assert.doesNotMatch(skaters,/Tristan Jarry/);

  assert.match(goalies,/Goalies/);
  assert.match(goalies,/Washington Capitals/);
  assert.match(goalies,/Pittsburgh Penguins/);
  assert.match(goalies,/Logan Thompson/);
  assert.match(goalies,/Tristan Jarry/);
  assert.match(goalies,/SV%/);
  assert.match(goalies,/TOI/);
  assert.match(goalies,/YTDG/);
  assert.doesNotMatch(goalies,/Alex Ovechkin/);

  assert.equal(context.detailNhlGoalies({}),'');
});

test('Team Stats uses one shared proportional comparison bar',() => {
  const row = context.detailStatRow(
    'Shots',
    {displayValue:'23',value:23},
    {displayValue:'33',value:33},
    ['#f15a24','#0055aa']
  );

  assert.match(row,/detail-comparison-bars/);
  assert.match(row,/aria-label="Shots: 23 versus 33"/);
  assert.match(row,/detail-comparison-left/);
  assert.match(row,/detail-comparison-right/);
  assert.match(row,/width:41\.071%/);
  assert.match(row,/width:58\.929%/);
  assert.match(row,/<span><i class="detail-comparison-left"[^>]*><\/i><i class="detail-comparison-right"/);
  assert.doesNotMatch(row,/<\/span><span><i/);
});

test('Team Stats chooses more distinguishable team colors when primaries are too close',() => {
  const close = [
    {team:{color:'003b5c',alternateColor:'a2aaad'}},
    {team:{color:'041e42',alternateColor:'869397'}}
  ];

  const selected = context.detailTeamComparisonColors(close);

  assert.equal(selected.length,2);
  assert.ok(context.detailColorSeparation(selected[0],selected[1]) >= .105);
  assert.notDeepEqual(
    [...selected],
    ['#003b5c','#041e42']
  );
});

test('Team Stats treats adjacent red and orange primaries as too similar',() => {
  const adjacent = [
    {team:{color:'c8102e',alternateColor:'041e42'}},
    {team:{color:'ff4c00',alternateColor:'fcba03'}}
  ];

  const selected =
    [...context.detailTeamComparisonColors(adjacent)];

  assert.notDeepEqual(
    selected,
    ['#c8102e','#ff4c00']
  );

  assert.equal(
    context.detailColorsTooClose(
      selected[0],
      selected[1]
    ),
    false
  );
});

test('Team Stats keeps primary team colors when color families are clearly distinct',() => {
  const distinct = [
    {team:{color:'c8102e',alternateColor:'041e42'}},
    {team:{color:'0057b8',alternateColor:'fdb927'}}
  ];

  assert.deepEqual(
    [...context.detailTeamComparisonColors(distinct)],
    ['#c8102e','#0057b8']
  );
});

test('NBA and NCAAB Box Score expands raw provider stats and groups players by role',() => {
  const payload = {
    basketballBoxScore:{
      teams:[
        {
          teamId:'1',
          abbreviation:'BOS',
          displayName:'Boston Celtics',
          periods:[
            {value:'28'},
            {value:'31'},
            {value:'26'},
            {value:'30'},
            {value:'8'}
          ],
          players:[
            {
              id:'10',
              name:'Jayson Tatum',
              starter:true,
              didNotPlay:false,
              dnpReason:'',
              stats:{
                minutes:'41',
                fg:'11-23',
                threePt:'4-10',
                ft:'7-8',
                rebounds:'12',
                assists:'6',
                steals:'1',
                blocks:'1',
                turnovers:'3',
                fouls:'2',
                points:'33'
              }
            },
            {
              id:'11',
              name:'Payton Pritchard',
              starter:false,
              didNotPlay:false,
              dnpReason:'',
              stats:{
                minutes:'26',
                fg:'5-9',
                threePt:'3-6',
                ft:'0-0',
                rebounds:'3',
                assists:'4',
                steals:'1',
                blocks:'0',
                turnovers:'1',
                fouls:'1',
                points:'13'
              }
            },
            {
              id:'12',
              name:'Bench DNP',
              starter:false,
              didNotPlay:true,
              dnpReason:'Coach Decision',
              stats:{}
            }
          ],
          totals:{
            minutes:'265',
            fg:'44-91',
            threePt:'15-39',
            ft:'20-24',
            rebounds:'48',
            assists:'27',
            steals:'8',
            blocks:'5',
            turnovers:'12',
            fouls:'18',
            points:'123'
          }
        }
      ]
    },
    boxscore:{
      players:[
        {
          team:{id:'1'},
          statistics:[
            {
              labels:['MIN','FG','3PT','FT','OREB','DREB','REB','AST','STL','BLK','TO','PF','+/-','PTS'],
              athletes:[
                {
                  athlete:{id:'10',displayName:'Jayson Tatum'},
                  starter:true,
                  stats:['41','11-23','4-10','7-8','2','10','12','6','1','1','3','2','+9','33']
                },
                {
                  athlete:{id:'11',displayName:'Payton Pritchard'},
                  starter:false,
                  ejected:true,
                  stats:['26','5-9','3-6','0-0','1','2','3','4','1','0','1','1','-2','13']
                }
              ],
              totals:['265','44-91','15-39','20-24','11','37','48','27','8','5','12','18','','123']
            }
          ]
        }
      ]
    }
  };

  const nba =
    context.basketballBoxScoreMarkup(
      payload,
      'NBA'
    );

  assert.match(nba,/OREB/);
  assert.match(nba,/DREB/);
  assert.match(nba,/\+\/-/);
  assert.match(nba,/>\+9</);
  assert.match(nba,/Starters/);
  assert.match(nba,/Bench/);
  assert.match(nba,/Did not play/);
  assert.match(nba,/Coach Decision/);
  assert.match(nba,/Ejected/);
  assert.match(nba,/Q4 30 · OT 8/);
  assert.match(nba,/>11<.*>37<.*>48</s);

  const ncaab =
    context.basketballBoxScoreMarkup(
      {
        ...payload,
        basketballBoxScore:{
          teams:[
            {
              ...payload.basketballBoxScore.teams[0],
              periods:[
                {value:'35'},
                {value:'40'},
                {value:'7'}
              ]
            }
          ]
        }
      },
      'NCAAB'
    );

  assert.match(ncaab,/1H 35 · 2H 40 · OT 7/);
});

test('Basketball Box Score hides optional raw columns when the provider does not supply them',() => {
  const payload = {
    basketballBoxScore:{
      teams:[
        {
          teamId:'1',
          displayName:'Team One',
          periods:[],
          players:[
            {
              id:'1',
              name:'Player One',
              starter:null,
              didNotPlay:false,
              stats:{
                minutes:'30',
                fg:'5-10',
                threePt:'1-3',
                ft:'2-2',
                rebounds:'6',
                assists:'2',
                steals:'1',
                blocks:'0',
                turnovers:'1',
                fouls:'2',
                points:'13'
              }
            }
          ],
          totals:null
        }
      ]
    },
    boxscore:{
      players:[]
    }
  };

  const markup =
    context.basketballBoxScoreMarkup(
      payload,
      'NBA'
    );

  assert.doesNotMatch(markup,/OREB/);
  assert.doesNotMatch(markup,/DREB/);
  assert.doesNotMatch(markup,/\+\/-/);
  assert.match(markup,/MIN/);
  assert.match(markup,/PTS/);
});

test('Global search is wired to the canonical feed and opens Game Center directly',() => {
  assert.match(source,/function normalizeGlobalSearch\(/);
  assert.match(source,/function globalSearchGameScore\(game,query\)/);
  assert.match(source,/function globalSearchTeams\(\)/);
  assert.match(source,/data-search-game/);
  assert.match(source,/async function openGameDetails\(id,sport=null,restore=null\)/);
});

test('Team pages load cached team data with leaders, a full schedule, and only last/next Signal spotlights',() => {
  assert.match(source,/function teamDetailsUrlFor\(/);
  assert.match(source,/function loadTeamPageData\(/);
  assert.match(source,/function teamLeaderMarkup\(/);
  assert.match(source,/function teamScheduleMarkup\(/);
  assert.match(source,/function teamSpotlightRows\(/);
  assert.match(source,/teamPageTab === 'schedule'/);
  assert.match(source,/teamSpotlightMarkup\('Last Game'/);
  assert.match(source,/teamSpotlightMarkup\('Next Game'/);
  assert.match(source,/teamSignalMarkup\(entry\.signal/);
  assert.doesNotMatch(source,/teamGameSection\('Upcoming',upcoming\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source =
  fs.readFileSync(
    new URL('../app.js',import.meta.url),
    'utf8'
  );

const start =
  source.indexOf(
    'function timelineFormat('
  );

const end =
  source.indexOf(
    'function excitementTimeline('
  );

assert.ok(start >= 0 && end > start);

const timelineSource =
  source.slice(start,end);

function runTimeline({
  history,
  local=[]
}) {
  const game = {
    id:'history',
    sport:'NFL',
    state:'live',
    teams:[
      ['Away','A','21'],
      ['Home','H','20']
    ],
    live:{
      phase:'Q1 4:30'
    },
    liveRawStatus:{
      period:1,
      displayClock:'4:30'
    }
  };

  const summary = {
    header:{
      competitions:[{
        status:{
          period:1,
          displayClock:'4:30'
        }
      }],
      season:{
        type:2
      }
    },
    sportsRadarHistory:{
      snapshots:history
    }
  };

  const context =
    vm.createContext({
      game,
      summary,
      ratingHistory:{
        'NFL:history':local
      },
      watchKey:item =>
        `${item.sport}:${item.id}`,
      SPORT_BASE:{
        NFL:42
      },
      legacyPlayPosition:() => null,
      scoringEvents:() => [],
      estimatedEventRating:() => 0,
      compactPlay:() => ''
    });

  vm.runInContext(
    timelineSource,
    context
  );

  return vm.runInContext(
    'timelinePoints(game,summary)',
    context
  );
}

test(
  'canonical Worker ratings are preferred unchanged and a newer browser point can extend the live curve',
  () => {
    const result =
      runTimeline({
        history:[
          {
            observedAt:1000,
            state:'upcoming',
            rating:55,
            modelVersion:'pregame'
          },
          {
            observedAt:2000,
            state:'live',
            rating:61,
            scoreA:'7',
            scoreB:'3',
            period:1,
            clock:'10:00',
            phaseLabel:'Q1',
            modelVersion:'model-a'
          },
          {
            observedAt:3000,
            state:'live',
            rating:70,
            scoreA:'14',
            scoreB:'10',
            period:1,
            clock:'5:00',
            phaseLabel:'Q1',
            modelVersion:'model-b'
          }
        ],
        local:[
          {
            at:4000,
            score:99,
            phase:'Q1 4:50',
            period:1,
            clock:'4:50'
          },
          {
            at:9001,
            score:74,
            phase:'Q1 4:30',
            period:1,
            clock:'4:30',
            scoreA:'14',
            scoreB:'10'
          }
        ]
      });

    assert.equal(
      result.source,
      'recorded + browser'
    );

    assert.deepEqual(
      Array.from(
        result.points,
        point => Number(point.score)
      ),
      [55,61,70,74]
    );

    assert.equal(
      result.points[1].modelVersion,
      'model-a'
    );

    assert.equal(
      result.points[2].modelVersion,
      'model-b'
    );

    assert.equal(
      result.points.some(point =>
        point.score === 99
      ),
      false
    );

    assert.equal(
      result.points.at(-1).local,
      true
    );
  }
);

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {gameHistory,RETENTION_MS,FOOTBALL_RETENTION_MS} from '../src/snapshot-history.js';

const schema =
  fs.readFileSync(
    new URL('../schema.sql',import.meta.url),
    'utf8'
  );

function environment(t) {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  t.after(() => db.close());

  return {
    db,
    DB:{
      prepare(sql) {
        let values = [];
        return {
          bind(...args) {
            values = args;
            return this;
          },
          async all() {
            return {
              results:
                db.prepare(sql)
                  .all(...values)
            };
          }
        };
      }
    }
  };
}

function insert(
  db,
  {
    key='NFL:history',
    at,
    state='live',
    rating,
    scoreA='21',
    scoreB='20',
    period='4',
    clock='1:00',
    phaseLabel='Q4',
    version='v1',lastPlay
  }
) {
  db.prepare(`INSERT INTO sports_snapshots
    (game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state,model_version)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      key,
      at,
      key.split(':')[0],
      state,
      rating,
      scoreA,
      scoreB,
      period,
      clock,
      JSON.stringify({
        live:{phase:phaseLabel},...(lastPlay?{liveRawSituation:{lastPlay}}:{})
      }),
      version
    );
}

test(
  'game history returns only the requested retained snapshots in chronological order without recalculating ratings',
  async t => {
    const env = environment(t);
    const now = Date.now();

    insert(env.db,{
      at:now - 15000,
      rating:77,
      clock:'0:45',
      version:'model-new'
    });

    insert(env.db,{
      at:now - 45000,
      rating:63,
      clock:'1:15',
      version:'model-old'
    });

    insert(env.db,{
      at:now - FOOTBALL_RETENTION_MS - 1,
      rating:99,
      version:'expired'
    });

    insert(env.db,{
      key:'NFL:other',
      at:now - 10000,
      rating:88,
      version:'other'
    });

    const result =
      await gameHistory(
        env,
        'NFL',
        'history',
        now
      );

    assert.equal(
      result.gameKey,
      'NFL:history'
    );

    assert.deepEqual(
      result.snapshots.map(point =>
        point.rating
      ),
      [63,77]
    );

    assert.deepEqual(
      result.snapshots.map(point =>
        point.modelVersion
      ),
      ['model-old','model-new']
    );

    assert.deepEqual(
      result.snapshots.map(point =>
        point.clock
      ),
      ['1:15','0:45']
    );

    assert.ok(
      result.snapshots.every(point =>
        point.phaseLabel === 'Q4'
      )
    );
  }
);

test('nonfootball game history expires at seven days while football retains fourteen',async t=>{
  const env=environment(t),now=Date.now(),day=86400000;
  insert(env.db,{key:'NHL:week',at:now-RETENTION_MS+1,rating:42});
  insert(env.db,{key:'NHL:week',at:now-RETENTION_MS-1,rating:75});
  insert(env.db,{key:'CFB:week',at:now-8*day,rating:61});
  insert(env.db,{key:'CFB:week',at:now-FOOTBALL_RETENTION_MS-1,rating:89});
  assert.deepEqual((await gameHistory(env,'NHL','week',now)).snapshots.map(p=>p.rating),[42]);
  assert.deepEqual((await gameHistory(env,'CFB','week',now)).snapshots.map(p=>p.rating),[61]);
});

test('CFB history retains but invalidates false fourth-quarter zeroes without changing scores',async t=>{
  const env=environment(t),now=Date.now();
  insert(env.db,{key:'CFB:usf-ecu',at:now-120000,rating:67,period:'3',clock:'0:00',phaseLabel:'End of 3rd Quarter'});
  for(let i=0;i<6;i++)insert(env.db,{key:'CFB:usf-ecu',at:now-105000+i*15000,
    rating:24,period:'4',clock:'0:00',phaseLabel:'End of 4th Quarter',lastPlay:{text:'End of 3rd quarter.'}});
  insert(env.db,{key:'CFB:usf-ecu',at:now-15000,rating:71,period:'4',clock:'0:02',phaseLabel:'0:02 - 4th Quarter'});
  insert(env.db,{key:'CFB:usf-ecu',at:now-10000,rating:43,period:'4',clock:'0:00',phaseLabel:'End of 4th Quarter'});
  insert(env.db,{key:'CFB:actual-end',at:now-60000,rating:67,period:'4',clock:'0:33',phaseLabel:'0:33 - 4th Quarter'});
  insert(env.db,{key:'CFB:actual-end',at:now-40000,rating:82,period:'4',clock:'0:00',phaseLabel:'End of 4th Quarter'});
  const history=await gameHistory(env,'CFB','usf-ecu',now);
  assert.deepEqual(history.snapshots.map(p=>p.rating),[67,24,24,24,24,24,24,71,43]);
  for(const point of history.snapshots.slice(1,7)){
    assert.equal(point.evidenceQuality,'invalid');
    assert.equal(point.integrityIssue,true);
    assert.equal(point.timingIssue,'unconfirmed-period-transition');
  }
  assert.ok(history.snapshots.slice(7).every(point=>point.evidenceQuality!=='invalid'),
    'the 0:02 recovery clears the false run and the real ending remains intact');
  const final=await gameHistory(env,'CFB','actual-end',now);
  assert.notEqual(final.snapshots[1].evidenceQuality,'invalid');
  assert.equal(env.db.prepare("SELECT rating FROM sports_snapshots WHERE game_key='CFB:usf-ecu' ORDER BY observed_at LIMIT 1 OFFSET 1").get().rating,24);
});


test('game detail route attaches stored history without requiring a second browser request',()=>{
  const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  assert.match(source,/gameHistory\(env,detail\[1\],detail\[2\]\)/);
  assert.match(source,/sportsRadarHistory:history/);
});

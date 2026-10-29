import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {gameHistory,RETENTION_MS} from '../src/snapshot-history.js';

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
    version='v1'
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
        live:{phase:phaseLabel}
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
      at:now - RETENTION_MS - 1,
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


test('game detail route attaches stored history without requiring a second browser request',()=>{
  const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  assert.match(source,/gameHistory\(env,detail\[1\],detail\[2\]\)/);
  assert.match(source,/sportsRadarHistory:history/);
});

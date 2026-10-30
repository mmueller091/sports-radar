import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function compactClockPeriod('),source.indexOf('function gameCard(')),context);
const label=(sport,period,phase)=>context.compactClockPeriod({sport,liveRawStatus:{period},live:{phase}});

test('clock labels use the same short ordinals across quarters, periods and halves',()=>{
  for (const sport of ['NFL','CFB','NBA','NHL','NCAAB']) {
    assert.equal(label(sport,1,'9:24 · 1ST PERIOD'),'1st');
    assert.equal(label(sport,2,'Q2'),'2nd');
  }
  assert.equal(label('NHL',3,'3RD PERIOD'),'3rd');
  assert.equal(label('NBA',4,'4th Quarter'),'4th');
  assert.equal(label('NHL',undefined,'9:24 · 2ND PERIOD'),'2nd');
  assert.equal(label('NBA',undefined,'Q1'),'1st');
  assert.equal(context.compactClockPeriod({sport:'NCAAB',liveRawStatus:{period:3},format:{regulation:{periods:4}}}),'3rd');
});

test('overtime and pauses keep their meaning instead of becoming regulation ordinals',()=>{
  assert.equal(label('NHL',4,'Live'),'OT');
  assert.equal(label('NBA',6,'Live'),'2OT');
  assert.equal(label('NCAAB',3,'Live'),'OT');
  assert.equal(label('CFB',5,'2OT'),'2OT');
  assert.equal(label('NHL',5,'Shootout'),'SO');
  assert.equal(label('NBA',2,'Halftime'),'Half');
  assert.equal(label('NHL',1,'1st Intermission'),'1st Intermission');
});

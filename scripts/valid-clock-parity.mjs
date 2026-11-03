import fs from 'node:fs';
import {loadFixtures} from '../calibration/helpers.mjs';
import * as active from '../alerts-worker/src/live-game-model.js';

const results=[];
for(const [index,fixture] of loadFixtures().entries()){
  const sport=fixture.modelSport,status=fixture.event.competitions?.[0]?.status||{};
  const clock=String(status.displayClock||'');
  const timed=['NBA','NCAAB','NFL','CFB','NHL'].includes(sport);
  if(timed&&!/^(?:\d+:\d{1,2}(?:\.\d+)?|\d+(?:\.\d+)?)$/.test(clock))continue;
  if(timed&&status.type?.state==='in'&&/^0+(?:(?::0+(?:\.0+)?)|(?:\.0+))?$/.test(clock))continue;
  const game=active.normalizeEvent(structuredClone(fixture.event),sport);
  if(!game)continue;
  active.enrichGame(game,structuredClone(fixture.summary));
  results.push({index,id:String(game.id),sport,state:game.state,clock,score:game.score});
}
fs.mkdirSync('work',{recursive:true});
fs.writeFileSync('work/valid-clock-parity.json',JSON.stringify(results,null,2)+'\n');
console.log(`${results.length} valid-clock or untimed fixture scores recorded`);

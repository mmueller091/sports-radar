import {createRequire} from 'node:module';
const {fixture}=createRequire(import.meta.url)('../test/helpers/cfb-calibration.cjs');

// Selected and scored against the published CFB_CONTEXT policy before editing.
// These are counterexamples, not new human targets. Inputs remain archived.
export const cfbWatchabilityAdditional=[
  ['sustained-close','401866442','401866442642',70],
  ['defensive','401871091','401871091293',46],
  ['recovery','401856724','401856724574',58],
  ['false-closeness','401866443','401866443723',61],
  ['garbage-time','401856720','401856720774',1],
  ['ranked-matchup','401856720','401856720350',45],
  ['quarter-boundary','401856719','401856719188',48],
  ['quarter-boundary','401856719','401856719192',49],
  ['quarter-boundary','401856719','401856719411',62],
  ['quarter-boundary','401856719','401856719418',63],
  ['quarter-boundary','401856719','401856719594',60],
  ['quarter-boundary','401856719','401856719598',61]
];

// Hypothetical matched contexts and known-state counterexamples, selected first.
export function cfbWatchabilityInputs() {
  return [
    ['routine-early-tie',61,{period:1,clock:'12:00',scores:[0,0],possession:'',probability:.5}],
    ['defensive-midgame',57,{period:2,clock:'7:00',scores:[3,3],possession:'',probability:.5}],
    ['strong-midgame',72,{period:2,clock:'7:00',scores:[3,3],possession:'',probability:.5,ranks:[5,8],spread:3}],
    ['championship-midgame',84,{period:2,clock:'7:00',scores:[3,3],possession:'',probability:.5,playoff:true}],
    ['late-false-close',17,{clock:'0:30',scores:[24,21],possession:'h',spot:'BUF 25',down:1,timeouts:0,probability:.99}],
    ['late-decisive-drive',90,{clock:'0:40',scores:[24,21],possession:'a',spot:'BUF 15',down:3,distance:4,probability:.8}],
    ['late-blowout',1,{clock:'1:00',scores:[42,7],possession:'h',spot:'BUF 25',down:1,timeouts:0,probability:.999}]
  ].map(([id,baselineScore,options])=>{
    const f=fixture(options);f.event.id=id;f.event.competitions=[f.competition];
    return {id,baselineScore,hypothetical:true,sport:'CFB',...f};
  });
}

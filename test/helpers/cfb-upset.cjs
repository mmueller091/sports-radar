const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {gunzipSync}=require('node:zlib');
const completed=require('./cfb-completed.cjs');
const source=gunzipSync(fs.readFileSync(path.join(__dirname,'../fixtures/scoring-core-before-cfb-upset.js.gz'))).toString();
const before=vm.runInNewContext(`${source}\nSportsRadarScore`);
const close=completed.cases.K;
const wide={...completed.cases.O,scores:[14,42],path:[[1,'10:00',0,7],[1,'3:00',0,14],[2,'10:00',0,21],[2,'2:00',0,28],[3,'9:00',7,28],[3,'2:00',7,35],[4,'8:00',14,35],[4,'2:00',14,42]]};
const late={scores:[14,31],spread:21,path:[[1,'8:00',0,7],[2,'6:00',7,7],[3,'7:00',7,14],[3,'0:00',14,14],[4,'5:00',14,21],[4,'2:00',14,28],[4,'0:20',14,31]]};
const cases={
 A:{...close,spread:7},B:{...close,spread:14},C:{...close,spread:21},D:{...close,spread:28},E:{...close,spread:30},
 F:{...wide,spread:14},G:{...wide,spread:21},H:{...wide,spread:28},
 I:late,J:{scores:[14,31],spread:21,path:[[1,'10:00',0,7],[1,'3:00',0,14],[2,'10:00',0,21],[2,'2:00',0,28],[3,'9:00',7,28],[4,'8:00',14,28],[4,'2:00',14,31]]},
 K:{...close,spread:14},L:{...close,spread:14,ranks:[20,null]},M:{...close,spread:14,ranks:[5,null]},N:{...close,spread:14,ranks:[2,null]},
 O:{...close,spread:28,ranks:[2,null]},P:{...wide,spread:28,ranks:[2,null]},
 Q:{...close,spread:21},R:{...close,spread:21,stage:'Conference Championship'},S:{...close,spread:21,stage:'College Football Playoff Semifinal'}
};
module.exports={before,source,cases,wide};

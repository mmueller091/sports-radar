const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{gunzipSync}=require('node:zlib');
const fixture=()=>JSON.parse(gunzipSync(fs.readFileSync(path.join(__dirname,'../fixtures/nfl-pregame/20261101.json.gz'))));
function before(){const module={exports:{}};vm.runInNewContext(gunzipSync(fs.readFileSync(path.join(__dirname,'../fixtures/nfl-pregame/before.cjs.gz'))).toString(),{module,exports:module.exports,require,console,Date,structuredClone});return module.exports;}
module.exports={fixture,before};

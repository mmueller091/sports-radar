const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{gunzipSync}=require('node:zlib');
const root=path.resolve(__dirname,'../..');
const read=name=>JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'test/fixtures/finish-audit',name+'.json.gz'))));
function baseline(){const module={exports:{}};vm.runInNewContext(gunzipSync(fs.readFileSync(path.join(root,'test/fixtures/scoring-before-finish.cjs.gz'))).toString(),{module,exports:module.exports,require,URL,console});return module.exports;}
function score(api,event,summary,sport){const g=api.normalizeEvent(structuredClone(event),sport);api.enrichGame(g,structuredClone(summary));return g;}
module.exports={read,baseline,score};

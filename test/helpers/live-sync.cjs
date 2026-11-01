const fs=require('node:fs'),z=require('node:zlib'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=name=>JSON.parse(z.gunzipSync(fs.readFileSync(path.join(root,'test/fixtures/live-sync',name+'.json.gz'))));
function baseline(){const module={exports:{}};vm.runInNewContext(z.gunzipSync(fs.readFileSync(path.join(root,'test/fixtures/scoring-before-live-sync.cjs.gz'))).toString(),{module,exports:module.exports,require,URL,console});return module.exports;}
function score(api,event,summary,previous=null){const g=api.normalizeEvent(structuredClone(event),event.modelSport||'CFB');api.enrichGame(g,structuredClone(summary),previous&&structuredClone(previous));return g;}
module.exports={read,baseline,score};

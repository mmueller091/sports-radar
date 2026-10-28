import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../',import.meta.url));
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts = [...html.matchAll(/<script src="((?:scoring\/|rating-core\.js)[^"?]*)(?:\?[^" ]*)?"/g)].map(match => match[1]);

test('every scoring module loads in browser order, exports in Node, and is cached offline', () => {
  const browser = vm.createContext({});
  const serviceWorker = fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const shell = vm.runInNewContext(`${serviceWorker.slice(0,serviceWorker.indexOf("self.addEventListener"))}\nSHELL`);
  const actualFiles = fs.readdirSync(path.join(root,'scoring'),{recursive:true})
    .filter(file => file.endsWith('.js')).map(file => `scoring/${file.replaceAll('\\','/')}`);
  assert.deepEqual([...scripts].sort(),[...actualFiles,'rating-core.js'].sort());
  assert.equal(scripts.at(-1),'rating-core.js');
  for (const script of scripts) {
    assert.ok(shell.includes(`./${script}`),`${script} is precached`);
    assert.ok(Object.keys(require(path.join(root,script))).length,`${script} exports in Node`);
    vm.runInContext(fs.readFileSync(path.join(root,script),'utf8'),browser,{filename:script});
  }
  assert.equal(typeof browser.SportsRadarScore.rateGame,'function');
  const {SPORT_MODELS} = require('../scoring/models.js');
  assert.deepEqual(Object.keys(SPORT_MODELS).sort(),['CFB','MLB','NBA','NCAAB','NFL','NHL','Soccer','Tennis']);
  for (const [sport,model] of Object.entries(SPORT_MODELS)) {
    assert.equal(typeof model.situation,'function',sport);
    assert.ok(model.history.threshold > 0,sport);
  }
});

test('module dependencies are acyclic and shared helpers do not import sport models or the core', () => {
  const visited = new Set();
  function visit(file,ancestors=[]) {
    assert.ok(!ancestors.includes(file),`dependency cycle: ${[...ancestors,file].join(' -> ')}`);
    if (visited.has(file)) return;
    const source = fs.readFileSync(file,'utf8');
    for (const [,relative] of source.matchAll(/require\('([^']+)'\)/g)) {
      const dependency = path.resolve(path.dirname(file),relative);
      if (file.includes(`${path.sep}shared${path.sep}`)) {
        assert.ok(dependency.includes(`${path.sep}shared${path.sep}`),`${file} imports ${dependency}`);
      }
      visit(dependency,[...ancestors,file]);
    }
    visited.add(file);
  }
  visit(path.join(root,'rating-core.js'));
  assert.equal(visited.size,scripts.length,'all browser modules are reachable through Node imports');
});

test('Worker entry bundles and executes the same scoring graph without Node-only runtime imports', async () => {
  const {buildSync} = require('../alerts-worker/node_modules/esbuild');
  const result = buildSync({
    absWorkingDir:root,entryPoints:['./alerts-worker/src/index.js'],tsconfigRaw:{},
    bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',metafile:true,logLevel:'silent'
  });
  assert.ok(result.outputFiles[0].text.includes('SportsRadarScore'));
  const inputs = Object.keys(result.metafile.inputs).map(file => file.replaceAll('\\','/'));
  for (const script of scripts) assert.ok(inputs.some(file => file.endsWith(script)),`${script} bundled`);
  for (const output of Object.values(result.metafile.outputs)) {
    assert.deepEqual(output.imports,[],'Worker bundle is self-contained');
  }
  const direct = require('../rating-core.js');
  const worker = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  assert.equal(typeof worker.default.fetch,'function');
  const bundled = globalThis.SportsRadarScore;
  assert.notEqual(bundled,direct,'the bundled core executed');
  assert.deepEqual(Object.keys(bundled),Object.keys(direct));
  for (const sport of ['NFL','CFB','MLB','NHL','NBA','NCAAB','Tennis','Soccer']) {
    for (const state of ['upcoming','live','completed']) {
      const args = [sport,state,[{score:'24'},{score:'21'}],{}, {status:{period:4,displayClock:'0:30'},competitors:[]},''];
      assert.deepEqual(bundled.rateGame(...args),direct.rateGame(...args),`${sport} ${state}`);
    }
  }
  const {cases,evaluate} = require('./helpers/nfl-calibration.cjs');
  for (const [key,input] of Object.entries(cases)) {
    assert.deepEqual(evaluate(bundled,input),evaluate(direct,input),`NFL ${key} bundled live snapshot`);
  }
  const cfb = require('./helpers/cfb-calibration.cjs');
  for (const [key,input] of Object.entries(cfb.cases)) {
    assert.deepEqual(cfb.evaluate(bundled,input),cfb.evaluate(direct,input),`CFB ${key} bundled live snapshot`);
  }
  const midgame = require('./helpers/midgame.cjs');
  for (const input of Object.values(midgame.cfbCases))
    assert.deepEqual(cfb.evaluate(bundled,input),cfb.evaluate(direct,input),'CFB midgame bundled live snapshot');
  for (const input of Object.values(midgame.hockeyCases))
    assert.equal(midgame.hockey(bundled,input),midgame.hockey(direct,input),'NHL opening bundled live snapshot');
});

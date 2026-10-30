const {readFileSync} = require('node:fs');
const {gunzipSync} = require('node:zlib');
const {resolve} = require('node:path');
const Module = require('node:module');
// Freeze the pre-task shadow orchestration; resolve its unchanged dependencies
// from calibration/, so default-path parity is independent of revised dispatch.
const filename = resolve(__dirname,'../../calibration/phase31-before.cjs');
const oracle = new Module(filename,module);
oracle.filename = filename;
oracle.paths = Module._nodeModulePaths(resolve(__dirname,'../../calibration'));
oracle._compile(gunzipSync(readFileSync(resolve(__dirname,'../fixtures/phase31-shadow-before.cjs.gz'))).toString(),filename);
module.exports = oracle.exports;

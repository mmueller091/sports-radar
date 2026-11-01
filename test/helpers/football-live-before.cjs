const fs=require('node:fs'),zlib=require('node:zlib'),Module=require('node:module'),path=require('node:path');
const filename=path.resolve(__dirname,'../fixtures/football-live-before-20261101.cjs.gz');
const m=new Module(filename,module);
m.filename=filename;m.paths=module.paths;
m._compile(zlib.gunzipSync(fs.readFileSync(filename)).toString(),filename);
module.exports=m.exports;

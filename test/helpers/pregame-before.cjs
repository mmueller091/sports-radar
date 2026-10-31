const fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib'),path=require('node:path');
const context={module:{exports:{}}};
vm.runInNewContext(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'../fixtures/pregame-before-20261031.cjs.gz'))).toString(),context);
module.exports=context.module.exports;

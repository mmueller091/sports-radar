// Test-only loader: substitute the two exact committed notification sources in
// memory. Working files are neither overwritten nor imported as approximations.
import {registerHooks} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sources=new Map(['alerts-worker/src/index.js','alerts-worker/src/alert-delivery.js'].map(file=>[
  pathToFileURL(path.join(root,file)).href,
  execFileSync('git',['show',`712f221:${file}`],{cwd:root,encoding:'utf8'})
]));
registerHooks({load(url,context,nextLoad){
  return sources.has(url)?{format:'module',source:sources.get(url),shortCircuit:true}:nextLoad(url,context);
}});

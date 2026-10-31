import {createRequire} from 'node:module';
import {mkdirSync,copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const require=createRequire(new URL('../alerts-worker/package.json',import.meta.url));
const {build}=require('esbuild');
const revision=process.env.ASSET_REV || execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const assets=['styles.css','mobile-readability.css','alert-config.js','notifications.js','watch-links.js','app.js',
  'teams.json','manifest.webmanifest','sports-radar-logo.png','app-icon-192.png','app-icon-512.png','icon.svg'];
mkdirSync('dist',{recursive:true});
await build({entryPoints:['scoring/browser-entry.cjs'],outfile:'dist/scoring-runtime.js',bundle:true,
  platform:'browser',format:'iife',target:'es2022',minify:true});
for (const file of assets) copyFileSync(file,`dist/${file}`);
let html=readFileSync('index.html','utf8').replace(/\?rev=[^"\s]+/g,`?rev=${revision}`);
writeFileSync('dist/index.html',html);
let sw=readFileSync('sw.js','utf8').replaceAll('__BUILD_REV__',revision);
writeFileSync('dist/sw.js',sw);
console.log(`Built ${revision}: browser-safe scorer and allowlisted static assets only.`);

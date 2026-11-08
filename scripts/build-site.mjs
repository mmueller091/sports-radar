import {createRequire} from 'node:module';
import {mkdirSync,copyFileSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const require=createRequire(new URL('../alerts-worker/package.json',import.meta.url));
const {build}=require('esbuild');
const revision=process.env.ASSET_REV || execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const assets=['league-standings.css','league-standings-data.js','league-standings.js','styles.css','mobile-readability.css','ui-overhaul.css','team-logos.css','team-logos.js','sport-visibility.js','alert-config.js','notifications.js','watch-links.js','game-center.js','app.js',
  'tennis-coverage.js','teams.json','manifest.webmanifest','slatemeter-pennant-s-icon.svg','slatemeter-pennant-s-icon.png','slatemeter-pennant-s-favicon-32.png','slatemeter-pennant-s-wordmark.svg','slatemeter-pennant-s-wordmark.png','app-icon-192.png','app-icon-512.png','icon.svg'];
mkdirSync('dist',{recursive:true});
rmSync('dist/slatemeter-theme.css',{force:true});
await build({entryPoints:['./scoring/browser-entry.cjs'],outfile:'dist/scoring-runtime.js',bundle:true,
  platform:'browser',format:'iife',target:'es2022',minify:true});
for (const file of assets) copyFileSync(file,`dist/${file}`);
mkdirSync('dist/fonts',{recursive:true});
for (const file of ['BarlowCondensed-SemiBold.ttf','BarlowCondensed-Bold.ttf','OFL.txt']) copyFileSync(`fonts/${file}`,`dist/fonts/${file}`);
let html=readFileSync('index.html','utf8').replace(/\?rev=[^"\s]+/g,`?rev=${revision}`);
writeFileSync('dist/index.html',html);
let sw=readFileSync('sw.js','utf8').replaceAll('__BUILD_REV__',revision);
writeFileSync('dist/sw.js',sw);
console.log(`Built ${revision}: browser-safe scorer and allowlisted static assets only.`);

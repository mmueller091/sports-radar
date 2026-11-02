import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import vm from 'node:vm';
import runtime from '../../scoring/live-runtime.cjs';
import {snapshotEvidence} from '../../alerts-worker/src/snapshot-history.js';
export const read=name=>JSON.parse(gunzipSync(fs.readFileSync(new URL('../fixtures/timeline-clarity/'+name+'.json.gz',import.meta.url))));
export const rows=read('final-rows');
export function fixture(sport,id){
 const detail=read(sport+'-'+id).detail;
 for(const point of detail.sportsRadarHistory.snapshots){
  const row=rows.find(r=>r.game_key===sport+':'+id && Number(r.observed_at)===point.observedAt);
  if(row)Object.assign(point,snapshotEvidence(JSON.parse(row.normalized_state),row.state));
 }
 return detail;
}
export function browser(source=fs.readFileSync(new URL('../../app.js',import.meta.url),'utf8')){
 const context=vm.createContext({...runtime,console,Date,Intl,ratingHistory:{},watchKey:g=>g.sport+':'+g.id,
  safeText:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),compactPlay:p=>p.text||''});
 for(const name of ['legacyPlayPosition','scoringEvents','estimatedEventRating']){
  const start=source.indexOf('function '+name+'(');
  vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
 }
 vm.runInContext(source.slice(source.indexOf('function timelineFormat('),source.indexOf('function safeStoryUrl(')),context);
 return context;
}

import fs from 'node:fs';import vm from 'node:vm';import {gunzipSync} from 'node:zlib';
import runtime from '../../scoring/live-runtime.cjs';
import {browser as timelineBrowser} from './timeline-clarity.mjs';
export const fixture=id=>JSON.parse(gunzipSync(fs.readFileSync(new URL('../fixtures/overtime-terminology/NFL-'+id+'.json.gz',import.meta.url)))).detail;
export function browser(source=fs.readFileSync(new URL('../../app.js',import.meta.url),'utf8')){
 const context=timelineBrowser(source),detail={};
 Object.assign(context,{SportsRadarScore:runtime,state:{source:'live'},HISTORY_KEY:'history',localStorage:{setItem:()=>{}},
  LEAGUE_LOGOS:{},displayLine:()=>({label:'Line',text:''}),isWatched:()=>false,teamMarkup:()=>'',possessionMarkup:()=>'',
  $:()=>detail,labelForSport:s=>s,teamLogoUrl:()=>'',detailTabsMarkup:()=>'',storylineDetails:()=>'',detail});
 for(const name of ['normalizedTeamName','teamLogoWithFallback','halftimePriorityAdjustment','explainRating','narrativeMarket','pregameExplanation','upcomingLinkedStories','publicStorySentence','compactClockPeriod','broadcastWatchMarkup',
  'scoreHueFor','scoreHeatClass','gameCard','basesMarkup','trendFor','isWinningTeam','footballSituationMarkup','baseballSituationMarkup','footballAccessibleSituation','detailPlays','detailCompetitors','orderedDetailSummary','detailScoring','playPosition','summarySpecificWhy','renderDetailContent']){
  const start=source.indexOf('function '+name+'(');if(start<0){if(name==='orderedDetailSummary')continue;throw Error(name);}
  vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
 }
 return context;
}

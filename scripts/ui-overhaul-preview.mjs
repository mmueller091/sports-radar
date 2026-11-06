// Local visual QA only. This server never forwards requests to a scoring provider.
// Screenshots must be taken and inspected in a real browser. DOM checks are supplementary.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const output=path.join(root,'audit/ui-overhaul-20261103');
fs.mkdirSync(output,{recursive:true});
const frozen=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'test/fixtures/ui-corrections-feed.json.gz'))));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'teams.json'),'utf8'));
const widths=[1440,1024,430,390,375,320];
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const team=(sport,name,abbr,score='0',record='6-2',rank=null)=>{
  const t=catalog[sport].find(t=>t.name===name);if(!t)throw Error(name);
  return [t.name,abbr,score,'white',t.logo,record,rank,name.replace(/ (?:Nittany Lions|Commodores|Gamecocks|Boilermakers|Red Raiders|Crimson Tide)$/,''),t.id];
};
const seed=sport=>structuredClone(frozen.games.find(g=>g.sport===sport));
const fixture=(sport,id,teams,options={})=>({...seed(sport),id:'qa-'+id,teams,state:'live',status:'4:18 - 4th',score:83,openingScore:65,pregameBaseline:{source:'observed',score:65},scoringPartial:false,timingUncertain:false,detailStale:false,live:{phase:'4th · 4:18',note:'',reasons:[]},liveRawStatus:{period:4,displayClock:'4:18',type:{state:'in',name:'STATUS_IN_PROGRESS'}},moment:'Fixture: a verified scoring event in this test scenario.',momentLabel:'Latest play',why:'Deterministic UI fixture. Scores and situations are illustrative, not live sports observations.',sub:'Visual regression fixture',...options});
const scenarios=[
  fixture('NFL','nfl-possession',[team('NFL','Las Vegas Raiders','LV','24','6-2'),team('NFL','Baltimore Ravens','BAL','21','5-3')],{footballSituation:{possessionTeamId:'13',downAndDistance:'3rd & 4',fieldPosition:'BAL 26'},channel:'CBS'}),
  fixture('NHL','nhl-pp',[team('NHL','Detroit Red Wings','DET','2','7-5-3'),team('NHL','Tampa Bay Lightning','TB','3','8-3-2')],{score:88,live:{phase:'3rd · 2:14',note:'Tampa Bay Lightning power play',reasons:[]},liveRawStatus:{period:3,displayClock:'2:14',type:{state:'in'}},nhlManpower:{powerPlayTeam:'Tampa Bay Lightning',powerPlayTeamId:'20',powerPlayAdvantage:1,awaySkaters:4,homeSkaters:5},manpowerQuality:{state:'verified'},channel:'ESPN+'}),
  fixture('CFB','cfb-navy',[team('CFB','Penn State Nittany Lions','PSU','24','8-0',4),team('CFB','Washington Huskies','WASH','21','7-1',14)],{score:92,footballSituation:{possessionTeamId:'213',downAndDistance:'4th & Goal',fieldPosition:'WASH 3'},channel:'ABC'}),
  fixture('NBA','nba-black',[team('NBA','Brooklyn Nets','BKN','102','5-2'),team('NBA','San Antonio Spurs','SA','101','4-3')],{score:79,openingScore:86,pregameBaseline:{source:'observed',score:86},channel:'ESPN'}),
  fixture('MLB','mlb-navy',[team('MLB','New York Yankees','NYY','3','94-68'),team('MLB','Chicago White Sox','CHW','3','83-79')],{score:91,live:{phase:'Top 9th',note:'',bases:{first:true,second:true,third:false}},baseballSituation:{bases:{first:true,second:true,third:false},outs:2,count:'3-2'},liveRawStatus:{period:9,type:{state:'in'}},channel:'FOX'}),
  fixture('NCAAB','ncaam-shapes',[team('NCAAB','Wofford Terriers','WOF','65','5-2'),team('NCAAB','Tennessee Volunteers','TENN','65','6-1',8)],{score:88,live:{phase:'2nd half · 0:24',note:''},liveRawStatus:{period:2,displayClock:'0:24',type:{state:'in'}},channel:''}),
  fixture('CFB','cfb-red',[team('CFB','South Carolina Gamecocks','SC','10','6-2',19),team('CFB','Alabama Crimson Tide','ALA','14','7-1',3)],{score:65,pregameBaseline:{source:'observed',score:65},footballSituation:{possessionTeamId:'2579',downAndDistance:'1st & 10',fieldPosition:'SC 35'},channel:'SEC Network'}),
  fixture('CFB','cfb-black',[team('CFB','Purdue Boilermakers','PUR','7','3-5'),team('CFB','Vanderbilt Commodores','VAN','10','5-3')],{score:48,footballSituation:null,live:{phase:'2nd · 6:32',note:''},liveRawStatus:{period:2,displayClock:'6:32',type:{state:'in'}},channel:''}),
  fixture('NHL','nhl-final',[team('NHL','Los Angeles Kings','LA','3','8-5-1'),team('NHL','Boston Bruins','BOS','2','9-4-1')],{state:'completed',status:'Final/OT',score:83,live:null,liveRawStatus:{period:4,type:{state:'post',completed:true}}}),
  fixture('NBA','nba-pending',[team('NBA','Brooklyn Nets','BKN','53','5-2'),team('NBA','New York Knicks','NY','49','4-3')],{score:62,scoringPartial:true,live:{phase:'Halftime',note:''},status:'Halftime',liveRawStatus:{period:2,displayClock:'0:00',type:{state:'in',name:'STATUS_HALFTIME'}}}),
  fixture('NCAAB','ncaam-upcoming',[team('NCAAB','Texas A&M-Corpus Christi Islanders','AMCC','0','0-0'),team('NCAAB','Kentucky Wildcats','UK','0','0-0',23)],{state:'upcoming',status:'7:30 PM',score:46,live:null,liveRawStatus:{type:{state:'pre'}},channel:'ESPN+'}),
  fixture('NHL','nhl-intermission',[team('NHL','Dallas Stars','DAL','2','8-5-1'),team('NHL','Washington Capitals','WSH','2','8-5-0')],{score:70,pregameBaseline:{source:'observed',score:70},live:{phase:'2nd Intermission',note:''},status:'2nd Intermission',liveRawStatus:{period:2,displayClock:'0:00',type:{state:'in',name:'STATUS_END_PERIOD'}}}),
  fixture('NBA','heat-warriors',[team('NBA','Miami Heat','MIA','120','12-2'),team('NBA','Golden State Warriors','GS','115','11-3')],{state:'completed',status:'Final',live:null,liveRawStatus:{period:4,type:{state:'post',completed:true}},score:91}),
  fixture('CFB','two-long-names',[team('CFB','South Carolina Gamecocks','SC','9','6-2'),team('CFB','Penn State Nittany Lions','PSU','10','8-0')],{state:'completed',status:'Final',live:null,liveRawStatus:{period:4,type:{state:'post',completed:true}},score:88}),
  fixture('NBA','three-digit-swap',[team('NBA','Miami Heat','MIA','100','12-2'),team('NBA','Golden State Warriors','GS','99','11-3')],{score:82})
];
const logoCases=[
 ['NFL','Las Vegas Raiders','LV','Black / white'],['NFL','Baltimore Ravens','BAL','Dark purple / fine details'],['NFL','Dallas Cowboys','DAL','Navy / outline'],
 ['MLB','Chicago White Sox','CHW','White / thin lettering'],['MLB','New York Yankees','NYY','Navy / thin lettering'],['MLB','Boston Red Sox','BOS','Red / unusual shape'],
 ['NHL','Tampa Bay Lightning','TB','Dark navy'],['NHL','Los Angeles Kings','LA','Black / silver'],['NHL','Detroit Red Wings','DET','Red / fine details'],
 ['NBA','Brooklyn Nets','BKN','Black / white'],['NBA','San Antonio Spurs','SA','White / thin details'],['NBA','Miami Heat','MIA','Multicolored'],
 ['CFB','Purdue Boilermakers','PUR','Predominantly black'],['CFB','South Carolina Gamecocks','SC','Dark red / fine details'],['CFB','Penn State Nittany Lions','PSU','Dark navy'],
 ['NCAAB','Wofford Terriers','WOF','Unusual college shape'],['NCAAB','Texas A&M-Corpus Christi Islanders','AMCC','Multicolored / unusual shape'],['NCAAB','Stanford Cardinal','STAN','Dark red / thin details']
].map(([sport,name,abbr,kind])=>({sport,kind,team:team(sport,name,abbr)}));
// Authentic alternates are QA references only, never substitutions in production.
const alternateLightning=team('NHL','Tampa Bay Lightning','TB');
const alternateSox=team('MLB','Chicago White Sox','CHW');
logoCases.push(
 {sport:'NHL',kind:'Predominantly white / transparent PNG · provider alternate',qaOnlyAlternate:true,canonicalSource:alternateLightning[4],team:[...alternateLightning.slice(0,4),'https://a.espncdn.com/i/teamlogos/nhl/500-dark/tb.png',...alternateLightning.slice(5)]},
 {sport:'MLB',kind:'Official transparent SVG / thin details',qaOnlyAlternate:true,canonicalSource:alternateSox[4],team:[...alternateSox.slice(0,4),'https://www.mlbstatic.com/team-logos/145.svg',...alternateSox.slice(5)]}
);
fs.writeFileSync(path.join(root,'test/fixtures/ui-overhaul-cases.json'),JSON.stringify({description:'Synthetic, deterministic UI test scenarios using authentic existing team assets. Not live observations.',baseline:'5b7f797c879d36826d08b2ea31a6fecd18ef092c',scenarios,logoCases},null,2)+'\n');

function summary(game){
  const competitors=game.teams.map((t,i)=>({id:t[8],homeAway:i?'home':'away',score:t[2],team:{id:t[8],displayName:t[0],abbreviation:t[1],logo:t[4],color:i?'1d428a':'98002e'},linescores:[{displayValue:'7'},{displayValue:'7'},{displayValue:'7'},{displayValue:'3'}]}));
  const basketballBoxScore=['NBA','NCAAB'].includes(game.sport) && game.state!=='upcoming' ? {teams:competitors.map((c,i)=>({teamId:c.team.id,abbreviation:c.team.abbreviation,displayName:c.team.displayName,periods:[{value:'25'},{value:'27'}],players:[{id:`qa-player-${i}`,name:`${c.team.abbreviation} Fixture Player`,starter:true,stats:{minutes:'32',fg:'8-15',threePt:'2-5',ft:'4-4',rebounds:'7',assists:'5',steals:'1',blocks:'0',turnovers:'2',fouls:'2',points:'22'}}],totals:{minutes:'240',fg:'40-80',threePt:'12-30',ft:'20-24',rebounds:'42',assists:'25',steals:'8',blocks:'4',turnovers:'12',fouls:'17',points:c.score}})).reverse()} : undefined;
  return {sportsRadarGame:game,sportsRadarFreshness:{stale:false},header:{competitions:[{id:game.id,status:game.liveRawStatus,competitors:[...competitors].reverse(),venue:{fullName:'Fixture stadium'}}]},boxscore:{teams:competitors.map((c,i)=>({team:c.team,statistics:game.sport==='MLB'?[{name:'batting',stats:[{name:'runs',label:'Runs',displayValue:String(3+i),value:3+i},{name:'hits',label:'Hits',displayValue:String(7+i*2),value:7+i*2}]}]:[{name:'shotsTotal',label:'Shots',displayValue:String(21+i*9),value:21+i*9},{name:'totalYards',label:'Total yards',displayValue:String(310+i*40),value:310+i*40},{name:'totalRebounds',label:'Rebounds',displayValue:String(38+i*6),value:38+i*6}]})).reverse()},basketballBoxScore,plays:[{id:'qa-play',text:'Fixture scoring play for presentation checks.',scoringPlay:true,awayScore:game.teams[0][2],homeScore:game.teams[1][2],period:{number:game.liveRawStatus?.period||1},clock:{displayValue:'4:18'},team:competitors[0].team}],scoringPlays:[{id:'qa-score',text:'Fixture scoring play.',awayScore:game.teams[0][2],homeScore:game.teams[1][2],period:{number:game.liveRawStatus?.period||1},clock:{displayValue:'4:18'},team:competitors[0].team}]};
}
const bootstrap=`
window.__qaScenarios=${JSON.stringify(scenarios)};
window.__qaLogos=${JSON.stringify(logoCases)};
window.__qaSummaries=${JSON.stringify(Object.fromEntries(scenarios.map(g=>[g.id,summary(g)])))};
window.__qaRequests=[]; window.__qaErrors=[];
addEventListener('error',event=>__qaErrors.push(event.message));
addEventListener('unhandledrejection',event=>__qaErrors.push(String(event.reason)));
const qaNativeFetch=window.fetch.bind(window);
window.fetch=async(input,options)=>{
 const u=new URL(typeof input==='string'?input:input.url,location.href);__qaRequests.push(u.pathname);
 if(u.origin===location.origin && /teams.json$|\\/qa-report$/.test(u.pathname))return qaNativeFetch(input,options);
 if(u.pathname.includes('/game/')){const id=u.pathname.split('/').at(-1);const g=__qaScenarios.find(g=>g.id===id);return Response.json({...__qaSummaries[id],sportsRadarGame:g});}
 if(u.pathname.includes('/team/')){
   const parts=u.pathname.split('/'),i=parts.indexOf('team'),sport=parts[i+1],id=parts[i+2];
   const t=__qaScenarios.filter(g=>g.sport===sport).flatMap(g=>g.teams).find(t=>t[8]===id);
   if(u.pathname.endsWith('/standings'))return Response.json({group:{name:'Fixture division',entries:__qaScenarios.filter(g=>g.sport===sport).flatMap(g=>g.teams).map((t,i)=>({id:t[8],name:t[0],abbreviation:t[1],logo:t[4],record:t[5],rank:i+1}))}});
   return Response.json({team:t?{id:t[8],name:t[0],abbreviation:t[1],logo:t[4],record:t[5]}:{id,name:'Fixture team'},schedule:[],leaders:[]});
 }
 if(u.pathname.endsWith('/feed'))return Response.json({games:__qaScenarios,updatedAt:new Date().toISOString(),modelVersion:window.SportsRadarScore?.MODEL_VERSION});
 return Response.json({});
};
try{Object.defineProperty(navigator,'serviceWorker',{value:{register:()=>Promise.reject(new Error('Disabled in local QA')),getRegistration:async()=>undefined}});}catch{}
if(navigator.serviceWorker)navigator.serviceWorker.register=()=>Promise.reject(new Error('Disabled in local QA'));
`;
const setup=`
window.__qaStart=async function(){
 const p=new URLSearchParams(location.search),view=p.get('view')||'slate',set=Number(p.get('set')||0);
 const now=Date.now();for(const g of __qaScenarios){g.startTime=new Date(now+(g.state==='upcoming'?10800000:-3600000)).toISOString();g.modelVersion=SportsRadarScore.MODEL_VERSION;}
 games=structuredClone(view==='slate'?__qaScenarios.slice(set*4,set*4+4):__qaScenarios);state.source='live';state.updatedAt=new Date().toISOString();state.feedStale=false;state.feedDegraded=false;state.visibleSports=new Set(['NFL','MLB','NHL','NBA','CFB','NCAAB']);state.gameState='all';state.sport='all';
 state.favoriteTeams=[{sport:'NFL',name:'Las Vegas Raiders',id:'13',logo:__qaScenarios[0].teams[0][4]}];
 loadLiveGames=async()=>{};scheduleLiveRefresh=()=>{};clearTimeout(liveRefreshTimer);
 const qaUpdateDataStatus=updateDataStatus;updateDataStatus=function(){qaUpdateDataStatus();const label=document.querySelector('#data-status-label');if(label)label.textContent='UI TEST FIXTURES · not live scores';};
 const qaRender=render;render=function(){qaRender();document.querySelectorAll('img').forEach(img=>img.loading='eager');const label=document.querySelector('#data-status-label');if(label)label.textContent='UI TEST FIXTURES · not live scores';};render();updateDataStatus();
 document.querySelector('#data-status-label').textContent='UI TEST FIXTURES · not live scores';
 if(view==='logos'){
  document.body.classList.add('qa-logo-mode');
  document.querySelector('.app-shell').insertAdjacentHTML('beforeend','<main class="qa-logo-wall">'+__qaLogos.slice(set*6,set*6+6).map(({sport,kind,team})=>'<article class="game-card qa-logo-card"><div><b>'+team[0]+'</b><small>'+sport+' · '+kind+'</small></div><div class="qa-logo-sizes">'+[20,28,32,48].map(size=>'<span><button class="card-team-link" data-qa-size="'+size+'" style="--qa-logo-size:'+size+'px">'+teamLogoWithFallback(team[4],team[1],'team-logo','eager')+'</button><small>'+size+' px</small></span>').join('')+'</div></article>').join('')+'</main>');
  const hideOriginal=document.createElement('style');hideOriginal.textContent='.qa-logo-mode .app-shell>:not(.qa-logo-wall){display:none!important}';document.head.append(hideOriginal);
  const style=document.createElement('style');style.textContent='.qa-logo-wall{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:12px;padding:16px 0}.qa-logo-card{display:flex!important;flex-direction:column;align-items:stretch!important;padding:18px!important;gap:20px!important;background:#191c1f!important;min-height:160px}.qa-logo-card:hover,.qa-logo-card:focus-within{background:var(--surface-2,#222629)!important}.qa-logo-card>div:first-child{display:flex;flex-direction:column;gap:6px;font-size:14px}.qa-logo-card small{font:11px system-ui;color:#bdb7ab}.qa-logo-sizes{display:flex;justify-content:space-around;align-items:center;gap:10px}.qa-logo-sizes>span{display:flex;flex-direction:column;align-items:center;gap:12px}.qa-logo-wall .qa-logo-card .qa-logo-sizes .card-team-link,.qa-logo-wall .qa-logo-card .qa-logo-sizes .card-team-link>img.team-logo{width:var(--qa-logo-size)!important;height:var(--qa-logo-size)!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;flex:0 0 var(--qa-logo-size)!important}';document.head.append(style);
  // Focus/hover are real browser states; these size samples are not real games.
  document.querySelector('.qa-logo-wall').addEventListener('click',event=>{event.stopPropagation();setTimeout(()=>window.__qaMeasure?.(),200);});
 }
 if(view==='detail'){const g=games[set];activeDetailGame=g;activeDetailSummary=__qaSummaries[g.id];activeDetailTab='overview';renderDetailContent(g,activeDetailSummary,false);showGameDetails();}
 if(view==='search'){document.querySelector('#search-button').click();document.querySelector('#search-query').value=p.get('query')||'';renderGlobalSearch();}
 if(view==='team'){
  const g=games[set],t=g.teams[0],route={sport:g.sport,id:t[8]},key=teamDataKey(route);state.teamRoute=route;state.page='team';activeTeamPageKey=key;
  teamPageData.set(key,{team:{id:t[8],name:t[0],logo:t[4],abbreviation:t[1],record:t[5]},schedule:[],leaders:[]});render();
 }
 if(view==='settings')document.querySelector('#profile-button').click();
 document.querySelectorAll('img').forEach(img=>img.loading='eager');
 await document.fonts.ready;
 await Promise.all([...document.images].map(img=>img.complete?null:new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});setTimeout(resolve,12000);})));
 window.__qaMeasure=async()=>{
  const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
  const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';
  const dialog=document.querySelector('dialog[open]'),overlay=document.querySelector('#game-detail-overlay');
  const surface=dialog||(overlay&&!overlay.hidden?overlay:state.page==='team'?document.querySelector('#team-page'):document);
  const logos=[...surface.querySelectorAll('img')].filter(el=>(visible(el)||(el.hidden&&visible(el.parentElement)))&&(/teamlogos|team-logos/i.test(el.src)||el.matches('[data-team-logo],.team-logo'))).map(el=>({src:el.src,loaded:el.complete&&el.naturalWidth>0&&!el.hidden,box:box(el),expectedSize:Number(el.closest('[data-qa-size]')?.dataset.qaSize)||null,filter:getComputedStyle(el).filter,background:getComputedStyle(el).backgroundColor,cardBackground:el.closest('.game-card')?getComputedStyle(el.closest('.game-card')).backgroundColor:null,treatment:el.dataset.logoTreatment||el.dataset.logoContrast||'',natural:[el.naturalWidth,el.naturalHeight]}));
  const clipped=[...surface.querySelectorAll('.team-name-text,.team-record,.team-score,.score-circle,.detail-team-copy,.search-result-copy')].filter(el=>visible(el)&&el.scrollWidth>el.clientWidth+1).map(el=>({class:el.className,text:el.textContent.trim(),box:box(el),scrollWidth:el.scrollWidth}));
  const intersects=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
  const inside=(child,parent)=>child.x>=parent.x-1&&child.y>=parent.y-1&&child.right<=parent.right+1&&child.bottom<=parent.bottom+1;
  const cardLayout=[...surface.querySelectorAll('.game-card')].filter(visible).map(card=>{
   const bounds=box(card),id=card.dataset.id,footer=card.querySelector('.channel-context');
   const primary=[...card.querySelectorAll('.team-row,.excitement,.card-moment,.football-situation,.live-situation')].filter(visible).map(el=>({class:el.className,box:box(el)}));
   const footerBox=footer&&visible(footer)?box(footer):null;
   const footerOverlaps=footerBox?primary.filter(item=>footerBox.y<item.box.bottom-1).map(item=>({kind:'footer-before-content-end',element:item.class,footer:footerBox,content:item.box})):[];
   const badges=[...card.querySelectorAll('.team-power-play')].filter(visible).map(el=>{
    const badge=box(el),name=el.closest('.team-name'),score=el.closest('.team-row')?.querySelector('.team-score'),nameBox=name?box(name):null,scoreBox=score&&visible(score)?box(score):null;
    return {text:el.textContent,box:badge,insideName:!!nameBox&&inside(badge,nameBox),overlapsScore:!!scoreBox&&intersects(badge,scoreBox)};
   });
   const expectedRecords=games.find(g=>String(g.id)===String(id))?.teams.filter(t=>t[5]).length;
   const records=[...card.querySelectorAll('.team-record')].map(el=>({text:el.textContent,visible:!!visible(el),fontSize:parseFloat(getComputedStyle(el).fontSize),box:box(el),insideCard:inside(box(el),bounds)}));
   return {id,box:bounds,footer:footerBox,primary,footerOverlaps,badges,expectedRecords,records};
  });
  const overlaps=cardLayout.flatMap(card=>[...card.footerOverlaps.map(issue=>({id:card.id,...issue})),...card.badges.filter(b=>!b.insideName||b.overlapsScore).map(b=>({id:card.id,kind:'pp-badge-position',...b}))]);
  const recordFailures=cardLayout.flatMap(card=>[...(card.expectedRecords!==undefined&&card.expectedRecords!==card.records.length?[{id:card.id,kind:'record-count',expected:card.expectedRecords,actual:card.records.length}]:[]),...card.records.filter(r=>!r.visible||r.fontSize<11||!r.insideCard).map(r=>({id:card.id,kind:'record-readability',...r}))]);
  const detailTeams=[...surface.querySelectorAll('.detail-team')].filter(visible).map((el,index)=>{
   const bounds=box(el),record=el.querySelector('.detail-team-copy small'),name=el.querySelector('.detail-team-copy strong'),score=el.querySelector(':scope > b'),badge=el.querySelector('.team-power-play');
   const expectedRecord=activeDetailGame?.teams?.[index]?.[5]||null;
   const recordInfo=record?{text:record.textContent,visible:!!visible(record),fontSize:parseFloat(getComputedStyle(record).fontSize),box:box(record),insideTeam:inside(box(record),bounds)}:null;
   const badgeInfo=badge&&visible(badge)?{text:badge.textContent,box:box(badge),insideTeam:inside(box(badge),bounds),overlapsRecord:!!record&&visible(record)&&intersects(box(badge),box(record)),overlapsName:!!name&&visible(name)&&intersects(box(badge),box(name)),overlapsScore:!!score&&visible(score)&&intersects(box(badge),box(score))}:null;
   if(expectedRecord&&(!recordInfo||!recordInfo.visible||recordInfo.fontSize<11||!recordInfo.insideTeam))recordFailures.push({id:activeDetailGame?.id,index,kind:'detail-record-readability',expectedRecord,record:recordInfo});
   if(badgeInfo&&(!badgeInfo.insideTeam||badgeInfo.overlapsRecord||badgeInfo.overlapsName||badgeInfo.overlapsScore))overlaps.push({id:activeDetailGame?.id,index,kind:'detail-pp-badge-position',...badgeInfo});
   return {index,box:bounds,expectedRecord,record:recordInfo,badge:badgeInfo};
  });
  const searchRows=[...surface.querySelectorAll('.search-result')].filter(visible).map((el,index)=>{
   const leading=el.querySelector('.search-result-leading'),copy=el.querySelector('.search-result-copy'),trailing=el.querySelector('.search-result-rating,.search-result-arrow');
   const bounds=box(el),leadingBox=leading&&visible(leading)?box(leading):null,copyBox=copy&&visible(copy)?box(copy):null,trailingBox=trailing&&visible(trailing)?box(trailing):null;
   const logoCopyOverlap=!!leadingBox&&!!copyBox&&intersects(leadingBox,copyBox),copyTrailingOverlap=!!copyBox&&!!trailingBox&&intersects(copyBox,trailingBox);
   const outOfRow=[['logos',leadingBox],['copy',copyBox],['trailing',trailingBox]].filter(([,b])=>b&&!inside(b,bounds)).map(([name,b])=>({name,box:b}));
   const item={index,text:el.textContent.trim(),box:bounds,leading:leadingBox,copy:copyBox,trailing:trailingBox,logoCopyOverlap,copyTrailingOverlap,outOfRow};
   if(logoCopyOverlap||copyTrailingOverlap||outOfRow.length)overlaps.push({kind:'search-row-layout',...item});
   return item;
  });
  const headerImage=surface.querySelector('.brand-logo');
  const headerLogo=headerImage&&visible(headerImage)?{loaded:headerImage.complete&&headerImage.naturalWidth>0,box:box(headerImage),objectFit:getComputedStyle(headerImage).objectFit,natural:[headerImage.naturalWidth,headerImage.naturalHeight]}:null;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Legacy reduced-motion CSS retains 1-microsecond event-sentinel transitions.
  // Accept at most 0.01ms as effectively zero, while preserving raw durations.
  const reducedMotionEvidence={actualPreference:reducedMotion,maxAcceptedDurationSeconds:.00001,testedUpdateClasses:false,elements:[],failures:[]};
  if(reducedMotion){
   const motionCards=[...surface.querySelectorAll('.game-card')].filter(visible),previousClasses=motionCards.map(el=>el.className);
   motionCards.forEach(el=>el.classList.add('score-just-changed','rating-just-changed'));
   reducedMotionEvidence.testedUpdateClasses=motionCards.length>0;
   const selector='.game-card,.detail-overlay,.detail-tab,.detail-tab-panel,.score-circle,.game-card.score-just-changed .team-score,.game-card.rating-just-changed .excitement,.game-card.rating-just-changed .score-trend';
   const targets=[...surface.querySelectorAll(selector)];if(surface.matches?.(selector))targets.push(surface);
   reducedMotionEvidence.elements=[...new Set(targets)].filter(visible).map(el=>{const s=getComputedStyle(el);return {className:el.className,animationName:s.animationName,animationDuration:s.animationDuration,transitionProperty:s.transitionProperty,transitionDuration:s.transitionDuration}});
   const motionSeconds=value=>parseFloat(value)*(value.trim().endsWith('ms')?.001:1);
   reducedMotionEvidence.failures=reducedMotionEvidence.elements.filter(el=>(el.animationName.split(',').some(name=>name.trim()!=='none')&&el.animationDuration.split(',').some(time=>motionSeconds(time)>reducedMotionEvidence.maxAcceptedDurationSeconds))||el.transitionDuration.split(',').some(time=>motionSeconds(time)>reducedMotionEvidence.maxAcceptedDurationSeconds));
   motionCards.forEach((el,i)=>el.className=previousClasses[i]);
  }
  const report={capturedAt:new Date().toISOString(),source:window.__qaSource,surface:surface.id||'document',phase:p.get('phase'),width:innerWidth,view,set,overflow:document.documentElement.scrollWidth>innerWidth,logos,logoSizeMismatches:logos.filter(l=>l.expectedSize&&(Math.abs(l.box.width-l.expectedSize)>.1||Math.abs(l.box.height-l.expectedSize)>.1)),clipped,overlaps,recordFailures,cardLayout,detailTeams,searchRows,headerLogo,reducedMotion,reducedMotionEvidence,focusedLogo:document.activeElement?.closest('[data-qa-size]')?.dataset.qaSize||null,errors:__qaErrors,requests:__qaRequests,cards:cardLayout.length,ppBadges:[...surface.querySelectorAll('.power-play-badge,.team-power-play,.pp-badge')].filter(visible).length};
  parent.postMessage({qaReport:report},location.origin);await qaNativeFetch('/qa-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});return report;
 };
 setTimeout(__qaMeasure,350);document.addEventListener('click',()=>setTimeout(__qaMeasure,200));
};
window.__qaStart().catch(e=>{__qaErrors.push(String(e.stack||e));parent.postMessage({qaError:String(e.stack||e)},location.origin)});
`;

function dashboard(url){
 const params=url.searchParams,width=widths.includes(Number(params.get('width')))?Number(params.get('width')):390,phase=params.get('phase')==='before'?'before':'after',view=params.get('view')||'slate',set=Math.max(0,Number(params.get('set')||0));
 const href=(changes)=>{const p=new URLSearchParams({width:String(width),phase,view,set:String(set),...changes});return '/qa?'+p};
 return `<!doctype html><html><head><meta charset="utf-8"><title>SlateMeter local visual review</title><style>*{box-sizing:border-box}body{margin:0;background:#383a3b;color:#f0e8d4;font:13px system-ui}header{position:sticky;top:0;z-index:5;background:#121416;border-bottom:1px solid #69645b;padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}header a,button{color:#f0e8d4;border:1px solid #69645b;background:#25292c;padding:6px 9px;border-radius:3px;text-decoration:none;cursor:pointer}header a.active{background:#f0e8d4;color:#191c1f}header strong{margin-right:8px}#status{padding:8px 16px;background:#222629;white-space:pre-wrap;min-height:36px}main{width:max-content;max-width:none;margin:12px auto}iframe{border:0;background:#191c1f;display:block;width:${width}px;height:1100px}footer{padding:8px 16px}label{padding:4px}</style></head><body><header><strong>LOCAL QA · ${phase.toUpperCase()} · ${width}px</strong>${widths.map(n=>`<a class="${n===width?'active':''}" href="${href({width:n})}">${n}</a>`).join('')}${['before','after'].map(v=>`<a class="${v===phase?'active':''}" href="${href({phase:v})}">${v}</a>`).join('')}${['slate','logos','detail','team','search','settings'].map(v=>`<a class="${v===view?'active':''}" href="${href({view:v,set:0})}">${v}</a>`).join('')}<a href="${href({set:Math.max(0,set-1)})}">Previous set</a><a href="${href({set:set+1})}">Next set</a><button id="measure">Measure</button></header><div id="status">Loading fixtures and authentic logo images…</div><main><iframe id="preview" title="${width}px ${view} ${phase}" src="/${phase}/?${new URLSearchParams({phase,view,set:String(set),query:params.get('query')||''})}"></iframe></main><footer>Synthetic UI scenarios, authentic existing logos. No production backend calls. Measurements supplement human screenshot inspection.</footer><script>addEventListener('message',e=>{if(e.origin!==location.origin)return;if(e.data.qaError)document.querySelector('#status').textContent=e.data.qaError;const r=e.data.qaReport;if(!r)return;document.querySelector('#status').textContent=r.phase+' · '+r.width+'px · '+r.view+' set '+r.set+' | '+r.logos.filter(x=>x.loaded).length+'/'+r.logos.length+' rendered logos loaded | page overflow: '+r.overflow+' | clipped fields: '+r.clipped.length+' | overlaps: '+r.overlaps.length+' | record failures: '+r.recordFailures.length+' | errors: '+r.errors.join('; ');});document.querySelector('#measure').onclick=()=>document.querySelector('iframe').contentWindow.__qaMeasure?.();</script></body></html>`;
}
function contactSheet(url){
 const p=url.searchParams,view=p.get('view')||'logos',set=Number(p.get('set')||0),phase=p.get('phase')==='before'?'before':'after';
 const width=widths.includes(Number(p.get('width')))?Number(p.get('width')):320;
 const compare=p.get('layout')!=='phones';
 const frames=compare?[['before',width],['after',width]]:[[phase,430],[phase,390],[phase,375],[phase,320]];
 return `<!doctype html><html><head><meta charset="utf-8"><title>SlateMeter contact sheet · local fixtures</title><style>*{box-sizing:border-box}body{margin:0;background:#383a3b;color:#f0e8d4;font:12px system-ui}header{padding:12px;background:#121416;position:sticky;top:0;z-index:2;display:flex;gap:16px}a{color:#f0e8d4}main{display:flex;gap:10px;width:max-content;margin:10px auto}section>div{height:54px;background:#222629;padding:8px;max-width:100%;white-space:normal}iframe{display:block;border:0;background:#191c1f;height:1100px}b{display:block;font-size:14px;margin-bottom:4px}</style></head><body><header><strong>LOCAL QA · ${esc(view)} set ${set} · synthetic states, authentic logos</strong><a href="/qa-contact?layout=${compare?'compare':'phones'}&view=${view}&set=${Math.max(0,set-1)}&width=${width}&phase=${phase}">Previous set</a><a href="/qa-contact?layout=${compare?'compare':'phones'}&view=${view}&set=${set+1}&width=${width}&phase=${phase}">Next set</a><a href="/qa?width=${width}&phase=${phase}&view=${view}&set=${set}">Single viewport</a></header><main>${frames.map(([stage,n])=>`<section style="width:${n}px"><div id="status-${stage}-${n}"><b>${stage.toUpperCase()} · ${n}px</b>Waiting for logo and layout measurements…</div><iframe width="${n}" title="${stage} ${n}px" src="/${stage}/?phase=${stage}&view=${view}&set=${set}"></iframe></section>`).join('')}</main><script>addEventListener('message',e=>{if(e.origin!==location.origin)return;const r=e.data.qaReport;if(!r)return;const el=document.querySelector('#status-'+r.phase+'-'+r.width);if(el)el.innerHTML='<b>'+r.phase.toUpperCase()+' · '+r.width+'px</b>'+r.logos.filter(l=>l.loaded).length+'/'+r.logos.length+' logos · overflow '+r.overflow+' · clipped '+r.clipped.length+' · overlaps '+r.overlaps.length+' · errors '+r.errors.length;});</script></body></html>`;
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf'};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/qa'||url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(dashboard(url));return;}
 if(url.pathname==='/qa-contact'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(contactSheet(url));return;}
 if(url.pathname==='/qa-report'&&req.method==='POST'){
  let body='';for await(const chunk of req){body+=chunk;if(body.length>250000){res.writeHead(413).end();return;}}
  try{const report=JSON.parse(body);const name=['qa',report.phase,report.width,report.view,report.set].map(v=>String(v).replace(/[^a-z0-9-]/gi,'')).join('-'),json=JSON.stringify(report,null,2)+'\n';fs.mkdirSync(path.join(output,'qa-history'),{recursive:true});fs.writeFileSync(path.join(output,'qa-history',name+'-'+Date.now()+'.json'),json);fs.writeFileSync(path.join(output,name+'.json'),json);res.end('ok');}catch{res.writeHead(400).end();}return;
 }
 const match=/^\/(before|after)\/(.*)$/.exec(url.pathname);if(!match){res.writeHead(404).end();return;}
 const phase=match[1],asset=decodeURIComponent(match[2]||'index.html');
 if(asset==='sw.js'){res.writeHead(404).end();return;}
 const base=path.join(root,phase==='before'?'work/ui-overhaul-before':'dist'),file=path.resolve(base,asset);
 if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
 try{
  let body=fs.readFileSync(file);const ext=path.extname(file);res.setHeader('Content-Type',mime[ext]||'application/octet-stream');
  if(asset==='index.html'){
   const source={baseline:'5b7f797c879d36826d08b2ea31a6fecd18ef092c',files:Object.fromEntries(['app.js','styles.css','mobile-readability.css','ui-overhaul.css','team-logos.js','team-logos.css','scoring-runtime.js'].map(name=>{const f=path.join(base,name);return [name,fs.existsSync(f)?createHash('sha256').update(fs.readFileSync(f)).digest('hex'):null]}))};
   body=body.toString().replace('<head>','<head><script>window.__qaSource='+JSON.stringify(source)+';'+bootstrap+'</script>');
  }
  if(asset==='app.js'){
   body=body.toString().replace(/\brender\(\);\r?\nloadLiveGames\(\);/,'render();\n// Feed startup disabled by local QA server.').replaceAll('loading="lazy"','loading="eager"');
   body+='\n'+setup;
  }
  res.end(body);
 }catch(error){res.writeHead(404).end('Asset unavailable: '+esc(asset));}
});
const port=Number(process.env.UI_QA_PORT||4174);
server.listen(port,'127.0.0.1',()=>console.log(`Local fixture review: http://127.0.0.1:${port}/qa?width=390&phase=after&view=slate&set=0`));

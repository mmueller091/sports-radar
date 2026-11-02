// Public facts from the existing provider ledger. No rating weights live here.
const {clockSeconds}=require('./shared/time.js');
const regulation={NFL:4,CFB:4,NBA:4,NCAAB:2,NHL:3};
function scoringLedger(game,summary){
 const source=summary?.scoringPlays?.length?summary.scoringPlays:(summary?.plays||[]).filter(p=>p.scoringPlay);
 const plays=[...new Map((source||[]).map((p,i)=>[String(p.id??`row:${i}`),p])).values()];
 plays.sort((a,b)=>Number(a.period?.number)-Number(b.period?.number)||
  (game.sport==='NHL'?1:-1)*((clockSeconds({displayClock:a.clock?.displayValue})??0)-(clockSeconds({displayClock:b.clock?.displayValue})??0)));
 const totals={away:Number(game.teams?.[0]?.[2]),home:Number(game.teams?.[1]?.[2])};
 let home=0,away=0;
 for(const p of plays){const h=Number(p.homeScore),a=Number(p.awayScore);
  if(p.homeScore==null||p.awayScore==null||!Number.isFinite(h)||!Number.isFinite(a)||h<home||a<away||h>totals.home||a>totals.away)return null;
  home=h;away=a;
 }
 return plays.length?{plays,complete:home===totals.home&&away===totals.away,totals}:null;
}
function decisiveScoringPlay(game,summary){
 if(game.state!=='completed'||!regulation[game.sport])return null;
 const ledger=scoringLedger(game,summary);if(!ledger?.complete)return null;
 const winner=Math.sign(ledger.totals.home-ledger.totals.away);if(!winner)return null;
 const limit={NFL:8,CFB:8,NBA:5,NCAAB:5,NHL:1}[game.sport];
 if(Math.abs(ledger.totals.home-ledger.totals.away)>limit)return null;
 let previous=0,candidate=null;
 for(const p of ledger.plays){const margin=(Number(p.homeScore)-Number(p.awayScore))*winner;
  if(margin<=0)candidate=null;
  if(previous<=0&&margin>0){
   const period=Number(p.period?.number),seconds=clockSeconds({displayClock:p.clock?.displayValue});
   const late=period>regulation[game.sport]||period===regulation[game.sport]&&seconds!==null&&
    (game.sport==='NHL'?seconds>=900:seconds<=({NFL:180,CFB:180,NBA:120,NCAAB:120}[game.sport]));
   if(late)candidate=p;
  }
  previous=margin;
 }
 return candidate;
}
function completedGameFacts(game,summary){
 if(game.state!=='completed'||!['NFL','CFB'].includes(game.sport))return null;
 const ledger=scoringLedger(game,summary);if(!ledger?.complete)return null;
 const winner=ledger.totals.away>ledger.totals.home?'away':ledger.totals.home>ledger.totals.away?'home':null;
 if(!winner)return null;
 const other=winner==='away'?'home':'away',team=game.teams[winner==='away'?0:1];
 const deficit=Math.max(0,...ledger.plays.map(p=>Number(p[other+'Score'])-Number(p[winner+'Score'])));
 const facts={comeback:deficit>=7?{team:team[0],deficit}:null};
 const article=summary.article;
 // The recap must belong to this event; roster names constrain extraction.
 const text=String(article?.story||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
 const passers=(summary.boxscore?.players||[]).filter(b=>String(b.team?.id)===String(team[8]))
  .flatMap(b=>(b.statistics||[]).filter(s=>s.name==='passing').flatMap(s=>(s.athletes||[]).map(a=>a.athlete?.displayName).filter(Boolean)));
 if(String(article?.gameId)===String(game.id)&&passers.length>=2){
  for(const incoming of passers)for(const outgoing of passers){if(incoming===outgoing)continue;
   const short=n=>n.replace(/ (?:II|III|Jr\.)$/,'').split(' ').at(-1).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   if(new RegExp(`\\b${short(incoming)}\\b[^.!?]{0,70}\\breplaced\\b[^.!?]{0,50}\\b${short(outgoing)}\\b`,'i').test(text))
    facts.quarterbackChange={incoming,outgoing,sourceUrl:article.links?.web?.href};
  }
 }
 const deciding=decisiveScoringPlay(game,summary);
 if(deciding&&Number(deciding.period?.number)>4&&/field goal/i.test(deciding.text||'')){
  const kicker=String(deciding.text).match(/^(.+?)\s+\d+\s+Yd\s+Field Goal/i)?.[1];
  const missed=ledger.plays.find(p=>Number(p.period?.number)===4&&clockSeconds({displayClock:p.clock?.displayValue})<=10&&Number(p.homeScore)===Number(p.awayScore)&&/PAT Failed|extra point.*(?:miss|fail)/i.test(p.text||'')&&kicker&&p.text.includes(kicker));
  if(missed)facts.redemption={kicker,clock:missed.clock.displayValue};
 }
 return facts;
}
module.exports={scoringLedger,decisiveScoringPlay,completedGameFacts};

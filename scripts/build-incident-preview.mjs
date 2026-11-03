import fs from 'node:fs';
const fixture={games:[['401909907','cavaliers-thunder'],['401909905','clippers-warriors']].map(([id,name])=>{
  const raw=JSON.parse(fs.readFileSync(`work/${name}-production.json`));
  return {id,game:raw.sportsRadarGame,snapshots:raw.sportsRadarHistory.snapshots,
    scoringPlays:raw.plays.filter(p=>p.scoringPlay)};
})};
const payload=JSON.stringify(fixture).replaceAll('<','\\u003c');
fs.mkdirSync('work',{recursive:true});
fs.writeFileSync('work/incident-preview.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SlateMeter incident timeline QA</title><link rel="stylesheet" href="../styles.css"><style>body{background:var(--surface,#20211e);color:var(--ink,#f4ead5);margin:0;padding:16px}.preview{max-width:940px;margin:auto}.preview h1{font:700 26px sans-serif}.preview h2{font:600 18px sans-serif;margin:22px 0 6px}.timeline-section{padding:12px;background:var(--surface-2,#292a26);border-radius:8px}</style><main class="preview"><h1>NBA transition timeline replay</h1><div id="games"></div></main><script src="../game-center.js"></script><script>const fixture=${payload};document.querySelector('#games').innerHTML=fixture.games.map(item=>{const detail={sportsRadarHistory:{snapshots:item.snapshots},scoringPlays:item.scoringPlays};return '<h2>'+item.id+' · '+item.game.teams.map(t=>t[0]).join(' at ')+'</h2>'+SportsRadarGameCenter.timeline(item.game,detail)}).join('');document.addEventListener('click',event=>{const button=event.target.closest('[data-timeline-range]');if(!button)return;const section=button.closest('.timeline-section');section.querySelectorAll('[data-timeline-range]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));section.querySelectorAll('[data-timeline-view]').forEach(v=>v.hidden=v.dataset.timelineView!==button.dataset.timelineRange)});</script></html>`);
console.log('Wrote work/incident-preview.html');

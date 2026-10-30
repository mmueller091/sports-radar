// Selected and baseline-scored before the CFB edit; regression observations,
// not additional human labels. Frozen archives are never modified.
export const cfbAdditional=[
  ['sustained-close','401866442','401866442642',70],
  ['defensive','401871091','401871091293',46],
  ['recovery','401856724','401856724574',56],
  ['false-closeness','401866443','401866443723',61],
  ['garbage-time','401856720','401856720774',1],
  ['quarter-boundary','401856719','401856719188',48],
  ['quarter-boundary','401856719','401856719192',49],
  ['quarter-boundary','401856719','401856719411',61],
  ['quarter-boundary','401856719','401856719418',62],
  ['quarter-boundary','401856719','401856719594',59],
  ['quarter-boundary','401856719','401856719598',59]
];

// All changes below are hypothetical, including verified=true. It means the
// supplied counterfactual satisfies the existing schema, not an archive claim.
// Current score, clock, possession, WP, plays and history are left untouched.
export function cfbContextVariants(input) {
  return ['unknown','weak-limited','strong-teams','credible-upset','verified-stakes'].map(label=>{
    const v=structuredClone(input),c=v.competition;
    v.event.name='Hypothetical Away at Home';v.event.shortName='Hypothetical matchup';
    v.event.season={...v.event.season,type:2};c.season=v.event.season;
    c.notes=[];delete c.series;
    for(const obj of [v.event,c])for(const key of ['sportsRadarContextFactors','sportsRadarContext','contextFactors'])delete obj[key];
    delete c.odds;delete v.summary.pickcenter;
    for(const t of c.competitors) {
      delete t.curatedRank;delete t.team.rank;delete t.records;delete t.team.records;
      if(label!=='unknown')t.records=[{type:'total',summary:label==='strong-teams'?'6-1':'2-5'}];
      if(label==='strong-teams')t.curatedRank={current:t.homeAway==='home'?8:12};
      if(label==='credible-upset'&&t.homeAway==='away')t.curatedRank={current:8};
    }
    if(['strong-teams','credible-upset'].includes(label)) {
      const spread=label==='credible-upset'?14:3;
      c.odds=[{spread,homeTeamOdds:{underdog:true},awayTeamOdds:{favorite:true},
        pointSpread:{home:{close:{line:`+${spread}`}},away:{close:{line:`-${spread}`}}}}];
    }
    if(label==='verified-stakes')v.event.sportsRadarContextFactors=[{type:'playoff_race',verified:true,confidence:1}];
    v.event.competitions=[c];v.summary.header={...v.summary.header,season:v.event.season,competitions:[c]};
    return {...v,id:`hypothetical-R18-${label}`,label,hypothetical:true};
  });
}

// Adapt frozen historical engines ONLY for the intentional global pregame rule.
// Their sport coefficients, factor values, live bonuses and history stay frozen.
// This avoids replacing golden files merely because a ceiling changed.
function capPregameOracle(source) {
  const start=source.indexOf('  function pregameRating(');
  const end=source.indexOf('\n  function ',start+1);
  const segment=source.slice(start,end);
  const capped=segment.replace(/score:\s*clampScore\(\s*factors\.reduce\([\s\S]*?\)\s*\),\s*factors,/,
    'score:Math.min(90,clampScore(factors.reduce((sum,item)=>sum+item.points,0))),\n      rawPregameScore:factors.reduce((sum,item)=>sum+item.points,0),\n      factors,');
  if(capped===segment) throw new Error('Frozen pregame oracle shape changed');
  source=source.slice(0,start)+capped+source.slice(end);
  return source.replace(/openingScore:\s*opening\.score,/g,'openingScore:opening.score,rawPregameScore:opening.rawPregameScore,');
}
module.exports={capPregameOracle};

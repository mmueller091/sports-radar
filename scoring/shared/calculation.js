(function(root){
// Presentation provenance only. This module never supplies a scoring input.
// Weakly held ledgers do not alter serialized games or snapshot persistence.
const ledgers = new WeakMap();
const clamps = new Map();
function recordClamp(input,rounded,capped,value) {
  const key = `${input}:${value}`;
  clamps.delete(key);
  clamps.set(key,{input,rounded,capped,value});
  if(clamps.size>256)clamps.delete(clamps.keys().next().value);
}
function decimal(value) {
  const [mantissa,exponent='0']=String(value).toLowerCase().split('e');
  const negative=mantissa.startsWith('-'),unsigned=mantissa.replace(/^[+-]/,'');
  const [whole,fraction='']=unsigned.split('.');
  let digits=BigInt((negative?'-':'')+(whole+fraction)),scale=fraction.length-Number(exponent);
  if(scale<0){digits*=10n**BigInt(-scale);scale=0;}
  return {digits,scale};
}
function sum(values) {
  const parts=values.map(decimal),scale=Math.max(0,...parts.map(p=>p.scale));
  let digits=parts.reduce((n,p)=>n+p.digits*10n**BigInt(scale-p.scale),0n);
  const negative=digits<0n;if(negative)digits=-digits;
  let text=digits.toString().padStart(scale+1,'0');
  if(scale)text=text.slice(0,-scale)+'.'+text.slice(-scale);
  text=text.replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
  return (negative&&digits?'-':'')+text;
}
function difference(a,b){return sum([a,String(b).startsWith('-')?String(b).slice(1):'-'+b]);}
function append(rows,label,points,kind='factor') {
  if(!Number.isFinite(Number(points)))return null;
  if(Number(points)!==0)rows.push({label,points:String(points),kind});
  return rows;
}
function reconcileArithmetic(rows,actual,label='Floating-point summation') {
  const displayed=sum(rows.map(r=>r.points));
  if(displayed===String(actual))return true;
  // Only expose a measured machine-arithmetic difference, never an unknown remainder.
  if(Math.abs(Number(displayed)-actual)>1e-10)return false;
  append(rows,label,difference(actual,displayed),'arithmetic');return true;
}
function normalized(rows,input,value,label='Rating') {
  const op=clamps.get(`${input}:${value}`);
  if(!op || !reconcileArithmetic(rows,input))return null;
  append(rows,`${label} rounding`,difference(op.rounded,input),'rounding');
  append(rows,`${label} ceiling`,difference(op.capped,op.rounded),'cap');
  append(rows,`${label} floor`,difference(op.value,op.capped),'floor');
  return rows;
}
function factorsRows(factors) {
  if(!Array.isArray(factors)||!factors.length||factors.some(f=>!Number.isFinite(f.points)))return null;
  return factors.filter(f=>f.points!==0).map(f=>({label:f.label,points:String(f.points),kind:'factor'}));
}
function fromFactors(factors,value,label='Rating',ceiling=null) {
  let rows=factorsRows(factors);if(!rows)return null;
  const input=factors.reduce((n,f)=>n+f.points,0);
  const clamped=ceiling===null?value:[...clamps.values()].reverse().find(op=>op.input===input)?.value;
  rows=normalized(rows,input,clamped,label);if(!rows)return null;
  if(ceiling!==null){if(value!==Math.min(ceiling,clamped))return null;append(rows,`${label} ceiling (${ceiling})`,difference(value,clamped),'cap');}
  return {rows,total:value};
}
function set(target,ledger) {if(target&&ledger&&sum(ledger.rows.map(r=>r.points))===String(ledger.total))ledgers.set(target,ledger);else if(target)ledgers.delete(target);return target;}
function get(target){const value=ledgers.get(target);return value&&value.total===(target.score??target.bonus)?value:null;}
function add(game,factors,points,next,label='Rating') {
  const prior=get(game),added=factorsRows(factors);if(!prior||!added)return null;
  if(!reconcileArithmetic(added,points))return null;
  const rows=[...prior.rows,...added],input=game.score+points;
  return normalized(rows,input,next,label)?{rows,total:next}:null;
}
function exactStored(game) {
  // A stored, fully additive calculation can be displayed without replaying it.
  // Missing normalization provenance must stay unavailable, even at a boundary.
  if(game.scoringPartial||game.summaryLifecycleRejected||game.scoringHistoryRejected||game.staleEnrichment)return null;
  const rows=factorsRows(game.factors);
  if(!rows || game.live?.bonus || sum(rows.map(r=>r.points))!==String(game.score))return null;
  return {rows,total:game.score};
}
function identity(game){return JSON.stringify([game.sport,String(game.id),game.state,game.modelVersion,game.score,game.baseScore,game.factors?.map(f=>[f.label,f.points]),game.live?.bonus,game.momentumPoints,game.trajectoryScoring?.adjustment,game.teams?.map(t=>t[2]),game.liveRawStatus?.period,game.liveRawStatus?.displayClock]);}
function validFor(game,value){return Boolean(value)&&value.identity===identity(game)&&value.total===game.score&&value.modelVersion===game.modelVersion&&value.state===game.state;}
function publicCalculation(game,previous=null){const value=get(game)||(validFor(game,previous)?previous:null)||exactStored(game);return value?{...value,modelVersion:game.modelVersion,state:game.state,identity:identity(game)}:validFor(game,previous)?previous:null;}
function liveResult(result) {
  const base=fromFactors(result.factors,result.baseScore,'Game state'),live=get(result.live);
  const history=factorsRows(result.historyOwnership?.eventFactors || []) || [];
  if(!base||!live||!reconcileArithmetic(history,result.momentumPoints))return null;
  const rows=[...base.rows,...live.rows,...history];
  append(rows,'History relevance and trajectory',result.trajectoryScoring.adjustment);
  const input=result.baseScore+result.live.bonus+result.momentumPoints+result.trajectoryScoring.adjustment;
  return normalized(rows,input,result.score)?{rows,total:result.score}:null;
}
const api={recordClamp,fromFactors,set,get,add,append,normalized,factorsRows,reconcileArithmetic,publicCalculation,sum,difference,liveResult,identity,validFor};

if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.SportsRadarCalculation=api;
})(globalThis);

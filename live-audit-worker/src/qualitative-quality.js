import {auditGameAllowed} from './scope.js';
// Independent semantic audit over the existing canonical feed. No provider,
// inference, scoring or database calls. Certainty is explicit per finding.
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function auditQualitativeContext(game) {
  if(!auditGameAllowed(game)) return {checks:0,findings:[]};
  const findings=[],stories=game.qualitativeContexts||[],factors=game.factors||[],seen=new Set();
  const add=(reasonCode,detail,observed,definite=false)=>findings.push({reasonCode,detail,observed,
    expected:'Verified facts require separate causal significance; one event earns at most one adjustment',
    classification:definite?'definite_scoring_defect':'human_review',deterministic:definite,
    severity:definite?'high':'medium',confidence:definite?1:.7,failureLayer:'qualitative context'});
  for(const f of factors.filter(f=>f.contextType)) {
    const story=stories.find(s=>s.type===f.contextType&&(s.text===f.contextText||s.sourceUrl===f.sourceUrl))||{};
    const text=f.contextText||story.text||'',e=story.evidence||f.sourceEvidence||{};
    if(f.points>0) {
      if(f.contextType==='confirmed_key_starters')add('GENERIC_STARTER_BONUS','A routine starter confirmation received positive points',{factor:f},true);
      if(/ruled out|will miss|emergency|forced replacement|in place of|replaces? (?:an? )?injured|losing streak|poor form/i.test(text))add('ADVERSE_POSITIVE_CONTEXT','Positive context includes an absence, forced replacement or poor form',{factor:f});
      if(story.scoringEligible===false)add('NEUTRAL_CONTEXT_BONUS','Explicitly scoring-neutral context received positive points',{factor:f},true);
      if(/star|debut|trade|ace/.test(f.contextType)&&!(/\b(?:star|superstar|all[- ]star|all[- ]pro|all[- ]american|MVP|Cy Young|Heisman|leading scorer|starting quarterback)\b/i.test(text)||story.injuryEvidence?.playerSignificance?.verified))add('UNSUPPORTED_PLAYER_SIGNIFICANCE','Player significance lacks retained support',{factor:f});
      const personnel=/return|debut|trade|starters/.test(f.contextType);
      const key=e.subject&&e.owner?[game.sport,game.id,e.owner,e.subject,personnel?'personnel':f.contextType].join(':'):story.eventKey;
      if(key&&seen.has(key))add('DUPLICATE_EVENT_AWARD','More than one positive award refers to the same underlying event',{eventKey:key,factor:f},true);
      if(key)seen.add(key);
      if(!story.registryVersion&&!e.documents?.length&&!story.injuryEvidence)add('POSITIVE_CONTEXT_EVIDENCE_REVIEW','Positive qualitative points lack retained causal source evidence',{factor:f});
    }
    if(f.points<0&&/absence|stars_out/.test(f.contextType)&&(game.line?.spread||game.line?.moneyline)){
      const q=game.pregameMarketQuote?.raw,marketAt=Date.parse(q?.lastUpdated||q?.lastModified||''),reportedAt=Date.parse(story.injuryEvidence?.reportedAt||'');
      add('INJURY_MARKET_OVERLAP','An absence penalty overlaps a displayed betting market; inspect quote and announcement timing',{factor:f,line:game.line,marketAt:Number.isFinite(marketAt)?marketAt:null,reportedAt:Number.isFinite(reportedAt)?reportedAt:null},Number.isFinite(marketAt)&&Number.isFinite(reportedAt)&&marketAt>=reportedAt);
    }
  }
  if(game.state==='upcoming')for(const story of stories){
    if(!story.verified||!['authoritative-primary','independently-corroborated'].includes(story.verification))continue;
    const publicCopy=String(game.pregameContextSummary||game.publicExplanation||'');
    const expected=story.publicText||story.evidence?.subject;
    if(expected&&!norm(publicCopy).includes(norm(expected)))add('VERIFIED_CONTEXT_NOT_EXPLAINED','Significant verified context is absent from the public explanation payload',{eventKey:story.eventKey,sourceUrl:story.sourceUrl});
    if(story.scoringEligible===false&&story.publicText&&/more excit|adds? (?:excitement|appeal|intrigue)|reason to watch|worth watching/i.test(story.publicText))add('NEUTRAL_CONTEXT_POSITIVE_COPY','Public copy presents a neutral fact as positive excitement',{text:story.publicText},true);
  }
  return {checks:7,findings};
}

// Audit interpretation only. The original row and canonical evidence remain unchanged.
export const unavailableNumber=value=>value===null||value===undefined||typeof value==='string'&&value.trim()==='';
export const auditNumber=value=>unavailableNumber(value)||!['number','string'].includes(typeof value)||!Number.isFinite(Number(value))?null:Number(value);

export function normalizeAuditRating(rawRating,state){
  const canonicalPresent=Boolean(state&&Object.hasOwn(state,'score'));
  const canonicalUnavailable=canonicalPresent&&unavailableNumber(state.score);
  const numeric=auditNumber(rawRating),legacyNullCoercion=canonicalUnavailable&&numeric===0;
  const rating=canonicalUnavailable?null:numeric;
  const malformed=!canonicalUnavailable&&!unavailableNumber(rawRating)&&
    (!Number.isInteger(numeric)||numeric<1||numeric>99);
  return {rating,rawRating:rawRating??null,canonicalRating:canonicalPresent?state.score??null:null,
    canonicalPresent,unavailable:canonicalUnavailable||unavailableNumber(rawRating),malformed,
    legacyNullCoercion,classification:legacyNullCoercion?'audit_collection_error':
      canonicalUnavailable?'unavailable_rating':malformed?'invalid_rating':'retained_rating',
    reason:legacyNullCoercion?'Legacy audit converted an unavailable canonical rating to zero; original evidence is retained':
      canonicalUnavailable?'Canonical rating was unavailable, not a numeric zero':null};
}

// Local SQL preparation only. This module has no database or network executor.
import {OPEN_NEWS_KEY} from '../src/open-news-discovery.js';
import {EVIDENCE_VERSION,SOURCE_LIMITS} from '../src/source-evidence.js';

const literal=value=>"'"+String(value).replaceAll("'","''")+"'";

export function buildEvidenceCachePreload(options){
  if(!options||typeof options!=='object'||Array.isArray(options)||
    Object.keys(options).some(key=>!['key','documents','updatedAt'].includes(key))||options.key!==OPEN_NEWS_KEY)
    throw new Error('Preload must target only '+OPEN_NEWS_KEY+'; unexpected identifiers or options are not allowed');
  const {documents,updatedAt}=options;
  if(!Number.isSafeInteger(updatedAt)||updatedAt<=0)throw new Error('Preload requires an explicit positive timestamp');
  if(!Array.isArray(documents)||!documents.length||documents.length>SOURCE_LIMITS.documents)
    throw new Error('Preload requires a bounded, nonempty evidence-document array');
  const seen=new Set();
  for(const doc of documents){
    if(!doc||typeof doc!=='object'||Array.isArray(doc)||doc.version!==EVIDENCE_VERSION||
      typeof doc.title!=='string'||!doc.title||doc.title.length>260||
      typeof doc.body!=='string'||!doc.body||doc.body.length>SOURCE_LIMITS.body||
      !Number.isFinite(doc.published)||!Number.isFinite(doc.retrievedAt)||
      doc.published>doc.retrievedAt+60000||doc.retrievedAt>updatedAt||
      !Array.isArray(doc.authors)||doc.authors.length>8||doc.authors.some(a=>typeof a!=='string'||a.length>120)||
      typeof doc.section!=='string'||doc.section.length>120||
      !Array.isArray(doc.links)||doc.links.length>80||doc.links.some(url=>typeof url!=='string'||url.length>2048))
      throw new Error('Invalid evidence document; no SQL prepared');
    let url;try{url=new URL(doc.url);}catch{throw new Error('Invalid evidence document URL');}
    if(url.protocol!=='https:'||url.username||url.password||url.port||seen.has(url.href))
      throw new Error('Invalid or duplicate evidence document URL');
    seen.add(url.href);
  }
  const payload=JSON.stringify({documents});
  if(new TextEncoder().encode(payload).length>SOURCE_LIMITS.cacheBytes)
    throw new Error('Evidence preload exceeds the existing serialized cache limit');

  // SQLite evaluates CASE branches lazily. Never invoke JSON readers on an
  // invalid payload. json(non-JSON) deliberately aborts this single statement;
  // it is not a fallback value and cannot reset or partly update the row.
  // Duplicate object keys are ambiguous across JSON parsers, so reject them too.
  const ambiguous=`EXISTS (SELECT 1 FROM json_tree(sports_resources.payload)
      WHERE key IS NOT NULL GROUP BY parent,key HAVING count(*)>1)`;
  return `-- PREPARED ONLY. No production execution is authorized by this file.
-- Revalidate source evidence and all release gates before use.
-- Exactly one fixed resource key; no game_context or unrelated-row mutation.
-- Malformed, non-object, ambiguous or conflicting target data aborts atomically.
-- Exact existing evidence is a zero-write no-op, preserving its timestamp.
INSERT INTO sports_resources (key,payload,updated_at)
VALUES (${literal(OPEN_NEWS_KEY)},${literal(payload)},${updatedAt})
ON CONFLICT(key) DO UPDATE SET
  payload=CASE
    WHEN json_valid(sports_resources.payload)!=1
      THEN json('PRELOAD_REFUSED_MALFORMED_EXISTING_JSON')
    WHEN json_type(sports_resources.payload)!='object'
      THEN json('PRELOAD_REFUSED_NON_OBJECT_CACHE')
    WHEN ${ambiguous}
      THEN json('PRELOAD_REFUSED_AMBIGUOUS_JSON_KEYS')
    WHEN json_type(sports_resources.payload,'$.documents') IS NULL
      THEN json_set(sports_resources.payload,'$.documents',json_extract(excluded.payload,'$.documents'))
    WHEN json_type(sports_resources.payload,'$.documents')='array'
      AND json_array_length(sports_resources.payload,'$.documents')=0
      THEN json_set(sports_resources.payload,'$.documents',json_extract(excluded.payload,'$.documents'))
    ELSE json('PRELOAD_REFUSED_CONFLICTING_EVIDENCE')
  END,
  updated_at=max(sports_resources.updated_at,excluded.updated_at)
WHERE CASE
  WHEN json_valid(sports_resources.payload)!=1 THEN 1
  WHEN json_type(sports_resources.payload)!='object' THEN 1
  WHEN ${ambiguous} THEN 1
  WHEN json_type(sports_resources.payload,'$.documents')='array'
    AND json(json_extract(sports_resources.payload,'$.documents'))=json(json_extract(excluded.payload,'$.documents')) THEN 0
  ELSE 1
END;
`;
}

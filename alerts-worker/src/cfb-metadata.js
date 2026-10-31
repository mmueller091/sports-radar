// Display/filter metadata only. Never participates in scoring or feed refreshes.
export const CFB_METADATA_TTL = 24 * 60 * 60 * 1000;
const MAX_STALE = 7 * CFB_METADATA_TTL;
const RETRY_MS = 5 * 60 * 1000;
export function cfbSeason(now=Date.now()) {
  const date=new Date(now);
  return date.getUTCFullYear() - (date.getUTCMonth() === 0 ? 1 : 0);
}
export function conferenceSourceUrl(group,season) {
  return `https://site.api.espn.com/apis/v2/sports/football/college-football/standings?group=${group}&season=${season}`;
}

export function normalizeCfbConferences(payloads,season,now=Date.now()) {
  const conferences=[],teams={};
  for (const [index,division] of ['FBS','FCS'].entries()) {
    const root=payloads[index];
    if (Number(root?.season?.year)!==season || String(root?.id)!==String(index===0?80:81) || !root.children?.length) {
      throw new Error('Conference season or division unavailable');
    }
    for (const group of root.children) {
      if (!group.isConference || !/^\d+$/.test(String(group.id)) || !group.name) continue;
      const conference={id:String(group.id),name:group.name,division};
      const members=new Set();
      // Divisional standings (Sun Belt, SWAC, etc.) inherit their conference.
      const visit=node=>{
        if (node.standings?.season != null && Number(node.standings.season)!==season) throw new Error('Mixed conference seasons');
        for (const entry of node.standings?.entries || []) {
          const id=String(entry.team?.id || '');
          if (!/^\d+$/.test(id)) continue;
          if (teams[id] && teams[id].conferenceId!==conference.id) throw new Error('Conflicting team membership');
          teams[id]={conferenceId:conference.id,division};
          members.add(id);
        }
        for (const child of node.children || []) visit(child);
      };
      visit(group);
      if (!members.size) throw new Error('Empty conference membership');
      conferences.push(conference);
    }
  }
  if (!conferences.some(c=>c.division==='FBS') || !conferences.some(c=>c.division==='FCS')) throw new Error('Incomplete conference metadata');
  return {season,updatedAt:new Date(now).toISOString(),source:'ESPN standings',
    sources:[80,81].map(group=>conferenceSourceUrl(group,season)),conferences,teams};
}

// Reuse existing D1 resource/lease tables. Cache the small index, never the multi-MB
// standings responses. A global lease bounds refreshes to two bulk requests/day.
export async function cfbConferenceMetadata(env,season=cfbSeason(),now=Date.now(),fetcher=fetch) {
  const key=`cfb-conferences:v1:${season}`;
  const read=()=>env.DB.prepare('SELECT payload,updated_at FROM sports_resources WHERE key=?').bind(key).first();
  const unpack=(row,stale=false)=>({...JSON.parse(row.payload),stale});
  const usable=row=>row && now-row.updated_at<MAX_STALE;
  let row=await read();
  if (row && now-row.updated_at<CFB_METADATA_TTL) return unpack(row);
  const owner=crypto.randomUUID();
  const lease=await env.DB.prepare(`INSERT INTO sports_leases (key,owner,expires_at) VALUES (?,?,?)
    ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at
    WHERE sports_leases.expires_at <= ?`).bind(key,owner,now+RETRY_MS,now).run();
  if (!lease.meta?.changes) {
    row=await read();
    if (usable(row)) return unpack(row,true);
    throw new Error('Conference refresh pending');
  }
  let success=false;
  try {
    row=await read();
    if (row && now-row.updated_at<CFB_METADATA_TTL) {success=true;return unpack(row);}
    const payloads=await Promise.all([80,81].map(async group=>{
      const response=await fetcher(conferenceSourceUrl(group,season),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(7000)});
      if (!response.ok) throw new Error('Conference source unavailable');
      return response.json();
    }));
    const data=normalizeCfbConferences(payloads,season,now);
    await env.DB.prepare(`INSERT INTO sports_resources (key,payload,updated_at)
      SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM sports_leases WHERE key=? AND owner=?)
      ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at
      WHERE excluded.updated_at > sports_resources.updated_at`).bind(key,JSON.stringify(data),now,key,owner).run();
    row=await read();
    if (!row) throw new Error('Conference lease lost');
    success=true;
    return unpack(row);
  } catch (error) {
    // Keep the short lease as retry backoff; never substitute another season.
    row=await read();
    if (usable(row)) return unpack(row,true);
    throw error;
  } finally {
    if (success) await env.DB.prepare('DELETE FROM sports_leases WHERE key=? AND owner=?').bind(key,owner).run();
  }
}

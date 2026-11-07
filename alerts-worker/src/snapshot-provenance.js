// Read-time evidence only. Stored observations and ratings remain unchanged.
export function snapshotTimingIssue(row,normalized={}) {
  if(row.game_key?.split(':')[0]!=='CFB'||row.state!=='live'||Number(row.phase)!==4||
    !/^0+(?:(?::0+(?:\.0+)?)|(?:\.0+))?$/.test(String(row.clock||'')))return null;
  const play=normalized.liveRawSituation?.lastPlay;
  const period=Number(play?.period?.number??play?.period)||
    Number(String(play?.text||'').match(/end of (\d+)(?:st|nd|rd|th)? quarter/i)?.[1]);
  return period>0&&period<4?'unconfirmed-period-transition':null;
}

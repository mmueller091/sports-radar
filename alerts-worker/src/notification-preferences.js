export const NOTIFICATION_SPORTS = ['NFL','MLB','NHL','CFB','NBA','NCAAB','Tennis','Soccer'];
export const DEFAULT_NOTIFICATION_PREFERENCES = {enabled:true,sports:NOTIFICATION_SPORTS,teams:[]};

export function normalizeNotificationPreferences(value) {
  if (!value || typeof value.enabled !== 'boolean' || !Array.isArray(value.sports) || !Array.isArray(value.teams) || value.teams.length>200) return null;
  if (value.sports.some(sport=>!NOTIFICATION_SPORTS.includes(sport))) return null;
  const teams=new Map();
  for (const team of value.teams) {
    if (!NOTIFICATION_SPORTS.includes(team?.sport) || typeof team.id!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(team.id)) return null;
    teams.set(`${team.sport}:${team.id}`,{sport:team.sport,id:team.id,name:String(team.name || '').slice(0,160)});
  }
  return {enabled:value.enabled,sports:[...new Set(value.sports)],teams:[...teams.values()]};
}

export function preferencesForRow(row) {
  if (row?.enabled == null) return {...DEFAULT_NOTIFICATION_PREFERENCES}; // Existing subscriptions keep their prior all-sport behavior.
  try {
    return normalizeNotificationPreferences({enabled:Boolean(row.enabled),sports:JSON.parse(row.sports_json),teams:JSON.parse(row.teams_json)}) || {enabled:false,sports:[],teams:[]};
  } catch { return {enabled:false,sports:[],teams:[]}; }
}

export function notificationEligible(game,preferences) {
  return preferences.enabled && (preferences.sports.includes(game.sport) || preferences.teams.some(team=>
    team.sport===game.sport && game.teams?.some(item=>String(item[8] || '')===team.id)));
}

export function notificationGame(key,modelVersion) {
  const prefix=modelVersion+':';
  if (!key.startsWith(prefix)) return null;
  const match=/^([^:]+):([A-Za-z0-9_-]{1,100})$/.exec(key.slice(prefix.length));
  return match && NOTIFICATION_SPORTS.includes(match[1]) ? {sport:match[1],gameId:match[2],gameKey:`${match[1]}:${match[2]}`} : null;
}

export function gameNotificationUrl(sport,id) {
  return `https://mmueller091.github.io/sports-radar/#game/${encodeURIComponent(sport)}/${encodeURIComponent(id)}`;
}

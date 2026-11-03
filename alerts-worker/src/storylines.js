import '../../rating-core.js';
import {reserveResearchAi} from './ai-budget.js';

const {
  rateGame,
  recordFor,
  rankFor,
  CONTEXT_WEIGHTS
} = globalThis.SportsRadarScore;

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
const LOOKAHEAD_MS = 42 * 60 * 60 * 1000;
const ARTICLE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_GAMES = 30;
const MAX_ARTICLES_PER_GAME = 4;
const ALLOWED_TYPES = new Set(Object.keys(CONTEXT_WEIGHTS));

const RESEARCH_FEEDS = [
  {sport:'NFL',scoreboard:'football/nfl/scoreboard',news:'football/nfl/news'},
  {sport:'MLB',scoreboard:'baseball/mlb/scoreboard',news:'baseball/mlb/news'},
  {sport:'NHL',scoreboard:'hockey/nhl/scoreboard',news:'hockey/nhl/news'},
  {sport:'NBA',scoreboard:'basketball/nba/scoreboard',news:'basketball/nba/news'},
  {sport:'CFB',scoreboard:'football/college-football/scoreboard?groups=80',news:'football/college-football/news'},
  {sport:'NCAAB',scoreboard:'basketball/mens-college-basketball/scoreboard',news:'basketball/mens-college-basketball/news'}
];

function dateToken(value) {
  const date = new Date(value);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2,'0')}${String(date.getUTCDate()).padStart(2,'0')}`;
}

async function fetchJson(url) {
  const response = await fetch(url,{
    headers:{Accept:'application/json'},
    cf:{cacheTtl:300,cacheEverything:true}
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

function teamsFromCompetition(competition,sport) {
  return (competition?.competitors || []).slice(0,2).map(item => ({
    id:String(item.team?.id || ''),
    name:item.team?.displayName || item.athlete?.displayName || 'Unknown',
    abbr:item.team?.abbreviation || item.abbreviation || '',
    score:String(Number(item.score) || 0),
    record:recordFor(item),
    rank:rankFor(item,sport)
  }));
}

function eventContext(event,competition) {
  return [
    competition?.notes?.map(note => note.headline).filter(Boolean).join(' '),
    event?.season?.slug,
    event?.name
  ].filter(Boolean).join(' ');
}

function researchGame(sport,event,now=Date.now()) {
  const competition = event?.competitions?.[0];
  const start = Date.parse(event?.date || '');
  const state = competition?.status?.type?.state;
  if (!competition || !Number.isFinite(start) || start < now - 8 * 60 * 60 * 1000 || start > now + LOOKAHEAD_MS || !['pre','in'].includes(state)) return null;

  const teams = teamsFromCompetition(competition,sport);
  if (teams.length !== 2 || teams.some(team => !team.id)) return null;
  const context = eventContext(event,competition);
  const rating = rateGame(sport,'upcoming',teams,event,competition,context);
  const ranked = teams.some(team => Number.isInteger(team.rank) && team.rank >= 1 && team.rank <= 25);
  const postseason = /(playoff|postseason|championship|world series|bowl|final four|tournament|wild card)/i.test(context);
  const eligible = sport === 'NFL' || postseason || (['CFB','NCAAB'].includes(sport) ? ranked : rating.score >= 47);
  if (!eligible) return null;

  return {
    key:`${sport}:${event.id}`,
    eventId:String(event.id),
    sport,
    start,
    teams,
    teamIds:new Set(teams.map(team => team.id)),
    score:rating.score,
    context,
    event,
    competition
  };
}

async function gamesForFeed(feed,now=Date.now()) {
  const tokens = [...new Set([dateToken(now),dateToken(now + 24 * 60 * 60 * 1000),dateToken(now + 48 * 60 * 60 * 1000)])];
  const payloads = await Promise.all(tokens.map(async dates => {
    const separator = feed.scoreboard.includes('?') ? '&' : '?';
    try { return await fetchJson(`${ESPN}/${feed.scoreboard}${separator}dates=${dates}&limit=500`); }
    catch { return {events:[]}; }
  }));
  const events = payloads.flatMap(payload => payload.events || []);
  return [...new Map(events.map(event => [String(event.id),event])).values()]
    .map(event => researchGame(feed.sport,event,now))
    .filter(Boolean);
}

function articleMetadata(article) {
  const categories = article?.categories || [];
  return {
    id:String(article?.id || ''),
    type:String(article?.type || ''),
    headline:String(article?.headline || '').trim(),
    description:String(article?.description || '').trim(),
    published:Date.parse(article?.published || article?.lastModified || ''),
    url:String(article?.links?.web?.href || article?.links?.mobile?.href || ''),
    teamIds:new Set(categories.filter(item => item.type === 'team').map(item => String(item.teamId || item.team?.id || '')).filter(Boolean)),
    eventIds:new Set(categories.filter(item => item.type === 'event').map(item => String(item.eventId || item.event?.id || '')).filter(Boolean)),
    players:categories.filter(item=>item.type==='athlete').map(item=>({id:String(item.athleteId || item.athlete?.id || ''),name:String(item.athlete?.description || item.description || '')})).filter(p=>p.id && p.name)
  };
}

function strongStoryText(text) {
  return /(return|former|traded|trade|debut|injur|ruled out|sidelined|activated|milestone|record|streak|rematch|rival|playoff|wild.card|elimination|captain|coach|suspension|efficiency|net rating|strength of schedule|toughest schedule|confirmed starter|will start|starting quarterback|starting goalie|pitching matchup|\bace\b)/i.test(text);
}

function articleMatchesGame(article,game,now=Date.now()) {
  if (!article.headline || !Number.isFinite(article.published) || now - article.published > ARTICLE_MAX_AGE_MS || article.published>now+300000) return false;
  const text=`${article.headline} ${article.description || ''}`;
  if (/uniform|jerseys?|cleats?|costumes?|fantasy|betting tips|prop plays|power rankings|mock draft|trade rumors?/i.test(text)) return false;
  const teams=game.teams || [];
  const teamIds=game.teamIds || new Set(teams.map(t=>String(t.id || t[8])));
  const eventId=String(game.eventId || game.id);
  const direct=teams.some(t=>{
    const name=String(t.name || t[0] || ''),abbr=String(t.abbr || t[1] || '');
    return [name,name.split(' ').at(-1),abbr.length>=3?abbr:''].filter(n=>n.length>=3)
      .some(n=>new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(text));
  });
  // League roundups carry many team tags; tags alone cannot establish relevance.
  if ((article.teamIds?.size || 0)>4 && !article.eventIds?.has(eventId)) return false;
  if (article.eventIds?.has(eventId)) return true;
  const matchingTeams = [...(article.teamIds || [])].filter(id => teamIds.has(String(id))).length;
  if (matchingTeams >= 2) return true;
  return (direct || matchingTeams===1) && strongStoryText(text);
}

function meaningfulInjuryEvidence(article,type) {
  const text = `${article.headline || ''}. ${article.description || ''}`.replace(/\s+/g,' ').trim();
  if(type==='star_injury_return' && /\bQB\s+[A-Z][a-z]+.{0,35}\b(?:to|will|set to) return\b/i.test(article.headline || '') &&
      /ankle|knee|injur|hamstring/i.test(article.headline || '') && !/could|may|might|questionable/i.test(article.headline)) return {importance:'starting-quarterback'};
  const clauses = text.split(/[.!?;,]|\b(?:but|while|whereas|and)\b/i);
  for (const clause of clauses) {
    if (/\b(?:could|may|might|questionable|doubtful|uncertain|not ruled out|not sidelined|miss (?:a |the )?(?:practice|training))\b/i.test(clause)) continue;
    if (/\b(?:backup|reserve)\b/i.test(clause)) continue;
    const importance = /\bstarting quarterback\b|\bstarting QB\b|\bQB\s+[A-Z][a-z]+/i.test(clause) ? 'starting-quarterback' :
      /\b(?:star|superstar|all[- ]american|all[- ]pro|pro bowler|pro bowl|heisman|reigning MVP|first[- ]team all[- ](?:conference|sec|big ten)|leading (?:scorer|receiver|rusher|passer))\b/i.test(clause) ? 'star' : '';
    const keyReturn=type!=='star_absence' && /\b(?:RB|running back|WR|wide receiver)\b/i.test(text) &&
      /miss(?:ing|ed).{0,15}(?:two|three|[2-9]) (?:games|weeks)/i.test(text);
    if (!importance && !keyReturn) continue;
    const absence = /\b(?:ruled out|will miss|sidelined|placed on injured|out with|out for|out vs|out against)\b/i.test(clause);
    const returning = /(?:return|activated|back in).{0,75}(?:injur|sidelined|ankle|knee|hamstring)|first game back|(?:injur|absence|ankle|knee|hamstring).{0,55}(?:return|back in)/i.test(clause);
    if (type === 'star_absence' ? absence && !returning : returning) return {importance:importance || 'key-player'};
  }
  return null;
}

function affectedInjuryTeam(article,game) {
  const matching = [...(article.teamIds || [])].filter(id=>game.teamIds.has(String(id))).map(String);
  if (matching.length === 1) return matching[0];
  const subject = String(article.headline || '').split(/\b(?:vs\.?|against)\b/i)[0].toLowerCase();
  const named = (game.teams || []).filter(team=>subject.includes(team.name.toLowerCase()) ||
    (team.abbr?.length>=3 && new RegExp(`\\b${team.abbr.replace(/[^a-z0-9]/gi,'')}\\b`,'i').test(subject)));
  return named.length === 1 ? named[0].id : '';
}

function deterministicFactor(article) {
  const text = `${article.headline}. ${article.description}`.replace(/\s+/g,' ').trim();
  let type = '';
  if (meaningfulInjuryEvidence(article,'star_injury_return')) type = 'star_injury_return';
  else if (meaningfulInjuryEvidence(article,'star_absence')) type = 'star_absence';
  else if (/captain/i.test(text) && /(former|traded|trade)/i.test(text)) type = 'former_captain_return';
  else if (/(coach|manager).{0,70}(return|former|faces old team)/i.test(text)) type = 'coach_return';
  else if (/(former team|against (his|her|their) former|traded from)/i.test(text)) type = 'former_star_return';
  else if (/championship rematch|finals rematch|super bowl rematch|world series rematch/i.test(text)) type = 'championship_rematch';
  else if (/playoff rematch/i.test(text)) type = 'playoff_rematch';
  else if (/\b(?:confrontation|altercation|scuffle|brawl)\b/i.test(text) && /player|rival|rematch|teammate/i.test(text)) type = 'rivalry_development';
  else if (/\b(?:revenge|rematch|avenge)\b/i.test(text)) type = 'meaningful_rematch';
  else if (/\b(?:rivalry|archrivals?|rivals?)\b/i.test(text) && !/not a rivalry|no rivalry|uniform|rivalries look/i.test(text)) type = 'rivalry';
  else if (/(milestone|career record|record chase|within .* of)/i.test(text)) type = 'milestone_chase';
  else if (/(season debut|make(s|ing)? (his|her|their) debut)/i.test(text)) type = 'season_debut';
  else if (/(playoff race|wild.card race|elimination|clinching)/i.test(text)) type = 'playoff_race';
  else if (/(hot streak|in (?:his|her|their )?(?:last|past|previous) \d+ games|(?:\d+|several|multiple) straight games|(?:goals?|homers?|points?) in .* games|scored in .* games)/i.test(text)) type = 'star_hot_streak';
  else if (/(hat trick|three goals|scored three|career[- ]high|record[- ]breaking|no[- ]hitter|perfect game|four home runs|50[- ]point)/i.test(text)) type = 'notable_recent_performance';
  else if (/(?:\b\d+[- ]game winning streak\b|\bwon \d+ straight\b|\b\d+ straight wins\b|\bunbeaten in \d+\b)/i.test(text) && !/look(?:s|ing)? (?:for|to)|try(?:ing)? to|hop(?:e|es|ing) to|can .*extend/i.test(text)) type = 'team_win_streak';
  else if (/(?:top[- ]?\d+|best|leads? (?:the )?(?:league|nation)).{0,60}(?:offense|defense|efficiency|net rating)|(?:offensive|defensive|net) efficiency.{0,45}(?:top[- ]?\d+|best|first|1st)/i.test(text)) type = 'elite_efficiency_profile';
  else if (/(strength of schedule|toughest schedule|battle-tested|ranked schedule)/i.test(text)) type = 'strength_of_schedule';
  else if (/(?:confirmed|named|announced).{0,45}(?:starter|starting quarterback|starting goalie)|(?:quarterback|goalie).{0,35}(?:will start|gets the start)|starting lineups? confirmed/i.test(text)) type = 'confirmed_key_starters';
  else if (/(?:ace|cy young).{0,55}(?:start|pitch|matchup)|pitching matchup.{0,55}(?:ace|cy young)|two aces/i.test(text)) type = 'ace_pitching_matchup';
  else if (/(major trade|blockbuster|traded)/i.test(text)) type = 'major_trade_storyline';
  if (!ALLOWED_TYPES.has(type)) return null;
  return {type,text:article.headline,confidence:.78};
}

function evidenceSupportsType(article,type) {
  const grounded = deterministicFactor(article);
  return grounded?.type === type;
}

function pregameStoryEligible(row,saved,now=Date.now()) {
  const published=Number(row.source_published)*1000;
  if (!/^https?:\/\//i.test(String(row.source_url || '')) || !Number.isFinite(published) ||
      published>now+300000 || now-published>ARTICLE_MAX_AGE_MS) return false;
  const article={headline:row.source_title,description:saved?.description || ''};
  if (!evidenceSupportsType(article,row.factor_type)) return false;
  if (row.factor_type==='notable_recent_performance' &&
      !/record[- ]breaking|milestone|historic streak|in (?:his|her|their )?(?:last|past) \d+ games/i.test(`${article.headline} ${article.description}`)) return false;
  return true;
}

function nflMaterialFactor(article,type) {
  const text=`${article.headline || ''} ${article.description || ''}`;
  return type!=='major_trade_storyline' && (type!=='milestone_chase' ||
    /\b(?:needs?|within|away from|one shy|on the verge)\b/i.test(text));
}

// A team tag or an opponent mention establishes article relevance, not ownership
// of an achievement. Resolve the achievement clause before awarding that credit.
const ACHIEVEMENTS = new Set(['team_win_streak','star_hot_streak','notable_recent_performance','elite_efficiency_profile','milestone_chase']);
function achievementMatchesGame(article,game,type) {
  if (!ACHIEVEMENTS.has(type)) return true;
  const teams=game?.teams || [];
  const text=`${article.headline || ''}. ${article.description || ''}`;
  const trigger=type==='team_win_streak' ? /winning streak|win streak|unbeaten in/i :
    type==='star_hot_streak' ? /hot streak|straight games|(?:last|past|previous) \d+ games/i :
    type==='notable_recent_performance' ? /hat trick|three goals|scored three|career[- ]high|record[- ]breaking|no[- ]hitter|perfect game|four home runs|50[- ]point/i :
    /milestone|record|efficiency|net rating|best|leads? (?:the )?(?:league|nation)/i;
  const match=trigger.exec(text);
  if (!match) return false;
  const prefix=text.slice(0,match.index).split(/[.!?;]|\b(?:while|whereas|but|against|over|versus|vs\.?|at|opponent|as)\b/i).at(-1);
  if (type==='team_win_streak' && /\b(?:snap|end|halt|stop|break)\w*\b/i.test(prefix)) return false;
  const clause=type==='notable_recent_performance'
    ? String(article.headline || '').split(/\b(?:against|over|versus|vs\.?|beat|defeat)\b/i)[0] : prefix;
  const named=teams.some(t=>{
    const name=String(t.name || t[0] || ''),abbr=String(t.abbr || t[1] || '');
    return [name,name.split(' ').at(-1),abbr.length>=3?abbr:''].filter(n=>n.length>=3)
      .some(n=>new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(clause));
  });
  if (named) return true;
  // A single-team source can identify a player's team without guessing from a recap's opponent tags.
  const ids=[...(article.teamIds || [])].map(String);
  return ids.length===1 && (game.teamIds || new Set(teams.map(t=>String(t.id || t[8])))).has(ids[0]);
}

function buildResearchItems(games,articlesBySport) {
  const items = [];
  for (const game of games) {
    const matches = (articlesBySport.get(game.sport) || [])
      .filter(article => articleMatchesGame(article,game))
      .sort((a,b) => b.published - a.published)
      .slice(0,MAX_ARTICLES_PER_GAME);
    matches.forEach(article => items.push({
      id:`i${items.length}`,
      gameKey:game.key,
      eventId:game.eventId,
      sport:game.sport,
      matchup:game.teams.map(team => team.name).join(' vs '),
      article,
      game,
      affectedTeamId:affectedInjuryTeam(article,game)
    }));
  }
  return items.slice(0,60);
}

function parseAiResponse(result) {
  const raw = typeof result?.response === 'string' ? result.response : '';
  const cleaned = raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed?.factors) ? parsed.factors : [];
  } catch { return []; }
}

async function aiFactors(env,items) {
  if (!env.AI || !items.length) return [];
  const compact = items.map(item => ({
    id:item.id,
    matchup:item.matchup,
    sport:item.sport,
    headline:item.article.headline,
    description:item.article.description,
    published:new Date(item.article.published).toISOString()
  }));
  const prompt = `Classify sports-news snippets only when the snippet explicitly supports a meaningful pregame storyline for the listed matchup. Never infer facts that are not stated. Ignore generic previews, recaps, score reports, and ordinary injuries without clear impact. Allowed types: ${[...ALLOWED_TYPES].join(', ')}. Return JSON only as {"factors":[{"id":"i0","type":"allowed_type","text":"one short plain-English sentence","confidence":0.0}]}. Confidence must be at least 0.70 and text must not add unsupported facts. Items: ${JSON.stringify(compact)}`;
  const messages = [
    {role:'system',content:'You extract conservative, source-grounded sports matchup context into JSON.'},
    {role:'user',content:prompt}
  ];
  if (!await reserveResearchAi(env,messages)) return [];
  try {
    const result = await env.AI.run(AI_MODEL,{
      messages,
      temperature:0,
      max_tokens:1200
    });
    return parseAiResponse(result);
  } catch (error) {
    console.error('Storyline AI unavailable; using deterministic fallback',String(error));
    return [];
  }
}

function mergeFactors(items,classified) {
  const byItem = new Map(classified
    .filter(item => item && ALLOWED_TYPES.has(item.type) && Number(item.confidence) >= .7)
    .map(item => [String(item.id),item]));
  const deduped = new Map();
  for (const item of items) {
    const ai = byItem.get(item.id);
    const fallback = deterministicFactor(item.article);
    const chosen = ai && evidenceSupportsType(item.article,ai.type) ? ai : fallback;
    if (!chosen || (item.game && !achievementMatchesGame(item.article,item.game,chosen.type))) continue;
    if(item.sport==='NFL' && !nflMaterialFactor(item.article,chosen.type)) continue;
    const confidence = Math.min(.99,Math.max(.7,Number(chosen.confidence) || .7));
    const chosenText = String(chosen.text || '').replace(/\s+/g,' ').trim();
    const groundedText = chosenText && evidenceSupportsType({headline:chosenText,description:''},chosen.type)
      ? chosenText
      : item.article.headline;
    const factor = {
      eventId:item.eventId,
      sport:item.sport,
      type:chosen.type,
      text:groundedText.slice(0,260),
      confidence,
      sourceTitle:item.article.headline.slice(0,260),
      sourceUrl:item.article.url.slice(0,1000),
      sourcePublished:Math.floor(item.article.published / 1000)
    };
    if (['star_absence','star_injury_return'].includes(factor.type)) {
      // Injury evidence comes from the provider snippet, never AI-added claims.
      factor.text = `${item.article.headline}. ${item.article.description || ''}`.trim().slice(0,260);
      factor.injuryEvidence = {...meaningfulInjuryEvidence(item.article,factor.type),affectedTeamId:item.affectedTeamId || '',reportedAt:new Date(item.article.published).toISOString()};
      factor.sourceDescription = String(item.article.description || '').slice(0,1000);
    }
    if (ACHIEVEMENTS.has(factor.type)) {factor.sourceDescription=String(item.article.description || '').slice(0,1000);factor.sourceTeamIds=[...(item.article.teamIds || [])];}
    if (factor.sport==='NFL') {
      factor.sourceDescription=String(item.article.description || '').slice(0,1000);
      factor.sourceTeamIds=[...(item.article.teamIds || [])];factor.sourceEventIds=[...(item.article.eventIds || [])];
    }
    const key = `${factor.sport}:${factor.eventId}:${factor.type}`;
    const prior = deduped.get(key);
    if (!prior || factor.confidence > prior.confidence || factor.sourcePublished > prior.sourcePublished) deduped.set(key,factor);
  }
  return [...deduped.values()];
}

async function saveFactors(env,games,factors,now) {
  const gameByKey = new Map(games.map(game => [game.key,game]));
  const writes = factors.map(factor => {
    const game = gameByKey.get(`${factor.sport}:${factor.eventId}`);
    const expires = Math.floor(((game?.start || now) + 48 * 60 * 60 * 1000) / 1000);
    return env.DB.prepare(`INSERT INTO game_context
      (event_id,sport,factor_type,context_text,confidence,source_title,source_url,source_published,expires_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(event_id,sport,factor_type) DO UPDATE SET
        context_text=excluded.context_text,
        confidence=excluded.confidence,
        source_title=excluded.source_title,
        source_url=excluded.source_url,
        source_published=excluded.source_published,
        expires_at=excluded.expires_at,
        updated_at=excluded.updated_at`)
      .bind(factor.eventId,factor.sport,factor.type,
        factor.sport==='NFL' ? JSON.stringify({version:4,text:factor.text,description:factor.sourceDescription || '',teamIds:factor.sourceTeamIds || [],eventIds:factor.sourceEventIds || [],affectedTeamId:factor.injuryEvidence?.affectedTeamId}) : ACHIEVEMENTS.has(factor.type) ? JSON.stringify({version:3,text:factor.text,description:factor.sourceDescription || '',teamIds:factor.sourceTeamIds || []}) : factor.injuryEvidence ? JSON.stringify({version:2,text:factor.text,description:factor.sourceDescription || '',affectedTeamId:factor.injuryEvidence.affectedTeamId}) : factor.text,
        factor.confidence,factor.sourceTitle,factor.sourceUrl,factor.sourcePublished,expires,Math.floor(now / 1000));
  });
  for (let start=0;start<writes.length;start+=50) await env.DB.batch(writes.slice(start,start+50));
  await env.DB.prepare('DELETE FROM game_context WHERE expires_at < ?').bind(Math.floor(now / 1000)).run();
}

export async function refreshStorylines(env,now=Date.now()) {
  const gameGroups = await Promise.all(RESEARCH_FEEDS.map(feed => gamesForFeed(feed,now)));
  const games = gameGroups.flat().sort((a,b) => a.start - b.start || b.score - a.score).slice(0,MAX_GAMES);
  const neededSports = new Set(games.map(game => game.sport));
  const newsEntries = await Promise.all(RESEARCH_FEEDS.filter(feed => neededSports.has(feed.sport)).map(async feed => {
    try {
      const payload = await fetchJson(`${ESPN}/${feed.news}?limit=100`);
      return [feed.sport,(payload.articles || []).map(articleMetadata)];
    } catch { return [feed.sport,[]]; }
  }));
  const items = buildResearchItems(games,new Map(newsEntries));
  // NFL research is deterministic; do not spend inference calls on this model.
  const classified = await aiFactors(env,items.filter(item=>item.sport!=='NFL'));
  const factors = mergeFactors(items,classified);
  await saveFactors(env,games,factors,now);
  await env.DB.prepare(`INSERT INTO research_status (id,last_run,candidates,articles,factors,ai_used,last_error)
    VALUES (1,?,?,?,?,?,NULL)
    ON CONFLICT(id) DO UPDATE SET last_run=excluded.last_run,candidates=excluded.candidates,articles=excluded.articles,factors=excluded.factors,ai_used=excluded.ai_used,last_error=NULL`)
    .bind(Math.floor(now / 1000),games.length,items.length,factors.length,classified.length ? 1 : 0).run();
  return {candidates:games.length,articles:items.length,factors:factors.length,aiUsed:Boolean(classified.length)};
}

export async function contextsForGames(env,keys,games=[]) {
  const parsed = keys.map(key => {
    const separator = key.indexOf(':');
    return separator > 0 ? {sport:key.slice(0,separator),eventId:key.slice(separator + 1)} : null;
  }).filter(item => item && /^[A-Za-z0-9]+$/.test(item.sport) && /^[A-Za-z0-9_-]+$/.test(item.eventId));
  if (!parsed.length) return {};
  const eventIds = [...new Set(parsed.map(item => item.eventId))];
  const rows = [];
  const expiresAt = Math.floor(Date.now() / 1000);
  for (let start = 0; start < eventIds.length; start += 90) {
    const batch = eventIds.slice(start,start + 90);
    const placeholders = batch.map(() => '?').join(',');
    const result = await env.DB.prepare(`SELECT event_id,sport,factor_type,context_text,confidence,source_title,source_url,source_published FROM game_context WHERE expires_at >= ? AND event_id IN (${placeholders})`)
      .bind(expiresAt,...batch).all();
    rows.push(...(result.results || []));
  }
  const allowed = new Set(parsed.map(item => `${item.sport}:${item.eventId}`));
  const output = {};
  for (const row of rows) {
    const key = `${row.sport}:${row.event_id}`;
    if (!allowed.has(key)) continue;
    if(row.sport==='NFL' && /uniform|jerseys?|costumes?|fantasy/i.test(row.source_title || '')) continue;
    let text = row.context_text;
    let saved;
    try {saved=JSON.parse(text);} catch {}
    if ([3,4].includes(saved?.version)) text=saved.text;
    const game=games.find(g=>g.sport===row.sport && String(g.id)===String(row.event_id));
    if (game?.state==='upcoming' && !pregameStoryEligible(row,saved)) continue;
    if (row.sport==='NFL' && (!game || game.state==='upcoming')) {
      const article={headline:row.source_title,description:saved?.description || '',published:Number(row.source_published)*1000,
        teamIds:new Set(saved?.teamIds || []),eventIds:new Set(saved?.eventIds || [])};
      if (/uniform|jerseys?|costume|fantasy/i.test(article.headline) ||
          !evidenceSupportsType(article,row.factor_type) || !nflMaterialFactor(article,row.factor_type) || (game && !articleMatchesGame(article,game))) continue;
    }
    if (ACHIEVEMENTS.has(row.factor_type)) {
      const article={headline:row.source_title,description:saved?.description || '',teamIds:new Set(saved?.teamIds || [])};
      if (!evidenceSupportsType(article,row.factor_type) || (game && !achievementMatchesGame(article,game,row.factor_type))) continue;
    }
    let injuryEvidence;
    if (['star_absence','star_injury_return'].includes(row.factor_type)) {
      let stored;
      try { stored = JSON.parse(row.context_text); } catch {}
      const versioned = [2,4].includes(stored?.version) && typeof stored.text === 'string';
      const article = {headline:row.source_title,description:versioned ? String(stored.description || '') : ''};
      const evidence = meaningfulInjuryEvidence(article,row.factor_type);
      // Revalidate legacy injury rows on every read. Unrelated cached storylines
      // and historical snapshots are untouched; no production DELETE is needed.
      if (!evidence) continue;
      text = versioned ? stored.text : row.context_text;
      injuryEvidence = {...evidence,affectedTeamId:versioned ? String(stored.affectedTeamId || '') : '',reportedAt:row.source_published ? new Date(Number(row.source_published)*1000).toISOString() : ''};
    }
    (output[key] ||= []).push({
      type:row.factor_type,
      text,
      confidence:Number(row.confidence),
      verified:true,
      sourceTitle:row.source_title,
      sourceUrl:row.source_url,
      publishedAt:row.source_published ? new Date(Number(row.source_published) * 1000).toISOString() : null,
      ...(injuryEvidence ? {injuryEvidence} : {})
    });
  }
  return output;
}

export {articleMetadata,buildResearchItems,achievementMatchesGame,researchGame,deterministicFactor,evidenceSupportsType,articleMatchesGame,mergeFactors,saveFactors,meaningfulInjuryEvidence,affectedInjuryTeam,pregameStoryEligible};

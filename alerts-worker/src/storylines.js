import '../../rating-core.js';

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
    eventIds:new Set(categories.filter(item => item.type === 'event').map(item => String(item.eventId || item.event?.id || '')).filter(Boolean))
  };
}

function strongStoryText(text) {
  return /(return|former|traded|trade|debut|injur|ruled out|sidelined|activated|milestone|record|streak|rematch|rival|playoff|wild.card|elimination|captain|coach|suspension|efficiency|net rating|strength of schedule|toughest schedule|confirmed starter|will start|starting quarterback|starting goalie|pitching matchup|\bace\b)/i.test(text);
}

function articleMatchesGame(article,game) {
  if (!article.headline || !Number.isFinite(article.published) || Date.now() - article.published > ARTICLE_MAX_AGE_MS) return false;
  if (article.eventIds.has(game.eventId)) return true;
  const matchingTeams = [...article.teamIds].filter(id => game.teamIds.has(id)).length;
  if (matchingTeams >= 2) return true;
  return matchingTeams === 1 && strongStoryText(`${article.headline} ${article.description}`);
}

function deterministicFactor(article) {
  const text = `${article.headline}. ${article.description}`.replace(/\s+/g,' ').trim();
  let type = '';
  if (/captain/i.test(text) && /(former|return|traded|trade)/i.test(text)) type = 'former_captain_return';
  else if (/(former team|against (his|her|their) former|return(s|ing)? to|traded from)/i.test(text)) type = 'former_star_return';
  else if (/(return|activated|back in).{0,55}(injur|sidelined)|first game back/i.test(text)) type = 'star_injury_return';
  else if (/(ruled out|will miss|sidelined|placed on injured|out with)/i.test(text)) type = 'star_absence';
  else if (/championship rematch|finals rematch|super bowl rematch|world series rematch/i.test(text)) type = 'championship_rematch';
  else if (/playoff rematch/i.test(text)) type = 'playoff_rematch';
  else if (/rivalry|archrival|rival/i.test(text)) type = 'rivalry';
  else if (/(milestone|career record|record chase|within .* of)/i.test(text)) type = 'milestone_chase';
  else if (/(season debut|make(s|ing)? (his|her|their) debut)/i.test(text)) type = 'season_debut';
  else if (/(playoff race|wild.card race|elimination|clinching)/i.test(text)) type = 'playoff_race';
  else if (/(coach|manager).{0,70}(return|former|faces old team)/i.test(text)) type = 'coach_return';
  else if (/(hot streak|in (?:his|her|their )?(?:last|past|previous) \d+ games|(?:\d+|several|multiple) straight games|(?:goals?|homers?|points?) in .* games|scored in .* games)/i.test(text)) type = 'star_hot_streak';
  else if (/(hat trick|overtime|three goals|scored three|previous game|last game|game-winning)/i.test(text)) type = 'notable_recent_performance';
  else if (/(winning streak|win streak|unbeaten in)/i.test(text)) type = 'team_win_streak';
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
      article
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
  try {
    const result = await env.AI.run(AI_MODEL,{
      messages:[
        {role:'system',content:'You extract conservative, source-grounded sports matchup context into JSON.'},
        {role:'user',content:prompt}
      ],
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
    if (!chosen) continue;
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
      .bind(factor.eventId,factor.sport,factor.type,factor.text,factor.confidence,factor.sourceTitle,factor.sourceUrl,factor.sourcePublished,expires,Math.floor(now / 1000));
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
  const classified = await aiFactors(env,items);
  const factors = mergeFactors(items,classified);
  await saveFactors(env,games,factors,now);
  await env.DB.prepare(`INSERT INTO research_status (id,last_run,candidates,articles,factors,ai_used,last_error)
    VALUES (1,?,?,?,?,?,NULL)
    ON CONFLICT(id) DO UPDATE SET last_run=excluded.last_run,candidates=excluded.candidates,articles=excluded.articles,factors=excluded.factors,ai_used=excluded.ai_used,last_error=NULL`)
    .bind(Math.floor(now / 1000),games.length,items.length,factors.length,classified.length ? 1 : 0).run();
  return {candidates:games.length,articles:items.length,factors:factors.length,aiUsed:Boolean(classified.length)};
}

export async function contextsForGames(env,keys) {
  const parsed = keys.map(key => {
    const separator = key.indexOf(':');
    return separator > 0 ? {sport:key.slice(0,separator),eventId:key.slice(separator + 1)} : null;
  }).filter(item => item && /^[A-Za-z0-9]+$/.test(item.sport) && /^[A-Za-z0-9_-]+$/.test(item.eventId)).slice(0,100);
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
    (output[key] ||= []).push({
      type:row.factor_type,
      text:row.context_text,
      confidence:Number(row.confidence),
      verified:true,
      sourceTitle:row.source_title,
      sourceUrl:row.source_url,
      publishedAt:row.source_published ? new Date(Number(row.source_published) * 1000).toISOString() : null
    });
  }
  return output;
}

export {researchGame,deterministicFactor,evidenceSupportsType,articleMatchesGame,mergeFactors,saveFactors};

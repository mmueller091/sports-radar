import '../../rating-core.js';
import {reserveResearchAi,measuredResearchInference} from './ai-budget.js';
import {EDITORIAL_TYPE,editorialArticleEligible,acceptEditorialReview,discoverEditorialStories,cfbArticleRelevant} from './editorial-context.js';
import cfbContext from '../../scoring/cfb-verified-context.cjs';
import {RESEARCH_LIMITS,DIAGNOSTIC_KEY,cachedResearchSlate,selectResearchGames,selectCfbTeamNews,researchDiagnostics,publicLinkEligible} from './research-allocation.js';
import {selectOpenNewsGames,historicalSearchUrl,historicalRivalry,identifiesMatchup,
  readOpenNewsState,writeOpenNewsState} from './open-news-discovery.js';

import {verifiedEvidenceFactors,revalidateEvidence,distinctEvidenceFactors} from './source-evidence.js';
import {researchOfficialSources} from './source-research.js';

const {
  rateGame,
  recordFor,
  rankFor,
  CONTEXT_WEIGHTS
} = globalThis.SportsRadarScore;

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
const LOOKAHEAD_MS = RESEARCH_LIMITS.days * 24 * 60 * 60 * 1000;
const ARTICLE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
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

async function fetchJson(url,headers={}) {
  const response = await fetch(url,{
    headers:{Accept:'application/json',...headers},
    signal:AbortSignal.timeout(7000),
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
  const verifiedContext=cfbContext.cfbResearchPriority({sport,id:String(event.id),startTime:event.date,state:state==='pre'?'upcoming':'live',teams},now);
  const eligible = sport === 'NFL' || postseason || verifiedContext || (['CFB','NCAAB'].includes(sport) ? ranked : rating.score >= 47);
  if (!eligible) return null;

  return {
    state:state==='pre'?'upcoming':'live',
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
  if(!cfbArticleRelevant(article,game))return false;
  if (!article.headline || !Number.isFinite(article.published) || now - article.published > ARTICLE_MAX_AGE_MS || article.published>now+300000) return false;
  if (/recap/i.test(article.type||'') || /\/recap(?:[/?]|$)/i.test(article.url||'') || /game highlights/i.test(article.headline)) return false;
  const text=`${article.headline} ${article.description || ''}`;
  if (/uniform|jerseys?|cleats?|costumes?|fantasy|betting tips|prop plays|power rankings|mock draft|trade rumors?/i.test(text)) return false;
  const teams=game.teams || [];
  const teamIds=game.teamIds || new Set(teams.map(t=>String(t.id || t[8])));
  const eventId=String(game.eventId || game.id);
  // Matchup-level claims need evidence about BOTH opponents, not a team tag
  // attached to a story about that school's different rival or future game.
  const matchupTypes=new Set(['rivalry','rivalry_development','championship_rematch','playoff_rematch','meaningful_rematch']);
  if(game.sport==='CFB'&&matchupTypes.has(deterministicFactor(article)?.type)&&!article.eventIds?.has(eventId)){
    const tagged=[...(article.teamIds||[])].map(String);
    const taggedBoth=tagged.length===2&&tagged.every(id=>teamIds.has(id));
    const mentionsBoth=teams.every(team=>{
      const name=String(team.name||team[0]||'').trim();
      const school=name.split(' ').slice(0,-1).join(' ');
      return [name,school].filter(alias=>alias.length>=3).some(alias=>
        new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(text));
    });
    if(!taggedBoth&&!(mentionsBoth&&tagged.every(id=>teamIds.has(id))))return false;
  }
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
  const clauses = text.split(/[.!?;,]|\b(?:but|while|whereas|and)\b/i);
  for (const clause of clauses) {
    if (/\b(?:could|may|might|questionable|doubtful|uncertain|not ruled out|not sidelined|miss (?:a |the )?(?:practice|training))\b/i.test(clause)) continue;
    if (/\b(?:backup|reserve)\b/i.test(clause)) continue;
    const importance = /\bstarting quarterback\b|\bstarting QB\b/i.test(clause) ? 'starting-quarterback' :
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
  else if(!/\b(?:reserve|backup|minor)\b/i.test(text)&&/(?:return|activated|back in).{0,75}(?:injur|sidelined|ankle|knee|hamstring)|(?:injur|absence|ankle|knee|hamstring).{0,55}(?:return|back in)/i.test(text)) type='player_injury_return';
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
  if (/\/recap(?:[/?]|$)/i.test(row.source_url) || /game highlights/i.test(row.source_title||'')) return false;
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

function buildResearchItems(games,articlesBySport,now=Date.now()) {
  const items = [];
  const groups=games.map(game=>{
    const priority=article=>Number(article.eventIds?.has(game.eventId))*8+
      Math.min(2,[...(article.teamIds||[])].filter(id=>game.teamIds.has(String(id))).length)*2+
      Number(Boolean(deterministicFactor(article)))*2+Number(editorialArticleEligible(article,game,now));
    const matches = (articlesBySport.get(game.sport) || [])
      .filter(article => !/\/(?:recap|preview)(?:[/?]|$)/i.test(article.url||'')&&
        (!article.eventIds?.size||article.eventIds.has(game.eventId))&&
        // A return, absence or streak reported for the next game is not evidence
        // for another game several days later. Require that future event's tag.
        (game.start-now<=42*60*60*1000||article.eventIds?.has(game.eventId)||
          !/injur|return|ruled out|sidelined|activated|debut|streak|will start|confirmed starter/i.test(`${article.headline} ${article.description}`))&&
        (articleMatchesGame(article,game,now) || editorialArticleEligible(article,game,now)))
      .sort((a,b) => priority(b)-priority(a) || b.published - a.published || String(a.id||'').localeCompare(String(b.id||'')))
      .slice(0,MAX_ARTICLES_PER_GAME);
    return {game,matches};
  });
  // Each selected game gets a first article before any gets a second. This
  // prevents the early games in the pool from consuming all sixty slots.
  for(let index=0;index<MAX_ARTICLES_PER_GAME;index++)for(const {game,matches} of groups){
    const article=matches[index];if(!article)continue;
    if(items.length>=RESEARCH_LIMITS.articles)return items;
    items.push({
      id:`i${items.length}`,
      gameKey:game.key,
      eventId:game.eventId,
      sport:game.sport,
      matchup:game.teams.map(team => team.name).join(' vs '),
      article,
      game,
      affectedTeamId:affectedInjuryTeam(article,game)
    });
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

async function aiFactors(env,items,now=Date.now(),usage) {
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
  if (!await reserveResearchAi(env,messages,now)) return [];
  try {
    const result = await measuredResearchInference(env,AI_MODEL,{
      messages,
      temperature:0,
      max_tokens:1200
    },usage,'scoring-classification');
    return parseAiResponse(result);
  } catch (error) {
    console.error('Storyline AI unavailable; using deterministic fallback',String(error));
    return [];
  }
}

// The active feeds do not establish independent reporting provenance. A second
// headline, a different byline, Wikipedia or an AI verdict is not corroboration.
// A snippet is informational until a retained source document passes verification.
function singleSourceDiscovery(article,game,now=Date.now(),expectedType) {
  if(!editorialArticleEligible(article,game,now)||!articleMatchesGame(article,game,now))return null;
  const text=`${article.headline} ${article.description||''}`;
  if(/\b(?:could|might|may|rumou?rs?|reportedly|speculat\w*|possible|expected|questionable|doubtful|not confirmed)\b|\?/i.test(text))return null;
  const grounded=deterministicFactor(article);
  if(!grounded||(expectedType&&grounded.type!==expectedType)||!achievementMatchesGame(article,game,grounded.type))return null;
  if(['rivalry','rivalry_development','championship_rematch','playoff_rematch','meaningful_rematch'].includes(grounded.type)){
    const pairing={sport:game.sport,teams:(game.teams||[]).map(t=>({name:t.name||t[0],abbr:t.abbr||t[1]}))};
    if(pairing.teams.length!==2||!identifiesMatchup(text,pairing)||
      /\b(?:after|following|prior to)\b.{0,80}\b(?:rivalry|rematch|playoff|championship)\b/i.test(text))return null;
  }
  if(game.sport==='NFL'&&!nflMaterialFactor(article,grounded.type))return null;
  const start=Number(game.start)||Date.parse(game.startTime||'');
  if(start-now>42*3600000&&!article.eventIds?.has(String(game.eventId||game.id))&&
    /injur|return|ruled out|sidelined|activated|debut|streak|will start|confirmed starter/i.test(text))return null;
  return {type:EDITORIAL_TYPE,discoveredType:grounded.type,verification:'single-source',scoringEligible:false,
    editorialOnly:true,verified:true,confidence:.95,text:article.headline,
    sourceTitle:article.headline,sourceDescription:article.description||'',sourceUrl:article.url,
    sourcePublished:Math.floor(article.published/1000),publishedAt:new Date(article.published).toISOString(),
    sourceTeamIds:[...(article.teamIds||[])],sourceEventIds:[...(article.eventIds||[])]};
}

function mergeFactors(items,classified,editorial=[],now=Date.now(),verified=[],games=[]) {
  const deduped=new Map();
  for(const item of items){
    // AI classifications cannot promote single-source discoveries into points.
    const story=singleSourceDiscovery(item.article,item.game,now);
    if(!story)continue;
    const key=`${item.sport}:${item.eventId}:${EDITORIAL_TYPE}`;
    const prior=deduped.get(key);
    if(!prior||story.sourcePublished>prior.sourcePublished)
      deduped.set(key,{...story,eventId:item.eventId,sport:item.sport});
  }
  for(const candidate of editorial){
    const item=items.find(item=>item.id===candidate.id);
    if(!item||!acceptEditorialReview(item,candidate,candidate.review,now))continue;
    const story={eventId:item.eventId,sport:item.sport,type:EDITORIAL_TYPE,text:item.article.headline,
      confidence:candidate.confidence,verified:true,editorialOnly:true,verification:'single-source',scoringEligible:false,
      sourceTitle:item.article.headline,sourceUrl:item.article.url,publishedAt:new Date(item.article.published).toISOString(),
      sourcePublished:Math.floor(item.article.published/1000),sourceDescription:item.article.description||'',
      sourceTeamIds:[...(item.article.teamIds||[])],sourceEventIds:[...(item.article.eventIds||[])],editorialReview:candidate};
    deduped.set(`${item.sport}:${item.eventId}:${EDITORIAL_TYPE}`,story);
  }
  for(const factor of verified){
    const item=items.find(i=>i.sport===factor.sport&&i.eventId===factor.eventId);
    const game=item?.game||games.find(g=>g.sport===factor.sport&&String(g.eventId||g.id)===factor.eventId);
    const accepted=game&&validatedScoringFactor(factor,game,now,games.length?games:[game]);
    if(accepted)deduped.set(accepted.eventKey || `${factor.sport}:${factor.eventId}:${factor.type}`,accepted);
  }
  return distinctEvidenceFactors([...deduped.values()]);
}

function validatedScoringFactor(factor,game,now,slate=[game],currentDocuments=[]){
  const checked=revalidateEvidence(factor,game,deterministicFactor,now,slate,currentDocuments);
  if(!checked||!ALLOWED_TYPES.has(checked.type))return null;
  const article={headline:checked.text,description:'',teamIds:new Set([checked.evidence.owner])};
  if(game.sport==='NFL'&&!nflMaterialFactor(article,checked.type))return null;
  if(['star_absence','star_injury_return'].includes(checked.type)){
    const injury=meaningfulInjuryEvidence(article,checked.type);
    if(injury) checked.injuryEvidence={...injury,affectedTeamId:checked.evidence.owner,reportedAt:checked.publishedAt};
    else {checked.scoringEligible=false;checked.scoringAssessment={eligible:false,polarity:'neutral',reason:'Player significance is not established'};}
  }
  return checked;
}

async function saveFactors(env,games,factors,now) {
  const gameByKey = new Map(games.map(game => [game.key,game]));
  // D1's existing category key remains intact. Multiple distinct events in a
  // category share one bounded envelope, not one overwritten storyline.
  const grouped=new Map();
  for(const factor of factors){const key=`${factor.sport}:${factor.eventId}:${factor.type}`;const group=grouped.get(key)||[];group.push(factor);grouped.set(key,group);}
  const savedContext=factor=>({version:factor.evidence?7:factor.discoveredType?6:5,verification:factor.verification,evidence:factor.evidence,expiresAt:factor.expiresAt,discoveredType:factor.discoveredType,text:factor.text,description:factor.sourceDescription||'',teamIds:factor.sourceTeamIds||[],eventIds:factor.sourceEventIds||[],affectedTeamId:factor.injuryEvidence?.affectedTeamId,editorialReview:factor.editorialReview,origin:factor.origin,sources:factor.openNewsSources});
  const writes = [...grouped.values()].map(group => {
    const factor=group[0];
    const game = gameByKey.get(`${factor.sport}:${factor.eventId}`);
    const expires = Math.floor(Math.max(...group.map(f=>f.evidence?Date.parse(f.expiresAt):(game?.start || now)+48*3600000))/1000);
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
        updated_at=excluded.updated_at
      WHERE COALESCE(json_extract(excluded.context_text,'$.origin'),'')!='open-news'
        OR CASE WHEN json_valid(game_context.context_text)
          THEN COALESCE(json_extract(game_context.context_text,'$.origin'),'')='open-news'
          ELSE 0 END`)
      .bind(factor.eventId,factor.sport,factor.type,
        JSON.stringify(group.length===1?savedContext(factor):{version:8,entries:group.slice(0,6).map(f=>({context_text:JSON.stringify(savedContext(f)),source_title:f.sourceTitle,source_url:f.sourceUrl,source_published:f.sourcePublished,confidence:f.confidence}))}),
        factor.confidence,factor.sourceTitle,factor.sourceUrl,factor.sourcePublished,expires,Math.floor(now / 1000));
  });
  for (let start=0;start<writes.length;start+=50) await env.DB.batch(writes.slice(start,start+50));
  await env.DB.prepare('DELETE FROM game_context WHERE expires_at < ?').bind(Math.floor(now / 1000)).run();
}

export async function refreshStorylines(env,now=Date.now()) {
  const [slate,previous,openState]=await Promise.all([cachedResearchSlate(env,now),researchDiagnostics(env),readOpenNewsState(env,now)]);
  const games=selectResearchGames(slate.games,previous?.lastResearched||{},now);
  const neededSports = new Set(games.map(game => game.sport));
  // GDELT is dormant: no flag, scheduled requests or cached scoring promotion.
  // A periodic Wikipedia lookup supplies hints only and shares the six slots.
  const researchCycle=Math.floor(now/(2*3600000));
  const historicalPass=researchCycle%4===0&&now>=openState.historyFailureUntil;
  const missingHistory=slate.games.filter(g=>!openState.history.some(item=>
    item.pairKey===`${g.sport}:${g.teams.map(t=>String(t.id)).sort().join(':')}`));
  const historicalGame=historicalPass?selectOpenNewsGames(missingHistory,openState.lastHistoryResearched,now,1)[0]:null;
  const historyUrl=historicalGame?historicalSearchUrl(historicalGame):null;
  const externalUrl=historyUrl;
  const allFeeds=RESEARCH_FEEDS.filter(feed=>neededSports.has(feed.sport));
  // Two of the same six slots verify observed source documents. Rotate skipped
  // league feeds; the periodic Wikipedia pass continues to use just one slot.
  const sourceSlots=externalUrl?0:2;
  const feedLimit=RESEARCH_LIMITS.providerRequests-sourceSlots-Number(Boolean(externalUrl));
  const offset=allFeeds.length?researchCycle%allFeeds.length:0;
  const requestedFeeds=[...allFeeds.slice(offset),...allFeeds.slice(0,offset)].slice(0,feedLimit);
  const remainingRequests=Math.max(0,feedLimit-requestedFeeds.length);
  const teamNewsIds=selectCfbTeamNews(games,previous?.lastTeamResearch||{},remainingRequests,now);
  const openRequest=externalUrl?fetchJson(externalUrl,historyUrl?{'User-Agent':'SlateMeter/1.0 (https://slatemeter.app)'}:{})
    .then(payload=>{
      if(!Array.isArray(historyUrl?payload?.pages:payload?.articles))throw Error('Invalid public research response');
      return {articles:[],history:historyUrl?historicalRivalry(payload,historicalGame,now):null,failed:false};
    })
    .catch(()=>({articles:[],history:null,failed:true})):Promise.resolve({articles:[],history:null,failed:false});
  const newsEntries = await Promise.all(requestedFeeds.map(async feed => {
    try {
      const payload = await fetchJson(`${ESPN}/${feed.news}?limit=100`);
      return [feed.sport,(payload.articles || []).map(articleMetadata)];
    } catch { return [feed.sport,[]]; }
  }));
  const teamEntries=await Promise.all(teamNewsIds.map(async id=>{
    try{
      const payload=await fetchJson(`${ESPN}/football/college-football/news?team=${id}&limit=100`);
      // The team query is a discovery hint, never trusted as evidence. Keep
      // only articles whose ESPN category actually names the requested team.
      return {id,articles:(payload.articles||[]).map(articleMetadata).filter(a=>a.teamIds.has(id))};
    }catch{return {id,articles:[]};}
  }));
  const openResponse=await openRequest;
  const articlesBySport=new Map(newsEntries);
  if(teamEntries.length){
    const cfb=articlesBySport.get('CFB')||[],seen=new Set(cfb.map(a=>a.id||a.url));
    for(const {articles} of teamEntries)for(const article of articles){
      const key=article.id||article.url;if(!key||seen.has(key))continue;
      seen.add(key);cfb.push(article);
    }
    articlesBySport.set('CFB',cfb);
  }
  // Reuse previously captured source snippets when the rolling feed has moved
  // on. They remain discovery hints and receive no grandfathered scoring trust.
  for(const game of games)for(const story of [...(game.publicGame?.qualitativeContexts||[]),...(game.publicGame?.editorialStorylines||[])]){
    if(story.registryVersion||!story.sourceUrl)continue;
    const articles=articlesBySport.get(game.sport)||[];
    if(articles.some(a=>a.url===story.sourceUrl))continue;
    articles.push({id:story.sourceUrl,headline:story.sourceTitle||story.text,description:story.sourceDescription||'',url:story.sourceUrl,
      published:Date.parse(story.publishedAt||'')||Number(story.sourcePublished)*1000,
      teamIds:new Set(story.sourceTeamIds||[]),eventIds:new Set(story.sourceEventIds||[])});
    articlesBySport.set(game.sport,articles);
  }
  const items = buildResearchItems(games,articlesBySport,now);
  const usage=[];
  // Existing classification/review calls may select stories, never certify
  // independent reporting or promote automatic scoring evidence.
  const classified = await aiFactors(env,items.filter(item=>item.sport!=='NFL'),now,usage);
  const editorial = await discoverEditorialStories(env,items,now,usage);
  const sourceResearch=sourceSlots?await researchOfficialSources(items,openState,deterministicFactor,now):
    {documents:openState.documents||[],diagnostics:{requests:0},lastVerified:openState.lastVerified,sourceFailureUntil:openState.sourceFailureUntil,sourceIndex:openState.sourceIndex};
  const verified=games.flatMap(g=>verifiedEvidenceFactors(g,sourceResearch.documents,deterministicFactor,now,slate.games));
  const factors = mergeFactors(items,classified,editorial,now,verified,games);
  await saveFactors(env,games,factors,now);
  const newOpenState={documents:sourceResearch.documents,lastVerified:sourceResearch.lastVerified,sourceFailureUntil:sourceResearch.sourceFailureUntil,sourceIndex:sourceResearch.sourceIndex,evidence:[],failureUntil:0,lastResearched:{},
    history:[...openState.history,...(openResponse.history?[openResponse.history]:[])],
    historyFailureUntil:historyUrl&&openResponse.failed?now+6*3600000:openState.historyFailureUntil,
    lastHistoryResearched:{...openState.lastHistoryResearched,...(historicalGame?{[historicalGame.key]:now}:{})}};
  try{await writeOpenNewsState(env,newOpenState,now);}catch{}
  const revalidated=await contextsForGames(env,games.map(g=>g.key),games.map(g=>g.publicGame),now);
  const counts=games.map(g=>{
    const accepted=revalidated[g.key]||[];
    return {key:g.key,accepted:accepted.length,automatic:accepted.filter(s=>!s.registryVersion).length,
      reviewed:accepted.filter(s=>s.registryVersion).length,
      publicLinkEligible:accepted.filter(s=>publicLinkEligible(s,g.publicGame,now)).length};
  });
  const diagnostics={version:1,lastRun:Math.floor(now/1000),slateSource:slate.reason,slateUpdatedAt:slate.updatedAt||null,
    limits:RESEARCH_LIMITS,candidatePool:slate.games.length,selected:games.map(g=>({key:g.key,score:g.score,start:new Date(g.start).toISOString()})),
    articles:items.length,savedFactors:factors.length,readAccepted:counts.reduce((n,g)=>n+g.accepted,0),
    automaticAccepted:counts.reduce((n,g)=>n+g.automatic,0),reviewedAccepted:counts.reduce((n,g)=>n+g.reviewed,0),
    exploratoryGames:games.filter(g=>g.exploratory).length,
    eligiblePublicLinks:counts.reduce((n,g)=>n+g.publicLinkEligible,0),gamesWithEligibleLinks:counts.filter(g=>g.publicLinkEligible).length,
    counts,usage,providerRequests:requestedFeeds.length+teamNewsIds.length+Number(Boolean(externalUrl))+sourceResearch.diagnostics.requests,
    sourceVerification:{...sourceResearch.diagnostics,cachedDocuments:sourceResearch.documents.length,verifiedFactors:factors.filter(f=>f.evidence).length},
    teamNews:{queried:teamNewsIds,eligibleArticles:teamEntries.reduce((total,entry)=>total+entry.articles.length,0)},
    openNews:{enabled:false,queried:[],attempted:false,failed:false,articles:0,candidates:0,corroborated:0,
      historicalLookup:historyUrl?historicalGame.key:null,historicalFound:Boolean(openResponse.history),
      historicalFailed:Boolean(historyUrl&&openResponse.failed),historicalCached:newOpenState.history.length,
      source:'GDELT disabled; Wikipedia search hints only; source documents required for automatic scoring'},
    lastTeamResearch:Object.fromEntries([
      ...Object.entries(previous?.lastTeamResearch||{}).filter(([id,at])=>/^[1-9]\d{0,7}$/.test(id)&&Number.isFinite(at)&&at>now-8*86400000&&at<=now),
      ...teamNewsIds.map(id=>[id,now])
    ].slice(-300)),
    lastResearched:Object.fromEntries(slate.games.map(g=>[g.key,games.some(s=>s.key===g.key)?now:previous?.lastResearched?.[g.key]||0]))};
  // Optional diagnostics cannot fail a successful research run or the feed.
  try {await env.DB.prepare('INSERT INTO sports_resources (key,payload,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at')
    .bind(DIAGNOSTIC_KEY,JSON.stringify(diagnostics),now).run();}catch{}
  await env.DB.prepare(`INSERT INTO research_status (id,last_run,candidates,articles,factors,ai_used,last_error)
    VALUES (1,?,?,?,?,?,NULL)
    ON CONFLICT(id) DO UPDATE SET last_run=excluded.last_run,candidates=excluded.candidates,articles=excluded.articles,factors=excluded.factors,ai_used=excluded.ai_used,last_error=NULL`)
    .bind(Math.floor(now / 1000),games.length,items.length,factors.length,usage.length ? 1 : 0).run();
  return {candidates:games.length,articles:items.length,factors:factors.length,aiUsed:Boolean(usage.length),diagnostics};
}

export async function contextsForGames(env,keys,games=[],now=Date.now()) {
  const parsed = keys.map(key => {
    const separator = key.indexOf(':');
    return separator > 0 ? {sport:key.slice(0,separator),eventId:key.slice(separator + 1)} : null;
  }).filter(item => item && /^[A-Za-z0-9]+$/.test(item.sport) && /^[A-Za-z0-9_-]+$/.test(item.eventId));
  if (!parsed.length) return {};
  const eventIds = [...new Set(parsed.map(item => item.eventId))];
  const rows = [];
  const expiresAt = Math.floor(now / 1000);
  for (let start = 0; start < eventIds.length; start += 90) {
    const batch = eventIds.slice(start,start + 90);
    const placeholders = batch.map(() => '?').join(',');
    const result = await env.DB.prepare(`SELECT event_id,sport,factor_type,context_text,confidence,source_title,source_url,source_published FROM game_context WHERE expires_at >= ? AND event_id IN (${placeholders})`)
      .bind(expiresAt,...batch).all();
    rows.push(...(result.results || []));
  }
  const allowed = new Set(parsed.map(item => `${item.sport}:${item.eventId}`));
  const output = {};
  let sourceDocuments;
  const expanded=rows.flatMap(row=>{try{const saved=JSON.parse(row.context_text);if(saved?.version===8&&Array.isArray(saved.entries))return saved.entries.slice(0,6).map(entry=>({...row,...entry,event_id:row.event_id,sport:row.sport,factor_type:row.factor_type}));}catch{}return [row];});
  for (const row of expanded) {
    const key = `${row.sport}:${row.event_id}`;
    if (!allowed.has(key)) continue;
    if(row.sport==='NFL' && /uniform|jerseys?|costumes?|fantasy/i.test(row.source_title || '')) continue;
    let text = row.context_text;
    let saved;
    try {saved=JSON.parse(text);} catch {}
    if ([3,4,5,6,7].includes(saved?.version)) text=saved.text;
    const game=games.find(g=>g.sport===row.sport && String(g.id)===String(row.event_id));
    const article={headline:row.source_title,description:saved?.description||'',url:row.source_url,
      published:Number(row.source_published)*1000,teamIds:new Set((saved?.teamIds||[]).map(String)),
      eventIds:new Set((saved?.eventIds||[]).map(String))};
    // No cached automatic factor is grandfathered into scoring. Read-time checks
    // cover old ESPN rows, summary news, AI verdicts and dormant GDELT evidence.
    if(!game||saved?.origin==='open-news')continue;
    if(saved?.version===7){
      sourceDocuments??=(await readOpenNewsState(env,now)).documents;
      const candidate={type:row.factor_type,text:saved.text,verification:saved.verification,sourceUrl:row.source_url,expiresAt:saved.expiresAt,evidence:saved.evidence};
      const checked=validatedScoringFactor(candidate,game,now,games,sourceDocuments);
      if(checked&&checked.sourceTitle===row.source_title&&checked.sourcePublished===Number(row.source_published))
        (output[key]||=[]).push(checked);
      continue;
    }
    if(game.state!=='upcoming')continue;
    if(row.factor_type===EDITORIAL_TYPE&&saved?.version===5){
      const candidate=saved.editorialReview,item={id:candidate?.id,game,article};
      if(!acceptEditorialReview(item,candidate,candidate?.review,now))continue;
      (output[key]||=[]).push({type:EDITORIAL_TYPE,text:row.source_title,confidence:Number(row.confidence),verified:true,
        editorialOnly:true,verification:'single-source',scoringEligible:false,
        sourceTitle:row.source_title,sourceDescription:article.description,sourceUrl:row.source_url,
        publishedAt:new Date(article.published).toISOString()});
      continue;
    }
    const expected=row.factor_type===EDITORIAL_TYPE?saved?.discoveredType:row.factor_type;
    if(!ALLOWED_TYPES.has(expected))continue;
    // Reuse independently acquired source documents, not the old row's verdict.
    // This also lets an existing fact retain its points while its scored row is
    // waiting for the rotating research writer to upgrade it to version 7.
    if(row.factor_type!==EDITORIAL_TYPE){
      sourceDocuments??=(await readOpenNewsState(env,now)).documents;
      const proof=verifiedEvidenceFactors(game,sourceDocuments,deterministicFactor,now,games).find(f=>f.type===expected);
      const checked=proof&&validatedScoringFactor(proof,game,now,games,sourceDocuments);
      if(checked){(output[key]||=[]).push(checked);continue;}
    }
    const story=singleSourceDiscovery(article,game,now,expected);
    if(story){
      const stories=output[key]||=[];
      if(!stories.some(s=>s.sourceUrl===story.sourceUrl))stories.push(story);
    }
  }

  for(const key of Object.keys(output)){
    output[key]=distinctEvidenceFactors(output[key]);
    // Public consolidation uses subject, owner and event identity. Sharing a
    // category alone never makes two reports duplicates.
  }

  // The checked-in registry is an independent, reviewed evidence channel. It
  // cannot be populated by an editorial verdict and does not need AI/news slots.
  for(const game of games.filter(Boolean)) {
    const key=`${game.sport}:${game.id}`;
    if(!allowed.has(key)||game.sport!=='CFB')continue;
    const merged=cfbContext.mergeCfbContexts(game,output[key]||[],now);
    if(merged.length)output[key]=merged;
  }
  return output;
}

export {articleMetadata,buildResearchItems,achievementMatchesGame,researchGame,deterministicFactor,evidenceSupportsType,articleMatchesGame,mergeFactors,saveFactors,meaningfulInjuryEvidence,affectedInjuryTeam,pregameStoryEligible,singleSourceDiscovery};

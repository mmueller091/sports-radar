/* Official HTTPS destinations only. Verification and device limits: audit/streaming-watch-links.md. */
(function(root) {
  'use strict';
  const providers = [
    {id:'peacock',name:'Peacock',aliases:/^peacock(?:\s+(?:premium|tv))?$/i,
      sports:'https://www.peacocktv.com/watch/sports',hosts:['www.peacocktv.com','peacocktv.com'],gamePath:/^\/watch\/(?:asset|playback)\/.+/},
    {id:'espn',name:'ESPN',aliases:/^(?:espn(?:\+|\s*plus|[23u]|news|\s+deportes|\s+select|\s+unlimited)?|accn(?:x)?|acc network(?: extra)?|secn(?:\+)?|sec network(?:\+)?)$/i,
      sports:'https://www.espn.com/watch/',hosts:['www.espn.com','espn.com'],gamePath:/^\/watch\/(?:player(?:\/|$)|.*\/player\/)/},
    {id:'paramount',name:'Paramount+',aliases:/^paramount\s*(?:\+|plus)$/i,
      sports:'https://www.paramountplus.com/browse/sports/',hosts:['www.paramountplus.com','paramountplus.com'],gamePath:/^\/(?:shows\/(?:[^/]+\/)?video|sports\/[^/]+\/(?:video|matches))\/.+/},
    {id:'prime',name:'Prime Video',aliases:/^(?:amazon(?: prime(?: video)?)?|prime(?: video)?)$/i,
      sports:'https://www.primevideo.com/sports',hosts:['www.primevideo.com','primevideo.com','www.amazon.com','amazon.com'],gamePath:/^\/(?:detail|dp|gp\/video\/(?:detail|dp))\/.+/},
    {id:'apple',name:'Apple TV',aliases:/^(?:apple\s*tv\s*\+?|mls season pass)$/i,
      sports:'https://tv.apple.com/sports',hosts:['tv.apple.com'],gamePath:/^\/(?:[a-z]{2}\/)?(?:sporting-event|episode)\/.+/}
  ];
  const list = value => Array.isArray(value) ? value : [];
  function labels(value) {
    return typeof value === 'string' ? value.split(/\s*[·,;/|&]\s*/).map(name=>name.trim()).filter(Boolean) : [];
  }
  function officialGameUrl(provider, value) {
    if (typeof value !== 'string' || value.length > 2048 || /[\s\\\u0000-\u001f]/.test(value)) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !provider.hosts.includes(url.hostname)) return '';
      // Reject redirect wrappers and encoded path tricks, even on an official domain.
      if (/%(?:2f|5c|2e)/i.test(url.pathname) || !provider.gamePath.test(url.pathname)) return '';
      if ([...url.searchParams.keys()].some(key=>/^(?:url|uri|redirect.*|return.*|next|dest.*|continue|target)$/i.test(key))) return '';
      if (provider.id === 'espn' && !url.searchParams.get('id') && !/\/(?:id|event)\/[^/]+/.test(url.pathname)) return '';
      return url.href;
    } catch { return ''; }
  }
  function resolve(game, ...sources) {
    const names = labels(game?.channel);
    const candidates = [];
    const addLink = link => {
      if (typeof link === 'string') candidates.push(link);
      else if (link && typeof link === 'object') candidates.push(link.href || link.url);
    };
    const visit = source => {
      if (!source || typeof source !== 'object') return;
      // Only event/broadcast metadata, never highlights, ads, articles or arbitrary nested URLs.
      list(source.links).filter(link=>list(link?.rel).some(rel=>/^(?:watch|stream|live|video)$/i.test(rel))).forEach(addLink);
      for (const broadcast of [...list(source.broadcasts),...list(source.geoBroadcasts)].filter(item=>item && typeof item === 'object')) {
        for (const value of [broadcast.name,broadcast.shortName,broadcast.media?.name,broadcast.media?.shortName,...list(broadcast.names)]) {
          names.push(...labels(typeof value === 'object' ? value?.name : value));
        }
        [broadcast.href,broadcast.url,broadcast.link,broadcast.media?.href,broadcast.media?.url,broadcast.media?.link].forEach(addLink);
        list(broadcast.links).forEach(addLink);
        list(broadcast.media?.links).forEach(addLink);
      }
    };
    visit(game?.sourceEvent);
    visit(game?.sourceCompetition);
    for (const source of sources) {
      visit(source);
      visit(source?.header);
      list(source?.competitions).forEach(visit);
      list(source?.header?.competitions).forEach(visit);
    }
    // This enumerable, validated subset survives Worker JSON serialization and feed caching.
    for (const link of list(game?.watchLinks)) {
      const provider = providers.find(item=>item.id === link?.provider);
      if (provider) {
        names.push(provider.name);
        addLink(link);
      }
    }
    return providers.flatMap(provider=>{
      const matchingNames = names.filter(name=>provider.aliases.test(name));
      if (!matchingNames.length) return [];
      const direct = candidates.map(value=>officialGameUrl(provider,value)).find(Boolean);
      const name = provider.id === 'espn' && matchingNames.some(value=>/^espn(?:\+|\s*plus)$/i.test(value)) ? 'ESPN+' : provider.name;
      return [{provider:provider.id,name,url:direct || provider.sports,direct:!!direct}];
    });
  }
  const api = {resolve,officialGameUrl,providers};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SportsRadarWatch = api;
})(globalThis);

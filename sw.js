const CACHE_NAME = 'sports-radar-shell-__BUILD_REV__';
const REV = '__BUILD_REV__';
const SHELL = ['./', './index.html', './styles.css', './mobile-readability.css', './scoring-runtime.js', './alert-config.js', './notifications.js', './app.js', './teams.json', './manifest.webmanifest', './sports-radar-logo.png', './icon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
    // Fetch every dependency from the same published build before activation.
    await cache.addAll(SHELL.map(path => new Request(path+'?rev='+REV,{cache:'reload'})));
    await self.skipWaiting();
  }));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('sports-radar-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Revisioned assets are immutable: never substitute another build's module.
    if (url.searchParams.has('rev')) {
      return await cache.match(event.request) || fetch(event.request);
    }
    try { return await fetch(event.request); }
    catch { return await cache.match(event.request,{ignoreSearch:true}) || Response.error(); }
  })());
});
self.addEventListener('push',event => {
  let message = {};
  try { message = event.data?.json() || {}; } catch { message = {body:event.data?.text() || ''}; }
  event.waitUntil(self.registration.showNotification(String(message.title || 'Sports Radar'),{
    body:String(message.body || 'A live game just reached your alert threshold.'),
    tag:String(message.tag || 'sports-radar-alert'),
    icon:'./sports-radar-logo.png',badge:'./sports-radar-logo.png',
    data:{url:String(message.url || './#home'),gameId:String(message.gameId || ''),sport:String(message.sport || ''),gameKey:String(message.gameKey || '')}
  }));
});
self.addEventListener('notificationclick',event => {
  event.notification.close();
  event.waitUntil((async () => {
    const scope=new URL(self.registration.scope);
    const data=event.notification.data || {};
    let target;
    try {target=new URL(data.url || './#home',scope);}catch {target=new URL('./#home',scope);}
    if (target.origin!==scope.origin || ![scope.pathname,scope.pathname+'index.html'].includes(target.pathname)) target=new URL('./#home',scope);
    if (['NFL','MLB','NHL','CFB','NBA','NCAAB','Tennis','Soccer'].includes(data.sport) && /^[A-Za-z0-9_-]{1,100}$/.test(data.gameId || '')) {
      target=new URL(`./#game/${encodeURIComponent(data.sport)}/${encodeURIComponent(data.gameId)}`,scope);
    }
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing = windows.find(client => {const url=new URL(client.url);return url.origin===scope.origin && [scope.pathname,scope.pathname+'index.html'].includes(url.pathname);});
    if (existing) {
      try { const navigated=await existing.navigate(target.href);return await (navigated || existing).focus(); }
      catch { /* The window may have closed between matchAll and navigation. */ }
    }
    return self.clients.openWindow(target.href);
  })());
});

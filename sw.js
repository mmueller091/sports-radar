const CACHE_NAME = 'sports-radar-shell-v36';
const SHELL = ['./', './index.html', './styles.css', './rating-core.js', './alert-config.js', './notifications.js', './app.js', './teams.json', './manifest.webmanifest', './sports-radar-logo.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === 'https://sports-radar-alerts.mmueller918.workers.dev' && url.pathname === '/feed') {
    event.respondWith(fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(`${CACHE_NAME}-live`).then(cache => cache.put(event.request, copy)); } return response; }).catch(async () => await caches.match(event.request) || Response.error()));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)); } return response; }).catch(async () => await caches.match(event.request,{ignoreSearch:true}) || Response.error()));
});
self.addEventListener('push',event => {
  let message = {};
  try { message = event.data?.json() || {}; } catch { message = {body:event.data?.text() || ''}; }
  event.waitUntil(self.registration.showNotification(String(message.title || 'Sports Radar'),{
    body:String(message.body || 'A live game just reached your alert threshold.'),
    tag:String(message.tag || 'sports-radar-alert'),
    icon:'./sports-radar-logo.png',badge:'./sports-radar-logo.png',
    data:{url:String(message.url || './#home')}
  }));
});
self.addEventListener('notificationclick',event => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || './#home',self.location.href);
    if (target.origin !== self.location.origin) return;
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing = windows.find(client => new URL(client.url).pathname === target.pathname);
    if (existing) { await existing.navigate(target.href); return existing.focus(); }
    return self.clients.openWindow(target.href);
  })());
});

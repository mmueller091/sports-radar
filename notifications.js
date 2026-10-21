(function () {
  const base = String(globalThis.SPORTS_RADAR_ALERTS_URL || '').replace(/\/$/,'');
  const status = document.querySelector('#alert-status');
  const toggle = document.querySelector('#alert-toggle');
  const test = document.querySelector('#alert-test');
  const threshold = document.querySelector('#alert-threshold');
  const TOKEN_KEY = 'sports-radar-alert-device-token-v1';
  const THRESHOLD_KEY = 'sports-radar-alert-threshold-v1';
  let publicKey = '';
  let enabled = false;
  threshold.value = localStorage.getItem(THRESHOLD_KEY) || '85';
  const note = message => { status.textContent = message; };
  function update() { toggle.textContent = enabled ? 'Turn off alerts' : 'Enable alerts'; toggle.classList.toggle('alert-enabled',enabled); test.hidden = !enabled; }
  function getToken() {
    let value = localStorage.getItem(TOKEN_KEY);
    if (!value) { const bytes = crypto.getRandomValues(new Uint8Array(32)); value = Array.from(bytes,byte => byte.toString(16).padStart(2,'0')).join(''); localStorage.setItem(TOKEN_KEY,value); }
    return value;
  }
  function keyBytes(value) { const text = atob(value.replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from(text,char => char.charCodeAt(0)); }
  function currentThreshold() { const value = Number(threshold.value); return Number.isInteger(value) && value >= 50 && value <= 99 ? value : null; }
  async function api(path,method,body) {
    const response = await fetch(`${base}${path}`,{method,headers:{'Content-Type':'application/json','Authorization':`Bearer ${getToken()}`},body:body ? JSON.stringify(body) : undefined});
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || `Alert service returned ${response.status}`);
    return result;
  }
  async function init() {
    if (!base) { note('Background alerts are not connected yet. The site still refreshes while open.'); return; }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { note('This browser does not support web push alerts. On iPhone, open the site in Safari and Add to Home Screen.'); return; }
    if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches) { note('On iPhone, first add this site to your Home Screen in Safari, then open it from its icon to enable alerts.'); return; }
    try {
      const response = await fetch(`${base}/config`,{cache:'no-store'});
      if (!response.ok) throw new Error('Alert service is unavailable');
      publicKey = (await response.json()).publicKey || '';
      if (!publicKey) throw new Error('Alert service is not configured');
      const registration = await navigator.serviceWorker.ready;
      enabled = Boolean(await registration.pushManager.getSubscription() && localStorage.getItem(TOKEN_KEY));
      update(); toggle.disabled = false;
      note(enabled ? `Alerts are on for games reaching ${threshold.value}+. Use Send test to check your phone.` : 'Ready. Turn on alerts and allow notifications when asked.');
    } catch (error) { note(`Background alerts are unavailable: ${error.message}`); }
  }
  toggle.addEventListener('click',async () => {
    toggle.disabled = true;
    try {
      if (enabled) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) await subscription.unsubscribe();
        try { await api('/subscription','DELETE'); } catch (error) { note(`Alerts stopped on this device. The server could not be updated: ${error.message}`); }
        enabled = false; update(); note('Alerts are off on this device.');
      } else {
        const value = currentThreshold(); if (value == null) throw new Error('Choose a rating from 50 to 99.');
        if (Notification.permission === 'denied') throw new Error('Notifications are blocked in your browser settings.');
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Notification permission was not granted.');
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) subscription = await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(publicKey)});
        await api('/subscription','PUT',{subscription:subscription.toJSON(),threshold:value});
        localStorage.setItem(THRESHOLD_KEY,String(value));
        enabled = true; update(); note(`Alerts are on for live games reaching ${value}+. The server checks about once a minute.`);
      }
    } catch (error) { note(`Could not change alerts: ${error.message}`); }
    toggle.disabled = false;
  });
  threshold.addEventListener('change',async () => {
    const value = currentThreshold();
    if (value == null) { note('Choose a rating from 50 to 99.'); return; }
    localStorage.setItem(THRESHOLD_KEY,String(value));
    if (!enabled) return;
    try { const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); if (!subscription) throw new Error('Browser subscription has expired.'); await api('/subscription','PUT',{subscription:subscription.toJSON(),threshold:value}); note(`Alert threshold updated to ${value}+. Changes are saved on this device.`); }
    catch (error) { note(`Could not save threshold: ${error.message}`); }
  });
  test.addEventListener('click',async () => { test.disabled = true; try { await api('/test','POST'); note('Test sent. Check your notifications.'); } catch (error) { note(`Test failed: ${error.message}`); } test.disabled = false; });
  init();
})();

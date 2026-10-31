(function () {
  const base=String(globalThis.SPORTS_RADAR_ALERTS_URL || '').replace(/\/$/,'');
  const $=selector=>document.querySelector(selector);
  const status=$('#alert-status'),toggle=$('#alert-toggle'),test=$('#alert-test'),threshold=$('#alert-threshold');
  const TOKEN_KEY='sports-radar-alert-device-token-v1',THRESHOLD_KEY='sports-radar-alert-threshold-v1',PREFS_KEY='sports-radar-notification-preferences-v1';
  const sports={NFL:'NFL',MLB:'MLB',NHL:'NHL',CFB:'College Football',NBA:'NBA',NCAAB:'NCAAM',Tennis:'Tennis',Soccer:'Soccer'};
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)) ?? fallback;}catch{return fallback;}};
  const saved=read(PREFS_KEY,null);
  let preferences={enabled:saved?.preferences?.enabled===true,sports:saved?.preferences?.sports || Object.keys(sports),teams:saved?.preferences?.teams || []};
  let pending=saved?.pending===true,publicKey='',subscription=null,available=false,busy=false,saveChain=Promise.resolve(),teamResults=[],favoriteResults=[];
  threshold.value=String(saved?.threshold || read(THRESHOLD_KEY,85));
  const note=message=>{status.textContent=message;};
  const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const teamKey=team=>`${team.sport}:${team.id}`;
  const currentThreshold=()=>{const n=Number(threshold.value);return Number.isInteger(n)&&n>=50&&n<=99?n:null;};
  function persist() {
    try {localStorage.setItem(PREFS_KEY,JSON.stringify({preferences,threshold:currentThreshold() || 85,pending}));localStorage.setItem(THRESHOLD_KEY,threshold.value);} catch {note('Browser storage is unavailable. Keep this window open until your preferences finish saving.');}
  }
  function token() {
    let value=localStorage.getItem(TOKEN_KEY);
    if (!value) {value=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');localStorage.setItem(TOKEN_KEY,value);}
    return value;
  }
  async function api(path,method='GET',body) {
    const response=await fetch(base+path,{method,cache:'no-store',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${token()}`},body:body ? JSON.stringify(body) : undefined});
    const result=await response.json();if(!response.ok || result.error)throw new Error(result.error || `Notification service returned ${response.status}`);return result;
  }
  function update() {
    toggle.textContent=preferences.enabled?'Notifications on — turn off':'Enable notifications';
    toggle.setAttribute('aria-checked',String(preferences.enabled));toggle.classList.toggle('alert-enabled',preferences.enabled);toggle.disabled=busy || (!available && !preferences.enabled);
    test.hidden=!preferences.enabled;
    $('#notification-sports').innerHTML=Object.entries(sports).map(([id,label])=>`<label class="toggle-option"><input type="checkbox" data-notification-sport="${id}"${preferences.sports.includes(id)?' checked':''}><span>${label}</span></label>`).join('');
    $('#notification-selected-teams').innerHTML=preferences.teams.map((team,index)=>`<button type="button" data-remove-notification-team="${index}" aria-label="Remove ${escape(team.name || team.id)} notifications">${escape(team.name || team.id)} · ${escape(sports[team.sport])} ×</button>`).join('') || '<span class="preference-note">No individual teams selected.</span>';
    renderTeams();
  }
  function queueSave() {
    const value=currentThreshold();if(value===null){note('Choose an excitement rating from 50 to 99.');return Promise.reject(new Error('Invalid threshold'));}
    pending=true;persist();
    const snapshot=JSON.stringify({preferences,threshold:value});
    const body={...JSON.parse(snapshot),...(subscription?{subscription:subscription.toJSON()}: {})};
    const operation=saveChain.catch(()=>{}).then(async()=>{
      if(!base)throw new Error('Notification service is not connected');
      await api('/subscription','PUT',body);
      if(snapshot===JSON.stringify({preferences,threshold:currentThreshold()})){pending=false;persist();note(preferences.enabled?`Notifications on at ${value}+. Sports and teams are saved for this subscription.`:'Notifications off. Your sports, teams, and threshold are saved.');}
    });
    saveChain=operation;
    operation.catch(error=>{note(`Not synced yet: ${error.message}. Your choices will retry when you reopen Settings or reconnect.`);});
    return operation;
  }
  function renderTeams() {
    const directory=globalThis.SportsRadarTeams;if(!directory)return;
    teamResults=directory.search($('#notification-team-query').value,$('#notification-team-sport').value);
    const selected=new Set(preferences.teams.map(teamKey));
    $('#notification-team-count').textContent=teamResults.length>30?`Showing 30 of ${teamResults.length} teams. Narrow your search to find any available team.`:`${teamResults.length} available team${teamResults.length===1?'':'s'}`;
    $('#notification-team-results').innerHTML=teamResults.slice(0,30).map((team,index)=>`<button type="button" data-notification-team="${index}" aria-pressed="${selected.has(teamKey(team))}"><span>${escape(team.name)}</span><small>${escape(sports[team.sport])} · ${selected.has(teamKey(team))?'Selected':'Add'}</small></button>`).join('');
    favoriteResults=directory.favorites();
    $('#notification-favorites').innerHTML=favoriteResults.map((team,index)=>`<button type="button" data-notification-favorite="${index}" aria-pressed="${selected.has(teamKey(team))}">${escape(team.name)}${selected.has(teamKey(team))?' ✓':''}</button>`).join('') || '<p class="preference-note">Add favorite teams above for quick access here.</p>';
    $('#notification-add-favorites').disabled=!favoriteResults.length;
  }
  function addTeam(team) {
    if(!team?.id)return;
    const index=preferences.teams.findIndex(item=>teamKey(item)===teamKey(team));
    if(index>=0)preferences.teams.splice(index,1);
    else if(preferences.teams.length<200)preferences.teams.push({sport:team.sport,id:String(team.id),name:team.name});
    else {note('You can select up to 200 teams. Remove a team before adding another.');return;}
    update();queueSave().catch(()=>{});
  }
  $('#notification-sports').addEventListener('change',event=>{
    const sport=event.target.dataset.notificationSport;if(!sports[sport])return;
    preferences.sports=event.target.checked?[...new Set([...preferences.sports,sport])]:preferences.sports.filter(item=>item!==sport);
    queueSave().catch(()=>{});
  });
  $('#notification-team-results').addEventListener('click',event=>{const b=event.target.closest('[data-notification-team]');if(b)addTeam(teamResults[Number(b.dataset.notificationTeam)]);});
  $('#notification-favorites').addEventListener('click',event=>{const b=event.target.closest('[data-notification-favorite]');if(b)addTeam(favoriteResults[Number(b.dataset.notificationFavorite)]);});
  $('#notification-selected-teams').addEventListener('click',event=>{const b=event.target.closest('[data-remove-notification-team]');if(b){preferences.teams.splice(Number(b.dataset.removeNotificationTeam),1);update();queueSave().catch(()=>{});}});
  $('#notification-add-favorites').addEventListener('click',()=>{for(const team of favoriteResults){if(preferences.teams.length>=200)break;if(!preferences.teams.some(item=>teamKey(item)===teamKey(team)))preferences.teams.push({sport:team.sport,id:String(team.id),name:team.name});}update();queueSave().catch(()=>{});});
  $('#notification-team-query').addEventListener('input',renderTeams);$('#notification-team-sport').addEventListener('change',renderTeams);
  threshold.addEventListener('change',()=>{queueSave().catch(()=>{});});
  toggle.addEventListener('click',async()=>{
    busy=true;update();
    try {
      if(preferences.enabled) {
        preferences.enabled=false;update();
        pending=true;persist();
        if(!subscription && 'serviceWorker' in navigator)subscription=await (await navigator.serviceWorker.ready).pushManager.getSubscription();
        if(subscription){await subscription.unsubscribe().catch(()=>{});subscription=null;}
        try {await queueSave();}
        catch(error) {if(subscription){await subscription.unsubscribe();subscription=null;}await api('/subscription','DELETE').catch(()=>{});note(`Notifications stopped in this browser. Server sync will retry: ${error.message}`);}
      } else {
        if(currentThreshold()===null)throw new Error('Choose an excitement rating from 50 to 99.');
        if(Notification.permission==='denied')throw new Error('Notifications are blocked in browser settings.');
        const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
        if(permission!=='granted')throw new Error('Notification permission was not granted.');
        const registration=await navigator.serviceWorker.ready;
        subscription=await registration.pushManager.getSubscription();
        if(!subscription){const text=atob(publicKey.replace(/-/g,'+').replace(/_/g,'/'));subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(text,c=>c.charCodeAt(0))});}
        preferences.enabled=true;
        try {await queueSave();}catch(error){preferences.enabled=false;pending=true;persist();await subscription?.unsubscribe().catch(()=>{});subscription=null;await api('/subscription','DELETE').catch(()=>{});throw error;}
      }
    } catch(error){note(`Could not change notifications: ${error.message}`);}
    finally {busy=false;update();}
  });
  test.addEventListener('click',async()=>{test.disabled=true;try{await api('/test','POST');note('Test sent. Check your notifications.');}catch(error){note(`Test failed: ${error.message}`);}finally{test.disabled=false;}});
  async function init() {
    update();
    const directory=globalThis.SportsRadarTeams;
    if(directory){$('#notification-team-sport').innerHTML='<option value="all">All sports</option>'+Object.entries(sports).filter(([id])=>id!=='Tennis').map(([id,label])=>`<option value="${id}">${label}</option>`).join('');directory.load().then(renderTeams).catch(()=>{});renderTeams();}
    if(!base){note('Background notifications are not connected.');return;}
    const ios=/iPhone|iPad|iPod/.test(navigator.userAgent || '') || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
    const installed=Boolean(navigator.standalone || globalThis.matchMedia?.('(display-mode: standalone)').matches);
    available='serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && (!ios || installed);
    try {
      if(available){const config=await fetch(base+'/config',{cache:'no-store'});if(!config.ok)throw new Error('Notification service unavailable');publicKey=(await config.json()).publicKey || '';if(!publicKey)throw new Error('Notification service is not configured');subscription=await (await navigator.serviceWorker.ready).pushManager.getSubscription();}
      const remote=await api('/subscription');
      if(!pending){preferences=remote.preferences;threshold.value=String(remote.threshold);}
      if(preferences.enabled && available && !subscription){preferences.enabled=false;pending=true;}
      if(pending)await queueSave();else persist();
      update();
      note(!available?(ios?'Install Sports Radar using Safari below, then open its Home Screen icon to enable notifications.':'This browser cannot receive Web Push. Your choices are saved; use a supported installed browser app to enable notifications.'):preferences.enabled?`Notifications on at ${threshold.value}+. The server checks about once a minute, even while the app is closed.`:'Notifications off. Choose your sports and teams, then enable notifications.');
    } catch(error){note(`Notification preferences need to sync: ${error.message}`);update();}
  }
  document.addEventListener('sports-radar:favorites-changed',renderTeams);
  $('#profile-button').addEventListener('click',()=>{renderTeams();if(pending)queueSave().catch(()=>{});});
  window.addEventListener('online',()=>{if(pending)queueSave().catch(()=>{});});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

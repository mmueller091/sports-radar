// Scheduling/cache policy only. Rating functions remain in game-model.js.
export const REFRESH_DEADLINE_MS = 25000;
export const REFRESH_LEASE_MS = 30000;
export const FEED_WAIT_MS = 8000;

export function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined)
    .map(key=>[key,ordered(value[key])]));
}

export async function fingerprint(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(ordered(value)));
  const hash = await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function summaryCandidate(game) {
  return (game.state!=='upcoming' || !game.line) && !(game.division==='FCS' && game.state==='upcoming');
}

export function reusable(game,prior,metadata,input,model) {
  return game.state!=='live' && prior?.state===game.state && metadata?.model===model &&
    metadata.input===input && Boolean(metadata.summaryHash);
}

// Deadline is shared by critical work and maintenance. HTTP cancellation is not
// this signal: waitUntil owns the job after the response/client disconnect.
export function refreshBudget(now,options={}) {
  const clock = options.clock || (()=>performance.now());
  const started = clock();
  const controller = new AbortController();
  const limit = options.deadlineMs ?? REFRESH_DEADLINE_MS;
  const timer = setTimeout(()=>controller.abort(new Error('Refresh deadline')),limit);
  const elapsed = () => Math.max(0,clock()-started);
  return {
    signal:controller.signal, elapsed, time:()=>now+Math.floor(elapsed()),
    stats:{providerRequests:0,providerTimeouts:0,providerFailures:0},
    check() {
      if (controller.signal.aborted || elapsed()>=limit) throw new Error('Refresh deadline');
    },
    close() { clearTimeout(timer);controller.abort(new Error('Refresh finished')); }
  };
}

export async function boundedFeedRefresh(work,previous,ctx,waitMs=FEED_WAIT_MS) {
  // Register before awaiting anything so a disconnected browser cannot orphan it.
  ctx?.waitUntil(work);
  let timer;
  try {
    return await Promise.race([work,new Promise(resolve=>{
      timer=setTimeout(()=>resolve(previous),waitMs);
    })]);
  } finally { clearTimeout(timer); }
}

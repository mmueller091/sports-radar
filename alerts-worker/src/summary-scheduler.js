const ACCELERATED_SPORTS = new Set(['NFL','CFB','NCAAB','NHL','MLB','NBA']);
const CONCURRENCY = 6;

// Keep provider ownership, validation and publication in the caller. Only the
// six enabled sports may fill an open slot before the rest of a group finishes.
export async function forEachSummary(entries,visit,{accelerated=false}={}) {
  let failed=false,failure;
  const run=async index=>{
    try {await visit(entries[index],index);}
    catch(error){if(!failed){failed=true;failure=error;}throw error;}
  };
  if(accelerated&&entries.every(entry=>ACCELERATED_SPORTS.has(entry.game?.sport))){
    let next=0;
    const worker=async()=>{
      while(!failed&&next<entries.length)await run(next++);
    };
    // Drain admitted work before returning an error. No sibling can keep
    // changing shared refresh state after the caller releases its lease.
    await Promise.allSettled(Array.from({length:Math.min(CONCURRENCY,entries.length)},worker));
  }else{
    for(let start=0;start<entries.length&&!failed;start+=CONCURRENCY){
      await Promise.allSettled(entries.slice(start,start+CONCURRENCY).map((_,offset)=>run(start+offset)));
    }
  }
  if(failed)throw failure;
}

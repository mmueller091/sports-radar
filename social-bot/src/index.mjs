import {runCycle} from './engine.mjs';

export default {
  async fetch(request,env){
    if(request.method!=='GET'||new URL(request.url).pathname!=='/health')
      return new Response('Not found',{status:404});
    return Response.json({ok:true,component:'slatemeter-social-bot',
      postingEnabled:env.POSTING_ENABLED==='true',
      expectedModel:env.EXPECTED_SCORING_MODEL||null});
  },
  async scheduled(event,env){
    try{
      const outcome=await runCycle(env);
      console.log(JSON.stringify({event:'social-cron',...outcome}));
    }catch(error){
      console.error(JSON.stringify({event:'social-cron-error',
        message:error instanceof Error?error.message:String(error)}));
      throw error;
    }
  }
};

const API_URL='https://api.buffer.com';
export const CREATE_POST=`mutation SlateMeterImmediatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess { post { id text status } }
    ... on MutationError { message }
  }
}`;

async function bufferQuery(apiKey,query,fetchImpl){
  const response=await fetchImpl(API_URL,{method:'POST',headers:{'Content-Type':'application/json',
    Authorization:`Bearer ${apiKey}`},body:JSON.stringify({query}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`Buffer read-only query failed: ${response.status}`);
  const data=await response.json();
  if(data?.errors?.length)throw new Error('Buffer read-only query rejected');
  return data?.data;
}

/** Resolve exactly one connected X channel without creating a post. */
export async function discoverXChannel(apiKey,{fetchImpl=fetch,expectedHandle=''}={}){
  const account=await bufferQuery(apiKey,'query { account { organizations { id } } }',fetchImpl);
  const organizations=account?.account?.organizations;
  if(!Array.isArray(organizations)||organizations.length<1)throw new Error('No Buffer organizations');
  const matches=[];
  for(const org of organizations){
    if(!/^[A-Za-z0-9_-]{1,120}$/.test(String(org.id||'')))throw new Error('Invalid organization ID');
    const data=await bufferQuery(apiKey,`query { channels(input:{organizationId:${JSON.stringify(org.id)}}) { id name displayName service } }`,fetchImpl);
    for(const channel of data?.channels||[]){
      if(!['twitter','x'].includes(String(channel.service||'').toLowerCase()))continue;
      const actual=String(channel.name||channel.displayName||'').replace(/^@/,'').toLowerCase();
      if(expectedHandle && actual!==expectedHandle.replace(/^@/,'').toLowerCase())continue;
      matches.push(channel);
    }
  }
  if(matches.length!==1)throw new Error(`Expected exactly one matching Buffer X channel; found ${matches.length}`);
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(String(matches[0].id||'')))throw new Error('Invalid Buffer channel ID');
  return {id:String(matches[0].id),name:String(matches[0].name||matches[0].displayName||'')};
}

/**
 * A successful response confirms Buffer accepted the post, not that X has
 * delivered it. Unknown outcomes MUST NOT be retried blindly.
 */
export async function sendToBuffer({apiKey,channelId,text,fetchImpl=fetch}){
  if(!apiKey||!channelId||!text)throw new Error('Missing Buffer configuration');
  let response;
  try{
    response=await fetchImpl(API_URL,{method:'POST',headers:{
      'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},
      body:JSON.stringify({query:CREATE_POST,variables:{input:{text,channelId,
        schedulingType:'automatic',mode:'shareNow'}}}),signal:AbortSignal.timeout(12000)});
  }catch{return {status:'delivery_unknown',reason:'transport-failed'};}
  if(response.status===401||response.status===403||response.status===429)
    return {status:'rejected',reason:`http-${response.status}`};
  if(!response.ok)return {status:'delivery_unknown',reason:`http-${response.status}`};
  try{
    const length=Number(response.headers?.get('content-length')||0);
    if(length>100_000)return {status:'delivery_unknown',reason:'response-too-large'};
    const data=await response.json();
    const result=data?.data?.createPost;
    if(result?.post?.id)return {status:'accepted',postId:String(result.post.id)};
    if(typeof result?.message==='string')return {status:'rejected',reason:'buffer-mutation-error'};
    return {status:'delivery_unknown',reason:'unrecognized-response'};
  }catch{return {status:'delivery_unknown',reason:'invalid-response'};}
}

import {canonicalVersion} from './upstream-policy.mjs';

/** Optional CI read credential. It is never attached to registry, content,
 * arbitrary repository, mutable branch or redirected requests. The public
 * reader still enforces its existing response bounds and identity checks. */
export function createUpstreamMetadataFetcher({token='',fetcher=fetch}={}) {
  if(typeof token!=='string'||token.length>4096||token&&!/^[A-Za-z0-9_.-]+$/.test(token))throw new Error('Upstream metadata credential refused.');
  return async function upstreamMetadata(input,init={}) {
    let target,label,github=false;
    try {
      target=new URL(input);
      if(target.username||target.password||target.hash||init.method!==undefined&&init.method!=='GET'||init.body!==undefined&&init.body!==null)throw new Error();
      if(target.origin==='https://api.github.com') {
        const prefix='/repos/deepseek-ai/deepseek-harness/git/',path=target.pathname.slice(prefix.length);
        if(!target.pathname.startsWith(prefix))throw new Error();
        if(path.startsWith('ref/tags/dsh-v')&&canonicalVersion(path.slice('ref/tags/dsh-v'.length))&&!target.search)label='GitHub tag';
        else if(/^tags\/[a-f0-9]{40}$/.test(path)&&!target.search)label='GitHub tag';
        else if(/^trees\/[a-f0-9]{40}$/.test(path)&&['','?recursive=1'].includes(target.search))label='GitHub tree';
        else throw new Error();
        github=true;
      } else if(target.origin==='https://registry.npmjs.org'&&!target.search) {
        const match=decodeURIComponent(target.pathname).match(/^\/@deepseek-ai\/[a-z0-9-]+\/([^/]+)$/);
        if(!match||match[1]!=='next'&&!canonicalVersion(match[1]))throw new Error();
        label='npm publication';
      } else throw new Error();
    } catch {throw new Error('Upstream metadata request refused.');}
    init.signal?.throwIfAborted();
    const headers={'Accept':'application/json','User-Agent':'DSH-zhen-upstream-check/0.1.0'};
    if(github&&token)headers.Authorization='Bearer '+token;
    let response;
    try {response=await fetcher(target.href,{method:'GET',redirect:'error',credentials:'omit',signal:init.signal,headers});}
    catch {init.signal?.throwIfAborted();throw new Error(label+' metadata unavailable.');}
    if(!response.ok||!response.body) {
      await response.body?.cancel().catch(()=>{});
      throw new Error(label+' metadata unavailable (HTTP '+response.status+').');
    }
    return response;
  };
}

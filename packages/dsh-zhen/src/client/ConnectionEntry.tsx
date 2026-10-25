import React, {useEffect, useState} from 'react';
import type {ZhenRemote} from 'dsh-zhen/remote';

type Api=Pick<ZhenRemote,'status'>;
type State={api:Api;configured:boolean}|{api:Api;failed:true};

/** Public conversation-header entry; reads only credential availability. */
export function ConnectionEntry({api,onOpen}:{api:Api;onOpen:()=>void}):React.ReactElement|null {
  const [state,setState]=useState<State>();
  useEffect(()=>{
    let active=true;
    void api.status().then(result=>{
      if(!result.ok)throw result.error;
      if(typeof result.value.credentialConfigured!=='boolean')throw Error('Connection status unavailable');
      if(active)setState({api,configured:result.value.credentialConfigured});
    }).catch(()=>{if(active)setState({api,failed:true});});
    return()=>{active=false;};
  },[api]);
  const current=state?.api===api?state:undefined;
  if(current&&'configured'in current&&current.configured)return null;
  const missing=current&&'configured'in current&&!current.configured;
  const label=missing?'连接 Seedance':current&&'failed'in current?'检查 Seedance 连接':'连接与设置';
  return <button type="button" className="zhen-connection-entry" title={missing?'添加 API 令牌后，即可使用默认 Flash 模型。':'打开连接设置，核对 Seedance 状态。'} onClick={onOpen}>{label}</button>;
}

export type WorkspaceSection='home'|'settings'|'knowledge'|'market'|'connections'|'updates'|'art'|'tasks'|'backup';
export interface WorkspaceNavigation{
  current():WorkspaceSection;
  open(section:WorkspaceSection):void;
  subscribe(listener:(section:WorkspaceSection)=>void):()=>void;
  dispose():void;
}
/** Per-client-plugin memory only. A route chosen before the workspace mounts is retained. */
export function createWorkspaceNavigation():WorkspaceNavigation{
  let section:WorkspaceSection='home',closed=false;
  const listeners=new Set<(section:WorkspaceSection)=>void>();
  return{
    current:()=>section,
    open(next){if(closed||next===section)return;section=next;for(const listener of [...listeners])listener(section);},
    subscribe(listener){if(closed)return()=>{};listeners.add(listener);return()=>{listeners.delete(listener);};},
    dispose(){closed=true;listeners.clear();},
  };
}

import type {Context} from '@deepseek-ai/cordis';
import type {SkillCandidate,SkillDefinition,SkillLookupOptions,SkillProvider,SkillProviderControl,SkillProviderObservation} from '@deepseek-ai/dsh-skill';
import {FileSystemSkillProvider} from '@deepseek-ai/dsh-skill-filesystem';
import {watchFile,unwatchFile} from 'node:fs';
import {join} from 'node:path';
import {backupJsonString} from './backup-data.ts';
import {BackupError} from './backup-archive.ts';
import {RESTORED_SKILL_PROJECTS_FILE,readRestoredSkillProjects,restoredSkillProjectFileVersion,skillPathKey,assertRestoredSkillDirectory,assertRestoredSkillPin,assertRestoredSkillBoundary} from './restored-skill-projects.ts';
import type {RestoredSkillProjects} from './restored-skill-projects.ts';

type Snapshot=NonNullable<ReturnType<typeof readRestoredSkillProjects>>;
type Project=RestoredSkillProjects['projects'][number];
type ProviderRow=RestoredSkillProjects['providers'][number];
interface Reader{current():Snapshot|null;subscribe(invalidate:()=>void):()=>void;}
/** One document watcher shared by the active profile's providers. */
class ProjectReader implements Reader{
 private readonly listeners=new Set<()=>void>();private signature:string;private cached:Snapshot|null;private readonly file:string;private closed=false;
 constructor(private readonly home:string,initial:Snapshot){this.cached=initial;this.signature=initial.signature;this.file=join(home,'dsh-zhen',RESTORED_SKILL_PROJECTS_FILE);watchFile(this.file,{interval:200,persistent:false},this.changed);}
 private readonly changed=()=>{if(this.closed)return;this.current();};
 current():Snapshot|null{if(this.closed)return null;let value:Snapshot|null;try{const stamp=restoredSkillProjectFileVersion(this.home);value=stamp!==null&&stamp===this.cached?.fileVersion?this.cached:readRestoredSkillProjects(this.home);}catch{value=null;}this.cached=value;const signature=value?.signature??'unavailable';if(signature!==this.signature){this.signature=signature;for(const invalidate of this.listeners)invalidate();}return value;}
 subscribe(invalidate:()=>void):()=>void{this.listeners.add(invalidate);return()=>this.listeners.delete(invalidate);}
 close():void{if(this.closed)return;this.closed=true;unwatchFile(this.file,this.changed);this.listeners.clear();}
}
export interface RestoredFilesystemProvider extends SkillProvider{dispose():Promise<void>;}
interface Delegate{key:string;value:FileSystemSkillProvider;abort:AbortController;close():Promise<void>;}
interface View{snapshot:Snapshot;row:ProviderRow;project?:Project;scope:string;delegate:Delegate;options:SkillLookupOptions;}
const scope=(options:SkillLookupOptions)=>options.cwd===undefined?'':skillPathKey(options.cwd);

/** The SDK still parses skills, ranks sources, watches files and supplies
 * relative resources. This adapter only selects the reviewed project portal.
 * Pending manifests read no skill roots; stale candidates cannot cross cwd or
 * document revisions, even when the public registry has cached its catalog. */
export function createRestoredFilesystemProvider(ctx:Context,control:SkillProviderControl,reader:Reader,profile:string,id:string,name:string):RestoredFilesystemProvider{
 let closed=false,current:Delegate|undefined,tail=Promise.resolve(),disposal:Promise<void>|undefined;
 const candidates=new WeakMap<SkillCandidate,{view:View;candidate:SkillCandidate}>(),watched=new Map<string,()=>void>();
 const unsubscribe=reader.subscribe(control.invalidate);
 function watchDirectory(path:string):void{const key=skillPathKey(path),previous=watched.get(key);if(previous){watched.delete(key);watched.set(key,previous);return;}const changed=()=>{if(!closed&&!control.signal.aborted)control.invalidate();};watchFile(path,{interval:250,persistent:false},changed);watched.set(key,()=>unwatchFile(path,changed));while(watched.size>128){const first=watched.keys().next().value!;watched.get(first)!();watched.delete(first);}}
 function check(options:SkillLookupOptions):void{options.signal?.throwIfAborted();control.signal.throwIfAborted();if(closed)throw new BackupError('BACKUP_SKILL_PROJECT_PROVIDER_CLOSED');}
 async function delegate(row:ProviderRow):Promise<Delegate>{let result:Delegate;const key=backupJsonString(row.config),next=tail.then(async()=>{if(current?.key===key){result=current;return;}const old=current;current=undefined;await old?.close();control.signal.throwIfAborted();if(closed)throw new BackupError('BACKUP_SKILL_PROJECT_PROVIDER_CLOSED');const abort=new AbortController(),cancel=()=>abort.abort(control.signal.reason);control.signal.addEventListener('abort',cancel,{once:true});const value=new FileSystemSkillProvider(ctx,{signal:abort.signal,invalidate:control.invalidate},row.config);let stopped:Promise<void>|undefined;result=current={key,value,abort,close(){if(stopped)return stopped;control.signal.removeEventListener('abort',cancel);abort.abort();return stopped=value.dispose();}};});tail=next.then(()=>{},()=>{});await next;return result!;}
 async function validate(view:View):Promise<boolean>{const now=reader.current();if(!now||now.signature!==view.snapshot.signature||now.document.pending)return false;for(const pin of view.row.pins)await assertRestoredSkillPin(now.document.root,pin);if(view.project){await assertRestoredSkillDirectory(view.project.directory,view.project.identity);await assertRestoredSkillDirectory(view.project.root,view.project.rootIdentity);await assertRestoredSkillBoundary(view.project.root,view.project.boundaryIdentity);for(const pin of view.project.pins)await assertRestoredSkillPin(now.document.root,pin);}return reader.current()?.signature===view.snapshot.signature;}
 async function view(options:SkillLookupOptions):Promise<View|undefined>{check(options);const snapshot=reader.current();if(!snapshot||snapshot.document.pending)return;const row=snapshot.document.providers.find(row=>row.profile===profile&&row.id===id);if(!row?.enabled||(row.config.providerName??'filesystem')!==name)return;const project=options.cwd===undefined?undefined:snapshot.document.projects.find(row=>skillPathKey(row.directory)===scope(options));if(project)watchDirectory(project.directory);const active=await delegate(row),signal=AbortSignal.any([control.signal,active.abort.signal,...options.signal?[options.signal]:[]]),result:View={snapshot,row,project,scope:scope(options),delegate:active,options:{...options,cwd:project?.root,signal}};if(!await validate(result))return;return result;}
 async function safe<T>(options:SkillLookupOptions,run:()=>Promise<T>,fallback:T):Promise<T>{check(options);try{return await run();}catch{options.signal?.throwIfAborted();control.signal.throwIfAborted();control.invalidate();return fallback;}}
 const provider:RestoredFilesystemProvider={name,
  list:async options=>safe<readonly SkillCandidate[]|SkillProviderObservation>(options,async()=>{const currentView=await view(options);if(!currentView)return reader.current()?.document.pending?[]:{candidates:[],complete:false};const observed=await currentView.delegate.value.list(currentView.options);if(!await validate(currentView)){control.invalidate();return{candidates:[],complete:false};}const rows=Array.isArray(observed)?observed:(observed as SkillProviderObservation).candidates,mapped=rows.map(candidate=>{const entry={...candidate};candidates.set(entry,{view:currentView,candidate});return entry;});return Array.isArray(observed)?mapped:{candidates:mapped,complete:(observed as SkillProviderObservation).complete};},{candidates:[],complete:false}),
  get:async(candidate,options)=>safe<SkillDefinition|undefined>(options,async()=>{const saved=candidates.get(candidate);if(!saved||saved.view.scope!==scope(options))return;const currentView=await view(options);if(!currentView||saved.view.snapshot.signature!==currentView.snapshot.signature||saved.view.delegate!==currentView.delegate)return;const definition=await currentView.delegate.value.get(saved.candidate,currentView.options);if(!await validate(currentView)){control.invalidate();return;}return definition;},undefined),
  dispose(){if(disposal)return disposal;closed=true;unsubscribe();for(const stop of watched.values())stop();watched.clear();current?.abort.abort();return disposal=tail.then(async()=>{const active=current;current=undefined;await active?.close();});},
 };
 control.signal.addEventListener('abort',()=>{void provider.dispose().catch(()=>{});},{once:true});return provider;
}

/** Called only during normal Host mounting (tests use an isolated TEMP home).
 * Profiles without this new document retain their ordinary behavior. */
export function registerRestoredSkillProviders(ctx:Context,home:string,profile:string|undefined):void{
 const initial=readRestoredSkillProjects(home);if(!initial||profile===undefined)return;
 const rows=initial.document.providers.filter(row=>row.profile===profile&&row.enabled);if(!rows.length)return;
 ctx.inject(['skills'],inner=>{const reader=new ProjectReader(home,initial),providers:RestoredFilesystemProvider[]=[],stops:Array<()=>void>=[];for(const row of rows)stops.push(inner.skills.registerProvider(control=>{const provider=createRestoredFilesystemProvider(inner,control,reader,profile,row.id,String(row.config.providerName??'filesystem'));providers.push(provider);return provider;}));inner.effect(()=>async()=>{reader.close();for(const stop of stops)stop();await Promise.all(providers.map(provider=>provider.dispose()));});});
}

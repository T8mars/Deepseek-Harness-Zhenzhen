import type {Context} from '@deepseek-ai/cordis';
import {symbols} from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-app-boot';
import {BackupError} from './backup-archive.ts';
import type {PackageBackupSource,PackageBackupSeed} from './backup-package-graph.ts';

export interface HostPackageBackupPolicy {
  seeds?:readonly PackageBackupSeed[];
  protectedContainers:readonly string[];
  forbiddenTrees:readonly string[];
}
const facades=new WeakMap<object,WeakMap<object,PackageBackupSource['lookup']>>();
/** Read the already running public service only. Creating another resolver here
 * would change the Host's module interception and its worker generation. */
export function hostPackageBackupSource(ctx:Context,policy:HostPackageBackupPolicy):PackageBackupSource{
  const scoped=ctx.get('pluginPackages');if(!scoped||typeof scoped.packageOf!=='function')throw new BackupError('BACKUP_HOST_PACKAGES_UNAVAILABLE');
  // Cordis4.0.5 exports symbols.original. Only use it to identify the provider;
  // delegate operations through the caller-scoped wrapper, never private state.
  const original:object=Reflect.get(scoped,symbols.original)??scoped;if(!original||!['object','function'].includes(typeof original))throw new BackupError('BACKUP_HOST_PACKAGES_UNAVAILABLE');let owners=facades.get(ctx);if(!owners){owners=new WeakMap();facades.set(ctx,owners);}let lookup=owners.get(original);if(!lookup){lookup={get resolution(){return scoped.resolution;},packageOf(specifier,parentURL){return scoped.packageOf(specifier,parentURL);}};owners.set(original,lookup);}
  return {lookup,seeds:policy.seeds??[],protectedContainers:[...policy.protectedContainers],forbiddenTrees:[...policy.forbiddenTrees]};
}

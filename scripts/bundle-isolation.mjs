// Dependency-free: usable before the bootstrap has prepared npm dependencies.
import {createRequire} from 'node:module';
import {realpathSync,lstatSync} from 'node:fs';
import {join} from 'node:path';

const repair='检测到旧开发依赖会覆盖已安装扩展。请关闭本应用后，运行 start-dsh-zhen.cmd 自动修复；仍未解决时运行 repair-dsh-zhen.cmd。现有资料和配置保持不变。';

/** Match the published CLI's physical installation anchor. Changing cwd does
 * not change this resolution. No plugin imports, profile reads or mutations. */
export function bundleShadowsProfile(cli) {
  try {
    const paths=createRequire(realpathSync.native(cli)).resolve.paths('dsh-zhen');
    if(!Array.isArray(paths))throw Error('Missing module search paths.');
    // require.resolve caches successful results inside this process. A repair
    // can remove that link, so recheck the filesystem through the public search
    // paths instead of clearing Node internals or trusting a cached resolution.
    for(const directory of paths) {
      try {lstatSync(join(directory,'dsh-zhen'));return true;}
      catch(error) {if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
    }
    return false;
  } catch {throw Error('无法核对扩展安装来源。请通过启动入口修复依赖；尚未启动应用或更改配置。');}
}

export function assertBundleIsolation(cli) {
  if(bundleShadowsProfile(cli))throw Error(repair);
}

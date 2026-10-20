// Keep this bootstrap dependency-free: a fresh source download has no packages.
import {spawn,execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,lstatSync,realpathSync,renameSync,unlinkSync,openSync,closeSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {acquireRuntimeLease,assertRuntimeLease} from './runtime-lifecycle.mjs';
import {redactLauncherLine} from './log-output.mjs';

const workspace=dirname(dirname(fileURLToPath(import.meta.url)));
const required=['@deepseek-ai/dsh/lib/bin.js','yaml/package.json','typescript/bin/tsc','esbuild/package.json','zod/package.json'];
export function checkNodeVersion(version=process.versions.node) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('无法识别Node.js版本，请使用22.19.0或更新版本。');
  const [major,minor]=version.split('.').map(Number);
  if (major<22 || major===22&&minor<19) throw new Error('DSH-zhen需要Node.js 22.19.0或更新版本；尚未更改依赖或配置。');
}
function json(file,limit=16*1024*1024) {
  const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limit)throw new Error('启动配置不是有界普通文件。');
  return JSON.parse(readFileSync(file,'utf8'));
}
function dependenciesReady(root) {return required.every(file=>existsSync(join(root,'node_modules',file)));}
const dependencyShape=value=>Object.fromEntries(['name','version','dependencies','devDependencies','optionalDependencies','peerDependencies','peerDependenciesMeta','overrides','engines','workspaces','packageManager'].filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));
export function findNpmCli(env=process.env,executable=process.execPath) {
  const candidates=[env.npm_execpath,join(dirname(executable),'node_modules/npm/bin/npm-cli.js')].filter(Boolean);
  if (process.platform==='win32') {
    try {for(const command of execFileSync('where.exe',['npm.cmd'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim().split(/\r?\n/)) candidates.push(join(dirname(command),'node_modules/npm/bin/npm-cli.js'));}catch{}
  }
  const cli=candidates.find(file=>isNpmCli(file));
  if(!cli)throw new Error('未找到Node.js附带的npm，请检查Node.js安装；不会自动下载或执行安装器。');
  return resolve(cli);
}
function isNpmCli(file) {try{return /(?:^|[/\\])npm-cli\.js$/i.test(file)&&lstatSync(file).isFile();}catch{return false;}}
function npmStep(root,cli,args) {
  return new Promise((done,reject)=>{
    const child=spawn(process.execPath,[cli,...args],{cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    for(const [stream,sink] of [[child.stdout,process.stdout],[child.stderr,process.stderr]]) {
      let pending='';stream.setEncoding('utf8');stream.on('data',text=>{pending+=text;const lines=pending.split('\n');pending=lines.pop();for(const line of lines)sink.write(redactLauncherLine(line)+'\n');});stream.on('end',()=>{if(pending)sink.write(redactLauncherLine(pending));});
    }
    child.once('error',()=>reject(new Error('准备命令无法启动，尚未启动DSH。')));child.once('close',code=>code===0?done():reject(new Error('准备命令未完成；保留现有配置，请查看本窗口的错误信息。')));
  });
}

export async function startLocal({root=workspace,flags=process.argv.slice(2),port=5180,run,signal,handleSignals=true,loadLauncher=()=>import('./launch.mjs')}={}) {
  checkNodeVersion();
  if(flags.some(flag=>!['--check','--no-open','--repair'].includes(flag)))throw new Error('Usage: node scripts/start-local.mjs [--check] [--no-open] [--repair]');
  root=realpathSync.native(root);
  const manifest=json(join(root,'package.json')),plugin=json(join(root,'packages/dsh-zhen/package.json')),lock=json(join(root,'package-lock.json'));
  if(manifest.name!=='dsh-zhen-workspace'||plugin.name!=='dsh-zhen'||lock.name!==manifest.name)throw new Error('此入口仅用于DSH-zhen源码目录；没有更改任何目录。');
  const runtime=join(root,'.runtime'),lease=await acquireRuntimeLease(runtime,port),previousDirectory=process.cwd();
  let stopping=signal?.aborted??false;
  const stop=()=>{if(!stopping)console.log('收到停止请求。等待当前准备命令结束后退出，不会启动DSH。');stopping=true;};
  const checkStop=()=>{if(stopping)throw new Error('准备已停止，未启动DSH。');};
  const detach=()=>{if(handleSignals){process.off('SIGINT',stop);process.off('SIGTERM',stop);}signal?.removeEventListener('abort',stop);};
  if(handleSignals){process.on('SIGINT',stop);process.on('SIGTERM',stop);}signal?.addEventListener('abort',stop,{once:true});
  try {
    checkStop();
    process.chdir(root);
    // Reserve the port and process lock BEFORE npm ci can replace dependencies.
    const digest=createHash('sha256').update(JSON.stringify({manifest:dependencyShape(manifest),plugin:dependencyShape(plugin),lock,node:process.versions.node,arch:process.arch,platform:process.platform})).digest('hex');
    const marker=join(runtime,'setup-state.json');let previous;
    if(existsSync(marker))previous=json(marker,4096);
    const execute=run??((args)=>npmStep(root,findNpmCli(),args));
    if(previous&&previous.schema!==1)throw new Error('准备记录来自其他版本，请先核对工具版本；未覆盖记录。');
    if(flags.includes('--repair')||previous?.digest!==digest||!dependenciesReady(root)) {
      console.log('正在准备锁定版本的依赖，首次运行需要联网下载…');
      await execute(['ci','--ignore-scripts','--no-audit','--no-fund']);
      checkStop();
      if(!dependenciesReady(root))throw new Error('依赖准备不完整，未启动DSH。');
      const temporary=marker+'.'+process.pid+'.'+randomUUID()+'.tmp';let created=false;
      try {const fd=openSync(temporary,'wx',0o600);created=true;try{writeFileSync(fd,JSON.stringify({schema:1,digest})+'\n');}finally{closeSync(fd);}renameSync(temporary,marker);}finally{if(created&&existsSync(temporary))unlinkSync(temporary);}
    }
    console.log('正在构建并校验本机扩展包…');
    await execute(['run','build']);checkStop();await execute(['run','typecheck:clean']);checkStop();await execute(['run','pack:bundle']);checkStop();
    await assertRuntimeLease(lease,runtime,lease.port);
    const {launch}=await loadLauncher();
    checkStop();detach();
    console.log('准备完成。即将通过官方CLI启动；关闭服务可在本窗口按Ctrl+C。');
    return await launch(lease,flags.filter(flag=>flag!=='--repair'));
  } finally {detach();process.chdir(previousDirectory);await lease.release();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{checkNodeVersion();const {sourceAwareStart}=await import('./source-start.mjs');await sourceAwareStart({root:workspace,flags:process.argv.slice(2),start:startLocal});}
  catch(error){console.error(redactLauncherLine(error.message));process.exitCode=1;}
}

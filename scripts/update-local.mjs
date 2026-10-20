import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {updateSource,setSourceAutomatic} from './source-update.mjs';
import {redactLauncherLine} from './log-output.mjs';
import {checkNodeVersion} from './start-local.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
export async function sourceUpdateCommand(args,options={}){
  const update=options.update??updateSource,configure=options.configure??setSourceAutomatic,write=options.write??console.log;
  if(args.length===2&&args[0]==='--automatic'&&['on','off'].includes(args[1])){configure(root,args[1]==='on');write(args[1]==='on'?'已启用源码版下次启动自动更新：信任本项目main代码，最多每天检查一次；有本地修改时跳过。':'已关闭源码版自动更新。');return;}
  if(!(args.length===1&&['--check','--review'].includes(args[0])||args.length===2&&args[0]==='--apply'))throw Error('Usage: node scripts/update-local.mjs --check | --review | --apply <full-commit> | --automatic on|off');
  const plan=await update({root,mode:args[0]==='--apply'?'apply':'check',expected:args[1]??'',signal:options.signal});
  write(plan.state==='available'?`发现DSH-zhen源码更新：${plan.current} → ${plan.candidate}（${plan.changedFiles}个文件）。`:plan.state==='updated'?'源码更新完成。下次启动将构建、检查并换装扩展包；用户资料仍在原目录。':plan.state==='local-ahead'?'本地已有尚未在main中的提交，保留当前版本。':'源码已与main一致。');
  if(args[0]!=='--review'||plan.state!=='available')return plan;
  if(!process.stdin.isTTY&&!options.confirm)throw Error('此入口需要交互终端；也可先--check，再用--apply和完整候选编号。');
  const confirm=options.confirm??(async()=>{const prompt=createInterface({input:process.stdin,output:process.stdout});try{return (await prompt.question('更新源码并在下次启动构建？输入 UPDATE 确认：',{signal:options.signal})).trim()==='UPDATE';}finally{prompt.close();}});
  if(!await confirm()){write('已取消，保留当前源码。');return plan;}
  const result=await update({root,mode:'apply',expected:plan.candidate,signal:options.signal});write('源码更新完成，请重新运行启动入口。');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const controller=new AbortController(),stop=()=>controller.abort(new Error('更新已取消，保留当前源码和资料。'));process.on('SIGINT',stop);process.on('SIGTERM',stop);
  try{checkNodeVersion();await sourceUpdateCommand(process.argv.slice(2),{signal:controller.signal});}catch(error){console.error(redactLauncherLine(error.message));process.exitCode=1;}
  finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);}
}

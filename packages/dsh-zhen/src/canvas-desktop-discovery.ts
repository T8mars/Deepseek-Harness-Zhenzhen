import {execFile} from 'node:child_process';
import {basename,dirname,isAbsolute,join} from 'node:path';
import {promisify} from 'node:util';
import {discoverCanvasInstalls,inspectCanvasInstall} from './canvas-discovery.ts';
import {canvasSetupDiscoverySchema} from './canvas-setup-schema.ts';
import type {CanvasSetupDiscovery} from './canvas-setup-schema.ts';
const execute=promisify(execFile);
// Fixed read-only OS query: no command lines, arguments, environment or application settings.
export const canvasDesktopQuery="$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); @(Get-CimInstance Win32_Process -Filter \"Name='T8-PenguinCanvas.exe'\" | Where-Object { $_.ExecutablePath } | Select-Object -ExpandProperty ExecutablePath -Unique | Select-Object -First 16) | ConvertTo-Json -Compress";
export async function readCanvasDesktopPaths():Promise<string[]> {
  if(process.platform!=='win32')return [];
  const executable=join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const {stdout}=await execute(executable,['-NoLogo','-NoProfile','-NonInteractive','-Command',canvasDesktopQuery],{windowsHide:true,timeout:7000,maxBuffer:65536,encoding:'utf8'});
  if(!stdout.trim())return [];
  const value:unknown=JSON.parse(stdout.replace(/^\uFEFF/,''));
  const values=typeof value==='string'?[value]:Array.isArray(value)?value:[];
  return values.filter((path):path is string=>typeof path==='string'&&path.length<=4096).slice(0,16);
}
/** Separate from the legacy inert managed inventory: reads only OS executable paths and CLI metadata. */
export async function discoverCanvasSetup(options:{desktopPaths?:()=>Promise<string[]>;managed?:Parameters<typeof discoverCanvasInstalls>[0]}={}):Promise<CanvasSetupDiscovery>{
  const result:CanvasSetupDiscovery={candidates:[],issues:[]},seen=new Set<string>();
  const issue=(message:string)=>{if(result.issues.length<8&&!result.issues.includes(message))result.issues.push(message);};
  try{
    for(const executable of (await (options.desktopPaths??readCanvasDesktopPaths)()).slice(0,16)){
      if(!isAbsolute(executable)||basename(executable).toLowerCase()!=='t8-penguincanvas.exe')continue;
      try{
        const candidate=inspectCanvasInstall(join(dirname(executable),'resources','tools','zcanvas-cli'));
        if(!seen.has(candidate.root)&&result.candidates.length<8){seen.add(candidate.root);result.candidates.push({...candidate,source:'running-desktop'});}
      }catch{issue('找到桌面画布，但随附连接工具不完整。请在画布设置中修复 Agent 工具，或查看高级连接。');}
    }
  }catch{issue('暂时无法自动读取桌面安装位置。可重新检测，或在高级连接中选择已有工具。');}
  const managed=discoverCanvasInstalls(options.managed);
  for(const candidate of managed.candidates)if(!seen.has(candidate.root)&&result.candidates.length<8){seen.add(candidate.root);result.candidates.push({...candidate,source:'managed'});}
  for(const message of managed.issues)issue(message);
  return canvasSetupDiscoverySchema.parse(result);
}

import type {CapabilityItem} from './capability-schema.ts';

const idPattern=/^[A-Za-z0-9][A-Za-z0-9._/-]{1,119}$/;
type Family=CapabilityItem['family'];
type Protocol=CapabilityItem['protocol'];
const declaredRoutes:Readonly<Record<string,readonly [Family,Protocol]>>={
 '/v1/chat/completions':['chat','chat-completions'],
 '/v1/videos':['video','video-task'],
 '/v1/video/generations':['video','legacy-video-task'],
 '/v1/image/generations':['image','image-task'],
 '/v1/audio/generations':['audio','audio-task'],
 '/v1/3d/generations':['three-d','three-d-task'],
 '/v1/audio/transcriptions':['transcription','transcription'],
 '/v1/decisions':['decisions','decisions'],
 '/v2/video_generation':['minimax-v2','minimax-v2'],
};

/** Public documentation metadata only. No IO, route installation, expressions,
 * executable tools or configured-readiness claims. Shared by the reviewed
 * catalog builder and Host change monitor so appended declarations cannot be
 * visible to one and silently omitted by the other. */
export function extractDocumentedModels(docs:string):CapabilityItem[]{
 if(typeof docs!=='string'||docs.length>4*1024**2||new TextEncoder().encode(docs).length>4*1024**2)throw new Error('Documentation limit.');
 const lines=docs.split(/\r?\n/),kinds:Array<'prose'|'plain'|'other'|'delimiter'>=[];
 let fence:{marker:string;length:number;plain:boolean}|null=null;
 for(const line of lines){
  const marker=/^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if(fence){
   if(marker&&marker[1][0]===fence.marker&&marker[1].length>=fence.length&&!marker[2].trim()){fence=null;kinds.push('delimiter');}
   else kinds.push(fence.plain?'plain':'other');
  }else if(marker){fence={marker:marker[1][0],length:marker[1].length,plain:!marker[2].trim()||marker[2].trim()==='text'};kinds.push('delimiter');}
  else kinds.push('prose');
 }
 if(fence)throw new Error('Unclosed documentation fence.');
 const items=new Map<string,CapabilityItem>();
 function model(id:string,family:Family,line:number,section:string,protocol:Protocol):void{
  if(!idPattern.test(id)||section.length>200)throw new Error('Invalid documented model.');
  const key='model/'+id,previous=items.get(key);
  if(previous){if(previous.family!==family||previous.protocol!==protocol)throw new Error('Conflicting documented model.');return;}
  if(items.size>=1000)throw new Error('Documented model limit.');
  items.set(key,{key,family,kind:'model',model:id,action:'',title:id,line,section,protocol,readiness:'observed',required:[],versions:[],sync:['chat','transcription','decisions'].includes(family)});
 }
 const lineOf=(text:string)=>{const index=lines.findIndex((line,i)=>kinds[i]==='prose'&&line.includes(text));if(index<0)throw new Error('Missing documentation anchor.');return index+1;};
 const chatLine=lines.findIndex((line,i)=>kinds[i]==='prose'&&line.includes('POST /v1/chat/completions')&&line.includes('deepseek/deepseek-v4.1-flash'));
 if(chatLine<0)throw new Error('Missing chat inventory.');
 const chatModels=[...lines[chatLine].matchAll(/`([^`]+)`/g)].map(match=>match[1]).filter(id=>!id.includes(' ')&&idPattern.test(id));
 if(!chatModels.includes('deepseek/deepseek-v4.1-flash')||chatModels.length<10||new Set(chatModels).size!==chatModels.length)throw new Error('Chat inventory changed.');
 for(const id of chatModels)model(id,'chat',chatLine+1,'文本对话','chat-completions');

 const start=lines.findIndex((line,i)=>kinds[i]==='prose'&&line==='## 模型列表'),end=lines.findIndex((line,i)=>i>start&&kinds[i]==='prose'&&line==='## 价格与计费');
 if(start<0||end<=start)throw new Error('Model inventory anchors changed.');
 let section='',sectionFamily:Family='video',baseFamily:Family='video';
 const classify=(id:string,fallback:Family):Family=>/upscal|flashvsr|vosr|topaz/i.test(id)?'enhance':/motion|animate|lip-sync|identify-face|elements-advanced|context-ir/i.test(id)?'motion':/^(?:seedream|dola-seedream|qwen-image|mai-image|wan-2\.7-global|zhenzhen-image|flux-3-image)/.test(id)?'image':/^(?:doubao|mureka|minimax-(?:speech|voice|music)|qwen3-tts)/.test(id)?'audio':/^(?:seedance-|wan-3|wan-2\.7-spicy|happyhorse-|kling-|hailuo-|minimax-h3-ow-|flux-3-video-|vidu-|zhenzhen-video-)/.test(id)?'video':fallback;
 function listed(id:string,index:number):void{
  const family=classify(id,sectionFamily),protocol:Protocol=family==='image'||/^vosr2-image/.test(id)?'image-task':family==='audio'?'audio-task':/^(?:wan-3\..*-t2v|minmax-h3-context-ir|FlashVSR_|vosr2-video|animate-motion)/.test(id)?'legacy-video-task':'video-task';
  // A main-list mention of an already declared chat id does not redefine it.
  if(!items.has('model/'+id))model(id,family,index+1,section,protocol);
 }
 for(let index=start;index<end;index++){
  const text=lines[index];
  if(kinds[index]==='prose'){
   if(/^#{2,4} /.test(text)){
    section=text.replace(/^#+ /,'');
    if(/^#{2,3} /.test(text))baseFamily=/音频模型/.test(section)?'audio':/图片/.test(section)&&!/视频/.test(section)?'image':/超分/.test(section)&&!/视频与/.test(section)?'enhance':/Animate/.test(section)?'motion':'video';
    sectionFamily=/音频/.test(section)?'audio':/图片/.test(section)&&!/视频/.test(section)?'image':baseFamily;
   }
   for(const match of text.matchAll(/`([^`]+)`/g)){const id=match[1];if(idPattern.test(id)&&/^(?:seedance-|seedream-|dola-seedream-|qwen-image-|mai-image-|wan-|happyhorse-|kling-|hailuo-|minimax-|minmax-|flux-|vidu-|zhenzhen-|FlashVSR_|vosr2-|animate-|doubao-|mureka-|qwen3-tts-)/.test(id))listed(id,index);}
  }else if(kinds[index]==='plain'){
   const content=text.split('#')[0].trim();if(!content)continue;const tokens=content.split(/\s+/);if(tokens.every(token=>idPattern.test(token)))for(const id of tokens)listed(id,index);
  }
 }
 for(const[id,family,anchor,protocol,title]of[
  ['MiniMax-H3','minimax-v2','# MiniMax-H3 API','minimax-v2','MiniMax H3 V2'],
  ['whisper-1','transcription','### 语音转写','transcription','语音转写'],
  ['hunyuan3d-v3.1-text-to-3d','three-d','## POST /v1/3d/generations','three-d-task','3D 创作'],
  ['hunyuan3d-v3.1-image-to-3d','three-d','## POST /v1/3d/generations','three-d-task','3D 创作'],
  ['typesafe/jev-1.13','decisions','同步接口 `POST /v1/decisions`','decisions','结构化决策'],
 ]as const)model(id,family,lineOf(anchor),title,protocol);

 // Explicit standalone model declarations also occur after the main inventory.
 // Ignore examples/fences and ordinary URLs. Unknown or conflicting endpoints
 // require review rather than being guessed or turned into executable routes.
 section='';
 for(let index=0;index<lines.length;index++){
  if(kinds[index]!=='prose')continue;const text=lines[index].trim();if(/^#{1,4} /.test(text))section=text.replace(/^#+ /,'');
  const match=/^`([A-Za-z0-9][^`]*)`:\s+POST\s+(\S+)/.exec(text);if(!match)continue;
  const route=match[2].replace(/^[`]/,'').replace(/[`;.]+$/,''),declaration=declaredRoutes[route];
  if(!declaration)throw new Error('Unreviewed model declaration route.');
  model(match[1],declaration[0],index+1,section,declaration[1]);
 }
 return [...items.values()];
}

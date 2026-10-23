export const exampleChat=['deepseek/deepseek-v4.1-flash',...Array.from({length:9},(_,i)=>'EXAMPLE_CHAT_'+i)];
const named=new Set(['MiniMax-H3','whisper-1','hunyuan3d-v3.1-text-to-3d','hunyuan3d-v3.1-image-to-3d','typesafe/jev-1.13']);
export function exampleModelDocs({extra='',chat=exampleChat}={}){
 return 'EXAMPLE ONLY public metadata fixture\nPOST /v1/chat/completions models '+chat.map(id=>'`'+id+'`').join(' ')+'\n### 语音转写\n## POST /v1/3d/generations\n## 模型列表\n### 图片模型\n```text\nEXAMPLE_BASE_IMAGE\n```\n## 价格与计费\n# MiniMax-H3 API\n同步接口 `POST /v1/decisions`\n## POST /v1/files/upload\n### 查询钱包余额\n### 异步任务实际扣费\nGET /api/music/actions\n'+extra;
}
export function reviewedModelDocs(catalog,{removed=[],moved=[],extra=''}={}){
 const excluded=new Set([...removed,...moved.map(x=>x.model)]),models=catalog.items.filter(x=>x.kind==='model'&&!excluded.has(x.model));
 let docs='EXAMPLE ONLY changed documentation\nPOST /v1/chat/completions models '+models.filter(x=>x.family==='chat').map(x=>'`'+x.model+'`').join(' ')+'\n### 语音转写\n## POST /v1/3d/generations\n## 模型列表\n';
 for(const[family,title]of[['video','### 视频模型'],['image','### 图片模型'],['enhance','### 视频与超分'],['motion','## Animate 动作'],['audio','### 音频模型']]){
  docs+=title+'\n```text\n'+models.filter(x=>x.family===family&&!named.has(x.model)).map(x=>x.model).join('\n')+'\n```\n';
 }
 docs+='## 价格与计费\n# MiniMax-H3 API\n同步接口 `POST /v1/decisions`\n## POST /v1/files/upload\n### 查询钱包余额\n### 异步任务实际扣费\nGET /api/music/actions\n';
 for(const item of moved)docs+='## EXAMPLE changed model\n`'+item.model+'`: POST '+item.route+'; GET '+item.route+'/{id}.\n';
 return docs+extra;
}
export function reviewedRegistry(catalog,source){
 return JSON.stringify({success:true,data:catalog.items.filter(x=>x.kind==='action'&&(source==='midjourney'?x.family==='midjourney':['suno','flowmusic'].includes(x.family))).map(item=>({family:item.family,upstream_model:item.upstreamModel,public_action:item.action,billing_sku:item.billingSku,ref_type:item.referenceType,required_fields:item.required,allowed_versions:item.versions,sync:item.sync,requires_version:item.requiresVersion,require_index_or_custom_id:item.requiresIndex}))});
}

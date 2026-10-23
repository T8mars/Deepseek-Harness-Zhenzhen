import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractSeedanceCatalog } from '../../../scripts/seedance-catalog.mjs';
import { readCapabilityCatalog, searchCapabilities, CapabilityMonitor } from '../lib/capabilities.js';
import { capabilityCatalogSchema } from '../lib/capability-schema.js';

const docs = Buffer.from(`EXAMPLE ONLY synthetic documentation\nPOST /v1/chat/completions models \`deepseek/deepseek-v4.1-flash\` ${Array.from({length:9},(_,index)=>'`EXAMPLE_MODEL-'+index+'`').join(' ')}
### 语音转写
## POST /v1/3d/generations
## 模型列表
### 视频模型
\`\`\`
seedance-2.0-standard-t2v
\`\`\`
## Animate 动作
公开模型 \`animate-motion-transfer\`
#### 视频与超分
\`\`\`text
minimax-h3-ow-t2v
FlashVSR_video_upscale
vosr2-image-upscale
\`\`\`
#### Vidu Q3
\`\`\`
vidu-q3-pro-t2v
\`\`\`
### 图片
模型 \`mai-image-2-6\`
\`\`\`json
{"model":"EXAMPLE_ONLY_NOT_A_LIST_ENTRY"}
\`\`\`
## 价格与计费
# MiniMax-H3 API
同步接口 \`POST /v1/decisions\`
## POST /v1/files/upload
### 查询钱包余额
### 异步任务实际扣费
GET /api/music/actions
`);
const musicData = [
  {family:'suno',upstream_model:'suno',public_action:'upsample-tags',billing_sku:'suno-upsample-tags',sync:true,ref_type:'none',required_fields:['tags'],description:'EXAMPLE_ONLY_UNTRUSTED_DESCRIPTION'},
  {family:'flowmusic',upstream_model:'flowmusic',public_action:'extend',billing_sku:'flowmusic-extend',sync:false,ref_type:'task_audio',required_fields:['task_id']},
];
const mjData = [{public_action:'describe',billing_sku:'midjourney-describe',sync:true,ref_type:'images',required_fields:null}];
const bytes = data => Buffer.from(JSON.stringify({success:true,data}));
const fixture = () => extractSeedanceCatalog(docs, bytes(musicData), bytes(mjData), '2026-10-20T00:00:00.000Z');

test('capability extraction preserves protocol/case/action differences and refuses an unreviewed registry', () => {
  const catalog = capabilityCatalogSchema.parse(fixture());
  const entry = id => catalog.items.find(item => item.model === id || item.billingSku === id);
  assert.equal(entry('vidu-q3-pro-t2v').family, 'video');
  assert.equal(entry('minimax-h3-ow-t2v').family, 'video');
  assert.equal(entry('FlashVSR_video_upscale').protocol, 'legacy-video-task');
  assert.equal(entry('vosr2-image-upscale').protocol, 'image-task');
  assert.equal(entry('animate-motion-transfer').protocol, 'legacy-video-task');
  assert.equal(entry('MiniMax-H3').protocol, 'minimax-v2');
  assert.equal(entry('suno-upsample-tags').sync, true);
  assert.equal(entry('flowmusic-extend').sync, false);
  assert.equal(entry('flowmusic-extend').model, 'flowmusic'); assert.notEqual(entry('flowmusic-extend').model, entry('flowmusic-extend').billingSku);
  assert.equal(entry('midjourney-describe').sync, true);
  assert.equal(JSON.stringify(catalog).includes('UNTRUSTED_DESCRIPTION'), false);
  assert.equal(JSON.stringify(catalog).includes('NOT_A_LIST_ENTRY'), false);
  assert.throws(() => extractSeedanceCatalog(docs, bytes([...musicData,musicData[0]]), bytes(mjData), catalog.observedAt), /Duplicate/);
  assert.throws(() => extractSeedanceCatalog(docs, bytes([{...musicData[0],family:'EXAMPLE_NEW_FAMILY'}]), bytes(mjData), catalog.observedAt), /Unreviewed/);
});

test('reviewed catalog covers each family, supports bounded multilingual lookup, and keeps metadata separate from execution', () => {
  const catalog = readCapabilityCatalog();
  assert.equal(catalog.families.length, 17); assert.equal(catalog.items.length, 277);
  for (const family of catalog.families) assert.ok(catalog.items.some(item => item.family === family.id));
  assert.equal(catalog.items.filter(item => item.family === 'chat').length, 19);
  assert.equal(catalog.items.filter(item => item.kind === 'action').length, 60);
  const first = searchCapabilities(catalog, '', '', 0); assert.equal(first.items.length, 30);
  const next = searchCapabilities(catalog, '', '', first.nextOffset); assert.notEqual(first.items[0].key, next.items[0].key);
  assert.ok(searchCapabilities(catalog, '图像', '', 0).total > 0);
  assert.ok(searchCapabilities(catalog, 'MINIMAX', '', 0).total > 0);
  assert.equal(searchCapabilities(catalog, 'deepseek', 'video').total, 0);
  assert.ok(searchCapabilities(catalog, 'deepseek', 'chat').items.every(item => item.readiness === 'configured'));
  assert.ok(catalog.items.filter(item => item.kind === 'model' && item.family !== 'chat').every(item => item.readiness === 'observed'));
  assert.throws(() => searchCapabilities(catalog, 'x'.repeat(201)));
  assert.throws(() => searchCapabilities(catalog, '', 'EXAMPLE_UNKNOWN_FAMILY'));
  assert.throws(() => searchCapabilities(catalog, '', '', -1));
});

test('capability source checks are public, atomic per source, persistent and never change the reviewed catalog', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-capability-')); const catalog = fixture();
  let mode = 'same', requests = 0;
  const fetcher = async (url, options) => {
    requests++; assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, undefined);
    if (url.endsWith('llms.txt')) return new Response(docs);
    if (url.includes('/midjourney/')) return new Response(bytes(mjData));
    if (mode === 'broken') return Response.json({success:true,data:[{...musicData[0],family:'EXAMPLE_NEW_FAMILY'}]});
    const changed = [{...musicData[0], required_fields:['tags','EXAMPLE_NEW_FIELD']}, {family:'flowmusic',upstream_model:'flowmusic',public_action:'EXAMPLE'.toLowerCase(),billing_sku:'flowmusic-example',sync:false,ref_type:'none'}];
    return new Response(bytes(mode === 'same' ? musicData : changed));
  };
  let monitor = new CapabilityMonitor(join(root, 'sources.json'), catalog, fetcher);
  try {
    const [first, second] = await Promise.all([monitor.check(), monitor.check()]); assert.deepEqual(first, second); assert.equal(requests, 3); assert.ok(first.sources.every(item => !item.changed));
    mode = 'changed'; const changed = await monitor.check(); const music = changed.sources.find(item => item.id === 'music');
    assert.deepEqual(music.added, ['action/flowmusic/example']); assert.deepEqual(music.removed, ['action/flowmusic/extend']); assert.deepEqual(music.modified, ['action/suno/upsample-tags']);
    assert.deepEqual(catalog, fixture());
    mode = 'broken'; assert.equal((await monitor.check()).sources.find(item => item.id === 'music').state, 'unavailable');
    const before = monitor.snapshot(); const signal = AbortSignal.abort(); await monitor.check(signal); assert.deepEqual(monitor.snapshot(), before);
    monitor.setAutomatic(false); monitor = new CapabilityMonitor(join(root, 'sources.json'), catalog, fetcher);
    const count = requests; await monitor.automaticCheck(); assert.equal(requests, count); assert.equal(monitor.snapshot().automatic, false);
  } finally { rmSync(root, {recursive:true,force:true}); }
});

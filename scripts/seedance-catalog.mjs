import {extractDocumentedModels} from '../packages/dsh-zhen/src/capability-docs.ts';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,120}$/;
const familyDefinitions = [
  ['chat', '对话与多模态', 'dsh'], ['video', '视频生成', 'canvas'], ['image', '图像生成与编辑', 'canvas'],
  ['enhance', '修复与超分', 'canvas'], ['motion', '动作与派生', 'canvas'], ['audio', '语音与背景音', 'canvas'],
  ['suno', 'Suno 音乐', 'canvas'], ['flowmusic', 'Flow Music / Lyria', 'canvas'], ['midjourney', 'Midjourney', 'canvas'],
  ['minimax-v2', 'MiniMax H3 V2', 'canvas'], ['transcription', '语音转写', 'canvas'], ['three-d', '3D 创作', 'canvas'],
  ['decisions', '结构化决策', 'dsh'], ['upload', '素材上传', 'canvas'], ['wallet', '账户钱包', 'host'],
  ['registries', '动作目录', 'host'], ['queries', '任务与结算', 'host'],
].map(([id, title, owner]) => ({ id, title, owner }));

/** Produce review data only. Never writes routing, plugins or executable tools. */
export function extractSeedanceCatalog(docsBytes, musicBytes, mjBytes, observedAt) {
  if (docsBytes.length > 4 * 1024 * 1024 || musicBytes.length > 256 * 1024 || mjBytes.length > 256 * 1024) throw new Error('Source size limit.');
  const docs = new TextDecoder('utf8', { fatal: true }).decode(docsBytes), lines = docs.split(/\r?\n/);
  const items = new Map();
  const add = value => { if (!idPattern.test(value.key) || items.has(value.key)) throw new Error('Duplicate/invalid capability.'); items.set(value.key, value); };
  const lineOf = text => { const index = lines.findIndex(line => line.includes(text)); if (index < 0) throw new Error('Missing source anchor.'); return index + 1; };
  for (const item of extractDocumentedModels(docs)) add({...item, readiness: item.family === 'chat' ? 'configured' : 'observed'});

  function actions(bytes, source) {
    const body = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes));
    if (body.success !== true || !Array.isArray(body.data) || body.data.length > 200) throw new Error('Invalid action registry.');
    for (const entry of body.data) {
      const family = source === 'midjourney' ? 'midjourney' : entry.family;
      if (!['midjourney', 'suno', 'flowmusic'].includes(family) || typeof entry.public_action !== 'string' || !/^[a-z0-9-]{0,80}$/.test(entry.public_action) || !idPattern.test(entry.billing_sku) || typeof entry.sync !== 'boolean') throw new Error('Unreviewed registry shape/family.');
      const required = entry.required_fields ?? [], versions = entry.allowed_versions ?? [];
      if (!Array.isArray(required) || !required.every(value => typeof value === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(value)) || !Array.isArray(versions) || !versions.every(value => typeof value === 'string' && value.length < 50)) throw new Error('Unreviewed registry constraints.');
      add({ key: `action/${family}/${entry.public_action || 'default'}`, family, kind: 'action', model: source === 'midjourney' ? '' : entry.upstream_model, billingSku: entry.billing_sku, action: entry.public_action, title: entry.public_action || 'generation', line: 0, section: source, protocol: source === 'midjourney' ? 'midjourney-actions' : 'music-actions', readiness: 'observed', required, versions, sync: entry.sync, upstreamModel: source === 'midjourney' ? '' : entry.upstream_model, referenceType: entry.ref_type, requiresVersion: entry.requires_version ?? false, requiresIndex: entry.require_index_or_custom_id ?? false });
    }
  }
  actions(musicBytes, 'music'); actions(mjBytes, 'midjourney');
  for (const [key, family, title, anchor, protocol, readiness] of [
    ['operation/upload', 'upload', '上传参考素材', '## POST /v1/files/upload', 'upload', 'observed'],
    ['operation/wallet', 'wallet', '读取账户钱包', '### 查询钱包余额', 'wallet', 'fixture-tested'],
    ['operation/registries', 'registries', '读取公开动作目录', 'GET /api/music/actions', 'registries', 'real-read-tested'],
    ['operation/queries', 'queries', '查询任务与最终结算', '### 异步任务实际扣费', 'task-queries', 'observed'],
  ]) add({ key, family, kind: 'operation', model: '', action: '', title, line: lineOf(anchor), section: title, protocol, readiness, required: [], versions: [], sync: true });
  return { schemaVersion: 1, observedAt, scope: 'documented-model-list-and-named-protocols-with-public-action-registries',
    sources: [
      { id: 'docs', url: 'https://api.seedance.nz/docs/llms.txt', sha256: digest(docsBytes) },
      { id: 'music', url: 'https://api.seedance.nz/api/music/actions', sha256: digest(musicBytes) },
      { id: 'midjourney', url: 'https://api.seedance.nz/api/midjourney/actions', sha256: digest(mjBytes) },
    ], families: familyDefinitions, items: [...items.values()] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [docs, music, mj, output] = process.argv.slice(2);
  if (!docs || !music || !mj || !output) throw new Error('Usage: seedance-catalog.mjs docs.txt music.json mj.json output.json');
  const catalog = extractSeedanceCatalog(...await Promise.all([readFile(docs), readFile(music), readFile(mj)]), new Date().toISOString());
  await writeFile(output, JSON.stringify(catalog, null, 2) + '\n');
  console.log(JSON.stringify({ file: output, items: catalog.items.length, models: catalog.items.filter(item => item.kind === 'model').length, actions: catalog.items.filter(item => item.kind === 'action').length, families: catalog.families.length }));
}

import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { capabilityCatalogSchema, capabilityFamilySchema, capabilityCheckSchema, capabilityItemSchema } from './capability-schema.ts';
import {extractDocumentedModels} from './capability-docs.ts';
import type { CapabilityCatalog, CapabilityPage, CapabilityCheck } from './capability-schema.ts';
import { readPublic } from './updates.ts';
export function readCapabilityCatalog(): CapabilityCatalog {
  const file = new URL('../catalog/seedance.v1.json', import.meta.url);
  if (statSync(file).size > 1024 * 1024) throw new Error('Capability catalog limit.');
  return capabilityCatalogSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
export function searchCapabilities(catalog: CapabilityCatalog, query = '', family = '', offset = 0): CapabilityPage {
  if (query.length > 200 || family && !capabilityFamilySchema.safeParse(family).success || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000) throw new Error('能力查询参数无效。');
  const words = query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = catalog.items.filter(item => (!family || item.family === family) && words.every(word => `${item.key} ${item.title} ${item.section} ${catalog.families.find(value => value.id === item.family)?.title} ${item.model} ${item.action} ${item.billingSku ?? ''}`.toLowerCase().includes(word)));
  return { revision: catalog.sources.find(item => item.id === 'docs')!.sha256, total: matches.length, offset, nextOffset: offset + 30 < matches.length ? offset + 30 : null, items: matches.slice(offset, offset + 30) };
}
export function createCapabilityTool(catalog: () => CapabilityCatalog) {
  return defineTool({ name: 'zhen_capabilities', description: 'Search the reviewed Seedance capability inventory for exact model/action IDs and protocol distinctions. Public metadata only; observed entries are not executable tools or generation approval.',
    parameters: { query: { type: 'string', description: 'Model, action or creative need; at most 200 characters.' }, family: { type: 'string', description: 'Optional exact capability family.' }, offset: { type: 'integer', description: 'Page offset returned by a previous search.' } },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async ({ query, family, offset }) => ({ ...searchCapabilities(catalog(), query, family, offset), notice: '该目录区分已配置与仅文档观察。媒体由画布执行且需要实际能力、兼容握手和报价审批；不要把目录记录当作可调用工具。' }),
  });
}
const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
const registryFacts = (entry: Record<string, unknown>): string => JSON.stringify([entry.billing_sku, entry.upstream_model ?? '', entry.ref_type, entry.required_fields ?? [], entry.allowed_versions ?? [], entry.sync, entry.requires_version ?? false, entry.require_index_or_custom_id ?? false]);
const modelFacts = (entry: CapabilityCatalog['items'][number]): string => JSON.stringify([entry.family, entry.protocol, entry.required, entry.versions, entry.sync]);
export class CapabilityMonitor {
  private pending?: Promise<CapabilityCheck>;
  constructor(private readonly file: string, private readonly catalog: CapabilityCatalog, private readonly fetcher: typeof fetch = fetch) {}
  snapshot(): CapabilityCheck {
    if (!existsSync(this.file)) return { checkedAt: '', automatic: true, sources: [] };
    try { if (statSync(this.file).size > 128 * 1024) throw new Error(); return capabilityCheckSchema.parse(JSON.parse(readFileSync(this.file, 'utf8'))); }
    catch { return { checkedAt: '', automatic: false, sources: [] }; }
  }
  private save(value: CapabilityCheck): void { capabilityCheckSchema.parse(value); mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(this.file + '.tmp', JSON.stringify(value) + '\n', { mode: 0o600 }); renameSync(this.file + '.tmp', this.file); }
  setAutomatic(automatic: boolean): void { this.save({ ...this.snapshot(), automatic }); }
  async check(signal?: AbortSignal): Promise<CapabilityCheck> {
    if (this.pending) return this.pending;
    const task = (async () => {
      const sources = await Promise.all(this.catalog.sources.map(async source => {
        try {
          const text = await readPublic(source.url, this.fetcher, signal, source.id === 'docs' ? 4 * 1024 * 1024 : 256 * 1024);
          const digest = hash(text); const added: string[] = [], removed: string[] = [], modified: string[] = [];
          if (source.id === 'docs') {
            const current = new Map(extractDocumentedModels(text).map(value => {const item=capabilityItemSchema.parse(value);return [item.key,modelFacts(item)];}));
            const old = new Map(this.catalog.items.filter(item=>item.kind==='model').map(item=>[item.key,modelFacts(item)]));
            for(const [key,facts] of current)if(!old.has(key))added.push(key);else if(old.get(key)!==facts)modified.push(key);
            for(const key of old.keys())if(!current.has(key))removed.push(key);
          } else {
            const body = JSON.parse(text);
            if (body.success !== true || !Array.isArray(body.data) || body.data.length > 200) throw new Error();
            const current = new Map<string, string>();
            for (const entry of body.data) {
              const family = source.id === 'midjourney' ? 'midjourney' : entry.family;
              if (!['suno', 'flowmusic', 'midjourney'].includes(family) || typeof entry.public_action !== 'string' || !/^[a-z0-9-]{0,80}$/.test(entry.public_action) || typeof entry.sync !== 'boolean' || typeof entry.billing_sku !== 'string' || !/^[a-z0-9-]{1,120}$/.test(entry.billing_sku)) throw new Error();
              const key = `action/${family}/${entry.public_action || 'default'}`;
              if (current.has(key)) throw new Error(); current.set(key, registryFacts(entry));
            }
            const previous = this.catalog.items.filter(item => item.kind === 'action' && (source.id === 'midjourney' ? item.family === 'midjourney' : ['suno', 'flowmusic'].includes(item.family)));
            const old = new Map(previous.map(item => [item.key, JSON.stringify([item.billingSku, item.upstreamModel ?? '', item.referenceType, item.required, item.versions, item.sync, item.requiresVersion ?? false, item.requiresIndex ?? false])]));
            for (const [key, facts] of current) if (!old.has(key)) added.push(key); else if (old.get(key) !== facts) modified.push(key);
            for (const key of old.keys()) if (!current.has(key)) removed.push(key);
          }
          if([added,removed,modified].some(items=>items.length>200))throw new Error('Capability difference limit.');
          return { id: source.id, sha256: digest, changed: digest !== source.sha256, state: 'checked' as const, added, removed, modified };
        } catch { return { id: source.id, sha256: '', changed: false, state: 'unavailable' as const, added: [], removed: [], modified: [] }; }
      }));
      const value = { checkedAt: new Date().toISOString(), automatic: this.snapshot().automatic, sources };
      if (!signal?.aborted) this.save(value); return value;
    })();
    this.pending = task; try { return await task; } finally { if (this.pending === task) this.pending = undefined; }
  }
  async automaticCheck(signal?: AbortSignal): Promise<void> { const last = this.snapshot(); if (last.automatic && (!last.checkedAt || Date.now() - Date.parse(last.checkedAt) > 86400000)) await this.check(signal); }
}

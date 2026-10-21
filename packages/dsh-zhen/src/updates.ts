import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { updateReportSchema } from './update-schema.ts';
import type { UpdateSource, UpdateReport } from './update-schema.ts';
import type { GithubAccess, GithubReadSession } from './github-access.ts';
export interface UpdateBaseline { dsh: string; canvas: string; canvasRevision?: string; zhen: string; gateway: string; }
type Fetcher = typeof fetch;
const version = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i;
const sha = /^[a-f0-9]{40}$/;

/** Public metadata of this installed bundle, never an upstream profile file. */
export function ownBundleVersion(): string {
  const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  if (metadata.name !== 'dsh-zhen' || !version.test(metadata.version ?? '')) throw new Error('Installed bundle metadata is invalid.');
  return metadata.version;
}

export async function readPublic(url: string, fetcher: Fetcher = fetch, signal?: AbortSignal, maxBytes = 4 * 1024 * 1024): Promise<string> {
  const target = new URL(url);
  if (!['https://api.github.com', 'https://raw.githubusercontent.com', 'https://registry.npmjs.org', 'https://api.seedance.nz'].includes(target.origin) || target.username || target.password) throw new Error('Metadata origin refused.');
  const response = await fetcher(target.href, { method: 'GET', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), headers: { Accept: 'application/json, text/plain;q=0.8', 'User-Agent': 'DSH-zhen-update-check/0.1.0' } });
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Metadata unavailable.'); }
  const reader = response.body.getReader();
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > maxBytes) throw new Error('Metadata limit.'); parts.push(item.value); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts));
}

/** Public metadata only. Discovery never downloads or executes application code. */
export async function discoverUpdates(baseline: UpdateBaseline, fetcher: Fetcher = fetch, signal?: AbortSignal, github?: GithubAccess): Promise<UpdateSource[]> {
  const descriptors = [
    { id: 'dsh', title: 'DSH 上游', current: baseline.dsh, url: 'https://github.com/deepseek-ai/deepseek-harness/tags' },
    { id: 'canvas', title: 'T8 画布', current: baseline.canvas, url: 'https://github.com/T8mars/T8-penguin-canvas/commits/main' },
    { id: 'zhen', title: 'DSH-zhen', current: baseline.zhen, url: 'https://github.com/T8mars/Deepseek-Harness-Zhenzhen/releases' },
    { id: 'gateway', title: 'Seedance API 文档', current: baseline.gateway.toLowerCase(), url: 'https://api.seedance.nz/docs/llms.txt' },
  ] as const;
  return Promise.all(descriptors.map(async descriptor => {
    let source: GithubReadSession | undefined;
    try {
      let available = '', revision = '';
      if (descriptor.id === 'dsh') {
        const meta = JSON.parse(await readPublic('https://registry.npmjs.org/@deepseek-ai%2Fdsh/next', fetcher, signal));
        if (meta.name !== '@deepseek-ai/dsh' || !version.test(meta.version) || !/^sha512-[A-Za-z0-9+/]+=*$/.test(meta.dist?.integrity ?? '')) throw new Error('Invalid release.');
        available = meta.version; revision = meta.dist.integrity;
      } else if (descriptor.id === 'canvas') {
        const commit = JSON.parse(await readPublic('https://api.github.com/repos/T8mars/T8-penguin-canvas/commits/main', fetcher, signal));
        if (!sha.test(commit.sha)) throw new Error('Invalid revision.');
        revision = commit.sha;
        const pkg = JSON.parse(await readPublic(`https://raw.githubusercontent.com/T8mars/T8-penguin-canvas/${revision}/package.json`, fetcher, signal));
        if (!version.test(pkg.version)) throw new Error('Invalid version.');
        available = pkg.version;
      } else if (descriptor.id === 'zhen') {
        source = await github?.begin(signal);
        const releases: unknown = JSON.parse(source ? await source.releases() : await readPublic('https://api.github.com/repos/T8mars/Deepseek-Harness-Zhenzhen/releases?per_page=20', fetcher, signal));
        if (!Array.isArray(releases)) throw new Error('Invalid release list.');
        const stable = releases.find(release => release && typeof release === 'object' && release.draft === false && release.prerelease === false && typeof release.tag_name === 'string' && version.test(release.tag_name.replace(/^v/, '')));
        if (!stable) return { ...descriptor, available: '', revision: '', changed: false, state: 'unpublished' as const, message: '尚未发现正式发行版。' };
        available = stable.tag_name.replace(/^v/, ''); revision = stable.tag_name;
      } else {
        const docs = await readPublic(descriptor.url, fetcher, signal);
        available = createHash('sha256').update(docs).digest('hex'); revision = available;
      }
      const changed = available !== descriptor.current || (descriptor.id === 'canvas' && !!baseline.canvasRevision && revision !== baseline.canvasRevision);
      return { ...descriptor, available, revision, changed, state: 'checked' as const, message: changed ? '发现候选变更，需要兼容验证。' : '与当前记录一致。' };
    } catch {
      return { ...descriptor, available: '', revision: '', changed: false, state: 'error' as const, message: descriptor.id === 'zhen' ? 'GitHub 来源暂不可用；私有仓库可在本页配置对应仓库的只读凭据。' : '检查暂时不可用，保留当前版本。' };
    } finally { source?.close(); }
  }));
}

export class UpdateMonitor {
  private pending?: Promise<UpdateReport>;
  constructor(private readonly filename: string, private readonly baseline: UpdateBaseline, private readonly fetcher: Fetcher = fetch, private readonly github?: GithubAccess) {}
  snapshot(): UpdateReport {
    if (!existsSync(this.filename)) return { checkedAt: '', automatic: true, sources: [] };
    try { const value = readFileSync(this.filename); if (value.length > 65536) throw new Error(); return updateReportSchema.parse(JSON.parse(value.toString('utf8'))); }
    catch { return { checkedAt: '', automatic: false, sources: [] }; }
  }
  private save(value: UpdateReport): void {
    mkdirSync(dirname(this.filename), { recursive: true });
    writeFileSync(this.filename + '.tmp', JSON.stringify(value) + '\n', { mode: 0o600 });
    renameSync(this.filename + '.tmp', this.filename);
  }
  setAutomatic(enabled: boolean): void { this.save({ ...this.snapshot(), automatic: enabled }); }
  async check(signal?: AbortSignal): Promise<UpdateReport> {
    if (this.pending) return this.pending;
    const promise = (async () => {
      const sources = await discoverUpdates(this.baseline, this.fetcher, signal, this.github);
      const value = { automatic: this.snapshot().automatic, checkedAt: new Date().toISOString(), sources };
      if (!signal?.aborted) this.save(value);
      return value;
    })();
    this.pending = promise;
    try { return await promise; } finally { if (this.pending === promise) this.pending = undefined; }
  }
  async automaticCheck(signal?: AbortSignal): Promise<void> {
    const current = this.snapshot();
    if (current.automatic && (!current.checkedAt || Date.now() - Date.parse(current.checkedAt) > 24 * 3600 * 1000)) await this.check(signal);
  }
}

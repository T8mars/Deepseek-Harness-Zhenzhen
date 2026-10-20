import { readPublic } from './updates.ts';
import { FIRST_PARTY_REPOSITORY, githubCredentialValue } from './github-access-schema.ts';

export class GithubReadError extends Error {
  constructor(readonly code: 'AUTH' | 'NOT_FOUND' | 'RATE_LIMIT' | 'UNAVAILABLE' | 'CHANGED' | 'RESPONSE') { super(`GitHub source ${code}`); }
}
export function githubReadMessage(error: unknown): string {
  // Standalone development entries may bundle separate copies of this class.
  // Only compare a string code and return fixed messages, never error content.
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'UNAVAILABLE';
  if (code === 'AUTH') return 'GitHub 凭据无效或权限不足，请在更新中心检查只读凭据。';
  if (code === 'NOT_FOUND') return '未找到来源或当前凭据无权读取。私有仓库请在更新中心配置对应仓库的只读凭据。';
  if (code === 'RATE_LIMIT') return 'GitHub 查询受限，请稍后手动检查；当前版本保留。';
  if (code === 'CHANGED') return 'GitHub 连接已变化，旧检查已停止；当前版本保留，请重新检查。';
  return 'GitHub 来源暂不可用或校验未通过。私有仓库可在更新中心配置只读凭据；当前版本保留。';
}
export interface GithubReadSession {
  commit(): Promise<string>;
  feed(revision: string, maxBytes: number): Promise<string>;
  releases(): Promise<string>;
  assertCurrent(): Promise<void>;
  close(): void;
}
/** Fixed first-party read surface only. Credentials come from ctx.credentials;
 * authenticated reads never go to raw URLs, a redirect, or another repository. */
export class GithubAccess {
  private generation = 0;
  private closed = false;
  private readonly active = new Set<AbortController>();
  constructor(private readonly credential: () => Promise<string | undefined>, private readonly fetcher: typeof fetch = fetch) {}
  invalidate(): void { this.generation++; for (const controller of this.active) controller.abort(); }
  close(): void { this.closed = true; this.invalidate(); }
  async begin(signal?: AbortSignal): Promise<GithubReadSession> {
    const generation = this.generation, controller = new AbortController(); this.active.add(controller);
    const assertGeneration = () => { if (this.closed || generation !== this.generation || controller.signal.aborted || signal?.aborted) throw new GithubReadError('CHANGED'); };
    let credential: string | undefined;
    try { assertGeneration(); credential = await this.credential(); assertGeneration(); if (credential !== undefined && !githubCredentialValue.safeParse(credential).success) throw new GithubReadError('AUTH'); }
    catch (error) { this.active.delete(controller); throw error instanceof GithubReadError ? error : new GithubReadError('UNAVAILABLE'); }
    const assertCurrent = async () => { assertGeneration(); let current; try { current = await this.credential(); } catch { throw new GithubReadError('UNAVAILABLE'); } assertGeneration(); if (current !== credential) throw new GithubReadError('CHANGED'); };
    const read = async (suffix: string, maxBytes: number, accept = 'application/vnd.github+json', publicUrl?: string): Promise<string> => {
      await assertCurrent();
      const localSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000), ...(signal ? [signal] : [])]);
      try {
        if (!credential) { const body = await readPublic(publicUrl ?? `https://api.github.com/repos/${FIRST_PARTY_REPOSITORY}/${suffix}`, this.fetcher, localSignal, maxBytes); await assertCurrent(); return body; }
        const response = await this.fetcher(`https://api.github.com/repos/${FIRST_PARTY_REPOSITORY}/${suffix}`, { method: 'GET', redirect: 'error', signal: localSignal, headers: { Accept: accept, Authorization: `Bearer ${credential}`, 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'DSH-zhen-update-check/0.1.0' } });
        if (!response.ok || !response.body) { await response.body?.cancel(); throw new GithubReadError(response.status === 401 ? 'AUTH' : response.status === 429 || response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0' ? 'RATE_LIMIT' : response.status === 403 ? 'AUTH' : response.status === 404 ? 'NOT_FOUND' : 'UNAVAILABLE'); }
        const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
        try { while (true) { const next = await reader.read(); assertGeneration(); if (next.done) break; bytes += next.value.byteLength; if (bytes > maxBytes) throw new GithubReadError('RESPONSE'); chunks.push(next.value); } }
        finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        const body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); await assertCurrent(); return body;
      } catch (error) { assertGeneration(); throw error instanceof GithubReadError ? error : new GithubReadError('UNAVAILABLE'); }
    };
    return {
      commit: () => read('commits/main', 256 * 1024),
      feed: (revision, maxBytes) => { if (!/^[a-f0-9]{40}$/.test(revision) || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 2 * 1024 * 1024) return Promise.reject(new GithubReadError('RESPONSE')); return read(`contents/market/skills.v1.json?ref=${revision}`, maxBytes, 'application/vnd.github.raw+json', `https://raw.githubusercontent.com/${FIRST_PARTY_REPOSITORY}/${revision}/market/skills.v1.json`); },
      releases: () => read('releases?per_page=20', 4 * 1024 * 1024),
      assertCurrent,
      close: () => { this.active.delete(controller); controller.abort(); },
    };
  }
}

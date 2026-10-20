import { isAbsolute, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { inspectArtSource } from './art-source.ts';
import { artDimensions } from './client/art-validation.ts';
import type { ArtManifestSlot } from './client/art-validation.ts';
import { DEFAULT_ART_CHUNK_BYTES, defaultArtInfoSchema, defaultArtChunkRequest, defaultArtChunkSchema } from './default-art-schema.ts';
import type { DefaultArtInfo, DefaultArtChunkRequest, DefaultArtChunk } from './default-art-schema.ts';
const safeText = (text: string) => text.replace(/\bBearer\s+[^\s,;]+/gi, '[redacted]').replace(/https?:\/\/[^\s"'<>]+/g, raw => { try { const url = new URL(raw); return url.search || url.hash || url.username || url.password ? url.origin + url.pathname : raw; } catch { return '[redacted-url]'; } });
export class DefaultArt {
  private view: DefaultArtInfo = { state: 'none', code: 'ART_NOT_CONFIGURED', pack: null };
  private readonly files = new Map<string, Buffer>(); private closed = false;
  constructor(config: { root?: string; digest?: string }) {
    if (!config.root && !config.digest) return;
    try {
      if (!config.root || !isAbsolute(config.root) || /^[/\\]{2}/.test(config.root) || !/^[a-f0-9]{64}$/.test(config.digest ?? '')) throw Error('Invalid local art selection');
      const source = inspectArtSource(config.root, { release: true }); if (source.sha256 !== config.digest) throw Error('Art selection changed');
      const mapped: Record<ArtManifestSlot, 'portrait' | 'mark' | 'hero-mark'> = { 'hero-portrait': 'portrait', 'sidebar-mark': 'mark', 'hero-mark': 'hero-mark' };
      const assets = [];
      for (const [dark, slots] of [[false, source.manifest.slots], [true, source.manifest.variants.dark]] as const) for (const [key, value] of Object.entries(slots)) {
        const bytes = source.files.get(value.src)!, sha256 = createHash('sha256').update(bytes).digest('hex'), dimensions = artDimensions(bytes); this.files.set(sha256, bytes);
        assets.push({ slot: `${mapped[key as ArtManifestSlot]}${dark ? '-dark' : ''}`, sha256, name: basename(value.src), size: bytes.length, ...dimensions });
      }
      const manifest = source.manifest;
      this.view = defaultArtInfoSchema.parse({ state: 'ready', code: 'OK', pack: { protocol: 'dsh-zhen-default-art-v1', chunkBytes: DEFAULT_ART_CHUNK_BYTES, id: manifest.id, name: safeText(manifest.displayName['zh-CN']), digest: source.sha256, focus: manifest.focus, credit: { artist: safeText(manifest.credit.artist), source: safeText(manifest.credit.source), url: manifest.credit.url, license: safeText(manifest.license.summary), notice: manifest.license.notice ?? '' }, assets } });
    } catch { this.files.clear(); this.view = { state: 'unavailable', code: 'ART_SOURCE_UNAVAILABLE', pack: null }; }
  }
  info(): DefaultArtInfo { return structuredClone(this.view); }
  chunk(input: DefaultArtChunkRequest): DefaultArtChunk {
    const request = defaultArtChunkRequest.parse(input), bytes = this.files.get(request.sha256);
    if (this.closed || this.view.state !== 'ready' || request.digest !== this.view.pack.digest || !bytes || request.offset >= bytes.length || request.offset % DEFAULT_ART_CHUNK_BYTES !== 0) throw Error('默认美术引用已变化，请重新读取美术包。');
    const chunk = bytes.subarray(request.offset, request.offset + DEFAULT_ART_CHUNK_BYTES), nextOffset = request.offset + chunk.length;
    return defaultArtChunkSchema.parse({ digest: request.digest, sha256: request.sha256, offset: request.offset, nextOffset, size: bytes.length, base64: chunk.toString('base64'), eof: nextOffset === bytes.length });
  }
  close(): void { this.closed = true; this.files.clear(); this.view = { state: 'unavailable', code: 'ART_SOURCE_UNAVAILABLE', pack: null }; }
}

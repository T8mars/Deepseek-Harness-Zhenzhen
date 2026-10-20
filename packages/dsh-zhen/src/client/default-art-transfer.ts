import { defaultArtInfoSchema, defaultArtChunkSchema } from 'dsh-zhen/remote';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { DefaultArtInfo, DefaultArtAsset } from 'dsh-zhen';
import { artDimensions } from './art-validation.ts';
export interface TransferredArt { info: DefaultArtInfo; assets: Map<string, { descriptor: DefaultArtAsset; bytes: Uint8Array<ArrayBuffer> }>; }
/** Shared by the real client and transport contracts. No URLs or file paths
 * enter an image element; only complete, digest-checked raster bytes do. */
export async function transferDefaultArt(api: Pick<ZhenRemote, 'defaultArtInfo' | 'defaultArtChunk'>, active: () => boolean = () => true): Promise<TransferredArt> {
  const metadata = await api.defaultArtInfo(); if (!active()) throw Error('Default art load cancelled'); if (!metadata.ok) throw Error('默认美术暂不可用。');
  const info = defaultArtInfoSchema.parse(metadata.value), assets: TransferredArt['assets'] = new Map(); if (info.state !== 'ready') return { info, assets };
  const descriptors = new Map<string, DefaultArtAsset>();
  for (const item of info.pack.assets) { const previous = descriptors.get(item.sha256); if (previous && (item.size !== previous.size || item.type !== previous.type || item.width !== previous.width || item.height !== previous.height)) throw Error('默认美术描述不一致。'); descriptors.set(item.sha256, item); }
  if (new Set(info.pack.assets.map(item => item.slot)).size !== info.pack.assets.length) throw Error('默认美术槽位重复。');
  let failed = false; const allowed = () => !failed && active();
  try { await Promise.all([...descriptors.values()].map(async descriptor => {
    const bytes = new Uint8Array(descriptor.size); let offset = 0;
    while (offset < descriptor.size) {
      if (!allowed()) throw Error('Default art load cancelled'); const reply = await api.defaultArtChunk({ digest: info.pack.digest, sha256: descriptor.sha256, offset }); if (!allowed()) throw Error('Default art load cancelled'); if (!reply.ok) throw Error('默认美术读取未完成。');
      const chunk = defaultArtChunkSchema.parse(reply.value), decoded = Uint8Array.from(atob(chunk.base64), char => char.charCodeAt(0)), next = offset + decoded.length;
      if (chunk.digest !== info.pack.digest || chunk.sha256 !== descriptor.sha256 || chunk.offset !== offset || chunk.size !== descriptor.size || decoded.length !== Math.min(info.pack.chunkBytes, descriptor.size - offset) || chunk.nextOffset !== next || chunk.eof !== (next === descriptor.size)) throw Error('默认美术分块引用不一致。');
      bytes.set(decoded, offset); offset = next;
    }
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    const dimensions = artDimensions(bytes); if (sha !== descriptor.sha256 || dimensions.type !== descriptor.type || dimensions.width !== descriptor.width || dimensions.height !== descriptor.height || !allowed()) throw Error('默认美术内容核对未通过。');
    assets.set(descriptor.sha256, { descriptor, bytes });
  })); } catch (error) { failed = true; throw error; }
  return { info, assets };
}

import type { ZhenRemote } from 'dsh-zhen/remote';
import { transferDefaultArt } from './default-art-transfer.ts';
import { setDefaultArt } from './art-store.ts';
import type { ArtAsset, ArtSlot } from './art-store.ts';
interface Connection { api: ZhenRemote; generation: number; urls: Set<string>; }
let connection: Connection | undefined;
function release(current: Connection): void { for (const url of current.urls) URL.revokeObjectURL(url); current.urls.clear(); }
async function refresh(current: Connection): Promise<void> {
  const generation = ++current.generation, active = () => connection === current && current.generation === generation;
  setDefaultArt('loading'); release(current); const created = new Set<string>();
  try {
    const result = await transferDefaultArt(current.api, active); if (!active()) return;
    if (result.info.state !== 'ready') { setDefaultArt(result.info.state === 'none' ? 'none' : 'unavailable'); return; }
    const unique = new Map<string, ArtAsset>();
    for (const [sha, value] of result.assets) {
      const blob = new Blob([value.bytes], { type: value.descriptor.type }), image = await createImageBitmap(blob);
      try { if (image.width !== value.descriptor.width || image.height !== value.descriptor.height) throw Error('默认美术解码尺寸不一致。'); } finally { image.close(); }
      if (!active()) return; const url = URL.createObjectURL(blob); created.add(url); unique.set(sha, { blob, url, name: value.descriptor.name, width: value.descriptor.width, height: value.descriptor.height });
    }
    if (!active()) return; const assets: Partial<Record<ArtSlot, ArtAsset>> = {};
    for (const item of result.info.pack.assets) assets[item.slot] = unique.get(item.sha256)!;
    current.urls = new Set(created); created.clear(); setDefaultArt('ready', result.info.pack, assets);
  } catch { if (active()) setDefaultArt('unavailable'); }
  finally { for (const url of created) URL.revokeObjectURL(url); }
}
export function connectDefaultArt(api: ZhenRemote): () => void {
  if (connection) release(connection); const current: Connection = { api, generation: 0, urls: new Set() }; connection = current; void refresh(current);
  return () => { if (connection === current) { connection = undefined; current.generation++; setDefaultArt('none'); } release(current); };
}
export async function reloadDefaultArt(): Promise<void> { if (connection) await refresh(connection); }

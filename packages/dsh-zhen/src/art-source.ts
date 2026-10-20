import { openSync, fstatSync, readSync, closeSync, lstatSync, realpathSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { artDimensions, validateArtManifest, MAX_ART_BYTES } from './client/art-validation.ts';
function inside(root: string, filename: string): boolean { const rel = relative(root, filename); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\'); }
function boundedFile(root: string, name: string, limit: number): Buffer {
  const filename = join(root, name); let component = root;
  for (const segment of name.split('/')) { component = join(component, segment); if (lstatSync(component).isSymbolicLink()) throw Error('美术包引用必须位于包内，不允许符号链接。'); }
  if (!inside(root, realpathSync(filename))) throw Error('美术包引用必须位于包内，不允许符号链接。');
  const descriptor = openSync(filename, 'r');
  try { const stat = fstatSync(descriptor); if (!stat.isFile() || stat.size > limit) throw Error('美术包文件大小超出范围。'); const buffer = Buffer.alloc(limit + 1); let size = 0;
    while (size < buffer.length) { const count = readSync(descriptor, buffer, size, buffer.length - size, null); if (!count) break; size += count; }
    if (size > limit || !inside(root, realpathSync(filename))) throw Error('美术包文件大小或路径发生变化。'); return buffer.subarray(0, size);
  } finally { closeSync(descriptor); }
}
/** Capture only manifest-listed raster files. Shared by the separate art ZIP
 * packer and the local default-art reader, without reading unlisted files. */
export function inspectArtSource(directory: string, { release = false } = {}) {
  const root = realpathSync(directory), source = boundedFile(root, 'manifest.json', 65536);
  const manifest = validateArtManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(source)), release), files = new Map<string, Buffer>();
  for (const values of [manifest.slots, manifest.variants.dark]) for (const asset of Object.values(values)) {
    const bytes = files.get(asset.src) ?? boundedFile(root, asset.src, MAX_ART_BYTES), dimensions = artDimensions(bytes);
    const types: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
    if (dimensions.type !== types[asset.src.split('.').pop()!]) throw Error('素材扩展名与实际格式不一致。');
    if (asset.w !== undefined && asset.w !== dimensions.width || asset.h !== undefined && asset.h !== dimensions.height) throw Error('美术清单尺寸与素材不一致。'); files.set(asset.src, bytes);
  }
  files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  const hash = createHash('sha256'); for (const [name, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) hash.update(name).update('\0').update(String(bytes.length)).update('\0').update(bytes);
  return { manifest, files, sha256: hash.digest('hex') };
}

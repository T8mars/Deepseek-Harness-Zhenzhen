import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { examplePng } from './png.mjs';
/** Synthetic one-pixel PNG with a valid ancillary text chunk for transport
 * boundaries. No generated/user character image is altered by these tests. */
function paddedPng(length, letter) {
  const png = examplePng(), type = Buffer.from('tEXt'), data = Buffer.from('EXAMPLE\0' + letter.repeat(length)), crcBytes = Buffer.concat([type, data]); let crc = 0xffffffff;
  for (const byte of crcBytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); }
  const chunk = Buffer.alloc(data.length + 12); chunk.writeUInt32BE(data.length); type.copy(chunk, 4); data.copy(chunk, 8); chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4); return Buffer.concat([png.subarray(0, png.length - 12), chunk, png.subarray(png.length - 12)]);
}
export function defaultArtFixture({ confirmed = true, automatic = false } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'dsh-default-art-')), root = automatic ? join(base, 'packages/dsh-zhen-client-brand/assets/community-creative-v1') : join(base, 'EXAMPLE_ART'); mkdirSync(root, { recursive: true });
  const manifest = JSON.parse(readFileSync('packages/dsh-zhen-client-brand/assets/manifest.example.json', 'utf8'));
  manifest.id = 'example-default-art'; manifest.displayName = { 'zh-CN': 'EXAMPLE 默认美术' }; manifest.credit = { artist: 'EXAMPLE artist', source: 'EXAMPLE synthetic source', url: 'https://example.invalid/art' }; manifest.focus = { x: .25, y: .75, scale: .8 };
  manifest.license = { ...manifest.license, confirmedByUser: confirmed, confirmedAt: confirmed ? '2026-10-20T00:00:00Z' : null, redistribution: confirmed ? 'allowed' : 'unknown', summary: 'EXAMPLE SYNTHETIC LICENSE', notice: 'EXAMPLE SYNTHETIC NOTICE' };
  manifest.slots = { 'hero-portrait': { src: 'hero.png', w: 1, h: 1 }, 'hero-mark': { src: 'mark.png', w: 1, h: 1 }, 'sidebar-mark': { src: 'mark.png', w: 1, h: 1 } }; manifest.variants = { dark: { 'sidebar-mark': { src: 'mark.png', w: 1, h: 1 } } };
  const hero = paddedPng(100000, 'A'), mark = paddedPng(75000, 'B'); writeFileSync(join(root, 'hero.png'), hero); writeFileSync(join(root, 'mark.png'), mark); const save = () => writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest)); save();
  return { base, root, hero, mark, manifest, save, dispose: () => rmSync(base, { recursive: true, force: true }) };
}

export interface ArtDimensions { type: 'image/png' | 'image/jpeg' | 'image/webp'; width: number; height: number; }
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => { let crc = value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); return crc >>> 0; });
export const MAX_ART_BYTES = 2 * 1024 * 1024;
export type ArtManifestSlot = 'hero-portrait' | 'hero-mark' | 'sidebar-mark';
export interface ArtManifestAsset { src: string; w?: number; h?: number; }
export interface ArtManifest {
  schema: 'dsh-zhen-character-set'; version: 1; id: string;
  displayName: { 'zh-CN': string; en?: string };
  credit: { artist: string; source: string; url: string };
  license: { spdx: string; summary: string; notice?: string; redistribution: 'allowed' | 'denied' | 'unknown'; commercialUse: 'allowed' | 'denied' | 'unknown'; derivativeOfCommunityCharacter: boolean; confirmedByUser: boolean; confirmedAt: string | null };
  focus: { x: number; y: number; scale: number };
  slots: Partial<Record<ArtManifestSlot, ArtManifestAsset>>;
  variants: { dark: Partial<Record<ArtManifestSlot, ArtManifestAsset>> };
}
export function artPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200 || !/^[a-z0-9][a-z0-9@._/-]*\.(?:png|jpg|jpeg|webp)$/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('美术路径须为包内的小写 PNG、JPEG 或 WebP 相对路径。');
  return value;
}
export function validateArtManifest(input: unknown, release = false): ArtManifest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('美术清单格式无效。');
  const raw = input as Record<string, unknown>;
  const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('美术清单字段格式无效。'); return value as Record<string, unknown>; };
  const string = (value: unknown, max = 1000): string => { if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new Error('美术清单文字字段格式无效。'); return value; };
  const decision = (value: unknown): 'allowed' | 'denied' | 'unknown' => { if (value !== 'allowed' && value !== 'denied' && value !== 'unknown') throw new Error('请填写明确的许可范围。'); return value; };
  if (raw.schema !== 'dsh-zhen-character-set' || raw.version !== 1 || typeof raw.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.id) || raw.id.length > 63) throw new Error('美术清单版本或标识不支持。');
  const names = object(raw.displayName), credit = object(raw.credit), license = object(raw.license), focus = object(raw.focus);
  const parseSlots = (value: unknown): ArtManifest['slots'] => {
    const values = object(value), result: ArtManifest['slots'] = {};
    for (const [key, input] of Object.entries(values)) {
      if (!['hero-portrait', 'hero-mark', 'sidebar-mark'].includes(key)) throw new Error('当前美术包只支持首页素材、首页标记和侧栏标记。');
      const asset = object(input);
      if (Object.keys(asset).some(key => !['src', 'w', 'h'].includes(key))) throw new Error('美术资产包含不支持的字段。');
      for (const dimension of [asset.w, asset.h]) if (dimension !== undefined && (!Number.isInteger(dimension) || Number(dimension) < 1 || Number(dimension) > 4096)) throw new Error('美术清单尺寸超出范围。');
      result[key as ArtManifestSlot] = { src: artPath(asset.src), ...(asset.w === undefined ? {} : { w: Number(asset.w) }), ...(asset.h === undefined ? {} : { h: Number(asset.h) }) };
    }
    return result;
  };
  for (const [key, low, high] of [['x', 0, 1], ['y', 0, 1], ['scale', .5, 1.5]] as const) if (typeof focus[key] !== 'number' || !Number.isFinite(focus[key]) || Number(focus[key]) < low || Number(focus[key]) > high) throw new Error('美术焦点或缩放值超出范围。');
  if (typeof license.confirmedByUser !== 'boolean' || typeof license.derivativeOfCommunityCharacter !== 'boolean' || (license.confirmedAt !== null && (typeof license.confirmedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(license.confirmedAt) || !Number.isFinite(Date.parse(license.confirmedAt))))) throw new Error('许可确认记录格式无效。');
  const manifest: ArtManifest = {
    schema: 'dsh-zhen-character-set', version: 1, id: raw.id,
    displayName: { 'zh-CN': string(names['zh-CN'], 100), ...(names.en === undefined ? {} : { en: string(names.en, 100) }) },
    credit: { artist: string(credit.artist, 200), source: string(credit.source, 500), url: string(credit.url, 1000) },
    license: { spdx: string(license.spdx, 100), summary: string(license.summary), ...(license.notice === undefined ? {} : { notice: string(license.notice, 16000) }), redistribution: decision(license.redistribution), commercialUse: decision(license.commercialUse), derivativeOfCommunityCharacter: license.derivativeOfCommunityCharacter, confirmedByUser: license.confirmedByUser, confirmedAt: license.confirmedAt as string | null },
    focus: { x: Number(focus.x), y: Number(focus.y), scale: Number(focus.scale) }, slots: parseSlots(raw.slots),
    variants: { dark: raw.variants === undefined ? {} : parseSlots(object(raw.variants).dark ?? {}) },
  };
  if (!manifest.displayName['zh-CN'].trim() || !Object.keys(manifest.slots).length) throw new Error('请填写美术包名称并提供至少一个通用素材。');
  if (manifest.credit.url) { const url = new URL(manifest.credit.url); if (url.protocol !== 'https:' || url.username || url.password || (release && (url.search || url.hash))) throw new Error('请使用不含凭据或临时签名的 HTTPS 素材来源链接。'); }
  if (release && (manifest.license.confirmedByUser !== true || manifest.license.redistribution !== 'allowed' || !manifest.license.confirmedAt || !manifest.license.summary.trim() || !manifest.credit.source.trim())) throw new Error('发布美术包需要用户确认分发许可、确认日期、许可说明和来源。');
  return manifest;
}
export function artDimensions(bytes: Uint8Array): ArtDimensions {
  if (bytes.length < 24 || bytes.length > MAX_ART_BYTES) throw new Error('素材须为 2 MiB 以内的 PNG、JPEG 或 WebP。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number): string => String.fromCharCode(...bytes.subarray(offset, offset + length));
  let result: ArtDimensions | undefined;
  if (bytes[0] === 137 && ascii(1, 3) === 'PNG' && view.getUint32(4) === 0x0d0a1a0a && ascii(12, 4) === 'IHDR') {
    let offset = 8, ended = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      if (length > bytes.length - offset - 12) throw new Error('PNG 文件长度不完整。');
      if (ascii(offset + 4, 4) === 'acTL') throw new Error('角色位只接受静态图片，请提供静态 PNG、JPEG 或 WebP。');
      let crc = 0xffffffff;
      for (let position = offset + 4; position < offset + 8 + length; position++) crc = crcTable[(crc ^ bytes[position]!) & 255]! ^ (crc >>> 8);
      if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(offset + 8 + length)) throw new Error('PNG 文件校验失败。');
      if (ascii(offset + 4, 4) === 'IEND') { ended = true; if (offset + length + 12 !== bytes.length) throw new Error('PNG 文件尾部存在额外内容。'); }
      offset += length + 12;
    }
    if (!ended || offset !== bytes.length) throw new Error('PNG 文件不完整。');
    result = { type: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker! >= 0xd0 && marker! <= 0xd8)) continue;
      if (offset + 2 > bytes.length) break;
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker!)) {
        if (size < 8) break;
        result = { type: 'image/jpeg', height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) }; break;
      }
      offset += size;
    }
  } else if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    if (view.getUint32(4, true) + 8 !== bytes.length) throw new Error('WebP 文件长度不完整。');
    const chunk = ascii(12, 4);
    if (chunk === 'VP8X' && bytes.length >= 30) {
      if ((bytes[20]! & 0x02) !== 0) throw new Error('角色位只接受静态图片，请提供静态 PNG、JPEG 或 WebP。');
      const uint24 = (offset: number): number => bytes[offset]! + (bytes[offset + 1]! << 8) + (bytes[offset + 2]! << 16);
      result = { type: 'image/webp', width: uint24(24) + 1, height: uint24(27) + 1 };
    } else if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const packed = view.getUint32(21, true);
      result = { type: 'image/webp', width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
    } else if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      result = { type: 'image/webp', width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
  }
  if (!result || result.width < 1 || result.height < 1 || result.width > 4096 || result.height > 4096 || result.width * result.height > 16 * 1024 * 1024) throw new Error('素材格式无效，或尺寸超过 4096 × 4096。');
  return result;
}

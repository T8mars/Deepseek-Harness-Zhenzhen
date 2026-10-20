import { useEffect, useSyncExternalStore } from 'react';
import { artDimensions, MAX_ART_BYTES, validateArtManifest } from './art-validation.ts';
import type { ArtManifestSlot } from './art-validation.ts';
import type { DefaultArtInfo } from 'dsh-zhen';
import { overlayArt } from './art-overlay.ts';

export type ArtSlot = 'portrait' | 'portrait-dark' | 'mark' | 'mark-dark' | 'hero-mark' | 'hero-mark-dark';
export type ArtMode = 'auto' | 'stage' | 'peek' | 'mark' | 'off';
export interface ArtPreferences { mode: ArtMode; x: number; y: number; scale: number; artist: string; source: string; license: string; }
export interface ArtAsset { blob: Blob; name: string; width: number; height: number; url: string; }
interface StoredArt { loaded: boolean; assets: Partial<Record<ArtSlot, ArtAsset>>; preferences: ArtPreferences; storageError: boolean; }
export interface ArtSnapshot extends StoredArt { customSlots: ArtSlot[]; defaultArt: { status: 'none' | 'loading' | 'ready' | 'unavailable'; pack: Extract<DefaultArtInfo, { state: 'ready' }>['pack'] | null }; }
export const DEFAULT_ART_PREFERENCES: ArtPreferences = { mode: 'auto', x: .5, y: .5, scale: 1, artist: '', source: '', license: '' };
let snapshot: StoredArt = { loaded: false, assets: {}, preferences: DEFAULT_ART_PREFERENCES, storageError: false };
let defaultAssets: StoredArt['assets'] = {}, defaultArt: ArtSnapshot['defaultArt'] = { status: 'none', pack: null }, savedPreferences = false;
let effective: ArtSnapshot = { ...snapshot, customSlots: [], defaultArt };
const listeners = new Set<() => void>();
let loading: Promise<void> | undefined;
let database: Promise<IDBDatabase> | undefined;
const slots: ArtSlot[] = ['portrait', 'portrait-dark', 'mark', 'mark-dark', 'hero-mark', 'hero-mark-dark'];
function publish(): void { const merged = overlayArt(snapshot.assets, snapshot.preferences, savedPreferences, defaultAssets, defaultArt.pack?.focus); effective = { ...snapshot, ...merged, customSlots: Object.keys(snapshot.assets) as ArtSlot[], defaultArt }; for (const listener of listeners) listener(); }
function emit(next: StoredArt): void { snapshot = next; publish(); }
/** The caller owns default Blob URLs; browser imports never enter this map. */
export function setDefaultArt(status: ArtSnapshot['defaultArt']['status'], pack: ArtSnapshot['defaultArt']['pack'] = null, assets: StoredArt['assets'] = {}): void { defaultArt = { status, pack }; defaultAssets = assets; publish(); }
function openDatabase(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('dsh-zhen-local-art', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('assets'); request.result.createObjectStore('preferences'); };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); database = undefined; }; resolve(db); };
    request.onerror = () => { database = undefined; reject(new Error('本机浏览器素材存储不可用。')); };
    request.onblocked = () => { database = undefined; reject(new Error('请关闭其他旧版本页面后重新打开美术设置。')); };
  });
}
async function transaction<T>(store: string, mode: IDBTransactionMode, action: (object: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode), request = action(tx.objectStore(store));
    let value: T;
    request.onsuccess = () => { value = request.result; };
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () => reject(new Error('保存素材未完成，请检查浏览器存储空间。'));
  });
}
function preferences(value: unknown): ArtPreferences {
  const raw = value as Partial<ArtPreferences> | null;
  const number = (value: unknown, low: number, high: number, fallback: number): number => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high ? value : fallback;
  return { mode: ['auto', 'stage', 'peek', 'mark', 'off'].includes(raw?.mode ?? '') ? raw!.mode! : 'auto', x: number(raw?.x, 0, 1, .5), y: number(raw?.y, 0, 1, .5), scale: number(raw?.scale, .5, 1.5, 1), artist: typeof raw?.artist === 'string' ? raw.artist.slice(0, 200) : '', source: typeof raw?.source === 'string' ? raw.source.slice(0, 500) : '', license: typeof raw?.license === 'string' ? raw.license.slice(0, 1000) : '' };
}
async function load(): Promise<void> {
  if (snapshot.loaded) return;
  return loading ??= (async () => {
    const assets: ArtSnapshot['assets'] = {};
    try {
      for (const slot of slots) {
        const record = await transaction<unknown>('assets', 'readonly', store => store.get(slot));
        const saved = record as Partial<ArtAsset> | undefined;
        if (saved?.blob instanceof Blob && saved.blob.size <= MAX_ART_BYTES && ['image/png', 'image/jpeg', 'image/webp'].includes(saved.blob.type)) {
          const info = artDimensions(new Uint8Array(await saved.blob.arrayBuffer()));
          assets[slot] = { blob: saved.blob, name: typeof saved.name === 'string' ? saved.name.slice(0, 200) : '本机素材', width: info.width, height: info.height, url: URL.createObjectURL(saved.blob) };
        }
      }
      const prefs = await transaction<unknown>('preferences', 'readonly', store => store.get('display'));
      savedPreferences = prefs != null;
      emit({ loaded: true, assets, preferences: preferences(prefs), storageError: false });
    } catch { for (const asset of Object.values(assets)) URL.revokeObjectURL(asset.url); emit({ ...snapshot, loaded: true, storageError: true }); }
  })();
}
export function useArt(): ArtSnapshot {
  const current = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => effective);
  useEffect(() => { void load(); }, []);
  return current;
}
export async function saveArt(slot: ArtSlot, file: File): Promise<void> {
  await load();
  if (file.size > MAX_ART_BYTES) throw new Error('请选择 2 MiB 以内的素材。');
  const bytes = new Uint8Array(await file.arrayBuffer()), info = artDimensions(bytes);
  const blob = new Blob([bytes], { type: info.type });
  let image: ImageBitmap;
  try { image = await createImageBitmap(blob); } catch { throw new Error('图片无法完整解码，请换一个 PNG、JPEG 或 WebP 文件。'); }
  try { if (image.width < 1 || image.height < 1 || image.width > 4096 || image.height > 4096 || image.width * image.height > 16 * 1024 * 1024) throw new Error('解码后的图片尺寸超出范围。'); } finally { image.close(); }
  const record = { blob, name: file.name.slice(0, 200), width: info.width, height: info.height };
  await transaction('assets', 'readwrite', store => store.put(record, slot));
  const previous = snapshot.assets[slot];
  emit({ ...snapshot, assets: { ...snapshot.assets, [slot]: { ...record, url: URL.createObjectURL(blob) } }, storageError: false });
  if (previous) URL.revokeObjectURL(previous.url);
}
export async function removeArt(slot: ArtSlot): Promise<void> {
  await load(); await transaction('assets', 'readwrite', store => store.delete(slot));
  const previous = snapshot.assets[slot], assets = { ...snapshot.assets }; delete assets[slot];
  emit({ ...snapshot, assets }); if (previous) URL.revokeObjectURL(previous.url);
}
export async function saveArtPreferences(next: ArtPreferences): Promise<void> {
  await load(); const value = preferences(next);
  await transaction('preferences', 'readwrite', store => store.put(value, 'display'));
  savedPreferences = true;
  emit({ ...snapshot, preferences: value, storageError: false });
}

/** Directory import reads only manifest-listed files, with one atomic storage transaction. */
export async function importArtDirectory(files: File[]): Promise<void> {
  await load();
  if (files.length > 100) throw new Error('请选择只包含美术清单和素材的文件夹（最多 100 个文件）。');
  const manifests = files.filter(file => file.name === 'manifest.json');
  if (manifests.length !== 1 || manifests[0]!.size > 65536) throw new Error('文件夹中需要一份 64 KiB 以内的 manifest.json。');
  const manifestFile = manifests[0]!, manifest = validateArtManifest(JSON.parse(await manifestFile.text()));
  const relative = manifestFile.webkitRelativePath || manifestFile.name;
  const base = relative.slice(0, relative.length - 'manifest.json'.length);
  const byPath = new Map(files.map(file => [file.webkitRelativePath || file.name, file]));
  if (byPath.size !== files.length) throw new Error('美术包中有重复的相对路径。');
  const mapped: Record<ArtManifestSlot, ArtSlot> = { 'hero-portrait': 'portrait', 'hero-mark': 'hero-mark', 'sidebar-mark': 'mark' };
  const records: Array<[ArtSlot, { blob: Blob; name: string; width: number; height: number }]> = [];
  for (const [dark, values] of [[false, manifest.slots], [true, manifest.variants.dark]] as const) {
    for (const [key, asset] of Object.entries(values)) {
      const file = byPath.get(base + asset.src);
      if (!file || file.size > MAX_ART_BYTES) throw new Error('清单引用的图片缺失或超过 2 MiB。');
      const bytes = new Uint8Array(await file.arrayBuffer()), info = artDimensions(bytes), blob = new Blob([bytes], { type: info.type });
      let image: ImageBitmap;
      try { image = await createImageBitmap(blob); } catch { throw new Error('美术包中有图片无法解码。'); }
      try { if (image.width > 4096 || image.height > 4096) throw new Error('美术包图片尺寸超出范围。'); } finally { image.close(); }
      if ((asset.w !== undefined && asset.w !== info.width) || (asset.h !== undefined && asset.h !== info.height)) throw new Error('清单尺寸与图片不一致。');
      records.push([`${mapped[key as ArtManifestSlot]}${dark ? '-dark' : ''}` as ArtSlot, { blob, name: file.name.slice(0, 200), width: info.width, height: info.height }]);
    }
  }
  const nextPreferences = { ...snapshot.preferences, ...manifest.focus, artist: manifest.credit.artist, source: manifest.credit.source, license: manifest.license.summary };
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['assets', 'preferences'], 'readwrite');
    tx.objectStore('assets').clear(); for (const [slot, record] of records) tx.objectStore('assets').put(record, slot);
    tx.objectStore('preferences').put(nextPreferences, 'display');
    tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(new Error('美术包保存失败，原有素材仍保留。'));
  });
  const previous = snapshot.assets;
  savedPreferences = true;
  emit({ ...snapshot, preferences: nextPreferences, assets: Object.fromEntries(records.map(([slot, record]) => [slot, { ...record, url: URL.createObjectURL(record.blob) }])), storageError: false });
  for (const asset of Object.values(previous)) URL.revokeObjectURL(asset.url);
}

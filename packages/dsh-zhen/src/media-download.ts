import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export class MediaDownloadError extends Error {
  constructor(readonly code: 'SOURCE' | 'NETWORK' | 'EXPIRED' | 'LIMIT' | 'FORMAT' | 'CANCELLED' | 'FILE') { super(code); this.name = 'MediaDownloadError'; }
}
const blocked = new BlockList(), global6 = new BlockList(); global6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(address, prefix, 'ipv4');
blocked.addAddress('168.63.129.16');
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3ffe::', 16], ['3fff::', 20]] as const) blocked.addSubnet(address, prefix, 'ipv6');
export function publicMediaAddress(address: string): boolean {
  const family = isIP(address); if (!family || address.includes('%')) return false;
  return family === 4 ? !blocked.check(address, 'ipv4') : global6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}
async function aborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted(); let cancel: () => void = () => {};
  try { return await Promise.race([work, new Promise<T>((_resolve, reject) => { cancel = () => reject(new MediaDownloadError('CANCELLED')); signal.addEventListener('abort', cancel, { once: true }); })]); }
  finally { signal.removeEventListener('abort', cancel); }
}
/** Every DNS answer must be public. The chosen answer is supplied directly to
 * the HTTP connection, so it cannot be resolved again between check and use.
 */
export async function mediaTarget(raw: string, signal: AbortSignal): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  let url: URL; try { url = new URL(raw); } catch { throw new MediaDownloadError('SOURCE'); }
  if (raw.length > 8192 || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname) throw new MediaDownloadError('SOURCE');
  url.hash = '';
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/(?:^|\.)(?:localhost|local|internal)\.?$/i.test(host) || !isIP(host) && !host.includes('.')) throw new MediaDownloadError('SOURCE');
  signal.throwIfAborted();
  let answers;
  try { answers = isIP(host) ? [{ address: host, family: isIP(host) }] : await aborted(dns.lookup(host, { all: true, verbatim: true }), signal); }
  catch (error) { throw error instanceof MediaDownloadError ? error : new MediaDownloadError('NETWORK'); }
  signal.throwIfAborted();
  if (!answers.length || answers.length > 32 || answers.some(item => !publicMediaAddress(item.address) || ![4, 6].includes(item.family))) throw new MediaDownloadError('SOURCE');
  return { url, address: answers[0]!.address, family: answers[0]!.family as 4 | 6 };
}
function fileFormat(bytes: Buffer, mime: string): { extension: string; mime: string } {
  const head = bytes.toString('latin1');
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { extension: 'png', mime: 'image/png' };
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { extension: 'jpg', mime: 'image/jpeg' };
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return { extension: 'webp', mime: 'image/webp' };
  if (/^GIF8[79]a/.test(head)) return { extension: 'gif', mime: 'image/gif' };
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WAVE') return { extension: 'wav', mime: 'audio/wav' };
  if (head.startsWith('fLaC')) return { extension: 'flac', mime: 'audio/flac' };
  if (head.startsWith('OggS')) return { extension: 'ogg', mime: mime.startsWith('video/') ? 'video/ogg' : 'audio/ogg' };
  if (bytes[0] === 255 && bytes[1] !== undefined && (bytes[1] & 0xf6) === 0xf0) return { extension: 'aac', mime: 'audio/aac' };
  if (head.startsWith('ID3') || bytes[0] === 255 && bytes[1] !== undefined && (bytes[1] & 0xe0) === 0xe0) return { extension: 'mp3', mime: 'audio/mpeg' };
  if (head.slice(4, 8) === 'ftyp') {
    if (['avif', 'avis'].includes(head.slice(8, 12))) return { extension: 'avif', mime: 'image/avif' };
    if (mime === 'audio/mp4' || head.slice(8, 12) === 'M4A ') return { extension: 'm4a', mime: 'audio/mp4' };
    return { extension: 'mp4', mime: 'video/mp4' };
  }
  if (bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) return { extension: mime === 'video/x-matroska' ? 'mkv' : 'webm', mime: mime === 'video/x-matroska' ? mime : 'video/webm' };
  if (head.startsWith('glTF') && bytes.length >= 12 && bytes.readUInt32LE(4) === 2) return { extension: 'glb', mime: 'model/gltf-binary' };
  if (bytes[0] === 80 && bytes[1] === 75 && [[3, 4], [5, 6], [7, 8]].some(pair => pair[0] === bytes[2] && pair[1] === bytes[3])) return { extension: 'zip', mime: 'application/zip' };
  throw new MediaDownloadError('FORMAT');
}
export interface MediaBytes { bytes: number; sha256: string; extension: string; mime: string; }
export const MEDIA_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Anonymous media GET only: no API Authorization, cookie, Referer or ambient
 * proxy/agent. Redirect targets are checked and pinned separately. No decoding,
 * archive extraction or program execution is performed.
 */
export async function downloadMedia(raw: string, file: string, signal?: AbortSignal, maxBytes = MEDIA_MAX_BYTES, beforeWrite?: () => void): Promise<MediaBytes> {
  const abort = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(300000)]);
  let current = raw;
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const target = await mediaTarget(current, abort);
      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const request = (target.url.protocol === 'https:' ? https : http).request(target.url, {
          method: 'GET', agent: false, family: target.family, signal: abort,
          lookup: (_host, options, callback) => { if (options.all) callback(null, [{ address: target.address, family: target.family }]); else callback(null, target.address, target.family); },
          headers: { Accept: 'image/*,video/*,audio/*,model/gltf-binary,application/octet-stream,application/zip', 'Accept-Encoding': 'identity', 'User-Agent': 'DSH-zhen-media/0.1.0' },
        }, resolve);
        request.setTimeout(15000, () => request.destroy(new MediaDownloadError('NETWORK')));
        request.once('error', reject); request.end();
      });
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        const next = response.headers.location; response.destroy();
        if (!next || redirects === 3) throw new MediaDownloadError('SOURCE');
        try { current = new URL(next, target.url).href; } catch { throw new MediaDownloadError('SOURCE'); }
        continue;
      }
      if (response.statusCode !== 200) { response.destroy(); throw new MediaDownloadError([401, 403, 404].includes(response.statusCode ?? 0) ? 'EXPIRED' : 'NETWORK'); }
      const length = response.headers['content-length'], encoding = response.headers['content-encoding'];
      const mime = (response.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      if (encoding && encoding !== 'identity') { response.destroy(); throw new MediaDownloadError('FORMAT'); }
      if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) { response.destroy(); throw new MediaDownloadError('LIMIT'); }
      if (['text/html', 'application/javascript', 'text/javascript', 'image/svg+xml'].includes(mime)) { response.destroy(); throw new MediaDownloadError('FORMAT'); }
      const digest = createHash('sha256'); let size = 0, prefix = Buffer.alloc(0);
      const counter = new Transform({ transform(chunk: Buffer, _encoding, done) {
        size += chunk.length;
        if (size > maxBytes) { done(new MediaDownloadError('LIMIT')); return; }
        if (prefix.length < 64) prefix = Buffer.concat([prefix, chunk.subarray(0, 64 - prefix.length)]);
        digest.update(chunk); done(null, chunk);
      } });
      try { beforeWrite?.(); } catch (error) { response.destroy(); throw error; }
      await pipeline(response, counter, createWriteStream(file, { flags: 'wx', mode: 0o600 }), { signal: abort });
      if (!size || length && size !== Number(length)) throw new MediaDownloadError('NETWORK');
      const format = fileFormat(prefix, mime);
      if (format.extension === 'glb' && prefix.readUInt32LE(8) !== size) throw new MediaDownloadError('FORMAT');
      return { bytes: size, sha256: digest.digest('hex'), ...format };
    }
    throw new MediaDownloadError('SOURCE');
  } catch (error) { throw error instanceof MediaDownloadError ? error : new MediaDownloadError(abort.aborted ? 'CANCELLED' : ['EACCES', 'EPERM', 'EROFS', 'ENOSPC', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '') ? 'FILE' : 'NETWORK'); }
}

import { lstat, realpath, open } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { CanvasError } from './canvas.ts';
import type { GatewayMediaReceipt } from './gateway-media-schema.ts';
/** Receipt-owned local files only. Native import independently snapshots and
 * verifies the same content again before copying into its managed asset store. */
export async function verifyTransferFile(receipt: GatewayMediaReceipt, maxBytes: number, active: () => boolean): Promise<void> {
  if (!isAbsolute(receipt.path) || /^[/\\]{2}/.test(receipt.path) || receipt.bytes > maxBytes) throw new CanvasError('TRANSFER_FILE_LIMIT', '文件超出当前画布导入范围，请选择较小的已保存结果。');
  const canonical = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  try {
    const before = await lstat(receipt.path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || Number(before.size) !== receipt.bytes || canonical(await realpath(receipt.path)) !== canonical(resolve(receipt.path))) throw Error('changed');
    const handle = await open(receipt.path, 'r'), hash = createHash('sha256'); let bytes = 0;
    try {
      const opened = await handle.stat({ bigint: true }); if (opened.dev !== before.dev || opened.ino !== before.ino) throw Error('changed');
      for await (const chunk of handle.createReadStream({ autoClose: false })) { if (!active()) throw Error('cancelled'); bytes += chunk.length; if (bytes > receipt.bytes) throw Error('changed'); hash.update(chunk); }
      const after = await handle.stat({ bigint: true }); if (after.size !== before.size || after.mtimeNs !== before.mtimeNs || bytes !== receipt.bytes || hash.digest('hex') !== receipt.sha256 || !active()) throw Error('changed');
    } finally { await handle.close(); }
  } catch { throw new CanvasError('TRANSFER_FILE_CHANGED', '已保存文件缺失、被替换或内容发生变化，未送入画布。'); }
}

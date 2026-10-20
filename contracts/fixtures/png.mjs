import { deflateSync } from 'node:zlib';
/** Deterministic synthetic raster used only by tests; no supplied artwork. */
export function examplePng(width = 1, height = 1) {
  const chunk = (name, data) => {
    const type = Buffer.from(name), crcInput = Buffer.concat([type, data]);
    let crc = 0xffffffff;
    for (const byte of crcInput) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const output = Buffer.alloc(data.length + 12); output.writeUInt32BE(data.length); type.copy(output, 4); data.copy(output, 8); output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, data.length + 8); return output;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.set([15, 91, 107, 255], y * (width * 4 + 1) + 1 + x * 4);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

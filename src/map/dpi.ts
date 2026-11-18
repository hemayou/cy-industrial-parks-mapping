function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function writeDpi(image: Blob, dpi: number, format: 'png' | 'jpeg'): Promise<Blob> {
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (format === 'jpeg') {
    const density = Math.round(dpi);
    const jfif = new Uint8Array([
      0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 2, 1,
      density >> 8, density & 255, density >> 8, density & 255, 0, 0,
    ]);
    const start = bytes[2] === 0xff && bytes[3] === 0xe0 &&
      bytes.subarray(6, 11).join(',') === '74,70,73,70,0' ? 4 + ((bytes[4] << 8) | bytes[5]) : 2;
    return new Blob([bytes.subarray(0, 2), jfif, bytes.subarray(start)], { type: 'image/jpeg' });
  }
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  const perMeter = Math.round(dpi / .0254);
  view.setUint32(8, perMeter);
  view.setUint32(12, perMeter);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));

  const source = new DataView(bytes.buffer);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = source.getUint32(offset);
    const type = source.getUint32(offset + 4);
    if (type === 0x70485973) {
      return new Blob([bytes.subarray(0, offset), chunk, bytes.subarray(offset + length + 12)], { type: 'image/png' });
    }
    if (type === 0x49444154) break;
    offset += length + 12;
  }
  return new Blob([bytes.subarray(0, 33), chunk, bytes.subarray(33)], { type: 'image/png' });
}

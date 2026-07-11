// Zips dist/ into ../zetsales-product-importer.zip with manifest.json at the archive root, so it
// can be shared and loaded via chrome://extensions -> Load unpacked (after unzipping) without
// needing a system `zip` binary or an extra npm dependency.
import { deflateRawSync } from 'zlib';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));
const zipPath = fileURLToPath(new URL('../zetsales-product-importer.zip', import.meta.url));

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else if (!entry.endsWith('.map')) files.push(full);
  }
  return files;
}

const files = walk(distDir).map((full) => ({
  full,
  name: relative(distDir, full).split(sep).join('/'),
}));

const localChunks = [];
const centralChunks = [];
let offset = 0;

for (const { full, name } of files) {
  const data = readFileSync(full);
  const compressed = deflateRawSync(data);
  const crc = crc32(data);
  const nameBuf = Buffer.from(name, 'utf8');

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4); // version needed
  localHeader.writeUInt16LE(0, 6); // flags
  localHeader.writeUInt16LE(8, 8); // method: deflate
  localHeader.writeUInt16LE(0, 10); // mod time
  localHeader.writeUInt16LE(0, 12); // mod date
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(nameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28);

  localChunks.push(localHeader, nameBuf, compressed);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4); // version made by
  centralHeader.writeUInt16LE(20, 6); // version needed
  centralHeader.writeUInt16LE(0, 8); // flags
  centralHeader.writeUInt16LE(8, 10); // method
  centralHeader.writeUInt16LE(0, 12); // mod time
  centralHeader.writeUInt16LE(0, 14); // mod date
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(nameBuf.length, 28);
  centralHeader.writeUInt16LE(0, 30); // extra length
  centralHeader.writeUInt16LE(0, 32); // comment length
  centralHeader.writeUInt16LE(0, 34); // disk number
  centralHeader.writeUInt16LE(0, 36); // internal attrs
  centralHeader.writeUInt32LE(0, 38); // external attrs
  centralHeader.writeUInt32LE(offset, 42);

  centralChunks.push(centralHeader, nameBuf);

  offset += localHeader.length + nameBuf.length + compressed.length;
}

const centralDirStart = offset;
const centralDirBuf = Buffer.concat(centralChunks);

const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralDirBuf.length, 12);
end.writeUInt32LE(centralDirStart, 16);
end.writeUInt16LE(0, 20);

writeFileSync(zipPath, Buffer.concat([...localChunks, centralDirBuf, end]));
console.log(`Packaged ${files.length} files into ${zipPath}`);

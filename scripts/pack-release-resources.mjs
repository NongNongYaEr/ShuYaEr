// Content-defined chunks share repeated embedded plant data across runtime files.
// Extraction restores the original bytes; this does not alter runtime assets.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
const [app, manifestFile, output] = process.argv.slice(2).map(file => path.resolve(file));
const inputManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8').replace(/^\uFEFF/, ''));
if (fs.existsSync(output) || fs.existsSync(output + '.blocks')) throw Error('Use fresh resource output paths');
const pool = output + '.blocks', descriptor = fs.openSync(pool, 'wx');
const blocks = [], files = [], ids = new Map(), gear = new Uint32Array(256);
let seed = 0x51f15e5d, dataBytes = 0, inputBytes = 0, references = 0;
for (let index = 0; index < gear.length; index++) {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; gear[index] = seed >>> 0;
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function block(bytes) {
  const sha256 = digest(bytes); let id = ids.get(sha256);
  if (id === undefined) {
    id = blocks.length; ids.set(sha256, id);
    const compressed = deflateRawSync(bytes, { level: 6 });
    let written = 0;
    while (written < compressed.length) written += fs.writeSync(descriptor, compressed, written, compressed.length - written);
    blocks.push({ bytes: bytes.length, compressedBytes: compressed.length, offset: dataBytes, sha256 });
    dataBytes += compressed.length;
  }
  references++; return id;
}
try {
  for (const [fileIndex, item] of inputManifest.files.entries()) {
    const file = path.resolve(app, item.path);
    if (!file.startsWith(app + path.sep)) throw Error('Invalid manifest path');
    const bytes = fs.readFileSync(file);
    if (bytes.length !== item.bytes || digest(bytes) !== item.sha256) throw Error('Runtime file changed after audit: ' + item.path);
    inputBytes += bytes.length;
    const fileBlocks = []; let start = 0, rolling = 0;
    for (let position = 0; position < bytes.length; position++) {
      rolling = ((rolling << 1) + gear[bytes[position]]) >>> 0;
      const length = position - start + 1;
      if (length >= 32768 && ((rolling & 131071) === 0 || length >= 524288)) {
        fileBlocks.push(block(bytes.subarray(start, position + 1))); start = position + 1; rolling = 0;
      }
    }
    if (start < bytes.length) fileBlocks.push(block(bytes.subarray(start)));
    files.push({ path: item.path, bytes: item.bytes, sha256: item.sha256, blocks: fileBlocks });
    if (fileIndex % 150 === 0) console.log(JSON.stringify({ files: fileIndex + 1, total: inputManifest.files.length, uniqueBlocks: blocks.length, compressedMB: Math.round(dataBytes / 1048576) }));
  }
} finally { fs.closeSync(descriptor); }
const manifest = Buffer.from(JSON.stringify({ version: 1, files, blocks, unpackedBytes: inputBytes }));
const header = Buffer.alloc(24); header.write('TREEDUCK_PACK_V1', 'ascii'); header.writeBigInt64LE(BigInt(manifest.length), 16);
const target = fs.createWriteStream(output, { flags: 'wx' }); target.write(header); target.write(manifest);
for await (const bytes of fs.createReadStream(pool)) { if (!target.write(bytes)) await new Promise(resolve => target.once('drain', resolve)); }
await new Promise((resolve, reject) => { target.on('error', reject); target.end(resolve); });
const report = { passed: true, files: files.length, inputBytes, packedBytes: fs.statSync(output).size,
  uniqueBlocks: blocks.length, totalBlockReferences: references, sharedBlockReferences: references - blocks.length,
  policy: 'Content-defined deduplication; extraction reconstructs each original file and verifies SHA256' };
fs.writeFileSync(output + '.audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));

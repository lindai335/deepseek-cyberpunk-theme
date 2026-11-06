// Minimal asar reader: list / extract files from an Electron .asar archive.
const fs = require('fs');
const path = require('path');

function readHeader(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  const headerSize = head.readUInt32LE(12);
  const buf = Buffer.alloc(headerSize);
  fs.readSync(fd, buf, 0, headerSize, 16);
  fs.closeSync(fd);
  return { header: JSON.parse(buf.toString('utf8')), base: 8 + head.readUInt32LE(4) };
}

function walk(node, prefix, out) {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const p = prefix ? prefix + '/' + name : name;
    if (entry.files) walk(entry, p, out);
    else out.push({ path: p, size: entry.size, offset: entry.offset });
  }
  return out;
}

function list(file) {
  const { header, base } = readHeader(file);
  const entries = walk(header, '', []);
  return { base, entries };
}

function extract(file, entryPath, dest) {
  const { header, base } = readHeader(file);
  const parts = entryPath.split('/');
  let node = header;
  for (const p of parts) {
    node = node.files[p];
    if (!node) throw new Error('not found: ' + entryPath);
  }
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(node.size);
  fs.readSync(fd, buf, 0, node.size, base + Number(node.offset));
  fs.closeSync(fd);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return node.size;
}

module.exports = { list, extract };

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'list') {
    const { entries } = list(rest[0]);
    const pattern = rest[1] ? new RegExp(rest[1], 'i') : null;
    for (const e of entries) {
      if (!pattern || pattern.test(e.path)) {
        console.log(String(e.size).padStart(10) + '  ' + e.path);
      }
    }
    console.log('TOTAL ENTRIES: ' + entries.length);
  } else if (cmd === 'extract') {
    console.log('wrote ' + extract(rest[0], rest[1], rest[2]) + ' bytes -> ' + rest[2]);
  }
}

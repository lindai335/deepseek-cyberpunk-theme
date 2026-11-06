// Scan asar file contents for a regex and report matching paths + line excerpts.
const fs = require('fs');
const { list } = require('./asar-list.js');

const asar = process.argv[2];
const pattern = new RegExp(process.argv[3], 'i');
const maxHits = Number(process.argv[4] || 20);

const { base, entries } = list(asar);
const fd = fs.openSync(asar, 'r');
let hits = 0;

for (const e of entries) {
  if (!/\.(js|cjs|mjs|ts|json|yml|yaml|md)$/i.test(e.path)) continue;
  if (e.path.includes('/node_modules/') && e.path.split('/node_modules/').length > 2) continue;
  if (e.size > 8 * 1024 * 1024) continue;
  const buf = Buffer.alloc(e.size);
  fs.readSync(fd, buf, 0, e.size, base + Number(e.offset));
  const text = buf.toString('utf8');
  if (!pattern.test(text)) continue;
  const lines = text.split(/\r?\n/);
  const matched = [];
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      matched.push(`${i + 1}: ${lines[i].trim().slice(0, 220)}`);
      if (matched.length >= 4) break;
    }
  }
  console.log('=== ' + e.path + ' (' + e.size + ')');
  console.log(matched.join('\n'));
  hits++;
  if (hits >= maxHits) break;
}
fs.closeSync(fd);
console.log('files matched:', hits);

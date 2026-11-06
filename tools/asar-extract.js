// Extract multiple files from an asar into a mirror directory.
const fs = require('fs');
const path = require('path');
const { list, extract } = require('./asar-list.js');

const asar = process.argv[2];
const outRoot = process.argv[3];
const patterns = process.argv.slice(4);

const { entries } = list(asar);
const wanted = entries.filter((e) => {
  if (e.path.includes('/node_modules/') && e.path.split('/node_modules/').length > 2) return false;
  return patterns.some((p) => e.path.includes(p));
});

for (const e of wanted) {
  const dest = path.join(outRoot, e.path.replace(/\//g, path.sep));
  try {
    extract(asar, e.path, dest);
    console.log(String(e.size).padStart(9), e.path);
  } catch (err) {
    console.log('FAIL', e.path, err.message);
  }
}
console.log('extracted', wanted.length);

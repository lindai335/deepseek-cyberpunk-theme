// Inspect the runtime-injected sidebar stylesheet for color sources.
const fs = require('fs');

const file = process.argv[2] || 'C:/D界面主题/extract/sidebar/client.js';
const t = fs.readFileSync(file, 'utf8');

const colors = [...t.matchAll(/color:\s*[^;"'`]{1,70}/g)].map((m) => m[0].trim());
const uniq = [...new Set(colors)];
console.log('distinct color declarations:', uniq.length);
uniq.slice(0, 45).forEach((c) => console.log('  ', c));

console.log('\n--- selectors mentioning the dark-theme attribute ---');
const dark = [...t.matchAll(/[^{}]{0,90}data-ds-dark-theme[^{}]{0,140}/g)].map((m) => m[0].trim());
[...new Set(dark)].slice(0, 25).forEach((d) => console.log('  ', d));

console.log('\n--- hardcoded hex colors (not tokens) ---');
const hex = [...t.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
const hexUniq = [...new Set(hex)];
console.log(hexUniq.length, 'hex literals:', hexUniq.slice(0, 30).join(' '));

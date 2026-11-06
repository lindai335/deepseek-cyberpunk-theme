// Extract the theme palette CSS blocks (body / body[data-ds-dark-theme]) from the theme client bundle.
const fs = require('fs');

const src = fs.readFileSync('C:/D界面主题/extract/theme-client.js', 'utf8');

function blockAt(index) {
  const open = src.indexOf('{', index);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(index, i + 1);
    }
  }
  return '';
}

const bodies = [];
let idx = 0;
while (true) {
  const i = src.indexOf('body[data-ds-dark-theme]{', idx);
  if (i < 0) break;
  bodies.push({ at: i, css: blockAt(i) });
  idx = i + 1;
}

const plain = [];
idx = 0;
while (true) {
  const i = src.indexOf('body{', idx);
  if (i < 0) break;
  plain.push({ at: i, css: blockAt(i) });
  idx = i + 1;
}

fs.writeFileSync('C:/D界面主题/extract/palette-dark.css', bodies.map((b) => b.css).join('\n'));
fs.writeFileSync('C:/D界面主题/extract/palette-body.css', plain.map((b) => b.css).join('\n'));

function parse(css) {
  const out = {};
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(css))) out[m[1]] = m[2].trim();
  return out;
}

const bodyVars = parse(plain.map((b) => b.css).join('\n'));
const darkVars = parse(bodies.map((b) => b.css).join('\n'));

console.log('body vars:', Object.keys(bodyVars).length, 'dark vars:', Object.keys(darkVars).length);
fs.writeFileSync('C:/D界面主题/extract/palette.json', JSON.stringify({ body: bodyVars, dark: darkVars }, null, 2));
console.log('sample dark aliases:');
for (const k of Object.keys(darkVars).filter((k) => k.startsWith('--dsw-alias-')).slice(0, 15)) {
  console.log(' ', k, '=>', darkVars[k], ' (body:', bodyVars[k], ')');
}

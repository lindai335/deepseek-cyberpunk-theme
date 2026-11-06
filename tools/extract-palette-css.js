// Extract the theme palette stylesheet (static tokens + alias tokens) from the
// theme client bundle so the preview page can use the real design system.
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

const wanted = [':root{', 'body{', 'body[data-ds-dark-theme]{'];
const blocks = [];
for (const sel of wanted) {
  let idx = 0;
  while (true) {
    const i = src.indexOf(sel, idx);
    if (i < 0) break;
    const css = blockAt(i);
    // keep only palette blocks (they declare --dsw- tokens)
    if (css.includes('--dsw-')) blocks.push(css);
    idx = i + 1;
  }
}

const css = blocks.join('\n');
fs.writeFileSync('C:/D界面主题/preview/palette.css', css);
console.log('palette blocks:', blocks.length, 'bytes:', css.length);
console.log(css.slice(0, 200));

/**
 * Capture a screenshot of a page through the DevTools protocol.
 * Usage: node cdp-shot.js <url> <output.png> [port] [waitMs]
 */
const http = require('http');
const fs = require('fs');

const url = process.argv[2];
const out = process.argv[3];
const port = Number(process.argv[4] || 9222);
const waitMs = Number(process.argv[5] || 9000);

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const targets = await getJson('/json/list');
  const page = targets.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools://'));
  if (!page) throw new Error('no page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, waitMs));

  if (process.argv[6] === 'dismiss') {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const buttons = [...document.querySelectorAll('button')];
        const target = buttons.find(b => ['继续', 'Continue', '确定', 'OK'].includes((b.textContent || '').trim()));
        if (target) { target.click(); return 'clicked ' + target.textContent.trim(); }
        return 'no dismiss button';
      })()`,
      returnByValue: true,
    });
    await new Promise((r) => setTimeout(r, 2500));
  }

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('saved', out, fs.statSync(out).size, 'bytes');
  ws.close();
}

main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });

/**
 * Capture the overlay in each phase by forcing data-phase.
 * Usage: node cdp-phases.js <url> <outDir> [port]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
const outDir = process.argv[3];
const port = Number(process.argv[4] || 9222);

function getJson(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const targets = await getJson('/json/list');
  const page = targets.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools://'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'about:blank' });
  await new Promise((r) => setTimeout(r, 500));
  await send('Page.navigate', { url });

  // wait for the overlay
  for (let i = 0; i < 300; i++) {
    const probe = await send('Runtime.evaluate', { expression: `!!document.getElementById('rocket-boot')`, returnByValue: true });
    if (probe.result.value) break;
    await new Promise((r) => setTimeout(r, 20));
  }

  for (const phase of ['ignite', 'ascent', 'orbit']) {
    await send('Runtime.evaluate', {
      expression: `(() => { const r = document.getElementById('rocket-boot'); r.setAttribute('data-phase', '${phase}'); return r.getAttribute('data-phase'); })()`,
      returnByValue: true,
    });
    await new Promise((r) => setTimeout(r, 700));
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(outDir, `phase-${phase}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log('phase', phase, '->', file);
  }
  ws.close();
}

main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });

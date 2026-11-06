/**
 * Capture a sequence of screenshots of a page at given timestamps.
 * Usage: node cdp-sequence.js <url> <outDir> <port> <ms1,ms2,...>
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
const outDir = process.argv[3];
const port = Number(process.argv[4] || 9222);
const marks = (process.argv[5] || '500,1500,2500,4000,5000,6200').split(',').map(Number);

function getJson(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
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

  const t0 = Date.now();
  // Start from a blank page so a previous document (and its running overlay)
  // cannot be mistaken for the new one.
  await send('Page.navigate', { url: 'about:blank' });
  await new Promise((r) => setTimeout(r, 600));
  await send('Page.navigate', { url });

  // Wait for the overlay element itself, then time the frames from that moment
  // (its internal timeline starts when the script builds it).
  let anchor = Date.now();
  let age = -1;
  for (let i = 0; i < 300; i++) {
    const probe = await send('Runtime.evaluate', {
      expression: `(() => { const r = document.getElementById('rocket-boot'); return r ? performance.now() : -1; })()`,
      returnByValue: true,
    });
    if (probe.result.value >= 0) { anchor = Date.now(); age = probe.result.value; break; }
    await new Promise((r) => setTimeout(r, 20));
  }
  console.log('overlay detected at +' + (anchor - t0) + 'ms after navigation (page clock ' + Math.round(age) + 'ms)');

  for (const mark of marks) {
    // wait until the overlay's own clock reaches the target age
    for (let i = 0; i < 400; i++) {
      const probe = await send('Runtime.evaluate', {
        expression: `(() => { const r = document.getElementById('rocket-boot'); if (!r) return -1; return performance.now() - Number(r.getAttribute('data-t0') || 0); })()`,
        returnByValue: true,
      });
      const age = probe.result.value;
      if (age < 0 || age >= mark) break;
      await new Promise((r) => setTimeout(r, 15));
    }
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(outDir, `frame-${String(mark).padStart(5, '0')}ms.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    const state = await send('Runtime.evaluate', {
      expression: `(() => { const r = document.getElementById('rocket-boot'); if (!r) return 'gone'; const age = performance.now() - Number(r.getAttribute('data-t0') || 0); return r.getAttribute('data-phase') + '@' + Math.round(age) + 'ms'; })()`,
      returnByValue: true,
    });
    console.log(`target=${mark}ms overlay=${state.result.value} -> ${file}`);
  }
  ws.close();
}

main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });

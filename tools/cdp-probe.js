/**
 * Probe the served page for the injected rocket script and try to run it.
 * Usage: node cdp-probe.js <url> [port]
 */
const http = require('http');

const url = process.argv[2];
const port = Number(process.argv[3] || 9222);

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
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 2500));

  const out = await send('Runtime.evaluate', {
    expression: `(() => {
      const scripts = [...document.scripts];
      const idx = scripts.findIndex(s => (s.textContent || '').includes('__rocketBootInjected'));
      const s = idx >= 0 ? scripts[idx] : null;
      let evalError = null;
      if (s) { try { (0, eval)(s.textContent); } catch (e) { evalError = String(e && e.stack || e); } }
      return {
        totalScripts: scripts.length,
        rocketScriptIndex: idx,
        rocketScriptParent: s ? s.parentElement.tagName : null,
        rocketScriptInBody: s ? s.ownerDocument.body.contains(s) : null,
        rocketScriptHead: s ? s.ownerDocument.head.contains(s) : null,
        rocketScriptLen: s ? s.textContent.length : 0,
        evalError,
        flag: typeof window.__rocketBootInjected,
        overlay: !!document.getElementById('rocket-boot'),
      };
    })()`,
    returnByValue: true,
  });
  console.log(JSON.stringify(out.result.value, null, 2));
  ws.close();
}

main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });

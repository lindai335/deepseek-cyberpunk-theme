/**
 * Verify the boot transition lifecycle on the real app page.
 * Usage: node cdp-lifecycle.js <url> [port]
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

  await send('Page.navigate', { url: 'about:blank' });
  await new Promise((r) => setTimeout(r, 500));
  await send('Page.navigate', { url });

  const probe = async (label) => {
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const o = document.getElementById('rocket-boot');
        const cs = getComputedStyle(document.body);
        return {
          overlay: !!o,
          phase: o ? o.getAttribute('data-phase') : null,
          darkAttr: document.body.hasAttribute('data-ds-dark-theme'),
          themeSource: document.documentElement.dataset.dsThemeSource || null,
          appMounted: !!document.querySelector('#root *'),
          brand: cs.getPropertyValue('--dsw-alias-brand-primary').trim(),
          bg: cs.backgroundColor,
        };
      })()`,
      returnByValue: true,
    });
    console.log(label, JSON.stringify(r.result.value));
  };

  const start = Date.now();
  for (const at of [800, 2000, 3500, 5500, 8000, 10000]) {
    const wait = at - (Date.now() - start);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    await probe(`t=${String(at).padStart(5)}ms`);
  }
  ws.close();
}

main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });

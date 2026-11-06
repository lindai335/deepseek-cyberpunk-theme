/**
 * Navigate a page and print console output / exceptions / the rocket overlay state.
 * Usage: node cdp-console.js <url> [port] [waitMs]
 */
const http = require('http');

const url = process.argv[2];
const port = Number(process.argv[3] || 9222);
const waitMs = Number(process.argv[4] || 4000);

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
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[console.' + msg.params.type + ']', msg.params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.log('[exception]', msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    } else if (msg.method === 'Log.entryAdded') {
      console.log('[log.' + msg.params.entry.level + ']', msg.params.entry.text);
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, waitMs));
  const state = await send('Runtime.evaluate', {
    expression: `(() => ({
      flag: typeof window.__rocketBootInjected,
      overlay: !!document.getElementById('rocket-boot'),
      phase: (document.getElementById('rocket-boot')||{}).dataset?.phase || null,
      scripts: [...document.scripts].map(s => (s.src || 'inline').slice(-40)).slice(0, 12),
      bodyChildren: document.body ? document.body.children.length : -1,
    }))()`,
    returnByValue: true,
  });
  console.log(JSON.stringify(state.result.value, null, 2));
  ws.close();
}

main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });

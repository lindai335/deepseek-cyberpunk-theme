/**
 * Inspect a running page through the Chrome DevTools Protocol.
 *
 * Usage: node cdp-inspect.js <url> [port]
 * Launches nothing; it expects a browser already listening on the debug port
 * and inspects the first page target it finds.
 */
const http = require('http');

const url = process.argv[2];
const port = Number(process.argv[3] || 9222);

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
  if (!page) throw new Error('no page target found: ' + JSON.stringify(targets.map((t) => t.url)));

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

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 6000));

  const report = await evaluate(`(() => {
    const cs = getComputedStyle(document.body);
    const tokens = ['--dsw-alias-label-primary','--dsw-alias-label-secondary','--dsw-alias-label-tertiary',
      '--dsw-alias-bg-base','--dsw-alias-bg-layer-1','--dsw-alias-brand-primary','--dsw-specific-sidebar-fill'];
    const tokenValues = Object.fromEntries(tokens.map(t => [t, cs.getPropertyValue(t).trim()]));
    const inline = Object.fromEntries(tokens.map(t => [t, document.body.style.getPropertyValue(t)]));
    const sheets = [...document.styleSheets].map(s => {
      let rules = 0;
      try { rules = s.cssRules.length } catch { rules = -1 }
      return { href: s.href ? s.href.slice(-60) : '(inline)', rules };
    });
    const findText = (txt) => {
      const all = [...document.querySelectorAll('body *')];
      const el = all.find(e => e.children.length === 0 && (e.textContent || '').trim() === txt);
      if (!el) return null;
      const s = getComputedStyle(el);
      return { text: txt, color: s.color, opacity: s.opacity, visibility: s.visibility,
               parentOpacity: getComputedStyle(el.parentElement).opacity };
    };
    return {
      url: location.href,
      hasDarkAttr: document.body.hasAttribute('data-ds-dark-theme'),
      htmlThemeSource: document.documentElement.dataset.dsThemeSource || null,
      tokenValues, inline,
      sheets,
      samples: ['插件', '工作区', 'D界面主题'].map(findText),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      styleCount: document.querySelectorAll('style').length,
    };
  })()`);

  console.log(JSON.stringify(report, null, 2));
  ws.close();
}

main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });

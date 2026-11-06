/**
 * Verification harness for the cyberpunk theme installation.
 *
 * 1. Parses the desktop profile patch layer as YAML (the same dialect the
 *    loader reads) and applies the loader's `anchorInsertedPluginNames` rule.
 * 2. Imports the plugin exactly as the loader would (file URL import).
 * 3. Runs `apply` against a mock Cordis context and captures the injected
 *    index row.
 * 4. Renders the real frontend index.html with that row, using the webserver's
 *    own injection renderer, and checks the stylesheet landed in <head>.
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { isAbsolute, resolve, dirname } from 'node:path'
import { parse } from './yaml/dist/index.js'

const PROFILE_PATCH = 'C:/Users/Administrator/.dsh/profiles/desktop/cordis.patch.yml'
const DIST_INDEX = 'C:/D界面主题/extract/dist/index.html'

/** Loader rule: inserted names that are absolute or relative become file URLs. */
function anchorInsertedPluginNames(patches, file) {
  const base = dirname(resolve(file))
  const visit = (entry) => {
    if (typeof entry.name === 'string' && (isAbsolute(entry.name) || entry.name.startsWith('./') || entry.name.startsWith('../'))) {
      entry.name = pathToFileURL(resolve(base, entry.name)).href
    }
    if (entry.group && Array.isArray(entry.config)) entry.config.forEach(visit)
  }
  for (const patch of patches) patch.insert?.forEach(visit)
}

/** webserver renderIndexInjections, reduced to the rows this theme uses. */
function renderIndexInjections(html, rows) {
  let head = ''
  let body = ''
  for (const row of rows) {
    if (row.kind === 'style') head += `<style>${row.text}</style>`
    else if (row.kind === 'script') body += `<script>${row.text}</script>`
    else if (row.kind === 'global') head += `<script>globalThis[${JSON.stringify(row.name)}] = ${JSON.stringify(row.value)}</script>`
  }
  body += '<script>(globalThis.__DSH_BOOT_READY__ ??= Promise.withResolvers()).resolve()</script>'
  let out = html
  if (head !== '') {
    const open = /<head(?:\s[^>]*)?>/i.exec(out)
    out = out.slice(0, open.index + open[0].length) + head + out.slice(open.index + open[0].length)
  }
  if (body !== '') {
    const open = /<body(?:\s[^>]*)?>/i.exec(out)
    out = out.slice(0, open.index + open[0].length) + body + out.slice(open.index + open[0].length)
  }
  return out
}

// --- 1. parse the patch layer ------------------------------------------------
const raw = readFileSync(PROFILE_PATCH, 'utf8')
const patches = parse(raw)
console.log('patch layer parsed: %d patch entries', patches.length)
anchorInsertedPluginNames(patches, PROFILE_PATCH)

const inserted = []
for (const patch of patches) {
  for (const row of patch.insert ?? []) inserted.push(row)
}
console.log('inserted rows:', inserted.map((r) => `${r.id} -> ${r.name}`).join(' | ') || '(none)')

const themeRow = inserted.find((r) => r.id === 'cyberpunk-theme')
if (!themeRow) throw new Error('cyberpunk-theme row not found in the profile patch layer')

// --- 2. import the plugin the way the loader does -----------------------------
const module_ = await import(themeRow.name)
console.log('plugin imported:', themeRow.name)

// --- 3. run apply() against a mock context ------------------------------------
const listeners = []
const ctx = {
  logger: { warn: (...args) => console.log('  [warn]', ...args) },
  on: (event, handler) => listeners.push({ event, handler }),
}
module_.apply(ctx)

const indexHook = listeners.find((l) => l.event === 'webserver/index-inject')
if (!indexHook) throw new Error('plugin did not register the webserver/index-inject listener')
console.log('index-inject listener registered')

const table = []
indexHook.handler(table)
if (table.length !== 1 || table[0].kind !== 'style') throw new Error('unexpected injection row: ' + JSON.stringify(table))
console.log('style row captured: %d bytes of CSS', table[0].text.length)

// --- 4. render the real index --------------------------------------------------
const html = readFileSync(DIST_INDEX, 'utf8')
const rendered = renderIndexInjections(html, table)
const headEnd = rendered.indexOf('</head>')
const styleAt = rendered.indexOf('<style>')
const linkAt = rendered.indexOf('assets/index-BNyAYEM7.css')
console.log('style block inside <head>:', styleAt >= 0 && styleAt < headEnd)
console.log('style block precedes app stylesheet link:', styleAt >= 0 && styleAt < linkAt)

// sanity: the CSS declares the cyberpunk palette
for (const needle of ['--dsw-alias-bg-base: #04060d', '--dsw-alias-brand-primary: #00e5ff', 'body::after']) {
  if (!table[0].text.includes(needle)) throw new Error('missing expected CSS: ' + needle)
}
console.log('css payload contains the cyberpunk palette: OK')
console.log('\nrendered head preview:\n' + rendered.slice(rendered.indexOf('<head>'), rendered.indexOf('<style>') + 120) + ' ...')

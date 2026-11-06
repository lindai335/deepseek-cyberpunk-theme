/**
 * @local/rocket-boot — Host half.
 *
 * Injects the rocket-launch transition overlay (CSS + browser script) into every
 * index.html the Web GUI serves, through the same `webserver/index-inject` hook
 * the cyberpunk theme uses. The overlay plays between the boot screen and the
 * app UI: launch pad → ignition → ascent → orbit → handover, then it fades out
 * and the app is revealed.
 *
 * Both assets are re-read on every render (cached by mtime + size), so editing
 * them and refreshing the page is enough to see a change. Purely additive: if
 * an asset is missing the overlay simply degrades to nothing and the shell
 * still boots.
 */
import { readFileSync, statSync } from 'node:fs'

/** Stylesheet shipped next to this module. */
const CSS_URL = new URL('./rocket-boot.css', import.meta.url)
/** Browser-side overlay script shipped next to this module. */
const JS_URL = new URL('./rocket-boot.client.js', import.meta.url)

/** Stable Cordis plugin name. */
export const name = 'rocket-boot'

/**
 * Register the injection rows.
 * @param ctx - plugin context.
 */
export function apply(ctx) {
  const cache = new Map()

  /**
   * The web server splices body-placed rows after the FIRST `<body>` match in
   * the document, so an injected asset that mentions a body tag in a comment
   * would swallow every body row (including the theme's boot script). Keep the
   * text free of such tags and warn loudly if an edit reintroduces one.
   */
  const assertNoBodyTag = (text, label) => {
    if (/<\/?(body|head)\b/i.test(text)) {
      ctx.logger?.warn?.('rocket-boot: %s contains a body/head tag - body-placed index rows would be spliced into it and never run', label)
    }
  }

  const read = (url, label) => {
    try {
      const stat = statSync(url)
      const key = `${stat.mtimeMs}:${stat.size}`
      const cached = cache.get(label)
      if (cached && cached.key === key) return cached.text
      const text = readFileSync(url, 'utf8')
      assertNoBodyTag(text, label)
      cache.set(label, { key, text })
      return text
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      ctx.logger?.warn?.('rocket-boot: cannot read %s: %s', label, reason)
      return ''
    }
  }

  // Read once at startup so a broken asset is reported early.
  read(CSS_URL, 'rocket-boot.css')
  read(JS_URL, 'rocket-boot.client.js')

  ctx.on('webserver/index-inject', (table) => {
    const css = read(CSS_URL, 'rocket-boot.css')
    const js = read(JS_URL, 'rocket-boot.client.js')
    if (css) table.push({ kind: 'style', text: css })
    if (js) table.push({ kind: 'script', placement: 'body', text: js })
  })
}

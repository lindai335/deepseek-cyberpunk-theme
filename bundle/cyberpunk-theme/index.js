/**
 * @local/cyberpunk-theme — Host half.
 *
 * Injects the cyberpunk stylesheet into every index.html the Web GUI serves,
 * so the neon palette is already on screen when the shell boots. The hook is
 * the same `webserver/index-inject` row the built-in theme plugin uses for
 * its boot palette.
 *
 * The stylesheet is re-read on every render (cached by mtime + size), so
 * editing `cyberpunk.css` and refreshing the page is enough to see a change;
 * the plugin itself never needs a restart.
 *
 * The plugin owns no service and no config: it only contributes one style row.
 */
import { readFileSync, statSync } from 'node:fs'

/** Stylesheet shipped next to this module. */
const STYLESHEET = new URL('./cyberpunk.css', import.meta.url)

/** Stable Cordis plugin name. */
export const name = 'cyberpunk-theme'

/**
 * Register the style row.
 * @param ctx - plugin context.
 */
export function apply(ctx) {
  let cacheKey = ''
  let cacheCss = ''

  const readStylesheet = () => {
    try {
      const stat = statSync(STYLESHEET)
      const key = `${stat.mtimeMs}:${stat.size}`
      if (key !== cacheKey) {
        cacheKey = key
        cacheCss = readFileSync(STYLESHEET, 'utf8')
        // The web server splices body-placed index rows after the FIRST `<body>`
        // match in the document. A stylesheet that mentions a body tag in a
        // comment would swallow every body row - including the theme's own boot
        // script - so keep the text free of such tags and warn if one returns.
        if (/<\/?(body|head)\b/i.test(cacheCss)) {
          ctx.logger?.warn?.('cyberpunk-theme: cyberpunk.css contains a body/head tag - body-placed index rows would be spliced into it and never run')
        }
      }
      return cacheCss
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      ctx.logger?.warn?.('cyberpunk-theme: cannot read cyberpunk.css: %s', reason)
      return ''
    }
  }

  // Read once at startup so a broken stylesheet is reported early.
  readStylesheet()

  ctx.on('webserver/index-inject', (table) => {
    const css = readStylesheet()
    if (css === '') return
    table.push({ kind: 'style', text: css })
  })
}

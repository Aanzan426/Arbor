import type { Capture } from './types'
import { walkDocument } from './walk'

/**
 * Capture adapter: raw HTML string -> Capture.
 *
 * The HTML is parsed and laid out by a real browser engine in a real iframe. Nothing
 * here reimplements parsing — the entire point is to observe what the browser actually
 * did, which means the browser has to actually do it.
 *
 * WHY document.write AND NOT srcdoc
 * ---------------------------------
 * The obvious implementation is `frame.srcdoc = html`. It is wrong, and wrong in a way
 * that silently corrupts the result.
 *
 * The HTML spec exempts iframe srcdoc documents from the quirks-mode rule. So a
 * doctype-less document that is *quirks mode* as a real page becomes *standards mode*
 * inside srcdoc. Measured, on this exact input:
 *
 *     <html> <head> </head> <body> <p> Hello World! </p> </body> </html>
 *
 *     as a top-level page   compatMode = BackCompat   (quirks)
 *     via srcdoc            compatMode = CSS1Compat   (standards)   <- lie
 *     via document.write    compatMode = BackCompat   (quirks)      <- correct
 *
 * Quirks mode changes the box model, so every rect downstream would be subtly wrong for
 * exactly the documents most worth inspecting. Writing into an about:blank document
 * reproduces top-level parsing faithfully.
 *
 * A data: URL would also parse correctly, but modern browsers give data: URLs an opaque
 * origin, so contentDocument would be unreadable and the whole approach collapses.
 *
 * One more detail: the iframe is positioned offscreen but NOT `display: none`. A
 * display-none iframe performs no layout and every rect comes back zero.
 */

export const VIEWPORT = { w: 1280, h: 800 }

export function captureHtml(html: string, source = 'paste'): Promise<Capture> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.width = String(VIEWPORT.w)
    frame.height = String(VIEWPORT.h)
    frame.style.cssText = [
      'position:absolute',
      `left:-${VIEWPORT.w + 200}px`,
      'top:0',
      `width:${VIEWPORT.w}px`,
      `height:${VIEWPORT.h}px`,
      'border:0',
      'visibility:hidden',
    ].join(';')

    const cleanup = () => frame.remove()

    const finish = () => {
      try {
        const doc = frame.contentDocument
        if (!doc) throw new Error('iframe document was not accessible')
        const capture = walkDocument(doc, source)
        cleanup()
        resolve(capture)
      } catch (err) {
        cleanup()
        reject(err)
      }
    }

    // Two frames: one for layout to settle, one for anything that reflowed during it.
    const settle = () => requestAnimationFrame(() => requestAnimationFrame(finish))

    frame.addEventListener(
      'load',
      () => {
        try {
          const doc = frame.contentDocument
          const win = frame.contentWindow
          if (!doc || !win) throw new Error('iframe document was not accessible')

          doc.open()
          doc.write(html)
          doc.close()

          if (doc.readyState === 'complete') settle()
          else win.addEventListener('load', settle, { once: true })
        } catch (err) {
          cleanup()
          reject(err)
        }
      },
      { once: true },
    )

    frame.src = 'about:blank'
    document.body.appendChild(frame)
  })
}

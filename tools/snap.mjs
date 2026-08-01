/**
 * Regenerates snaps/ against a running dev server.
 *
 *   npm i -D playwright     # not a committed dependency — see snaps/README.md
 *   npm run dev             # in another terminal
 *   node tools/snap.mjs
 *
 * Two things this script exists to get right, both learned the hard way:
 *
 *   1. OrbitControls has damping enabled, so the camera is still easing into place for a
 *      few hundred milliseconds after a mode switch or a recentre. Screenshotting or
 *      raycasting before it settles gives different results run to run — the hover probe
 *      below hit a different element on two consecutive passes because of exactly this.
 *
 *   2. Hover is driven by a raycast in the render loop, so there is no DOM element to
 *      click. The only way to drive it is a synthetic pointermove at real canvas
 *      coordinates, then a probe to find out what was actually under the cursor.
 */

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const URL = process.env.ARBOR_URL ?? 'http://localhost:5199/'
const OUT = new URL('../snaps/', import.meta.url).pathname
const VIEWPORT = { width: 1500, height: 940 }

/** Long enough for OrbitControls damping to come to rest. */
const SETTLE = 700

const shots = [
  { file: '01-hello-dom', sample: 0, mode: 'dom' },
  { file: '02-hello-no-whitespace', toggles: { 'opt-ws': false } },
  { file: '03-structure-dom', sample: 1, mode: 'dom', gap: 70, toggles: { 'opt-ws': true } },
  { file: '04-structure-render', mode: 'render' },
  { file: '05-structure-diff', mode: 'diff' },
  { file: '06-stacking-sample-dom', sample: 2, mode: 'dom', gap: 90 },
  { file: '07-stacking-tree', mode: 'stacking' },
  { file: '08-hover-z9999', hover: 'div.boosted' },
  {
    file: '09-no-reference',
    sample: 1,
    mode: 'dom',
    gap: 70,
    toggles: { 'opt-planes': false, 'opt-ruler': false, 'opt-links': false },
  },
  {
    file: '10-with-reference',
    toggles: { 'opt-planes': true, 'opt-ruler': true, 'opt-links': true },
  },
]

const apply = async (page, opts) =>
  page.evaluate(async (o) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    if (o.sample !== undefined) {
      const sel = document.getElementById('sample')
      sel.value = String(o.sample)
      sel.dispatchEvent(new Event('change'))
      await wait(1100)
    }
    if (o.mode) {
      document.querySelector(`button[data-mode="${o.mode}"]`).click()
      await wait(400)
    }
    for (const [id, val] of Object.entries(o.toggles ?? {})) {
      const el = document.getElementById(id)
      if (el.checked !== val) {
        el.checked = val
        el.dispatchEvent(new Event('change'))
      }
    }
    if (o.gap) {
      const g = document.getElementById('opt-gap')
      g.value = String(o.gap)
      g.dispatchEvent(new Event('input'))
    }
    await wait(400)
    return document.getElementById('stats').innerText.replace(/\n+/g, ' | ')
  }, opts)

/**
 * Sweeps synthetic pointermoves across the canvas until the readout names `target`.
 * Returns whether it found it — a miss is reported rather than silently shipping a
 * screenshot of the wrong element.
 */
const hover = async (page, target) =>
  page.evaluate(async (want) => {
    const canvas = document.querySelector('#stage canvas')
    const rect = canvas.getBoundingClientRect()
    const readout = document.getElementById('readout')
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    await wait(600) // damping must be at rest before any raycast

    for (let fx = 0.2; fx <= 0.85; fx += 0.025) {
      for (let fy = 0.2; fy <= 0.8; fy += 0.025) {
        canvas.dispatchEvent(
          new PointerEvent('pointermove', {
            clientX: rect.left + rect.width * fx,
            clientY: rect.top + rect.height * fy,
            bubbles: true,
          }),
        )
        await wait(30)
        if (readout.classList.contains('on') && readout.textContent.startsWith(want)) {
          return readout.textContent
        }
      }
    }
    return null
  }, target)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: VIEWPORT })
await page.goto(URL, { waitUntil: 'networkidle' })
await mkdir(OUT, { recursive: true })

let failed = 0
for (const shot of shots) {
  const { file, hover: hoverTarget, ...opts } = shot
  const stats = await apply(page, opts)

  if (hoverTarget) {
    const found = await hover(page, hoverTarget)
    if (!found) {
      console.error(`  !! ${file}: never hovered "${hoverTarget}" — skipped`)
      failed++
      continue
    }
  }

  await page.waitForTimeout(SETTLE)
  await page.screenshot({ path: `${OUT}${file}.png` })
  console.log(`  ${file}.png\n    ${stats}`)
}

await browser.close()
console.log(failed ? `\n${failed} shot(s) failed.` : '\nAll shots captured.')
process.exit(failed ? 1 : 0)

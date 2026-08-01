import './style.css'
import { captureHtml } from './capture/fromHtml'
import type { Capture, CapturedNode } from './capture/types'
import { buildScene } from './render/build'
import { createViewer } from './render/scene'

const SAMPLE = `<html> <head> </head> <body> <p> Hello World! </p> </body> </html>`

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const srcEl = $<HTMLTextAreaElement>('src')
const statsEl = $('stats')
const errEl = $('err')
const readoutEl = $('readout')
const gapVal = $('gap-val')

const optText = $<HTMLInputElement>('opt-text')
const optWs = $<HTMLInputElement>('opt-ws')
const optLinks = $<HTMLInputElement>('opt-links')
const optGap = $<HTMLInputElement>('opt-gap')

const viewer = createViewer($('stage'))

let capture: Capture | null = null

function options() {
  return {
    gap: Number(optGap.value),
    showText: optText.checked,
    showWhitespace: optWs.checked,
    showLinks: optLinks.checked,
  }
}

function rebuild() {
  if (!capture) return
  viewer.setScene(buildScene(capture, options()))
}

function renderStats(c: Capture) {
  const s = c.stats
  const quirks = c.compatMode === 'BackCompat'
  statsEl.innerHTML = [
    `nodes      <b>${s.total}</b>`,
    `elements   <b>${s.elements}</b>`,
    `text       <b>${s.texts}</b>`,
    `whitespace <b class="hot">${s.whitespaceTexts}</b>`,
    `zero-size  <b>${s.degenerate}</b>`,
    `max depth  <b>${s.maxDepth}</b>`,
    `mode       <b class="${quirks ? 'hot' : ''}">${quirks ? 'quirks' : 'standards'}</b>`,
  ].join('\n')
}

async function explode(html: string) {
  errEl.textContent = ''
  try {
    capture = await captureHtml(html)
    renderStats(capture)
    rebuild()
    viewer.resetCamera()
  } catch (err) {
    errEl.textContent = err instanceof Error ? err.message : String(err)
  }
}

function describe(n: CapturedNode): string {
  const lines: string[] = []
  if (n.kind === 'element') {
    let sel = n.tag
    if (n.id) sel += `#${n.id}`
    if (n.classes) sel += n.classes.map((c) => `.${c}`).join('')
    lines.push(sel)
  } else {
    lines.push(n.whitespaceOnly ? '#text  (whitespace only)' : '#text')
    lines.push(`value  ${JSON.stringify(n.text ?? '')}`)
  }
  lines.push(`depth  ${n.depth}`)
  lines.push(
    `box    ${Math.round(n.rect.x)}, ${Math.round(n.rect.y)}  ` +
      `${Math.round(n.rect.w)} x ${Math.round(n.rect.h)}${n.degenerate ? '   (no box)' : ''}`,
  )
  if (n.display) lines.push(`display ${n.display}   position ${n.position}   z ${n.zIndex}`)
  return lines.join('\n')
}

viewer.onHover((node) => {
  if (!node) {
    readoutEl.classList.remove('on')
    return
  }
  readoutEl.textContent = describe(node)
  readoutEl.classList.add('on')
})

$('explode').addEventListener('click', () => void explode(srcEl.value))
$('reset').addEventListener('click', () => viewer.resetCamera())
$('sample').addEventListener('click', () => {
  srcEl.value = SAMPLE
  void explode(SAMPLE)
})

for (const el of [optText, optWs, optLinks]) el.addEventListener('change', rebuild)
optGap.addEventListener('input', () => {
  gapVal.textContent = optGap.value
  rebuild()
})

srcEl.value = SAMPLE
void explode(SAMPLE)

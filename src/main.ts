import './style.css'
import { captureHtml } from './capture/fromHtml'
import type { Capture, CapturedNode } from './capture/types'
import type { TreeMode } from './render/build'
import { buildScene } from './render/build'
import { createViewer } from './render/scene'
import { SAMPLES } from './samples'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const srcEl = $<HTMLTextAreaElement>('src')
const sampleEl = $<HTMLSelectElement>('sample')
const statsEl = $('stats')
const legendEl = $('legend')
const noteEl = $('mode-note')
const errEl = $('err')
const readoutEl = $('readout')
const gapVal = $('gap-val')
const modeEl = $('mode')

const optText = $<HTMLInputElement>('opt-text')
const optWs = $<HTMLInputElement>('opt-ws')
const optLinks = $<HTMLInputElement>('opt-links')
const optPlanes = $<HTMLInputElement>('opt-planes')
const optRuler = $<HTMLInputElement>('opt-ruler')
const optGap = $<HTMLInputElement>('opt-gap')

const viewer = createViewer($('stage'))

let capture: Capture | null = null
let mode: TreeMode = 'dom'

function options() {
  return {
    mode,
    gap: Number(optGap.value),
    showText: optText.checked,
    showWhitespace: optWs.checked,
    showLinks: optLinks.checked,
    showPlanes: optPlanes.checked,
    showRuler: optRuler.checked,
  }
}

const NOTES: Record<TreeMode, string> = {
  dom: 'Everything the parser produced — including nodes that generate no box at all.',
  render:
    'Only nodes that generate a box. <b>::before / ::after</b> appear here and exist in no DOM.',
  diff: 'Coloured by tree: <i>DOM only</i>, <b>render only</b>, or both.',
  stacking:
    'z is <b>stacking depth</b>, not DOM depth. z-index only orders siblings inside one context — which is why <i>z-index: 9999</i> can still paint below <i>z-index: 1</i>.',
}

const LEGENDS: Record<TreeMode, string> = {
  dom: `<span><i class="sw grad"></i> element, by depth</span>
        <span><i class="sw" style="background:#7dffb0"></i> text</span>
        <span><i class="sw" style="background:#ffb347"></i> whitespace only</span>`,
  render: `<span><i class="sw grad"></i> element, by depth</span>
        <span><i class="sw" style="background:#7dffb0"></i> text</span>
        <span><i class="sw" style="background:#9d7bff"></i> ::before / ::after</span>`,
  diff: `<span><i class="sw" style="background:#4d7fa8"></i> in both trees</span>
        <span><i class="sw" style="background:#ff5470"></i> DOM only — no box</span>
        <span><i class="sw" style="background:#9d7bff"></i> render only — not in DOM</span>`,
  stacking: `<span><i class="sw" style="background:#ffd166"></i> forms a stacking context</span>
        <span><i class="sw" style="background:#3f6c8f"></i> paints inside one</span>
        <span><i class="sw" style="background:#ff5470"></i> z-index set but inert</span>`,
}

function rebuild() {
  if (!capture) return
  viewer.setScene(buildScene(capture, options()))
  noteEl.innerHTML = NOTES[mode]
  legendEl.innerHTML = LEGENDS[mode]
}

function renderStats(c: Capture) {
  const s = c.stats
  const quirks = c.compatMode === 'BackCompat'
  statsEl.innerHTML = [
    `nodes        <b>${s.total}</b>`,
    `elements     <b>${s.elements}</b>`,
    `text         <b>${s.texts}</b>`,
    `whitespace   <b class="hot">${s.whitespaceTexts}</b>`,
    `max depth    <b>${s.maxDepth}</b>`,
    `mode         <b class="${quirks ? 'hot' : ''}">${quirks ? 'quirks' : 'standards'}</b>`,
    ``,
    `in DOM       <b>${s.inDom}</b>`,
    `in render    <b>${s.inRender}</b>`,
    `DOM only     <b class="hot">${s.domOnly}</b>`,
    `render only  <b class="hot">${s.renderOnly}</b>`,
    ``,
    `stack ctxs   <b>${s.stackingContexts}</b>`,
    `stack depth  <b>${s.maxStackingDepth}</b>`,
    `dead z-index <b class="hot">${s.deadZIndex}</b>`,
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

function nameOf(n: CapturedNode): string {
  if (n.kind === 'element') {
    let sel = n.tag
    if (n.id) sel += `#${n.id}`
    if (n.classes) sel += n.classes.map((c) => `.${c}`).join('')
    return sel
  }
  return n.tag
}

function describe(n: CapturedNode): string {
  const lines: string[] = []

  lines.push(nameOf(n))
  if (n.kind === 'pseudo') lines.push(`content   ${n.text ?? ''}`)
  if (n.kind === 'text') {
    if (n.whitespaceOnly) lines[0] = '#text  (whitespace only)'
    lines.push(`value     ${JSON.stringify(n.text ?? '')}`)
  }

  const tree =
    n.membership === 'both'
      ? 'DOM + render'
      : n.membership === 'dom'
        ? `DOM only — ${n.reason ?? 'no box'}`
        : 'render only — not in the DOM'
  lines.push(`tree      ${tree}`)
  lines.push(`depth     ${n.depth}   (DOM)`)

  if (n.stackingReason) {
    lines.push(`stacking  FORMS A CONTEXT — ${n.stackingReason}`)
  } else {
    const host = capture?.nodes[n.stackingContext]
    lines.push(`stacking  inside ${host ? nameOf(host) : '(root)'}   depth ${n.stackingDepth}`)
  }
  if (n.zIndexIneffective) {
    lines.push(`          z-index:${n.zIndex} IGNORED — position:static, not a flex/grid item`)
  }

  lines.push(
    `box       ${Math.round(n.rect.x)}, ${Math.round(n.rect.y)}  ` +
      `${Math.round(n.rect.w)} x ${Math.round(n.rect.h)}` +
      (n.degenerate ? '   (no box)' : '') +
      (n.approximate ? '   (position approximated)' : ''),
  )
  if (n.display) lines.push(`display   ${n.display}   position ${n.position}   z ${n.zIndex}`)
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

modeEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button[data-mode]') as HTMLElement | null
  if (!btn) return
  mode = btn.dataset.mode as TreeMode
  for (const b of Array.from(modeEl.querySelectorAll('button'))) {
    b.classList.toggle('on', b === btn)
  }
  rebuild()
  viewer.resetCamera()
})

for (const [i, s] of SAMPLES.entries()) {
  const opt = document.createElement('option')
  opt.value = String(i)
  opt.textContent = s.name
  sampleEl.appendChild(opt)
}
sampleEl.addEventListener('change', () => {
  const s = SAMPLES[Number(sampleEl.value)]
  if (!s) return
  srcEl.value = s.html
  void explode(s.html)
})

$('explode').addEventListener('click', () => void explode(srcEl.value))
$('reset').addEventListener('click', () => viewer.resetCamera())

for (const el of [optText, optWs, optLinks, optPlanes, optRuler]) {
  el.addEventListener('change', rebuild)
}
optGap.addEventListener('input', () => {
  gapVal.textContent = optGap.value
  rebuild()
})

srcEl.value = SAMPLES[0].html
void explode(SAMPLES[0].html)

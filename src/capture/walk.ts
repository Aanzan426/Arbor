import type { Capture, CapturedNode, Rect } from './types'

/**
 * Walks a live Document and records every node with its real geometry.
 *
 * The geometry is not computed here — the browser already did it during layout.
 * Elements hand it over via getBoundingClientRect(); text nodes need a Range,
 * because a text node is not an Element and has no such method.
 *
 * Text nodes are included on purpose. They are the whole point: a source file with
 * four tags becomes a tree with ten nodes, and five of them are whitespace nobody
 * knew they wrote.
 */

const EMPTY: Rect = { x: 0, y: 0, w: 0, h: 0 }

function rectOfElement(el: Element, sx: number, sy: number): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.x + sx, y: r.y + sy, w: r.width, h: r.height }
}

function rectOfText(node: Text, doc: Document, sx: number, sy: number): Rect {
  // A text node has no getBoundingClientRect. Select its contents with a Range and
  // ask the Range instead — this is the only way to locate text in the viewport.
  const range = doc.createRange()
  range.selectNodeContents(node)
  const r = range.getBoundingClientRect()
  range.detach?.()
  if (!r || (r.width === 0 && r.height === 0 && r.x === 0 && r.y === 0)) return EMPTY
  return { x: r.x + sx, y: r.y + sy, w: r.width, h: r.height }
}

export function walkDocument(doc: Document, source: string): Capture {
  const win = doc.defaultView
  const sx = win?.scrollX ?? 0
  const sy = win?.scrollY ?? 0

  const nodes: CapturedNode[] = []
  let maxDepth = 0

  const visit = (node: Node, parent: number, depth: number) => {
    const index = nodes.length
    let record: CapturedNode | null = null

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      const rect = rectOfElement(el, sx, sy)
      const cs = win ? win.getComputedStyle(el) : null
      record = {
        index,
        parent,
        depth,
        kind: 'element',
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        classes: el.classList.length ? Array.from(el.classList) : undefined,
        rect,
        degenerate: rect.w === 0 || rect.h === 0,
        display: cs?.display,
        position: cs?.position,
        zIndex: cs?.zIndex,
        opacity: cs ? Number(cs.opacity) : undefined,
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text
      const value = text.nodeValue ?? ''
      const rect = rectOfText(text, doc, sx, sy)
      record = {
        index,
        parent,
        depth,
        kind: 'text',
        tag: '#text',
        text: value,
        whitespaceOnly: value.trim().length === 0,
        rect,
        degenerate: rect.w === 0 || rect.h === 0,
      }
    }

    if (!record) return // comments, doctype, processing instructions: skipped for now

    nodes.push(record)
    if (depth > maxDepth) maxDepth = depth

    for (const child of Array.from(node.childNodes)) visit(child, index, depth + 1)
  }

  visit(doc.documentElement, -1, 0)

  const elements = nodes.filter((n) => n.kind === 'element').length
  const texts = nodes.filter((n) => n.kind === 'text').length

  return {
    source,
    title: doc.title || '(untitled)',
    compatMode: doc.compatMode,
    viewport: {
      w: win?.innerWidth ?? doc.documentElement.clientWidth,
      h: win?.innerHeight ?? doc.documentElement.clientHeight,
    },
    nodes,
    stats: {
      total: nodes.length,
      elements,
      texts,
      whitespaceTexts: nodes.filter((n) => n.whitespaceOnly).length,
      degenerate: nodes.filter((n) => n.degenerate).length,
      maxDepth,
    },
  }
}

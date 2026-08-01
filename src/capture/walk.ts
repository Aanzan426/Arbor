import type { Capture, CapturedNode, Membership, Rect } from './types'

/**
 * Walks a live Document and records every node with its real geometry, plus whether
 * that node survives into the render tree.
 *
 * The geometry is not computed here — the browser already did it during layout.
 * Elements hand it over via getBoundingClientRect(); text nodes need a Range, because
 * a text node is not an Element and has no such method.
 *
 * ON THE RENDER TREE
 * ------------------
 * Browsers do not expose their internal box tree to JavaScript. What is built here is a
 * RECONSTRUCTION from what is observable — computed styles, client rects, and
 * pseudo-element styles. It is accurate for the cases that matter and it is not the
 * engine's actual data structure. Specifically:
 *
 *   in DOM, not in render     display:none (and its whole subtree), everything inside
 *                             <head> (which the UA stylesheet sets to display:none),
 *                             whitespace text that layout collapsed away
 *   in render, not in DOM     ::before and ::after — real boxes that get painted and
 *                             are not nodes anywhere in the DOM
 *   in both                   everything else, including visibility:hidden, which still
 *                             generates a box and merely isn't painted
 *
 * Anonymous boxes (the engine wrapping stray inline content in a block) are genuinely
 * unobservable from JS and are not reconstructed. That gap is real; see the README.
 */

const EMPTY: Rect = { x: 0, y: 0, w: 0, h: 0 }

function rectOfElement(el: Element, sx: number, sy: number): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.x + sx, y: r.y + sy, w: r.width, h: r.height }
}

function rectOfText(node: Text, doc: Document, sx: number, sy: number): Rect {
  // A text node has no getBoundingClientRect. Select its contents with a Range and ask
  // the Range instead — the only way to locate text in the viewport.
  const range = doc.createRange()
  range.selectNodeContents(node)
  const r = range.getBoundingClientRect()
  if (!r || (r.width === 0 && r.height === 0 && r.x === 0 && r.y === 0)) return EMPTY
  return { x: r.x + sx, y: r.y + sy, w: r.width, h: r.height }
}

/** Does this pseudo-element actually generate a box? */
function pseudoBox(
  win: Window,
  el: Element,
  which: '::before' | '::after',
): CSSStyleDeclaration | null {
  let cs: CSSStyleDeclaration
  try {
    cs = win.getComputedStyle(el, which)
  } catch {
    return null
  }
  const content = cs.content
  // Chrome reports 'none' when the pseudo-element does not exist; some engines say
  // 'normal'. Either way there is no generated box.
  if (!content || content === 'none' || content === 'normal') return null
  if (cs.display === 'none') return null
  return cs
}

export function walkDocument(doc: Document, source: string): Capture {
  const win = doc.defaultView
  const sx = win?.scrollX ?? 0
  const sy = win?.scrollY ?? 0

  const nodes: CapturedNode[] = []
  let maxDepth = 0

  const push = (n: CapturedNode) => {
    nodes.push(n)
    if (n.depth > maxDepth) maxDepth = n.depth
  }

  /** Pseudo-elements have no geometry API. Infer a box just inside the host. */
  const pseudoRect = (host: Rect, cs: CSSStyleDeclaration, after: boolean): Rect => {
    const w = parseFloat(cs.width)
    const h = parseFloat(cs.height)
    const pw = Number.isFinite(w) && w > 0 ? w : 14
    const ph = Number.isFinite(h) && h > 0 ? h : 14
    return {
      x: after ? host.x + host.w - pw - 2 : host.x + 2,
      y: host.y + 2,
      w: pw,
      h: ph,
    }
  }

  const visit = (node: Node, parent: number, depth: number, headAncestor: boolean) => {
    const index = nodes.length

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      const tag = el.tagName.toLowerCase()
      const inHead = headAncestor || tag === 'head'
      const rect = rectOfElement(el, sx, sy)
      const cs = win ? win.getComputedStyle(el) : null

      let membership: Membership = 'both'
      let reason: string | undefined
      if (cs?.display === 'none') {
        membership = 'dom'
        reason = inHead ? 'in <head>' : 'display:none'
      } else if (el.getClientRects().length === 0) {
        membership = 'dom'
        reason = 'generates no box'
      }

      push({
        index,
        parent,
        depth,
        kind: 'element',
        tag,
        id: el.id || undefined,
        classes: el.classList.length ? Array.from(el.classList) : undefined,
        rect,
        degenerate: rect.w === 0 || rect.h === 0,
        membership,
        reason,
        display: cs?.display,
        position: cs?.position,
        zIndex: cs?.zIndex,
        opacity: cs ? Number(cs.opacity) : undefined,
      })

      // ::before — a box the DOM has no node for.
      const before = win ? pseudoBox(win, el, '::before') : null
      if (before) {
        push({
          index: nodes.length,
          parent: index,
          depth: depth + 1,
          kind: 'pseudo',
          tag: '::before',
          text: before.content,
          rect: pseudoRect(rect, before, false),
          degenerate: false,
          membership: 'render',
          approximate: true,
          display: before.display,
        })
      }

      for (const child of Array.from(el.childNodes)) visit(child, index, depth + 1, inHead)

      const after = win ? pseudoBox(win, el, '::after') : null
      if (after) {
        push({
          index: nodes.length,
          parent: index,
          depth: depth + 1,
          kind: 'pseudo',
          tag: '::after',
          text: after.content,
          rect: pseudoRect(rect, after, true),
          degenerate: false,
          membership: 'render',
          approximate: true,
          display: after.display,
        })
      }
      return
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text
      const value = text.nodeValue ?? ''
      const rect = rectOfText(text, doc, sx, sy)
      const whitespaceOnly = value.trim().length === 0
      const hasBox = rect.w > 0 || rect.h > 0

      let membership: Membership = 'both'
      let reason: string | undefined
      if (!hasBox) {
        membership = 'dom'
        reason = headAncestor
          ? 'in <head>'
          : whitespaceOnly
            ? 'whitespace collapsed'
            : 'generates no box'
      }

      push({
        index,
        parent,
        depth,
        kind: 'text',
        tag: '#text',
        text: value,
        whitespaceOnly,
        rect,
        degenerate: !hasBox,
        membership,
        reason,
      })
      return
    }

    // comments, doctype, processing instructions: skipped for now
  }

  visit(doc.documentElement, -1, 0, false)

  const elements = nodes.filter((n) => n.kind === 'element').length
  const texts = nodes.filter((n) => n.kind === 'text').length
  const domOnly = nodes.filter((n) => n.membership === 'dom').length
  const renderOnly = nodes.filter((n) => n.membership === 'render').length
  const both = nodes.filter((n) => n.membership === 'both').length

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
      inDom: both + domOnly,
      inRender: both + renderOnly,
      domOnly,
      renderOnly,
    },
  }
}

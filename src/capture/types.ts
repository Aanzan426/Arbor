/**
 * The capture format — the seam between "walking a DOM" and "drawing it".
 *
 * The renderer only ever sees this. It knows nothing about iframes, bookmarklets,
 * Playwright or live pages. Every capture adapter produces this and plugs in without
 * the renderer changing.
 */

export type Rect = { x: number; y: number; w: number; h: number }

export type NodeKind = 'element' | 'text'

export type CapturedNode = {
  /** index into Capture.nodes — also the identity used by the renderer */
  index: number
  /** index of the parent node, or -1 for the root */
  parent: number
  /** nesting depth from the document element; drives the z axis */
  depth: number
  kind: NodeKind
  /** lowercase tag name, or '#text' */
  tag: string
  id?: string
  classes?: string[]
  /** raw text content for text nodes — kept verbatim, whitespace included */
  text?: string
  /** true when a text node contains nothing but whitespace */
  whitespaceOnly?: boolean
  /** viewport-relative box, already offset by scroll into document coordinates */
  rect: Rect
  /** true when the node occupies no space at all (most whitespace text nodes) */
  degenerate: boolean
  display?: string
  position?: string
  zIndex?: string
  opacity?: number
}

export type Capture = {
  /** where this came from — 'paste', or a URL */
  source: string
  title: string
  /** 'CSS1Compat' = standards mode, 'BackCompat' = quirks mode */
  compatMode: string
  viewport: { w: number; h: number }
  nodes: CapturedNode[]
  stats: {
    total: number
    elements: number
    texts: number
    whitespaceTexts: number
    degenerate: number
    maxDepth: number
  }
}

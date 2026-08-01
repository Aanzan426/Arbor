/**
 * The capture format — the seam between "walking a DOM" and "drawing it".
 *
 * The renderer only ever sees this. It knows nothing about iframes, bookmarklets,
 * Playwright or live pages. Every capture adapter produces this and plugs in without
 * the renderer changing.
 */

export type Rect = { x: number; y: number; w: number; h: number }

export type NodeKind = 'element' | 'text' | 'pseudo'

/**
 * Which tree(s) a node belongs to.
 *
 *   'both'   in the DOM tree and generates a box
 *   'dom'    in the DOM tree, generates NO box (display:none, <head>, collapsed whitespace)
 *   'render' generates a box but is NOT in the DOM (::before / ::after)
 */
export type Membership = 'both' | 'dom' | 'render'

export type CapturedNode = {
  /** index into Capture.nodes — also the identity used by the renderer */
  index: number
  /** index of the parent node, or -1 for the root */
  parent: number
  /** nesting depth from the document element; drives the z axis */
  depth: number
  kind: NodeKind
  /** lowercase tag name, '#text', or '::before' / '::after' */
  tag: string
  id?: string
  classes?: string[]
  /** raw text content for text nodes — kept verbatim, whitespace included */
  text?: string
  /** true when a text node contains nothing but whitespace */
  whitespaceOnly?: boolean
  /** viewport-relative box, already offset by scroll into document coordinates */
  rect: Rect
  /** true when the node occupies no space at all */
  degenerate: boolean

  membership: Membership
  /** why a DOM node generates no box — 'display:none', 'in <head>', 'collapsed' … */
  reason?: string
  /** true when rect is inferred rather than measured (pseudo-elements have no rect API) */
  approximate?: boolean

  // --- stacking context tree -------------------------------------------------
  // A third tree, and the one that is genuinely about depth. An element's place in
  // it has little to do with its DOM depth: it belongs to the nearest ancestor that
  // *forms* a stacking context, which may be many DOM levels up or the root itself.

  /** the reason this element forms a stacking context, if it does */
  stackingReason?: string
  /** index of the node whose stacking context this node paints inside; -1 for the root */
  stackingContext: number
  /** depth in the stacking-context tree, not the DOM tree */
  stackingDepth: number
  /**
   * z-index is set but cannot do anything, because the element is `position: static`
   * and is not a flex/grid item. This is the most common z-index confusion there is.
   */
  zIndexIneffective?: boolean

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
    /** in the DOM tree (everything except synthesized pseudo-elements) */
    inDom: number
    /** generates a box */
    inRender: number
    /** in the DOM but dropped from the render tree */
    domOnly: number
    /** in the render tree but never in the DOM */
    renderOnly: number
    /** elements that form a stacking context */
    stackingContexts: number
    maxStackingDepth: number
    /** elements whose z-index is set but has no effect */
    deadZIndex: number
  }
}

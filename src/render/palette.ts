import { Color } from 'three'

/**
 * Colour is spent on ONE variable at a time.
 *
 * In 'dom' and 'render' modes, hue encodes depth. In 'diff' mode hue is taken over
 * entirely by tree membership, and depth falls back to the z axis alone — because two
 * things encoded on the same channel is what makes this kind of view unreadable.
 */

const HUE_START = 188 // cyan, shallow
const HUE_END = 322 // magenta, deep

export function depthColor(depth: number, maxDepth: number): Color {
  const t = maxDepth > 0 ? Math.min(depth / maxDepth, 1) : 0
  const hue = (HUE_START + (HUE_END - HUE_START) * t) / 360
  return new Color().setHSL(hue, 0.72, 0.58)
}

/** Whitespace-only text nodes: deliberately off-palette so they read as "other". */
export const WHITESPACE_COLOR = new Color(0xffb347)

/** Text nodes with real content. */
export const TEXT_COLOR = new Color(0x7dffb0)

/** diff mode — in both trees. */
export const BOTH_COLOR = new Color(0x4d7fa8)

/** diff mode — in the DOM, dropped from the render tree. */
export const DOM_ONLY_COLOR = new Color(0xff5470)

/** diff mode — a box that exists in no DOM (::before / ::after). */
export const RENDER_ONLY_COLOR = new Color(0x9d7bff)

/** stacking mode — an element that FORMS a stacking context. */
export const CONTEXT_COLOR = new Color(0xffd166)

/** stacking mode — an element that merely paints inside one. */
export const IN_CONTEXT_COLOR = new Color(0x3f6c8f)

/** stacking mode — z-index set but inert. */
export const DEAD_ZINDEX_COLOR = new Color(0xff5470)

export const REFERENCE_COLOR = new Color(0x3a4a60)
export const REFERENCE_TEXT = '#8296ad'

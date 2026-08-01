import { Color } from 'three'

/**
 * Colour is spent on ONE variable: depth. Everything else is encoded on other
 * channels — position for structure, opacity for degeneracy, edge brightness for
 * hover. Spending hue twice is what makes this kind of view unreadable.
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

export const HOVER_COLOR = new Color(0xffffff)

/**
 * Stacking context detection.
 *
 * A stacking context is a self-contained painting group. The rule that catches everyone:
 *
 *   z-index only orders siblings WITHIN one stacking context.
 *
 * So `z-index: 9999` does nothing if the element sits inside a context that its rival
 * paints above — no value, however large, escapes its own context. The reason this is so
 * hard to debug by reading CSS is that the properties which *create* a context mostly
 * look like they have nothing to do with layering: `opacity: 0.99`, a `transform`, a
 * `filter`, `will-change`. Someone adds a fade animation and a dropdown starts rendering
 * behind a footer.
 *
 * The list below is the CSS spec's, minus the parts JS cannot observe.
 *
 * Everything is read with getPropertyValue rather than the typed accessors, because the
 * newer properties (backdrop-filter, content-visibility, view-transition-name) are not
 * all present on CSSStyleDeclaration in every TS lib version.
 */

const CREATES_CONTEXT_WHEN_WILL_CHANGED =
  /opacity|transform|filter|perspective|clip-path|mask|isolation|backdrop-filter|contain|mix-blend-mode|z-index|rotate|scale|translate/

const get = (cs: CSSStyleDeclaration, prop: string) => cs.getPropertyValue(prop).trim()

const isSet = (v: string) => v !== '' && v !== 'none' && v !== 'normal' && v !== 'auto'

/** Is this element laid out by a flex or grid parent? z-index applies to those too. */
export function parentIsFlexOrGrid(parentCs: CSSStyleDeclaration | null): boolean {
  if (!parentCs) return false
  return /\b(flex|grid|inline-flex|inline-grid)\b/.test(get(parentCs, 'display'))
}

/**
 * Returns the reason this element forms a stacking context, or null if it doesn't.
 * The reason string is user-facing — it is what the hover readout shows.
 */
export function stackingReason(
  cs: CSSStyleDeclaration,
  isRoot: boolean,
  parentCs: CSSStyleDeclaration | null,
): string | null {
  if (isRoot) return 'root element'

  const position = get(cs, 'position')
  const zIndex = get(cs, 'z-index')

  if ((position === 'absolute' || position === 'relative') && zIndex !== 'auto') {
    return `position:${position} + z-index:${zIndex}`
  }
  if (position === 'fixed') return 'position:fixed'
  if (position === 'sticky') return 'position:sticky'

  const opacity = parseFloat(get(cs, 'opacity'))
  if (Number.isFinite(opacity) && opacity < 1) return `opacity:${opacity}`

  for (const prop of [
    'transform',
    'filter',
    'backdrop-filter',
    'perspective',
    'clip-path',
    'mask-image',
    'rotate',
    'scale',
    'translate',
    'view-transition-name',
  ]) {
    if (isSet(get(cs, prop))) return prop
  }

  const blend = get(cs, 'mix-blend-mode')
  if (blend && blend !== 'normal') return `mix-blend-mode:${blend}`

  if (get(cs, 'isolation') === 'isolate') return 'isolation:isolate'

  const contain = get(cs, 'contain')
  if (/\b(layout|paint|strict|content)\b/.test(contain)) return `contain:${contain}`

  if (get(cs, 'content-visibility') === 'auto') return 'content-visibility:auto'

  const willChange = get(cs, 'will-change')
  if (willChange && willChange !== 'auto' && CREATES_CONTEXT_WHEN_WILL_CHANGED.test(willChange)) {
    return `will-change:${willChange}`
  }

  // A flex or grid ITEM honours z-index without needing to be positioned.
  if (zIndex !== 'auto' && parentIsFlexOrGrid(parentCs)) {
    return `flex/grid item + z-index:${zIndex}`
  }

  return null
}

/**
 * z-index set, but inert: the element is statically positioned and is not a flex/grid
 * item, so the property is simply ignored. Worth surfacing on its own — it is a silent
 * no-op that looks like it should work.
 */
export function isZIndexDead(
  cs: CSSStyleDeclaration,
  parentCs: CSSStyleDeclaration | null,
): boolean {
  const zIndex = get(cs, 'z-index')
  if (zIndex === 'auto' || zIndex === '') return false
  if (get(cs, 'position') !== 'static') return false
  return !parentIsFlexOrGrid(parentCs)
}

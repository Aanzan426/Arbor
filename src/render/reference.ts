import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Sprite,
  SpriteMaterial,
} from 'three'
import type { Capture } from '../capture/types'
import { REFERENCE_COLOR, REFERENCE_TEXT } from './palette'

/**
 * Reference geometry — the scaffolding that makes depth readable.
 *
 * Without it, a stack of translucent planes in perspective gives the eye nothing to
 * measure against: you cannot tell whether a plane is small-and-near or large-and-far,
 * and "how deep is this node" is unanswerable. Three things fix that:
 *
 *   1. the page outline at z = 0      — a fixed, known rectangle; the page as it appears
 *   2. a faint frame at every depth   — so each level reads as a discrete plane
 *   3. a numbered ruler along z       — turning distance into an actual figure
 *
 * All of it is drawn in one flat colour on purpose. Reference must never compete with
 * the data for attention.
 */

/**
 * World units. Sprites shrink with distance under perspective, and the camera fits to
 * a ~1280x800 page, so anything much under this is unreadable at the default framing.
 */
const LABEL_HEIGHT = 52

function makeLabel(text: string, color = REFERENCE_TEXT): Sprite {
  const canvas = document.createElement('canvas')
  const font = 'bold 44px ui-monospace, SFMono-Regular, Menlo, monospace'

  // Measure first, then size the canvas. Setting width/height RESETS the context, so
  // the font has to be re-applied afterwards — a classic canvas trap.
  const probe = canvas.getContext('2d')!
  probe.font = font
  const textWidth = Math.ceil(probe.measureText(text).width)

  canvas.width = textWidth + 20
  canvas.height = 64

  const ctx = canvas.getContext('2d')!
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 10, 34)

  const sprite = new Sprite(
    new SpriteMaterial({
      map: new CanvasTexture(canvas),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  )
  const scale = LABEL_HEIGHT / canvas.height
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1)
  return sprite
}

function lines(points: number[], opacity: number): LineSegments {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(points, 3))
  return new LineSegments(
    geo,
    new LineBasicMaterial({ color: REFERENCE_COLOR, transparent: true, opacity }),
  )
}

/** Push the 8 vertices of a wireframe rectangle at depth z. */
function rectAt(out: number[], hw: number, hh: number, z: number) {
  const p = [
    [-hw, hh, z],
    [hw, hh, z],
    [hw, -hh, z],
    [-hw, -hh, z],
  ]
  for (let i = 0; i < 4; i++) {
    const a = p[i]
    const b = p[(i + 1) % 4]
    out.push(a[0], a[1], a[2], b[0], b[1], b[2])
  }
}

export type ReferenceOptions = {
  gap: number
  maxDepth: number
  showPlanes: boolean
  showRuler: boolean
}

export function buildReference(capture: Capture, opts: ReferenceOptions): Group {
  const group = new Group()
  const hw = capture.viewport.w / 2
  const hh = capture.viewport.h / 2

  // 1. The page outline at z = 0 — the one rectangle whose size you already know.
  const page: number[] = []
  rectAt(page, hw, hh, 0)
  group.add(lines(page, 0.75))

  // 2. A faint frame at each depth level.
  if (opts.showPlanes && opts.maxDepth > 0) {
    const planes: number[] = []
    for (let d = 1; d <= opts.maxDepth; d++) rectAt(planes, hw, hh, d * opts.gap)
    group.add(lines(planes, 0.16))
  }

  // 3. The ruler: a spine along z with a numbered tick at every depth.
  if (opts.showRuler) {
    const x = -hw - 70
    const y = -hh
    const spine: number[] = [x, y, 0, x, y, opts.maxDepth * opts.gap]
    for (let d = 0; d <= opts.maxDepth; d++) {
      const z = d * opts.gap
      spine.push(x - 22, y, z, x + 22, y, z)
    }
    group.add(lines(spine, 0.6))

    for (let d = 0; d <= opts.maxDepth; d++) {
      const label = makeLabel(String(d))
      label.position.set(x - 70, y, d * opts.gap)
      group.add(label)
    }

    const title = makeLabel('depth')
    title.position.set(x - 70, y - 78, 0)
    group.add(title)
  }

  return group
}

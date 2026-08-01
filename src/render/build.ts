import {
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three'
import type { Capture, CapturedNode } from '../capture/types'
import {
  BOTH_COLOR,
  CONTEXT_COLOR,
  DEAD_ZINDEX_COLOR,
  DOM_ONLY_COLOR,
  IN_CONTEXT_COLOR,
  RENDER_ONLY_COLOR,
  TEXT_COLOR,
  WHITESPACE_COLOR,
  depthColor,
} from './palette'
import { buildReference } from './reference'

/**
 * Which tree is on screen.
 *
 *   'dom'      the DOM tree — everything the parser produced, boxes or not
 *   'render'   the render tree — only nodes that generate boxes, plus ::before/::after
 *   'diff'     DOM and render at once, coloured by which tree each node belongs to
 *   'stacking' the stacking-context tree — z is stacking depth, not DOM depth
 */
export type TreeMode = 'dom' | 'render' | 'diff' | 'stacking'

export type BuildOptions = {
  mode: TreeMode
  /** world units between depth levels */
  gap: number
  showText: boolean
  showWhitespace: boolean
  /** draw a line from each node to its parent */
  showLinks: boolean
  showPlanes: boolean
  showRuler: boolean
}

export type BuiltNode = {
  node: CapturedNode
  mesh: Mesh
  edges: LineSegments
  baseFill: number
  baseEdge: number
}

export type BuiltScene = {
  group: Group
  built: BuiltNode[]
  /** every mesh, for raycasting */
  pickable: Mesh[]
}

/** Nodes with no box get a small marker instead of nothing. */
const MARKER = 10

/**
 * The z axis means different things per mode. In stacking mode it is depth in the
 * stacking-context tree — which has little to do with DOM depth, and is the whole point
 * of that view.
 */
function depthOf(n: CapturedNode, mode: TreeMode): number {
  return mode === 'stacking' ? n.stackingDepth : n.depth
}

/** In stacking mode, parent links point at the containing CONTEXT, not the DOM parent. */
function linkParentOf(n: CapturedNode, mode: TreeMode): number {
  return mode === 'stacking' ? n.stackingContext : n.parent
}

function includeNode(n: CapturedNode, opts: BuildOptions): boolean {
  if (opts.mode === 'stacking') {
    // Only things that actually paint participate in stacking.
    if (n.membership === 'dom') return false
    if (n.kind === 'text') return false
    return true
  }
  if (opts.mode === 'dom' && n.membership === 'render') return false
  if (opts.mode === 'render' && n.membership === 'dom') return false
  if (n.kind === 'text') {
    if (!opts.showText) return false
    if (n.whitespaceOnly && !opts.showWhitespace) return false
  }
  return true
}

function colorFor(n: CapturedNode, capture: Capture, mode: TreeMode): Color {
  if (mode === 'stacking') {
    if (n.zIndexIneffective) return DEAD_ZINDEX_COLOR
    if (n.stackingReason) return CONTEXT_COLOR
    return IN_CONTEXT_COLOR
  }
  if (mode === 'diff') {
    if (n.membership === 'dom') return DOM_ONLY_COLOR
    if (n.membership === 'render') return RENDER_ONLY_COLOR
    return BOTH_COLOR
  }
  if (n.kind === 'pseudo') return RENDER_ONLY_COLOR
  if (n.kind === 'text') return n.whitespaceOnly ? WHITESPACE_COLOR : TEXT_COLOR
  return depthColor(n.depth, capture.stats.maxDepth)
}

function emphasised(n: CapturedNode, mode: TreeMode): boolean {
  if (mode === 'diff') return n.membership !== 'both'
  if (mode === 'stacking') return Boolean(n.stackingReason || n.zIndexIneffective)
  return false
}

/**
 * Turns a Capture into geometry.
 *
 * The coordinate mapping is the entire trick, and it is three lines:
 *
 *   x =  rect.x + rect.w / 2 - viewport.w / 2     (centre the page on the origin)
 *   y = -rect.y - rect.h / 2 + viewport.h / 2     (screen y grows down, world y grows up)
 *   z =  depth * gap                              (the only thing being invented)
 *
 * Everything else — every width, every height, every position — was computed by the
 * browser during layout and is being read back, not recalculated.
 */
export function buildScene(capture: Capture, opts: BuildOptions): BuiltScene {
  const group = new Group()
  const built: BuiltNode[] = []
  const pickable: Mesh[] = []

  const { viewport } = capture
  const positions = new Map<number, [number, number, number]>()

  for (const node of capture.nodes) {
    if (!includeNode(node, opts)) continue

    const degenerate = node.degenerate
    const w = degenerate ? MARKER : node.rect.w
    const h = degenerate ? MARKER : node.rect.h

    // A degenerate node has no position of its own, so it borrows its parent's corner.
    let cx = node.rect.x + node.rect.w / 2
    let cy = node.rect.y + node.rect.h / 2
    if (degenerate) {
      const parent = capture.nodes[node.parent]
      if (parent && !parent.degenerate) {
        cx = parent.rect.x + 8
        cy = parent.rect.y + 8
      }
    }

    const x = cx - viewport.w / 2
    const y = -cy + viewport.h / 2
    const z = depthOf(node, opts.mode) * opts.gap

    const color = colorFor(node, capture, opts.mode)
    const emphasise = emphasised(node, opts.mode)

    const baseFill = degenerate ? 0.55 : emphasise ? 0.22 : 0.08
    const baseEdge = degenerate ? 0.95 : emphasise ? 0.95 : 0.42

    const geometry = new PlaneGeometry(Math.max(w, 1), Math.max(h, 1))

    const mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: baseFill,
        side: DoubleSide,
        depthWrite: false,
      }),
    )
    mesh.position.set(x, y, z)
    mesh.userData.index = node.index

    const edges = new LineSegments(
      new EdgesGeometry(geometry),
      new LineBasicMaterial({ color, transparent: true, opacity: baseEdge }),
    )
    edges.position.copy(mesh.position)

    group.add(mesh)
    group.add(edges)
    built.push({ node, mesh, edges, baseFill, baseEdge })
    pickable.push(mesh)
    positions.set(node.index, [x, y, z])
  }

  if (opts.showLinks) {
    const pts: number[] = []
    for (const { node } of built) {
      const a = positions.get(node.index)
      const b = positions.get(linkParentOf(node, opts.mode))
      if (!a || !b) continue
      pts.push(b[0], b[1], b[2], a[0], a[1], a[2])
    }
    if (pts.length) {
      const geo = new BufferGeometry()
      geo.setAttribute('position', new Float32BufferAttribute(pts, 3))
      group.add(
        new LineSegments(
          geo,
          new LineBasicMaterial({ color: 0x4a5b7a, transparent: true, opacity: 0.32 }),
        ),
      )
    }
  }

  // Depth is only legible against something fixed.
  const visibleDepth = built.reduce((m, b) => Math.max(m, depthOf(b.node, opts.mode)), 0)
  group.add(
    buildReference(capture, {
      gap: opts.gap,
      maxDepth: visibleDepth,
      showPlanes: opts.showPlanes,
      showRuler: opts.showRuler,
      label: opts.mode === 'stacking' ? 'stack' : 'depth',
    }),
  )

  return { group, built, pickable }
}

export function disposeScene(scene: BuiltScene) {
  scene.group.traverse((obj) => {
    const any = obj as unknown as {
      geometry?: { dispose(): void }
      material?: { map?: { dispose(): void }; dispose(): void }
    }
    any.geometry?.dispose()
    any.material?.map?.dispose()
    any.material?.dispose()
  })
}

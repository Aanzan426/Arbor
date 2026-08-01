import {
  BufferGeometry,
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
import { TEXT_COLOR, WHITESPACE_COLOR, depthColor } from './palette'

export type BuildOptions = {
  /** world units between depth levels */
  gap: number
  showText: boolean
  showWhitespace: boolean
  /** draw a line from each node to its parent */
  showLinks: boolean
}

export type BuiltNode = {
  node: CapturedNode
  mesh: Mesh
  edges: LineSegments
}

export type BuiltScene = {
  group: Group
  built: BuiltNode[]
  /** every mesh, for raycasting */
  pickable: Mesh[]
}

/** Degenerate nodes have no box, so they get a small marker instead of nothing. */
const MARKER = 10

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

  const { viewport, stats } = capture
  const positions = new Map<number, [number, number, number]>()

  for (const node of capture.nodes) {
    if (node.kind === 'text') {
      if (!opts.showText) continue
      if (node.whitespaceOnly && !opts.showWhitespace) continue
    }

    const degenerate = node.degenerate
    const w = degenerate ? MARKER : node.rect.w
    const h = degenerate ? MARKER : node.rect.h

    // A degenerate node has no position of its own, so it borrows its parent's.
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
    const z = node.depth * opts.gap

    const color =
      node.kind === 'text'
        ? node.whitespaceOnly
          ? WHITESPACE_COLOR
          : TEXT_COLOR
        : depthColor(node.depth, stats.maxDepth)

    const geometry = new PlaneGeometry(Math.max(w, 1), Math.max(h, 1))

    const mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: degenerate ? 0.55 : 0.09,
        side: DoubleSide,
        depthWrite: false,
      }),
    )
    mesh.position.set(x, y, z)
    mesh.userData.index = node.index

    const edges = new LineSegments(
      new EdgesGeometry(geometry),
      new LineBasicMaterial({
        color,
        transparent: true,
        opacity: degenerate ? 0.95 : 0.55,
      }),
    )
    edges.position.copy(mesh.position)

    group.add(mesh)
    group.add(edges)
    built.push({ node, mesh, edges })
    pickable.push(mesh)
    positions.set(node.index, [x, y, z])
  }

  if (opts.showLinks) {
    const pts: number[] = []
    for (const { node } of built) {
      const a = positions.get(node.index)
      const b = positions.get(node.parent)
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

  return { group, built, pickable }
}

export function disposeScene(scene: BuiltScene) {
  scene.group.traverse((obj) => {
    const any = obj as unknown as {
      geometry?: { dispose(): void }
      material?: { dispose(): void }
    }
    any.geometry?.dispose()
    any.material?.dispose()
  })
}

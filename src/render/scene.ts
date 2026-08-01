import {
  Box3,
  Color,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { CapturedNode } from '../capture/types'
import type { BuiltScene } from './build'
import { disposeScene } from './build'

export type Viewer = {
  mount: HTMLElement
  setScene(next: BuiltScene | null): void
  onHover(fn: (node: CapturedNode | null) => void): void
  resetCamera(): void
  dispose(): void
}

const BACKGROUND = 0x06080b

export function createViewer(mount: HTMLElement): Viewer {
  const scene = new Scene()
  scene.background = new Color(BACKGROUND)

  const camera = new PerspectiveCamera(50, 1, 1, 20000)
  const renderer = new WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  mount.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  const raycaster = new Raycaster()
  const pointer = new Vector2()
  let pointerInside = false

  let current: BuiltScene | null = null
  let hovered: CapturedNode | null = null
  let hoverHandler: (node: CapturedNode | null) => void = () => {}

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = mount
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(mount)
  resize()

  /**
   * Frame the whole tree instead of using a fixed camera position.
   *
   * A fixed position is wrong for every input: the root <html> box is as large as the
   * viewport (1280x800 world units) and the stack grows arbitrarily deep, so any
   * hardcoded distance either sits *inside* the root plane or leaves the page a speck.
   * Fit to the bounding sphere and it is correct for a Hello World and for a real site.
   */
  const resetCamera = () => {
    const box = current ? new Box3().setFromObject(current.group) : null
    if (!box || box.isEmpty()) {
      camera.position.set(900, 700, 1800)
      controls.target.set(0, 0, 0)
      controls.update()
      return
    }

    const sphere = box.getBoundingSphere(new Sphere())
    const vFov = (camera.fov * Math.PI) / 180
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
    // Fit on whichever axis is tighter, then back off a little for margin.
    const dist = (sphere.radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.15

    const dir = new Vector3(0.55, 0.4, 1).normalize()
    camera.position.copy(sphere.center).addScaledVector(dir, dist)
    camera.near = Math.max(dist / 1000, 0.1)
    camera.far = dist * 12
    camera.updateProjectionMatrix()

    controls.target.copy(sphere.center)
    controls.update()
  }
  resetCamera()

  renderer.domElement.addEventListener('pointermove', (e) => {
    const r = renderer.domElement.getBoundingClientRect()
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1
    pointerInside = true
  })
  renderer.domElement.addEventListener('pointerleave', () => {
    pointerInside = false
  })

  const applyHover = (next: CapturedNode | null) => {
    if (next === hovered) return
    if (current) {
      for (const b of current.built) {
        const isHit = next != null && b.node.index === next.index
        const lineMat = b.edges.material as { opacity: number }
        const meshMat = b.mesh.material as { opacity: number }
        lineMat.opacity = isHit ? 1 : b.baseEdge
        meshMat.opacity = isHit ? 0.4 : b.baseFill
      }
    }
    hovered = next
    hoverHandler(next)
  }

  let raf = 0
  const tick = () => {
    controls.update()

    if (current && pointerInside) {
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(current.pickable, false)
      const first = hits[0]
      if (first) {
        const idx = first.object.userData.index as number
        applyHover(current.built.find((b) => b.node.index === idx)?.node ?? null)
      } else {
        applyHover(null)
      }
    } else if (!pointerInside && hovered) {
      applyHover(null)
    }

    renderer.render(scene, camera)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return {
    mount,
    setScene(next) {
      if (current) {
        scene.remove(current.group)
        disposeScene(current)
      }
      hovered = null
      current = next
      if (next) scene.add(next.group)
    },
    onHover(fn) {
      hoverHandler = fn
    },
    resetCamera,
    dispose() {
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      if (current) disposeScene(current)
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

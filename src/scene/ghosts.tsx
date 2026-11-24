import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  Box3,
  Material,
  Mesh,
  Ray,
  Raycaster,
  Vector3,
  type Camera,
  type Intersection,
  type Object3D,
  type Scene,
} from 'three'
import { DOOR_KINDS } from '#/geometry/passages.ts'
import type { CardConfig } from '#/types.ts'

// A piece with no device of its own that stands between the camera and one
// with a device turns see-through while it does, so a door, a tall wardrobe
// or the wall cabinets never hide a lamp that can be pressed. A press on the
// ghost goes on through to what is behind it. Only doors and high pieces,
// and what stands on them, ever do: a sofa in front of a lamp is low enough
// to look over.

// How much of a ghost is still seen.
const GHOST_OPACITY = 0.18
// How fast it fades either way, as the share of the way gone in a second.
const FADE_RATE = 7
// A piece whose top stands this far above the floor counts as high, in
// meters: above a person's eye when seated, and over most of a room.
const HIGH_M = 1.4
// Kinds that are never ghosts: a flight of stairs fades with height already.
const NEVER = new Set(['stairs'])
// How often the pieces that can be ghosts are looked for again, in seconds,
// as a model loaded from a file only has its shape once it has arrived.
const RESCAN_S = 1.5

const DECORATION = 'decoration:'

const box = new Box3()
const at = new Vector3()

// The ids of the pieces that may be ghosts: those with no device, of a door
// kind or reaching high, and anything standing on one, by the scene as it
// is drawn. The merging of the room leaves these whole.
export function ghostCandidates(scene: Scene, config: CardConfig): Set<string> {
  const ids = new Set<string>()
  if (config.ghost_in_way === false) return ids
  const items = config.decorations ?? []
  const bound = new Set<string>()
  for (const device of config.devices ?? []) for (const id of device.decorations ?? []) bound.add(id)
  const groups = new Map<string, Object3D>()
  scene.traverse(object => {
    if (object.name.startsWith(DECORATION)) groups.set(object.name.slice(DECORATION.length), object)
  })
  scene.updateMatrixWorld()
  for (const item of items) {
    // A window is seen through already, and its frame fading would only look odd.
    if (bound.has(item.id) || NEVER.has(item.kind) || item.kind.includes('window')) continue
    if (DOOR_KINDS.has(item.kind)) {
      ids.add(item.id)
      continue
    }
    const group = groups.get(item.id)
    if (!group) continue
    box.setFromObject(group)
    if (box.isEmpty()) continue
    // Counted from the floor, so wall cabinets hung up high count too.
    group.getWorldPosition(at)
    const floor = typeof group.userData.floor === 'number' ? group.userData.floor : at.y
    if (box.max.y - floor >= HIGH_M) ids.add(item.id)
  }
  // What stands on a ghost goes with it, so a vase is not left in the air.
  const byId = new Map(items.map(item => [item.id, item]))
  for (const item of items) {
    if (bound.has(item.id) || ids.has(item.id)) continue
    let below = item.on ? byId.get(item.on) : undefined
    for (let depth = 0; below && depth < 8; depth++) {
      if (ids.has(below.id)) {
        ids.add(item.id)
        break
      }
      below = below.on ? byId.get(below.on) : undefined
    }
  }
  return ids
}

// What a mesh was before it was a ghost, to put back when it is solid
// again, and the see-through copies of its materials it is drawn in
// meanwhile, its own so a material other pieces share is never touched.
type Kept = {
  material: Material | Material[]
  raycast: Mesh['raycast']
  copies: Material[]
  opacities: number[]
}
const kept = new WeakMap<Mesh, Kept>()
const noRaycast = () => {}

const list = (material: Material | Material[]) => (Array.isArray(material) ? material : [material])

// Draws one mesh at `seen`, 1 being itself. At 1 it gets its own material
// back, and takes presses again.
function show(mesh: Mesh, seen: number) {
  let own = kept.get(mesh)
  if (seen >= 1) {
    if (!own) return
    mesh.material = own.material
    mesh.raycast = own.raycast
    for (const copy of own.copies) copy.dispose()
    kept.delete(mesh)
    return
  }
  // A material the piece set since it became a ghost is its own now.
  if (!own || mesh.material !== (Array.isArray(own.material) ? own.copies : own.copies[0])) {
    if (own && list(mesh.material).every(m => own!.copies.includes(m))) {
      // Still the copies, only held in a new array.
    } else {
      for (const copy of own?.copies ?? []) copy.dispose()
      const originals = list(mesh.material)
      const copies = originals.map(m => {
        const copy = m.clone()
        copy.transparent = true
        copy.depthWrite = false
        return copy
      })
      own = {
        material: mesh.material,
        raycast: own?.raycast ?? mesh.raycast,
        copies,
        opacities: originals.map(m => m.opacity),
      }
      kept.set(mesh, own)
      mesh.material = Array.isArray(own.material) ? copies : copies[0]
    }
  }
  own.copies.forEach((copy, i) => (copy.opacity = own!.opacities[i] * seen))
  // Mostly gone, it lets a press through to what it was hiding.
  mesh.raycast = seen < 0.6 ? noRaycast : own.raycast
}

function showGroup(group: Object3D, seen: number) {
  group.traverse(object => {
    const mesh = object as Mesh
    if (mesh.isMesh) show(mesh, seen)
  })
}

const ray = new Ray()
const raycaster = new Raycaster()
const point = new Vector3()
const hits: Intersection[] = []

// Whether any part of the group lies on the ray before `far`, tested with
// each mesh's own picking, whatever it is set to while a ghost.
function blocks(group: Object3D, far: number) {
  raycaster.ray.copy(ray)
  raycaster.near = 0
  raycaster.far = far
  let found = false
  group.traverse(object => {
    if (found) return
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.visible) return
    hits.length = 0
    const pick = kept.get(mesh)?.raycast ?? mesh.raycast
    pick.call(mesh, raycaster, hits)
    if (hits.length > 0) found = true
  })
  return found
}

// Whether the object and every one above it is drawn for this camera.
function seenBy(object: Object3D, camera: Camera) {
  for (let o: Object3D | null = object; o; o = o.parent) if (!o.visible) return false
  return object.layers.test(camera.layers)
}

type Piece = { id: string; group: Object3D; box: Box3 }

// Fades the pieces in the way of the ones with a device, as the camera moves.
export default function Ghosts({ config }: { config: CardConfig }) {
  const scene = useThree(state => state.scene)
  const invalidate = useThree(state => state.invalidate)
  const state = useRef({
    candidates: [] as Piece[],
    targets: [] as Piece[],
    seen: new Map<string, number>(),
    want: new Map<string, number>(),
    scanned: -Infinity,
    stale: true,
    camera: new Vector3(Infinity, 0, 0),
  })

  // A new plan has other pieces, and every ghost is solid again.
  useEffect(() => {
    const s = state.current
    s.stale = true
    return () => {
      for (const piece of s.candidates) showGroup(piece.group, 1)
      s.seen.clear()
    }
  }, [config])

  useFrame(({ camera, clock }, delta) => {
    const s = state.current
    const now = clock.elapsedTime
    if (config.ghost_in_way === false) return
    // Look again for the pieces, now and then, as models arrive.
    if (s.stale || now - s.scanned > RESCAN_S) {
      const ids = ghostCandidates(scene, config)
      const bound = new Set<string>()
      for (const device of config.devices ?? []) for (const id of device.decorations ?? []) bound.add(id)
      const candidates: Piece[] = []
      const targets: Piece[] = []
      scene.traverse(object => {
        if (!object.name.startsWith(DECORATION)) return
        const id = object.name.slice(DECORATION.length)
        if (ids.has(id)) candidates.push({ id, group: object, box: new Box3().setFromObject(object) })
        else if (bound.has(id)) targets.push({ id, group: object, box: new Box3().setFromObject(object) })
      })
      // A piece no longer a candidate is solid again.
      const still = new Set(candidates.map(c => c.id))
      for (const piece of s.candidates) if (!still.has(piece.id)) showGroup(piece.group, 1)
      s.candidates = candidates
      s.targets = targets
      s.scanned = now
      s.stale = false
      s.camera.set(Infinity, 0, 0)
    }

    // Which pieces are in the way, worked out again only when the camera
    // has moved or the pieces were looked for again.
    if (!s.camera.equals(camera.position)) {
      s.camera.copy(camera.position)
      s.want.clear()
      const from = camera.position
      // Only what is drawn for this camera counts, either way round.
      const candidates = s.candidates.filter(c => seenBy(c.group, camera))
      for (const target of s.targets) {
        if (!seenBy(target.group, camera) || target.box.isEmpty()) continue
        // Its middle, and up near its top, where a lamp shade is.
        const middle = target.box.getCenter(new Vector3())
        const upper = new Vector3(middle.x, target.box.min.y + (target.box.max.y - target.box.min.y) * 0.8, middle.z)
        for (const aim of [middle, upper]) {
          const far = from.distanceTo(aim)
          ray.origin.copy(from)
          ray.direction.subVectors(aim, from).normalize()
          for (const candidate of candidates) {
            if (s.want.has(candidate.id)) continue
            if (!ray.intersectBox(candidate.box, point) || from.distanceTo(point) > far) continue
            if (blocks(candidate.group, far - 0.02)) s.want.set(candidate.id, GHOST_OPACITY)
          }
        }
      }
      // What stands on a ghost goes with it.
      if (s.want.size > 0) {
        const byId = new Map((config.decorations ?? []).map(item => [item.id, item]))
        for (const candidate of s.candidates) {
          let below = byId.get(candidate.id)?.on
          for (let depth = 0; below && depth < 8; depth++) {
            if (s.want.has(below)) {
              s.want.set(candidate.id, GHOST_OPACITY)
              break
            }
            below = byId.get(below)?.on
          }
        }
      }
    }

    // Ease each piece toward how much of it should be seen.
    let moving = false
    const step = 1 - Math.exp(-FADE_RATE * Math.min(delta, 0.1))
    for (const candidate of s.candidates) {
      const want = s.want.get(candidate.id) ?? 1
      const was = s.seen.get(candidate.id) ?? 1
      if (was === want) continue
      let next = was + (want - was) * step
      if (Math.abs(next - want) < 0.01) next = want
      else moving = true
      s.seen.set(candidate.id, next)
      showGroup(candidate.group, next)
    }
    if (moving) invalidate()
  })
  return null
}

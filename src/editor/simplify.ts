import { decodeShape, encodeShape, type Shape, type ShapePart } from '#/scene/decor/modelShape.ts'
import type { ModelConfig } from '#/types.ts'
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js'

// A model with fewer triangles, for a model that is heavier to draw than it
// needs to be at the size it is seen. Each part keeps `ratio` of its
// triangles, as near as its shape allows, and keeps its open edges where
// they are, so a cushion keeps its outline and parts still meet.

export type Simplified = { parts: ModelConfig['parts']; triangles: number }

// Corners that were split at a seam meet again first: the stored corners
// are 16 bit steps across the model, so a seam's two copies are equal.
function weld(part: ShapePart): { positions: Float32Array; index: Uint32Array } {
  const key = new Map<string, number>()
  const remap = new Uint32Array(part.positions.length / 3)
  const kept: number[] = []
  for (let i = 0; i < remap.length; i++) {
    const p = part.positions
    const k = `${p[i * 3]},${p[i * 3 + 1]},${p[i * 3 + 2]}`
    let at = key.get(k)
    if (at === undefined) {
      at = kept.length / 3
      key.set(k, at)
      kept.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2])
    }
    remap[i] = at
  }
  const index = new Uint32Array(part.index.length)
  for (let i = 0; i < index.length; i++) index[i] = remap[part.index[i]]
  return { positions: new Float32Array(kept), index }
}

function simplifyPart(part: ShapePart, ratio: number): ShapePart {
  const { positions, index } = weld(part)
  const target = Math.max(3, Math.floor((index.length * ratio) / 3) * 3)
  if (target >= index.length) return part
  // The count leads; the error allowed is the whole size of the part, so
  // the count asked for is reached.
  let [out] = MeshoptSimplifier.simplify(index, positions, 3, target, 1, ['LockBorder'])
  // A shape of many loose panels is mostly open edges, which stay put, so it
  // can barely get simpler that way. Then its edges may move too.
  if (out.length > target * 1.5) [out] = MeshoptSimplifier.simplify(index, positions, 3, target, 1)
  if (out.length < 3) return part
  // Only the corners still used are kept.
  const [remap, unique] = MeshoptSimplifier.compactMesh(out)
  const kept = new Float32Array(unique * 3)
  for (let i = 0; i < remap.length; i++) {
    const to = remap[i]
    if (to === 0xffffffff || to >= unique) continue
    kept[to * 3] = positions[i * 3]
    kept[to * 3 + 1] = positions[i * 3 + 1]
    kept[to * 3 + 2] = positions[i * 3 + 2]
  }
  // Stored with 16 bit indexes while they fit, as the card reads them.
  const narrow = unique <= 65536
  return { name: part.name, positions: kept, index: narrow ? Uint16Array.from(out) : Uint32Array.from(out) }
}

export async function simplifyModel(model: ModelConfig, ratio: number): Promise<Simplified> {
  await MeshoptSimplifier.ready
  const shape = decodeShape(model)
  if (shape.parts.length === 0) throw new Error('This model has no shape stored in the card to simplify.')
  const parts = shape.parts.map(p => simplifyPart(p, Math.min(Math.max(ratio, 0.01), 1)))
  const next: Shape = { size: shape.size, parts, triangles: parts.reduce((s, p) => s + p.index.length / 3, 0) }
  return { parts: encodeShape(next), triangles: next.triangles }
}

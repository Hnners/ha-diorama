import { behaviour, colorValue, paramValue, type DecorationKind } from '#/decoration/catalog.ts'
import { glowParts, MODEL_COLOR, modelOf } from '#/decoration/models.ts'
import { Glow, ownShadowless } from '#/scene/decor/LightModel.tsx'
import { ShadeMaterial } from '#/scene/decor/lightMaterials.tsx'
import { Material } from '#/scene/decor/parts.tsx'
import type { ItemState } from '#/scene/decor/state.ts'
import { decodeShape, fetchGltf, partGeometry, shapeOf, type Shape } from '#/scene/decor/modelShape.ts'
import type { DecorationConfig, ModelConfig } from '#/types.ts'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Box3, Color, type BufferGeometry, type Group } from 'three'

type Props = { kind: DecorationKind; item: DecorationConfig; state: ItemState | null }

// The middle of the glowing parts, in the model's own units, which is where
// its bulb goes. Null when none of the parts glows.
function glowCentre(parts: Drawn['parts'], names: string[]): [number, number, number] | null {
  const box = new Box3()
  let found = false
  for (const part of parts) {
    if (!names.includes(part.name)) continue
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox()
    if (part.geometry.boundingBox) {
      box.union(part.geometry.boundingBox)
      found = true
    }
  }
  if (!found) return null
  const c = box.getCenter(box.min.clone())
  return [c.x, c.y, c.z]
}

type Drawn = { size: [number, number, number]; parts: { name: string; geometry: BufferGeometry }[] }

// A model's parts, made once and drawn by every piece placed from it. What
// is kept says which data it was made from, so a model imported again under
// the same id is made again, and a card config handed over afresh, as Home
// Assistant does on every edit, finds the one already made.
const made = new Map<string, { key: string; drawn: Drawn }>()

const keyOf = (model: ModelConfig) =>
  JSON.stringify([
    model.size,
    model.parts.map(p => [
      p.name,
      p.vertices?.length,
      p.triangles?.length,
      p.vertices?.slice(0, 32),
      p.triangles?.slice(-32),
    ]),
  ])

const drawnOf = (shape: Shape): Drawn => ({
  size: shape.size,
  parts: shape.parts.map(part => ({ name: part.name, geometry: partGeometry(part) })),
})

function embedded(kindId: string, model: ModelConfig): Drawn {
  const key = keyOf(model)
  const known = made.get(kindId)
  if (known && known.key === key) return known.drawn
  const drawn = drawnOf(decodeShape(model))
  made.set(kindId, { key, drawn })
  return drawn
}

// A model read from a file of its own is fetched once per address, and
// drawn at once by everything that asks after that, so the editor, which
// has just read it to import it, draws it in the same frame.
const fetched = new Map<string, Promise<Shape>>()
const ready = new Map<string, Drawn>()
export function fetchShape(url: string) {
  let found = fetched.get(url)
  if (!found) {
    found = fetchGltf(url).then(gltf => {
      const shape = shapeOf(gltf)
      ready.set(url, drawnOf(shape))
      return shape
    })
    // A file that failed can be tried again on the next load.
    found.catch(() => fetched.delete(url))
    fetched.set(url, found)
  }
  return found
}

function useDrawn(kindId: string): Drawn | null {
  const model = modelOf(kindId)
  const url = model?.url
  // Held as state too, so the draw once it has arrived is told apart from
  // the one before it.
  const [loaded, setLoaded] = useState<{ url: string; drawn: Drawn } | null>(null)
  useEffect(() => {
    if (!url || ready.has(url)) return
    let live = true
    fetchShape(url).then(
      () => {
        const drawn = ready.get(url)
        if (live && drawn) setLoaded({ url, drawn })
      },
      error => console.warn(`Diorama could not load the model at ${url}`, error),
    )
    return () => {
      live = false
    }
  }, [url])
  if (!model) return null
  if (!url) return embedded(kindId, model)
  return ready.get(url) ?? (loaded?.url === url ? loaded.drawn : null)
}

// A model imported into the catalog, in the card's own paint: every part a
// plain color, stretched to the sizes on its sliders. On the floor it stands
// on its base, on a wall it hangs with its back to the wall, and from the
// ceiling it hangs by its top. The parts named as glowing light up like a
// lamp's shade when its light is on, with a bulb in the middle of them.
export default function CustomModel({ kind, item, state }: Props) {
  const drawn = useDrawn(kind.id)
  const model = modelOf(kind.id)
  // Glowing parts light up for a lamp, or a model working as nothing else.
  const lamp = behaviour(kind).family === 'light' || !kind.like
  const glowing = useMemo(() => (model && lamp ? glowParts(model) : []), [model, lamp])
  const centre = useMemo(() => (drawn ? glowCentre(drawn.parts, glowing) : null), [drawn, glowing])
  const own = useRef<Group>(null)
  // The model never darkens itself with its own bulb, as a lamp does not.
  useLayoutEffect(() => {
    if (own.current && centre) ownShadowless(own.current)
  })
  // The color each glowing part lights up in, where it is not the light's:
  // its own color, or one of its own.
  const glowOf = (part: string, color: string): [number, number, number] | null => {
    const set = model?.glow_colors?.[part]
    if (!set) return null
    const c = new Color(set === 'body' ? color : set)
    return [c.r, c.g, c.b]
  }
  if (!drawn) return null
  const w = paramValue(kind, item.params, 'width', item.variant)
  const d = paramValue(kind, item.params, 'depth', item.variant)
  const h = paramValue(kind, item.params, 'height', item.variant)
  const [sw, sd, sh] = drawn.size
  const slots = Object.keys(kind.colors)
  const offset: [number, number, number] = [0, kind.mount === 'ceiling' ? -h : 0, kind.mount === 'wall' ? d / 2 : 0]
  const scale: [number, number, number] = [w / sw, h / sh, d / sd]
  const colorOf = (part: { name: string }, i: number) => {
    // A part is painted by its name, and by its place when the file it is
    // read from has changed since it was imported.
    const slot = slots.includes(part.name) ? part.name : slots[i]
    return slot ? colorValue(kind, item.colors, slot) : MODEL_COLOR
  }
  // What each glowing part glows in, and the bulb the mix of them, so a
  // lamp of two colors lights the room in between.
  const glows = drawn.parts.flatMap((part, i) =>
    glowing.includes(part.name) ? [glowOf(part.name, colorOf(part, i)) ?? state?.glow ?? [1, 1, 1]] : [],
  )
  const bulb: [number, number, number] | undefined =
    glows.length > 0 && model?.glow_colors && Object.keys(model.glow_colors).some(p => glowing.includes(p))
      ? ([0, 1, 2].map(k => glows.reduce((sum, g) => sum + g[k], 0) / glows.length) as [number, number, number])
      : undefined
  return (
    <group ref={own}>
      <group position={offset} scale={scale}>
        {drawn.parts.map((part, i) => {
          const color = colorOf(part, i)
          const own = glowing.includes(part.name) ? glowOf(part.name, color) : null
          return glowing.includes(part.name) ? (
            <mesh key={i} geometry={part.geometry} receiveShadow dispose={null} userData={{ transmits: true }}>
              <ShadeMaterial color={color} state={own && state ? { ...state, glow: own } : state} solid />
            </mesh>
          ) : (
            <mesh key={i} geometry={part.geometry} castShadow receiveShadow dispose={null}>
              <Material color={color} />
            </mesh>
          )
        })}
      </group>
      {centre && (
        <Glow
          state={bulb && state ? { ...state, glow: bulb } : state}
          at={[offset[0] + centre[0] * scale[0], offset[1] + centre[1] * scale[1], offset[2] + centre[2] * scale[2]]}
        />
      )}
    </group>
  )
}

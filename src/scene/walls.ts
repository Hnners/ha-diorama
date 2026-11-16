import { decorationKind, paramValue } from '#/decoration/catalog.ts'
import type { WallOpening } from '#/geometry/roomWalls.ts'
import {
  BRICK_COLOR,
  TALL_WALL_HEIGHT_M,
  TALL_WALL_JUT_M,
  TALL_WALL_RADIUS_M,
  WALL_COLOR,
  WALL_HEIGHT_M,
  WALL_THICKNESS_M,
} from '#/theme.ts'
import { ensureCounterClockwise, inset } from '#/geometry/polygon.ts'
import type { CardConfig, DecorationConfig, Point, RoomConfig } from '#/types.ts'
import type { WallUniforms } from '#/scene/wallShader.ts'
import { createContext } from 'react'

export type Walls = {
  height: number
  thickness: number
  color: string
  outside: 'brick' | 'plain'
  outsideColor: string
  tall: { height: number; jut: number; radius: number } | null
}

// The card's walls with every gap filled in, or null for a card without.
export function wallsOf(config: CardConfig): Walls | null {
  const w = config.walls
  if (!w) return null
  return {
    height: Math.min(Math.max(w.height ?? WALL_HEIGHT_M, 0.1), 4),
    thickness: Math.min(Math.max(w.thickness ?? WALL_THICKNESS_M, 0.01), 0.5),
    color: w.color ?? WALL_COLOR,
    outside: w.outside ?? 'brick',
    outsideColor: w.outside_color ?? (w.outside === 'plain' ? (w.color ?? WALL_COLOR) : BRICK_COLOR),
    tall: w.tall
      ? {
          height: Math.min(Math.max(w.tall.height ?? TALL_WALL_HEIGHT_M, 0.2), 5),
          jut: Math.min(Math.max(w.tall.jut ?? TALL_WALL_JUT_M, 0), 2),
          radius: Math.min(Math.max(w.tall.radius ?? TALL_WALL_RADIUS_M, 0), 2),
        }
      : null,
  }
}

// The kinds that make a gap in a wall, the whole way up.
const DOORS = new Set(['door', 'sliding_door', 'garage_door'])

// Which floor a room is on, so a door only cuts the walls of its own floor.
export const floorKey = (room: RoomConfig | undefined) => `${room?.floor_id ?? ''}|${room?.storey ?? 0}`

// The doors and windows of the home, by the floor they are on. A model that
// works as a door or a window cuts its wall like one.
export function openingsByFloor(rooms: RoomConfig[], decorations: DecorationConfig[]) {
  const byId = new Map(rooms.map(r => [r.id, r]))
  const out = new Map<string, WallOpening[]>()
  for (const d of decorations) {
    const kind = decorationKind(d.kind)
    if (!kind) continue
    const like = kind.like ?? kind.id
    const window = like === 'window'
    if (!window && !DOORS.has(like)) continue
    const key = floorKey(byId.get(d.room))
    const list = out.get(key) ?? []
    const sill = window ? paramValue(kind, d.params, 'sill', d.variant) : 0
    list.push({
      at: d.position,
      width: paramValue(kind, d.params, 'width', d.variant),
      sill,
      top: sill + paramValue(kind, d.params, 'height', d.variant),
    })
    out.set(key, list)
  }
  return out
}

// What a piece hung on a wall stands out from the room's edge by: the wall's
// thickness, so it hangs on the wall and not inside it.
export const WallInset = createContext(0)

// Doors and windows sit in the wall, so they are not moved off it.
export const inWall = (kindId: string) => kindId === 'window' || DOORS.has(kindId)

// What the walls take their heights from on the graphics card, the way the
// camera looks among it, while some walls stand tall. See wallShader.ts.
export const WallHeights = createContext<WallUniforms | null>(null)

// How far a piece standing against a wall reaches into it, past the wall's
// face inside the room, at most: one reaching further is across the wall or
// placed through it on purpose, and is left where it is.
const CLEAR_REACH_M = 0.2

// Where pieces standing against a wall move to so they stand clear of it:
// the editor snaps a piece's back to the room's edge, and the walls stand
// just inside the edge, so a piece there would reach into its wall and show
// through it on the other side. Each piece on the floor reaching into one of
// its room's walls moves back out by as much, along the plan, by its id.
// Pieces hung on a wall already stand out from it, and doors and windows sit
// in it.
export function clearOfWalls(
  rooms: RoomConfig[],
  decorations: DecorationConfig[],
  thickness: number,
  gap: number,
): Map<string, [number, number]> {
  // An outside space has no walls to stand clear of.
  const outlines = new Map(
    rooms.filter(r => !r.outdoor).map(r => [r.id, inset(ensureCounterClockwise(r.points), gap / 2)]),
  )
  const out = new Map<string, [number, number]>()
  for (const d of decorations) {
    const kind = decorationKind(d.kind)
    const outline = outlines.get(d.room)
    if (!kind || !outline || kind.mount === 'wall' || kind.mount === 'ceiling' || inWall(kind.like ?? kind.id)) continue
    const w = paramValue(kind, d.params, 'width', d.variant)
    const depth = paramValue(kind, d.params, 'depth', d.variant)
    const r = ((d.rotation ?? 0) * Math.PI) / 180
    // Its corners on the plan: its width along its own x, its depth along
    // its own z, which is plan y turned the other way.
    const ax: Point = [Math.cos(r) * (w / 2), Math.sin(r) * (w / 2)]
    const az: Point = [Math.sin(r) * (depth / 2), -Math.cos(r) * (depth / 2)]
    let x = d.position[0]
    let y = d.position[1]
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i]
      const b = outline[(i + 1) % outline.length]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < 1e-3) continue
      const u: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
      const inward: Point = [-u[1], u[0]]
      let push = 0
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const c: Point = [x + ax[0] * sx + az[0] * sz, y + ax[1] * sx + az[1] * sz]
          const rel: Point = [c[0] - a[0], c[1] - a[1]]
          const along = rel[0] * u[0] + rel[1] * u[1]
          // Only along the wall, past its ends it is another wall's to say.
          if (along < 0 || along > len) continue
          const into = thickness - (rel[0] * inward[0] + rel[1] * inward[1])
          if (into > 0 && into <= thickness + CLEAR_REACH_M) push = Math.max(push, into)
        }
      if (push > 0) {
        x += inward[0] * push
        y += inward[1] * push
      }
    }
    if (x !== d.position[0] || y !== d.position[1]) out.set(d.id, [x - d.position[0], y - d.position[1]])
  }
  return out
}

// Where each piece moves to stand clear of the walls, by its id. Empty
// without walls.
export const WallClearance = createContext<Map<string, [number, number]>>(new Map())

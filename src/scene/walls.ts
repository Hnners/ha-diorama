import { decorationKind, paramValue } from '#/decoration/catalog.ts'
import type { WallOpening } from '#/geometry/roomWalls.ts'
import { BRICK_COLOR, WALL_COLOR, WALL_HEIGHT_M, WALL_THICKNESS_M } from '#/theme.ts'
import type { CardConfig, DecorationConfig, RoomConfig } from '#/types.ts'
import { createContext } from 'react'

export type Walls = {
  height: number
  thickness: number
  color: string
  outside: 'brick' | 'plain'
  outsideColor: string
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
    list.push({
      at: d.position,
      width: paramValue(kind, d.params, 'width', d.variant),
      sill: window ? paramValue(kind, d.params, 'sill', d.variant) : 0,
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

import { SLAB_BEVEL_SEGMENTS, SLAB_CURVE_SEGMENTS } from '#/constants.ts'
import SurfaceMaterial from '#/scene/SurfaceMaterial.tsx'
import { fenceGeometry as makeFence } from '#/geometry/fence.ts'
import type { SurfaceKind } from '#/materials/textures.ts'
import {
  BRICK_COLOR,
  FENCE_COLOR,
  FENCE_SLAT_M,
  FLOOR_MATERIALS,
  FLOOR_PATTERN_SHIFT_M,
  OUTSIDE_WALLS,
  ROOM_SLAB_EDGE_RADIUS_M,
  ROOM_SLAB_THICKNESS_M,
  WALL_COLOR,
} from '#/theme.ts'
import { floorColor } from '#/scene/floorColor.ts'
import { useEased } from '#/scene/decor/ease.ts'
import { presenceTint } from '#/scene/presence.ts'
import { ensureCounterClockwise, inset, roundedShape, signedArea } from '#/geometry/polygon.ts'
import { Color, type Mesh } from 'three'
import { elevationOf } from '#/geometry/elevation.ts'
import { slabGeometry, touchesNeighbour } from '#/geometry/slab.ts'
import { roomWallGeometry, type WallOpening } from '#/geometry/roomWalls.ts'
import { animateWalls } from '#/scene/wallShader.ts'
import { WallHeights, type Walls } from '#/scene/walls.ts'
import type { Point, RoomConfig } from '#/types.ts'
import { memo, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react'

// Floors this close to touching are drawn as touching, in meters.
const TOUCHING_GAP_M = 0.001

type Props = {
  room: RoomConfig
  // Every room of the home, to tell where this one touches another.
  rooms: RoomConfig[]
  index: number
  radius: number
  gap: number
  // Someone is in the room, by its presence sensor.
  occupied?: boolean
  // The card's walls, if it has them, and the doors and windows of this
  // room's floor that cut them.
  walls?: Walls | null
  openings?: WallOpening[]
}

// Clicks on the floor are not taken here. The press fallback finds the room
// under a press once the pieces around it have had their turn.
function Room({ room, rooms, index, radius, gap, occupied = false, walls = null, openings }: Props) {
  const elevation = elevationOf(room)
  // With every floor in view, a floor reaches down only as far as the
  // lowest room of its own floor, and leaves the floor below in sight.
  const storey = room.storey ?? 0
  const lowest = Math.min(storey, ...rooms.filter(other => (other.storey ?? 0) === storey).map(elevationOf))
  const geometry = useMemo(() => {
    const points = inset(ensureCounterClockwise(room.points), gap / 2)
    const cornerRadius = room.radius ?? radius
    // With no gap, floors that touch meet flat and square: the edge is only
    // rounded over, and a corner only rounded off, where it stands free.
    // With a gap every floor stands free, and so does a floor along a lower
    // one, where it is rounded over as a step down.
    const neighbours =
      gap > TOUCHING_GAP_M
        ? []
        : rooms
            .filter(other => other.id !== room.id && (other.storey ?? 0) === storey && elevationOf(other) >= elevation)
            .map(r => r.points)
    // A concave corner wraps around a neighbour's convex corner. For the two
    // arcs to be concentric its radius grows by the gap.
    const outline = roundedShape(points, cornerRadius, cornerRadius + gap, i => touchesNeighbour(points[i], neighbours))
      .getPoints(SLAB_CURVE_SEGMENTS)
      .map((p): Point => [p.x, p.y])
    return slabGeometry(
      outline,
      neighbours,
      ROOM_SLAB_EDGE_RADIUS_M,
      // A floor raised above the lowest one reaches down to it, so it stands
      // as a solid step and not as a sheet in the air.
      ROOM_SLAB_THICKNESS_M + elevation - lowest,
      SLAB_BEVEL_SEGMENTS,
      FLOOR_PATTERN_SHIFT_M,
    )
  }, [room.id, room.points, room.radius, rooms, radius, gap, elevation, lowest, storey])

  // The other rooms on this floor, where an edge is inside the home rather
  // than its outside.
  const others = useMemo(
    () =>
      walls
        ? rooms
            // An outside space is not a room the walls are shared with: the
            // building's walls along it are its outside walls.
            .filter(
              o =>
                o.id !== room.id &&
                !o.outdoor &&
                (o.storey ?? 0) === storey &&
                (o.floor_id ?? '') === (room.floor_id ?? ''),
            )
            .map(o => inset(ensureCounterClockwise(o.points), gap / 2))
        : [],
    [walls, rooms, room.id, room.floor_id, storey, gap],
  )
  // The color of the wall on each edge, in the order the walls are built
  // in: round the room counter clockwise, which is the plan's order the other
  // way round when the room was drawn clockwise.
  const roomWall = room.wall_color ?? walls?.color
  const edgeColors = useMemo(() => {
    if (!walls || !roomWall) return undefined
    const n = room.points.length
    const flipped = signedArea(room.points) < 0
    const own = room.wall_colors ?? []
    return Array.from({ length: n }, (_, k) => {
      // Built edge k runs from point k to k + 1 of the counter clockwise
      // outline, which is the plan's edge n - 2 - k when it was reversed.
      const edge = flipped ? (((n - 2 - k) % n) + n) % n : k
      const c = new Color(own[edge] ?? roomWall)
      return [c.r, c.g, c.b] as [number, number, number]
    })
  }, [walls, roomWall, room.points, room.wall_colors])
  // What the walls set their heights from on the graphics card, while some
  // stand tall.
  const heights = useContext(WallHeights)
  // The walls stand on the floor along its edges, inside them.
  const wallGeometry = useMemo(() => {
    // An outside space has no walls of its own.
    if (!walls || room.outdoor) return null
    const outline = inset(ensureCounterClockwise(room.points), gap / 2)
    const tall = walls.tall && heights ? { ...walls.tall, floor: [outline, ...others] } : null
    return roomWallGeometry(outline, openings ?? [], {
      height: walls.height,
      thickness: walls.thickness,
      gap,
      others,
      colors: edgeColors,
      tall,
    })
  }, [walls, room.outdoor, room.points, gap, openings, others, edgeColors, heights])
  const wallMesh = useRef<Mesh>(null)
  // Its materials, and the ones its shadows are drawn with, set their heights
  // from the camera. Done again whenever a material is made anew.
  useLayoutEffect(() => {
    if (heights && wallMesh.current) animateWalls(wallMesh.current, heights)
  })
  useEffect(() => () => wallGeometry?.dispose(), [wallGeometry])

  // The outside of its walls: its own, or the home's.
  const outside = room.outside_walls ?? walls?.outside ?? 'brick'
  const outsideColor =
    room.outside_color ??
    (room.outside_walls && room.outside_walls !== walls?.outside
      ? room.outside_walls === 'plain'
        ? (walls?.color ?? WALL_COLOR)
        : OUTSIDE_WALLS[room.outside_walls].color
      : (walls?.outsideColor ?? BRICK_COLOR))

  // A fence round an outside space, on the edges it is set on, kept off
  // wherever a room of the home runs along the edge.
  const fenceGeometry = useMemo(() => {
    const heights = room.fence?.heights
    if (!heights?.some(h => (h ?? 0) > 0)) return null
    const n = room.points.length
    const flipped = signedArea(room.points) < 0
    // In the order the outline is built in, as for the walls' colors.
    const built = Array.from({ length: n }, (_, k) => heights[flipped ? (((n - 2 - k) % n) + n) % n : k] ?? 0)
    const homeRooms = rooms
      .filter(
        o =>
          o.id !== room.id && !o.outdoor && (o.storey ?? 0) === storey && (o.floor_id ?? '') === (room.floor_id ?? ''),
      )
      .map(o => inset(ensureCounterClockwise(o.points), gap / 2))
    return makeFence(inset(ensureCounterClockwise(room.points), gap / 2), built, homeRooms, gap)
  }, [room.fence?.heights, room.points, room.id, room.floor_id, rooms, storey, gap])
  useEffect(() => () => fenceGeometry?.dispose(), [fenceGeometry])

  const floor = room.floor ? FLOOR_MATERIALS[room.floor.material] : undefined
  // The presence filter fades over the floor and away again.
  const shown = useEased(occupied ? 1 : 0, 4)
  const color = presenceTint(floorColor(room, index), room, shown)

  return (
    <mesh
      // Named so the outline and the press fallback can find the room.
      name={`room:${room.id}`}
      position={[0, elevation, 0]}
      geometry={geometry}
      castShadow
      receiveShadow
    >
      {floor ? (
        // Extrude UVs are plan meters, so the surface tiles at its own
        // physical size, scaled and turned by what the room asks for.
        <SurfaceMaterial
          kind={(floor.surface ?? 'matte') as SurfaceKind}
          color={color}
          scale={room.floor?.scale ?? 1}
          rotation={room.floor?.rotation ?? 0}
          intensity={room.floor?.intensity ?? 1}
        />
      ) : (
        <meshStandardMaterial color={color} roughness={0.85} />
      )}
      {/* A child of the floor, so a room shown on its own keeps its walls
          and the others' go with them. A press goes through to the floor
          and the pieces, so the walls take none. */}
      {wallGeometry && walls && (
        <mesh ref={wallMesh} geometry={wallGeometry} castShadow receiveShadow raycast={() => null}>
          {/* Inside, the room's own color; outside, the home's brick or
              plain finish. */}
          <meshStandardMaterial attach="material-0" vertexColors roughness={0.9} />
          {outside === 'plain' ? (
            <meshStandardMaterial attach="material-1" color={outsideColor} roughness={0.9} />
          ) : (
            <SurfaceMaterial
              attach="material-1"
              kind={outside === 'wood' ? 'cladding' : 'brick'}
              color={outsideColor}
            />
          )}
        </mesh>
      )}
      {fenceGeometry && (
        <mesh geometry={fenceGeometry} castShadow receiveShadow raycast={() => null}>
          <SurfaceMaterial
            kind="cladding"
            color={room.fence?.color ?? FENCE_COLOR}
            scale={(room.fence?.slat ?? FENCE_SLAT_M) / FENCE_SLAT_M}
          />
        </mesh>
      )}
    </mesh>
  )
}

export default memo(Room)

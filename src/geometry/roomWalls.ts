import type { Point } from '#/types.ts'
import { BufferGeometry, Float32BufferAttribute } from 'three'

// Cut away walls along a room's edges, as in a dollhouse: every edge of its
// floor gets a wall of the same height, standing on the floor just inside the
// edge, with gaps where doors are and, above their sill, where windows are.
// Each room builds the walls on its own side of its edges, so two rooms side
// by side make one wall of twice the thickness between them, and a room shown
// on its own still has all of its walls.

export type WallOpening = {
  // Where the door or window stands on the plan, on the edge it is in.
  at: Point
  width: number
  // How high the gap starts: 0 for a door, its sill for a window.
  sill: number
}

// How far off an edge a door or window may stand and still cut its wall,
// beyond the wall itself: a door placed in one room cuts the next room's wall
// along it too, and rooms may stand apart by a gap.
const OPENING_REACH_M = 0.25
// The walls reach this far down into the floor's rounded rim, so they meet
// the floor along the whole of their foot.
const FOOT_M = 0.03

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]]
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1]

// Takes [from, to] out of a list of kept stretches.
export function cutStretches(keep: [number, number][], from: number, to: number): [number, number][] {
  const out: [number, number][] = []
  for (const [s0, s1] of keep) {
    if (to <= s0 || from >= s1) out.push([s0, s1])
    else {
      if (from > s0) out.push([s0, from])
      if (to < s1) out.push([to, s1])
    }
  }
  return out.filter(([s0, s1]) => s1 - s0 > 1e-4)
}

// The walls of one room, for the outline its floor is drawn with, counter
// clockwise. The floor's top is at y = 0, and plan y is -z.
export function roomWallGeometry(
  outline: Point[],
  openings: WallOpening[],
  options: { height: number; thickness: number; gap: number },
): BufferGeometry {
  const { height, thickness, gap } = options
  const positions: number[] = []
  const normals: number[] = []

  // One flat face from four corners in order round it, facing `n`.
  const quad = (p: [number, number, number][], n: [number, number, number]) => {
    const [a, b, c, d] = p
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    const facing = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] >= 0
    for (const v of facing ? [a, b, c, a, c, d] : [a, c, b, a, d, c]) {
      positions.push(v[0], v[1], v[2])
      normals.push(n[0], n[1], n[2])
    }
  }

  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 1e-3) continue
    const u: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
    // Into the room, for an outline counter clockwise.
    const inward: Point = [-u[1], u[0]]
    const at = (t: number, depth: number): Point => [a[0] + u[0] * t + inward[0] * depth, a[1] + u[1] * t + inward[1] * depth]
    const w = (p: Point, y: number): [number, number, number] => [p[0], y, -p[1]]
    const N: [number, number, number] = [inward[0], 0, -inward[1]]
    const U: [number, number, number] = [u[0], 0, -u[1]]

    // A stretch of this wall from s0 to s1, from y0 to y1.
    const block = (s0: number, s1: number, y0: number, y1: number) => {
      const o0 = at(s0, 0)
      const o1 = at(s1, 0)
      const i0 = at(s0, thickness)
      const i1 = at(s1, thickness)
      quad([w(i0, y0), w(i1, y0), w(i1, y1), w(i0, y1)], N)
      quad([w(o0, y0), w(o1, y0), w(o1, y1), w(o0, y1)], [-N[0], 0, -N[2]])
      quad([w(o0, y1), w(o1, y1), w(i1, y1), w(i0, y1)], [0, 1, 0])
      quad([w(o0, y0), w(i0, y0), w(i0, y1), w(o0, y1)], [-U[0], 0, -U[2]])
      quad([w(o1, y0), w(i1, y0), w(i1, y1), w(o1, y1)], U)
    }

    let keep: [number, number][] = [[0, len]]
    const low: [number, number, number][] = []
    for (const o of openings) {
      const rel = sub(o.at, a)
      const along = dot(rel, u)
      // How far it stands from the wall's middle, either side.
      const off = Math.abs(dot(rel, inward) - thickness / 2)
      if (off > thickness / 2 + gap + OPENING_REACH_M) continue
      const from = along - o.width / 2
      const to = along + o.width / 2
      if (to <= 0 || from >= len) continue
      keep = cutStretches(keep, from, to)
      // A window keeps the wall under its sill.
      if (o.sill > 0.01) low.push([Math.max(from, 0), Math.min(to, len), Math.min(o.sill, height)])
    }
    for (const [s0, s1] of keep) block(s0, s1, -FOOT_M, height)
    for (const [s0, s1, sill] of low) if (s1 > s0) block(s0, s1, -FOOT_M, sill)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.computeBoundingSphere()
  return geometry
}

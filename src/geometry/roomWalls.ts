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

// The stretches of an edge from a to b that no other room on its floor runs
// along, within the gap between them: the outside of the home.
export function outsideStretches(a: Point, b: Point, others: Point[][], gap: number): [number, number][] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const u: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  let out: [number, number][] = [[0, len]]
  for (const other of others) {
    for (let i = 0; i < other.length; i++) {
      const p = other[i]
      const q = other[(i + 1) % other.length]
      const l = Math.hypot(q[0] - p[0], q[1] - p[1])
      if (l < 1e-3) continue
      const v: Point = [(q[0] - p[0]) / l, (q[1] - p[1]) / l]
      // Along the same line, either way, and no further off than the gap.
      if (Math.abs(Math.abs(dot(u, v)) - 1) > 1e-3) continue
      const rel = sub(p, a)
      if (Math.abs(rel[0] * u[1] - rel[1] * u[0]) > gap + SAME_LINE_M) continue
      const e0 = dot(rel, u)
      const e1 = e0 + dot(v, u) * l
      out = cutStretches(out, Math.min(e0, e1), Math.max(e0, e1))
    }
  }
  return out
}

// Edges this close to one line, beyond the gap, are one wall.
const SAME_LINE_M = 0.02

// The walls of one room, for the outline its floor is drawn with, counter
// clockwise. The floor's top is at y = 0, and plan y is -z. The faces come in
// two groups: 0 for the room's own color, the inside, the tops and the
// faces against the next room, and 1 for the outside of the home. Texture
// coordinates are in meters, along the wall and up it.
export function roomWallGeometry(
  outline: Point[],
  openings: WallOpening[],
  options: { height: number; thickness: number; gap: number; others?: Point[][] },
): BufferGeometry {
  const { height, thickness, gap, others = [] } = options
  const faces: [number[], number[], number[]][] = [
    [[], [], []],
    [[], [], []],
  ]

  // One flat face from four corners in order round it, facing `n`, with the
  // texture coordinates of its corners.
  const quad = (group: 0 | 1, p: [number, number, number][], n: [number, number, number], uv: [number, number][]) => {
    const [positions, normals, uvs] = faces[group]
    const [a, b, c] = p
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    const facing = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] >= 0
    for (const k of facing ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
      positions.push(p[k][0], p[k][1], p[k][2])
      normals.push(n[0], n[1], n[2])
      uvs.push(uv[k][0], uv[k][1])
    }
  }

  // Whether the outline turns left at a corner, round the outside of the
  // room: there the two walls overlap in the corner and close it, and an end
  // of either would only flicker against the face of the other. Turning the
  // other way, into the room, each wall shows its end.
  const n = outline.length
  const convex = (k: number) => {
    const p = outline[(k - 1 + n) % n]
    const q = outline[k]
    const r = outline[(k + 1) % n]
    return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]) > 0
  }

  // How far along the outline each edge starts, so the pattern runs on round
  // a corner.
  let start = 0
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
    const outside = outsideStretches(a, b, others, gap)
    const s = start
    start += len

    // A stretch of this wall from s0 to s1, from y0 to y1.
    const block = (s0: number, s1: number, y0: number, y1: number) => {
      const o0 = at(s0, 0)
      const o1 = at(s1, 0)
      const i0 = at(s0, thickness)
      const i1 = at(s1, thickness)
      const along: [number, number][] = [
        [s + s0, y0],
        [s + s1, y0],
        [s + s1, y1],
        [s + s0, y1],
      ]
      quad(0, [w(i0, y0), w(i1, y0), w(i1, y1), w(i0, y1)], N, along)
      quad(
        0,
        [w(o0, y1), w(o1, y1), w(i1, y1), w(i0, y1)],
        [0, 1, 0],
        [
          [s + s0, 0],
          [s + s1, 0],
          [s + s1, thickness],
          [s + s0, thickness],
        ],
      )
      const end: [number, number][] = [
        [0, y0],
        [thickness, y0],
        [thickness, y1],
        [0, y1],
      ]
      // Its ends: at a door, and at a corner turning into the room, on the
      // outside of the home when that end is.
      const endGroup = (t: number): 0 | 1 => (outside.some(([x0, x1]) => t >= x0 - 1e-4 && t <= x1 + 1e-4) ? 1 : 0)
      if (s0 > 1e-4) quad(0, [w(o0, y0), w(i0, y0), w(i0, y1), w(o0, y1)], [-U[0], 0, -U[2]], end)
      else if (!convex(i)) quad(endGroup(0), [w(o0, y0), w(i0, y0), w(i0, y1), w(o0, y1)], [-U[0], 0, -U[2]], end)
      if (s1 < len - 1e-4) quad(0, [w(o1, y0), w(i1, y0), w(i1, y1), w(o1, y1)], U, end)
      else if (!convex((i + 1) % n)) quad(endGroup(len), [w(o1, y0), w(i1, y0), w(i1, y1), w(o1, y1)], U, end)
      // The face on the edge itself: the outside of the home where no room
      // runs along it, in its own group, and against the next room where one
      // does.
      let rest: [number, number][] = [[s0, s1]]
      for (const [x0, x1] of outside) {
        const from = Math.max(x0, s0)
        const to = Math.min(x1, s1)
        if (to <= from) continue
        rest = cutStretches(rest, from, to)
        outerFace(1, from, to, y0, y1)
      }
      for (const [from, to] of rest) outerFace(0, from, to, y0, y1)
    }
    const outerFace = (group: 0 | 1, s0: number, s1: number, y0: number, y1: number) =>
      quad(group, [w(at(s0, 0), y0), w(at(s1, 0), y0), w(at(s1, 0), y1), w(at(s0, 0), y1)], [-N[0], 0, -N[2]], [
        [s + s0, y0],
        [s + s1, y0],
        [s + s1, y1],
        [s + s0, y1],
      ])

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
  const all = (k: 0 | 1 | 2) => [...faces[0][k], ...faces[1][k]]
  geometry.setAttribute('position', new Float32BufferAttribute(all(0), 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(all(1), 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(all(2), 2))
  const inside = faces[0][0].length / 3
  geometry.addGroup(0, inside, 0)
  geometry.addGroup(inside, faces[1][0].length / 3, 1)
  geometry.computeBoundingSphere()
  return geometry
}

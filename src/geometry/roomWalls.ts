import type { Point } from '#/types.ts'
import { BufferGeometry, Float32BufferAttribute } from 'three'

// Cut away walls along a room's edges, as in a dollhouse: every edge of its
// floor gets a wall, standing on the floor just inside the edge, with gaps
// where doors are and, above their sill, where windows are. Each room builds
// the walls on its own side of its edges, so two rooms side by side make one
// wall of twice the thickness between them, and a room shown on its own still
// has all of its walls.
//
// The walls are low, so the rooms show over them. With tall walls on, the
// outside walls at the back of the home, away from the camera, stand to full
// height instead, like the backdrop of a stage. Where a tall wall meets a low
// one it runs on into it a little way, the jut, then steps down to it with a
// rounded foot.

export type WallOpening = {
  // Where the door or window stands on the plan, on the edge it is in.
  at: Point
  width: number
  // How high the gap starts: 0 for a door, its sill for a window.
  sill: number
  // How high it reaches. A tall wall goes on above it.
  top: number
}

export type TallWalls = {
  height: number
  // How far a tall wall runs on into a low one, and the radius of the curve
  // it steps down to it with.
  jut: number
  radius: number
  // Toward the camera on the plan, level and of length 1: walls facing away
  // from it are the back of the home.
  toCamera: Point
  // The outlines of every room on the floor, this one too, as their floors
  // are drawn, counter clockwise.
  floor: Point[][]
}

// How far off an edge a door or window may stand and still cut its wall,
// beyond the wall itself: a door placed in one room cuts the next room's wall
// along it too, and rooms may stand apart by a gap.
const OPENING_REACH_M = 0.25
// The walls reach this far down into the floor's rounded rim, so they meet
// the floor along the whole of their foot.
const FOOT_M = 0.03
// Edges this close to one line, beyond the gap, are one wall.
const SAME_LINE_M = 0.02
// An outside wall stands tall unless it faces the camera more than this:
// the walls at the back and the sides of the home stand tall, the ones in
// front stay low so the rooms show over them.
const FACING_CAMERA = 0.3
// Steps the rounded foot is drawn in.
const FOOT_STEPS = 8

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

// Stretches put together where they overlap or meet.
function merge(list: [number, number][]): [number, number][] {
  const sorted = [...list].sort((p, q) => p[0] - q[0])
  const out: [number, number][] = []
  for (const [s0, s1] of sorted) {
    const last = out.at(-1)
    if (last && s0 <= last[1] + 1e-6) last[1] = Math.max(last[1], s1)
    else out.push([s0, s1])
  }
  return out
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

// The stretches of an edge that stand tall: the outside of the home, where
// the wall faces away from the camera.
export function tallStretches(a: Point, b: Point, others: Point[][], gap: number, toCamera: Point): [number, number][] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const u: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  // Out of the room, for an outline counter clockwise.
  const out: Point = [u[1], -u[0]]
  if (dot(out, toCamera) > FACING_CAMERA) return []
  return outsideStretches(a, b, others, gap)
}

// Every stretch of tall wall on a floor, as a piece of its edge on the plan.
function tallSegments(floor: Point[][], gap: number, toCamera: Point): [Point, Point][] {
  const out: [Point, Point][] = []
  floor.forEach((outline, r) => {
    const others = floor.filter((_, k) => k !== r)
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i]
      const b = outline[(i + 1) % outline.length]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < 1e-3) continue
      const u: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
      for (const [s0, s1] of tallStretches(a, b, others, gap, toCamera))
        out.push([
          [a[0] + u[0] * s0, a[1] + u[1] * s0],
          [a[0] + u[0] * s1, a[1] + u[1] * s1],
        ])
    }
  })
  return out
}

// How far a point is from a piece of line.
function distance(p: Point, [a, b]: [Point, Point]) {
  const ab = sub(b, a)
  const t = Math.min(Math.max(dot(sub(p, a), ab) / Math.max(dot(ab, ab), 1e-12), 0), 1)
  return Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t))
}

// The height of a wall along it, from its tall stretches, as a function of
// how far along it is, taken just to one side of that point where it steps.
type Profile = {
  at: (s: number, side: -1 | 1) => number
  // Where it changes: its steps and the points along its rounded feet.
  breaks: number[]
}

export function wallProfile(len: number, low: number, tall: TallWalls | null, tallSet: [number, number][]): Profile {
  if (!tall || tallSet.length === 0) return { at: () => low, breaks: [] }
  const H = tall.height
  const r = Math.max(0, Math.min(tall.radius, H - low))
  // The ends of the tall stretches inside the wall, and which way the low
  // wall lies from each.
  const steps: { s: number; toward: -1 | 1 }[] = []
  for (const [s0, s1] of tallSet) {
    if (s0 > 1e-4) steps.push({ s: s0, toward: -1 })
    if (s1 < len - 1e-4) steps.push({ s: s1, toward: 1 })
  }
  const inTall = (x: number) => tallSet.some(([s0, s1]) => x > s0 && x < s1)
  const at = (s: number, side: -1 | 1) => {
    const x = s + side * 1e-7
    if (inTall(x)) return H
    let h = low
    for (const step of steps) {
      const d = (x - step.s) * step.toward
      if (d < 0 || d > r) continue
      // A quarter circle, from the foot of the step down to the low top.
      h = Math.max(h, low + r - Math.sqrt(Math.max(r * r - (r - d) ** 2, 0)))
    }
    return h
  }
  const breaks: number[] = []
  for (const step of steps) {
    for (let k = 0; k <= FOOT_STEPS; k++) {
      const s = step.s + step.toward * r * (k / FOOT_STEPS)
      if (s > 0 && s < len) breaks.push(s)
    }
  }
  return { at, breaks }
}

// The walls of one room, for the outline its floor is drawn with, counter
// clockwise. The floor's top is at y = 0, and plan y is -z. The faces come in
// two groups: 0 for the room's own color, the inside, the tops and the
// faces against the next room, and 1 for the outside of the home. Texture
// coordinates are in meters, along the wall and up it.
export function roomWallGeometry(
  outline: Point[],
  openings: WallOpening[],
  options: {
    height: number
    thickness: number
    gap: number
    others?: Point[][]
    // The color of each edge's wall, in the order of the outline's edges,
    // as linear red, green and blue. Without it the material's color shows.
    colors?: [number, number, number][]
    tall?: TallWalls | null
  },
): BufferGeometry {
  const { height, thickness, gap, others = [], colors, tall = null } = options
  const faces: [number[], number[], number[], number[]][] = [
    [[], [], [], []],
    [[], [], [], []],
  ]
  // The color the faces of the wall being built take.
  let tint: [number, number, number] = [1, 1, 1]
  const segments = tall ? tallSegments(tall.floor, gap, tall.toCamera) : []

  // One flat face from four corners in order round it, facing `n`, with the
  // texture coordinates of its corners.
  const quad = (group: 0 | 1, p: [number, number, number][], n: [number, number, number], uv: [number, number][]) => {
    const [positions, normals, uvs, tints] = faces[group]
    const [a, b, c] = p
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    const facing = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] >= 0
    for (const k of facing ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
      positions.push(p[k][0], p[k][1], p[k][2])
      normals.push(n[0], n[1], n[2])
      uvs.push(uv[k][0], uv[k][1])
      tints.push(tint[0], tint[1], tint[2])
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
    const at = (t: number, depth: number): Point => [
      a[0] + u[0] * t + inward[0] * depth,
      a[1] + u[1] * t + inward[1] * depth,
    ]
    const w = (p: Point, y: number): [number, number, number] => [p[0], y, -p[1]]
    const N: [number, number, number] = [inward[0], 0, -inward[1]]
    const U: [number, number, number] = [u[0], 0, -u[1]]
    const back: [number, number, number] = [-U[0], 0, -U[2]]
    const outside = outsideStretches(a, b, others, gap)
    tint = colors?.[i] ?? [1, 1, 1]
    const s = start
    start += len

    // Where this wall stands tall: its own stretches at the back of the home,
    // run on by the jut into the low wall beside them, and an end that meets
    // a tall wall, risen to it for the wall's thickness and the jut.
    let tallSet: [number, number][] = []
    if (tall) {
      const own = tallStretches(a, b, others, gap, tall.toCamera)
      const reach = thickness + tall.jut
      tallSet = own.map(
        ([s0, s1]) =>
          [s0 > 1e-4 ? Math.max(0, s0 - tall.jut) : 0, s1 < len - 1e-4 ? Math.min(len, s1 + tall.jut) : len] as [
            number,
            number,
          ],
      )
      const meets = (p: Point) => segments.some(seg => distance(p, seg) <= gap + SAME_LINE_M)
      const ownTall = (t: number) => own.some(([s0, s1]) => t >= s0 - 1e-4 && t <= s1 + 1e-4)
      if (!ownTall(0) && meets(a)) tallSet.push([0, Math.min(reach, len)])
      if (!ownTall(len) && meets(b)) tallSet.push([Math.max(len - reach, 0), len])
      tallSet = merge(tallSet)
    }
    const top = wallProfile(len, height, tall, tallSet)

    // Where the outside of the home starts and stops along this wall, so the
    // brick face stops there too.
    const outsideBreaks = outside.flatMap(([x0, x1]) => [x0, x1])
    const isOutside = (t: number) => outside.some(([x0, x1]) => t > x0 + 1e-6 && t < x1 - 1e-6)
    const endGroup = (t: number): 0 | 1 => (outside.some(([x0, x1]) => t >= x0 - 1e-4 && t <= x1 + 1e-4) ? 1 : 0)

    // An end of a stretch of wall, from y0 to h, facing along it either way.
    const cap = (t: number, y0: number, h: number, facing: [number, number, number], group: 0 | 1) => {
      if (h - y0 < 1e-6) return
      quad(group, [w(at(t, 0), y0), w(at(t, thickness), y0), w(at(t, thickness), h), w(at(t, 0), h)], facing, [
        [0, y0],
        [thickness, y0],
        [thickness, h],
        [0, h],
      ])
    }

    // A stretch of this wall from s0 to s1, from y0 up to its top, or up to
    // `roof` where that is given (under a window's sill). `under` gives it an
    // underside, for a lintel over a door or window.
    const band = (
      s0: number,
      s1: number,
      y0: number,
      roof: ((t: number, side: -1 | 1) => number) | null,
      under: boolean,
    ) => {
      const height = roof ?? top.at
      // Its corners along it: each change of height and each end of the
      // outside, with both heights where it steps.
      const cuts = [s0, s1, ...top.breaks, ...outsideBreaks].filter(t => t >= s0 - 1e-9 && t <= s1 + 1e-9)
      const along = [...new Set(cuts.map(t => Math.round(t * 1e6) / 1e6))].sort((p, q) => p - q)
      const pts: { t: number; h: number }[] = []
      along.forEach((t, k) => {
        const before = k > 0 ? height(t, -1) : null
        const after = k < along.length - 1 ? height(t, 1) : null
        if (before !== null) pts.push({ t, h: before })
        if (after !== null && (before === null || Math.abs(after - before) > 1e-6)) pts.push({ t, h: after })
      })
      for (let k = 0; k + 1 < pts.length; k++) {
        const p = pts[k]
        const q = pts[k + 1]
        if (q.t - p.t < 1e-7) {
          // A step up or down at one point: the face of the taller part,
          // above the lower one.
          cap(p.t, Math.max(Math.min(p.h, q.h), y0), Math.max(p.h, q.h), p.h > q.h ? U : back, 0)
          continue
        }
        const o0 = at(p.t, 0)
        const o1 = at(q.t, 0)
        const i0 = at(p.t, thickness)
        const i1 = at(q.t, thickness)
        const uv: [number, number][] = [
          [s + p.t, y0],
          [s + q.t, y0],
          [s + q.t, q.h],
          [s + p.t, p.h],
        ]
        quad(0, [w(i0, y0), w(i1, y0), w(i1, q.h), w(i0, p.h)], N, uv)
        quad(isOutside((p.t + q.t) / 2) ? 1 : 0, [w(o0, y0), w(o1, y0), w(o1, q.h), w(o0, p.h)], [-N[0], 0, -N[2]], uv)
        // The top, level, or sloping down a rounded foot.
        const slope = (q.h - p.h) / (q.t - p.t)
        const l = Math.hypot(slope, 1)
        const flat: [number, number][] = [
          [s + p.t, 0],
          [s + q.t, 0],
          [s + q.t, thickness],
          [s + p.t, thickness],
        ]
        quad(
          0,
          [w(o0, p.h), w(o1, q.h), w(i1, q.h), w(i0, p.h)],
          [(-slope * U[0]) / l, 1 / l, (-slope * U[2]) / l],
          flat,
        )
        if (under) quad(0, [w(o0, y0), w(o1, y0), w(i1, y0), w(i0, y0)], [0, -1, 0], flat)
      }
      // Its ends: at a door or window, and at a corner turning into the
      // room, on the outside of the home when that end is.
      const h0 = pts[0]?.h ?? height(s0, 1)
      const h1 = pts.at(-1)?.h ?? height(s1, -1)
      if (s0 > 1e-4) cap(s0, y0, h0, back, 0)
      else if (!convex(i)) cap(s0, y0, h0, back, endGroup(0))
      if (s1 < len - 1e-4) cap(s1, y0, h1, U, 0)
      else if (!convex((i + 1) % n)) cap(s1, y0, h1, U, endGroup(len))
    }

    // The doors and windows in this wall, as stretches along it.
    let keep: [number, number][] = [[0, len]]
    const gaps: { from: number; to: number; sill: number; top: number }[] = []
    for (const o of openings) {
      const rel = sub(o.at, a)
      const along = dot(rel, u)
      // How far it stands from the wall's middle, either side.
      const off = Math.abs(dot(rel, inward) - thickness / 2)
      if (off > thickness / 2 + gap + OPENING_REACH_M) continue
      const from = Math.max(along - o.width / 2, 0)
      const to = Math.min(along + o.width / 2, len)
      if (to <= from) continue
      keep = cutStretches(keep, from, to)
      gaps.push({ from, to, sill: o.sill, top: o.top })
    }
    for (const [s0, s1] of keep) band(s0, s1, -FOOT_M, null, false)
    for (const g of gaps) {
      // A window keeps the wall under its sill.
      if (g.sill > 0.01) band(g.from, g.to, -FOOT_M, (t, side) => Math.min(g.sill, top.at(t, side)), false)
      // Over the gap, where the wall stands higher than it, a lintel.
      const step = 0.02
      let from: number | null = null
      for (let t = g.from; t <= g.to + step / 2; t += step) {
        const x = Math.min(t, g.to)
        const high = top.at(x, -1) > g.top + 0.01 && x < g.to
        if (high && from === null) from = x
        if ((!high || x >= g.to) && from !== null) {
          if (x > from + 1e-4) band(from, x, g.top, null, true)
          from = null
        }
      }
    }
  }

  const geometry = new BufferGeometry()
  const all = (k: 0 | 1 | 2 | 3) => [...faces[0][k], ...faces[1][k]]
  geometry.setAttribute('position', new Float32BufferAttribute(all(0), 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(all(1), 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(all(2), 2))
  if (colors) geometry.setAttribute('color', new Float32BufferAttribute(all(3), 3))
  const inside = faces[0][0].length / 3
  geometry.addGroup(0, inside, 0)
  geometry.addGroup(inside, faces[1][0].length / 3, 1)
  geometry.computeBoundingSphere()
  return geometry
}

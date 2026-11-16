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
// height instead, like the backdrop of a stage, and rise and sink as the view
// turns. Where a tall wall meets a low one it runs on into it a little way,
// the jut, then steps down to it with a rounded foot.
//
// The geometry is built once, in every shape it can take: each corner of a
// wall's top knows the wall it belongs to, and the tall wall it rises to near
// a corner, and wallShader.ts sets its height from the camera on every frame.

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
  // The outlines of every room on the floor, this one first, as their floors
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

// A stretch of the outside of the home, which can stand tall, with the way
// it faces out of its room.
type Outside = { room: number; edge: number; a: Point; b: Point; out: Point }

// Every stretch of the outside of the home on a floor.
function outsideSegments(floor: Point[][], gap: number): Outside[] {
  const list: Outside[] = []
  floor.forEach((outline, room) => {
    const others = floor.filter((_, k) => k !== room)
    for (let edge = 0; edge < outline.length; edge++) {
      const a = outline[edge]
      const b = outline[(edge + 1) % outline.length]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < 1e-3) continue
      const u: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
      for (const [s0, s1] of outsideStretches(a, b, others, gap))
        list.push({
          room,
          edge,
          a: [a[0] + u[0] * s0, a[1] + u[1] * s0],
          b: [a[0] + u[0] * s1, a[1] + u[1] * s1],
          // Out of the room, for an outline counter clockwise.
          out: [u[1], -u[0]],
        })
    }
  })
  return list
}

// How far a point is from a piece of line.
function distance(p: Point, a: Point, b: Point) {
  const ab = sub(b, a)
  const t = Math.min(Math.max(dot(sub(p, a), ab) / Math.max(dot(ab, ab), 1e-12), 0), 1)
  return Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t))
}

function cross3(a: number[], b: number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

// A tall wall a stretch of this one rises to: from `start` along it, the way
// `dir` points, for `reach` at full height, then down its rounded foot.
type Rise = { start: number; dir: 1 | -1; reach: number; out: Point }

// What a point of a wall's top needs to find its height: which way its own
// wall faces, when that is the outside of the home, the tall wall it rises to
// and how high it stands when only that one is tall, and what holds it in.
type Top = {
  own: Point | null
  rise: Point | null
  risen: number
  min: number
  max: number
}

// The walls of one room, for the outline its floor is drawn with, counter
// clockwise. The floor's top is at y = 0, and plan y is -z. The faces come in
// two groups: 0 for the room's own color, the inside, the tops and the
// faces against the next room, and 1 for the outside of the home. Texture
// coordinates are in meters, along the wall and up it.
//
// With tall walls, every corner of a wall's top carries what wallShader.ts
// needs to set its height from the camera, and the positions stand every
// wall at full height, for the bounds the card culls by.
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
  const { height: low, thickness, gap, others = [], colors, tall = null } = options
  const H = tall ? Math.max(tall.height, low) : low
  const r = tall ? Math.max(0, Math.min(tall.radius, H - low)) : 0
  type Buffers = Record<'position' | 'normal' | 'uv' | 'color' | 'own' | 'rise' | 'shape' | 'extra', number[]>
  const empty = (): Buffers => ({
    position: [],
    normal: [],
    uv: [],
    color: [],
    own: [],
    rise: [],
    shape: [],
    extra: [],
  })
  const faces: [Buffers, Buffers] = [empty(), empty()]
  // The color the faces of the wall being built take.
  let tint: [number, number, number] = [1, 1, 1]
  // This room is the first of its floor.
  const outsides = tall ? outsideSegments(tall.floor, gap) : []

  // A corner of a face: where it is on the plan and how high it stands
  // while every wall is low, and, for one on the wall's top, how it moves.
  // A lintel's corners say how high it starts, as it is only there while the
  // wall stands over that.
  type Corner = { p: Point; y: number; top?: Top; lintel?: number; still?: boolean }
  // Where a corner stands, every wall at full height, and every wall low.
  const tallY = (c: Corner) => (c.top && !c.still ? Math.min(Math.max(H, c.top.min), c.top.max) : c.y)
  const lowY = (c: Corner) => (c.top && !c.still ? Math.min(Math.max(c.top.risen, c.top.min), c.top.max) : c.y)

  // One flat face from four corners in order round it, facing `n`, with the
  // texture coordinates of its corners. `slope` marks a top face, whose
  // facing tips up as its wall rises level.
  const quad = (group: 0 | 1, c: Corner[], n: [number, number, number], uv: [number, number][], slope = false) => {
    const f = faces[group]
    // The winding from whichever shape of the face has an area.
    let facing = true
    for (const y of [tallY, lowY]) {
      const pos = c.map(k => [k.p[0], y(k), -k.p[1]])
      const e1 = [pos[1][0] - pos[0][0], pos[1][1] - pos[0][1], pos[1][2] - pos[0][2]]
      const e2 = [pos[2][0] - pos[0][0], pos[2][1] - pos[0][1], pos[2][2] - pos[0][2]]
      const e3 = [pos[3][0] - pos[0][0], pos[3][1] - pos[0][1], pos[3][2] - pos[0][2]]
      const cr = cross3(e1, e2)
      const cr2 = cross3(e2, e3)
      const sum = [cr[0] + cr2[0], cr[1] + cr2[1], cr[2] + cr2[2]]
      if (Math.hypot(...sum) < 1e-9) continue
      facing = sum[0] * n[0] + sum[1] * n[1] + sum[2] * n[2] >= 0
      break
    }
    for (const k of facing ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
      const v = c[k]
      f.position.push(v.p[0], tall ? tallY(v) : v.y, -v.p[1])
      f.normal.push(n[0], n[1], n[2])
      f.uv.push(uv[k][0], uv[k][1])
      f.color.push(tint[0], tint[1], tint[2])
      if (!tall) continue
      const t = v.top
      f.own.push(t?.own?.[0] ?? 0, t?.own?.[1] ?? 0, t?.own ? 1 : 0)
      f.rise.push(t?.rise?.[0] ?? 0, t?.rise?.[1] ?? 0, t?.rise ? 1 : 0)
      f.shape.push(t && !v.still ? 1 : 0, t?.risen ?? v.y, t?.min ?? -1e3, t?.max ?? 1e3)
      f.extra.push(v.lintel ?? -1, slope ? 1 : 0)
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
    const w = outline[(k + 1) % n]
    return (q[0] - p[0]) * (w[1] - q[1]) - (q[1] - p[1]) * (w[0] - q[0]) > 0
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
    // Into the room, for an outline counter clockwise, and out of it.
    const inward: Point = [-u[1], u[0]]
    const outward: Point = [u[1], -u[0]]
    const at = (t: number, depth: number): Point => [
      a[0] + u[0] * t + inward[0] * depth,
      a[1] + u[1] * t + inward[1] * depth,
    ]
    const N: [number, number, number] = [inward[0], 0, -inward[1]]
    const U: [number, number, number] = [u[0], 0, -u[1]]
    const back: [number, number, number] = [-U[0], 0, -U[2]]
    const outside = outsideStretches(a, b, others, gap)
    tint = colors?.[i] ?? [1, 1, 1]
    const s = start
    start += len

    // Where this wall rises to a tall one: next to its own outside, which
    // runs on into the rest of it by the jut, and at an end meeting the
    // outside of the home anywhere else on the floor, risen to it for the
    // wall's thickness and the jut.
    const rises: Rise[] = []
    if (tall) {
      for (const [x0, x1] of outside) {
        if (x0 > 1e-4) rises.push({ start: x0, dir: -1, reach: tall.jut, out: outward })
        if (x1 < len - 1e-4) rises.push({ start: x1, dir: 1, reach: tall.jut, out: outward })
      }
      const meets = (p: Point) => {
        let best: { d: number; out: Point } | null = null
        for (const o of outsides) {
          if (o.room === 0 && o.edge === i) continue
          const d = distance(p, o.a, o.b)
          if (d <= gap + SAME_LINE_M && (!best || d < best.d)) best = { d, out: o.out }
        }
        return best?.out ?? null
      }
      const ra = meets(a)
      const rb = meets(b)
      if (ra) rises.push({ start: 0, dir: 1, reach: thickness + tall.jut, out: ra })
      if (rb) rises.push({ start: len, dir: -1, reach: thickness + tall.jut, out: rb })
    }
    const isOutside = (t: number) => outside.some(([x0, x1]) => t > x0 + 1e-6 && t < x1 - 1e-6)
    // How a point of the top moves, taken just to one side of t, where it
    // steps.
    const topAt = (t: number, side: -1 | 1, min: number, max: number): Top => {
      const x = t + side * 1e-7
      let rise: Rise | null = null
      let risen = low
      let nearest = Infinity
      for (const g of rises) {
        const d = (x - g.start) * g.dir
        if (d < 0 || d > g.reach + r || d >= nearest) continue
        nearest = d
        rise = g
        risen = d <= g.reach ? H : low + r - Math.sqrt(Math.max(r * r - (r - (d - g.reach)) ** 2, 0))
      }
      return { own: isOutside(x) ? outward : null, rise: rise?.out ?? null, risen, min, max }
    }
    // Where its top changes along it: the ends of the outside, and of the
    // rises and the points down their feet.
    const breaks = [
      ...outside.flatMap(([x0, x1]) => [x0, x1]),
      ...rises.flatMap(g =>
        Array.from({ length: FOOT_STEPS + 1 }, (_, k) => g.start + g.dir * (g.reach + (r * k) / FOOT_STEPS)),
      ),
    ].filter(t => t > 0 && t < len)

    const endGroup = (t: number): 0 | 1 => (outside.some(([x0, x1]) => t >= x0 - 1e-4 && t <= x1 + 1e-4) ? 1 : 0)

    // A stretch of this wall from s0 to s1, from y0 up to its top, held
    // under `max` (a window's sill) or over `min` (a lintel, which shows its
    // underside and is gone while the wall is lower than it).
    const band = (s0: number, s1: number, y0: number, opts: { max?: number; min?: number; lintel?: number }) => {
      const { max = 1e3, min = -1e3, lintel } = opts
      const lowTop = Math.min(Math.max(low, min), max)
      const along = [
        ...new Set(
          [s0, s1, ...(tall ? breaks : [])]
            .filter(t => t >= s0 - 1e-9 && t <= s1 + 1e-9)
            .map(t => Math.round(t * 1e6) / 1e6),
        ),
      ].sort((p, q) => p - q)
      // Each point of its top, on both sides of a point where it steps.
      const pts: { t: number; top: Top | undefined; h: number }[] = []
      along.forEach((t, k) => {
        const sides: (-1 | 1)[] = k === 0 ? [1] : k === along.length - 1 ? [-1] : [-1, 1]
        let last: Top | undefined
        for (const side of sides) {
          const top = tall ? topAt(t, side, min, max) : undefined
          if (
            last &&
            top &&
            Math.abs(last.risen - top.risen) < 1e-9 &&
            last.own === top.own &&
            last.rise?.[0] === top.rise?.[0] &&
            last.rise?.[1] === top.rise?.[1]
          )
            continue
          pts.push({ t, top, h: top ? Math.min(Math.max(top.risen, min), max) : lowTop })
          last = top
        }
      })
      const corner = (pt: (typeof pts)[number], depth: number): Corner => ({
        p: at(pt.t, depth),
        y: pt.h,
        top: pt.top,
        lintel,
      })
      // A lintel's foot stays put but knows the top over it, so the lintel
      // goes as a whole when the wall drops under it.
      const foot = (pt: (typeof pts)[number], depth: number): Corner =>
        lintel !== undefined
          ? { p: at(pt.t, depth), y: y0, lintel, top: pt.top, still: true }
          : { p: at(pt.t, depth), y: y0 }
      for (let k = 0; k + 1 < pts.length; k++) {
        const p = pts[k]
        const q = pts[k + 1]
        if (q.t - p.t < 1e-7) {
          // A step at one point, from one side's top to the other's, facing
          // the lower side.
          const facing = (p.top?.risen ?? 0) > (q.top?.risen ?? 0) ? U : back
          quad(0, [corner(q, 0), corner(q, thickness), corner(p, thickness), corner(p, 0)], facing, [
            [0, 0],
            [thickness, 0],
            [thickness, 1],
            [0, 1],
          ])
          continue
        }
        const uv: [number, number][] = [
          [s + p.t, y0],
          [s + q.t, y0],
          [s + q.t, tall ? H : q.h],
          [s + p.t, tall ? H : p.h],
        ]
        quad(0, [foot(p, thickness), foot(q, thickness), corner(q, thickness), corner(p, thickness)], N, uv)
        quad(
          isOutside((p.t + q.t) / 2) ? 1 : 0,
          [foot(p, 0), foot(q, 0), corner(q, 0), corner(p, 0)],
          [-N[0], 0, -N[2]],
          uv,
        )
        // The top, level, or sloping down a rounded foot while the wall it
        // rises to is tall.
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
          [corner(p, 0), corner(q, 0), corner(q, thickness), corner(p, thickness)],
          [(-slope * U[0]) / l, 1 / l, (-slope * U[2]) / l],
          flat,
          true,
        )
        if (lintel !== undefined)
          quad(0, [foot(p, 0), foot(q, 0), foot(q, thickness), foot(p, thickness)], [0, -1, 0], flat)
      }
      // Its ends: at a door or window, and at a corner turning into the
      // room, on the outside of the home when that end is.
      const first = pts[0]
      const last = pts.at(-1)
      if (!first || !last) return
      const cap = (pt: (typeof pts)[number], facing: [number, number, number], group: 0 | 1) => {
        if (!pt.top && pt.h - y0 < 1e-6) return
        quad(group, [foot(pt, 0), foot(pt, thickness), corner(pt, thickness), corner(pt, 0)], facing, [
          [0, y0],
          [thickness, y0],
          [thickness, pt.h],
          [0, pt.h],
        ])
      }
      if (s0 > 1e-4) cap(first, back, 0)
      else if (!convex(i)) cap(first, back, endGroup(0))
      if (s1 < len - 1e-4) cap(last, U, 0)
      else if (!convex((i + 1) % n)) cap(last, U, endGroup(len))
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
    for (const [s0, s1] of keep) band(s0, s1, -FOOT_M, {})
    for (const g of gaps) {
      // A window keeps the wall under its sill.
      if (g.sill > 0.01) band(g.from, g.to, -FOOT_M, { max: g.sill })
      // Over the gap, a lintel, there while the wall stands higher than it.
      if (tall && H > g.top + 0.01) band(g.from, g.to, g.top, { min: g.top, lintel: g.top })
    }
  }

  const geometry = new BufferGeometry()
  const all = (k: keyof Buffers) => [...faces[0][k], ...faces[1][k]]
  geometry.setAttribute('position', new Float32BufferAttribute(all('position'), 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(all('normal'), 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(all('uv'), 2))
  if (colors) geometry.setAttribute('color', new Float32BufferAttribute(all('color'), 3))
  if (tall) {
    geometry.setAttribute('wallOwn', new Float32BufferAttribute(all('own'), 3))
    geometry.setAttribute('wallRise', new Float32BufferAttribute(all('rise'), 3))
    geometry.setAttribute('wallShape', new Float32BufferAttribute(all('shape'), 4))
    geometry.setAttribute('wallExtra', new Float32BufferAttribute(all('extra'), 2))
  }
  const inside = faces[0].position.length / 3
  geometry.addGroup(0, inside, 0)
  geometry.addGroup(inside, faces[1].position.length / 3, 1)
  geometry.computeBoundingSphere()
  return geometry
}

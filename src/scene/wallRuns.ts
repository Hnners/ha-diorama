import type { Point } from '#/types.ts'
import { FACING, SPREAD, WALL_RUNS, type WallUniforms } from '#/scene/wallShader.ts'

// The runs of the home's outside wall on each floor, numbered for the wall
// shader, and which of them may stand tall. A wall turned away from the
// camera stands tall to show the back of the home; on its own, away from
// the back, it only floats in the middle of the home. So on each turn of
// the view only the tall runs joined, corner to corner, to the one at the
// very back stand, and the rest sink with the walls facing the camera.

type Run = { floor: string; a: Point; b: Point; out: Point; len: number; joins: boolean }

// How close two runs come and still count as joined: across a corner, the
// gap between two rooms and a wall's thickness either side.
const JOIN_M = 0.45
// How quickly a run rises or sinks as the back of the home changes, a share
// of the way a second.
const EASE = 6

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
// How far a point is from a piece of line.
function distance(p: Point, a: Point, b: Point) {
  const ab: Point = [b[0] - a[0], b[1] - a[1]]
  const l2 = Math.max(ab[0] * ab[0] + ab[1] * ab[1], 1e-12)
  const t = clamp01(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)
  return Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t))
}
const near = (r: Run, s: Run) =>
  Math.min(distance(r.a, s.a, s.b), distance(r.b, s.a, s.b), distance(s.a, r.a, r.b), distance(s.b, r.a, r.b)) <= JOIN_M

export class WallRuns {
  private runs: Run[] = []
  private byKey = new Map<string, number>()
  private allow = new Float32Array(WALL_RUNS).fill(1)
  // The runs of a wall shorter than this have no say of their own and only
  // join the tall ones at their ends, as in roomWalls.ts.
  short = 0

  private uniforms: WallUniforms
  constructor(uniforms: WallUniforms) {
    this.uniforms = uniforms
  }

  // The number of a run on a floor, the same for every room that meets it,
  // or -1 once there is no room for more.
  // `joins` marks a return, which only joins the runs at its ends.
  index(floor: string, a: Point, b: Point, out: Point, len: number, joins = false) {
    const k = (p: Point) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`
    const [p, q] = k(a) < k(b) ? [k(a), k(b)] : [k(b), k(a)]
    const key = `${floor}|${p}|${q}`
    const known = this.byKey.get(key)
    if (known !== undefined) {
      if (joins) this.runs[known].joins = true
      return known
    }
    if (this.runs.length >= WALL_RUNS) return -1
    this.runs.push({ floor, a, b, out, len, joins })
    this.byKey.set(key, this.runs.length - 1)
    return this.runs.length - 1
  }

  // Settles which runs stand for the camera looking toward `toCamera`, on
  // the plan, and eases each run's allowance toward it.
  update(toCamera: Point, dt: number) {
    const n = this.runs.length
    if (!n) return
    const want = new Float32Array(n)
    const floors = new Map<string, number[]>()
    this.runs.forEach((r, i) => floors.set(r.floor, [...(floors.get(r.floor) ?? []), i]))
    const rise = (r: Run) =>
      1 - smoothstep(FACING - SPREAD, FACING + SPREAD, r.out[0] * toCamera[0] + r.out[1] * toCamera[1])
    for (const list of floors.values()) {
      // The runs standing tall now, and the short ones that join them.
      const joins = (r: Run) => r.joins || r.len < this.short
      const tall = list.filter(i => !joins(this.runs[i]) && rise(this.runs[i]) > 0.25)
      const bridges = list.filter(i => joins(this.runs[i]))
      const nodes = [...tall, ...bridges]
      const parent = new Map(nodes.map(i => [i, i]))
      const root = (i: number): number => {
        let r = i
        while (parent.get(r)! !== r) r = parent.get(r)!
        parent.set(i, r)
        return r
      }
      for (let x = 0; x < nodes.length; x++)
        for (let y = x + 1; y < nodes.length; y++)
          if (near(this.runs[nodes[x]], this.runs[nodes[y]])) parent.set(root(nodes[x]), root(nodes[y]))
      // The back: the tall run reaching furthest from the camera.
      let back = -1
      let far = -Infinity
      for (const i of tall) {
        const r = this.runs[i]
        const d = -Math.min(r.a[0] * toCamera[0] + r.a[1] * toCamera[1], r.b[0] * toCamera[0] + r.b[1] * toCamera[1])
        if (d > far) {
          far = d
          back = i
        }
      }
      const keep = back < 0 ? -1 : root(back)
      for (const i of nodes) want[i] = root(i) === keep ? 1 : 0
    }
    const step = clamp01(dt * EASE)
    const vectors = this.uniforms.uWallAllow.value
    for (let i = 0; i < n; i++) {
      this.allow[i] += (want[i] - this.allow[i]) * step
      vectors[i >> 2].setComponent(i & 3, this.allow[i])
    }
  }
}

// The runs kept for each set of wall uniforms, so the rooms can number
// theirs and the provider can settle them.
export const wallRunsOf = new WeakMap<WallUniforms, WallRuns>()

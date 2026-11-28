import { outsideStretches } from '#/geometry/roomWalls.ts'
import type { Point } from '#/types.ts'
import { BufferGeometry, Float32BufferAttribute } from 'three'

// How thick a fence's boards stand, just inside the edge of its space.
export const FENCE_THICKNESS_M = 0.04
// Its posts: square, a little taller than the boards, at each end of a run
// and every so often along it.
const POST_M = 0.09
const POST_OVER_M = 0.05
const POST_EVERY_M = 1.83

// A fence round an outside space, on the edges it is set on: boards up to
// each edge's height, and posts. Nothing goes along a stretch where a room
// of the home stands, as its wall is there already. The outline runs
// counter clockwise and `heights` follows its edges, a height of zero or
// less for no fence. Texture coordinates are in meters, along the run and
// up from the ground, so the board pattern keeps its size.
export function fenceGeometry(outline: Point[], heights: number[], others: Point[][], gap: number) {
  const position: number[] = []
  const normal: number[] = []
  const uv: number[] = []
  // What the walls' shader reads to sink a wall facing the camera, so the
  // fence sinks with them: the way the run faces out, which corners are on
  // top and how high they may stand, and the faces on top, which keep their
  // pattern as they are.
  const wallOwn: number[] = []
  const wallRise: number[] = []
  const wallShape: number[] = []
  const wallExtra: number[] = []
  // Of the box being drawn: the way it faces out and its full height.
  let faceOut: Point = [0, 1]
  let full = 0

  // One flat face from four corners, given as plan points with heights.
  const quad = (c: [number, number, number][], n: [number, number, number], t: [number, number][]) => {
    // Wound to face `n`, so the lit side is the one looking out along it.
    const e1 = [c[1][0] - c[0][0], c[1][1] - c[0][1], c[1][2] - c[0][2]]
    const e2 = [c[2][0] - c[0][0], c[2][1] - c[0][1], c[2][2] - c[0][2]]
    const facing =
      (e1[1] * e2[2] - e1[2] * e2[1]) * n[0] +
        (e1[2] * e2[0] - e1[0] * e2[2]) * n[1] +
        (e1[0] * e2[1] - e1[1] * e2[0]) * n[2] >=
      0
    for (const k of facing ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
      position.push(c[k][0], c[k][2], -c[k][1])
      normal.push(n[0], n[2], -n[1])
      uv.push(t[k][0], t[k][1])
      const top = c[k][2] > 0
      wallOwn.push(faceOut[0], faceOut[1], 1)
      wallRise.push(0, 0, 0)
      wallShape.push(top ? 1 : 0, 0, 0, full)
      wallExtra.push(-1, n[2] > 0.5 ? 1 : 0)
    }
  }

  // A box standing on the ground, along `u` from `p` for `len`, `depth` into
  // the space along `inward`, and `h` high. Its long sides take the pattern
  // along the run, starting at `s`.
  const box = (p: Point, u: Point, inward: Point, len: number, depth: number, h: number, s: number) => {
    faceOut = [-inward[0], -inward[1]]
    full = h
    const at = (t: number, d: number): Point => [p[0] + u[0] * t + inward[0] * d, p[1] + u[1] * t + inward[1] * d]
    const a0 = at(0, 0)
    const a1 = at(len, 0)
    const b0 = at(0, depth)
    const b1 = at(len, depth)
    const out: [number, number, number] = [-inward[0], -inward[1], 0]
    const inn: [number, number, number] = [inward[0], inward[1], 0]
    // Outside face, seen from beyond the space, and the inside face.
    quad(
      [
        [a1[0], a1[1], 0],
        [a0[0], a0[1], 0],
        [a0[0], a0[1], h],
        [a1[0], a1[1], h],
      ],
      out,
      [
        [s + len, 0],
        [s, 0],
        [s, h],
        [s + len, h],
      ],
    )
    quad(
      [
        [b0[0], b0[1], 0],
        [b1[0], b1[1], 0],
        [b1[0], b1[1], h],
        [b0[0], b0[1], h],
      ],
      inn,
      [
        [s, 0],
        [s + len, 0],
        [s + len, h],
        [s, h],
      ],
    )
    // The top, and both ends.
    quad(
      [
        [a0[0], a0[1], h],
        [b0[0], b0[1], h],
        [b1[0], b1[1], h],
        [a1[0], a1[1], h],
      ],
      [0, 0, 1],
      [
        [s, 0],
        [s, depth],
        [s + len, depth],
        [s + len, 0],
      ],
    )
    quad(
      [
        [b0[0], b0[1], 0],
        [b0[0], b0[1], h],
        [a0[0], a0[1], h],
        [a0[0], a0[1], 0],
      ],
      [-u[0], -u[1], 0],
      [
        [0, 0],
        [0, h],
        [depth, h],
        [depth, 0],
      ],
    )
    quad(
      [
        [a1[0], a1[1], 0],
        [a1[0], a1[1], h],
        [b1[0], b1[1], h],
        [b1[0], b1[1], 0],
      ],
      [u[0], u[1], 0],
      [
        [0, 0],
        [0, h],
        [depth, h],
        [depth, 0],
      ],
    )
  }

  const n = outline.length
  let start = 0
  for (let i = 0; i < n; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % n]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const h = heights[i] ?? 0
    const s = start
    start += len
    if (h <= 0 || len < 1e-3) continue
    const u: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
    const inward: Point = [-u[1], u[0]]
    for (const [s0, s1] of outsideStretches(a, b, others, gap)) {
      const from: Point = [a[0] + u[0] * s0, a[1] + u[1] * s0]
      box(from, u, inward, s1 - s0, FENCE_THICKNESS_M, h, s + s0)
      // Posts at both ends and evenly between, centred on the boards.
      const runs = Math.max(1, Math.round((s1 - s0) / POST_EVERY_M))
      for (let k = 0; k <= runs; k++) {
        const t = s0 + ((s1 - s0) * k) / runs
        const along = Math.min(Math.max(t - POST_M / 2, s0), s1 - POST_M)
        const p: Point = [
          a[0] + u[0] * along + inward[0] * ((FENCE_THICKNESS_M - POST_M) / 2),
          a[1] + u[1] * along + inward[1] * ((FENCE_THICKNESS_M - POST_M) / 2),
        ]
        // The post may stand a little outside the edge, on the far side.
        box(p, u, inward, Math.min(POST_M, s1 - s0), POST_M, h + POST_OVER_M, s + along)
      }
    }
  }
  if (!position.length) return null
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normal, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geometry.setAttribute('wallOwn', new Float32BufferAttribute(wallOwn, 3))
  geometry.setAttribute('wallRise', new Float32BufferAttribute(wallRise, 3))
  geometry.setAttribute('wallShape', new Float32BufferAttribute(wallShape, 4))
  geometry.setAttribute('wallExtra', new Float32BufferAttribute(wallExtra, 2))
  return geometry
}

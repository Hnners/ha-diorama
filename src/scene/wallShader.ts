import type { Material } from 'three'
import { MeshDepthMaterial, MeshDistanceMaterial, RGBADepthPacking, Vector2, Vector4 } from 'three'

// The walls' heights, set on the graphics card from the camera on every
// frame. Each corner of a wall's top carries, from roomWalls.ts, which way its
// own wall faces when that is the outside of the home, the tall wall it rises
// to near a corner, and how high it stands when only that one is tall. A wall
// facing away from the camera rises to full height, one facing it sinks to
// the low height, and in between it stands part way, so the walls rise and
// sink as the view turns.

export type WallUniforms = {
  uWallToCamera: { value: Vector2 }
  uWallLow: { value: number }
  uWallHigh: { value: number }
  // How much each run of the home's outside may stand tall, four to a
  // vector, by the number the run is given in wallRuns.ts: only the runs
  // joined to the back of the home do, so no piece stands tall on its own.
  uWallAllow: { value: Vector4[] }
}

// How many runs of outside wall the allowances have room for.
export const WALL_RUNS = 256

export const wallUniforms = (low: number, high: number): WallUniforms => ({
  uWallToCamera: { value: new Vector2(0, 1) },
  uWallLow: { value: low },
  uWallHigh: { value: high },
  uWallAllow: { value: Array.from({ length: WALL_RUNS / 4 }, () => new Vector4(1, 1, 1, 1)) },
})

// How much a wall faces the camera before it starts to sink, and over how
// much of a turn it goes from full height to low: the back and the sides of
// the home stand tall, the front sinks.
export const FACING = 0.3
export const SPREAD = 0.15

const HEAD = /* glsl */ `
attribute vec3 wallOwn;
attribute vec3 wallRise;
attribute vec4 wallShape;
attribute vec2 wallExtra;
attribute vec2 wallRuns;
uniform vec2 uWallToCamera;
uniform vec4 uWallAllow[${WALL_RUNS / 4}];
uniform float uWallLow;
uniform float uWallHigh;
varying float vWallKeep;
// How much a run may stand tall, all of it for none.
float wallAllowOf(float i) {
  if (i < -0.5) return 1.0;
  int k = int(i + 0.5);
  vec4 v = uWallAllow[k / 4];
  int c = k - (k / 4) * 4;
  return c == 0 ? v.x : c == 1 ? v.y : c == 2 ? v.z : v.w;
}
float wallRiseOf(vec3 e) {
  if (e.z < 0.5) return 0.0;
  return 1.0 - smoothstep(${(FACING - SPREAD).toFixed(3)}, ${(FACING + SPREAD).toFixed(3)}, dot(e.xy, uWallToCamera));
}
`

// The height of this corner's top, and what is kept of a lintel.
const TOP = /* glsl */ `
  float wallRo = wallRiseOf(vec3(wallOwn.xy, min(wallOwn.z, 1.0))) * wallAllowOf(wallRuns.x);
  float wallRn = wallRiseOf(wallRise) * wallAllowOf(wallRuns.y);
  // A short wall between two tall ones stands only as tall as the lower.
  float wallTop = wallOwn.z > 1.5
    ? mix(uWallLow, uWallHigh, min(wallRo, wallRn))
    : mix(mix(uWallLow, wallShape.y, wallRn), uWallHigh, wallRo);
  vWallKeep = wallExtra.x < 0.0 ? 1.0 : step(wallExtra.x + 0.005, wallTop);
`

// The texture coordinates the maps read: up a face, the height the corner
// stands at now. The faces on top keep theirs, across the wall.
const MAPS = [
  'ALPHAMAP_UV',
  'ANISOTROPYMAP_UV',
  'AOMAP_UV',
  'BUMPMAP_UV',
  'CLEARCOATMAP_UV',
  'CLEARCOAT_NORMALMAP_UV',
  'CLEARCOAT_ROUGHNESSMAP_UV',
  'DISPLACEMENTMAP_UV',
  'EMISSIVEMAP_UV',
  'IRIDESCENCEMAP_UV',
  'IRIDESCENCE_THICKNESSMAP_UV',
  'LIGHTMAP_UV',
  'MAP_UV',
  'METALNESSMAP_UV',
  'NORMALMAP_UV',
  'ROUGHNESSMAP_UV',
  'SHEEN_COLORMAP_UV',
  'SHEEN_ROUGHNESSMAP_UV',
  'SPECULARMAP_UV',
  'SPECULAR_COLORMAP_UV',
  'SPECULAR_INTENSITYMAP_UV',
  'THICKNESSMAP_UV',
  'TRANSMISSIONMAP_UV',
]
const UVS = /* glsl */ `
  vec2 wallUv = uv;
  if (wallShape.x > 0.5 && wallExtra.y < 0.5) wallUv.y = clamp(wallTop, wallShape.z, wallShape.w);
${MAPS.map(m => `#ifdef ${m}\n#undef ${m}\n#define ${m} wallUv\n#endif`).join('\n')}
`

function patch(material: Material, uniforms: WallUniforms, normals: boolean) {
  const before = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer)
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${HEAD}\nvoid main() {\n${TOP}`)
      // A pattern up a wall's face is measured from its foot in meters, so
      // as the wall sinks the bricks stay their size and are cut off at the
      // top, rather than squeezed into it. The maps read this instead.
      .replace('#include <uv_vertex>', `${UVS}\n#include <uv_vertex>`)
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  if (wallShape.x > 0.5) transformed.y = clamp(wallTop, wallShape.z, wallShape.w);',
      )
    if (normals)
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        // A top sloping down a rounded foot tips level as its wall rises.
        '#include <beginnormal_vertex>\n  if (wallExtra.y > 0.5) objectNormal = normalize(mix(vec3(0.0, 1.0, 0.0), objectNormal, wallRn * (1.0 - wallRo)));',
      )
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'varying float vWallKeep;\nvoid main() {\n  if (vWallKeep < 0.5) discard;',
    )
  }
  const key = material.customProgramCacheKey.bind(material)
  material.customProgramCacheKey = () => `${key()}|diorama-walls`
  material.needsUpdate = true
}

// Has the wall materials, and the ones their shadows are drawn with, set
// their heights from the camera. A material already set is left as it is.
export function animateWalls(
  mesh: { material: Material | Material[]; customDepthMaterial?: Material; customDistanceMaterial?: Material },
  uniforms: WallUniforms,
) {
  for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    if (m.userData.wallUniforms === uniforms) continue
    m.userData.wallUniforms = uniforms
    patch(m, uniforms, true)
  }
  if (mesh.customDepthMaterial?.userData.wallUniforms !== uniforms) {
    const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking })
    depth.userData.wallUniforms = uniforms
    patch(depth, uniforms, false)
    mesh.customDepthMaterial = depth
    const distance = new MeshDistanceMaterial()
    distance.userData.wallUniforms = uniforms
    patch(distance, uniforms, false)
    mesh.customDistanceMaterial = distance
  }
}

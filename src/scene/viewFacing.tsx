import { wallUniforms } from '#/scene/wallShader.ts'
import { WallRuns, wallRunsOf } from '#/scene/wallRuns.ts'
import { WallHeights } from '#/scene/walls.ts'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import { Vector3 } from 'three'

// Keeps the walls' heights on the graphics card following the camera, so
// the tall walls at the back rise and sink as the view turns, with nothing
// built again. Off, it gives nothing and follows nothing.
export default function WallHeightsProvider({
  tall,
  children,
}: {
  // The low and the full height, while some walls stand tall.
  tall: { low: number; high: number } | null
  children: ReactNode
}) {
  const uniforms = useMemo(() => {
    const u = wallUniforms(tall?.low ?? 1, tall?.high ?? 1)
    wallRunsOf.set(u, new WallRuns(u))
    return u
  }, [tall?.low, tall?.high])
  const look = useRef(new Vector3())
  useFrame(({ camera }, dt) => {
    if (!tall) return
    camera.getWorldDirection(look.current)
    // Toward the camera, level, on the plan: against the way it looks, and
    // world z is plan -y.
    const x = -look.current.x
    const y = look.current.z
    const l = Math.hypot(x, y)
    if (l > 1e-6) uniforms.uWallToCamera.value.set(x / l, y / l)
    // Only the tall walls joined to the back of the home stand.
    const to = uniforms.uWallToCamera.value
    wallRunsOf.get(uniforms)?.update([to.x, to.y], Math.min(dt, 0.1))
  })
  return <WallHeights.Provider value={tall ? uniforms : null}>{children}</WallHeights.Provider>
}

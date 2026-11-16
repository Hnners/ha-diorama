import { FACING_STEP_DEG, ViewFacing } from '#/scene/walls.ts'
import type { Point } from '#/types.ts'
import { useFrame } from '@react-three/fiber'
import { useRef, useState, type ReactNode } from 'react'
import { Vector3 } from 'three'

// Follows which way the camera looks across the plan, in steps, for the
// walls that stand tall at the back of the home. Off, it gives null and
// follows nothing.
export default function ViewFacingProvider({ on, children }: { on: boolean; children: ReactNode }) {
  const [facing, setFacing] = useState<Point | null>(null)
  const step = useRef<number | null>(null)
  const look = useRef(new Vector3())
  useFrame(({ camera }) => {
    if (!on) {
      if (step.current !== null) {
        step.current = null
        setFacing(null)
      }
      return
    }
    camera.getWorldDirection(look.current)
    // Toward the camera, level: against the way it looks. World z is plan -y.
    const angle = Math.atan2(look.current.z, -look.current.x)
    const k = Math.round((angle * 180) / Math.PI / FACING_STEP_DEG)
    if (k === step.current) return
    step.current = k
    const a = (k * FACING_STEP_DEG * Math.PI) / 180
    setFacing([Math.cos(a), Math.sin(a)])
  })
  return <ViewFacing.Provider value={on ? facing : null}>{children}</ViewFacing.Provider>
}

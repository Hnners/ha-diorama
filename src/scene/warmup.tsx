import { onSurfacesArrive } from '#/materials/textures.ts'
import { warm } from '#/scene/warm.ts'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

// The longest the first frame waits for its shaders. A screen whose browser
// cannot build them in the background, or that takes long, draws anyway.
const WARMUP_LIMIT_MS = 3000

// Builds the shaders of everything in the scene before the first frame, in
// the background where the browser can (most can), instead of in the middle
// of drawing it. It asks warm.ts for a change that changes nothing, so the
// shaders come out keyed as the frame will look for them: the shadow maps',
// and the scene's into the effects' buffer. The page stays free while they
// build, so the dashboard around the card can still be used.
export default function Warmup({ ready, onReady }: { ready: boolean; onReady: () => void }) {
  const get = useThree(s => s.get)
  const invalidate = useThree(s => s.invalidate)
  useEffect(() => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      onReady()
    }
    const limit = setTimeout(finish, WARMUP_LIMIT_MS)
    let cancel = () => {}
    // One tick first, so what mounts with the canvas is in the scene and
    // the effects have said whether they finish the frame.
    const start = setTimeout(() => {
      cancel = warm(get, {}, { apply: () => {}, revert: () => {}, commit: finish, alone: true })
    }, 0)
    return () => {
      clearTimeout(limit)
      clearTimeout(start)
      cancel()
    }
    // Once per canvas: what comes later builds as it comes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // A floor or wall whose pattern arrives after the frame it was first drawn
  // in is drawn again with it.
  useEffect(() => onSurfacesArrive(invalidate), [invalidate])
  // The loop only draws on demand, so the first frame is asked for once the
  // loop runs.
  useEffect(() => {
    if (ready) invalidate()
  }, [ready, invalidate])
  return null
}

// three ships meshoptimizer's simplifier without types. Only what the model
// editor uses is declared.
declare module 'three/examples/jsm/libs/meshopt_simplifier.module.js' {
  export const MeshoptSimplifier: {
    ready: Promise<void>
    simplify(
      indices: Uint32Array,
      positions: Float32Array,
      stride: number,
      targetIndexCount: number,
      targetError: number,
      flags?: ('LockBorder' | 'Sparse' | 'ErrorAbsolute' | 'Prune')[],
    ): [Uint32Array, number]
    compactMesh(indices: Uint32Array): [Uint32Array, number]
  }
}

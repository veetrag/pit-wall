export type Rng = () => number

// mulberry32 — fast, seedable, good distribution
export function createRng(seed: number): Rng {
  let s = seed >>> 0
  return function () {
    s += 0x6D2B79F5
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Box-Muller transform: two independent N(0,1) samples per call
export function gaussianPair(rng: Rng): [number, number] {
  const u1 = Math.max(rng(), 1e-10)
  const u2 = rng()
  const mag = Math.sqrt(-2 * Math.log(u1))
  const theta = 2 * Math.PI * u2
  return [mag * Math.cos(theta), mag * Math.sin(theta)]
}

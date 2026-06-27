import type { CompoundSpec } from './types'

// Formula: offset + lin*age + pen * max(0, age - cliff)^2
export function tyreDelta(spec: CompoundSpec, ageLaps: number): number {
  const postCliff = Math.max(0, ageLaps - spec.cliff)
  return spec.offset + spec.lin * ageLaps + spec.pen * postCliff * postCliff
}

// 0 = fresh, 1 = at cliff, >1 = past cliff
export function tyreCliffFraction(spec: CompoundSpec, ageLaps: number): number {
  return spec.cliff > 0 ? ageLaps / spec.cliff : 0
}

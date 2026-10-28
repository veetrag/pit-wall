import { describe, it, expect } from 'vitest'
import { sectorArcShares, CIRCUIT_PATHS, V2_CIRCUITS } from '@data/circuitPaths'
import { loadGameData } from '@data/validators'

describe('sectorArcShares', () => {
  it('splits a square loop by its boundaries', () => {
    const square = { points: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], sectorBoundaries: [1, 2], pitEntry: [0, 0], pitExit: [0, 0] }
    const [a, b, c] = sectorArcShares(square)
    expect(a).toBeCloseTo(0.25, 12); expect(b).toBeCloseTo(0.25, 12); expect(c).toBeCloseTo(0.5, 12)
  })
  it('sums to 1 for every shipped circuit', () => {
    for (const id of Object.keys(CIRCUIT_PATHS)) {
      const s = sectorArcShares(CIRCUIT_PATHS[id]!)
      expect(s[0] + s[1] + s[2], id).toBeCloseTo(1, 12)
    }
  })
})

describe('pipeline-authored circuits', () => {
  // Guards the loops below against silently iterating nothing.
  it('registers the pipeline-authored circuits', () => {
    expect([...V2_CIRCUITS]).toEqual(['lantern_quay', 'mesa_roja'])
  })
  // Legacy circuits predate the rule (monsoon_bay is 0.11 off); it binds circuits
  // authored by docs/CIRCUIT-AUTHORING.md only. The canvas tweens a dot through a
  // sector in sectorBase time, so a mismatch shows as a car speeding up and
  // slowing down on screen.
  it('SECTOR ARC SHARES MATCH sectorBase SHARES WITHIN 0.03', () => {
    const { circuits } = loadGameData()
    for (const id of V2_CIRCUITS) {
      const c = circuits[id]!
      const total = c.sectorBase[0] + c.sectorBase[1] + c.sectorBase[2]
      const arc = sectorArcShares(CIRCUIT_PATHS[id]!)
      for (let s = 0; s < 3; s++) {
        expect(Math.abs(arc[s]! - c.sectorBase[s]! / total), `${id} sector ${s + 1}`).toBeLessThanOrEqual(0.03)
      }
    }
  })
  it('sum sensitivities to 0.95-1.05 and keep a sector at or above the factor floor', () => {
    const { circuits, tuning } = loadGameData()
    for (const id of V2_CIRCUITS) {
      const c = circuits[id]!
      const sum = (v: readonly number[]) => v.reduce((a, b) => a + b, 0)
      expect(sum(c.carSensitivity), id).toBeGreaterThanOrEqual(0.95)
      expect(sum(c.carSensitivity), id).toBeLessThanOrEqual(1.05)
      expect(sum(c.driverSensitivity), id).toBeGreaterThanOrEqual(0.95)
      expect(sum(c.driverSensitivity), id).toBeLessThanOrEqual(1.05)
      expect(Math.max(...c.overtakingFactor), id).toBeGreaterThanOrEqual(tuning.overtaking.factorFloor)
    }
  })
})

import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'
import { CIRCUIT_ORDER } from '@state/raceStore'
import { TOTAL_RACES } from '@state/seasonStore'

describe('calendar', () => {
  it('has an entry for every circuit in the order', () => {
    const { circuits } = loadGameData()
    for (const id of CIRCUIT_ORDER) expect(circuits[id]).toBeTruthy()
  })

  it('never repeats a circuit', () => {
    expect(new Set(CIRCUIT_ORDER).size).toBe(CIRCUIT_ORDER.length)
  })

  it('has exactly one circuit per round', () => {
    expect(CIRCUIT_ORDER.length).toBe(TOTAL_RACES)
  })

  it('includes silverpark', () => {
    expect(loadGameData().circuits['silverpark']).toBeTruthy()
  })

  // carSensitivity/driverSensitivity are currently dead data: lapModel.ts takes
  // per-sector weighting from tuning.carPerformance.sectorSplit /
  // tuning.driverPerformance.sectorSplit (global, identical for every circuit),
  // not from these per-circuit fields. So these sums are not normalised
  // weightings today, just flavour text encoded as numbers -- e.g.
  // harbour_lights' asymmetry (car 0.78 / driver 1.36) is deliberate intent
  // ("street circuit: driver matters more than car"), not a bug. The wide band
  // below only catches typos / order-of-magnitude errors on existing circuits.
  it('keeps sector sensitivities within a sane order of magnitude', () => {
    const { circuits } = loadGameData()
    for (const [id, c] of Object.entries(circuits)) {
      const car = c.carSensitivity.reduce((a, b) => a + b, 0)
      const drv = c.driverSensitivity.reduce((a, b) => a + b, 0)
      expect(car, `${id} carSensitivity`).toBeGreaterThanOrEqual(0.75)
      expect(car, `${id} carSensitivity`).toBeLessThanOrEqual(1.40)
      expect(drv, `${id} driverSensitivity`).toBeGreaterThanOrEqual(0.75)
      expect(drv, `${id} driverSensitivity`).toBeLessThanOrEqual(1.40)
    }
  })

  // Circuits authored by this plan (twelve-race-calendar) are deliberately
  // normalised to sum to ~1.0, unlike the legacy circuits above. Guarded on
  // existence so this doesn't fail before later tasks in the plan land theirs.
  const PLAN_CIRCUITS = ['silverpark', 'estoril_bay', 'kaido', 'altiplano']

  it('normalises sector sensitivities to ~1.0 for plan-authored circuits', () => {
    const { circuits } = loadGameData()
    for (const id of PLAN_CIRCUITS) {
      const c = circuits[id]
      if (!c) continue
      const car = c.carSensitivity.reduce((a, b) => a + b, 0)
      const drv = c.driverSensitivity.reduce((a, b) => a + b, 0)
      expect(car, `${id} carSensitivity`).toBeGreaterThan(0.95)
      expect(car, `${id} carSensitivity`).toBeLessThan(1.05)
      expect(drv, `${id} driverSensitivity`).toBeGreaterThan(0.95)
      expect(drv, `${id} driverSensitivity`).toBeLessThan(1.05)
    }
  })
})

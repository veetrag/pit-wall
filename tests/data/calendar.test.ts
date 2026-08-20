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

  it('weights sector sensitivities to roughly 1.0', () => {
    const { circuits } = loadGameData()
    for (const [id, c] of Object.entries(circuits)) {
      const car = c.carSensitivity.reduce((a, b) => a + b, 0)
      const drv = c.driverSensitivity.reduce((a, b) => a + b, 0)
      expect(car, `${id} carSensitivity`).toBeGreaterThan(0.95)
      expect(car, `${id} carSensitivity`).toBeLessThan(1.05)
      expect(drv, `${id} driverSensitivity`).toBeGreaterThan(0.95)
      expect(drv, `${id} driverSensitivity`).toBeLessThan(1.05)
    }
  })
})

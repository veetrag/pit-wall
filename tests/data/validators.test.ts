import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'

describe('loadGameData', () => {
  it('loads and validates all data files without throwing', () => {
    const data = loadGameData()
    expect(data.tuning.carPerformance.deltaPerRating).toBe(0.22)
    expect(data.compounds.S.cliff).toBe(12)
    expect(data.circuits['silverpark']!.laps).toBe(30)
    expect(data.cars.teams).toHaveLength(5)
    expect(data.drivers.drivers).toHaveLength(10)
  })

  it('every driver teamId references a valid team', () => {
    const data = loadGameData()
    const teamIds = new Set(data.cars.teams.map(t => t.id))
    for (const d of data.drivers.drivers) {
      expect(teamIds.has(d.teamId), `driver ${d.id} has unknown teamId ${d.teamId}`).toBe(true)
    }
  })

  it('all strategy teamIds reference valid teams', () => {
    const data = loadGameData()
    const teamIds = new Set(data.cars.teams.map(t => t.id))
    for (const s of data.strategies.defaults) {
      expect(teamIds.has(s.teamId)).toBe(true)
    }
  })

  it('sectorBase arrays all have length 3', () => {
    const data = loadGameData()
    for (const [id, circuit] of Object.entries(data.circuits) as [string, { sectorBase: number[] }][]) {
      expect(circuit.sectorBase, `${id} sectorBase`).toHaveLength(3)
    }
  })

  it('compound keys are exactly S, M, H, I, W', () => {
    const data = loadGameData()
    expect(Object.keys(data.compounds).sort()).toEqual(['H', 'I', 'M', 'S', 'W'])
  })
})

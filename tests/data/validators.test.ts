import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'

describe('loadGameData', () => {
  it('loads and validates all data files without throwing', () => {
    const data = loadGameData()
    expect(data.tuning.carPerformance.deltaPerRating).toBe(0.22)
    expect(data.compounds['S']!.cliff).toBe(10)
    expect(data.circuits['bengaluru']!.laps).toBe(56)
    expect(data.cars.teams).toHaveLength(10)
    expect(data.drivers.drivers).toHaveLength(20)
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

  it('compound keys include S, M, H, I, W', () => {
    const data = loadGameData()
    const keys = Object.keys(data.compounds).sort()
    expect(keys).toContain('S')
    expect(keys).toContain('M')
    expect(keys).toContain('H')
    expect(keys).toContain('I')
    expect(keys).toContain('W')
  })
})

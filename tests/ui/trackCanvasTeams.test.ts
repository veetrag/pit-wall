import { describe, it, expect } from 'vitest'
import cars from '@data/cars.json'
import { TEAM_HEX } from '../../src/canvas/teamHex'

describe('TrackCanvas team colours', () => {
  it('TEAM_HEX agrees with cars.json colorPrimary for every team', () => {
    const teams = (cars as { teams: { id: string; colorPrimary: string }[] }).teams
    expect(teams.length).toBeGreaterThan(0)
    for (const t of teams) expect(TEAM_HEX[t.id], t.id).toBe(t.colorPrimary)
  })
})

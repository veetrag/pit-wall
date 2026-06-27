import { describe, it, expect, beforeEach } from 'vitest'
import { useRaceStore } from '@state/raceStore'

function getStore() {
  return useRaceStore.getState()
}

describe('raceStore', () => {
  beforeEach(() => {
    useRaceStore.setState({
      phase: 'idle', config: null, raceState: null,
      projectionResult: null, pitPanelOpen: false, rng: null,
    })
  })

  it('starts in idle phase', () => {
    expect(getStore().phase).toBe('idle')
    expect(getStore().raceState).toBeNull()
  })

  it('startRace transitions to racing and creates raceState', () => {
    getStore().startRace()
    expect(getStore().phase).toBe('racing')
    expect(getStore().raceState).not.toBeNull()
    expect(getStore().raceState!.cars.length).toBeGreaterThan(0)
  })

  it('step advances the sector', () => {
    getStore().startRace()
    const s0 = getStore().raceState!.sector
    getStore().step()
    const s1 = getStore().raceState!.sector
    expect(s1).toBe((s0 + 1) % 3)
  })

  it('setPaceMode changes the player car pace mode', () => {
    getStore().startRace()
    getStore().setPaceMode('push')
    const player = getStore().raceState!.cars.find(c => c.isPlayer)!
    expect(player.paceMode).toBe('push')
  })

  it('pitNow applies stop time and resets tyreAge', () => {
    getStore().startRace()
    const before = getStore().raceState!.cars.find(c => c.isPlayer)!.raceTime
    getStore().pitNow('H')
    const after = getStore().raceState!.cars.find(c => c.isPlayer)!
    expect(after.raceTime).toBeGreaterThan(before)
    expect(after.tyreAge).toBe(0)
    expect(after.compound).toBe('H')
  })

  it('phase transitions to finished when all laps complete', () => {
    getStore().startRace()
    const total = getStore().raceState!.totalLaps * 3
    for (let i = 0; i < total; i++) getStore().step()
    expect(getStore().phase).toBe('finished')
  })
})

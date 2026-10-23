import { describe, it, expect, beforeEach } from 'vitest'
import { useRaceStore } from '@state/raceStore'

describe('an automatic plan stop on the HUD', () => {
  beforeEach(() => {
    useRaceStore.getState().resetRace()
    useRaceStore.getState().startSeasonRace('d_voss', 4242, 'bengaluru', 'rookie',
      { startCompound: 'M', plannedStops: [{ lap: 3, compound: 'H' }] }, null, undefined, true)
    useRaceStore.setState({ phase: 'racing' })
  })

  it('shows the car in the pit lane, like a manual stop', () => {
    let sawPit = false
    for (let i = 0; i < 30 && !sawPit; i++) {
      useRaceStore.getState().step()
      sawPit = useRaceStore.getState().playerInPit
    }
    expect(sawPit).toBe(true)
  })

  it('an open panel holds the plan stop (1.6.2); closed, the stop happens, and raises the alert', () => {
    useRaceStore.getState().openPitPanel()
    expect(useRaceStore.getState().pitPanelOpen).toBe(true)
    for (let i = 0; i < 30; i++) useRaceStore.getState().step()
    expect(useRaceStore.getState().playerInPit).toBe(false)
    useRaceStore.getState().updateProjection('H')
    useRaceStore.getState().closePitPanel()
    let stopped = false
    for (let i = 0; i < 30 && !stopped; i++) {
      useRaceStore.getState().step()
      stopped = useRaceStore.getState().playerInPit
    }
    expect(stopped).toBe(true)
    expect(useRaceStore.getState().pitPanelOpen).toBe(false)
    expect(useRaceStore.getState().projectionResult).toBeNull()
    expect(useRaceStore.getState().hudAlerts.some(a => a.message.includes('plan stop'))).toBe(true)
  })
})

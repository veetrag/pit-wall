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
})

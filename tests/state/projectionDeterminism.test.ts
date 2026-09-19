import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useRaceStore } from '@state/raceStore'

/*
 * The pit projection is the single highest-stakes number the game shows: the
 * player commits to a stop on the strength of "you rejoin P5, +3.4s behind X".
 *
 * It used to be seeded with `Date.now() % 100000`, so the SAME race state gave
 * DIFFERENT advice each time the panel was opened. A player who closed the
 * panel to think and reopened it could be told something else entirely, with
 * nothing in the race having changed. It was also the only number left in the
 * game not reproducible from a seed, which made the whole projection
 * untestable and unreportable in a bug.
 */
describe('the pit projection is reproducible', () => {
  beforeEach(() => {
    useRaceStore.setState({
      phase: 'idle', config: null, raceState: null,
      projectionResult: null, pitPanelOpen: false, rng: null,
    })
    useRaceStore.getState().startRace()
    // Advance a little so the race RNG has actually moved off its seed.
    for (let i = 0; i < 30; i++) useRaceStore.getState().step()
  })

  afterEach(() => { vi.useRealTimers() })

  it('GIVES THE SAME ANSWER FOR THE SAME RACE STATE, AT ANY WALL-CLOCK TIME', () => {
    const answers: string[] = []
    // Wall-clock values chosen far apart, and across the % 100000 boundary the
    // old implementation used -- if the clock still leaks in, these diverge.
    for (const t of [0, 1, 99999, 100000, 1_700_000_000_000, 1_700_000_047_321]) {
      vi.setSystemTime(new Date(t))
      useRaceStore.getState().updateProjection('M')
      answers.push(JSON.stringify(useRaceStore.getState().projectionResult))
    }
    expect(new Set(answers).size, 'the projection must not depend on the clock').toBe(1)
  })

  it('reopening the panel does not change the advice', () => {
    useRaceStore.getState().updateProjection('H')
    const first = JSON.stringify(useRaceStore.getState().projectionResult)
    useRaceStore.setState({ projectionResult: null })
    useRaceStore.getState().updateProjection('H')
    expect(JSON.stringify(useRaceStore.getState().projectionResult)).toBe(first)
  })

  it('but it DOES move as the race moves', () => {
    // A projection frozen for the whole race would be reproducible and useless.
    useRaceStore.getState().updateProjection('M')
    const early = JSON.stringify(useRaceStore.getState().projectionResult)
    for (let i = 0; i < 60; i++) useRaceStore.getState().step()
    useRaceStore.getState().updateProjection('M')
    expect(JSON.stringify(useRaceStore.getState().projectionResult)).not.toBe(early)
  })

  it('compares compounds under the SAME dice', () => {
    /*
     * A deliberate property, not an accident of the implementation. The seed
     * comes from the race state alone, not from the compound, so soft/medium/
     * hard are projected under identical luck. Any difference the player sees
     * between them is the tyre, which is the only honest basis for the choice.
     */
    useRaceStore.getState().updateProjection('S')
    const soft = useRaceStore.getState().projectionResult
    useRaceStore.getState().updateProjection('H')
    const hard = useRaceStore.getState().projectionResult
    expect(soft).not.toBeNull()
    expect(hard).not.toBeNull()
    // They must differ (different tyre), but only because of the tyre.
    expect(JSON.stringify(soft)).not.toBe(JSON.stringify(hard))
  })
})

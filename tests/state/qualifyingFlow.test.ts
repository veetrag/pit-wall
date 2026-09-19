import { describe, it, expect, beforeEach } from 'vitest'
import { useSeasonStore } from '@state/seasonStore'
import { buildScenarioConfig } from '@state/buildRaceConfig'

describe('qualifying flow', () => {
  beforeEach(() => {
    useSeasonStore.setState({ phase: 'race_setup', qualifyingResult: null })
  })

  it('race_setup CONFIRMS INTO qualifying, NOT racing', () => {
    useSeasonStore.getState().confirmRaceSetup(undefined, null)
    expect(useSeasonStore.getState().phase).toBe('qualifying')
  })

  it('runQualifyingSession STORES A RESULT AND STAYS PUT', () => {
    useSeasonStore.getState().confirmRaceSetup(undefined, null)
    useSeasonStore.getState().runQualifyingSession({ compound: 'S', attack: 'attack' }, 'rookie')
    const { phase, qualifyingResult } = useSeasonStore.getState()
    expect(phase, 'the player reads their grid slot before racing').toBe('qualifying')
    expect(qualifyingResult).not.toBeNull()
    expect(qualifyingResult!.order.length).toBeGreaterThan(1)
  })

  it('startRaceFromQualifying MOVES TO racing', () => {
    useSeasonStore.getState().confirmRaceSetup(undefined, null)
    useSeasonStore.getState().runQualifyingSession({ compound: 'S', attack: 'attack' }, 'rookie')
    useSeasonStore.getState().startRaceFromQualifying()
    expect(useSeasonStore.getState().phase).toBe('racing')
  })

  it('IS DETERMINISTIC ACROSS RE-ENTRY -- a bad lap cannot be rerolled', () => {
    /*
     * qualifyingSeed derives from the race seed, so backing out to race_setup
     * and re-qualifying gives the same session. This is deliberate: it is the
     * same determinism discipline the rest of the game keeps, and it is only
     * fair because the error chance is shown before the player commits.
     */
    const call = { compound: 'S', attack: 'attack' } as const
    useSeasonStore.getState().confirmRaceSetup(undefined, null)
    useSeasonStore.getState().runQualifyingSession(call, 'rookie')
    const first = useSeasonStore.getState().qualifyingResult!

    useSeasonStore.getState().toRaceSetup()
    expect(useSeasonStore.getState().qualifyingResult, 'stale result must be cleared').toBeNull()
    useSeasonStore.getState().confirmRaceSetup(undefined, null)
    useSeasonStore.getState().runQualifyingSession(call, 'rookie')

    expect(useSeasonStore.getState().qualifyingResult).toEqual(first)
  })

  it('SCENARIOS NEVER GET A GRID ORDER', () => {
    // A scenario is a seed plus a lap. Handing it a qualifying grid would
    // change the situation its expect block was authored against.
    const config = buildScenarioConfig({ circuitId: 'bengaluru', seed: 193, playerDriverId: 'd_voss' })
    expect(config.gridOrder).toBeUndefined()
  })
})

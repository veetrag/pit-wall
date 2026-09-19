import { describe, it, expect, beforeEach } from 'vitest'
import { useSeasonStore } from '@state/seasonStore'
import { buildScenarioConfig } from '@state/buildRaceConfig'

describe('qualifying flow', () => {
  beforeEach(() => {
    // playerDriverId MUST be a real driver. These tests previously left it
    // null, which buildRaceConfig resolved to no team -- so they were
    // qualifying a field that contained no player car at all, and asserting
    // that worked. Setting it makes the assertions mean what they say.
    useSeasonStore.setState({
      phase: 'race_setup', qualifyingResult: null, playerDriverId: 'd_voss',
    })
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

describe('qualifying config cannot diverge from the race config', () => {
  it('REFUSES TO QUALIFY WITH NO PLAYER DRIVER', () => {
    /*
     * buildRaceConfig resolves a missing driver to no team, and applyUpgrades
     * then applies NO overlay. RaceWatcher already guards its startSeasonRace
     * call on playerDriverId for the same reason. Without a matching guard
     * here, a null id would qualify the grid on stock cars and then race on
     * upgraded ones -- the player's own upgrades silently missing from the one
     * session that decides track position.
     */
    useSeasonStore.setState({ phase: 'qualifying', playerDriverId: null, qualifyingResult: null })
    expect(() => useSeasonStore.getState().runQualifyingSession(
      { compound: 'S', attack: 'attack' }, 'rookie',
    )).toThrow(/playerDriverId/)
    expect(useSeasonStore.getState().qualifyingResult).toBeNull()
  })
})

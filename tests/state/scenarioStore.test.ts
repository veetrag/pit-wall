import { describe, it, expect, beforeEach } from 'vitest'
import { useScenarioStore } from '@state/scenarioStore'
import { useSeasonStore } from '@state/seasonStore'
import { useRaceStore } from '@state/raceStore'
import { loadGameData } from '@data/validators'
import { buildScenarioConfig } from '@state/buildRaceConfig'
import { startScenario } from '@engine/scenario'
import { stepSector } from '@engine/race'
import { snapshotFrom } from '@state/seasonPersistence'

const SPEC = loadGameData().scenarios[0]!

beforeEach(() => {
  useScenarioStore.setState({ active: null, outcome: null })
  useSeasonStore.setState({ phase: 'menu', playerDriverId: null, standings: [], raceIndex: 0 })
  useRaceStore.getState().resetRace()
})

describe('scenario mode stays out of the season', () => {
  it('NEVER PRODUCES A SAVE SNAPSHOT', () => {
    /*
     * THE SEPARATION GUARD.
     *
     * Scenario mode borrows seasonStore.phase for routing, so a player with a
     * championship in progress who plays a scenario has a live season in the
     * store the whole time. If any scenario phase mapped to a resume target,
     * the autosave would overwrite their championship with a snapshot that says
     * they are sitting in a scenario -- and on resume they would land there
     * with the season behind them gone.
     */
    for (const phase of ['scenario_select', 'scenario_racing', 'scenario_result'] as const) {
      useSeasonStore.setState({ playerDriverId: 'd_voss', phase, raceIndex: 4 })
      expect(snapshotFrom(useSeasonStore.getState()), phase).toBeNull()
    }
  })

  it('a finished scenario does not award championship points', () => {
    // recordRaceResult is the only thing that writes standings, and the
    // scenario finish path must never reach it.
    useScenarioStore.getState().select(SPEC)
    useScenarioStore.getState().recordOutcome({ met: true, position: 1, retired: false })
    expect(useSeasonStore.getState().standings).toEqual([])
  })
})

describe('startScenarioRace', () => {
  it('drops the player into a race already in progress, not onto the grid', () => {
    useRaceStore.getState().startScenarioRace(SPEC)
    const s = useRaceStore.getState()
    expect(s.phase, 'no start lights mid-race').toBe('racing')
    expect(s.raceState!.lap, 'must be at the handover lap').toBe(SPEC.startLap)
    expect(s.rng, 'the live rng must be carried forward').not.toBeNull()
    const player = s.raceState!.cars.find(c => c.isPlayer)
    expect(player?.driverId).toBe(SPEC.playerDriverId)
    // NOT asserting pitsDone > 0 here: that is a property of the handover
    // itself, already covered by the "HANDS OVER A MANAGED CAR" test in
    // tests/engine/scenario.test.ts, and it would be a false failure for any
    // scenario authored with an early startLap.
  }, 60_000)

  it('is the situation the data file promises', () => {
    useRaceStore.getState().startScenarioRace(SPEC)
    const car = useRaceStore.getState().raceState!.cars.find(c => c.isPlayer)!
    expect(car.position).toBe(SPEC.expect.position)
    expect(car.tyreAge).toBe(SPEC.expect.tyreAge)
  }, 60_000)
})

describe('the scenario handover does not fork the race', () => {
  it('CONTINUES THE ENGINE RNG RATHER THAN RESTARTING IT', () => {
    /*
     * `expect(rng).not.toBeNull()` does not cover this: replacing the handover
     * rng with `createRng(spec.seed)` leaves it non-null and passes, while
     * forking the race onto a different branch from the one the scenario was
     * authored on -- so the goal, which was calibrated against par on the
     * original branch, becomes a goal for a race nobody measured.
     *
     * engine/scenario.ts's header calls returning the live rng "the whole
     * contract"; tests/engine/scenario.test.ts proves the engine honours it.
     * This proves the STORE does, which is the seam where it is easy to drop.
     */
    const config = buildScenarioConfig(SPEC)
    const { state: engineState, rng: engineRng } = startScenario(config, SPEC.startLap)
    let expected = engineState
    for (let i = 0; i < 9; i++) expected = stepSector(config, expected, engineRng)

    useRaceStore.getState().startScenarioRace(SPEC)
    for (let i = 0; i < 9; i++) useRaceStore.getState().step()
    const actual = useRaceStore.getState().raceState!

    expect(actual.cars.map(c => c.raceTime),
      'a fresh rng would diverge immediately').toEqual(expected.cars.map(c => c.raceTime))
  }, 60_000)
})

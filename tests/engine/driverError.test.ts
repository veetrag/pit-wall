import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import { makeTuning } from '../fixtures/tuning'
import type { RaceConfig } from '@engine/types'

const DATA = loadGameData()

type TuningOverrides = Parameters<typeof makeTuning>[0]

function race(overrides: TuningOverrides, seed: number) {
  const circuit = DATA.circuits['bengaluru']!
  const config: RaceConfig = {
    circuit,
    tuning: makeTuning(overrides),
    compounds: DATA.compounds,
    drivers: DATA.drivers.drivers,
    teams: DATA.cars.teams,
    strategies: DATA.strategies.defaults,
    playerDriverId: '__none__',
    seed,
  }
  let state = initRace(config)
  const rng = createRng(seed)
  for (let i = 0; i < circuit.laps * 3; i++) state = stepSector(config, state, rng)
  return state
}

/*
 * Driver error switched on, with every OTHER retirement mechanism switched off
 * so a crash count is unambiguous, and the safety car disabled so compression
 * does not perturb the raceTime arithmetic these tests read.
 *
 * terminalFraction is then pinned to 0 or 1 per test, so each branch is
 * measured without the other diluting it -- at the shipped 0.20 a single race
 * yields roughly one crash, far too few to assert anything about.
 */
const ERRORS_ON = {
  incidents: {
    driverErrorPerLap: 0.0105,
    safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 },
    vsc: { crashDeployChance: 0, mechanicalDeployChance: 0 },
  },
  mechanicalFailure: { baseChancePerLap: 0 },
  tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
} as const

function withTerminal(fraction: number): TuningOverrides {
  return {
    ...ERRORS_ON,
    incidents: { ...ERRORS_ON.incidents, terminalFraction: fraction },
  }
}

describe('driver error', () => {
  it('logs non-terminal errors and charges time for them', () => {
    const state = race(withTerminal(0), 5)
    const errors = state.incidents.filter(i => i.kind === 'driver_error')
    expect(errors.length, 'a 56-lap race with errors on should produce some').toBeGreaterThan(0)
    for (const e of errors) {
      expect(e.timeLoss).not.toBeNull()
      expect(e.timeLoss!).toBeGreaterThan(0)
      expect(e.driverId).not.toBeNull()
      expect(e.lap).toBeGreaterThanOrEqual(0)
    }
    // terminalFraction 0 -> nobody crashes
    expect(state.incidents.filter(i => i.kind === 'crash')).toHaveLength(0)
    expect(state.cars.filter(c => c.retiredCause === 'crash')).toHaveLength(0)
  }, 60_000)

  it('retires the car on a terminal error, attributed as a crash', () => {
    const state = race(withTerminal(1), 5)
    const crashes = state.incidents.filter(i => i.kind === 'crash')
    expect(crashes.length).toBeGreaterThan(0)
    // Every crash event corresponds to a car retired with cause 'crash', and
    // vice versa -- the log and the car state cannot drift apart.
    const crashedIds = new Set(state.cars.filter(c => c.retiredCause === 'crash').map(c => c.driverId))
    expect(new Set(crashes.map(c => c.driverId))).toEqual(crashedIds)
    // terminalFraction 1 -> no time-loss branch
    expect(state.incidents.filter(i => i.kind === 'driver_error')).toHaveLength(0)
    // A crashed car is frozen: retiredLap is set and it stops accumulating.
    for (const c of state.cars.filter(x => x.retiredCause === 'crash')) {
      expect(c.retired).toBe(true)
      expect(c.retiredLap).not.toBeNull()
    }
  }, 60_000)

  it('charges the logged time loss to the car, exactly', () => {
    /*
     * FAILS IF the time-loss branch pushes an IncidentEvent but forgets to add
     * the loss to raceTime -- a log describing something the sim never did.
     *
     * Asserted as a PER-TICK identity, which is what makes it decisive:
     *
     *   raceTimeAfter - raceTimeBefore  ==  thisTick'sSectorTime + loggedLoss
     *
     * The loss is added after computeSectorTime returns, so it is absent from
     * SectorResult.sectorTime -- which is exactly why the two must sum to the
     * observed delta. Holds to 1e-13.
     *
     * An earlier version of this test compared TOTAL raceTime against an
     * errors-off run and asserted the difference was large. That was
     * unfailable: the error rolls consume rng draws whether or not the loss is
     * applied, so the two races diverge chaotically and the totals differed by
     * ~70s from stream divergence alone. Removing the `raceTime + loss` line
     * left it green. Verified by mutation this time, not by argument.
     *
     * Single car on purpose: with no one to follow there is no traffic penalty
     * and no overtake fightCost, both of which also add to raceTime outside
     * sectorTime. Ticks containing a pit stop are skipped for the same reason.
     */
    const circuit = DATA.circuits['bengaluru']!
    const d0 = DATA.drivers.drivers[0]!
    const config: RaceConfig = {
      circuit,
      tuning: makeTuning({
        ...withTerminal(0),
        incidents: { ...ERRORS_ON.incidents, terminalFraction: 0, driverErrorPerLap: 0.15 },
      }),
      compounds: DATA.compounds,
      drivers: [d0],
      teams: DATA.cars.teams.filter(t => t.id === d0.teamId),
      strategies: [{ teamId: d0.teamId, startCompound: 'H', plannedStops: [], brain: 'naive' }],
      playerDriverId: '__none__',
      seed: 5,
    }

    let state = initRace(config)
    const rng = createRng(5)
    let checked = 0
    let worst = 0
    for (let i = 0; i < circuit.laps * 3; i++) {
      const before = state.cars[0]!
      const nBefore = state.incidents.length
      const next = stepSector(config, state, rng)
      const after = next.cars[0]!
      const newErrors = next.incidents.slice(nBefore).filter(e => e.kind === 'driver_error')
      const pitted = after.pitsDone !== before.pitsDone
      if (newErrors.length > 0 && !pitted) {
        const sr = next.sectorResults[next.sectorResults.length - 1]!
        const loss = newErrors.reduce((a, e) => a + (e.timeLoss ?? 0), 0)
        worst = Math.max(worst, Math.abs(after.raceTime - before.raceTime - sr.sectorTime - loss))
        checked++
      }
      state = next
    }
    // eslint-disable-next-line no-console
    console.log(`per-tick identity checked on ${checked} error ticks, worst residual ${worst.toExponential(2)}s`)
    expect(checked, 'need error ticks to assert anything about').toBeGreaterThanOrEqual(5)
    expect(worst, 'raceTime delta must equal sectorTime + logged loss').toBeLessThan(1e-9)
  }, 120_000)

  it('passes each driver\'s consistency into the roll', () => {
    /*
     * FAILS IF the engine hands the roll a constant instead of
     * driver.facets.consistency -- relief dropped, hardcoded, or inverted.
     *
     * The relief FORMULA is already proved exactly in incidents.test.ts
     * (monotonicity plus both endpoints). What only an integration test can
     * show is that the value actually reaches the roll, so this compares two
     * races identical except that every driver's consistency is pinned to 0 or
     * to 100 -- the full 35% relief across all 20 cars rather than a
     * 4-vs-6-driver split of the shipped grid.
     *
     * An earlier version of this test did use that split, over 12 seeds, and
     * measured 5.50 vs 6.50 errors per driver on ~22 and ~39 events: a
     * difference of 0.64 SE. It passed by luck. Driving driverErrorPerLap up to
     * 0.30 for this test makes the counts large (~300 errors per race) so the
     * ratio is measured to a few percent; relief is multiplicative, so the
     * ratio it asserts is unaffected by the inflated rate.
     */
    const pin = (consistency: number) => DATA.drivers.drivers.map(d => ({
      ...d, facets: { ...d.facets, consistency },
    }))

    function errorsWithConsistency(consistency: number, seed: number): number {
      const circuit = DATA.circuits['bengaluru']!
      const config: RaceConfig = {
        circuit,
        tuning: makeTuning({ ...withTerminal(0), incidents: { ...ERRORS_ON.incidents, terminalFraction: 0, driverErrorPerLap: 0.30 } }),
        compounds: DATA.compounds,
        drivers: pin(consistency),
        teams: DATA.cars.teams,
        strategies: DATA.strategies.defaults,
        playerDriverId: '__none__',
        seed,
      }
      let state = initRace(config)
      const rng = createRng(seed)
      for (let i = 0; i < circuit.laps * 3; i++) state = stepSector(config, state, rng)
      return state.incidents.filter(i => i.kind === 'driver_error').length
    }

    let sloppy = 0, careful = 0
    for (const seed of [1, 2, 3]) {
      sloppy += errorsWithConsistency(0, seed)
      careful += errorsWithConsistency(100, seed)
    }
    const ratio = careful / sloppy
    // eslint-disable-next-line no-console
    console.log(`errors: consistency 0 -> ${sloppy}, consistency 100 -> ${careful}, ratio ${ratio.toFixed(3)} (expect ~0.65)`)

    expect(sloppy, 'the inflated rate should produce hundreds of errors').toBeGreaterThan(300)
    // 1 - consistencyReliefMax = 0.65. Band is ~3 SE on the pooled ratio.
    // Relief dropped entirely reads 1.00; inverted reads ~1.54. Both are far
    // outside this band, which is the point.
    expect(ratio).toBeGreaterThan(0.55)
    expect(ratio).toBeLessThan(0.75)
  }, 300_000)
})

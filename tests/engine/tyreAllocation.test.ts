import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import type { RaceConfig, RaceState, CarState, Compound, CircuitSpec } from '@engine/types'

const REFERENCE_CIRCUIT: CircuitSpec = {
  name: 'Reference', laps: 30,
  sectorBase: [28.0, 34.0, 28.0], carSensitivity: [0.30, 0.45, 0.25],
  driverSensitivity: [0.30, 0.40, 0.30], overtakingFactor: [1.0, 0.25, 0.55],
  pitLaneTimeLoss: 22.0, rainProbability: 0.0, weatherBias: 'stable',
}

function buildRealConfig(
  seed: number,
  allocation: Record<Compound, number>,
  mandatoryTwoCompound: boolean,
): RaceConfig {
  const data = loadGameData()
  return {
    circuit: REFERENCE_CIRCUIT,
    tuning: data.tuning,
    compounds: data.compounds,
    drivers: data.drivers.drivers,
    teams: data.cars.teams,
    strategies: data.strategies.defaults,
    playerDriverId: 'd_voss',
    seed,
    tyreAllocationBase: allocation,
    mandatoryTwoCompound,
  }
}

function runFullRace(config: RaceConfig): RaceState {
  let state = initRace(config)
  const rng = createRng(config.seed)
  const totalSectors = config.circuit.laps * 3
  for (let i = 0; i < totalSectors; i++) {
    state = stepSector(config, state, rng)
  }
  return state
}

const PRO_ALLOCATION: Record<Compound, number> = { S: 2, M: 2, H: 2, I: 2, W: 2 }
const ROOKIE_ALLOCATION: Record<Compound, number> = { S: 4, M: 4, H: 4, I: 3, W: 3 }

describe('M3: tyre-set allocation', () => {
  it('never uses a compound more times than its allocated sets, per car', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const config = buildRealConfig(seed, PRO_ALLOCATION, false)
      const final = runFullRace(config)
      for (const car of final.cars) {
        const counts: Partial<Record<Compound, number>> = {}
        for (const c of car.compoundsUsed) counts[c] = (counts[c] ?? 0) + 1
        for (const [compound, count] of Object.entries(counts) as [Compound, number][]) {
          expect(
            count,
            `seed ${seed}, ${car.driverId} used ${compound} ${count}x but only had ${PRO_ALLOCATION[compound]} sets`,
          ).toBeLessThanOrEqual(PRO_ALLOCATION[compound])
        }
      }
    }
  })
})

// ─── Mandatory two-compound rule ────────────────────────────────────────────
// Scripted scenario: three cars at the exact tick the race ends, differing
// only in compoundsUsed, so the penalty's effect on raceTime/classification
// can be verified precisely without relying on realistic mid-race AI pit
// behaviour to produce a mono-compound stint by chance.

const TUNING_FIXTURE = (() => {
  const data = loadGameData()
  return data.tuning
})()
const COMPOUNDS_FIXTURE = (() => {
  const data = loadGameData()
  return data.compounds
})()

function makeTwoCompoundConfig(mandatoryTwoCompound: boolean): RaceConfig {
  const facets = { pace: 75, racecraft: 75, tyreManagement: 75, consistency: 75, wetWeather: 75, experience: 75 }
  const teamFacets = { power: 75, aero: 75, handling: 75, reliability: 99, pitCrew: 75 }
  return {
    circuit: REFERENCE_CIRCUIT,
    tuning: TUNING_FIXTURE,
    compounds: COMPOUNDS_FIXTURE,
    drivers: [
      { id: 'mono', name: 'Mono', code: 'MNO', teamId: 'mono', facets },
      { id: 'multi', name: 'Multi', code: 'MLT', teamId: 'multi', facets },
      { id: 'wetok', name: 'WetOK', code: 'WOK', teamId: 'wetok', facets },
    ],
    teams: [
      { id: 'mono', name: 'Mono', colorPrimary: '#fff', colorSecondary: '#000', facets: teamFacets },
      { id: 'multi', name: 'Multi', colorPrimary: '#fff', colorSecondary: '#000', facets: teamFacets },
      { id: 'wetok', name: 'WetOK', colorPrimary: '#fff', colorSecondary: '#000', facets: teamFacets },
    ],
    strategies: [
      { teamId: 'mono', startCompound: 'M', plannedStops: [], brain: 'naive' },
      { teamId: 'multi', startCompound: 'M', plannedStops: [], brain: 'naive' },
      { teamId: 'wetok', startCompound: 'M', plannedStops: [], brain: 'naive' },
    ],
    playerDriverId: 'none',
    seed: 1,
    mandatoryTwoCompound,
  }
}

function makeCarAt(overrides: Partial<CarState> & { driverId: string; teamId: string; compoundsUsed: Compound[] }): CarState {
  return {
    position: 1, raceTime: 1000, lap: 29, sector: 2, compound: 'M', tyreAge: 2,
    paceMode: 'neutral', pitted: false, pitsDone: overrides.compoundsUsed.length - 1,
    strategy: { teamId: overrides.teamId, startCompound: 'M', plannedStops: [], brain: 'naive' },
    isPlayer: false,
    tyreAllocation: { S: 4, M: 4, H: 4, I: 3, W: 3 },
    lapsInDirtyAir: 0, retired: false, retiredLap: null, retiredCause: null,
    ...overrides,
  }
}

function makeRaceEndState(cars: CarState[]): RaceState {
  return {
    lap: 29, sector: 2, totalLaps: 30, cars, sectorResults: [], overtakeEvents: [],
    trackEvolutionLaps: 29, rngState: 1,
    weatherTimeline: Array(30).fill('DRY'), weatherState: 'DRY',
  }
}

describe('M3: mandatory two-compound rule', () => {
  it('penalises a mono-compound finisher when the rule is active (pro)', () => {
    const config = makeTwoCompoundConfig(true)
    const mono = makeCarAt({ driverId: 'mono', teamId: 'mono', compoundsUsed: ['M'] })
    const multi = makeCarAt({ driverId: 'multi', teamId: 'multi', compoundsUsed: ['M', 'H'], compound: 'H' })
    const state = makeRaceEndState([mono, multi])
    const next = stepSector(config, state, createRng(1))

    const monoAfter = next.cars.find(c => c.driverId === 'mono')!
    const multiAfter = next.cars.find(c => c.driverId === 'multi')!

    // Penalty (30s) dwarfs any per-sector noise/pace difference between two
    // otherwise-identical cars, so this gap is unambiguously the penalty.
    expect(monoAfter.raceTime - multiAfter.raceTime).toBeGreaterThan(20)
    expect(multiAfter.position).toBeLessThan(monoAfter.position)
  })

  it('does not penalise a mono-compound finisher when the rule is waived (rookie)', () => {
    const config = makeTwoCompoundConfig(false)
    const mono = makeCarAt({ driverId: 'mono', teamId: 'mono', compoundsUsed: ['M'] })
    const multi = makeCarAt({ driverId: 'multi', teamId: 'multi', compoundsUsed: ['M', 'H'], compound: 'H' })
    const state = makeRaceEndState([mono, multi])
    const next = stepSector(config, state, createRng(1))

    const monoAfter = next.cars.find(c => c.driverId === 'mono')!
    const multiAfter = next.cars.find(c => c.driverId === 'multi')!

    expect(Math.abs(monoAfter.raceTime - multiAfter.raceTime)).toBeLessThan(5)
  })

  it('exempts a car whose race was wet-affected, even on one dry compound', () => {
    // Weather must actually be non-DRY here — an inter tyre in DRY weather
    // triggers the (correct, separate) weatherPit emergency swap back to
    // slicks, which would confound this test. DAMP keeps inters legitimate.
    const makeWetOkState = (): RaceState => ({
      lap: 29, sector: 2, totalLaps: 30,
      cars: [makeCarAt({ driverId: 'wetok', teamId: 'wetok', compoundsUsed: ['M', 'I'], compound: 'I' })],
      sectorResults: [], overtakeEvents: [], trackEvolutionLaps: 29, rngState: 1,
      weatherTimeline: Array(30).fill('DAMP'), weatherState: 'DAMP',
    })

    // Same single-car state, same rng draws — the only variable is the rule
    // itself, so any raceTime difference is unambiguously the penalty.
    const withRule = stepSector(makeTwoCompoundConfig(true), makeWetOkState(), createRng(1))
    const withoutRule = stepSector(makeTwoCompoundConfig(false), makeWetOkState(), createRng(1))

    const withRuleCar = withRule.cars.find(c => c.driverId === 'wetok')!
    const withoutRuleCar = withoutRule.cars.find(c => c.driverId === 'wetok')!

    expect(Math.abs(withRuleCar.raceTime - withoutRuleCar.raceTime)).toBeLessThan(5)
  })
})

describe('M3: determinism + regression', () => {
  it('same seed produces identical allocation/compoundsUsed state', () => {
    const configA = buildRealConfig(777, ROOKIE_ALLOCATION, false)
    const configB = buildRealConfig(777, ROOKIE_ALLOCATION, false)
    const finalA = runFullRace(configA)
    const finalB = runFullRace(configB)

    for (const carA of finalA.cars) {
      const carB = finalB.cars.find(c => c.driverId === carA.driverId)!
      expect(carB.compoundsUsed).toEqual(carA.compoundsUsed)
      expect(carB.tyreAllocation).toEqual(carA.tyreAllocation)
    }
  })

  // Confirms M3's rookie tier (generous allocation, rule waived) doesn't
  // silently break the existing field-balance regression bands from
  // monteCarlo.test.ts — a lighter-weight confirmatory pass, not a duplicate.
  it('rookie allocation still holds the field-balance regression bands', () => {
    const RACES = 100
    const wins: Record<string, number> = {}
    let totalOvertakes = 0
    for (let i = 0; i < RACES; i++) {
      const config = buildRealConfig(i * 7 + 13, ROOKIE_ALLOCATION, false)
      const final = runFullRace(config)
      const winnerId = final.cars[0]!.driverId
      wins[winnerId] = (wins[winnerId] ?? 0) + 1
      totalOvertakes += final.overtakeEvents.length
    }
    const apexWinRate = ((wins['d_voss'] ?? 0) + (wins['d_chen'] ?? 0)) / RACES
    const meanOvertakes = totalOvertakes / RACES
    expect(apexWinRate).toBeGreaterThanOrEqual(0.70)
    expect(meanOvertakes).toBeGreaterThanOrEqual(20)
    expect(meanOvertakes).toBeLessThanOrEqual(70)
  }, 60_000)
})

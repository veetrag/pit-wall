import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { projectPitNow } from '@engine/projection'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import { useRaceStore } from '@state/raceStore'
import type { RaceConfig, StrategyBrain, CircuitSpec } from '@engine/types'

const GAME = loadGameData()

export const ALL_TWELVE = [
  'bengaluru', 'monsoon_bay', 'veloce', 'harbour_lights', 'sol_desert', 'highland',
  'grand_savane', 'aurora', 'silverpark', 'costa_verde', 'kaido', 'altiplano',
] as const

const NORMALISED_LAPS = 40
const SEEDS = [1, 2, 3, 4, 5]

/**
 * A race on `circuit` with rain forced off and the lap count normalised, then
 * reduced to the two things a player would actually notice: the finishing order
 * and the winning margin.
 *
 * Deliberately NOT a whole-state hash. `sectorBase` alone would make a whole
 * state differ, which would let the differentiation test below pass without
 * the sensitivity fields working at all.
 */
function buildConfig(circuit: CircuitSpec, seed: number): RaceConfig {
  return {
    circuit,
    tuning: GAME.tuning,
    compounds: GAME.compounds,
    drivers: GAME.drivers.drivers,
    teams: GAME.cars.teams,
    strategies: GAME.strategies.defaults.map(s => ({
      ...s,
      brain: (s.brain ?? 'naive') as StrategyBrain,
      plannedStops: s.plannedStops.map(st => ({ ...st, lap: Math.round((st.lap / 30) * NORMALISED_LAPS) })),
    })),
    // A non-existent id so EVERY car is AI-managed. See MODEL_SPEC.md §12 -- a
    // real playerDriverId leaves one car on its start tyre in neutral all race
    // and silently skews every statistic.
    playerDriverId: '__none__',
    seed,
    tyreAllocationBase: GAME.tuning.tyreRules.allocation.pro,
    mandatoryTwoCompound: GAME.tuning.tyreRules.mandatoryTwoCompound.pro,
    coverReactionScale: GAME.tuning.difficultyProfiles.pro.coverReactionScale,
    paceModeAggression: GAME.tuning.difficultyProfiles.pro.aiPaceModeAggression,
  }
}

function raceFingerprint(circuit: CircuitSpec, seed: number): string {
  const cfg = buildConfig(circuit, seed)
  const rng = createRng(seed)
  let state = initRace(cfg)
  // Bounded, per tests/engine/monteCarloHarness.ts:185. RaceState has NO
  // `finished` field -- `while (!state.finished)` never terminates.
  for (let i = 0; i < NORMALISED_LAPS * 3; i++) state = stepSector(cfg, state, rng)
  const order = [...state.cars].sort((a, b) => a.raceTime - b.raceTime)
  return order.map(c => c.driverId).join(',') + '|' + (order[1]!.raceTime - order[0]!.raceTime).toFixed(3)
}

/**
 * A circuit with everything that is NOT sensitivity neutralised.
 *
 * FOUR circuit fields can make two circuits race differently for reasons that
 * have nothing to do with sensitivity. All four must be controlled, or a
 * differentiation test passes without the sensitivity wiring doing anything.
 * Each was measured on seeds 1-5 BEFORE the wiring, not assumed:
 *
 *   overtakingFactor  flips 5 of 5 on its own (race.ts:183 and :316)
 *   sectorBase        flips 3 of 5 on its own (lapModel.ts:20)
 *   weatherBias       flips seeds on its own -- see below
 *   pitLaneTimeLoss   now wired (Task 2): see the "pit lane loss comes from
 *                     the circuit" describe block below for the measured
 *                     difference and the projection-vs-race agreement check
 *
 * The first, second and fourth are held equal in `seedsDiffering`, since they
 * are wired features of the circuit under test. The third is neutralised here,
 * since it is a measurement control.
 *
 * `rainProbability: 0` IS NOT SUFFICIENT to force dry weather, which is the
 * trap. generateWeatherTimeline (src/engine/weather.ts:28) rolls DRY -> DAMP
 * every lap at `intensityBias[weatherBias] / minDuration`, entirely
 * independently of the rain roll that rainProbability gates. So a `showery`
 * circuit (bias 0.30) and a `stable` one (0.05) still diverge with rain
 * "off" -- harbour_lights is showery and grand_savane is stable, and that alone
 * made the headline test below pass before the wiring existed. Pinning the bias
 * as well makes the weather timeline bit-identical across circuits at a given
 * seed. Aurora and Kaido are both showery, which is why that pair read a clean
 * 0 and hid this.
 */
function prepare(circuitId: string, overrides: Partial<CircuitSpec> = {}): CircuitSpec {
  return {
    ...GAME.circuits[circuitId]!,
    laps: NORMALISED_LAPS,
    rainProbability: 0,
    weatherBias: 'stable',
    ...overrides,
  }
}

/**
 * How many of SEEDS produce a different race on `b` than on `a`, with every
 * circuit field that ALREADY has an engine consumer held equal between them.
 *
 * The conditioning is the entire point, and it is not paranoia -- it was
 * measured. The unconditioned form of this comparison (just circuit `a` against
 * circuit `b`) was written first and REJECTED, because it already read 5 of 5
 * before any sensitivity wiring existed:
 *
 *   - `overtakingFactor` (wired by the preceding overtaking plan, race.ts:183
 *     and :316) flips all 5 seeds on its own.
 *   - `sectorBase` (wired at lapModel.ts:20, and always was) flips 3 on its own.
 *   - `pitLaneTimeLoss` is held equal here (via `alreadyWired`) because it is
 *     now a wired feature of the circuit under test, same as the other two --
 *     see the "pit lane loss comes from the circuit" describe block below.
 *   - `weatherBias` flips seeds too, even at rainProbability 0. Neutralised in
 *     `prepare` rather than here, since it is a control, not a wired feature --
 *     see that docstring, which is the authority on all four confounders.
 *
 * So the unconditioned test passed BEFORE and AFTER the change it exists to
 * guard, i.e. it could not fail. A test that cannot distinguish its own subject
 * is worse than no test, because it reads as proof. Holding those three fields
 * equal leaves carSensitivity/driverSensitivity as the only remaining
 * difference, which measured 0 of 5 before the wiring and >= 4 after.
 *
 * DO NOT "simplify" this back to a bare two-circuit compare.
 */
function seedsDiffering(a: string, b: string): number {
  const base = GAME.circuits[a]!
  const alreadyWired: Partial<CircuitSpec> = {
    overtakingFactor: base.overtakingFactor,
    sectorBase: base.sectorBase,
    pitLaneTimeLoss: base.pitLaneTimeLoss,
  }
  const left = prepare(a)
  const right = prepare(b, alreadyWired)
  return SEEDS.filter(seed => raceFingerprint(left, seed) !== raceFingerprint(right, seed)).length
}

describe('circuits: sensitivity fields differentiate the calendar', () => {
  // The headline. harbour_lights vs grand_savane is the strongest pair on the
  // calendar: carSensitivity sums 0.78 vs 1.05 and driverSensitivity 1.36 vs
  // 1.02, so it exercises COMPRESSION (harbour_lights squeezes the car spread
  // by a fifth) as well as reshape (its driver weighting is a third heavier).
  //
  // FAILS IF: lapModel.ts reverts either weight to the global
  // tuning.{car,driver}Performance.sectorSplit constant. With both globals in
  // place the two configs are bit-identical and this reads 0 -- measured, that
  // is exactly what it read before the wiring.
  it('the most and least car-sensitive circuits produce different races', () => {
    expect(
      seedsDiffering('harbour_lights', 'grand_savane'),
      'harbour_lights (car 0.78 / driver 1.36) vs grand_savane (1.05 / 1.02), seeds 1-5',
    ).toBeGreaterThanOrEqual(4)
  }, 120_000)

  // Kept for continuity: this is the specific pair MODEL_SPEC.md §8 names as
  // bit-identical over 400 seeds, so it is the claim on record. It is the
  // WEAKER demonstration -- both carSensitivity vectors sum to 1.00, making it
  // a pure reshape there ([0.33,0.40,0.30] vs [0.26,0.48,0.26]), and the only
  // compression comes from driverSensitivity (1.08 vs 1.00).
  //
  // FAILS IF: as above. Same mutation, smaller margin, which is precisely why
  // it is not the headline.
  it('Aurora and Kaido no longer produce the same race', () => {
    expect(
      seedsDiffering('aurora', 'kaido'),
      'the MODEL_SPEC §8 pair, seeds 1-5, already-wired fields held equal',
    ).toBeGreaterThanOrEqual(4)
  }, 120_000)

  // Guards the instrument itself: if `prepare`/`raceFingerprint` ever became
  // non-deterministic, or if the conditioning in `seedsDiffering` accidentally
  // copied the sensitivity fields too, the tests above would pass or fail for
  // reasons unrelated to sensitivity.
  //
  // FAILS IF: the fingerprint is nondeterministic (e.g. a Math.random() creeps
  // into the engine, or rng seeding stops being reproducible) -- this reads
  // non-zero.
  it('the fingerprint is deterministic for an identical config', () => {
    const c = prepare('kaido')
    expect(
      SEEDS.filter(seed => raceFingerprint(c, seed) !== raceFingerprint(c, seed)).length,
      'same circuit, same seed, twice',
    ).toBe(0)
  }, 120_000)
})

describe('circuits: pit lane loss comes from the circuit', () => {
  // pit.laneTimeLoss (22.0) was global while circuits specify 18.0-24.0.
  //
  // Isolation: both configs are built from `veloce` -- identical sectorBase,
  // overtakingFactor, sensitivity, everything -- except one has grand_savane's
  // pitLaneTimeLoss grafted on. aiDecision (src/engine/strategy.ts) never reads
  // pitLaneTimeLoss, so up to and including the sector in which the FIRST pit
  // stop of the race happens, runs A and B are byte-identical -- same
  // decisions, same rng draws. That sector is measured and then the comparison
  // stops, deliberately, before the changed raceTime can feed back into any
  // car's later pit/overtake decisions and contaminate the reading (measured:
  // letting the whole 40-lap race run before comparing pit counts produces
  // wildly different counts per car, e.g. 0 vs 3, because a pit stop shifts
  // track position, which is an input to the AI's own decisions).
  it('a stop at Veloce costs measurably less than at Grand Savane', () => {
    const veloceLoss = GAME.circuits['veloce']!.pitLaneTimeLoss
    const grandSavaneLoss = GAME.circuits['grand_savane']!.pitLaneTimeLoss
    const expectedDiff = grandSavaneLoss - veloceLoss // 6.0

    const circuitA = prepare('veloce')
    const circuitB = prepare('veloce', { pitLaneTimeLoss: grandSavaneLoss })

    const firstStopDiffs: number[] = []
    for (const seed of SEEDS) {
      const cfgA = buildConfig(circuitA, seed)
      const cfgB = buildConfig(circuitB, seed)
      const rngA = createRng(seed)
      const rngB = createRng(seed)
      let stateA = initRace(cfgA)
      let stateB = initRace(cfgB)
      for (let i = 0; i < NORMALISED_LAPS * 3; i++) {
        const prevPits = new Map(stateA.cars.map(c => [c.driverId, c.pitsDone]))
        stateA = stepSector(cfgA, stateA, rngA)
        stateB = stepSector(cfgB, stateB, rngB)
        const pittedCar = stateA.cars.find(c => c.pitsDone > (prevPits.get(c.driverId) ?? 0))
        if (pittedCar) {
          const carB = stateB.cars.find(c => c.driverId === pittedCar.driverId)!
          firstStopDiffs.push(carB.raceTime - pittedCar.raceTime)
          break // stop before any later sector's decisions can diverge
        }
      }
    }

    const n = firstStopDiffs.length
    const mean = firstStopDiffs.reduce((a, b) => a + b, 0) / n
    expect(n, 'at least one seed must produce a pit stop within the normalised race').toBeGreaterThan(0)
    expect(
      mean,
      `veloce (${veloceLoss}) vs grand_savane (${grandSavaneLoss}), n=${n} first-stop seeds, expected +${expectedDiff}`,
    ).toBeCloseTo(expectedDiff, 1) // within 0.05 of 6.0, well inside the +-1.0 budget
    expect(Math.abs(mean - expectedDiff)).toBeLessThanOrEqual(1.0)
  }, 60_000)

  // The important one: the projection must agree with reality, or the
  // centrepiece interaction lies to the player. Noise (stopSigma) and the
  // fast-forward horizon are both zeroed so the only quantity left in either
  // computation is pitLaneTimeLoss + stopMean -- the exact, not approximate,
  // comparison the brief calls for.
  it('the projection prices a stop with the same lane loss the race charges', () => {
    for (const circuitId of ['veloce', 'grand_savane'] as const) {
      useRaceStore.setState({
        phase: 'idle', config: null, raceState: null, rng: null,
        projectionResult: null, pitPanelOpen: false, playerInPit: false, pitEndTime: 0,
      })
      // d_voss starts on pole -- no "ahead" car, and the "behind" gap gets
      // clipped to 0 by projection.ts's Math.max(0, ...) once a ~20s stop
      // dwarfs the grid gap, which erases the signal this test needs. Grid
      // into a mid-pack driver instead, so there is a genuine car ahead and
      // the raw (unclipped) rejoinGap can be used to recover the stop cost.
      useRaceStore.getState().startSeasonRace('d_voss', 42, circuitId, 'pro')
      const gridOrder = [...useRaceStore.getState().raceState!.cars].sort((a, b) => a.position - b.position)
      const midPackDriverId = gridOrder[10]!.driverId
      useRaceStore.setState({
        phase: 'idle', config: null, raceState: null, rng: null,
        projectionResult: null, pitPanelOpen: false, playerInPit: false, pitEndTime: 0,
      })
      useRaceStore.getState().startSeasonRace(midPackDriverId, 42, circuitId, 'pro')

      const liveConfig = useRaceStore.getState().config!
      const zeroNoiseConfig: RaceConfig = {
        ...liveConfig,
        tuning: {
          ...liveConfig.tuning,
          pit: { ...liveConfig.tuning.pit, stopSigma: 0 },
          projection: { ...liveConfig.tuning.projection, horizonLaps: 0 },
        },
      }
      useRaceStore.setState({ config: zeroNoiseConfig })

      const raceState = useRaceStore.getState().raceState!
      const player = raceState.cars.find(c => c.driverId === zeroNoiseConfig.playerDriverId)!
      const sortedBefore = [...raceState.cars].sort((a, b) => a.position - b.position)
      const aheadBefore = sortedBefore[player.position - 2] ?? null
      const behindBefore = sortedBefore[player.position] ?? null
      const before = player.raceTime

      // What race.ts's player-pit path (raceStore.pitNow) actually charges.
      useRaceStore.getState().pitNow('H')
      const after = useRaceStore.getState().raceState!.cars.find(c => c.driverId === zeroNoiseConfig.playerDriverId)!.raceTime
      const actualStopTime = after - before

      // What projection.ts prices for the same stop from the same pre-pit
      // state (horizonLaps 0, so neither neighbour's raceTime has moved).
      // Recover the player's post-stop raceTime from whichever neighbour
      // gap projection.ts reports -- it only reports a gap to whichever
      // neighbour exists, and the player here starts on pole (no "ahead" car).
      const projected = projectPitNow(zeroNoiseConfig, raceState, 'H', 12345)
      let projectedStopTime: number
      if (aheadBefore) {
        projectedStopTime = projected.rejoinGap + aheadBefore.raceTime - before
      } else if (behindBefore) {
        projectedStopTime = behindBefore.raceTime - projected.rejoinGapBehind - before
      } else {
        throw new Error('fixture must have at least one other car to measure a gap against')
      }

      expect(
        projectedStopTime,
        `${circuitId}: projection must price the stop identically to the race`,
      ).toBeCloseTo(actualStopTime, 9)
      expect(
        actualStopTime,
        `${circuitId}: deterministic stop cost is pitLaneTimeLoss + stopMean`,
      ).toBeCloseTo(GAME.circuits[circuitId]!.pitLaneTimeLoss + zeroNoiseConfig.tuning.pit.stopMean, 9)
    }
  }, 60_000)
})

import { describe, it, expect } from 'vitest'
import { initRace, stepSector, projectPitNow } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import { makeTuning } from '../fixtures/tuning'
import { makeConfig, runRace, type TuningOverrides } from '../fixtures/raceHarness'
import type { RaceConfig, RaceState } from '@engine/types'

const DATA = loadGameData()

/*
 * Crashes forced on and made certain to deploy, so the state machine is
 * exercised deterministically rather than waited for. Mechanical and tyre
 * failures are off so every retirement is a crash and the deploy cause is
 * unambiguous.
 */
// Deliberately NOT annotated `: TuningOverrides`. That type is a DeepPartial, so
// the annotation would make `.incidents` optional and every `...SC_CERTAIN.incidents`
// spread below a tsc error. Inference gives concrete members and still satisfies
// makeTuning's parameter.
const SC_CERTAIN = {
  incidents: {
    driverErrorPerLap: 0.05,
    terminalFraction: 1,
    safetyCar: { crashDeployChance: 1, mechanicalDeployChance: 0 },
  },
  mechanicalFailure: { baseChancePerLap: 0 },
  tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
}

describe('safety car deployment', () => {
  it('deploys on a crash and logs it', () => {
    const config = makeConfig(SC_CERTAIN, 5)
    let sawActive = false
    const final = runRace(config, 5, (_prev, next) => {
      if (next.safetyCar !== null) sawActive = true
    })
    expect(final.incidents.filter(i => i.kind === 'safety_car_deployed').length).toBeGreaterThan(0)
    // Checked mid-race, not only at the end: a safety car that deploys and
    // expires within the race leaves final.safetyCar null, so asserting on the
    // end state alone would be asserting nothing.
    expect(sawActive, 'safetyCar must be non-null at some point mid-race').toBe(true)
    for (const e of final.incidents.filter(i => i.kind === 'safety_car_deployed')) {
      expect(e.driverId, 'safety-car events belong to the race, not a car').toBeNull()
    }
  }, 60_000)

  it('never deploys when both chances are zero, even with retirements', () => {
    const config = makeConfig({
      ...SC_CERTAIN,
      incidents: { ...SC_CERTAIN.incidents, safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 }, vsc: { crashDeployChance: 0, mechanicalDeployChance: 0 } },
    } as TuningOverrides, 5)
    let sawActive = false
    const final = runRace(config, 5, (_p, n) => { if (n.safetyCar !== null) sawActive = true })
    // The premise: retirements DID happen, so this is not vacuous.
    expect(final.cars.filter(c => c.retiredCause === 'crash').length).toBeGreaterThan(0)
    expect(sawActive).toBe(false)
    expect(final.incidents.filter(i => i.kind === 'safety_car_deployed')).toHaveLength(0)
  }, 60_000)

  it('respects maxPerRace', () => {
    const maxPerRace = 1
    const config = makeConfig({
      ...SC_CERTAIN,
      incidents: {
        ...SC_CERTAIN.incidents,
        driverErrorPerLap: 0.15,   // many crashes, so the cap is what binds
        safetyCar: { crashDeployChance: 1, mechanicalDeployChance: 0, maxPerRace, durationLapsMin: 1, durationLapsMax: 1 },
      },
    } as TuningOverrides, 5)
    const final = runRace(config, 5)
    const deployments = final.incidents.filter(i => i.kind === 'safety_car_deployed').length
    // eslint-disable-next-line no-console
    console.log(`deployments ${deployments} against maxPerRace ${maxPerRace}`)
    expect(deployments).toBeGreaterThan(0)
    expect(deployments).toBeLessThanOrEqual(maxPerRace)
  }, 60_000)
})

describe('safety car gap compression', () => {
  it('collapses the field spread on the deployment tick, and only then', () => {
    /*
     * Measured as an A/B against a no-compression counterfactual, which is what
     * makes it clean: compressRaceTimes draws no rng, so two runs differing ONLY
     * in gapCompression follow an identical draw sequence and deploy on the same
     * tick. Any spread difference between them at that tick is compression and
     * nothing else.
     *
     * An earlier version of this test compared the field spread before the tick
     * against after it, and read x0.909 where x0.35 was configured -- because a
     * tick also ADDS sector times (which grow the spread) and then applies
     * traffic penalties to a field that compression has just bunched inside
     * gapThreshold (which grows it again). Instrumenting race.ts showed
     * compression itself was exact to four decimals: 1.2047 -> 0.4216, x0.3500.
     * The instrument was wrong, not the engine. The exact arithmetic is unit
     * tested in incidents.test.ts; what this test owns is that race.ts actually
     * applies it, once.
     */
    function spreadAtDeployment(gapCompression: number): { spread: number; lap: number; laterSpreads: number[] } {
      const config = makeConfig({
        ...SC_CERTAIN,
        incidents: {
          ...SC_CERTAIN.incidents,
          safetyCar: { crashDeployChance: 1, mechanicalDeployChance: 0, gapCompression, durationLapsMin: 5, durationLapsMax: 5 },
        },
      } as TuningOverrides, 5)
      let spread = NaN
      let lap = -1
      const laterSpreads: number[] = []
      runRace(config, 5, (prev, next) => {
        const active = next.cars.filter(c => !c.retired)
        const leader = Math.min(...active.map(c => c.raceTime))
        const s = Math.max(...active.map(c => c.raceTime - leader))
        if (prev.safetyCar === null && next.safetyCar !== null && Number.isNaN(spread)) {
          spread = s
          lap = next.lap
        } else if (!Number.isNaN(spread) && next.safetyCar !== null && laterSpreads.length < 4) {
          laterSpreads.push(s)
        }
      })
      return { spread, lap, laterSpreads }
    }

    const compressed = spreadAtDeployment(0.35)
    const uncompressed = spreadAtDeployment(1.0)

    expect(Number.isNaN(compressed.spread), 'no deployment in the compressed run').toBe(false)
    expect(Number.isNaN(uncompressed.spread), 'no deployment in the uncompressed run').toBe(false)
    // Same draw sequence, so the same tick.
    expect(compressed.lap).toBe(uncompressed.lap)

    const ratio = compressed.spread / uncompressed.spread
    // eslint-disable-next-line no-console
    console.log(`deploy-tick spread: compressed ${compressed.spread.toFixed(3)}s vs uncompressed ${uncompressed.spread.toFixed(3)}s (x${ratio.toFixed(3)})`)
    // FAILS IF compression is not applied at all: the two runs would then be
    // byte-identical and this reads exactly 1.000.
    expect(ratio).toBeLessThan(0.6)

    // ...and only then. Repeated compression every tick while deployed would
    // walk the spread toward zero; it must stay comparable to the deploy tick.
    expect(compressed.laterSpreads.length).toBeGreaterThan(0)
    const smallest = Math.min(...compressed.laterSpreads)
    // eslint-disable-next-line no-console
    console.log(`spreads on the ${compressed.laterSpreads.length} ticks after: ${compressed.laterSpreads.map(x => x.toFixed(2)).join(', ')}`)
    expect(smallest, 'repeated compression would drive the spread toward 0')
      .toBeGreaterThan(compressed.spread * 0.25)
  }, 120_000)
})

describe('safety car pace and duration', () => {
  it('multiplies every car\'s sector time by paceMultiplier, exactly', () => {
    /*
     * A/B against paceMultiplier 1.0, and the exactness comes from a specific
     * choice of tick.
     *
     * paceMultiplier draws no rng, so two runs differing only in it are
     * IDENTICAL up to the first tick on which the multiplier can act. Note that
     * is not the deployment tick: computeSectorTime receives the PREVIOUS
     * state's safetyCar, which is still null when the safety car deploys. So the
     * first affected tick is the first one with `prev.safetyCar !== null`, and
     * every tick before it is bit-identical across both runs. On that one tick,
     * each car's sector time can differ only by the multiplier -- so the ratio
     * is exact rather than statistical.
     *
     * An earlier version of this test compared field SPREAD across ticks under
     * yellow and asserted it did not collapse or explode. That was unfailable:
     * deleting the multiplier entirely left it green (verified by mutation),
     * because scaling every car equally is precisely what does NOT change the
     * spread it was watching.
     */
    const paceMultiplier = 1.45

    function firstMultipliedTickTimes(multiplier: number): Map<string, number> {
      const config = makeConfig({
        ...SC_CERTAIN,
        incidents: {
          ...SC_CERTAIN.incidents,
          driverErrorPerLap: 0.004,
          safetyCar: {
            crashDeployChance: 1, mechanicalDeployChance: 0, paceMultiplier,
            durationLapsMin: 5, durationLapsMax: 5, maxPerRace: 1,
          },
        },
      } as TuningOverrides, 7)
      // Override just the multiplier, leaving every other draw identical.
      const tuned: RaceConfig = {
        ...config,
        tuning: {
          ...config.tuning,
          incidents: {
            ...config.tuning.incidents,
            safetyCar: { ...config.tuning.incidents.safetyCar, paceMultiplier: multiplier },
          },
        },
      }
      const out = new Map<string, number>()
      let captured = false
      runRace(tuned, 7, (prev, next) => {
        if (captured || prev.safetyCar === null) return
        captured = true
        const nBefore = prev.sectorResults.length
        for (const r of next.sectorResults.slice(nBefore)) out.set(r.driverId, r.sectorTime)
      })
      return out
    }

    const fast = firstMultipliedTickTimes(1.0)
    const slow = firstMultipliedTickTimes(paceMultiplier)
    expect(fast.size, 'no tick was captured under a safety car').toBeGreaterThan(5)
    expect(slow.size).toBe(fast.size)

    let worst = 0
    for (const [driverId, t1] of fast) {
      const t2 = slow.get(driverId)!
      worst = Math.max(worst, Math.abs(t2 / t1 - paceMultiplier))
    }
    // eslint-disable-next-line no-console
    console.log(`paceMultiplier: ${fast.size} cars, worst |ratio - ${paceMultiplier}| = ${worst.toExponential(2)}`)
    // FAILS IF the multiplier is dropped: every ratio reads 1.0 instead of 1.45.
    expect(worst, 'every car\'s sector time must scale by exactly paceMultiplier').toBeLessThan(1e-9)
  }, 120_000)

  it('expires after the rolled duration and logs the restart', () => {
    const duration = 3
    const config = makeConfig({
      ...SC_CERTAIN,
      incidents: {
        ...SC_CERTAIN.incidents,
        driverErrorPerLap: 0.004,   // one crash early, then quiet
        safetyCar: { crashDeployChance: 1, mechanicalDeployChance: 0, durationLapsMin: duration, durationLapsMax: duration, maxPerRace: 1 },
        // A later crash would otherwise roll a VSC (live since 1.5) and the
        // observer below would read its deployment as this SC's.
        vsc: { crashDeployChance: 0, mechanicalDeployChance: 0 },
      },
    } as TuningOverrides, 5)

    let deployLap: number | null = null
    let endLap: number | null = null
    const final = runRace(config, 5, (prev, next) => {
      if (prev.safetyCar === null && next.safetyCar !== null) deployLap = next.safetyCar.deployedLap
      if (prev.safetyCar !== null && next.safetyCar === null && endLap === null) endLap = next.lap
    })
    expect(deployLap, 'no deployment, so expiry cannot be asserted').not.toBeNull()
    expect(endLap, 'the safety car never ended').not.toBeNull()
    // eslint-disable-next-line no-console
    console.log(`deployed lap ${deployLap}, ended lap ${endLap}, configured duration ${duration}`)
    // Ticks down once per LAP. Deployment can happen mid-lap, so the elapsed lap
    // count is the duration give or take that partial lap -- but it must NOT be
    // ~duration/3, which is what a per-SECTOR decrement would produce.
    const elapsed = endLap! - deployLap!
    expect(elapsed).toBeGreaterThanOrEqual(duration - 1)
    expect(elapsed).toBeLessThanOrEqual(duration + 1)
    expect(final.incidents.filter(i => i.kind === 'safety_car_ended').length).toBeGreaterThan(0)
  }, 60_000)
})

describe('safety car and overtaking', () => {
  it('records no overtakes while a safety car is active', () => {
    const config = makeConfig({
      ...SC_CERTAIN,
      incidents: {
        ...SC_CERTAIN.incidents,
        driverErrorPerLap: 0.02,
        safetyCar: { crashDeployChance: 1, mechanicalDeployChance: 0, durationLapsMin: 5, durationLapsMax: 5 },
      },
    } as TuningOverrides, 5)

    let ticksUnderSc = 0
    runRace(config, 5, (prev, next) => {
      if (next.safetyCar === null) return
      ticksUnderSc++
      // FAILS IF the resolveOvertakes guard is removed: a x0.35 compression puts
      // most of the field inside gapThreshold, so overtakes would fire in bulk.
      expect(next.overtakeEvents.length, 'no overtake may be recorded under yellow')
        .toBe(prev.overtakeEvents.length)
    })
    expect(ticksUnderSc, 'no ticks under a safety car, so nothing was asserted').toBeGreaterThan(5)
  }, 60_000)
})

describe('safety car pit discount', () => {
  it('prices the projection with the same lane loss the race charges', () => {
    /*
     * THE SPEC's SECTION 10 RISK. If the projection and the race disagree, the
     * overlay promises the player a discount the race then fails to give -- by
     * 8-12s, on the game's centrepiece decision. Asserted to nine decimals.
     *
     * Run on a genuine MID-RACE state, not on initRace's output: initRace starts
     * every car at raceTime 0, so there is no car "ahead" to recover the priced
     * stop from and the whole measurement comes out NaN.
     */
    const laneTimeLossUnderSc = 10.0
    const base = {
      incidents: {
        driverErrorPerLap: 0,
        safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0, laneTimeLossUnderSc },
      },
      mechanicalFailure: { baseChancePerLap: 0 },
      tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
      // Zero the stop noise and the projection horizon so the stop cost is the
      // only moving part -- same approach as circuitDifferentiation.test.ts.
      pit: { stopSigma: 0, pitCrewMeanRelief: 0, pitCrewSigmaRelief: 0 },
      projection: { horizonLaps: 0 },
    }
    // projectPitNow takes a COMPOUND third, and reads the player from
    // config.playerDriverId -- so the config needs a real id, not '__none__'.
    const playerDriverId = DATA.drivers.drivers[10]!.id
    const config: RaceConfig = { ...makeConfig(base, 99, 'veloce'), playerDriverId }
    const laneGreen = config.circuit.pitLaneTimeLoss   // veloce: 18.0
    expect(laneGreen).toBe(18.0)

    // Step into the race so raceTimes are genuinely spread.
    let mid = initRace(config)
    const rng = createRng(99)
    for (let i = 0; i < 30; i++) mid = stepSector(config, mid, rng)

    const player = mid.cars.find(c => c.driverId === playerDriverId)!
    expect(player.retired).toBe(false)

    for (const [label, sc, expectedLane] of [
      ['green flag', null, laneGreen],
      ['under yellow', { deployedLap: 5, lapsRemaining: 3, cause: 'crash' as const }, laneTimeLossUnderSc],
    ] as const) {
      const s: RaceState = { ...mid, safetyCar: sc }
      const ahead = [...s.cars]
        .filter(c => !c.retired && c.raceTime < player.raceTime)
        .sort((a, b) => b.raceTime - a.raceTime)[0]
      expect(ahead, 'need a car ahead to recover the priced stop from').toBeDefined()

      const projected = projectPitNow(config, s, 'M', 12345)
      const expectedStop = expectedLane + config.tuning.pit.stopMean
      // horizonLaps 0, so nobody's raceTime moves except the player's stop:
      // rejoinGap = playerAfterStop - ahead.raceTime.
      const impliedStop = projected.rejoinGap + ahead!.raceTime - player.raceTime
      // eslint-disable-next-line no-console
      console.log(`${label}: expected stop ${expectedStop.toFixed(3)}s, implied ${impliedStop.toFixed(3)}s`)
      expect(impliedStop, `${label}: projection must price the stop at ${expectedStop}`)
        .toBeCloseTo(expectedStop, 9)
    }
  }, 60_000)
})

describe('a race can end while the safety car is still out', () => {
  it('happens often enough that the UI must handle it', () => {
    /*
     * Not a curiosity -- this is the PREMISE a UI gate depends on, pinned here
     * so it cannot quietly stop being true.
     *
     * race.ts only clears `safetyCar` at a lap boundary, and there is no
     * end-of-race clear, so a race whose final lap begins under yellow finishes
     * with the flag still set. The banner, the timing tower flash and the
     * commentary ticker are all gated to the racing/starting phases and vanish
     * at the flag -- but the track canvas renders in every phase except idle.
     * So TrackCanvas.tsx gates its caution wash on PHASE as well as on the flag;
     * without that, the results screen sits under an unexplained yellow wash
     * with every surface that could have explained it already unmounted.
     *
     * Found by whole-branch review, not by any per-task test, because no test
     * covered any surface's behaviour in the `finished` phase.
     *
     * Measured 11/400 (2.75%) on veloce at shipped tuning. The assertion is a
     * loose floor, not that figure: the point is that the case is REACHABLE,
     * and a band tight enough to track the rate would be re-tuning noise.
     */
    const circuit = DATA.circuits['veloce']!
    let under = 0
    for (let seed = 1; seed <= 200; seed++) {
      const config: RaceConfig = {
        circuit, tuning: makeTuning({}), compounds: DATA.compounds,
        drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
        strategies: DATA.strategies.defaults, playerDriverId: '__none__', seed,
      }
      let s = initRace(config)
      const rng = createRng(seed)
      for (let i = 0; i < circuit.laps * 3; i++) s = stepSector(config, s, rng)
      if (s.safetyCar !== null) under++
    }
    // eslint-disable-next-line no-console
    console.log(`races finishing under a safety car: ${under}/200`)
    expect(under, 'if this ever reaches 0 the canvas phase gate is dead code').toBeGreaterThan(0)
  }, 300_000)
})

import { describe, it, expect } from 'vitest'
import { pitStopTime, expectedPitStopTime, slowStopComponent, normalCdf } from '@engine/pitStop'
import { applyPlayerPit } from '@engine/playerCalls'
import { projectPitNow } from '@engine/projection'
import { initRace, stepSector } from '@engine/race'
import { createRng, gaussianPair } from '@engine/rng'
import { makeConfig, runRace } from '../fixtures/raceHarness'
import { processCommentaryTick, makeCommentaryState } from '@state/commentaryMapper'
import type { RaceConfig } from '@engine/types'

const QUIET = {
  incidents: { driverErrorPerLap: 0, safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 }, vsc: { crashDeployChance: 0, mechanicalDeployChance: 0 } },
  mechanicalFailure: { baseChancePerLap: 0 },
  tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
}
const withPit = (pit: Record<string, number>, seed = 5): RaceConfig => makeConfig({ ...QUIET, pit }, seed)
const TEAM = 'apex'

describe('normalCdf', () => {
  it('is the standard normal CDF to 1e-6', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.6448536)).toBeCloseTo(0.95, 5)
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 5)
    for (const x of [0.3, 1.1, 2.7]) expect(normalCdf(-x)).toBeCloseTo(1 - normalCdf(x), 9)
  })
})

describe('slowStopComponent', () => {
  it('IS ZERO FOR EVERY g AT A ZERO CHANCE', () => {
    const c = withPit({ slowStopChance: 0 })
    for (const g of [-3, 0, 2, 5, 9]) expect(slowStopComponent(c, TEAM, g)).toBe(0)
  })

  it('is zero below the tail, slowStopMin at its edge, approaches slowStopMax deep in it', () => {
    const c = withPit({ slowStopChance: 0.04, slowStopMin: 2, slowStopMax: 6, pitCrewSlowRelief: 0 })
    // p = 0.04 -> threshold Φ⁻¹(0.96) = 1.7507
    expect(slowStopComponent(c, TEAM, 1.74)).toBe(0)
    const edge = slowStopComponent(c, TEAM, 1.752)
    expect(edge).toBeGreaterThanOrEqual(2)
    expect(edge).toBeLessThan(2.05)
    expect(slowStopComponent(c, TEAM, 6)).toBeCloseTo(6, 3)
  })

  it('a perfect crew with full relief never has a slow stop', () => {
    const c = withPit({ slowStopChance: 0.5, pitCrewSlowRelief: 1 })
    const perfect: RaceConfig = { ...c, teams: c.teams.map(t => t.id === TEAM ? { ...t, facets: { ...t.facets, pitCrew: 100 } } : t) }
    for (const g of [1, 3, 8]) expect(slowStopComponent(perfect, TEAM, g)).toBe(0)
  })

  it('converges on chance x (1 - crew x relief), with a mean inside [min, max]', () => {
    const c = withPit({ slowStopChance: 0.04, slowStopMin: 2, slowStopMax: 6, pitCrewSlowRelief: 0.5 })
    const crew = c.teams.find(t => t.id === TEAM)!.facets.pitCrew / 100
    const p = 0.04 * (1 - crew * 0.5)
    const rng = createRng(2024)
    const N = 40_000
    let hits = 0, sum = 0
    for (let i = 0; i < N; i++) {
      const [, g2] = gaussianPair(rng)
      const s = slowStopComponent(c, TEAM, g2)
      if (s > 0) { hits++; sum += s }
    }
    expect(Math.abs(hits / N - p)).toBeLessThan(4 * Math.sqrt(p * (1 - p) / N))
    expect(sum / hits).toBeGreaterThan(3.6)
    expect(sum / hits).toBeLessThan(4.4)
  })
})

describe('pitStopTime', () => {
  it('DRAWS EXACTLY TWO rng VALUES (one gaussianPair) whether or not the stop may be slow', () => {
    const c = withPit({ slowStopChance: 0.04 })
    for (const allowSlow of [true, false]) {
      let draws = 0
      const base = createRng(3)
      pitStopTime(c, TEAM, null, () => { draws++; return base() }, { allowSlow })
      expect(draws).toBe(2)
    }
  })

  it('AT A ZERO CHANCE IT IS BYTE-IDENTICAL TO THE PRE-1.6 FORMULA', () => {
    const c = withPit({ slowStopChance: 0 })
    for (const seed of [1, 2, 3, 99]) {
      const [noise] = gaussianPair(createRng(seed))
      const team = c.teams.find(t => t.id === TEAM)!
      const crew = team.facets.pitCrew / 100
      const legacy = c.circuit.pitLaneTimeLoss + (c.tuning.pit.stopMean - crew * c.tuning.pit.pitCrewMeanRelief)
        + noise * (c.tuning.pit.stopSigma * (1 - crew * c.tuning.pit.pitCrewSigmaRelief))
      const cost = pitStopTime(c, TEAM, null, createRng(seed))
      expect(cost.total).toBe(legacy)
      expect(cost.slow).toBe(0)
    }
  })

  it('allowSlow false prices the expected stop: never a slow component', () => {
    const always = withPit({ slowStopChance: 1, pitCrewSlowRelief: 0 })
    const cost = pitStopTime(always, TEAM, null, createRng(8), { allowSlow: false })
    expect(cost.slow).toBe(0)
    const [noise] = gaussianPair(createRng(8))
    const team = always.teams.find(t => t.id === TEAM)!
    const sigma = always.tuning.pit.stopSigma * (1 - team.facets.pitCrew / 100 * always.tuning.pit.pitCrewSigmaRelief)
    expect(cost.total).toBe(expectedPitStopTime(always, TEAM, null) + noise * sigma)
  })
})

describe('slow stops in the race', () => {
  it('every slow stop is logged with its driver and its seconds; at chance 1 every stop is slow', () => {
    const c = withPit({ slowStopChance: 1, pitCrewSlowRelief: 0, slowStopMin: 2, slowStopMax: 6 })
    const final = runRace(c, 5)
    const slow = final.incidents.filter(i => i.kind === 'slow_stop')
    const stops = final.cars.reduce((n, car) => n + car.pitsDone, 0)
    expect(stops, 'premise: the AI stopped').toBeGreaterThan(0)
    expect(slow.length).toBe(stops)
    for (const e of slow) {
      expect(e.driverId).not.toBeNull()
      expect(e.timeLoss!).toBeGreaterThanOrEqual(2)
      expect(e.timeLoss!).toBeLessThanOrEqual(6)
    }
  }, 60_000)

  it('the PIT button can be slow too, and logs it for the player', () => {
    const base = withPit({ slowStopChance: 1, pitCrewSlowRelief: 0 })
    const c: RaceConfig = { ...base, playerDriverId: base.drivers[3]!.id }
    let s = initRace(c)
    const rng = createRng(5)
    for (let i = 0; i < 12; i++) s = stepSector(c, s, rng)
    const before = s.cars.find(x => x.isPlayer)!
    const next = applyPlayerPit(c, s, 'H', rng)!
    const ev = next.incidents[next.incidents.length - 1]!
    expect(ev.kind).toBe('slow_stop')
    expect(ev.driverId).toBe(before.driverId)
    expect(ev.lap).toBe(s.lap)
    expect(ev.sector).toBe(s.sector)
    expect(next.cars.find(x => x.isPlayer)!.raceTime - before.raceTime).toBeGreaterThan(expectedPitStopTime(c, before.teamId, null))
  })

  it('a fast stop leaves the incident log untouched (same array)', () => {
    const base = withPit({ slowStopChance: 0 })
    const c: RaceConfig = { ...base, playerDriverId: base.drivers[3]!.id }
    const s = initRace(c)
    expect(applyPlayerPit(c, s, 'H', createRng(1))!.incidents).toBe(s.incidents)
  })

  it('THE PROJECTION NEVER PRICES A SLOW STOP, even when every live stop is slow', () => {
    const horizonOff = { projection: { horizonLaps: 0, netEstimateHorizonLaps: 0 } }
    const slowCfg = makeConfig({ ...QUIET, ...horizonOff, pit: { slowStopChance: 1, pitCrewSlowRelief: 0 } }, 5)
    const fastCfg = makeConfig({ ...QUIET, ...horizonOff, pit: { slowStopChance: 0 } }, 5)
    const pid = slowCfg.drivers[10]!.id
    const a: RaceConfig = { ...slowCfg, playerDriverId: pid }
    const b: RaceConfig = { ...fastCfg, playerDriverId: pid }
    const s = initRace(b)
    expect(projectPitNow(a, s, 'M', 777)).toEqual(projectPitNow(b, s, 'M', 777))
  })
})

describe('slow-stop commentary (ruling R4)', () => {
  const c = withPit({ slowStopChance: 0 })
  const cfg: RaceConfig = { ...c, playerDriverId: c.drivers[0]!.id }
  function stateWith(loss: number) {
    const s = initRace(cfg)
    const cars = s.cars.map((car, i) => ({ ...car, position: i + 1, raceTime: 100 + i }))
    const rival = cars[5]!
    return { ...s, lap: 8, cars, incidents: [{ lap: 7, sector: 2 as const, kind: 'slow_stop' as const, driverId: rival.driverId, timeLoss: loss }] }
  }
  const linesFor = (loss: number) => processCommentaryTick(stateWith(loss), cfg, { ...makeCommentaryState(), started: true }).lines
  it('announces a rival slow stop that cost a place', () => {
    expect(linesFor(3).some(l => l.includes('slow stop for'))).toBe(true)
  })
  it('stays quiet when the slow seconds did not cost a place', () => {
    expect(linesFor(0.5).some(l => l.includes('slow stop'))).toBe(false)
  })
})

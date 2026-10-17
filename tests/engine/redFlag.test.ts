import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import { rollRedFlag, neutralisationKind, effectivePitLaneLoss, neutralisationPaceMultiplier } from '@engine/incidents'
import { restartTyre, applyRedFlagRestart } from '@engine/redFlag'
import { lapHistory } from '@engine/raceHistory'
import { makeTuning } from '../fixtures/tuning'
import { makeConfig, type TuningOverrides } from '../fixtures/raceHarness'
import { processCommentaryTick, makeCommentaryState } from '@state/commentaryMapper'
import type { RaceConfig, RaceState, CarState, SafetyCarState, Compound } from '@engine/types'

const RED = { crashChance: 1, maxPerRace: 1, minLapsLeft: 5, planWindowLaps: 15 }

// One car (index 5) crashes the first sector it runs under this tuning; every
// other car has consistency 100, which with consistencyReliefMax 1 makes its
// error chance exactly 0, so no other roll is drawn. SC and VSC are certain
// too, to prove the red flag is rolled FIRST.
const CRASH = {
  incidents: {
    driverErrorPerLap: 3, consistencyReliefMax: 1, terminalFraction: 1,
    safetyCar: { crashDeployChance: 1, mechanicalDeployChance: 0 },
    vsc: { crashDeployChance: 1, mechanicalDeployChance: 0 },
    redFlag: RED,
  },
  mechanicalFailure: { baseChancePerLap: 0 },
  tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
}

function crashConfig(overrides: TuningOverrides = {}, laps?: number): RaceConfig {
  const base = makeConfig({ ...CRASH, ...overrides } as TuningOverrides, 9)
  const cfg: RaceConfig = { ...base, drivers: base.drivers.map((d, i) => ({ ...d, facets: { ...d.facets, consistency: i === 5 ? 0 : 100 } })) }
  return laps === undefined ? cfg : { ...cfg, lapsOverride: laps }
}
/** `steps` calm sectors (nobody errs), so the crash lands exactly where the test wants it. */
function midRace(config: RaceConfig, steps: number): RaceState {
  const calm: RaceConfig = { ...config, tuning: { ...config.tuning, incidents: { ...config.tuning.incidents, driverErrorPerLap: 0 } } }
  let s = initRace(calm)
  const rng = createRng(9)
  for (let i = 0; i < steps; i++) s = stepSector(calm, s, rng)
  return s
}
const newEvents = (before: RaceState, after: RaceState) => after.incidents.slice(before.incidents.length).map(i => i.kind)
const active = (s: RaceState) => s.cars.filter(c => !c.retired).sort((a, b) => a.position - b.position)

describe('the red-flag roll', () => {
  it('DRAWS NOTHING at a zero chance', () => {
    let draws = 0
    const counting = () => { draws++; return 0.5 }
    const T = makeTuning({ incidents: { redFlag: { ...RED, crashChance: 0 } } })
    for (let i = 0; i < 50; i++) expect(rollRedFlag(T, counting)).toBe(false)
    expect(draws).toBe(0)
  })

  it('converges on its chance', () => {
    const T = makeTuning({ incidents: { redFlag: { ...RED, crashChance: 0.05 } } })
    const rng = createRng(77)
    let hits = 0
    const N = 20_000
    for (let i = 0; i < N; i++) if (rollRedFlag(T, rng)) hits++
    expect(Math.abs(hits / N - 0.05)).toBeLessThan(4 * Math.sqrt(0.05 * 0.95 / N))
  })
})

describe('kind-aware pace and lane loss', () => {
  const T = makeTuning({})
  const red: SafetyCarState = { deployedLap: 3, lapsRemaining: 0, cause: 'crash', kind: 'red' }
  it('a red flag runs at the safety car pace and would cost the safety car lane price', () => {
    expect(neutralisationKind(red)).toBe('red')
    expect(neutralisationPaceMultiplier(red, T)).toBe(T.incidents.safetyCar.paceMultiplier)
    expect(effectivePitLaneLoss(makeConfig({}, 1).circuit, red, T)).toBe(T.incidents.safetyCar.laneTimeLossUnderSc)
  })
})

describe('deploy and restart', () => {
  it('A CRASH SHOWS THE RED FLAG BEFORE THE SC IS EVEN ROLLED; the restart is at that lap end', () => {
    const config = crashConfig()
    const mid = midRace(config, 30)                         // lap 10, sector 0
    expect(mid.sector).toBe(0)
    const rng = createRng(4)
    const shown = stepSector(config, mid, rng)              // car 5 crashes in sector 0
    expect(newEvents(mid, shown)).toEqual(['crash', 'red_flag'])
    expect(neutralisationKind(shown.safetyCar)).toBe('red')
    const s1 = stepSector(config, shown, rng)               // sector 1, still red, no overtakes
    expect(neutralisationKind(s1.safetyCar)).toBe('red')
    expect(s1.overtakeEvents.length).toBe(shown.overtakeEvents.length)
    expect(s1.sector).toBe(2)
    const restarted = stepSector(config, s1, rng)           // completes lap 10: the restart
    expect(newEvents(s1, restarted)).toEqual(['red_flag_restart'])
    expect(restarted.safetyCar, 'no SC laps after the restart').toBeNull()
    const grid = active(restarted)
    const gap = config.tuning.qualifying.gridSlotGapSec
    grid.forEach((c, i) => expect(c.raceTime - grid[0]!.raceTime, c.driverId).toBeCloseTo(i * gap, 9))
    for (const c of grid) expect(c.tyreAge, `${c.driverId} has fresh tyres`).toBe(0)
  })

  it('A RED FLAG ON THE LAP-COMPLETING TICK waits a whole lap; no countdown ends it; nobody boxes on that boundary', () => {
    const config = crashConfig()
    const mid = midRace(config, 29)                         // lap 9, sector 2
    expect(mid.sector).toBe(2)
    const rng = createRng(4)
    const shown = stepSector(config, mid, rng)              // crash on the lap-completing tick
    expect(shown.sector).toBe(0)
    expect(neutralisationKind(shown.safetyCar)).toBe('red')
    expect(newEvents(mid, shown)).not.toContain('red_flag_restart')
    for (const c of shown.cars) {
      const before = mid.cars.find(b => b.driverId === c.driverId)!
      expect(c.pitsDone, `${c.driverId} boxed under red`).toBe(before.pitsDone)
    }
    let s = shown
    for (let i = 0; i < 2; i++) { s = stepSector(config, s, rng); expect(neutralisationKind(s.safetyCar)).toBe('red') }
    const restarted = stepSector(config, s, rng)
    expect(newEvents(s, restarted)).toEqual(['red_flag_restart'])
  })

  it('a red flag supersedes a running VSC, closing it first', () => {
    const config = crashConfig()
    const mid = midRace(config, 30)
    const withVsc: RaceState = {
      ...mid,
      safetyCar: { deployedLap: mid.lap, lapsRemaining: 3, cause: 'mechanical', kind: 'vsc' },
      incidents: [...mid.incidents, { lap: mid.lap, sector: 0, kind: 'vsc_deployed', driverId: null, timeLoss: null }],
    }
    const shown = stepSector(config, withVsc, createRng(4))
    expect(newEvents(withVsc, shown)).toEqual(['crash', 'vsc_ended', 'red_flag'])
  })

  // Preflight S3: an ineligible tick must draw exactly what a crashChance-0
  // run draws, so an eligibility check moved after the roll fails here.
  function countDraws(config: RaceConfig, from: RaceState): { draws: number; events: string[] } {
    let draws = 0
    const base = createRng(4)
    const after = stepSector(config, from, () => { draws++; return base() })
    return { draws, events: newEvents(from, after) }
  }
  const zeroChance = (c: RaceConfig): RaceConfig => ({
    ...c, tuning: { ...c.tuning, incidents: { ...c.tuning.incidents, redFlag: { ...RED, crashChance: 0 } } },
  })

  it('minLapsLeft is checked before the roll: late in the race the SC comes out instead, with no extra draw', () => {
    const config = crashConfig()
    const late = midRace(config, 3 * 52)                    // bengaluru, 56 laps: lap 52, 4 left
    const on = countDraws(config, late)
    const off = countDraws(zeroChance(config), late)
    expect(on.events).toContain('safety_car_deployed')
    expect(on.events).not.toContain('red_flag')
    expect(on.draws).toBe(off.draws)
  })

  it('maxPerRace is checked before the roll: a second crash rolls the SC, with no extra draw', () => {
    const config = crashConfig()
    const mid = midRace(config, 30)
    const already: RaceState = {
      ...mid,
      incidents: [...mid.incidents, { lap: 3, sector: 0, kind: 'red_flag', driverId: null, timeLoss: null }],
    }
    const on = countDraws(config, already)
    const off = countDraws(zeroChance(config), already)
    expect(on.events).toContain('safety_car_deployed')
    expect(on.events).not.toContain('red_flag')
    expect(on.draws).toBe(off.draws)
  })

  it('the restart grid is the incoming position order, not raceTime (preflight S9)', () => {
    const config = crashConfig()
    const cars = initRace(config).cars.slice(0, 2).map((c, i) => ({ ...c, position: i + 1, raceTime: i === 0 ? 101 : 100 }))
    const out = applyRedFlagRestart(config, cars, 'DRY', 30)
    expect(out[0]!.raceTime).toBe(101)
    expect(out[1]!.raceTime).toBeCloseTo(101 + config.tuning.qualifying.gridSlotGapSec, 9)
  })

  it('the restart frees no one from a car that was out: retired cars stay frozen', () => {
    const config = crashConfig()
    const mid = midRace(config, 30)
    const rng = createRng(4)
    let s = stepSector(config, mid, rng)
    const crashed = s.cars.find(c => c.retired)!
    for (let i = 0; i < 2; i++) s = stepSector(config, s, rng)
    const out = s.cars.find(c => c.driverId === crashed.driverId)!
    expect(out.retired).toBe(true)
    expect(out.raceTime).toBe(crashed.raceTime)
  })
})

describe('the restart tyre (ruling R11)', () => {
  const config = crashConfig()
  const car = (o: Partial<CarState>): CarState => ({ ...initRace(config).cars[0]!, lap: 10, ...o })
  const plan = (lap: number, compound: Compound) => ({ ...car({}).strategy, plannedStops: [{ lap, compound }] })

  it('dry: a planned stop within the window is fitted and consumed', () => {
    expect(restartTyre(config, car({ strategy: plan(20, 'H') }), 'DRY', 30)).toEqual({ compound: 'H', consumesPlan: true })
  })
  it('dry: a planned stop beyond the window keeps the current compound, fresh', () => {
    expect(restartTyre(config, car({ compound: 'M', strategy: plan(40, 'H') }), 'DRY', 30)).toEqual({ compound: 'M', consumesPlan: false })
  })
  it('dry: off wets with no plan in reach, the AI best dry compound', () => {
    expect(restartTyre(config, car({ compound: 'I', strategy: plan(40, 'H') }), 'DRY', 10)).toEqual({ compound: 'S', consumesPlan: false })
  })
  it('wet or damp: the weather family, plan untouched', () => {
    expect(restartTyre(config, car({ strategy: plan(12, 'H') }), 'WET', 30)).toEqual({ compound: 'W', consumesPlan: false })
    expect(restartTyre(config, car({ strategy: plan(12, 'H') }), 'DAMP', 30)).toEqual({ compound: 'I', consumesPlan: false })
  })
  it('a chosen compound is fitted; the plan is still consumed by the same rule', () => {
    expect(restartTyre(config, car({ strategy: plan(20, 'H') }), 'DRY', 30, 'S')).toEqual({ compound: 'S', consumesPlan: true })
  })
  it('a car with no sets left keeps its tyres, but is still regridded', () => {
    const c = car({ tyreAllocation: { S: 0, M: 0, H: 0, I: 0, W: 0 }, tyreAge: 9, raceTime: 500 })
    const [out] = applyRedFlagRestart(config, [c], 'DRY', 30)
    expect(out!.tyreAge).toBe(9)
    expect(out!.raceTime).toBe(500)
  })
})

describe('the record', () => {
  it('lapHistory draws the red flag as a red period', () => {
    const config = crashConfig({}, 20)
    const h = lapHistory(config, 9, [])
    expect(h.neutralisations.some(n => n.kind === 'red')).toBe(true)
  })

  it('commentary announces the stoppage and the restart', () => {
    const config = crashConfig()
    const mid = midRace(config, 30)
    const rng = createRng(4)
    const shown = stepSector(config, mid, rng)
    const first = processCommentaryTick(shown, config, makeCommentaryState(mid))
    expect(first.lines.some(l => l.includes('RED FLAG'))).toBe(true)
    let s = shown
    for (let i = 0; i < 2; i++) s = stepSector(config, s, rng)
    const second = processCommentaryTick(s, config, first.next)
    expect(second.lines.some(l => l.includes('restart'))).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { initRace, stepSector, computeSectorTime } from '@engine/index'
import { createRng } from '@engine/rng'
import {
  neutralisationKind, rollVscDeployment, rollVscDuration,
  neutralisationPaceMultiplier, effectivePitLaneLoss,
} from '@engine/incidents'
import { makeTuning } from '../fixtures/tuning'
import { makeConfig, runRace, type TuningOverrides } from '../fixtures/raceHarness'
import { loadGameData } from '@data/validators'
import type { RaceConfig, RaceState, SafetyCarState, IncidentEvent } from '@engine/types'

const DATA = loadGameData()

// The spec's start values with the chances switched on. tuning.json ships the
// chances at 0 until Task 2, so every test states the VSC it wants.
const VSC_ON = {
  crashDeployChance: 0.25, mechanicalDeployChance: 0.40, paceMultiplier: 1.30,
  laneLossFactor: 0.60, durationLapsMin: 1, durationLapsMax: 3, maxPerRace: 2,
}

// Every retirement is a crash, the SC never comes out, a crash always brings the VSC.
const VSC_CERTAIN = {
  incidents: {
    driverErrorPerLap: 0.05, terminalFraction: 1,
    safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 },
    vsc: { ...VSC_ON, crashDeployChance: 1, mechanicalDeployChance: 0 },
  },
  mechanicalFailure: { baseChancePerLap: 0 },
  tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
}

const NEUTRALISATION_KINDS = ['safety_car_deployed', 'safety_car_ended', 'vsc_deployed', 'vsc_ended']
const neutralisationEvents = (incidents: IncidentEvent[]) => incidents.filter(i => NEUTRALISATION_KINDS.includes(i.kind))

describe('VSC rolls', () => {
  it('DRAWS NOTHING when both VSC chances are zero', () => {
    const zeroed = makeTuning({ incidents: { vsc: { crashDeployChance: 0, mechanicalDeployChance: 0 } } })
    let draws = 0
    const counting = () => { draws++; return 0.5 }
    for (const cause of ['crash', 'mechanical'] as const) {
      for (let i = 0; i < 100; i++) expect(rollVscDeployment(cause, zeroed, counting)).toBe(false)
    }
    expect(draws, 'rng() must not be called at a zero VSC chance').toBe(0)
  })

  it('converges on the configured chance for each cause', () => {
    const T = makeTuning({ incidents: { vsc: VSC_ON } })
    const N = 20_000
    for (const [cause, p] of [['crash', 0.25], ['mechanical', 0.40]] as const) {
      const rng = createRng(cause === 'crash' ? 31 : 37)
      let hits = 0
      for (let i = 0; i < N; i++) if (rollVscDeployment(cause, T, rng)) hits++
      const se = Math.sqrt(p * (1 - p) / N)
      expect(Math.abs(hits / N - p), `${cause} VSC rate`).toBeLessThan(4 * se)
    }
  })

  it('duration stays within the inclusive bounds and covers them', () => {
    const T = makeTuning({ incidents: { vsc: VSC_ON } })
    const rng = createRng(19)
    const seen = new Set<number>()
    for (let i = 0; i < 5_000; i++) {
      const d = rollVscDuration(T, rng)
      expect(d).toBeGreaterThanOrEqual(1)
      expect(d).toBeLessThanOrEqual(3)
      seen.add(d)
    }
    expect([...seen].sort()).toEqual([1, 2, 3])
  })
})

describe('neutralisation kind, pace and pit loss', () => {
  const T = makeTuning({ incidents: { vsc: VSC_ON } })
  const legacy: SafetyCarState = { deployedLap: 4, lapsRemaining: 2, cause: 'crash' }
  const vsc: SafetyCarState = { ...legacy, kind: 'vsc' }
  const sc: SafetyCarState = { ...legacy, kind: 'sc' }

  it('reads a missing kind as the safety car, so older states keep their meaning', () => {
    expect(neutralisationKind(null)).toBeNull()
    expect(neutralisationKind(legacy)).toBe('sc')
    expect(neutralisationKind(sc)).toBe('sc')
    expect(neutralisationKind(vsc)).toBe('vsc')
  })

  it('scales pace by the kind in force', () => {
    expect(neutralisationPaceMultiplier(null, T)).toBe(1)
    expect(neutralisationPaceMultiplier(sc, T)).toBe(T.incidents.safetyCar.paceMultiplier)
    expect(neutralisationPaceMultiplier(legacy, T)).toBe(T.incidents.safetyCar.paceMultiplier)
    expect(neutralisationPaceMultiplier(vsc, T)).toBe(1.30)
  })

  it('prices a VSC stop at the circuit loss times laneLossFactor, an SC stop at laneTimeLossUnderSc', () => {
    const circuit = DATA.circuits['bengaluru']!   // pitLaneTimeLoss 20
    expect(effectivePitLaneLoss(circuit, null, T)).toBe(20)
    expect(effectivePitLaneLoss(circuit, vsc, T)).toBeCloseTo(12, 9)
    expect(effectivePitLaneLoss(circuit, sc, T)).toBe(T.incidents.safetyCar.laneTimeLossUnderSc)
    expect(effectivePitLaneLoss(circuit, legacy, T)).toBe(T.incidents.safetyCar.laneTimeLossUnderSc)
  })

  it('a VSC sector is the green sector scaled by vsc.paceMultiplier, with the same draws', () => {
    const config = makeConfig({ incidents: { vsc: VSC_ON } }, 5)
    const car = initRace(config).cars[3]!
    const green = computeSectorTime(config, car, 1, createRng(77), 'DRY', null)
    const under = computeSectorTime(config, car, 1, createRng(77), 'DRY', vsc)
    expect(under.sectorTime / green.sectorTime).toBeCloseTo(1.30, 10)
  })
})

describe('VSC in the race loop', () => {
  it('a crash deploys the VSC when the SC does not come out', () => {
    const config = makeConfig(VSC_CERTAIN as TuningOverrides, 5)
    let sawVsc = false
    const final = runRace(config, 5, (_p, next) => { if (next.safetyCar?.kind === 'vsc') sawVsc = true })
    const deployed = final.incidents.filter(i => i.kind === 'vsc_deployed')
    expect(deployed.length).toBeGreaterThan(0)
    expect(sawVsc, 'safetyCar.kind must be vsc mid-race').toBe(true)
    for (const e of deployed) expect(e.driverId).toBeNull()
    expect(final.incidents.filter(i => i.kind === 'safety_car_deployed')).toHaveLength(0)
  }, 60_000)

  it('a mechanical retirement deploys a VSC with cause mechanical (trigger split by cause)', () => {
    // Mechanical failures on and certain, crashes off; only the mechanical VSC chance is live.
    const config = makeConfig({
      incidents: {
        driverErrorPerLap: 0, terminalFraction: 1,
        safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 },
        vsc: { ...VSC_ON, crashDeployChance: 0, mechanicalDeployChance: 1 },
      },
      mechanicalFailure: { baseChancePerLap: 0.1 },
      tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
    } as TuningOverrides, 5)
    const causes = new Set<string>()
    const final = runRace(config, 5, (_p, next) => { if (next.safetyCar?.kind === 'vsc') causes.add(next.safetyCar.cause) })
    expect(final.incidents.filter(i => i.kind === 'vsc_deployed').length, 'premise: a VSC deployed').toBeGreaterThan(0)
    expect(final.cars.some(c => c.retiredCause === 'crash'), 'premise: no crashes').toBe(false)
    expect([...causes]).toEqual(['mechanical'])
  }, 60_000)

  it('the SC is rolled FIRST: with both certain, a crash brings the SC, and a VSC never opens under it', () => {
    const config = makeConfig({
      ...VSC_CERTAIN,
      incidents: { ...VSC_CERTAIN.incidents, safetyCar: { crashDeployChance: 1, mechanicalDeployChance: 0, maxPerRace: 1 } },
    } as TuningOverrides, 5)
    let vscUnderSc = false
    const final = runRace(config, 5, (prev, next) => {
      if (prev.safetyCar?.kind === 'sc' && next.safetyCar?.kind === 'vsc') vscUnderSc = true
    })
    expect(neutralisationEvents(final.incidents)[0]?.kind).toBe('safety_car_deployed')
    expect(vscUnderSc).toBe(false)
  }, 60_000)

  it('respects vsc.maxPerRace', () => {
    const config = makeConfig({
      ...VSC_CERTAIN,
      incidents: {
        ...VSC_CERTAIN.incidents, driverErrorPerLap: 0.15,
        vsc: { ...VSC_CERTAIN.incidents.vsc, maxPerRace: 1, durationLapsMin: 1, durationLapsMax: 1 },
      },
    } as TuningOverrides, 5)
    const n = runRace(config, 5).incidents.filter(i => i.kind === 'vsc_deployed').length
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThanOrEqual(1)
  }, 60_000)

  it('does not bunch the field: gapCompression has no effect on a race whose only neutralisations are VSCs', () => {
    // Fails if a VSC deployment runs compressRaceTimes: the two races would then differ.
    const with35 = runRace(makeConfig({ ...VSC_CERTAIN, incidents: { ...VSC_CERTAIN.incidents, safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0, gapCompression: 0.35 } } } as TuningOverrides, 5), 5)
    const with100 = runRace(makeConfig({ ...VSC_CERTAIN, incidents: { ...VSC_CERTAIN.incidents, safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0, gapCompression: 1.0 } } } as TuningOverrides, 5), 5)
    expect(with35.incidents.some(i => i.kind === 'vsc_deployed'), 'premise: a VSC deployed').toBe(true)
    expect(JSON.stringify(with35)).toBe(JSON.stringify(with100))
  }, 60_000)

  it('suspends overtaking while a VSC is out', () => {
    const config = makeConfig(VSC_CERTAIN as TuningOverrides, 5)
    let vscTicks = 0
    runRace(config, 5, (prev, next) => {
      if (prev.safetyCar?.kind !== 'vsc') return
      vscTicks++
      expect(next.overtakeEvents.length, `lap ${prev.lap} sector ${prev.sector}`).toBe(prev.overtakeEvents.length)
    })
    expect(vscTicks, 'premise: some ticks ran under a VSC').toBeGreaterThan(0)
  }, 60_000)

  it('logs vsc_ended when a VSC runs out', () => {
    const config = makeConfig(VSC_CERTAIN as TuningOverrides, 5)
    const final = runRace(config, 5)
    const deployed = final.incidents.filter(i => i.kind === 'vsc_deployed').length
    const ended = final.incidents.filter(i => i.kind === 'vsc_ended').length
    expect(ended).toBeGreaterThan(0)
    expect(deployed - ended, 'at most one VSC may still be out at the flag').toBeLessThanOrEqual(1)
    expect(deployed - ended).toBeGreaterThanOrEqual(0)
  }, 60_000)
})

describe('supersession', () => {
  // One car (index 5) errs on every sector and every error is terminal; the
  // other nineteen have consistency 100, which with consistencyReliefMax 1 makes
  // their error chance exactly 0, so the roll short-circuits for them.
  const ONE_CRASH = {
    incidents: {
      driverErrorPerLap: 3, consistencyReliefMax: 1, terminalFraction: 1,
      safetyCar: { crashDeployChance: 1, mechanicalDeployChance: 0 },
      vsc: { ...VSC_ON, crashDeployChance: 1, mechanicalDeployChance: 1 },
    },
    mechanicalFailure: { baseChancePerLap: 0 },
    tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
  }
  function crashConfig(gapCompression: number): RaceConfig {
    const base = makeConfig({ ...ONE_CRASH, incidents: { ...ONE_CRASH.incidents, safetyCar: { ...ONE_CRASH.incidents.safetyCar, gapCompression } } } as TuningOverrides, 9)
    return {
      ...base,
      drivers: base.drivers.map((d, i) => ({ ...d, facets: { ...d.facets, consistency: i === 5 ? 0 : 100 } })),
    }
  }
  function midRace(config: RaceConfig): RaceState {
    const calm: RaceConfig = { ...config, tuning: { ...config.tuning, incidents: { ...config.tuning.incidents, driverErrorPerLap: 0 } } }
    let s = initRace(calm)
    const rng = createRng(9)
    for (let i = 0; i < 30; i++) s = stepSector(calm, s, rng)
    return s
  }
  const spread = (s: RaceState) => {
    const active = s.cars.filter(c => !c.retired)
    const lead = Math.min(...active.map(c => c.raceTime))
    return Math.max(...active.map(c => c.raceTime - lead))
  }

  it('an SC SUPERSEDES a running VSC: vsc_ended then safety_car_deployed on the same tick, and the field is compressed', () => {
    const run = (gapCompression: number) => {
      const config = crashConfig(gapCompression)
      const mid = midRace(config)
      const withVsc: RaceState = {
        ...mid,
        safetyCar: { deployedLap: mid.lap, lapsRemaining: 3, cause: 'mechanical', kind: 'vsc' },
        incidents: [...mid.incidents, { lap: mid.lap, sector: 0, kind: 'vsc_deployed', driverId: null, timeLoss: null }],
      }
      return { before: withVsc, after: stepSector(config, withVsc, createRng(4)) }
    }
    const { before, after } = run(0.35)
    expect(after.safetyCar?.kind).toBe('sc')
    const fresh = neutralisationEvents(after.incidents.slice(before.incidents.length)).map(e => e.kind)
    expect(fresh).toEqual(['vsc_ended', 'safety_car_deployed'])
    expect(spread(after), 'the SC compresses the field even when it replaces a VSC')
      .toBeLessThan(spread(run(1.0).after))
  })

  it('a VSC NEVER supersedes an SC', () => {
    const config = crashConfig(0.35)
    const mid = midRace(config)
    const withSc: RaceState = {
      ...mid,
      safetyCar: { deployedLap: mid.lap, lapsRemaining: 3, cause: 'crash', kind: 'sc' },
      incidents: [...mid.incidents, { lap: mid.lap, sector: 0, kind: 'safety_car_deployed', driverId: null, timeLoss: null }],
    }
    const after = stepSector(config, withSc, createRng(4))
    expect(after.cars.some(c => c.retiredCause === 'crash' && !mid.cars.find(m => m.driverId === c.driverId)!.retired),
      'premise: a car crashed this tick').toBe(true)
    expect(after.safetyCar?.kind).toBe('sc')
    expect(after.safetyCar?.deployedLap).toBe(mid.lap)
    expect(neutralisationEvents(after.incidents.slice(withSc.incidents.length))).toEqual([])
  })
})

describe('VSC countdown starts at the next lap boundary (final review fix 1)', () => {
  // Same one-crasher field as the supersession block: car 5 errs every sector
  // and every error is terminal; the other nineteen never err.
  function oneCrasher(neutralisation: 'sc' | 'vsc'): RaceConfig {
    const base = makeConfig({
      incidents: {
        driverErrorPerLap: 3, consistencyReliefMax: 1, terminalFraction: 1,
        safetyCar: neutralisation === 'sc'
          ? { crashDeployChance: 1, mechanicalDeployChance: 0, durationLapsMin: 1, durationLapsMax: 1 }
          : { crashDeployChance: 0, mechanicalDeployChance: 0 },
        vsc: { ...VSC_ON, crashDeployChance: neutralisation === 'vsc' ? 1 : 0, mechanicalDeployChance: 0, durationLapsMin: 1, durationLapsMax: 1 },
      },
      mechanicalFailure: { baseChancePerLap: 0 },
      tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
    } as TuningOverrides, 9)
    return { ...base, drivers: base.drivers.map((d, i) => ({ ...d, facets: { ...d.facets, consistency: i === 5 ? 0 : 100 } })) }
  }
  // Calm until a sector-2 tick, so the crash lands on the lap boundary.
  function atSector2(config: RaceConfig): RaceState {
    const calm: RaceConfig = { ...config, tuning: { ...config.tuning, incidents: { ...config.tuning.incidents, driverErrorPerLap: 0 } } }
    let s = initRace(calm)
    const rng = createRng(9)
    for (let i = 0; i < 32; i++) s = stepSector(calm, s, rng)
    expect(s.sector, 'premise: the next tick is a sector-2 tick').toBe(2)
    return s
  }

  it('a 1-lap VSC deployed on a sector-2 tick is still out after that tick, and ends at the next boundary', () => {
    const config = oneCrasher('vsc')
    let s = atSector2(config)
    const before = s.incidents.length
    const rng = createRng(4)
    s = stepSector(config, s, rng)
    expect(neutralisationEvents(s.incidents.slice(before)).map(e => e.kind)).toEqual(['vsc_deployed'])
    expect(neutralisationKind(s.safetyCar)).toBe('vsc')
    for (let i = 0; i < 3; i++) s = stepSector(config, s, rng)
    expect(neutralisationEvents(s.incidents.slice(before)).map(e => e.kind)).toEqual(['vsc_deployed', 'vsc_ended'])
    expect(s.safetyCar).toBeNull()
  })

  it('SC unchanged: a 1-lap SC deployed on a sector-2 tick is counted down on that same tick', () => {
    const config = oneCrasher('sc')
    const s = atSector2(config)
    const after = stepSector(config, s, createRng(4))
    expect(neutralisationEvents(after.incidents.slice(s.incidents.length)).map(e => e.kind))
      .toEqual(['safety_car_deployed', 'safety_car_ended'])
    expect(after.safetyCar).toBeNull()
  })

  it('across many seeds, no tick both deploys and ends a VSC, and a deployed VSC is always live after its tick', () => {
    const SEEDS = 40
    let boundaryDeploys = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const config = { ...makeConfig({
        ...VSC_CERTAIN,
        incidents: { ...VSC_CERTAIN.incidents, driverErrorPerLap: 0.15, vsc: { ...VSC_CERTAIN.incidents.vsc, durationLapsMin: 1, durationLapsMax: 1 } },
      } as TuningOverrides, seed), lapsOverride: 20 }
      runRace(config, seed, (prev, next) => {
        const fresh = next.incidents.slice(prev.incidents.length).map(e => e.kind)
        if (!fresh.includes('vsc_deployed')) return
        if (prev.sector === 2) boundaryDeploys++
        expect(fresh, `seed ${seed} lap ${prev.lap} sector ${prev.sector}`).not.toContain('vsc_ended')
        expect(neutralisationKind(next.safetyCar), `seed ${seed} lap ${prev.lap}`).toBe('vsc')
      })
    }
    expect(boundaryDeploys, 'premise: some VSCs deployed on a sector-2 tick').toBeGreaterThan(0)
  }, 120_000)
})

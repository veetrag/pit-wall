import { describe, it, expect } from 'vitest'
import { detectRadioRequest, makeRequestTracker, boxRequestCompound, type RequestTracker } from '@state/radioRequests'
import { tyreCliffFraction, effectiveTyreAge } from '@engine/tyres'
import { makeDeterministicTuning } from '../fixtures/tuning'
import type { RaceConfig, RaceState, CarState, CircuitSpec, CompoundSpec, SectorResult, WeatherState, SafetyCarState, Compound } from '@engine/types'

const CIRCUIT: CircuitSpec = {
  name: 'Test', laps: 30, sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25], driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55], pitLaneTimeLoss: 22.0,
}
const COMPOUNDS: Record<string, CompoundSpec> = {
  S: { name: 'Soft', type: 'dry', offset: -0.8, lin: 0.06, cliff: 10, pen: 0.10, colorToken: '--tyre-soft' },
  M: { name: 'Medium', type: 'dry', offset: 0.0, lin: 0.04, cliff: 16, pen: 0.07, colorToken: '--tyre-medium' },
  H: { name: 'Hard', type: 'dry', offset: 0.6, lin: 0.025, cliff: 24, pen: 0.045, colorToken: '--tyre-hard' },
  I: { name: 'Inter', type: 'wet', offset: 0, lin: 0.018, cliff: 30, pen: 0.015, colorToken: '--tyre-inter' },
  W: { name: 'Wet', type: 'wet', offset: 1, lin: 0.012, cliff: 40, pen: 0.01, colorToken: '--tyre-wet' },
}
const facets = { pace: 70, racecraft: 80, tyreManagement: 80, consistency: 90, wetWeather: 80, experience: 80 }
const team = { power: 80, aero: 80, handling: 80, reliability: 99, pitCrew: 80 }
function config(plannedStops: { lap: number; compound: Compound }[] | null): RaceConfig {
  return {
    circuit: CIRCUIT, tuning: makeDeterministicTuning(), compounds: COMPOUNDS,
    drivers: [
      { id: 'me', name: 'Me', code: 'MEE', teamId: 't1', facets },
      { id: 'rv', name: 'Rival', code: 'RIV', teamId: 't2', facets },
    ],
    teams: [
      { id: 't1', name: 'A', colorPrimary: '#fff', colorSecondary: '#000', facets: team },
      { id: 't2', name: 'B', colorPrimary: '#fff', colorSecondary: '#000', facets: team },
    ],
    strategies: [], playerDriverId: 'me', seed: 1,
    ...(plannedStops ? { playerStrategyOverride: { teamId: 't1', startCompound: 'M' as const, plannedStops } } : {}),
  }
}
function car(id: string, o: Partial<CarState>): CarState {
  return {
    driverId: id, teamId: id === 'me' ? 't1' : 't2', position: 1, raceTime: 0, lap: 10, sector: 0, compound: 'M', tyreAge: 2,
    paceMode: 'neutral', pitted: false, pitsDone: 0, strategy: { teamId: 't1', startCompound: 'M', plannedStops: [] },
    isPlayer: id === 'me', tyreAllocation: { S: 4, M: 4, H: 4, I: 3, W: 3 }, compoundsUsed: ['M'], lapsInDirtyAir: 0,
    retired: false, retiredLap: null, retiredCause: null, ...o,
  }
}
/** Lap `lap` just ended. The player is P2, `gap` behind the rival; lap times are the sums of three sectors. */
function lapEnd(lap: number, o: { gap?: number; myLap?: number; theirLap?: number; me?: Partial<CarState>; plan?: { lap: number; compound: Compound }[]; weather?: WeatherState; safetyCar?: SafetyCarState | null } = {}): RaceState {
  const gap = o.gap ?? 0.8
  const sr = (id: string, t: number): SectorResult[] => [0, 1, 2].map(() => ({ driverId: id, sectorTime: t / 3, tyreContribution: 0, trafficPenalty: 0, noiseSample: 0, spinLoss: 0 }))
  const me = car('me', { position: 2, raceTime: 1000 + gap, lap, strategy: { teamId: 't1', startCompound: 'M', plannedStops: o.plan ?? [] }, ...o.me })
  const rv = car('rv', { position: 1, raceTime: 1000, lap })
  return {
    lap, sector: 0, totalLaps: 30, cars: [rv, me],
    sectorResults: [...sr('rv', o.theirLap ?? 90), ...sr('me', o.myLap ?? 89.8)],
    overtakeEvents: [], safetyCar: o.safetyCar ?? null, incidents: [], trackEvolutionLaps: lap, rngState: 1,
    weatherTimeline: Array(30).fill(o.weather ?? 'DRY') as WeatherState[], weatherState: o.weather ?? 'DRY',
  }
}
const CTX = { inPit: false, pitPanelOpen: false, pending: false }
const WORN: Partial<CarState> = { tyreAge: 25 }

/** Runs consecutive lap ends through the detector, threading the tracker. */
function run(states: RaceState[], cfg: RaceConfig, ctx = CTX, t0: RequestTracker = makeRequestTracker()) {
  let t = t0
  return states.map(s => { const out = detectRadioRequest(s, cfg, t, ctx); t = out.tracker; return out.request })
}

describe('box request', () => {
  it('asks when the tyres are past boxCliffFrac and no stop is planned soon', () => {
    const [req] = run([lapEnd(10, { me: WORN })], config(null))
    expect(req).toEqual({ kind: 'box', lap: 10, aheadId: null, compound: 'M' })
  })

  it('stays quiet with a planned stop within 2 laps, with 3 or fewer laps left, in the pit, or with the panel open', () => {
    expect(run([lapEnd(10, { me: WORN, plan: [{ lap: 12, compound: 'H' }] })], config([{ lap: 12, compound: 'H' }]))[0]).toBeNull()
    expect(run([lapEnd(27, { me: WORN })], config(null))[0]).toBeNull()
    expect(run([lapEnd(10, { me: WORN })], config(null), { ...CTX, inPit: true })[0]).toBeNull()
    expect(run([lapEnd(10, { me: WORN })], config(null), { ...CTX, pitPanelOpen: true })[0]).toBeNull()
  })

  it('asks once per stint: never again until the player has stopped', () => {
    const reqs = run([10, 16, 22].map(l => lapEnd(l, { me: WORN })), config(null))
    expect(reqs.map(r => r?.kind ?? null)).toEqual(['box', null, null])
    const after = run([lapEnd(10, { me: WORN }), lapEnd(16, { me: { ...WORN, pitsDone: 1 } })], config(null))
    expect(after.map(r => r?.kind ?? null)).toEqual(['box', 'box'])
  })

  it('fits the next planned compound, else the weather family, else bestDryCompound', () => {
    expect(boxRequestCompound(config([{ lap: 20, compound: 'H' }]), lapEnd(10, { plan: [{ lap: 20, compound: 'H' }] }))).toBe('H')
    expect(boxRequestCompound(config(null), lapEnd(10, { weather: 'DAMP' }))).toBe('I')
    expect(boxRequestCompound(config(null), lapEnd(10, { weather: 'WET' }))).toBe('W')
    expect(boxRequestCompound(config(null), lapEnd(25))).toBe('S')   // 5 laps left
  })
})

describe('push request', () => {
  it('ASKS ONLY AFTER TWO CONSECUTIVE CLOSE LAP ENDS, naming the car ahead', () => {
    const reqs = run([lapEnd(10), lapEnd(11)], config(null))
    expect(reqs[0]).toBeNull()
    expect(reqs[1]).toEqual({ kind: 'push', lap: 11, aheadId: 'rv', compound: null })
  })

  it('needs the last lap at least 0.1 s faster, cliff < 0.5, and not already pushing', () => {
    expect(run([lapEnd(10), lapEnd(11, { myLap: 89.95 })], config(null))[1]).toBeNull()
    expect(run([lapEnd(10, { me: { tyreAge: 12 } }), lapEnd(11, { me: { tyreAge: 12 } })], config(null))[1]).toBeNull()
    expect(run([lapEnd(10, { me: { paceMode: 'push' } }), lapEnd(11, { me: { paceMode: 'push' } })], config(null))[1]).toBeNull()
  })

  it('a gap over pushGap breaks the streak', () => {
    expect(run([lapEnd(10), lapEnd(11, { gap: 1.4 }), lapEnd(12)], config(null)).map(r => r?.kind ?? null)).toEqual([null, null, null])
  })

  it('never under a neutralisation', () => {
    const vsc: SafetyCarState = { deployedLap: 9, lapsRemaining: 2, cause: 'crash', kind: 'vsc' }
    expect(run([lapEnd(10, { safetyCar: vsc }), lapEnd(11, { safetyCar: vsc })], config(null))[1]).toBeNull()
  })
})

describe('limits', () => {
  it('per-kind cooldown of cooldownLaps laps, and maxPerRace in total', () => {
    const laps = Array.from({ length: 18 }, (_, i) => 5 + i)
    const reqs = run(laps.map(l => lapEnd(l)), config(null)).filter(Boolean)
    // push at lap 6 (second close lap end), then every 6 laps: 12, 18 -- then the cap.
    expect(reqs.map(r => r!.lap)).toEqual([6, 12, 18])
  })

  it('nothing while a request is pending, nothing twice on one lap, nothing mid-lap', () => {
    expect(run([lapEnd(10, { me: WORN })], config(null), { ...CTX, pending: true })[0]).toBeNull()
    const once = run([lapEnd(10, { me: WORN }), lapEnd(10, { me: { ...WORN, pitsDone: 1 } })], config(null))
    expect(once[1]).toBeNull()
    expect(run([{ ...lapEnd(10, { me: WORN }), sector: 1 }], config(null))[0]).toBeNull()
  })

  it('pure: the same inputs give the same output, and the input tracker is not mutated', () => {
    const t = makeRequestTracker()
    const snapshot = JSON.stringify(t)
    const a = detectRadioRequest(lapEnd(10, { me: WORN }), config(null), t, CTX)
    const b = detectRadioRequest(lapEnd(10, { me: WORN }), config(null), t, CTX)
    expect(a).toEqual(b)
    expect(JSON.stringify(t)).toBe(snapshot)
  })
})

describe('fix round 1', () => {
  it('a tracker survives a JSON round-trip and still allows a first request on an early lap', () => {
    const t = JSON.parse(JSON.stringify(makeRequestTracker())) as RequestTracker
    expect(run([lapEnd(8, { me: WORN })], config(null), CTX, t)[0]?.kind).toBe('box')
  })

  it('maxPerRace is enforced', () => {
    const t = { ...makeRequestTracker(), asked: 3 }
    expect(run([lapEnd(10, { me: WORN })], config(null), CTX, t)[0]).toBeNull()
    const t2 = { ...makeRequestTracker(), asked: 2 }
    expect(run([lapEnd(10, { me: WORN })], config(null), CTX, t2)[0]?.kind).toBe('box')
  })

  it('a neutralised lap end resets the push streak', () => {
    const vsc: SafetyCarState = { deployedLap: 9, lapsRemaining: 2, cause: 'crash', kind: 'vsc' }
    const reqs = run([lapEnd(10), lapEnd(11, { safetyCar: vsc }), lapEnd(12)], config(null))
    expect(reqs.map(r => r?.kind ?? null)).toEqual([null, null, null])
  })

  it('a skipped lap resets the push streak', () => {
    expect(run([lapEnd(10), lapEnd(12)], config(null))[1]).toBeNull()
  })

  it('boundaries: cliff exactly at boxCliffFrac asks; gap exactly pushGap counts; a plan 3 laps out does not suppress', () => {
    const cfg = config(null)
    const s = lapEnd(10, { me: { tyreAge: 12 } })
    const me = s.cars.find(c => c.isPlayer)!
    const drv = cfg.drivers.find(d => d.id === 'me')!
    const frac = tyreCliffFraction(COMPOUNDS['M']!, effectiveTyreAge(me, drv, 'DRY', cfg.tuning))
    const exact = { ...cfg, tuning: { ...cfg.tuning, radioRequests: { ...cfg.tuning.radioRequests, boxCliffFrac: frac } } }
    expect(run([s], exact)[0]?.kind).toBe('box')
    expect(run([lapEnd(10, { gap: 1.0 }), lapEnd(11, { gap: 1.0 })], config(null))[1]?.kind).toBe('push')
    const plan = [{ lap: 13, compound: 'H' as Compound }]
    expect(run([lapEnd(10, { me: WORN, plan })], config(plan))[0]?.kind).toBe('box')
  })

  it('a real safety car suppresses push', () => {
    const sc: SafetyCarState = { deployedLap: 9, lapsRemaining: 3, cause: 'crash' }
    expect(run([lapEnd(10, { safetyCar: sc }), lapEnd(11, { safetyCar: sc })], config(null))[1]).toBeNull()
  })
})

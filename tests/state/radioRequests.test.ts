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
function lapEnd(lap: number, o: { gap?: number; myLap?: number; theirLap?: number; me?: Partial<CarState>; plan?: { lap: number; compound: Compound }[]; weather?: WeatherState; safetyCar?: SafetyCarState | null; timeline?: WeatherState[] } = {}): RaceState {
  const gap = o.gap ?? 0.8
  const sr = (id: string, t: number): SectorResult[] => [0, 1, 2].map(() => ({ driverId: id, sectorTime: t / 3, tyreContribution: 0, trafficPenalty: 0, noiseSample: 0, spinLoss: 0 }))
  const me = car('me', { position: 2, raceTime: 1000 + gap, lap, strategy: { teamId: 't1', startCompound: 'M', plannedStops: o.plan ?? [] }, ...o.me })
  const rv = car('rv', { position: 1, raceTime: 1000, lap })
  return {
    lap, sector: 0, totalLaps: 30, cars: [rv, me],
    sectorResults: [...sr('rv', o.theirLap ?? 90), ...sr('me', o.myLap ?? 89.8)],
    overtakeEvents: [], safetyCar: o.safetyCar ?? null, incidents: [], trackEvolutionLaps: lap, rngState: 1,
    weatherTimeline: o.timeline ?? Array(30).fill(o.weather ?? 'DRY') as WeatherState[], weatherState: o.weather ?? 'DRY',
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
  it('no request of either kind under a red flag', () => {
    const red: SafetyCarState = { deployedLap: 9, lapsRemaining: 0, cause: 'crash', kind: 'red' }
    expect(run([lapEnd(10, { me: WORN, safetyCar: red })], config(null))[0]).toBeNull()
  })

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

/** Laps 0..wetFrom-1 dry, then `w` to the flag. */
function rainFrom(wetFrom: number, w: WeatherState = 'DAMP'): WeatherState[] {
  return Array.from({ length: 30 }, (_, i) => (i < wetFrom ? 'DRY' : w))
}
/** Lap `lap` just ended under the timeline: weatherState is timeline[lap-1], as at a lap boundary. */
function wetEnd(lap: number, timeline: WeatherState[], me: Partial<CarState> = {}): RaceState {
  return lapEnd(lap, { timeline, weather: timeline[lap - 1]!, gap: 5, me })
}

/** The shipped AI weather rule (tuning.json): confirm 2 laps, none with 3 or fewer left. */
function rcfg(plan: { lap: number; compound: Compound }[] | null): RaceConfig {
  const c = config(plan)
  return { ...c, tuning: { ...c.tuning, ai: { ...c.tuning.ai, weatherConfirmLaps: 2, weatherMinLapsLeft: 3 } } }
}

describe('rain request (1.6.2)', () => {
  it('asks for inters once DAMP has held for ai.weatherConfirmLaps completed laps on slicks', () => {
    const tl = rainFrom(9)                                         // laps 10, 11 ... are damp (index 9+)
    const reqs = run([10, 11].map(l => wetEnd(l, tl)), rcfg(null))
    expect(reqs[0]).toBeNull()                                     // one damp lap: not confirmed (confirm = 2)
    expect(reqs[1]).toEqual({ kind: 'rain', lap: 11, aheadId: null, compound: 'I' })
  })

  it('a WET track asks for full wets at once, like the AI', () => {
    const [req] = run([wetEnd(10, rainFrom(9, 'WET'))], rcfg(null))
    expect(req).toEqual({ kind: 'rain', lap: 10, aheadId: null, compound: 'W' })
  })

  it('wet tyres on a confirmed drying track ask for slicks: the next planned compound, else bestDryCompound', () => {
    const tl = Array.from({ length: 30 }, (_, i) => (i < 9 ? 'DAMP' : 'DRY')) as WeatherState[]
    const onInters = { compound: 'I' as Compound }
    expect(run([10, 11].map(l => wetEnd(l, tl, onInters)), rcfg(null))[1]).toEqual({ kind: 'rain', lap: 11, aheadId: null, compound: 'M' })
    const plan = [{ lap: 20, compound: 'H' as Compound }]
    const withPlan = run([10, 11].map(l => wetEnd(l, tl, { ...onInters, strategy: { teamId: 't1', startCompound: 'M', plannedStops: plan } })), rcfg(plan))
    expect(withPlan[1]?.compound).toBe('H')
  })

  it('matched tyres never ask; inters in the WET never ask', () => {
    expect(run([wetEnd(10, rainFrom(5))], rcfg(null), CTX, makeRequestTracker())[0]?.kind).toBe('rain')
    expect(run([wetEnd(10, rainFrom(5), { compound: 'I' })], rcfg(null))[0]).toBeNull()
    expect(run([wetEnd(10, rainFrom(5, 'WET'), { compound: 'I' })], rcfg(null))[0]).toBeNull()
  })

  it('not with ai.weatherMinLapsLeft laps or fewer to go, under red, in the pit, with the panel open, or over a pending request', () => {
    const tl = rainFrom(5, 'WET')
    expect(run([wetEnd(27, tl)], rcfg(null))[0]).toBeNull()      // 3 left = weatherMinLapsLeft
    expect(run([wetEnd(26, tl)], rcfg(null))[0]?.kind).toBe('rain')
    const red: SafetyCarState = { deployedLap: 9, lapsRemaining: 0, cause: 'crash', kind: 'red' }
    expect(run([{ ...wetEnd(10, tl), safetyCar: red }], rcfg(null))[0]).toBeNull()
    expect(run([wetEnd(10, tl)], rcfg(null), { ...CTX, inPit: true })[0]).toBeNull()
    expect(run([wetEnd(10, tl)], rcfg(null), { ...CTX, pitPanelOpen: true })[0]).toBeNull()
    expect(run([wetEnd(10, tl)], rcfg(null), { ...CTX, pending: true })[0]).toBeNull()
  })

  it('takes priority over a box request on worn slicks', () => {
    expect(run([wetEnd(10, rainFrom(5, 'WET'), WORN)], rcfg(null))[0]?.kind).toBe('rain')
  })

  it('DECLINED (or expired): never re-asked while the same tyre is called for; asked again when the call changes', () => {
    const tl = Array.from({ length: 30 }, (_, i) => (i < 5 ? 'DRY' : i < 14 ? 'DAMP' : 'WET')) as WeatherState[]
    const reqs = run([10, 11, 12, 13, 14, 15].map(l => wetEnd(l, tl)), rcfg(null))
    // Asked for inters at 10; still damp through lap 14's end -> quiet; WET (lap 15) calls for wets -> asked.
    expect(reqs.map(r => r?.compound ?? null)).toEqual(['I', null, null, null, null, 'W'])
  })

  it('a dry spell in between re-arms it', () => {
    const tl = Array.from({ length: 30 }, (_, i) => (i < 5 ? 'DRY' : i < 10 ? 'WET' : i < 12 ? 'DRY' : 'WET')) as WeatherState[]
    const reqs = run([10, 11, 12, 13].map(l => wetEnd(l, tl)), rcfg(null))
    expect(reqs.map(r => r?.compound ?? null)).toEqual(['W', null, null, 'W'])
  })

  it('exempt from maxPerRace and the per-kind cooldown, but counts toward asked', () => {
    const t = { ...makeRequestTracker(), asked: 3 }
    const out = detectRadioRequest(wetEnd(10, rainFrom(5, 'WET')), rcfg(null), t, CTX)
    expect(out.request?.kind).toBe('rain')
    expect(out.tracker.asked).toBe(4)
  })
  it('a stop since the ask (a plan stop onto the wrong tyre) re-arms it', () => {
    const tl = rainFrom(5, 'WET')
    const reqs = run([wetEnd(10, tl), wetEnd(11, tl, { pitsDone: 1, compound: 'H' })], rcfg(null))
    expect(reqs.map(r => r?.kind ?? null)).toEqual(['rain', 'rain'])
  })
})

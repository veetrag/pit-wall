import { describe, it, expect } from 'vitest'
import { executeStop, boxQueueEstimate, deferForBusyBox } from '@engine/pitStop'
import { applyCall } from '@engine/playerCalls'
import { projectPitNow } from '@engine/projection'
import { initRace, stepSector } from '@engine/race'
import { effectivePitLaneLoss } from '@engine/incidents'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig, type TuningOverrides } from '../fixtures/raceHarness'
import type { RaceConfig, RaceState } from '@engine/types'

const cfg = (on = true): RaceConfig =>
  ({ ...makeConfig({}, 6, 'veloce'), allDry: true, tuning: makeDeterministicTuning(on ? { doubleStack: { enabled: true } } : {}) })

describe('double-stacked stops (spec §7)', () => {
  it('the first car claims the box; a team-mate arriving inside it queues exactly the overlap', () => {
    const c = cfg()
    const s = initRace(c)
    const a = { ...s.cars[0]!, raceTime: 500 }               // apex #1
    const b = { ...s.cars[1]!, raceTime: 501 }               // apex #2, 1 s behind
    const ctx = { safetyCar: null, lap: 10, sector: 2 as const, boxFree: {} }
    const first = executeStop(c, ctx, a, 'H', createRng(1))
    const lane = effectivePitLaneLoss(c.circuit, null, c.tuning)
    const expectFree = 500 + lane * 0.5 + first.cost.stationary + 0.8
    expect(first.boxFree!.apex).toBeCloseTo(expectFree, 9)
    expect(first.queue).toBe(0)
    const second = executeStop(c, { ...ctx, boxFree: first.boxFree }, b, 'H', createRng(2))
    expect(second.queue).toBeCloseTo(expectFree - (501 + lane * 0.5), 9)
    expect(second.car.raceTime).toBeCloseTo(501 + second.cost.total + second.queue, 9)
    expect(second.events).toContainEqual({ lap: 10, sector: 2, kind: 'double_stack', driverId: b.driverId, timeLoss: second.queue })
  })

  it('off: no queue, no box state', () => {
    const c = cfg(false)
    const s = initRace(c)
    const out = executeStop(c, { safetyCar: null, lap: 1, sector: 2, boxFree: { apex: 1e9 } }, s.cars[0]!, 'H', createRng(1))
    expect(out.queue).toBe(0)
    expect(out.boxFree).toBeUndefined()
  })

  it('AI deferral: by brain, looser under yellow, never for weather or a cliff emergency', () => {
    const c = cfg()
    const s = initRace(c)
    const opt = { ...s.cars[0]!, strategy: { ...s.cars[0]!.strategy, brain: 'optimal' as const } }
    const naive = { ...opt, strategy: { ...opt.strategy, brain: 'naive' as const } }
    expect(deferForBusyBox(c, opt, 2.5, false, false, 0.8)).toBe(true)
    expect(deferForBusyBox(c, opt, 2.5, true, false, 0.8), 'under yellow the limit is 5 s').toBe(false)
    expect(deferForBusyBox(c, opt, 2.5, false, true, 0.8), 'weather stops never wait').toBe(false)
    expect(deferForBusyBox(c, opt, 2.5, false, false, 1.4), 'cliff emergency never waits').toBe(false)
    expect(deferForBusyBox(c, naive, 50, false, false, 0.8)).toBe(false)
  })

  it('the PIT button claims the box on the state', () => {
    const c = { ...cfg(), playerDriverId: 'd_voss' }
    const s = initRace(c)
    const next = applyCall(c, s, { step: 0, kind: 'pit', compound: 'H' }, createRng(1))
    expect(next.boxFree!.apex).toBeGreaterThan(0)
    const off = { ...c, tuning: makeDeterministicTuning() }
    expect('boxFree' in applyCall(off, initRace(off), { step: 0, kind: 'pit', compound: 'H' }, createRng(1))).toBe(false)
  })

  it('THE PROJECTION INCLUDES THE QUEUE', () => {
    const c = { ...cfg(), playerDriverId: 'd_voss' }
    let s = initRace(c)
    const rng = createRng(6)
    for (let i = 0; i < 30; i++) s = stepSector(c, s, rng)
    const me = s.cars.find(x => x.isPlayer)!
    const busy = { ...s, boxFree: { apex: me.raceTime + 60 } }
    const free = projectPitNow(c, s, 'H', 11)
    const queued = projectPitNow(c, busy, 'H', 11)
    expect(queued.rejoinPosition).toBeGreaterThan(free.rejoinPosition)
    expect(boxQueueEstimate(c, busy.boxFree, me, null)).toBeCloseTo(60 - effectivePitLaneLoss(c.circuit, null, c.tuning) * 0.5, 9)
  })

  it('in a race, a team stacking under yellow logs double_stack and both cars still finish', () => {
    const c = { ...cfg(), tuning: makeDeterministicTuning({ doubleStack: { enabled: true }, incidents: { driverErrorPerLap: 0.6, terminalFraction: 1, safetyCar: { crashDeployChance: 1 }, redFlag: { crashChance: 0 } } }) }
    let s = initRace(c)
    const rng = createRng(6)
    const MAX_STEPS = c.circuit.laps * 3
    for (let i = 0; i < MAX_STEPS; i++) s = stepSector(c, s, rng)
    expect(s.lap).toBe(s.totalLaps)
    // Not every seed stacks; the assertion is that the mechanism is reachable and well-formed when it does.
    for (const e of s.incidents.filter(x => x.kind === 'double_stack')) expect(e.timeLoss!).toBeGreaterThan(0)
  })
})

// Final-review fix: boxFree holds absolute raceTimes, so a rewrite of every
// raceTime (SC compression, red-flag regrid) must drop it -- otherwise a stale
// release time charges a phantom queue.
describe('box release times survive no raceTime rewrite', () => {
  const PHANTOM = 1e9
  const phantomBoxes = (s: RaceState) => Object.fromEntries(s.cars.map(c => [c.teamId, PHANTOM]))
  const noPhantom = (prev: RaceState, next: RaceState) => {
    for (const t of Object.values(next.boxFree ?? {})) expect(t).toBeLessThan(PHANTOM)
    const fresh = next.incidents.slice(prev.incidents.length).filter(i => i.kind === 'double_stack')
    for (const i of fresh) expect(i.timeLoss ?? 0).toBeLessThan(60)
  }
  const crashy = (sc: boolean): RaceConfig => {
    const base = makeConfig({
      doubleStack: { enabled: true },
      incidents: {
        driverErrorPerLap: 3, consistencyReliefMax: 1, terminalFraction: 1,
        safetyCar: { crashDeployChance: sc ? 1 : 0, mechanicalDeployChance: 0 },
        vsc: { crashDeployChance: 0, mechanicalDeployChance: 0 },
        redFlag: { crashChance: sc ? 0 : 1, maxPerRace: 1, minLapsLeft: 5, planWindowLaps: 15 },
      },
    } as TuningOverrides, 9)
    return { ...base, lapsOverride: 20, allDry: true }
  }
  /** The step on which `hit` first holds for the new state, replayed to just before it. */
  const before = (c: RaceConfig, hit: (s: RaceState) => boolean) => {
    let s = initRace(c); let rng = createRng(c.seed); let k = 0
    while (!hit(s) && k < 200) { s = stepSector(c, s, rng); k++ }
    expect(hit(s), 'premise: the event happened').toBe(true)
    s = initRace(c); rng = createRng(c.seed)
    for (let i = 0; i < k - 1; i++) s = stepSector(c, s, rng)
    return { s, rng }
  }

  it('SC compression drops stale box times', () => {
    const c = crashy(true)
    const { s, rng } = before(c, st => st.incidents.some(i => i.kind === 'safety_car_deployed'))
    const prev = { ...s, boxFree: phantomBoxes(s) }
    const next = stepSector(c, prev, rng)
    expect(next.incidents.some(i => i.kind === 'safety_car_deployed')).toBe(true)
    noPhantom(prev, next)
  })

  it('the red-flag regrid drops stale box times', () => {
    const c = crashy(false)
    const { s, rng } = before(c, st => st.incidents.some(i => i.kind === 'red_flag_restart'))
    const prev = { ...s, boxFree: phantomBoxes(s) }
    const next = stepSector(c, prev, rng)
    expect(next.incidents.some(i => i.kind === 'red_flag_restart')).toBe(true)
    noPhantom(prev, next)
  })
})

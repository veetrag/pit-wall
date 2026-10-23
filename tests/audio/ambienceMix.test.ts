import { describe, it, expect } from 'vitest'
import type { RaceState, CarState } from '@engine/types'
import {
  computeAmbienceMix, deriveAmbienceInput, makeAmbienceInput, makeAmbienceMix, LEVELS,
  type AmbienceInput,
} from '@audio/ambienceMix'

const base = (over: Partial<AmbienceInput> = {}): AmbienceInput => ({ ...makeAmbienceInput(), phase: 'racing', ...over })
const mix = (over: Partial<AmbienceInput> = {}) => computeAmbienceMix(base(over), makeAmbienceMix())

function car(id: string, raceTime: number, extra: Partial<CarState> = {}): CarState {
  return { driverId: id, raceTime, isPlayer: false, retired: false, paceMode: 'neutral', ...extra } as CarState
}
function race(cars: CarState[], extra: Partial<RaceState> = {}): RaceState {
  return { lap: 5, totalLaps: 50, cars, safetyCar: null, weatherState: 'DRY', ...extra } as RaceState
}

describe('computeAmbienceMix', () => {
  it('is silent when idle and when the race is paused', () => {
    expect(mix({ phase: 'idle' }).master).toBe(0)
    expect(mix({ paused: true }).master).toBe(0)
  })

  it('ducks under a radio line but never un-mutes a paused bed', () => {
    expect(mix({ radioActive: true }).master).toBe(LEVELS.radioDuck)
    expect(mix({ radioActive: true, paused: true }).master).toBe(0)
  })

  it('a battle near the player raises engine and crowd', () => {
    const calm = mix(), close = mix({ battle: 1 })
    expect(close.engineGain).toBeGreaterThan(calm.engineGain)
    expect(close.crowdGain).toBeGreaterThan(calm.crowdGain)
    expect(close.engineCutoff).toBeGreaterThan(calm.engineCutoff)
  })

  it('a tight field is louder than a strung-out one', () => {
    expect(mix({ fieldTightness: 1 }).engineGain).toBeGreaterThan(mix({ fieldTightness: 0 }).engineGain)
  })

  it('PUSH is higher, brighter and louder than CONSERVE', () => {
    const p = mix({ paceMode: 'push' }), n = mix(), c = mix({ paceMode: 'conserve' })
    expect(p.enginePitch).toBeGreaterThan(n.enginePitch)
    expect(n.enginePitch).toBeGreaterThan(c.enginePitch)
    expect(p.engineCutoff).toBeGreaterThan(c.engineCutoff)
    expect(p.engineGain).toBeGreaterThan(c.engineGain)
  })

  it('SC is quieter and lower than VSC, which is below green', () => {
    const g = mix(), v = mix({ neutralisation: 'vsc' }), s = mix({ neutralisation: 'sc' })
    expect(v.engineGain).toBeLessThan(g.engineGain)
    expect(s.engineGain).toBeLessThan(v.engineGain)
    expect(s.enginePitch).toBeLessThan(v.enginePitch)
    expect(v.enginePitch).toBeLessThan(g.enginePitch)
  })

  it('red flag: engines off, murmur on', () => {
    const r = mix({ phase: 'red_flag', neutralisation: 'red' })
    expect(r.engineGain).toBe(0)
    expect(r.murmurGain).toBeGreaterThan(0)
    expect(mix().murmurGain).toBe(0)
  })

  it('rain scales with wetness', () => {
    expect(mix({ weather: 'DRY' }).rainGain).toBe(0)
    expect(mix({ weather: 'DAMP' }).rainGain).toBeCloseTo(LEVELS.rainMax / 2)
    expect(mix({ weather: 'WET' }).rainGain).toBe(LEVELS.rainMax)
  })

  it('final lap and the chequer swell the crowd', () => {
    const g = mix()
    expect(mix({ finalLap: true }).crowdGain).toBeGreaterThan(g.crowdGain)
    const f = mix({ phase: 'finished' })
    expect(f.crowdGain).toBeGreaterThan(mix({ finalLap: true }).crowdGain)
    expect(f.engineGain).toBeLessThan(g.engineGain)
  })

  it('every output stays finite and non-negative across all inputs', () => {
    for (const phase of ['idle', 'starting', 'racing', 'red_flag', 'finished'] as const)
      for (const neutralisation of [null, 'sc', 'vsc', 'red'] as const)
        for (const weather of ['DRY', 'DAMP', 'WET'] as const)
          for (const paceMode of ['push', 'neutral', 'conserve'] as const)
            for (const battle of [0, 1]) {
              const m = mix({ phase, neutralisation, weather, paceMode, battle, fieldTightness: battle, finalLap: battle === 1 })
              for (const v of Object.values(m)) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0) }
              expect(m.master).toBeLessThanOrEqual(1)
            }
  })

  it('writes into and returns the caller object (no allocation)', () => {
    const out = makeAmbienceMix()
    expect(computeAmbienceMix(base(), out)).toBe(out)
  })
})

describe('deriveAmbienceInput', () => {
  it('reads battle from the nearest running rival to the player', () => {
    const s = race([car('a', 100), car('me', 100.5, { isPlayer: true, paceMode: 'push' }), car('b', 130)])
    const i = deriveAmbienceInput(s, 'racing', false, false, makeAmbienceInput())
    expect(i.battle).toBeCloseTo(1 - 0.5 / 2)
    expect(i.paceMode).toBe('push')
  })

  it('ignores retired cars for battle and spread', () => {
    const s = race([car('a', 100.1, { retired: true }), car('me', 100, { isPlayer: true }), car('b', 105)])
    const i = deriveAmbienceInput(s, 'racing', false, false, makeAmbienceInput())
    expect(i.battle).toBe(0)
    expect(i.fieldTightness).toBeCloseTo(1 - 5 / 60)
  })

  it('maps neutralisation, weather and final lap', () => {
    const cars = [car('me', 0, { isPlayer: true })]
    const vsc = deriveAmbienceInput(race(cars, { safetyCar: { deployedLap: 1, lapsRemaining: 2, cause: 'crash', kind: 'vsc' }, weatherState: 'WET' }), 'racing', false, false, makeAmbienceInput())
    expect(vsc.neutralisation).toBe('vsc')
    expect(vsc.weather).toBe('WET')
    const legacySc = deriveAmbienceInput(race(cars, { safetyCar: { deployedLap: 1, lapsRemaining: 2, cause: 'crash' } }), 'racing', false, false, makeAmbienceInput())
    expect(legacySc.neutralisation).toBe('sc')
    expect(deriveAmbienceInput(race(cars, { lap: 49 }), 'racing', false, false, makeAmbienceInput()).finalLap).toBe(true)
    expect(deriveAmbienceInput(race(cars, { lap: 48 }), 'racing', false, false, makeAmbienceInput()).finalLap).toBe(false)
  })

  it('handles no race state', () => {
    const i = deriveAmbienceInput(null, 'idle', false, false, makeAmbienceInput())
    expect(i.battle).toBe(0)
    expect(i.neutralisation).toBeNull()
  })
})

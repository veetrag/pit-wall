import { describe, it, expect } from 'vitest'
import { greenSinceLap, drsOpenSet, drsOvertakeFactor, drsTrains, inTrainBehindHead } from '@engine/drs'
import { computeSectorTime } from '@engine/lapModel'
import { aiDecision } from '@engine/strategy'
import { initRace } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { RaceConfig, RaceState } from '@engine/types'

function cfg(on = true): RaceConfig {
  const c = makeConfig({}, 5, 'veloce')            // drsSectors [0, 2]
  return { ...c, allDry: true, tuning: makeDeterministicTuning(on ? { drs: { enabled: true } } : {}) }
}
/** Leader at 0, then cars at the given gaps behind each other; the rest far back. */
function field(config: RaceConfig, gaps: number[], lap = 6): RaceState {
  const s = initRace(config)
  let t = 0
  const cars = s.cars.map((c, i) => {
    if (i === 0) return { ...c, raceTime: 0, lap }
    if (i <= gaps.length) { t += gaps[i - 1]!; return { ...c, raceTime: t, lap } }
    return { ...c, raceTime: 100 + i * 5, lap }
  })
  return { ...s, lap, cars, weatherState: 'DRY' }
}

describe('DRS (spec §3.2)', () => {
  it('green since: start, or one past the last SC end / red-flag restart; a VSC end does not reset it', () => {
    expect(greenSinceLap({ incidents: [] })).toBe(0)
    const ev = (lap: number, kind: 'safety_car_ended' | 'vsc_ended' | 'red_flag_restart') => ({ lap, sector: 2 as const, kind, driverId: null, timeLoss: null })
    expect(greenSinceLap({ incidents: [ev(9, 'safety_car_ended'), ev(14, 'vsc_ended')] })).toBe(10)
    expect(greenSinceLap({ incidents: [ev(9, 'safety_car_ended'), ev(20, 'red_flag_restart')] })).toBe(21)
  })

  it('open: within 1.0 s, in a DRS sector, green, dry, after 2 laps, never the leader', () => {
    const config = cfg()
    const s = field(config, [0.5, 0.8, 1.4])
    const ids = s.cars.map(c => c.driverId)
    expect([...drsOpenSet(config, s, 0)].sort()).toEqual([ids[1], ids[2]].sort())
    expect(drsOpenSet(config, s, 1).size, 'S2 is not a DRS sector at veloce').toBe(0)
    expect(drsOpenSet(config, { ...s, lap: 1 }, 0).size, 'not before lap 2').toBe(0)
    expect(drsOpenSet(config, { ...s, weatherState: 'DAMP' }, 0).size, 'ruling D3').toBe(0)
    expect(drsOpenSet(config, { ...s, safetyCar: { deployedLap: 5, lapsRemaining: 2, cause: 'crash', kind: 'vsc' } }, 0).size).toBe(0)
    expect(drsOpenSet(cfg(false), s, 0).size).toBe(0)
  })

  it('the pass factor: +overtakeBonus, cancelled when the defender has DRS too', () => {
    const config = cfg()
    expect(drsOvertakeFactor(config, new Set(['b']), 'b', 'a')).toBeCloseTo(1.6, 12)
    expect(drsOvertakeFactor(config, new Set(['b', 'a']), 'b', 'a')).toBe(1)
    expect(drsOvertakeFactor(config, new Set(['a']), 'b', 'a')).toBe(1)
  })

  it('trains: maximal runs of ≥ 3 cars each within 1.0 s', () => {
    const config = cfg()
    const s = field(config, [0.5, 0.8, 0.9, 1.4, 0.3])
    const ids = [...s.cars].sort((a, b) => a.raceTime - b.raceTime).map(c => c.driverId)
    expect(drsTrains(config, s)).toEqual([{ carIds: ids.slice(0, 4) }])
    expect(inTrainBehindHead(config, s, ids[2]!)).toBe(true)
    expect(inTrainBehindHead(config, s, ids[0]!), 'the head is not stuck').toBe(false)
  })

  it('lapModel: an open DRS is exactly −timeGain', () => {
    const config = cfg()
    const car = { ...initRace(config).cars[1]!, lap: 6 }
    const a = computeSectorTime(config, car, 0, createRng(2), 'DRY', null).sectorTime
    const b = computeSectorTime(config, car, 0, createRng(2), 'DRY', null, { drsOpen: true }).sectorTime
    expect(a - b).toBeCloseTo(0.20, 10)
  })

  it('AI: an optimal car stuck in a train with its stop near boxes into clear air', () => {
    const config = cfg()
    const s = field(config, [0.5, 0.6, 0.7])
    const sorted = [...s.cars].sort((a, b) => a.raceTime - b.raceTime)
    // tyreAge 10 keeps the cliff fraction (≈0.53) below the 0.60 undercut rule, so only the train rule can fire.
    const stuck = { ...sorted[2]!, tyreAge: 10, compound: 'M' as const, lapsInDirtyAir: 3, strategy: { ...sorted[2]!.strategy, brain: 'optimal' as const, plannedStops: [{ lap: 12, compound: 'H' as const }] } }
    const state = { ...s, cars: s.cars.map(c => c.driverId === stuck.driverId ? stuck : c) }
    expect(aiDecision(config, stuck, state, createRng(1))).toMatchObject({ pit: true, compound: 'H' })
    expect(aiDecision(cfg(false), stuck, state, createRng(1)).pit, 'DRS off: no escape rule').toBe(false)
  })
})

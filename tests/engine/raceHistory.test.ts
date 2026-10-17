import { describe, it, expect } from 'vitest'
import { useRaceStore } from '@state/raceStore'
import { buildRaceConfig } from '@state/buildRaceConfig'
import { lapHistory } from '@engine/raceHistory'
import { replay } from '@engine/debrief'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig, type TuningOverrides } from '../fixtures/raceHarness'
import type { RaceConfig } from '@engine/types'

// Guards the live loop below: a race that never leaves 'racing' fails the
// terminal assertion instead of hanging the suite.
const MAX_STEPS = 5000

describe('lapHistory matches the race as it was lived', () => {
  for (const seed of [42, 2024]) {
    it(`seed ${seed}: positions at every lap end equal the live race, and the finish equals the replay`, () => {
      const pick = createRng(seed ^ 0x5eed)
      const r = () => useRaceStore.getState()
      r().resetRace()
      r().startSeasonRace('d_voss', seed, 'bengaluru', 'rookie',
        { startCompound: 'M', plannedStops: [{ lap: 24, compound: 'H' }] }, null, undefined, false)
      useRaceStore.setState({ phase: 'racing' })
      const live = new Map(r().raceState!.cars.map(c => [c.driverId, [c.position]]))
      const out = new Set<string>()
      let n = 0
      while (r().phase === 'racing' && n < MAX_STEPS) {
        if (n === 12) r().pitNow('S')
        else if (pick() < 0.02) r().setPaceMode('push')
        r().step()
        n++
        const s = r().raceState!
        if (s.sector !== 0) continue
        for (const c of s.cars) {
          if (out.has(c.driverId)) continue
          if (c.retired) { out.add(c.driverId); continue }
          live.get(c.driverId)!.push(c.position)
        }
      }
      expect(r().phase).toBe('finished')
      const h = lapHistory(r().config!, seed, r().playerCalls)
      expect(h.cars.map(c => [c.driverId, c.positions])).toEqual([...live.entries()])
      // state.cars is re-sorted every step, so match the finish by driver.
      const finals = new Map(replay(r().config!, seed, r().playerCalls).state.cars.map(c => [c.driverId, c.position]))
      expect(h.cars.map(c => c.finish)).toEqual(h.cars.map(c => finals.get(c.driverId)))
      expect(h.cars.map(c => c.finish).sort((a, b) => a - b)).toEqual(h.cars.map((_, i) => i + 1))
      expect(h.lapsRun).toBe(h.totalLaps)
    }, 60_000)
  }

  it('the replay observer changes nothing (ruling P2)', () => {
    const cfg = makeConfig({}, 9)
    const calls = [{ step: 30, kind: 'pit', compound: 'H' } as const]
    let seen = 0
    const watched = replay(cfg, 9, calls, undefined, () => { seen++ })
    const plain = replay(cfg, 9, calls)
    expect(seen).toBe(plain.step)
    expect(JSON.stringify(watched.state)).toBe(JSON.stringify(plain.state))
    expect(watched.rng()).toBe(plain.rng())
  })
})

describe('pit markers', () => {
  const config = (): RaceConfig => ({
    ...buildRaceConfig(77, 'd_voss', 'bengaluru', 'rookie',
      { startCompound: 'M', plannedStops: [{ lap: 24, compound: 'H' }] }, null, undefined, false),
    // Tyre failure off too: on the shipped rate the player's Mediums fail
    // before lap 24 on this seed and no stop is ever made.
    tuning: makeDeterministicTuning({ tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 } }),
  })
  const mine = (calls: Parameters<typeof lapHistory>[2]) => lapHistory(config(), 77, calls).cars.find(c => c.isPlayer)!

  it('a plan stop is marked on the lap it was made', () => {
    expect(mine([]).pitLaps).toEqual([24])
  })

  it('a manual stop at step 12 (during lap 5) is marked on lap 5 and consumes the planned stop', () => {
    expect(mine([{ step: 12, kind: 'pit', compound: 'H' }]).pitLaps).toEqual([5])
  })

  it('every AI car carries its stops', () => {
    const h = lapHistory(config(), 77, [])
    expect(h.cars.filter(c => !c.isPlayer).every(c => c.pitLaps.length >= 1)).toBe(true)
  })
})

describe('neutralisation periods', () => {
  const base = {
    incidents: { driverErrorPerLap: 0.05, terminalFraction: 1 },
    mechanicalFailure: { baseChancePerLap: 0 },
    tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
  }
  it('SC periods come from the incident log, in order, inside the race', () => {
    const cfg = makeConfig({ ...base, incidents: { ...base.incidents, safetyCar: { crashDeployChance: 1, mechanicalDeployChance: 0 }, vsc: { crashDeployChance: 0, mechanicalDeployChance: 0 } } } as TuningOverrides, 5)
    const h = lapHistory(cfg, 5, [])
    const deployed = replay(cfg, 5, []).state.incidents.filter(i => i.kind === 'safety_car_deployed').length
    expect(h.neutralisations.length).toBe(deployed)
    expect(deployed).toBeGreaterThan(0)
    let prevEnd = 0
    for (const p of h.neutralisations) {
      expect(p.kind).toBe('sc')
      expect(p.startLap).toBeGreaterThanOrEqual(Math.max(1, prevEnd))
      expect(p.endLap).toBeGreaterThanOrEqual(p.startLap)
      expect(p.endLap).toBeLessThanOrEqual(h.totalLaps)
      prevEnd = p.endLap
    }
  }, 60_000)

  it('VSC periods are marked as VSC', () => {
    const cfg = makeConfig({ ...base, incidents: { ...base.incidents, safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 }, vsc: { crashDeployChance: 1, mechanicalDeployChance: 0 } } } as TuningOverrides, 5)
    const h = lapHistory(cfg, 5, [])
    expect(h.neutralisations.length).toBeGreaterThan(0)
    expect(h.neutralisations.every(p => p.kind === 'vsc')).toBe(true)
  }, 60_000)
})

describe('retirements', () => {
  it("a retired car's line stops at its last completed lap and it is classified after every runner", () => {
    const cfg = makeConfig({
      incidents: { driverErrorPerLap: 0.05, terminalFraction: 1, safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 }, vsc: { crashDeployChance: 0, mechanicalDeployChance: 0 } },
    } as TuningOverrides, 5)
    const h = lapHistory(cfg, 5, [])
    const retired = h.cars.filter(c => c.retiredLap !== null)
    const runners = h.cars.length - retired.length
    expect(retired.length).toBeGreaterThan(0)
    for (const c of retired) {
      expect(c.positions.length, c.driverId).toBe(c.retiredLap)
      expect(c.finish).toBeGreaterThan(runners)
    }
  }, 60_000)

  it('EVERY CAR OUT ON LAP 1 (Review Focus 4): one grid point each, retiredLap 1, no gaps in the data', () => {
    // driverErrorPerLap 3 with no consistency relief makes the per-sector error
    // chance exactly 1; terminalFraction 1 makes every error a crash.
    const cfg: RaceConfig = {
      ...makeConfig({
        incidents: { driverErrorPerLap: 3, consistencyReliefMax: 0, terminalFraction: 1, safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 }, vsc: { crashDeployChance: 0, mechanicalDeployChance: 0 } },
      } as TuningOverrides, 5),
      playerDriverId: 'd_voss',
    }
    const h = lapHistory(cfg, 5, [])
    for (const c of h.cars) {
      expect(c.retiredLap, c.driverId).toBe(1)
      expect(c.positions, c.driverId).toHaveLength(1)
      expect(Number.isFinite(c.positions[0]!)).toBe(true)
    }
    expect(h.cars.find(c => c.isPlayer)).toBeDefined()
  }, 60_000)
})

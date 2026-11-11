/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import { makeDeterministicTuning, v2Off } from '../fixtures/tuning'
import type { RaceConfig } from '@engine/types'

const DATA = loadGameData()

// Spec 2026-10-24 §0, trimmed by docs/superpowers/plans/2026-11-07-v2.0-scope.md.
describe('2.0 foundations', () => {
  it('every 2.0 tuning block is declared and survives zod', () => {
    const t = DATA.tuning
    // The 2.0 switch-on (scope 2026-11-07 Task 12', round 2, MODEL_SPEC §17.1):
    // rubber wash, the SC gamble, DRS, the double stack and penalties ship ON at
    // their plan values; circuit/wet incident risk ships OFF (lantern_quay
    // envelope rho, 4-seed-base mean, after three shrink steps).
    expect(t.drs.enabled).toBe(true)
    expect(t.drs.timeGain).toBe(0.2)
    expect(t.drs.overtakeBonus).toBe(0.6)
    expect(t.doubleStack.enabled).toBe(true)
    expect(t.penalties.enabled).toBe(true)
    expect(t.penalties.trackLimits.chancePerLap).toBe(0.012)
    expect(t.penalties.unsafeRelease.chance).toBe(0.015)
    expect(t.trackEvolution.wash).toEqual({ DAMP: 0.35, WET: 0.8 })
    expect(t.incidents.wetErrorMultiplier).toEqual({ DRY: 1, DAMP: 1, WET: 1 })
    expect(t.incidents.circuitRiskWeight).toBe(0)
    expect(t.ai.scGambleMaxDelay).toBe(3)
    // Values the switch-on tasks rely on are present, not undefined (z.object strips unknown keys).
    expect(t.ai.scGambleChance).toBeCloseTo(0.35)
    expect(t.drs.detectionGap).toBe(1.0)
    expect(t.doubleStack.maxQueueNeutralised.smart).toBe(6)
    expect(t.penalties.trackLimits.warningsAllowed).toBe(3)
    expect(t.penalties.unsafeRelease.stackedFactor).toBe(2.5)
    expect(t.scOutlook.bands).toEqual([0.15, 0.30])
  })

  it('v2Off pins exactly the off values', () => {
    const t = makeDeterministicTuning({ drs: { enabled: true } })
    expect(t.drs.enabled, 'an explicit override still wins over v2Off').toBe(true)
    expect(makeDeterministicTuning().drs.enabled).toBe(false)
    expect(v2Off().trackEvolution?.wash).toEqual({ DAMP: 0, WET: 0 })
  })

  it('V2OFF REPRODUCES THE GOLDEN RACE (same config as byteIdentity)', () => {
    const golden = readFileSync('tests/fixtures/golden-race-pre-incidents.json', 'utf8')
    const circuit = DATA.circuits['bengaluru']!
    const config: RaceConfig = {
      circuit,
      tuning: makeDeterministicTuning({
        mechanicalFailure: { baseChancePerLap: 0.008 },
        tyreFailure: { chancePerLapOverThreshold: 0.30, maxChancePerLap: 0.50 },
        weather: { wetDegMultiplier: { dry: { DRY: 1.0, DAMP: 1.4, WET: 1.9 } } },
      }),
      compounds: DATA.compounds, drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
      strategies: DATA.strategies.defaults, playerDriverId: '__none__', seed: 424242,
    }
    let state = initRace(config)
    const rng = createRng(424242)
    for (let i = 0; i < circuit.laps * 3; i++) state = stepSector(config, state, rng)
    expect(state.cars.some(c => 'penalty' in c)).toBe(false)
    expect('boxFree' in state).toBe(false)
    expect(JSON.stringify(state, null, 2) + '\n').toBe(golden)
  }, 60_000)

  it('circuits carry the authored 2.0 facts (calendar mean pinned)', () => {
    const cs = Object.values(DATA.circuits)
    expect(cs).toHaveLength(14)
    const meanRisk = cs.reduce((s, c) => s + (c.incidentRisk ?? NaN), 0) / cs.length
    // Not exact: lantern_quay's incidentRisk is 1.00, not 1.30 -- its crashRisk 1.3 /
    // neutralisationRisk 1.5 (1.7 traits) already price its danger; 1.30 would compound
    // to ~1.69x (controller ruling, Task 10). Calendar mean stays within ±0.05 of 1.
    expect(Math.abs(meanRisk - 1.0)).toBeLessThanOrEqual(0.05)
    for (const c of cs) expect(c.drsSectors!.length).toBeGreaterThan(0)
  })
})

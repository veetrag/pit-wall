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
    expect(t.drs.enabled).toBe(false)
    expect(t.doubleStack.enabled).toBe(false)
    expect(t.penalties.enabled).toBe(false)
    expect(t.trackEvolution.wash).toEqual({ DAMP: 0, WET: 0 })
    expect(t.incidents.wetErrorMultiplier).toEqual({ DRY: 1, DAMP: 1, WET: 1 })
    expect(t.incidents.circuitRiskWeight).toBe(0)
    expect(t.ai.scGambleMaxDelay).toBe(0)
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
    expect(meanRisk).toBeCloseTo(1.0, 10)
    for (const c of cs) expect(c.drsSectors!.length).toBeGreaterThan(0)
  })
})

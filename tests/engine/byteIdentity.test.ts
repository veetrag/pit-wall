/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import type { RaceConfig } from '@engine/types'

const GOLDEN_PATH = 'tests/fixtures/golden-race-pre-incidents.json'

/*
 * THE REGRESSION NET FOR THE ENTIRE RACE-INCIDENTS CHANGE.
 *
 * Adding rng() calls to the per-sector hot path would shift the draw sequence
 * and silently move every measured number in this repository. The spec's
 * section 5.5 therefore requires every new roll to be short-circuited so a 0.0
 * tuning value performs NO rng() call -- the same `perLap > 0 && rng() < ...`
 * idiom race.ts already uses for mechanical failure.
 *
 * This test is how that requirement is enforced. The fixture was captured by
 * scripts/capture-golden-race.ts at commit 556490b, which predates every
 * incident mechanic. If this test fails, a guard is missing or mis-ordered;
 * DO NOT re-capture the fixture to make it pass. Re-capturing is how a stream
 * shift gets laundered into a "new baseline".
 *
 * (One re-capture IS legitimate, and only one: when RaceState gains the
 * `safetyCar` and `incidents` fields, its serialised SHAPE changes. That
 * re-capture must add exactly two lines -- `"safetyCar": null` and
 * `"incidents": []` -- and change no car value and no rngState.)
 *
 * It compares serialised state, not summary metrics, deliberately: this
 * project's original determinism test passed while every car's lap times were
 * perturbed by 0.0007s and tyre ages by a full lap, because it only compared
 * summary figures.
 */
describe('byte-identity with incidents disabled', () => {
  it('reproduces the golden pre-incidents race exactly', () => {
    const golden = readFileSync(GOLDEN_PATH, 'utf8')
    const DATA = loadGameData()
    const circuit = DATA.circuits['bengaluru']!
    const config: RaceConfig = {
      circuit,
      tuning: DATA.tuning,
      compounds: DATA.compounds,
      drivers: DATA.drivers.drivers,
      teams: DATA.cars.teams,
      strategies: DATA.strategies.defaults,
      playerDriverId: '__none__',
      seed: 424242,
    }
    let state = initRace(config)
    const rng = createRng(424242)
    for (let i = 0; i < circuit.laps * 3; i++) state = stepSector(config, state, rng)
    expect(JSON.stringify(state, null, 2) + '\n').toBe(golden)
  }, 60_000)
})

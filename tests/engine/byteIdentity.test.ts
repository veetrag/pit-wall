/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import { makeDeterministicTuning } from '../fixtures/tuning'
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
 * NOW THAT THE SHIPPED RATES ARE NON-ZERO, this pins the GUARANTEE rather than
 * the shipped config: a race with the three switches explicitly zeroed must
 * still reproduce the golden pre-incidents race. That is the property every
 * makeDeterministicTuning-based test in the suite rests on, and it is the
 * reason those tests did not all need rebaselining when incidents went live.
 * The fixture itself is unchanged.
 *
 * WHEN RE-CAPTURE IS LEGITIMATE. Only when the INPUT DATA deliberately
 * changes -- never after an engine-code change. A balance edit to
 * drivers.json or cars.json necessarily produces a different race, and no
 * guard can prevent that; an engine change that shifts the draw sequence
 * produces a different race too, and that is the bug this test exists to
 * catch. Telling them apart is the whole job, so before re-capturing, prove
 * it is the former:
 *
 *   - `incidents` is still [] and `safetyCar` still null (the guards hold)
 *   - lap, sector, weatherTimeline, trackEvolutionLaps are unchanged
 *   - the divergence is explainable by the data you edited
 *
 * Re-captured twice so far, both data changes, both with that evidence:
 *   1. RaceState gained `safetyCar`/`incidents` (shape only).
 *   2. 2026-09-12, the win-share fix: ROS 94->96, BRG 90->93, SIL 85->88.
 *      Verified incidents==[] and safetyCar==null, weather/lap/evolution
 *      identical; overtakes 21->17 and one extra retirement, both downstream
 *      of the intended pace edit.
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
      // Explicitly zeroed, not DATA.tuning: the shipped rates are live now.
      tuning: makeDeterministicTuning({ mechanicalFailure: { baseChancePerLap: 0.008 } }),
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

    /*
     * The GUARANTEE, asserted in its own right rather than left implicit in the
     * byte comparison below. A re-capture rewrites the fixture, so anything only
     * encoded there can be silently lost with it; these two cannot. With all
     * three incident switches zeroed the rolls must short-circuit before calling
     * rng() at all, which means nothing can ever be logged.
     */
    expect(state.incidents, 'zeroed rates must produce no incident at all').toEqual([])
    expect(state.safetyCar, 'zeroed deploy chances must never deploy').toBeNull()

    expect(JSON.stringify(state, null, 2) + '\n').toBe(golden)
  }, 60_000)
})

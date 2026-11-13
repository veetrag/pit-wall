import { describe, it, expect } from 'vitest'
import { buildConfigFromRecipe, type RaceRecipe } from '@state/raceRecipe'
import { encodeStart, decodeStart, CODE_FORMAT, type StartPayload } from '@state/startCode'
import { CALL_KINDS } from '@state/startCodes'
import { replay } from '@engine/debrief'
import type { PlayerCall, RaceConfig } from '@engine/index'
import { makeTuning } from '../fixtures/tuning'

// Scope 2026-11-07 Task 12': every 2.0 feature ON, whatever tuning.json ships
// (MODEL_SPEC §17.1 records which ship off), so this pins the full 2.0 path.
// Scope 2026-11-13 Task S: plus 2.1 tyre temperature (MODEL_SPEC §17.2).
const ALL_ON = makeTuning({
  trackEvolution: { wash: { DAMP: 0.35, WET: 0.80 } },
  drs: { enabled: true },
  incidents: { wetErrorMultiplier: { DRY: 1, DAMP: 1.4, WET: 1.8 }, circuitRiskWeight: 1 },
  ai: { scGambleMaxDelay: 3 },
  doubleStack: { enabled: true },
  penalties: { enabled: true },
  tyreTemp: { enabled: true },
})

const RECIPE: RaceRecipe = {
  seed: 20_011_107, playerDriverId: 'd_rossi', circuitId: 'harbour_lights', difficulty: 'pro',
  strategy: { startCompound: 'M', plannedStops: [{ lap: 14, compound: 'H' }], wing: 3 },
  overlay: null, gridOrder: null, dryStart: false, sprint: false, allDry: false,
  lapsPercent: 50, weather: 'changeable',
}
const CALLS: PlayerCall[] = [
  { step: 3, kind: 'pace', mode: 'push' },
  { step: 30, kind: 'hold_plan', hold: true },
  { step: 33, kind: 'hold_plan', hold: false },
  { step: 45, kind: 'pit', compound: 'H' },
  { step: 48, kind: 'pace', mode: 'conserve' },
]
const allOn = (r: RaceRecipe): RaceConfig => ({ ...buildConfigFromRecipe(r), tuning: ALL_ON })

describe('2.x replay (every shipped 2.x feature on)', () => {
  it('a race with pit / pace / hold_plan calls replays byte-identically through buildConfigFromRecipe', () => {
    const a = replay(allOn(RECIPE), RECIPE.seed, CALLS).state
    const b = replay(allOn(structuredClone(RECIPE)), RECIPE.seed, CALLS).state
    expect(a.lap).toBe(a.totalLaps)
    expect(a.cars.every(c => c.retired || c.thermal !== undefined)).toBe(true)
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
    // The features actually ran: the same race with the shipped tuning differs.
    const shipped = replay(buildConfigFromRecipe(RECIPE), RECIPE.seed, CALLS).state
    expect(JSON.stringify(shipped)).not.toBe(JSON.stringify(a))
  })

  it('its 1.9 start code round-trips and the decoded recipe replays the same race', () => {
    expect(CODE_FORMAT).toBe(1)
    expect(CALL_KINDS).toEqual(['pit', 'pace', 'restart_tyre', 'hold_plan'])
    const payload: StartPayload = {
      fingerprint: 0x2_0000, recipe: RECIPE, calls: CALLS, startLap: 18,
      expect: { position: 5, lapsRemaining: 7, compound: 'H', tyreAge: 4, par: 4 }, name: '2.0 all on',
    }
    const code = encodeStart(payload)
    expect(code.startsWith('PW1-')).toBe(true)
    const back = decodeStart(code)
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.payload).toEqual(payload)
    const a = replay(allOn(RECIPE), RECIPE.seed, CALLS).state
    const b = replay(allOn(back.payload.recipe), back.payload.recipe.seed, back.payload.calls).state
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })
})

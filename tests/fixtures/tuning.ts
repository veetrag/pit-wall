import { loadGameData } from '@data/validators'
import type { TuningConstants } from '@engine/types'

/**
 * The single source of test tuning constants.
 *
 * Five test files used to carry their own hand-written `TuningConstants`
 * literal. That is how the `NaN` poisoning happened: `vitest` does not
 * typecheck, so adding a required key to the tuning shape left every literal
 * silently short one field, `undefined` flowed into arithmetic
 * (`ahead.raceTime + undefined`), and a whole balance test reported a
 * plausible-looking but meaningless number (`smartGain = -1.09`) instead of
 * failing. Only `tsc --noEmit` caught it.
 *
 * The five copies had also drifted from `src/data/tuning.json` in twelve
 * places, including four weather constants that were roughly half their real
 * values and two `intensityBias` keys that did not exist in the fixtures at
 * all -- so tests believed they were exercising the shipped model and were not.
 *
 * Building from the real `tuning.json` fixes both: a new tuning key needs no
 * fixture edit anywhere, and a fixture can no longer quietly disagree with the
 * game. Anything a test genuinely wants different it states explicitly as an
 * override, where a reader can see it.
 */
type DeepPartial<T> = T extends readonly unknown[] ? T
  : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function deepMerge(base: unknown, over: unknown): unknown {
  if (over === undefined) return base
  if (!isPlainObject(base) || !isPlainObject(over)) return over
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(over)) {
    out[k] = deepMerge(base[k], v)
  }
  return out
}

const REAL = loadGameData().tuning

/**
 * The shipped tuning constants, with `overrides` deep-merged over the top.
 * Arrays are replaced wholesale, never merged element-wise.
 */
export function makeTuning(overrides: DeepPartial<TuningConstants> = {}): TuningConstants {
  return deepMerge(REAL, overrides) as TuningConstants
}

/**
 * The common engine-test baseline: the shipped constants with every random
 * incident switched off, so a unit test measures the mechanism it is about
 * rather than a DNF lottery. Prefer this in engine tests; pass overrides for
 * anything else a test needs to pin.
 */
export function makeDeterministicTuning(overrides: DeepPartial<TuningConstants> = {}): TuningConstants {
  return makeTuning(deepMerge({
    incidents: {
      dnfPerLap: 0,
      driverErrorPerLap: 0,
      // Zeroing the two deploy chances is what keeps the safety car out of
      // these tests, and it must be done HERE rather than via maxPerRace: 0.
      // The deployment roll is guarded on the deploy chance (see
      // incidents.ts), so a zero chance draws no rng() at all; a zero
      // maxPerRace checked after the roll would still consume a draw and
      // shift the stream for every existing test.
      safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 },
    },
    mechanicalFailure: { baseChancePerLap: 0 },
  }, overrides) as DeepPartial<TuningConstants>)
}

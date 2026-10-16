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
 * The incident switches zeroed, preserving every other key.
 *
 * For tests that build a tuning object from the shipped `tuning.json` directly
 * (rather than through `makeDeterministicTuning`) and measure some OTHER
 * mechanism. The rule this serves: **a test measuring mechanism X gets incidents
 * zeroed, unless incidents are its subject.** A traffic test whose sample is
 * being eaten by crashes -- or worse, whose overtakes are being suppressed by a
 * safety car -- is measuring less than it claims to.
 *
 * A FUNCTION rather than a spreadable constant, deliberately. As a constant it
 * read `{ driverErrorPerLap: 0, safetyCar: { crashDeployChance: 0, ... } }` and
 * every call site did `{ ...real.incidents, ...ZERO_INCIDENTS }` -- a SHALLOW
 * spread, which replaced `safetyCar` wholesale and dropped its other six keys.
 * That is the same partial-literal defect that once poisoned five fixtures with
 * NaN, and tsc caught it here only because the tuning type is fully required.
 * Taking the real object and returning a complete one makes the correct usage
 * the only usage.
 *
 * Zeroes the three RATES only; magnitudes and durations are inert once the rates
 * are zero, and pinning them here would let this drift from the shipped values
 * it exists to neutralise.
 */
export function zeroIncidents(
  incidents: TuningConstants['incidents'],
): TuningConstants['incidents'] {
  return {
    ...incidents,
    driverErrorPerLap: 0,
    safetyCar: { ...incidents.safetyCar, crashDeployChance: 0, mechanicalDeployChance: 0 },
    vsc: { ...incidents.vsc, crashDeployChance: 0, mechanicalDeployChance: 0 },
  }
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
      // Same reason as the SC chances above: zero CHANCES, so the VSC roll
      // draws nothing and the golden race stays byte-identical.
      vsc: { crashDeployChance: 0, mechanicalDeployChance: 0 },
    },
    mechanicalFailure: { baseChancePerLap: 0 },
  }, overrides) as DeepPartial<TuningConstants>)
}

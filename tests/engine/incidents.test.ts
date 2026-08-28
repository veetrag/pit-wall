import { describe, it, expect } from 'vitest'
import { createRng } from '@engine/rng'
import {
  driverErrorChancePerSector,
  rollDriverError,
  rollErrorIsTerminal,
  rollErrorTimeLoss,
  rollSafetyCarDeployment,
  rollSafetyCarDuration,
  compressRaceTimes,
  effectivePitLaneLoss,
} from '@engine/incidents'
import { makeTuning } from '../fixtures/tuning'
import { loadGameData } from '@data/validators'
import type { SafetyCarState } from '@engine/types'

const T = makeTuning({
  incidents: {
    driverErrorPerLap: 0.0105,
    terminalFraction: 0.20,
    errorTimeLossMean: 3.5,
    errorTimeLossSigma: 1.5,
    consistencyReliefMax: 0.35,
    safetyCar: { crashDeployChance: 0.30, mechanicalDeployChance: 0.12 },
  },
})

describe('driver error chance', () => {
  // The per-sector chance is the per-lap rate divided by 3 and relieved by
  // consistency, mirroring the wet spin's shape at lapModel.ts:67-71.
  it('is the per-lap rate over three, relieved by consistency', () => {
    // consistency 0 -> no relief at all
    expect(driverErrorChancePerSector(0, T)).toBeCloseTo(0.0105 / 3, 12)
    // consistency 100 -> full relief of consistencyReliefMax (35%)
    expect(driverErrorChancePerSector(100, T)).toBeCloseTo((0.0105 / 3) * 0.65, 12)
  })

  it('is monotonically decreasing in consistency', () => {
    let prev = Infinity
    for (let c = 0; c <= 100; c += 5) {
      const v = driverErrorChancePerSector(c, T)
      expect(v).toBeLessThan(prev)
      prev = v
    }
  })

  it('never goes negative even at maximum relief', () => {
    // consistencyReliefMax is zod-bounded to <= 1, so relief cannot exceed
    // 100% and this cannot flip sign. Asserted so a future bound change that
    // removes that guarantee fails here rather than silently making drivers
    // error-proof (a negative chance reads as "never" -- invulnerability).
    expect(driverErrorChancePerSector(100, makeTuning({
      incidents: { driverErrorPerLap: 0.0105, consistencyReliefMax: 1 },
    }))).toBe(0)
  })
})

describe('driver error roll', () => {
  it('converges on the configured chance', () => {
    const rng = createRng(7)
    const N = 200_000
    let hits = 0
    for (let i = 0; i < N; i++) if (rollDriverError(82.25, T, rng)) hits++
    const expected = driverErrorChancePerSector(82.25, T)
    // 4-sigma binomial band at N=200k
    const se = Math.sqrt(expected * (1 - expected) / N)
    expect(Math.abs(hits / N - expected)).toBeLessThan(4 * se)
  })

  it('DRAWS NOTHING when the rate is zero -- the RNG-stream guarantee', () => {
    // This is the property the whole existing test suite depends on. If the
    // guard is reordered to `rng() < chance && chance > 0`, this fails.
    const zeroed = makeTuning({ incidents: { driverErrorPerLap: 0 } })
    let draws = 0
    const counting = () => { draws++; return 0.5 }
    for (let i = 0; i < 100; i++) expect(rollDriverError(50, zeroed, counting)).toBe(false)
    expect(draws, 'rng() must not be called when driverErrorPerLap is 0').toBe(0)
  })
})

describe('terminal fraction', () => {
  it('converges on terminalFraction', () => {
    const rng = createRng(11)
    const N = 100_000
    let terminal = 0
    for (let i = 0; i < N; i++) if (rollErrorIsTerminal(T, rng)) terminal++
    const se = Math.sqrt(0.2 * 0.8 / N)
    expect(Math.abs(terminal / N - 0.20)).toBeLessThan(4 * se)
  })

  it('DRAWS NOTHING when terminalFraction is zero', () => {
    let draws = 0
    const counting = () => { draws++; return 0.5 }
    const zeroed = makeTuning({ incidents: { terminalFraction: 0 } })
    for (let i = 0; i < 100; i++) expect(rollErrorIsTerminal(zeroed, counting)).toBe(false)
    expect(draws).toBe(0)
  })
})

describe('error time loss', () => {
  // The clamp and the distribution are asserted SEPARATELY and deliberately.
  //
  // An earlier version of this test tried to catch the clamp through the mean,
  // reasoning that discarding the negative tail must lift it above 3.5. The
  // direction is right and the magnitude is hopeless: for X ~ N(3.5, 1.5) the
  // clamp bites at -2.33 sigma (0.98% of draws) and
  // E[max(0,X)] = mu*Phi(mu/sigma) + sigma*phi(mu/sigma) = 3.50498 -- a lift of
  // 0.005 against an SE at N=50k of 0.0066. The threshold sat 0.75 SE below the
  // true mean, so the test was a coin flip that happened to fail. The clamp is
  // simply not resolvable through the mean at any sample size this suite can
  // afford.
  //
  // `min >= 0` tests it exactly instead: without the clamp roughly 490 of these
  // 50,000 draws come back negative, so a missing Math.max is caught outright
  // rather than statistically.
  const N = 50_000

  it('never returns a negative loss -- the clamp', () => {
    const rng = createRng(13)
    let min = Infinity
    for (let i = 0; i < N; i++) min = Math.min(min, rollErrorTimeLoss(T, rng))
    expect(min, 'a missing Math.max(0, ...) shows up as ~490 negative draws').toBeGreaterThanOrEqual(0)
  })

  it('matches the analytic clamped mean and spread', () => {
    // FAILS IF errorTimeLossMean or errorTimeLossSigma stops being read, or the
    // Gaussian is mis-scaled. Tolerances are ~4 SE on each statistic
    // (SE(mean) = 0.0066, SE(sd) ~= 0.0047), not round numbers.
    const rng = createRng(13)
    const xs: number[] = []
    for (let i = 0; i < N; i++) xs.push(rollErrorTimeLoss(T, rng))
    const mean = xs.reduce((a, b) => a + b, 0) / N
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (N - 1))
    expect(mean, 'analytic E[max(0,X)] = 3.50498').toBeCloseTo(3.50498, 1)
    expect(Math.abs(mean - 3.50498)).toBeLessThan(0.03)
    expect(Math.abs(sd - 1.4868), 'analytic sd of the clamped variable').toBeLessThan(0.03)
  })
})

describe('safety car deployment roll', () => {
  it('uses the cause-specific chance', () => {
    const N = 100_000
    for (const [cause, p] of [['crash', 0.30], ['mechanical', 0.12]] as const) {
      const rng = createRng(17)
      let hits = 0
      for (let i = 0; i < N; i++) if (rollSafetyCarDeployment(cause, T, rng)) hits++
      const se = Math.sqrt(p * (1 - p) / N)
      expect(Math.abs(hits / N - p), `${cause} deploy rate`).toBeLessThan(4 * se)
    }
  })

  it('DRAWS NOTHING when the deploy chance is zero', () => {
    // Load-bearing beyond the usual reason: cars ALREADY retire today from
    // tyre and mechanical failures, so unlike the driver-error roll this one
    // would fire on the existing suite's retirements and break byte-identity
    // even with driverErrorPerLap at 0. The guard must be on the CHANCE.
    const zeroed = makeTuning({
      incidents: { safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 } },
    })
    let draws = 0
    const counting = () => { draws++; return 0.5 }
    for (const cause of ['crash', 'mechanical'] as const) {
      for (let i = 0; i < 100; i++) {
        expect(rollSafetyCarDeployment(cause, zeroed, counting)).toBe(false)
      }
    }
    expect(draws, 'rng() must not be called when both deploy chances are 0').toBe(0)
  })
})

describe('safety car duration', () => {
  it('stays within the configured inclusive bounds and covers them', () => {
    const rng = createRng(19)
    const seen = new Set<number>()
    for (let i = 0; i < 10_000; i++) {
      const d = rollSafetyCarDuration(T, rng)
      expect(Number.isInteger(d)).toBe(true)
      expect(d).toBeGreaterThanOrEqual(3)
      expect(d).toBeLessThanOrEqual(5)
      seen.add(d)
    }
    // Inclusive of BOTH ends: an off-by-one that makes max unreachable is the
    // most likely bug in an integer range roll.
    expect([...seen].sort()).toEqual([3, 4, 5])
  })
})

describe('gap compression', () => {
  it('scales every gap to the leader by the compression factor', () => {
    // Leader unmoved; a 25s gap becomes 8.75s at 0.35.
    expect(compressRaceTimes([100, 110, 125], 0.35)).toEqual([100, 103.5, 108.75])
  })

  it('is identity at compression 1 and full bunching at 0', () => {
    expect(compressRaceTimes([100, 110, 125], 1)).toEqual([100, 110, 125])
    expect(compressRaceTimes([100, 110, 125], 0)).toEqual([100, 100, 100])
  })

  it('takes the MINIMUM as the leader regardless of input order', () => {
    // race.ts passes active cars in whatever order they sit in; compression
    // must not depend on the caller having sorted them.
    expect(compressRaceTimes([125, 100, 110], 0.35)).toEqual([108.75, 100, 103.5])
  })

  it('returns an empty array unchanged', () => {
    expect(compressRaceTimes([], 0.35)).toEqual([])
  })
})

describe('effective pit lane loss', () => {
  const circuit = loadGameData().circuits['veloce']!   // pitLaneTimeLoss 18.0
  it('is the circuit value when there is no safety car', () => {
    expect(effectivePitLaneLoss(circuit, null, T)).toBe(18.0)
  })
  it('is laneTimeLossUnderSc while a safety car is active', () => {
    const sc: SafetyCarState = { deployedLap: 10, lapsRemaining: 3, cause: 'crash' }
    expect(effectivePitLaneLoss(circuit, sc, T)).toBe(T.incidents.safetyCar.laneTimeLossUnderSc)
  })
})

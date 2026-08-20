import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSeasonStore, TOTAL_RACES } from '@state/seasonStore'
import { applyUpgrades } from '@state/upgradeOverlay'
import { loadGameData } from '@data/validators'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS
//
// Every other rival-development test asserts the accrual/application round trip
// against `poolPerRace * rate * facets.length` — an algebraic identity that
// holds for ANY value of poolPerRace. Seven passing task reviews therefore
// missed the feature being balance-inverted: rivals were gaining 0.71 s/lap a
// season (1.00 for Terra) against a player budget of ~0.54, so the underdog arc
// the whole feature exists to create ran backwards.
//
// These tests assert the MAGNITUDE, in seconds per lap, against a band. They are
// computed from the engine's own coefficients rather than a hand-written table,
// so a tuning.json change moves them honestly — but `poolPerRace` cannot drift
// without failing them.
// ---------------------------------------------------------------------------

const GAME = loadGameData()
const TUNING = GAME.tuning

/**
 * Seconds of lap time one point of a car facet is worth, derived exactly as the
 * engine computes it:
 *   lapModel.facetToRating9:  rating = (1 - facet/100) * 9   -> 9/100 per point
 *   lapModel car delta:       rating * carPerformance.deltaPerRating * split
 *   a lap is three sectors, and a car facet governs exactly one of them.
 */
function secondsPerLapPerCarFacetPoint(facet: 'power' | 'aero' | 'handling'): number {
  const sector = { power: 0, aero: 1, handling: 2 }[facet]
  const split = TUNING.carPerformance.sectorSplit[sector]!
  return (9 / 100) * TUNING.carPerformance.deltaPerRating * split * 3
}

/** Driver `pace`, which governs all three sectors, so its weights sum. */
function secondsPerLapPerPacePoint(): number {
  const split = TUNING.driverPerformance.sectorSplit.reduce((a, b) => a + b, 0)
  return (10 / 100) * TUNING.driverPerformance.deltaPerSkill * split * 3
}

/**
 * The lap time one team has gained from rival development, measured through the
 * real overlay: accrue the pool with the real store, apply it with the real
 * `applyUpgrades`, and price the resulting facet deltas with the engine's
 * coefficients. Nothing here re-implements the accrual arithmetic.
 */
function rivalSecondsGained(teamId: string, rivalDevelopment: Record<string, number>): number {
  const raw = GAME.cars.teams
  const developed = applyUpgrades(raw, {
    attributes: GAME.upgrades.attributes,
    purchasedTiers: {},
    target: 'team',
    appliesTo: () => false, // everyone is a rival in this measurement
    rivalDevelopment,
  })
  const before = raw.find(t => t.id === teamId)!.facets
  const after = developed.find(t => t.id === teamId)!.facets
  let secs = 0
  for (const facet of ['power', 'aero', 'handling'] as const) {
    secs += secondsPerLapPerCarFacetPoint(facet) * (after[facet] - before[facet])
  }
  return secs
}

/** The pool every team holds after a full season of racing, from the real store. */
function seasonPool(): Record<string, number> {
  useSeasonStore.getState().startNewSeason()
  // ACCRUALS, not races. Income and rival development are both awarded in
  // recordRaceResult, i.e. AFTER a race, while the development screen is shown
  // BEFORE one — so the state that the final race actually runs with is the
  // state after TOTAL_RACES - 1 accruals. This is the same off-by-one that makes
  // the real DP budget 110 rather than the advertised 120.
  for (let i = 0; i < TOTAL_RACES - 1; i++) {
    useSeasonStore.getState().recordRaceResult(
      [{ driverId: 'd_voss', position: 1, retired: false }],
      { overtakesGained: 0, pitsDone: 1, hadRain: false },
    )
  }
  return { ...useSeasonStore.getState().rivalDevelopment }
}

describe('rival development magnitude (seconds per lap, not the accrual identity)', () => {
  beforeEach(() => { useSeasonStore.getState().startNewSeason() })

  it('gives an average-rate team ~0.24 s/lap over a full season', () => {
    // The owner's stated target: rivals stay a live threat but must be beatable
    // against the ~0.54 s/lap a player can buy with their real 110-DP budget.
    // At poolPerRace 0.36 this is 3.96 points on each of power/aero/handling,
    // and the three car sectorSplits sum to 1, so the price is
    // 3.96 * (9/100) * 0.22 * 3 = 0.235 s/lap.
    const pool = seasonPool()
    // apex/meridian/kestrel/solstice/nimbus are all developmentRate 1.0.
    const gain = rivalSecondsGained('nimbus', pool)
    expect(gain).toBeGreaterThan(0.18)
    expect(gain).toBeLessThan(0.30)
  })

  it('keeps even the fastest-developing team well under half a second', () => {
    // Terra at developmentRate 1.4 is the ceiling of the whole mechanic. At the
    // old poolPerRace of 1 this was 1.00 s/lap — nearly double what the player
    // could buy with an entire season's income, which is what inverted the arc.
    const pool = seasonPool()
    const gains = GAME.cars.teams.map(t => rivalSecondsGained(t.id, pool))
    expect(Math.max(...gains)).toBeLessThan(0.40)
    expect(Math.min(...gains)).toBeGreaterThan(0.15) // still a moving target
  })

  it('THE FEATURE INVARIANT: a full-budget player out-develops the average rival', () => {
    // If this fails, the underdog arc runs backwards and the player watches
    // themselves lose an unwinnable arms race — which is exactly what shipped
    // before poolPerRace was cut. This is the single assertion the whole
    // Development Points feature depends on.
    const pool = seasonPool()

    const rivalGains = GAME.cars.teams
      .filter(t => t.id !== 'zenith')
      .map(t => rivalSecondsGained(t.id, pool))
    const averageRival = rivalGains.reduce((a, b) => a + b, 0) / rivalGains.length

    // The player's best full-budget build: two max-outs (the real 110-DP budget
    // is exactly 2 x 55), applied through the real overlay to the weakest team
    // so there is no facet-ceiling clamping in the way.
    const maxTiers = GAME.upgrades.tierCosts.length
    const tiers = { power: maxTiers, pace: maxTiers }
    const teams = applyUpgrades(GAME.cars.teams, {
      attributes: GAME.upgrades.attributes,
      purchasedTiers: tiers,
      target: 'team',
      appliesTo: t => t.id === 'zenith',
    })
    const drivers = applyUpgrades(GAME.drivers.drivers, {
      attributes: GAME.upgrades.attributes,
      purchasedTiers: tiers,
      target: 'driver',
      appliesTo: d => d.teamId === 'zenith',
    })
    const rawTeam = GAME.cars.teams.find(t => t.id === 'zenith')!
    const upTeam = teams.find(t => t.id === 'zenith')!
    const rawDriver = GAME.drivers.drivers.find(d => d.teamId === 'zenith')!
    const upDriver = drivers.find(d => d.id === rawDriver.id)!

    let playerGain = 0
    for (const facet of ['power', 'aero', 'handling'] as const) {
      playerGain += secondsPerLapPerCarFacetPoint(facet) * (upTeam.facets[facet] - rawTeam.facets[facet])
    }
    playerGain += secondsPerLapPerPacePoint() * (upDriver.facets.pace - rawDriver.facets.pace)

    expect(playerGain).toBeGreaterThan(averageRival)
    // And by a margin the player can feel, not a rounding win.
    expect(playerGain / averageRival).toBeGreaterThan(1.4)
  })

  it('the spendable budget really does buy two max-outs and no more', () => {
    // Pins the economy lever alongside the magnitude, because the invariant
    // above is only meaningful if the player can actually afford that build.
    const { income, tierCosts } = GAME.upgrades
    const maxOut = tierCosts.reduce((a, b) => a + b, 0)
    expect(income.perRace * (TOTAL_RACES - 1)).toBe(2 * maxOut)
  })
})

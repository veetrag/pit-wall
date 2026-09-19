import { describe, it, expect } from 'vitest'
import { runQualifying, createRng, generateWeatherTimeline } from '@engine/index'
import { buildRaceConfig } from '@state/buildRaceConfig'
import { loadGameData } from '@data/validators'

const PLAYER = 'd_kane'  // a back-of-the-grid driver, so there is room to improve

/*
 * THE TYRE MUST MATCH THE CONDITIONS, and getting this wrong silently destroys
 * the measurement.
 *
 * runQualifying derives its weather exactly as initRace does, from
 * weatherSeed ?? seed + 999999. Config seed 7 at bengaluru comes up DAMP, so
 * every rival switches to Intermediates via their brain's softest-legal pick.
 * An earlier version of this file hardcoded compound 'S' for the player, which
 * put them on a dry tyre in the wet and pinned them at P20 with zero variance
 * -- and therefore showed maxed upgrades buying exactly 0.00 grid slots,
 * looking for all the world like the feature did not work. It does: on the
 * right tyre those same upgrades are worth 9.4 slots at this seed.
 *
 * Pick the compound the way a competent player would, so the measurement is of
 * the upgrades and not of a tyre blunder.
 */
function softestLegal(config: ReturnType<typeof buildRaceConfig>) {
  const weather = generateWeatherTimeline(
    config.circuit.laps, config.circuit, config.tuning,
    createRng(config.weatherSeed ?? config.seed + 999999),
  )[0] ?? 'DRY'
  return weather === 'WET' ? 'W' as const : weather === 'DAMP' ? 'I' as const : 'S' as const
}

function meanGrid(upgrades: Parameters<typeof buildRaceConfig>[5]) {
  const config = buildRaceConfig(7, PLAYER, 'bengaluru', 'rookie', null, upgrades)
  const compound = softestLegal(config)
  let total = 0
  const N = 80
  for (let seed = 0; seed < N; seed++) {
    const r = runQualifying(config, createRng(seed), { compound, attack: 'balanced' })
    total += r.order.indexOf(PLAYER) + 1
  }
  return total / N
}

describe('the defect this feature exists to fix', () => {
  it('THE GRID IS NO LONGER IDENTICAL EVERY RACE', () => {
    /*
     * Before qualifying, initRace assigned position from drivers.json order, so
     * d_kane started P20 at all 12 rounds of every season and d_voss started
     * pole at all 12. If this ever passes trivially again, the feature is gone.
     */
    const config = buildRaceConfig(7, PLAYER, 'bengaluru', 'rookie', null, null)
    const compound = softestLegal(config)
    const grids = new Set<string>()
    for (let seed = 0; seed < 20; seed++) {
      grids.add(runQualifying(config, createRng(seed), { compound, attack: 'balanced' }).order.join(','))
    }
    expect(grids.size, 'every seed produced the same grid').toBeGreaterThan(15)
  }, 60_000)

  it('UPGRADES BUY TRACK POSITION', () => {
    /*
     * The point of the feature. Before it, Development could buy pace but never
     * a starting slot. Maxing every car attribute must measurably improve the
     * average grid position.
     */
    // There is no `tiers` array on an attribute: the number of tiers is the
    // length of the shared tierCosts list (see seasonStore.ts:176-179).
    const { attributes, tierCosts } = loadGameData().upgrades
    const maxed = Object.fromEntries(
      attributes.map(a => [a.id, tierCosts.length]),
    )
    const without = meanGrid(null)
    const with_ = meanGrid({ purchasedTiers: maxed, rivalDevelopment: {} })
    expect(with_, `maxed upgrades: P${with_.toFixed(2)} vs stock P${without.toFixed(2)}`)
      .toBeLessThan(without - 0.5)
  }, 120_000)
})

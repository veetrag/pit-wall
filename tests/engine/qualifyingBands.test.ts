import { describe, it, expect } from 'vitest'
import { runQualifying, createRng } from '@engine/index'
import { buildRaceConfig } from '@state/buildRaceConfig'

describe('qualifying regression bands', () => {
  it('ATTACK PRODUCES A SCRAPPY LAP AT THE TUNED RATE', () => {
    /*
     * The oracle for tuning.qualifying.attackLevels.attack.errorChance, in the
     * style of the Monte-Carlo bands in MODEL_SPEC.md 10.1. Sampling 200 runs
     * of a p=0.15 Bernoulli gives a standard error near 0.025, so the 0.10-0.20
     * band is roughly +/- 2 SE -- wide enough not to flake, tight enough to
     * catch the rate being wired to the wrong level.
     */
    const config = buildRaceConfig(1, 'd_voss', 'bengaluru', 'rookie', null, null)
    let scrappy = 0
    const N = 200
    for (let seed = 0; seed < N; seed++) {
      const r = runQualifying(config, createRng(seed), { compound: 'S', attack: 'attack' })
      if (r.laps.find(l => l.driverId === config.playerDriverId)!.scrappy) scrappy++
    }
    expect(scrappy / N).toBeGreaterThanOrEqual(0.10)
    expect(scrappy / N).toBeLessThanOrEqual(0.20)
  }, 60_000)

  it('A TOP CAR STILL QUALIFIES NEAR THE FRONT', () => {
    // Guards the opposite failure from the band above: noise so dominant that
    // car quality stops mattering and qualifying becomes a lottery.
    const config = buildRaceConfig(1, 'd_voss', 'bengaluru', 'rookie', null, null)
    let total = 0
    const N = 100
    for (let seed = 0; seed < N; seed++) {
      const r = runQualifying(config, createRng(seed), { compound: 'S', attack: 'balanced' })
      total += r.order.indexOf(config.playerDriverId) + 1
    }
    expect(total / N, 'd_voss is a front-running car and must qualify like one').toBeLessThan(8)
  }, 60_000)
})

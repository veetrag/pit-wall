import { describe, it, expect } from 'vitest'
import { runQualifying, createRng } from '@engine/index'
import { buildRaceConfig } from '@state/buildRaceConfig'

describe('qualifying regression bands', () => {
  it('ATTACK PRODUCES A SCRAPPY LAP AT THE TUNED RATE', () => {
    /*
     * The oracle for tuning.qualifying.attackLevels.attack.errorChance, in the
     * style of the Monte-Carlo bands in MODEL_SPEC.md 10.1.
     *
     * N IS 1000 BECAUSE 200 WAS NOT ENOUGH, and the original band nearly
     * failed for a correct implementation. Convergence of the player's scrappy
     * rate against a configured 0.15, measured:
     *
     *     N= 200  ->  0.1250
     *     N= 400  ->  0.1050     <- an 0.10 floor is one sample from failing
     *     N= 600  ->  0.1250
     *     N=1000  ->  0.1480
     *     N=4000  ->  0.1445
     *
     * The rate is correct; a 200-sample Bernoulli estimate simply has a
     * standard error near 0.025 and wanders. At N=1000 the standard error is
     * 0.0113, so the 0.11-0.19 band below is about +/- 3.5 SE -- comfortably
     * clear of honest noise, and still tight enough to catch attack being
     * wired to balanced's 0.06 or conserve's 0.02.
     *
     * A wider band on a smaller sample would have been the wrong repair: it
     * buys the same safety by giving up the ability to tell 0.15 from 0.10.
     */
    const config = buildRaceConfig(1, 'd_voss', 'bengaluru', 'rookie', null, null)
    let scrappy = 0
    const N = 1000
    for (let seed = 0; seed < N; seed++) {
      const r = runQualifying(config, createRng(seed), { compound: 'S', attack: 'attack' })
      if (r.laps.find(l => l.driverId === config.playerDriverId)!.scrappy) scrappy++
    }
    const rate = scrappy / N
    expect(rate, `attack scrappy rate ${rate.toFixed(4)} (configured 0.15)`).toBeGreaterThanOrEqual(0.11)
    expect(rate, `attack scrappy rate ${rate.toFixed(4)} (configured 0.15)`).toBeLessThanOrEqual(0.19)
  }, 180_000)

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

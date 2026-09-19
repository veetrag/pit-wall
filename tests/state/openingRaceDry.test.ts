import { describe, it, expect } from 'vitest'
import { buildRaceConfig } from '@state/buildRaceConfig'
import { seedFor } from '@state/seasonStore'
import { CIRCUIT_ORDER } from '@state/raceStore'
import { initRace } from '@engine/index'

function openingWeather(seed: number, circuit: string, dryStart?: boolean) {
  return initRace(buildRaceConfig(seed, 'd_voss', circuit, 'rookie', null, null, undefined, dryStart))
    .weatherTimeline[0]
}

describe('round 1 never starts wet', () => {
  it('A NEW PLAYER’S FIRST EVER RACE IS DRY', () => {
    /*
     * The seed for season 1, round 1, first attempt is 42, and at seed 42 the
     * opening roll lands wet at nearly every circuit on the calendar --
     * measured: every one except sol_desert, including altiplano at
     * rainProbability 0.15. So this could NOT be fixed by reordering the
     * calendar, and moving the seed base would have shifted every race in the
     * game and broken byteIdentity.
     */
    expect(openingWeather(seedFor(1, 0, 0), CIRCUIT_ORDER[0]!, false)).toBe('WET')
    expect(openingWeather(seedFor(1, 0, 0), CIRCUIT_ORDER[0]!, true)).toBe('DRY')
  })

  it('every season opener starts dry, at every attempt', () => {
    for (let season = 1; season <= 10; season++) {
      for (const nonce of [0, 1, 5]) {
        expect(
          openingWeather(seedFor(season, 0, nonce), CIRCUIT_ORDER[0]!, true),
          `season ${season}, attempt ${nonce}`,
        ).toBe('DRY')
      }
    }
  })

  it('BUT RAIN CAN STILL ARRIVE LATER IN THE OPENER', () => {
    // The flag constrains the OPENING conditions, not the race. A round 1 that
    // could never rain would be a worse fix than the bug.
    const seeds = Array.from({ length: 40 }, (_, i) => seedFor(i + 1, 0, 0))
    const anyRainLater = seeds.some(seed => {
      const tl = initRace(buildRaceConfig(seed, 'd_voss', CIRCUIT_ORDER[0]!, 'rookie', null, null, undefined, true)).weatherTimeline
      return tl.slice(1).some(w => w !== 'DRY')
    })
    expect(anyRainLater, 'a dry START must not mean a permanently dry race').toBe(true)
  })

  it('leaves every other round alone', () => {
    // Rounds 2+ pass dryStart false, so their weather is untouched by this
    // change -- including the wet-leaning circuits the calendar deliberately
    // spaces out.
    const before = openingWeather(seedFor(1, 3, 0), 'monsoon_bay', false)
    const after = openingWeather(seedFor(1, 3, 0), 'monsoon_bay', undefined)
    expect(after).toBe(before)
  })
})

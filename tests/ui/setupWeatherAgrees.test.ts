import { describe, it, expect } from 'vitest'
import { computeStartWeather } from '@ui/RaceSetup'
import { buildRaceConfig } from '@state/buildRaceConfig'
import { seedFor } from '@state/seasonStore'
import { CIRCUIT_ORDER } from '@state/raceStore'
import { initRace } from '@engine/index'
import { loadGameData } from '@data/validators'

/*
 * THE SETUP SCREEN MUST NOT LIE.
 *
 * Race Setup shows "CONDITIONS AT LIGHTS OUT" and auto-selects the starting
 * compound from it. It derives that by calling generateWeatherTimeline
 * DIRECTLY -- a third derivation site alongside initRace() and qualifying.ts,
 * which is how it got missed when dryStart was added.
 *
 * The result on a real phone: round 1 showed WET and pre-selected the wet
 * tyre, for a race that now starts DRY. That is worse than the bug dryStart
 * was fixing -- a player who trusts the screen starts on wets on a dry track
 * and loses the race on lap 1.
 *
 * Testing buildRaceConfig and initRace agreed with each other was not enough,
 * because the screen went around both. This test pins the thing that actually
 * matters: what the player is SHOWN equals what the engine will DO.
 */
const circuits = loadGameData().circuits

function actualOpeningWeather(seed: number, circuitId: string, dryStart: boolean) {
  return initRace(
    buildRaceConfig(seed, 'd_voss', circuitId, 'rookie', null, null, undefined, dryStart),
  ).weatherTimeline[0]
}

describe('the setup preview agrees with the race that follows', () => {
  it('AGREES ON ROUND 1, WHICH IS FORCED DRY', () => {
    const circuitId = CIRCUIT_ORDER[0]!
    const seed = seedFor(1, 0, 0)
    const laps = circuits[circuitId]!.laps
    const shown = computeStartWeather(circuitId, laps, seed, true)[0]
    expect(shown, 'the opener is forced dry, so the screen must say dry').toBe('DRY')
    expect(shown).toBe(actualOpeningWeather(seed, circuitId, true))
  })

  it('AGREES ON EVERY ROUND OF EVERY CIRCUIT, FOR SEVERAL SEASONS', () => {
    for (let season = 1; season <= 4; season++) {
      for (let round = 0; round < CIRCUIT_ORDER.length; round++) {
        const circuitId = CIRCUIT_ORDER[round]!
        const seed = seedFor(season, round, 0)
        const dryStart = round === 0
        const laps = circuits[circuitId]!.laps
        expect(
          computeStartWeather(circuitId, laps, seed, dryStart)[0],
          `season ${season} round ${round + 1} (${circuitId})`,
        ).toBe(actualOpeningWeather(seed, circuitId, dryStart))
      }
    }
  })

  it('still shows WET when the race really is wet', () => {
    // The fix must not have turned the preview into a permanent "DRY" label.
    const wet = CIRCUIT_ORDER.map((c, round) => computeStartWeather(c, circuits[c]!.laps, seedFor(1, round, 0), false)[0])
      .some(w => w !== 'DRY')
    expect(wet, 'a non-opening round must still be able to show rain').toBe(true)
  })
})

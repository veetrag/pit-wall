import { describe, it, expect } from 'vitest'
import { runQualifying, createRng, generateWeatherTimeline, type WeatherState } from '@engine/index'
import { buildRaceConfig } from '@state/buildRaceConfig'

/*
 * The wet path had NO coverage. It was written, and it was exercised by hand on
 * an API 30 emulator, but nothing asserted it -- and the one bug it hid was
 * expensive: a test that hardcoded a dry compound at a damp seed made maxed
 * upgrades look worth exactly 0.00 grid slots, which was misdiagnosed as the
 * car balance being wrong rather than the tyre being wrong.
 *
 * Seeds below are pinned to their weather by the assertions in the first test,
 * so if weather generation ever shifts these fail loudly rather than silently
 * testing the dry path three times.
 */
const CIRCUIT = 'bengaluru'
const SEEDS = { DRY: 1, DAMP: 7, WET: 10 } as const

function configFor(seed: number) {
  return buildRaceConfig(seed, 'd_voss', CIRCUIT, 'rookie', null, null)
}

function weatherOf(config: ReturnType<typeof buildRaceConfig>): WeatherState {
  return generateWeatherTimeline(
    config.circuit.laps, config.circuit, config.tuning,
    createRng(config.weatherSeed ?? config.seed + 999999),
  )[0] ?? 'DRY'
}

describe('qualifying in the wet', () => {
  it('THE PINNED SEEDS STILL PRODUCE THE WEATHER THEY CLAIM', () => {
    // Guards every other test in this file. Without it, a change to weather
    // generation would quietly turn the wet tests into dry ones.
    for (const [expected, seed] of Object.entries(SEEDS)) {
      expect(weatherOf(configFor(seed)), `seed ${seed} should be ${expected}`).toBe(expected)
    }
  })

  it('RIVALS FIT WETS IN THE WET AND INTERS IN THE DAMP', () => {
    /*
     * rivalCall picks the softest LEGAL compound for the conditions, so in the
     * wet every rival -- including the naive brains that take a medium in the
     * dry -- must be on a wet-weather tyre. If this regressed, the AI field
     * would run dry tyres in the rain and the player would take pole by
     * default.
     */
    for (const [weather, expectedCompound] of [['WET', 'W'], ['DAMP', 'I']] as const) {
      const config = configFor(SEEDS[weather])
      const result = runQualifying(config, createRng(3), { compound: 'W', attack: 'balanced' })
      const rivals = result.laps.filter(l => l.driverId !== config.playerDriverId)
      expect(rivals.length).toBeGreaterThan(10)
      expect(
        rivals.every(l => l.compound === expectedCompound),
        `in ${weather} every rival should be on ${expectedCompound}, got ${[...new Set(rivals.map(l => l.compound))].join(',')}`,
      ).toBe(true)
    }
  })

  it('RIVALS SPLIT BY BRAIN IN THE DRY', () => {
    // The dry counterpart: naive brains take a medium, better brains take the
    // soft. A single compound across the whole field would mean the brain tier
    // stopped being consulted.
    const config = configFor(SEEDS.DRY)
    const result = runQualifying(config, createRng(3), { compound: 'S', attack: 'balanced' })
    const rivals = result.laps.filter(l => l.driverId !== config.playerDriverId)
    const compounds = new Set(rivals.map(l => l.compound))
    expect(compounds.has('S'), 'sharper brains should take the soft').toBe(true)
    expect(compounds.has('M'), 'naive brains should take the medium').toBe(true)
    expect(compounds.has('W') || compounds.has('I'), 'no wet tyres in the dry').toBe(false)
  })

  it("THE PLAYER'S OWN WET CALL IS HONOURED, INCLUDING A BAD ONE", () => {
    /*
     * Choosing a dry tyre in the wet is a legitimate (terrible) gamble and must
     * not be silently corrected -- the same principle that already protects the
     * player's pre-race compound choice in initRace.
     */
    const config = configFor(SEEDS.WET)
    const result = runQualifying(config, createRng(3), { compound: 'S', attack: 'balanced' })
    const player = result.laps.find(l => l.driverId === config.playerDriverId)!
    expect(player.compound, 'the bad choice must stand').toBe('S')
  })

  it('A DRY TYRE IN THE WET IS RUINOUS, NOT MERELY SLOWER', () => {
    /*
     * This is the shape of the decision the conditions banner exists to inform.
     * Measured on device: soft in a wet session qualified P20; wets on the same
     * seed qualified P1. Assert the gap is large and the position collapses, so
     * a future change that quietly softened the wet penalty would show up here
     * rather than as "qualifying feels random".
     */
    const config = configFor(SEEDS.WET)
    const wets = runQualifying(config, createRng(3), { compound: 'W', attack: 'balanced' })
    const drys = runQualifying(config, createRng(3), { compound: 'S', attack: 'balanced' })
    const id = config.playerDriverId
    const onWets = wets.laps.find(l => l.driverId === id)!
    const onDrys = drys.laps.find(l => l.driverId === id)!

    expect(onDrys.time - onWets.time, 'a dry tyre in the wet should cost seconds, not tenths')
      .toBeGreaterThan(2)
    expect(wets.order.indexOf(id)).toBeLessThan(drys.order.indexOf(id))
    expect(drys.order.indexOf(id) + 1, 'the wrong tyre should put the player at the back')
      .toBeGreaterThan(config.drivers.length / 2)
  })
})

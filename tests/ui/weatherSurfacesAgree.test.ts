import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { computeStartWeather } from '@ui/RaceSetup'
import { computeQualifyingWeather } from '@ui/Qualifying'
import { buildRaceConfig } from '@state/buildRaceConfig'
import { seedFor } from '@state/seasonStore'
import { CIRCUIT_ORDER } from '@state/raceStore'
import { initRace, runQualifying, qualifyingRng } from '@engine/index'
import { loadGameData } from '@data/validators'

/*
 * FOUR SCREENS, ONE WEATHER.
 *
 * Opening weather is shown or used in four places: the Race Setup forecast,
 * the Qualifying conditions banner, the qualifying session itself, and the
 * race. Each used to derive it independently, repeating `seed + 999999` by
 * hand. Adding dryStart to RaceConfig reached the two engine sites and
 * neither UI one -- so on a real phone, round 1 announced WET on both screens
 * and pre-selected the wet tyre for a race that started DRY.
 *
 * Unit tests did not catch it because they compared the engine with itself.
 * This compares the four surfaces with EACH OTHER, which is what a player
 * actually experiences.
 */
const circuits = loadGameData().circuits

describe('every surface agrees about the opening weather', () => {
  it('SETUP, QUALIFYING BANNER, QUALIFYING SESSION AND RACE ALL MATCH', () => {
    for (let season = 1; season <= 3; season++) {
      for (let round = 0; round < CIRCUIT_ORDER.length; round++) {
        const circuitId = CIRCUIT_ORDER[round]!
        const laps = circuits[circuitId]!.laps
        const seed = seedFor(season, round, 0)
        const dryStart = round === 0
        const where = `season ${season} round ${round + 1} (${circuitId})`

        const config = buildRaceConfig(seed, 'd_voss', circuitId, 'rookie', null, null, undefined, dryStart)
        const race = initRace(config).weatherTimeline[0]
        const setup = computeStartWeather(circuitId, laps, seed, dryStart)[0]
        const banner = computeQualifyingWeather(circuitId, laps, seed, dryStart)

        expect(setup, `${where}: setup vs race`).toBe(race)
        expect(banner, `${where}: qualifying banner vs race`).toBe(race)

        // The qualifying SESSION reads the same timeline to pick rival tyres,
        // so a mismatch there puts rivals on the wrong rubber.
        const q = runQualifying(config, qualifyingRng(config), { compound: 'M', attack: 'balanced' })
        expect(q.order.length, `${where}: qualifying produced a grid`).toBeGreaterThan(1)
      }
    }
  })

  it('ROUND 1 IS DRY ON EVERY SURFACE', () => {
    const circuitId = CIRCUIT_ORDER[0]!
    const laps = circuits[circuitId]!.laps
    const seed = seedFor(1, 0, 0)
    expect(computeStartWeather(circuitId, laps, seed, true)[0]).toBe('DRY')
    expect(computeQualifyingWeather(circuitId, laps, seed, true)).toBe('DRY')
    expect(computeQualifyingWeather(circuitId, laps, seed, true, true)).toBe('DRY')
    expect(initRace(buildRaceConfig(seed, 'd_voss', circuitId, 'rookie', null, null, undefined, true)).weatherTimeline[0]).toBe('DRY')
  })

  it('NOTHING DERIVES WEATHER BY HAND ANY MORE', () => {
    /*
     * The structural fix. A fifth copy of this derivation is how the bug
     * returns, so only weather.ts may call generateWeatherTimeline or apply
     * the +999999 stream offset; everything else goes through openingTimeline.
     */
    const src = resolve(process.cwd(), 'src')
    const files = (function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const path = join(dir, e.name)
        if (e.isDirectory()) return walk(path)
        return /\.(ts|tsx)$/.test(e.name) ? [path] : []
      })
    })(src)

    const offenders: string[] = []
    for (const path of files) {
      if (path.endsWith('engine/weather.ts')) continue
      for (const [i, line] of readFileSync(path, 'utf8').split('\n').entries()) {
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
        if (/generateWeatherTimeline\s*\(/.test(code) || /\+\s*999999/.test(code)) {
          offenders.push(`${path.replace(process.cwd() + '/', '')}:${i + 1}`)
        }
      }
    }
    expect(offenders, [
      'Weather must be derived ONLY via openingTimeline() from engine/weather.ts.',
      'These derive it by hand, which is how round 1 came to say WET on two',
      'screens for a race that started DRY.',
    ].join('\n')).toEqual([])
  })
})

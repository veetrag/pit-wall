import { describe, it, expect } from 'vitest'
import { buildRaceConfig, isFirstCareerRace } from '@state/buildRaceConfig'
import { seedFor } from '@state/seasonStore'
import { CIRCUIT_ORDER } from '@state/raceStore'
import { initRace, generateWeatherTimeline, runQualifying, qualifyingRng } from '@engine/index'
import { loadGameData } from '@data/validators'

const DATA = loadGameData()
const opener = CIRCUIT_ORDER[0]!

describe('the first career race is fully dry (spec 1.6 §0.2)', () => {
  it('only season 1, round 1 is the first career race', () => {
    expect(isFirstCareerRace(1, 0)).toBe(true)
    expect(isFirstCareerRace(1, 1)).toBe(false)
    expect(isFirstCareerRace(2, 0)).toBe(false)
  })

  it('EVERY LAP IS DRY, on a seed whose round-1 race would otherwise rain later', () => {
    const nonce = Array.from({ length: 40 }, (_, i) => i).find(n =>
      initRace(buildRaceConfig(seedFor(1, 0, n), 'd_voss', opener, 'rookie', null, null, undefined, true))
        .weatherTimeline.some(w => w !== 'DRY'))
    expect(nonce, 'premise: some opener attempt rains after lap 1').toBeDefined()
    const seed = seedFor(1, 0, nonce!)
    const tl = initRace(buildRaceConfig(seed, 'd_voss', opener, 'rookie', null, null, undefined, true, false, true)).weatherTimeline
    expect(tl.length).toBe(DATA.circuits[opener]!.laps)
    expect(tl.every(w => w === 'DRY')).toBe(true)
  })

  it('consumes exactly the same weather draws, so nothing downstream shifts', () => {
    const circuit = DATA.circuits['monsoon_bay']!
    const count = (allDry: boolean) => {
      let n = 0
      const base = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } })()
      generateWeatherTimeline(circuit.laps, circuit, DATA.tuning, () => { n++; return base() }, true, allDry)
      return n
    }
    expect(count(true)).toBe(count(false))
  })

  it('the key is ABSENT everywhere else, and qualifying reads the same flag', () => {
    const later = buildRaceConfig(seedFor(1, 1, 0), 'd_voss', CIRCUIT_ORDER[1]!, 'rookie', null, null, undefined, false)
    expect('allDry' in later).toBe(false)
    const first = buildRaceConfig(seedFor(1, 0, 0), 'd_voss', opener, 'rookie', null, null, undefined, true, false, true)
    expect(first.allDry).toBe(true)
    const q = runQualifying(first, qualifyingRng(first), { compound: 'M', attack: 'balanced' })
    expect(q.laps.every(l => l.compound !== 'I' && l.compound !== 'W'), 'nobody qualifies on wets for a dry race').toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { makeCustomStart, situationAt, lapRange, defaultStartName, rederive, startChallenge } from '@state/customStart'
import { encodeStart, decodeStart } from '@state/startCode'
import { parFromHandover } from '@engine/customStart'
import { buildConfigFromRecipe, type RaceRecipe } from '@state/raceRecipe'
import type { PlayerCall } from '@engine/playerCalls'

const RECIPE: RaceRecipe = {
  seed: 9042, playerDriverId: 'd_park', circuitId: 'costa_verde', difficulty: 'rookie',
  strategy: { startCompound: 'M', plannedStops: [{ lap: 21, compound: 'H' }], wing: 3 },
  overlay: null, gridOrder: null, dryStart: false, sprint: false, allDry: false, lapsPercent: 100, weather: 'circuit',
}
const CALLS: PlayerCall[] = [{ step: 0, kind: 'pace', mode: 'push' }, { step: 40, kind: 'pace', mode: 'neutral' }]

describe('making a start', () => {
  it('offers laps 1 .. laps - 3', () => { expect(lapRange(RECIPE)).toEqual({ min: 1, max: 43 }) })
  it('names a start after the circuit and lap, in ASCII, at most 24 characters', () => {
    expect(defaultStartName('costa_verde', 30)).toBe('COSTA VERDE L30')
    expect(defaultStartName('lantern_quay', 7)).toBe('LANTERN QUAY L7')
    expect(defaultStartName('costa_verde', 30).length).toBeLessThanOrEqual(24)
  })
  it('sets goal by the par rule, or refuses with a reason', () => {
    let made = 0
    for (let lap = 5; lap <= 40; lap += 5) {
      const r = makeCustomStart(RECIPE, CALLS, lap)
      const par = parFromHandover(buildConfigFromRecipe(RECIPE), CALLS, lap)
      if (par.retired) { expect(r).toEqual({ ok: false, reason: 'par_retired' }); continue }
      if (par.position <= 1) { expect(r).toEqual({ ok: false, reason: 'par_one' }); continue }
      expect(r.ok).toBe(true)
      if (r.ok) {
        made++
        expect(r.payload.expect.par).toBe(par.position)
        const sit = situationAt(RECIPE, CALLS, lap)!
        expect(r.payload.expect.position).toBe(sit.position)
        expect(r.payload.calls.every(c => c.step < lap * 3)).toBe(true)
        expect(decodeStart(encodeStart(r.payload)).ok).toBe(true)
      }
    }
    expect(made, 'premise: some laps make a start').toBeGreaterThan(0)
  }, 120_000)
  it('refuses a lap outside the range', () => {
    expect(makeCustomStart(RECIPE, CALLS, 44)).toEqual({ ok: false, reason: 'lap_range' })
    expect(makeCustomStart(RECIPE, CALLS, 0)).toEqual({ ok: false, reason: 'lap_range' })
  })
  it('re-derives an honest code without drift, and a doctored expect with drift', () => {
    const lap = [10, 15, 20, 25, 30].find(l => makeCustomStart(RECIPE, CALLS, l).ok)!
    const r = makeCustomStart(RECIPE, CALLS, lap)
    if (!r.ok) throw new Error('premise')
    expect(rederive(r.payload)!.drift).toBe(false)
    const doctored = { ...r.payload, expect: { ...r.payload.expect, tyreAge: r.payload.expect.tyreAge + 1 } }
    expect(rederive(doctored)!.drift).toBe(true)
    const ch = startChallenge('abcd1234', r.payload, rederive(r.payload)!)
    expect(ch.kind).toBe('start')
    expect(ch.goal.position).toBe(r.payload.expect.par - 1)
    expect(ch.recipe).toEqual(RECIPE)
  }, 60_000)
})

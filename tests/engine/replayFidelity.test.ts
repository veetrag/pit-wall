import { describe, it, expect } from 'vitest'
import { useRaceStore } from '@state/raceStore'
import { replay } from '@engine/debrief'
import { createRng } from '@engine/rng'

/*
 * THE foundation of the debrief. Drive real races through the real store
 * actions, with calls at random moments, and require that replaying the log
 * reproduces the live race exactly. If this fails, nothing the debrief says
 * can be trusted.
 */
describe('replay reproduces the live race', () => {
  for (const seed of [11, 42, 777, 2024, 31337, 90001]) {
    it(`seed ${seed}`, () => {
      const pick = createRng(seed ^ 0x5eed)            // decides WHEN to call; not the race rng
      const r = () => useRaceStore.getState()
      r().resetRace()
      r().startSeasonRace('d_voss', seed, 'bengaluru', 'rookie',
        { startCompound: 'M', plannedStops: [{ lap: 24, compound: 'H' }] }, null, undefined, false)
      useRaceStore.setState({ phase: 'racing' })
      const compounds = ['S', 'M', 'H', 'I'] as const
      const modes = ['push', 'neutral', 'conserve'] as const
      let n = 0
      while (r().phase === 'racing') {
        const u = pick()
        if (n === 12) r().pitNow('S')                  // every seed has at least one manual pit
        else if (u < 0.01) r().pitNow(compounds[Math.floor(pick() * 4)]!)
        else if (u < 0.03) r().setPaceMode(modes[Math.floor(pick() * 3)]!)
        r().step()
        n++
      }
      const live = r().raceState!
      const replayed = replay(r().config!, seed, r().playerCalls).state
      expect(replayed).toEqual(live)
      const calls = r().playerCalls
      expect(calls.length).toBeGreaterThan(0)
      expect(calls.some(c => c.kind === 'pit')).toBe(true)
    })
  }

  it('a pit call and a pace call at the same step replay exactly', () => {
    const seed = 555
    const r = () => useRaceStore.getState()
    r().resetRace()
    r().startSeasonRace('d_voss', seed, 'bengaluru', 'rookie',
      { startCompound: 'M', plannedStops: [{ lap: 24, compound: 'H' }] }, null, undefined, false)
    useRaceStore.setState({ phase: 'racing' })
    let n = 0
    while (r().phase === 'racing') {
      if (n === 15) { r().setPaceMode('push'); r().pitNow('H') }
      r().step()
      n++
    }
    const calls = r().playerCalls
    const same = calls.filter(c => c.step === calls.find(x => x.kind === 'pit')!.step)
    expect(same.some(c => c.kind === 'pace')).toBe(true)
    expect(same.some(c => c.kind === 'pit')).toBe(true)
    expect(replay(r().config!, seed, calls).state).toEqual(r().raceState!)
  })
})

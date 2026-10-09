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
      while (r().phase === 'racing') {
        const u = pick()
        if (u < 0.01) r().pitNow(compounds[Math.floor(pick() * 4)]!)
        else if (u < 0.03) r().setPaceMode(modes[Math.floor(pick() * 3)]!)
        r().step()
      }
      const live = r().raceState!
      const replayed = replay(r().config!, seed, r().playerCalls).state
      expect(replayed).toEqual(live)
    })
  }
})

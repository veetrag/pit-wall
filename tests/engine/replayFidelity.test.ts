import { describe, it, expect } from 'vitest'
import { useRaceStore } from '@state/raceStore'
import { replay } from '@engine/debrief'
import { createRng } from '@engine/rng'
import { driveToFlag } from '../fixtures/driveStore'

/*
 * THE foundation of the debrief. Drive real races through the real store
 * actions, with calls at random moments, and require that replaying the log
 * reproduces the live race exactly. If this fails, nothing the debrief says
 * can be trusted.
 */
/** Far above any race's step count: reaching it means the race never finished. */
const MAX_STEPS = 5000

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
      driveToFlag(MAX_STEPS, {
        before: n => {
          const u = pick()
          if (n === 12) r().pitNow('S')                  // every seed has at least one manual pit
          else if (u < 0.01) r().pitNow(compounds[Math.floor(pick() * 4)]!)
          else if (u < 0.03) r().setPaceMode(modes[Math.floor(pick() * 3)]!)
        },
      })
      expect(r().phase).toBe('finished')
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
    driveToFlag(MAX_STEPS, { before: n => { if (n === 15) { r().setPaceMode('push'); r().pitNow('H') } } })
    expect(r().phase).toBe('finished')
    const calls = r().playerCalls
    const same = calls.filter(c => c.step === calls.find(x => x.kind === 'pit')!.step)
    expect(same.some(c => c.kind === 'pace')).toBe(true)
    expect(same.some(c => c.kind === 'pit')).toBe(true)
    expect(replay(r().config!, seed, calls).state).toEqual(r().raceState!)
  })

  it('a sprint with a starting PUSH call and a manual stop replays exactly', () => {
    const seed = 9001
    const r = () => useRaceStore.getState()
    r().resetRace()
    r().startSeasonRace('d_voss', seed, 'sol_desert', 'rookie',
      { startCompound: 'S', plannedStops: [] }, null, undefined, false, { sprint: true, initialPace: 'push' })
    expect(r().playerCalls).toEqual([{ step: 0, kind: 'pace', mode: 'push' }])
    expect(r().raceState!.cars.find(c => c.isPlayer)!.paceMode).toBe('push')
    useRaceStore.setState({ phase: 'racing' })
    driveToFlag(MAX_STEPS, { before: n => { if (n === 20) r().pitNow('M') } })
    expect(r().phase).toBe('finished')
    expect(r().raceState!.totalLaps).toBe(13)
    expect(replay(r().config!, seed, r().playerCalls).state).toEqual(r().raceState!)
  })

  it('a neutral starting pace logs no call', () => {
    const r = () => useRaceStore.getState()
    r().resetRace()
    r().startSeasonRace('d_voss', 9001, 'sol_desert', 'rookie',
      { startCompound: 'S', plannedStops: [] }, null, undefined, false, { sprint: true, initialPace: 'neutral' })
    expect(r().playerCalls).toEqual([])
  })
})

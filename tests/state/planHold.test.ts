import { describe, it, expect, beforeEach } from 'vitest'
import { useRaceStore } from '@state/raceStore'
import { replay } from '@engine/debrief'
import { applyCall } from '@engine/playerCalls'
import { createRng } from '@engine/rng'
import { driveToFlag } from '../fixtures/driveStore'

/*
 * 1.6.2: a planned stop that comes due while the pit panel is open is HELD.
 * Opening logs a hold_plan call, closing logs the release; the held stop fires
 * at the next lap boundary after the release (the engine's plan check is
 * `lap >= stop.lap`, so a late stop is still taken). Pitting from the panel
 * consumes the held stop and ends the hold. Replay must match the live race.
 */
const r = () => useRaceStore.getState()
const me = () => r().raceState!.cars.find(c => c.isPlayer)!
const PLAN = [{ lap: 3, compound: 'H' as const }]

function start(seed = 4242) {
  r().resetRace()
  r().startSeasonRace('d_voss', seed, 'bengaluru', 'rookie', { startCompound: 'M', plannedStops: PLAN }, null, undefined, true)
  useRaceStore.setState({ phase: 'racing' })
}
function stepUntilLap(lap: number) { for (let i = 0; i < 300 && r().raceState!.lap < lap; i++) r().step() }

describe('holding the planned stop while the pit panel is open', () => {
  beforeEach(() => start())

  it('opening the panel logs a hold; the due stop does not fire behind the player', () => {
    r().openPitPanel()
    expect(r().playerCalls[r().playerCalls.length - 1]).toMatchObject({ kind: 'hold_plan', hold: true })
    stepUntilLap(5)
    expect(me().pitsDone).toBe(0)
    expect(r().pitPanelOpen).toBe(true)
    expect(r().playerInPit).toBe(false)
  })

  it('closing without pitting releases it: the stop fires at the next lap boundary', () => {
    r().openPitPanel()
    stepUntilLap(5)
    // Mid-lap close: the stop waits for the boundary.
    r().step()
    expect(r().raceState!.sector).not.toBe(0)
    r().closePitPanel()
    expect(r().playerCalls[r().playerCalls.length - 1]).toMatchObject({ kind: 'hold_plan', hold: false })
    while (r().raceState!.sector !== 0) { expect(me().pitsDone).toBe(0); r().step() }
    expect(me().pitsDone).toBe(1)
    expect(me().compound).toBe('H')
    expect(r().raceState!.lap).toBe(6)
  })

  it('pitting from the panel consumes the held stop: one stop, the panel compound', () => {
    r().openPitPanel()
    stepUntilLap(4)
    r().pitNow('S')
    expect(me().pitsDone).toBe(1)
    expect(me().compound).toBe('S')
    expect(r().raceState!.planHold).toBeUndefined()
    stepUntilLap(12)
    expect(me().pitsDone).toBe(1)
  })

  it('a panel opened and closed with no stop due logs a hold/release pair and changes nothing else', () => {
    r().openPitPanel(); r().closePitPanel()
    expect(r().playerCalls.map(c => c.kind)).toEqual(['hold_plan', 'hold_plan'])
    expect(r().raceState!.planHold).toBeUndefined()
    stepUntilLap(4)
    expect(me().pitsDone).toBe(1)
  })

  it('no plan (or plan exhausted): no hold is logged', () => {
    r().resetRace()
    r().startSeasonRace('d_voss', 4242, 'bengaluru', 'rookie', { startCompound: 'M', plannedStops: [] }, null, undefined, true)
    useRaceStore.setState({ phase: 'racing' })
    r().openPitPanel(); r().closePitPanel()
    expect(r().playerCalls).toEqual([])
  })

  it('a pace call while held does not release it', () => {
    r().openPitPanel()
    r().setPaceMode('push')
    stepUntilLap(5)
    expect(me().pitsDone).toBe(0)
  })
})

describe('replay reproduces a held stop', () => {
  for (const seed of [11, 4242, 90001]) {
    it(`seed ${seed}: open across the due lap, close later; replay === live`, () => {
      start(seed)
      driveToFlag(5000, {
        before: n => {
          if (n === 4) r().openPitPanel()
          if (n === 20) r().closePitPanel()
          if (n === 60) { r().openPitPanel(); r().closePitPanel() }
        },
      })
      expect(r().phase).toBe('finished')
      expect(me().pitsDone).toBeGreaterThanOrEqual(1)
      expect(replay(r().config!, seed, r().playerCalls).state).toEqual(r().raceState!)
    })
  }

  it('a stale hold_plan release is a no-op that returns the same state', () => {
    start()
    const s = r().raceState!
    expect(applyCall(r().config!, s, { step: 0, kind: 'hold_plan', hold: false }, createRng(1))).toBe(s)
  })
})

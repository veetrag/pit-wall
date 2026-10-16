import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { PitTimer } from '@ui/PitTimer'
import { makeDeterministicTuning } from '../fixtures/tuning'
import type { RaceState } from '@engine/types'

const r = () => useRaceStore.getState()
/** Incidents off, so no real SC/VSC or retirement can interfere with the staged one. */
function deterministic() {
  useRaceStore.setState({ phase: 'racing', config: { ...r().config!, tuning: makeDeterministicTuning() } })
}

describe('the pit-lane loss is latched at the moment of the stop', () => {
  beforeEach(() => { r().resetRace() })

  it('AN SC SUPERSEDING A VSC MID-STOP does not re-price the stop the player is already making', () => {
    r().startSeasonRace('d_voss', 4242, 'bengaluru', 'rookie',
      { startCompound: 'M', plannedStops: [{ lap: 40, compound: 'H' }] }, null, undefined, false)
    deterministic()
    for (let i = 0; i < 12; i++) r().step()

    const withVsc: RaceState = { ...r().raceState!, safetyCar: { deployedLap: 4, lapsRemaining: 3, cause: 'mechanical', kind: 'vsc' } }
    useRaceStore.setState({ raceState: withVsc })
    r().pitNow('H')
    const vscLoss = 20 * r().config!.tuning.incidents.vsc.laneLossFactor     // bengaluru lane 20s
    expect(r().pitLaneLoss).toBeCloseTo(vscLoss, 9)

    const { container } = render(<PitTimer />)
    const shown = `${(vscLoss + r().config!.tuning.pit.stopMean).toFixed(1)}s`
    expect(screen.getByText(shown)).toBeTruthy()

    // The SC comes out on top of the VSC while the car is still in the lane.
    act(() => {
      useRaceStore.setState({ raceState: { ...r().raceState!, safetyCar: { deployedLap: 4, lapsRemaining: 4, cause: 'crash', kind: 'sc' } } })
    })
    r().step()
    expect(r().pitLaneLoss, 'the charged price does not move').toBeCloseTo(vscLoss, 9)
    expect(container.textContent).toContain(shown)
  })

  it('a plan stop latches the loss it was charged', () => {
    r().startSeasonRace('d_voss', 4242, 'bengaluru', 'rookie',
      { startCompound: 'M', plannedStops: [{ lap: 3, compound: 'H' }] }, null, undefined, false)
    deterministic()
    for (let i = 0; i < 9 && r().raceState!.cars.find(c => c.isPlayer)!.pitsDone === 0; i++) r().step()
    expect(r().raceState!.cars.find(c => c.isPlayer)!.pitsDone).toBe(1)
    expect(r().pitLaneLoss).toBe(20)
  })
})

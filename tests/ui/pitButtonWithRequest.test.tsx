import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useRaceStore, type ActiveRadioRequest } from '@state/raceStore'
import { useSeasonStore } from '@state/seasonStore'
import { useClockStore } from '@state/clockStore'
import { useSettingsStore } from '@state/settingsStore'
import { RaceHUD } from '@ui/RaceHUD'
import { makeDeterministicTuning } from '../fixtures/tuning'

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {},
}))

/*
 * 1.6 device playthrough: two taps on PIT, with a driver box request on screen
 * and the clock at 1x, did not open the pit panel. Pin: with a pending box
 * request in the full HUD, a PIT tap opens the panel -- also when a sim step
 * lands between press and release.
 */
const r = () => useRaceStore.getState()
const BOX: ActiveRadioRequest = { id: 77, kind: 'box', lap: 6, aheadId: null, compound: 'H', line: 'Tyres are gone, can we box?' }

function start() {
  r().resetRace()
  r().startSeasonRace('d_voss', 4242, 'bengaluru', 'rookie', { startCompound: 'M', plannedStops: [{ lap: 40, compound: 'H' }] }, null, undefined, false)
  const tuning = makeDeterministicTuning({ tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 } })
  useRaceStore.setState({ phase: 'racing', config: { ...r().config!, tuning } })
  for (let i = 0; i < 6; i++) r().step()
  useSettingsStore.setState({ coachMarksSeen: true })
  useSeasonStore.setState({ phase: 'racing' })
  useClockStore.setState({ speed: 1 })
  useRaceStore.setState({ radioRequest: BOX })
}
const pit = () => screen.getByRole('button', { name: /^PIT/ })

describe('PIT with a driver box request on screen', () => {
  it('one tap opens the panel', () => {
    start()
    render(<RaceHUD />)
    expect(screen.getByTestId('radio-request')).toBeTruthy()
    fireEvent.click(pit())
    expect(r().pitPanelOpen).toBe(true)
  })

  it('a sim step between press and release does not swallow the tap', () => {
    start()
    render(<RaceHUD />)
    const b = pit()
    fireEvent.pointerDown(b)
    act(() => { r().step() })
    fireEvent.pointerUp(pit())
    fireEvent.click(pit())
    expect(r().pitPanelOpen).toBe(true)
  })
})

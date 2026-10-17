import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {},
}))

import { useRaceStore, type ActiveRadioRequest } from '@state/raceStore'
import { useClockStore } from '@state/clockStore'
import { useCoachStore } from '@state/coachStore'
import { useSettingsStore } from '@state/settingsStore'
import { useSeasonStore } from '@state/seasonStore'
import { RadioRequest } from '@ui/RadioRequest'
import { CoachMark } from '@ui/CoachMark'

const BOX: ActiveRadioRequest = { id: 1, kind: 'box', lap: 6, aheadId: null, compound: 'H', line: 'Tyres are gone, can we box?' }
const r = () => useRaceStore.getState()

function mount() {
  return render(<>
    <RadioRequest />
    <CoachMark id="radio_request" title="YOUR DRIVER IS ASKING" body="Answer YES or NO before the bar runs out. No answer means no." />
  </>)
}
/** The same setup as Plan A's tests/state/radioRequestFlow.test.tsx: a running season race with a box request up. */
function showRequest() {
  r().resetRace()
  r().startSeasonRace('d_voss', 4242, 'bengaluru', 'rookie', { startCompound: 'M', plannedStops: [{ lap: 40, compound: 'H' }] }, null, undefined, false)
  r().confirmRaceStart()
  useClockStore.setState({ speed: 1 })
  act(() => { useRaceStore.setState({ radioRequest: BOX }) })
}

beforeEach(() => {
  vi.useFakeTimers()
  useCoachStore.setState({ active: null, done: {} })
  useSettingsStore.setState({ coachSeen: {} })
  useSeasonStore.setState({ phase: 'racing' })
})
afterEach(() => { vi.useRealTimers() })

describe('the radio_request coach mark (spec 1.6 §9)', () => {
  it('fires when the first request appears, and pauses the race', () => {
    mount(); showRequest()
    expect(useCoachStore.getState().active).toBe('radio_request')
    expect(useClockStore.getState().speed).toBe(0)
  })

  it('THE REQUEST DOES NOT EXPIRE UNDER ITS OWN TIP (Review Focus 4)', () => {
    mount(); showRequest()
    const expiry = r().config!.tuning.radioRequests.expirySec * 1000
    act(() => { vi.advanceTimersByTime(expiry + 2000) })
    expect(r().radioRequest, 'still waiting for an answer under the tip').not.toBeNull()
    act(() => { fireEvent.click(screen.getByRole('button', { name: /got it/i })) })
    expect(useClockStore.getState().speed, 'GOT IT restores the clock').toBe(1)
    act(() => { vi.advanceTimersByTime(expiry + 1000) })
    expect(r().radioRequest, 'and then it expires as NO').toBeNull()
  })

  it('a player who has seen it is not shown it again', () => {
    useSettingsStore.setState({ coachSeen: { radio_request: true } })
    mount(); showRequest()
    expect(useCoachStore.getState().active).toBeNull()
    expect(useClockStore.getState().speed).toBe(1)
  })
})

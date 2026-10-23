import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useRaceStore, type ActiveRadioRequest } from '@state/raceStore'
import { makeRequestTracker } from '@state/radioRequests'
import { RadioRequest } from '@ui/RadioRequest'
import radioPools from '@data/radio.json'
import type { WeatherState } from '@engine/types'

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {},
}))

const r = () => useRaceStore.getState()
const me = () => r().raceState!.cars.find(c => c.isPlayer)!
const RAIN: ActiveRadioRequest = { id: 91, kind: 'rain', lap: 6, aheadId: null, compound: 'I', line: "Track's wet. Box for inters?" }

function start() {
  r().resetRace()
  r().startSeasonRace('d_voss', 4242, 'bengaluru', 'rookie', { startCompound: 'M', plannedStops: [{ lap: 40, compound: 'H' }] }, null, undefined, false)
  useRaceStore.setState({ phase: 'racing' })
  for (let i = 0; i < 6; i++) r().step()
}

describe('rain request flow (1.6.2)', () => {
  it('YES is the logged PIT call on the offered compound', () => {
    start()
    useRaceStore.setState({ radioRequest: RAIN })
    const pits = me().pitsDone
    r().answerRadioRequest(true)
    expect(me().pitsDone).toBe(pits + 1)
    expect(me().compound).toBe('I')
    expect(r().playerCalls[r().playerCalls.length - 1]).toMatchObject({ kind: 'pit', compound: 'I' })
  })

  it('the PIT button withdraws a pending rain request', () => {
    start()
    useRaceStore.setState({ radioRequest: RAIN })
    r().openPitPanel()
    expect(r().radioRequest).toBeNull()
  })

  it('step() raises it on a slick-shod player once the wet is confirmed, with a line from the pool', () => {
    start()
    const s = r().raceState!
    const wet: WeatherState[] = s.weatherTimeline.map(() => 'WET')
    useRaceStore.setState({ radioRequest: null, requestTracker: makeRequestTracker(), raceState: { ...s, weatherTimeline: wet, weatherState: 'WET' } })
    for (let i = 0; i < 6 && r().radioRequest === null; i++) r().step()
    const req = r().radioRequest
    expect(req?.kind).toBe('rain')
    expect(req?.compound).toBe('W')
    expect(radioPools.request_rain.map(l => l.replace('{tyre}', 'wets'))).toContain(req!.line)
  })

  it('the card names the tyre on YES', () => {
    start()
    useRaceStore.setState({ radioRequest: RAIN })
    render(<RadioRequest />)
    fireEvent.click(screen.getByRole('button', { name: /yes, box for inter/i }))
    expect(me().compound).toBe('I')
  })
})

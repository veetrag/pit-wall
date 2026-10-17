import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

import { RadioRequest } from '@ui/RadioRequest'
import { HudAlert } from '@ui/HudAlert'
import { PitPanel } from '@ui/PitPanel'
import { TimingTower, compactWindowSize } from '@ui/TimingTower'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'

const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')

function startTenLapRace() {
  useRaceStore.getState().startSeasonRace('d_voss', 4243, 'bengaluru', 'rookie',
    { startCompound: 'M', plannedStops: [{ lap: 30, compound: 'H' }] }, null, undefined, true)
  useRaceStore.getState().confirmRaceStart()
}

beforeEach(() => {
  useRaceStore.getState().resetRace()
  useSettingsStore.setState({ textSize: 'standard', driverNameFormat: 'code' })
})

describe('Large text (spec 1.6 §11)', () => {
  it('zooms .text-zoom containers by 1.15 only under data-text-size="large"', () => {
    expect(css).toMatch(/:root\[data-text-size="large"\]\s+\.text-zoom\s*\{\s*zoom:\s*1\.15;?\s*\}/)
  })

  it('the compact window is six rows, five in Large', () => {
    expect(compactWindowSize('standard')).toBe(6)
    expect(compactWindowSize('large')).toBe(5)
  })

  it('the tower root carries text-zoom and shows five rows in Large', () => {
    startTenLapRace()
    useSettingsStore.setState({ textSize: 'large' })
    const { container } = render(<TimingTower />)
    expect(container.firstElementChild?.classList.contains('text-zoom')).toBe(true)
    expect(container.querySelectorAll('[data-testid="tower-row"]').length).toBe(5)
  })

  it('standard still shows six', () => {
    startTenLapRace()
    const { container } = render(<TimingTower />)
    expect(container.querySelectorAll('[data-testid="tower-row"]').length).toBe(6)
  })

  it('RadioRequest card is inside a .text-zoom element', () => {
    startTenLapRace()
    useRaceStore.setState({ phase: 'racing' })
    useRaceStore.setState({ radioRequest: { id: 1, kind: 'push', lap: 6, aheadId: null, compound: null, line: 'Let me push.' } })
    const { getByTestId } = render(<RadioRequest />)
    expect(getByTestId('radio-request').closest('.text-zoom')).not.toBeNull()
  })

  it('HudAlert banner is inside a .text-zoom element', () => {
    useRaceStore.setState({ hudAlerts: [{ id: 'a1', severity: 'info', category: 'test', message: 'Hello alert', icon: 'i' }] })
    const { getByText } = render(<HudAlert />)
    expect(getByText('Hello alert').closest('.text-zoom')).not.toBeNull()
  })

  it('the pit panel drawer is inside a .text-zoom element', () => {
    startTenLapRace()
    useRaceStore.setState({ pitPanelOpen: true })
    const { getByText } = render(<PitPanel />)
    expect(getByText(/PIT LOSS/).closest('.text-zoom')).not.toBeNull()
  })
})

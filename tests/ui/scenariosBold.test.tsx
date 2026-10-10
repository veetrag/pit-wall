import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}),
  },
}))

import { ScenarioSelect } from '@ui/ScenarioSelect'
import { ScenarioResult } from '@ui/ScenarioResult'
import { useSeasonStore } from '@state/seasonStore'
import { useScenarioStore } from '@state/scenarioStore'
import { loadGameData } from '@data/validators'

const SCENARIOS = loadGameData().scenarios

beforeEach(() => {
  useSeasonStore.setState({ phase: 'scenario_select' })
  useScenarioStore.setState({ active: null, outcome: null })
})

describe('Scenarios in Race Day Bold', () => {
  it('scenario cards show the circuit outline and a volt goal when expanded', () => {
    render(<ScenarioSelect />)
    expect(screen.getAllByRole('img', { name: / layout$/ }).length).toBeGreaterThan(0)
    const first = screen.getByText(SCENARIOS[0]!.name).closest('[role="button"]') as HTMLElement
    fireEvent.click(first)
    expect(screen.getByText(/FINISH P\d+ OR BETTER/).style.color).toContain('--volt')
  })

  it('shows a caution safety-car pill for a safety-car scenario', () => {
    const sc = SCENARIOS.find(s => s.expect.safetyCarOut)
    expect(sc).toBeTruthy()
    if (!sc) return
    render(<ScenarioSelect />)
    fireEvent.click(screen.getByText(sc.name).closest('[role="button"]') as HTMLElement)
    expect(screen.getByText(/SAFETY CAR/)).toBeTruthy()
  })

  it('result verdict sits in the status region on a gain band when met', () => {
    useScenarioStore.setState({ active: SCENARIOS[0]!, outcome: { met: true, position: 1, retired: false } })
    render(<ScenarioResult />)
    expect(screen.getByRole('status').textContent).toMatch(/GOAL MET/)
  })

  it('start lights carry no raw hex', () => {
    const src = readFileSync(join(__dirname, '../../src/ui/StartLights.tsx'), 'utf8')
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}\b/)
  })
})

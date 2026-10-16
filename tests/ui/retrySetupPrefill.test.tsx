import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { RaceSetup, computeStartWeather } from '@ui/RaceSetup'
import { useSettingsStore } from '@state/settingsStore'
import { useSeasonStore, seedFor, type PlayerStrategyChoice } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { CIRCUIT_ORDER } from '@state/raceStore'
import { loadGameData } from '@data/validators'
import type { WeatherState } from '@engine/index'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

/*
 * RETRY ROUND reopens race setup with the previous plan pre-filled (see
 * tests/state/retryReopensSetup.test.ts for the store side). This is the
 * screen side: the plan comes back, and the one part of it that depends on
 * the weather -- the start tyre -- is only kept when it still suits the
 * re-rolled opening conditions.
 */

const CIRCUITS = loadGameData().circuits

/** A (round, attempt) whose opening conditions are `want`, at the calendar circuit. */
function findAttempt(want: (w: WeatherState) => boolean): { raceIndex: number; nonce: number; circuitId: string } {
  for (let raceIndex = 1; raceIndex < CIRCUIT_ORDER.length; raceIndex++) {
    const circuitId = CIRCUIT_ORDER[raceIndex]!
    for (let nonce = 0; nonce < 300; nonce++) {
      const w = computeStartWeather(circuitId, CIRCUITS[circuitId]!.laps, seedFor(1, raceIndex, nonce), false)[0]
      if (w && want(w)) return { raceIndex, nonce, circuitId }
    }
  }
  throw new Error('no attempt found')
}

function retriedInto(attempt: { raceIndex: number; nonce: number; circuitId: string }, plan: PlayerStrategyChoice) {
  useSeasonStore.setState({
    phase: 'race_setup', raceIndex: attempt.raceIndex, attemptNonce: attempt.nonce,
    selectedCircuitId: attempt.circuitId, playerStrategy: plan, qualifyingResult: null,
  })
}

function checked(groupName: string): string | null {
  const group = screen.getByRole('radiogroup', { name: groupName })
  return within(group).getAllByRole('radio').find(r => r.getAttribute('aria-checked') === 'true')?.getAttribute('aria-label') ?? null
}

beforeEach(() => {
  useSettingsStore.setState({ reducedMotion: true })
  Element.prototype.scrollIntoView = () => {}
  useCareerStore.getState().beginCareer()
})

describe('race setup after RETRY ROUND', () => {
  it('PRE-FILLS THE PREVIOUS PLAN: start tyre, stops, laps, wing', () => {
    const dry = findAttempt(w => w === 'DRY')
    retriedInto(dry, {
      startCompound: 'H',
      plannedStops: [{ lap: 18, compound: 'M' }, { lap: 36, compound: 'S' }],
      wing: 4,
    })
    render(<RaceSetup />)
    expect(checked('Start tyre')).toBe('Hard')
    expect(screen.getByRole('radio', { name: '2 STOP' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/PLAN:/).textContent).toBe('PLAN: H → M on lap 18 → S on lap 36 · W4')
  })

  it('opens on the circuit that was raced, not the calendar slot', () => {
    // The player may have picked another circuit from the chip strip; a retry
    // of that race must not quietly move it back.
    const dry = findAttempt(w => w === 'DRY')
    const other = CIRCUIT_ORDER.find(c => c !== dry.circuitId)!
    retriedInto({ ...dry, circuitId: other }, { startCompound: 'M', plannedStops: [{ lap: 20, compound: 'H' }], wing: 3 })
    render(<RaceSetup />)
    expect(screen.getByRole('heading', { level: 2, name: CIRCUITS[other]!.name })).toBeTruthy()
  })

  it('A WET-START PLAN RETRIED INTO A DRY OPENING STARTS ON THE DRY RECOMMENDATION', () => {
    // The phone-pass bug: full wets carried into a dry race, P20 by lap 1.
    const dry = findAttempt(w => w === 'DRY')
    retriedInto(dry, { startCompound: 'W', plannedStops: [{ lap: 20, compound: 'M' }], wing: 2 })
    render(<RaceSetup />)
    expect(checked('Start tyre')).toBe('Medium')
    // The rest of the plan still comes back.
    expect(screen.getByText(/PLAN:/).textContent).toBe('PLAN: M → M on lap 20 · W2')
  })

  it('a dry-start plan retried into a wet opening starts on the wet recommendation', () => {
    const wet = findAttempt(w => w === 'WET')
    retriedInto(wet, { startCompound: 'S', plannedStops: [{ lap: 20, compound: 'M' }], wing: 2 })
    render(<RaceSetup />)
    expect(checked('Start tyre')).toBe('Wet')
  })

  it('keeps a wet-tyre choice that still suits a wet-type opening', () => {
    // Intermediates chosen for a damp start and retried into a wet one are a
    // legitimate call, not a mismatch: the player's choice stands.
    const wet = findAttempt(w => w === 'WET')
    retriedInto(wet, { startCompound: 'I', plannedStops: [{ lap: 20, compound: 'M' }], wing: 2 })
    render(<RaceSetup />)
    expect(checked('Start tyre')).toBe('Intermediate')
  })

  it('with no previous plan, setup is exactly as before', () => {
    const dry = findAttempt(w => w === 'DRY')
    retriedInto(dry, null as unknown as PlayerStrategyChoice)
    useSeasonStore.setState({ playerStrategy: null, selectedCircuitId: null })
    render(<RaceSetup />)
    expect(checked('Start tyre')).toBe('Medium')
    expect(screen.getByRole('radio', { name: '1 STOP' }).getAttribute('aria-checked')).toBe('true')
  })
})

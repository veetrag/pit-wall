import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCoachingActive } from '@hooks/useCoachingActive'
import { useSettingsStore } from '@state/settingsStore'
import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { useCoachStore } from '@state/coachStore'
import { CoachMark } from '@ui/CoachMark'

describe('coaching runs on the FIRST CAREER RACE only', () => {
  beforeEach(() => {
    useSettingsStore.setState({ coachMarksSeen: false })
    useSeasonStore.setState({ phase: 'racing' })
    useCareerStore.getState().beginCareer()
    useCoachStore.getState().reset()
  })

  it('IS ACTIVE ON A PLAYER’S VERY FIRST RACE', () => {
    expect(useCareerStore.getState().racesStarted).toBe(0)
    expect(renderHook(() => useCoachingActive()).result.current).toBe(true)
  })

  it('IS OFF ONCE ANY RACE HAS BEEN COMPLETED', () => {
    /*
     * The gate that was missing. coachMarksSeen only flips once every mark has
     * been DISMISSED, so a player who ignored the tips -- or who met a
     * condition that never arose, like the cliff in a wet race -- carried the
     * tutorial into race two, race three, and the whole season.
     */
    useCareerStore.getState().recordRace({
      position: 5, retired: false, pole: false,
      round: 0, grid: 5, stops: 1, overtakes: 0, wet: false,
    })
    expect(useCareerStore.getState().racesStarted).toBe(1)
    expect(renderHook(() => useCoachingActive()).result.current).toBe(false)
  })

  it('is off once the player has dismissed everything, even on race one', () => {
    useSettingsStore.setState({ coachMarksSeen: true })
    expect(renderHook(() => useCoachingActive()).result.current).toBe(false)
  })

  it('is off outside a season race', () => {
    // Scenarios drop you into lap 40 of a race already half-run, which is the
    // worst possible moment to meet the tyre cliff for the first time.
    useSeasonStore.setState({ phase: 'result' })
    expect(renderHook(() => useCoachingActive()).result.current).toBe(false)
  })
})

describe('the tutorial marks', () => {
  beforeEach(() => { useCoachStore.getState().reset() })

  it('SHOW ONE AT A TIME', () => {
    const s = () => useCoachStore.getState()
    s().request('timing_tower')
    s().request('pace_modes')
    expect(s().active, 'the second must not interrupt the first').toBe('timing_tower')
  })

  it('a dismissed mark lets the next one through, and never returns', () => {
    const s = () => useCoachStore.getState()
    s().request('timing_tower')
    s().dismiss('timing_tower')
    s().request('pace_modes')
    expect(s().active).toBe('pace_modes')
    s().dismiss('pace_modes')
    s().request('timing_tower')
    expect(s().active, 'a finished mark must not re-raise').toBeNull()
  })

  it('EVERY MARK ID HAS COPY', () => {
    /*
     * CoachMark takes its title and body as props, so an id added to the union
     * with no <CoachMark> rendered for it is a mark that can be requested,
     * will block every other mark by occupying `active`, and will never appear
     * or be dismissable. That deadlocks the tutorial.
     */
    const ids = ['tyre_cliff', 'projection', 'timing_tower', 'pace_modes'] as const
    const hud = readFileSync(resolve(process.cwd(), 'src/ui/RaceHUD.tsx'), 'utf8')
    for (const id of ids) {
      expect(hud, `no <CoachMark id="${id}"> is rendered`).toContain(`id="${id}"`)
    }
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

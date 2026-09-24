import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { RaceHUD } from '@ui/RaceHUD'
import { useCoachStore } from '@state/coachStore'
import { useRaceStore } from '@state/raceStore'
import { useSeasonStore } from '@state/seasonStore'
import { useSettingsStore } from '@state/settingsStore'
import { useCareerStore } from '@state/careerStore'
import { useClockStore } from '@state/clockStore'
import { render } from '@testing-library/react'

/*
 * WHY THIS EXISTS.
 *
 * On a real phone the READ THE TOWER mark appeared with the race already on
 * LAP 18, tyres past the cliff and the race half-decided -- a tip about how to
 * read the timing tower, arriving long after it could help.
 *
 * It was not firing late. It was firing at mount, during the START SEQUENCE,
 * and then being run over: CoachMark pauses by calling setSpeed(0), and
 * StartLights calls setSpeed(simSpeed) when the lights go out, which happens
 * AFTER. The card sat on screen while the race ran away underneath it at 4x.
 *
 * So the fix is not "fire later" by lap number -- it is "do not raise a mark
 * until the race is actually running", because only then does the pause hold.
 */
function setUpFirstRace(racePhase: 'starting' | 'racing') {
  useSettingsStore.setState({ coachMarksSeen: false, simSpeed: 4 })
  useSeasonStore.setState({ phase: 'racing' })
  useCareerStore.getState().beginCareer()
  useCoachStore.getState().reset()
  useClockStore.setState({ speed: 4 })
  useRaceStore.setState({ phase: racePhase })
}

describe('tutorial marks wait for the race to actually be running', () => {
  beforeEach(() => { useRaceStore.getState().resetRace() })

  it('RAISES NOTHING DURING THE START SEQUENCE', () => {
    /*
     * The regression. During 'starting', StartLights is about to call
     * setSpeed(simSpeed), so any pause a mark sets here is discarded and the
     * player watches the race run under the card.
     */
    useRaceStore.getState().initForStartSequence()
    setUpFirstRace('starting')
    render(<RaceHUD />)
    expect(useCoachStore.getState().active, 'no mark may be up before lights out').toBeNull()
  })

  it('RAISES THE TOWER MARK ONCE THE RACE IS RUNNING', () => {
    useRaceStore.getState().initForStartSequence()
    useRaceStore.getState().confirmRaceStart()
    setUpFirstRace('racing')
    render(<RaceHUD />)
    expect(useCoachStore.getState().active).toBe('timing_tower')
  })

  it('AND THE PAUSE THEN HOLDS', () => {
    // The whole point: once raised while racing, nothing comes along
    // afterwards to overwrite the clock.
    useRaceStore.getState().initForStartSequence()
    useRaceStore.getState().confirmRaceStart()
    setUpFirstRace('racing')
    render(<RaceHUD />)
    expect(useClockStore.getState().speed, 'the mark must actually stop the race').toBe(0)
  })

  it('raises nothing at all once the player has finished a race', () => {
    useRaceStore.getState().initForStartSequence()
    useRaceStore.getState().confirmRaceStart()
    setUpFirstRace('racing')
    useCareerStore.getState().recordRace({
      position: 5, retired: false, pole: false,
      round: 0, grid: 5, stops: 1, overtakes: 0, wet: false,
    })
    render(<RaceHUD />)
    expect(useCoachStore.getState().active).toBeNull()
  })
})

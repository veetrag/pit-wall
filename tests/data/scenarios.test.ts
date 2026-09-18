import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'
import { buildScenarioConfig } from '@state/buildRaceConfig'
import { startScenario, describeSituation, goalMet } from '@engine/scenario'

const { scenarios, circuits } = loadGameData()

describe('every shipped scenario', () => {
  it('ships at least one', () => { expect(scenarios.length).toBeGreaterThan(0) })

  it('has a unique id', () => {
    expect(new Set(scenarios.map(s => s.id)).size).toBe(scenarios.length)
  })

  for (const s of scenarios) {
    it(`${s.id}: STILL PRODUCES THE SITUATION ITS BRIEF PROMISES`, () => {
      /*
       * THE LOAD-BEARING DATA TEST.
       *
       * The blurb says "buried in the midfield" or "podium in hand"; the goal is
       * calibrated against that. Both are only true while the engine keeps
       * producing the situation this scenario was authored from. A tuning edit,
       * a balance change to drivers.json, or a config regression would silently
       * turn the brief into a lie -- exactly what happened once already, when
       * the search tool and the runtime built different configs and "P8, buried
       * in the pack" was really P1 leading the race.
       *
       * If this fails, the fix is to RE-AUTHOR the scenario from a fresh search,
       * not to loosen the assertion.
       */
      const config = buildScenarioConfig(s)
      const { state } = startScenario(config, s.startLap)
      const sit = describeSituation(state, s.playerDriverId)
      expect(sit, 'the player must be in this race').not.toBeNull()
      expect({
        position: sit!.position, lapsRemaining: sit!.lapsRemaining,
        compound: sit!.compound, tyreAge: sit!.tyreAge,
      }).toEqual(s.expect)
    }, 60_000)

    it(`${s.id}: starts inside the race and is not already won`, () => {
      const laps = circuits[s.circuitId]!.laps
      expect(s.startLap, 'a takeover must leave laps to race').toBeLessThan(laps)
      expect(s.expect.lapsRemaining).toBeGreaterThan(0)
      // A goal already met at the handover is not a challenge, it is a formality.
      const { state } = startScenario(buildScenarioConfig(s), s.startLap)
      expect(goalMet(state, s.playerDriverId, s.goal),
        'the goal must not already be satisfied at handover').toBe(false)
    }, 60_000)
  }
})

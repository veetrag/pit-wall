import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'
import { buildScenarioConfig } from '@state/buildRaceConfig'
import { startScenario, describeSituation, goalMet } from '@engine/scenario'
import { stepSector } from '@engine/race'
import { neutralisationKind } from '@engine/incidents'

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
      const { par: _par, vscOut, dampAhead, redFlag, ...situation } = s.expect   // par is asserted separately, below
      expect({
        position: sit!.position, lapsRemaining: sit!.lapsRemaining,
        compound: sit!.compound, tyreAge: sit!.tyreAge,
        safetyCarOut: sit!.safetyCarOut,
      }).toEqual(situation)
      if (vscOut) expect(neutralisationKind(state.safetyCar), 'a VSC is out at the handover').toBe('vsc')
      if (redFlag) expect(neutralisationKind(state.safetyCar), 'a red flag stands at the handover').toBe('red')
      if (dampAhead) {
        expect(state.weatherTimeline[state.lap], 'dry at the handover').toBe('DRY')
        expect(state.weatherTimeline.slice(state.lap + 1, state.lap + 1 + dampAhead).some(w => w !== 'DRY'),
          `rain within ${dampAhead} laps`).toBe(true)
      }
    }, 60_000)

    it(`${s.id}: starts inside the race with laps left to race`, () => {
      const laps = buildScenarioConfig(s).lapsOverride ?? circuits[s.circuitId]!.laps
      expect(s.startLap, 'a takeover must leave laps to race').toBeLessThan(laps)
      expect(s.expect.lapsRemaining).toBeGreaterThan(0)
      /*
       * There is deliberately NO "the goal must not already be met at handover"
       * assertion here, though an earlier cut of this file had one.
       *
       * It fails every DEFENSIVE scenario, where holding what you have IS the
       * challenge: cliff_edge hands over P2 with a goal of P3, because par is
       * P4 -- do nothing and you lose two places. Under the old guard that
       * scenario was rejected as "already won", which would have left the set
       * with three attacking scenarios and no way to express the most
       * characteristic problem in the sport.
       *
       * The invariant that actually matters is the par test below: not "are you
       * already there" but "must you DO something to still be there at the
       * flag". That one subsumes this for attacking scenarios and permits
       * defensive ones.
       */
    })

    it(`${s.id}: CANNOT BE WON BY LETTING THE AI DRIVE IT`, () => {
      /*
       * THE SCENARIO-DESIGN INVARIANT.
       *
       * A scenario is a strategy problem, so the goal must require strategy.
       * Par is where the car finishes when the AI drives it to the flag -- if
       * par already meets the goal, the player is being congratulated for
       * watching.
       *
       * Par is the AI-driven trajectory specifically, NOT a human sitting on
       * their hands: race.ts skips strategy for the player's car, so a human
       * who truly does nothing leaves it unmanaged and ends up somewhere worse.
       * Par is the stronger bar of the two, which is why it is the one pinned.
       *
       * This is not hypothetical. An earlier cut of this file calibrated goals
       * against the HANDOVER position: one scenario handed the player P10,
       * "buried in the midfield", and had a par finish of P1, because at lap 41
       * on a fresh tyre everyone ahead still had to stop. Its goal of P7 was met
       * by never touching the controls. A second had a par of RETIRED, making
       * the outcome a mechanical-failure roll the player cannot influence.
       *
       * If this fails, RE-AUTHOR the scenario from a fresh search
       * (scripts/find-scenarios.ts prints par and filters on it). Do not move
       * the goal to fit.
       */
      const auto = buildScenarioConfig({ ...s, playerDriverId: '__none__' })
      const { state, rng } = startScenario(auto, s.startLap)
      let st = state
      for (let i = 0; i < ((auto.lapsOverride ?? circuits[s.circuitId]!.laps) - s.startLap) * 3; i++) {
        st = stepSector(auto, st, rng)
      }
      const car = st.cars.find(c => c.driverId === s.playerDriverId)!
      expect(car.retired, 'a par retirement makes the scenario a coin flip').toBe(false)
      expect(car.position, 'par must still be what it was authored as').toBe(s.expect.par)
      expect(goalMet(st, s.playerDriverId, s.goal),
        'doing nothing must NOT meet the goal').toBe(false)
    }, 120_000)
  }
})

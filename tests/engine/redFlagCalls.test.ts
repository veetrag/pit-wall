import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import { applyCall, applyPlayerPit, type PlayerCall } from '@engine/playerCalls'
import { redFlagPending, defaultRestartCompound } from '@engine/redFlag'
import { replay, judgeCalls } from '@engine/debrief'
import { makeConfig, type TuningOverrides } from '../fixtures/raceHarness'
import type { RaceConfig, RaceState } from '@engine/types'

const MAX_STEPS = 200
const CRASH = {
  incidents: {
    driverErrorPerLap: 3, consistencyReliefMax: 1, terminalFraction: 1,
    safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 },
    vsc: { crashDeployChance: 0, mechanicalDeployChance: 0 },
    redFlag: { crashChance: 1, maxPerRace: 1, minLapsLeft: 5, planWindowLaps: 15 },
  },
  mechanicalFailure: { baseChancePerLap: 0 },
  tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
}
function cfg(): RaceConfig {
  const base = makeConfig(CRASH as TuningOverrides, 9)
  const player = base.drivers[0]!
  return {
    ...base,
    lapsOverride: 20,
    allDry: true,     // a dry restart, so the plan rule is the one under test (Task 2's flag)
    drivers: base.drivers.map((d, i) => ({ ...d, facets: { ...d.facets, consistency: i === 5 ? 0 : 100 } })),
    playerDriverId: player.id,
    playerStrategyOverride: { teamId: player.teamId, startCompound: 'M', plannedStops: [{ lap: 8, compound: 'H' }] },
  }
}
/** Steps until the restart is next; bounded. */
function toPending(config: RaceConfig): { state: RaceState; step: number } {
  let state = initRace(config)
  const rng = createRng(config.seed)
  let step = 0
  while (!redFlagPending(state) && step < MAX_STEPS) { state = stepSector(config, state, rng); step++ }
  expect(redFlagPending(state), 'premise: the crash brought a red flag').toBe(true)
  return { state, step }
}
const me = (s: RaceState) => s.cars.find(c => c.isPlayer)!

describe('the restart_tyre call', () => {
  it('REPLAY REPRODUCES A RED-FLAG RACE: the chosen tyre is fitted at the restart', () => {
    const config = cfg()
    const { step } = toPending(config)
    const calls: PlayerCall[] = [{ step, kind: 'restart_tyre', compound: 'S' }]
    const a = replay(config, config.seed, calls).state
    const b = replay(config, config.seed, calls).state
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.incidents.some(i => i.kind === 'red_flag_restart')).toBe(true)
    expect(me(a).compoundsUsed).toContain('S')
    expect(me(a).pitsDone, 'the lap-8 plan stop was within 15 laps: consumed').toBe(1)
    expect('redFlagTyre' in a).toBe(false)
  })

  it('stepping by hand with the call applied at the pending step equals the replay', () => {
    const config = cfg()
    const { step } = toPending(config)
    let s = initRace(config)
    const rng = createRng(config.seed)
    for (let n = 0; n < MAX_STEPS && !(s.lap >= s.totalLaps && s.sector === 0); n++) {
      if (n === step) s = applyCall(config, s, { step, kind: 'restart_tyre', compound: 'S' }, rng)
      s = stepSector(config, s, rng)
    }
    expect(s.lap).toBe(s.totalLaps)
    expect(JSON.stringify(s)).toBe(JSON.stringify(replay(config, config.seed, [{ step, kind: 'restart_tyre', compound: 'S' }]).state))
  })

  it('with no call the player gets the AI rule: defaultRestartCompound', () => {
    const config = cfg()
    const { state } = toPending(config)
    const expected = defaultRestartCompound(config, state)
    const restarted = stepSector(config, state, createRng(1))
    expect(me(restarted).compound).toBe(expected)
    expect(me(restarted).tyreAge).toBe(0)
  })

  it('A STALE RESTART CALL IS A NO-OP: same object, no draw, and the race is unchanged', () => {
    const config = cfg()
    const s = initRace(config)
    let draws = 0
    const counting = () => { draws++; return 0.5 }
    expect(applyCall(config, s, { step: 0, kind: 'restart_tyre', compound: 'S' }, counting)).toBe(s)
    expect(draws).toBe(0)
    const stale = replay(config, config.seed, [{ step: 0, kind: 'restart_tyre', compound: 'S' }]).state
    expect(JSON.stringify(stale)).toBe(JSON.stringify(replay(config, config.seed, []).state))
  })

  it('the debrief replays a restart call but does not judge it (ruling R12)', () => {
    const config = cfg()
    const { step } = toPending(config)
    const result = judgeCalls(config, config.seed, [{ step, kind: 'restart_tyre', compound: 'S' }])
    expect(result.verdicts.every(v => (v.call.kind as string) !== 'restart_tyre')).toBe(true)
    // Not vacuous (preflight S4): the only logged call is the restart, so no
    // verdict may come from the logged-call path at all.
    expect(result.verdicts.filter(v => v.call.kind === 'pit' || v.call.kind === 'pace')).toEqual([])
  }, 180_000)

  it('the PIT button is a no-op under a red flag: no stop, no draw', () => {
    const config = cfg()
    const { state } = toPending(config)
    let draws = 0
    const counting = () => { draws++; return 0.5 }
    expect(applyPlayerPit(config, state, 'S', counting)).toBeNull()
    expect(applyCall(config, state, { step: 0, kind: 'pit', compound: 'S' }, counting)).toBe(state)
    expect(draws).toBe(0)
  })
})
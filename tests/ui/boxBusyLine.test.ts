import { describe, it, expect } from 'vitest'
import { boxBusyLine } from '@ui/PitPanel'
import { initRace } from '@engine/race'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'

describe('PitPanel BOX BUSY line (spec §7.2)', () => {
  const c = { ...makeConfig({}, 6, 'veloce'), playerDriverId: 'd_voss', tuning: makeDeterministicTuning({ doubleStack: { enabled: true } }) }
  it('names the team-mate and the queue when the box is busy', () => {
    const s = initRace(c)
    const me = s.cars.find(x => x.isPlayer)!
    expect(boxBusyLine(c, s)).toBeNull()
    const line = boxBusyLine(c, { ...s, boxFree: { [me.teamId]: me.raceTime + 30 } })
    expect(line).toMatch(/^BOX BUSY — \w+ in the box · \+\d+\.\ds queue$/)
  })
  it('null with no box state (double-stacking off)', () => {
    expect(boxBusyLine(c, initRace(c))).toBeNull()
  })
})

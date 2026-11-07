import { describe, it, expect, vi, afterEach } from 'vitest'
import { V2_RADIO, makeRadioState, processRadioTick } from '@state/radioMapper'
import { initRace } from '@engine/race'
import { makeConfig } from '../fixtures/raceHarness'
import type { IncidentEvent, RaceState } from '@engine/types'

afterEach(() => { vi.restoreAllMocks() })

// tryPush rate-limits on Date.now(); a minute between ticks keeps the cooldown out of the test.
function clock() { let t = 1e12; vi.spyOn(Date, 'now').mockImplementation(() => (t += 60_000)) }

describe('V2_RADIO and the player-incident cursor (spec 2026-10-24)', () => {
  it('has the double_stack row and no graining row', () => {
    expect(V2_RADIO.double_stack).toBe('double_stack')
    expect('graining' in V2_RADIO).toBe(false)
  })

  it('the cursor never double-fires a radio line', () => {
    clock()
    const config = { ...makeConfig({}, 2), playerDriverId: 'd_voss' }
    const s0 = initRace(config)
    const lines: string[] = []
    const push = (m: string) => { lines.push(m) }
    let r = processRadioTick(s0, config, makeRadioState(), push)
    const ev: IncidentEvent = { lap: 3, sector: 2, kind: 'double_stack', driverId: 'd_voss', timeLoss: 1.4 }
    const s1: RaceState = { ...s0, incidents: [ev] }
    r = processRadioTick(s1, config, r, push)
    r = processRadioTick(s1, config, r, push)
    r = processRadioTick(s1, config, r, push)
    expect(lines.filter(l => /busy|double stack/i.test(l))).toHaveLength(1)
    // A second incident fires once more, never the first again.
    const s2: RaceState = { ...s1, incidents: [ev, { ...ev, lap: 20 }] }
    r = processRadioTick(s2, config, r, push)
    processRadioTick(s2, config, r, push)
    expect(lines.filter(l => /busy|double stack/i.test(l))).toHaveLength(2)
    expect(lines.some(l => l.includes('{mate}'))).toBe(false)
  })
})

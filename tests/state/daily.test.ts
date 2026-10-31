import { describe, it, expect } from 'vitest'
import { dateKey, dailyHash, generateDaily } from '@state/daily'
import { buildScenarioConfig } from '@state/buildRaceConfig'
import { startScenario, describeSituation } from '@engine/scenario'

describe('dateKey', () => {
  it('is the LOCAL calendar date, zero-padded', () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(dateKey(new Date(2026, 9, 28, 0, 0))).toBe('2026-10-28')
  })
  it('does not move across a DST change at local midnight', () => {
    expect(dateKey(new Date(2026, 2, 29, 0, 30))).toBe('2026-03-29')
  })
})

describe('generateDaily', () => {
  it('is deterministic: the same date gives the same challenge', () => {
    expect(generateDaily('2026-10-28')).toEqual(generateDaily('2026-10-28'))
  }, 60_000)
  it('different dates give different challenges', () => {
    expect(generateDaily('2026-10-28').signature).not.toBe(generateDaily('2026-10-29').signature)
  }, 60_000)
  it('hashes with the rules version', () => {
    expect(dailyHash('2026-10-28')).not.toBe(dailyHash('2026-10-29'))
  })
  it('hands over exactly the situation it advertises, goal = par - 1', () => {
    const d = generateDaily('2026-10-28')
    const { state } = startScenario(buildScenarioConfig(d.spec), d.spec.startLap)
    const sit = describeSituation(state, d.spec.playerDriverId)!
    expect(sit.position).toBe(d.spec.expect.position)
    expect(sit.lapsRemaining).toBe(d.spec.expect.lapsRemaining)
    expect(sit.compound).toBe(d.spec.expect.compound)
    expect(sit.tyreAge).toBe(d.spec.expect.tyreAge)
    expect(d.spec.goal.position).toBe(d.spec.expect.par - 1)
    expect(d.spec.kind).toBe('daily')
  }, 60_000)

  // THE DRIFT ALARM. Pinned on the first run of this test after Task 10 is
  // implemented: run `npx vitest run tests/state/daily.test.ts -t "PINNED" --reporter=verbose`,
  // copy the printed object into GOLDEN, re-run. If a later change moves these,
  // the daily changed for every player: that is a release-note item, never a
  // silent re-pin.
  const GOLDEN: Record<string, string> = {"2026-11-01":"aurora:370895249:17:d_mwangi:goal1","2027-02-14":"harbour_lights:930192555:22:d_almeida:goal5","2027-07-04":"grand_savane:369403335:23:d_almeida:goal12"}
  it('PINNED GOLDEN DAYS', () => {
    const got = Object.fromEntries(['2026-11-01', '2027-02-14', '2027-07-04'].map(k => [k, generateDaily(k).signature + `:goal${generateDaily(k).spec.goal.position}`]))
    // eslint-disable-next-line no-console
    console.log('GOLDEN', JSON.stringify(got))
    expect(Object.keys(GOLDEN).length, 'pin GOLDEN from the printed line').toBe(3)
    expect(got).toEqual(GOLDEN)
  }, 120_000)
})

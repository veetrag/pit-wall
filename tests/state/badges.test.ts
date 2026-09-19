import { describe, it, expect } from 'vitest'
import { BADGES, earnedBadges, newlyEarned, type RaceFact, type BadgeInput } from '@state/badges'

function fact(over: Partial<RaceFact> = {}): RaceFact {
  return { season: 1, round: 0, grid: 10, finish: 10, retired: false, pole: false, stops: 1, overtakes: 0, wet: false, ...over }
}

function record(over: Partial<BadgeInput> = {}): BadgeInput {
  return {
    titles: 0, wins: 0, podiums: 0, poles: 0, racesStarted: 0, bestFinish: null,
    raceLog: [], ...over,
  }
}

describe('badge definitions', () => {
  it('HAS FIFTEEN BADGES WITH UNIQUE IDS', () => {
    // Without this, a copy-pasted duplicate id silently shadows a badge in the
    // UI: the grid would render two rows that light up together.
    expect(BADGES).toHaveLength(15)
    expect(new Set(BADGES.map(b => b.id)).size).toBe(15)
    for (const b of BADGES) {
      expect(b.name.length, `${b.id} needs a name`).toBeGreaterThan(0)
      expect(b.condition.length, `${b.id} needs a readable condition`).toBeGreaterThan(0)
    }
  })

  it('a fresh record earns nothing', () => {
    expect(earnedBadges(record())).toEqual([])
  })
})

describe('milestone badges', () => {
  it('earn on their thresholds', () => {
    expect(earnedBadges(record({ bestFinish: 10 }))).toContain('in_the_points')
    expect(earnedBadges(record({ bestFinish: 11 }))).not.toContain('in_the_points')
    expect(earnedBadges(record({ podiums: 1 }))).toContain('rostrum')
    expect(earnedBadges(record({ wins: 1 }))).toContain('winner')
    expect(earnedBadges(record({ poles: 1 }))).toContain('pole_position')
    expect(earnedBadges(record({ titles: 1 }))).toContain('champion')
    expect(earnedBadges(record({ titles: 2 }))).not.toContain('dynasty')
    expect(earnedBadges(record({ titles: 3 }))).toContain('dynasty')
    expect(earnedBadges(record({ wins: 9 }))).not.toContain('double_figures')
    expect(earnedBadges(record({ wins: 10 }))).toContain('double_figures')
    expect(earnedBadges(record({ racesStarted: 49 }))).not.toContain('veteran')
    expect(earnedBadges(record({ racesStarted: 50 }))).toContain('veteran')
    expect(earnedBadges(record({ racesStarted: 100 }))).toContain('centurion')
  })
})

describe('event badges', () => {
  it('storm_chaser needs a WET WIN', () => {
    expect(earnedBadges(record({ raceLog: [fact({ wet: true, finish: 2 })] }))).not.toContain('storm_chaser')
    expect(earnedBadges(record({ raceLog: [fact({ wet: false, finish: 1 })] }))).not.toContain('storm_chaser')
    expect(earnedBadges(record({ raceLog: [fact({ wet: true, finish: 1 })] }))).toContain('storm_chaser')
  })

  it('comeback needs a win from P10 or worse', () => {
    expect(earnedBadges(record({ raceLog: [fact({ grid: 9, finish: 1 })] }))).not.toContain('comeback')
    expect(earnedBadges(record({ raceLog: [fact({ grid: 10, finish: 1 })] }))).toContain('comeback')
  })

  it('lights_to_flag needs pole AND the win', () => {
    expect(earnedBadges(record({ raceLog: [fact({ pole: true, finish: 2 })] }))).not.toContain('lights_to_flag')
    expect(earnedBadges(record({ raceLog: [fact({ pole: false, finish: 1 })] }))).not.toContain('lights_to_flag')
    expect(earnedBadges(record({ raceLog: [fact({ pole: true, finish: 1 })] }))).toContain('lights_to_flag')
  })

  it('one_stop_wonder needs EXACTLY one stop', () => {
    expect(earnedBadges(record({ raceLog: [fact({ stops: 2, finish: 1 })] }))).not.toContain('one_stop_wonder')
    expect(earnedBadges(record({ raceLog: [fact({ stops: 0, finish: 1 })] }))).not.toContain('one_stop_wonder')
    expect(earnedBadges(record({ raceLog: [fact({ stops: 1, finish: 1 })] }))).toContain('one_stop_wonder')
  })

  it('damage_limitation needs points FROM a bad grid slot', () => {
    expect(earnedBadges(record({ raceLog: [fact({ grid: 14, finish: 10 })] }))).not.toContain('damage_limitation')
    expect(earnedBadges(record({ raceLog: [fact({ grid: 15, finish: 11 })] }))).not.toContain('damage_limitation')
    expect(earnedBadges(record({ raceLog: [fact({ grid: 15, finish: 10 })] }))).toContain('damage_limitation')
  })

  it('ironman counts CONSECUTIVE finishes, not total', () => {
    // The whole reason the spec chose a log over a counter. 22 finishes with a
    // retirement in the middle is not an Ironman.
    const broken = [
      ...Array.from({ length: 11 }, () => fact()),
      fact({ retired: true }),
      ...Array.from({ length: 11 }, () => fact()),
    ]
    expect(earnedBadges(record({ raceLog: broken }))).not.toContain('ironman')
    const clean = Array.from({ length: 12 }, () => fact())
    expect(earnedBadges(record({ raceLog: clean }))).toContain('ironman')
  })
})

describe('a DNF earns nothing, however it was classified', () => {
  it('a retirement classified P1 is not a win by any badge', () => {
    // recordRace already excludes retirements from wins/podiums/bestFinish;
    // the log-based badges must agree, or the trophy case would contradict
    // the stats screen directly above it.
    const dnf = record({ raceLog: [fact({ finish: 1, retired: true, pole: true, wet: true, stops: 1, grid: 20 })] })
    for (const id of ['storm_chaser', 'comeback', 'lights_to_flag', 'one_stop_wonder', 'damage_limitation']) {
      expect(earnedBadges(dnf), `${id} must not be earned by a DNF`).not.toContain(id)
    }
  })
})

describe('monotonicity', () => {
  it('appending a race never UN-earns a badge', () => {
    const before = record({ wins: 1, raceLog: [fact({ wet: true, finish: 1 })] })
    const after = { ...before, raceLog: [...before.raceLog, fact({ retired: true })] }
    for (const id of earnedBadges(before)) expect(earnedBadges(after)).toContain(id)
  })
})

describe('newlyEarned', () => {
  it('RETURNS ONLY WHAT CROSSED THE LINE', () => {
    const before = record({ wins: 0 })
    const after = record({ wins: 1 })
    expect(newlyEarned(before, after)).toEqual(['winner'])
  })

  it('returns nothing when the badge was already held', () => {
    // This is what makes the toast fire once without an `announced` flag.
    const held = record({ wins: 1 })
    expect(newlyEarned(held, record({ wins: 2 }))).toEqual([])
  })

  it('returns several when several land together', () => {
    const before = record()
    const after = record({ wins: 1, podiums: 1, bestFinish: 1 })
    expect(newlyEarned(before, after).sort()).toEqual(['in_the_points', 'rostrum', 'winner'])
  })
})

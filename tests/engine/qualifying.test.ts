import { describe, it, expect } from 'vitest'
import { runQualifying, createRng, initRace, type QualifyingCall } from '@engine/index'
import { buildRaceConfig } from '@state/buildRaceConfig'

const CALL: QualifyingCall = { compound: 'S', attack: 'attack' }
const config = () => buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie', null, null)

describe('runQualifying', () => {
  it('IS DETERMINISTIC', () => {
    // The mirror of byteIdentity.test.ts. Without this, a stray Math.random or
    // an iteration-order dependency turns the grid into a reroll.
    const run = () => runQualifying(config(), createRng(99), CALL)
    expect(run()).toEqual(run())
  })

  it('RETURNS A TOTAL ORDER OVER THE WHOLE FIELD', () => {
    const c = config()
    const result = runQualifying(c, createRng(99), CALL)
    expect(result.laps).toHaveLength(c.drivers.length)
    expect(result.order).toHaveLength(c.drivers.length)
    expect(new Set(result.order).size).toBe(c.drivers.length)
    expect([...result.order].sort()).toEqual(c.drivers.map(d => d.id).sort())
    // order agrees with laps, and laps are sorted ascending
    expect(result.order).toEqual(result.laps.map(l => l.driverId))
    const times = result.laps.map(l => l.time)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('PRODUCES A GRID THAT initRace CAN CONSUME', () => {
    const c = config()
    const result = runQualifying(c, createRng(99), CALL)
    // The permutation guard from Task 1 is the contract; this proves the two
    // halves actually fit rather than each being correct in isolation.
    expect(() => {
      initRace({ ...c, gridOrder: result.order })
    }).not.toThrow()
  })

  it('APPLIES THE PLAYER CALL ONLY TO THE PLAYER', () => {
    const c = config()
    const result = runQualifying(c, createRng(99), { compound: 'H', attack: 'conserve' })
    const player = result.laps.find(l => l.driverId === c.playerDriverId)!
    expect(player.compound).toBe('H')
    expect(player.attack).toBe('conserve')
    // Rivals are driven by their brain tier, not the player's call.
    const others = result.laps.filter(l => l.driverId !== c.playerDriverId)
    expect(others.every(l => l.attack === 'conserve'), 'rivals must not copy the player').toBe(false)
  })

  it('A SCRAPPY LAP COSTS TIME BUT NEVER REMOVES A DRIVER', () => {
    /*
     * Qualifying must not end a weekend before it starts. Scan seeds until a
     * scrappy lap appears rather than asserting on one fixed seed, so this
     * keeps testing the behaviour after the numbers are recalibrated.
     */
    const c = config()
    let found = false
    for (let seed = 0; seed < 60 && !found; seed++) {
      const result = runQualifying(c, createRng(seed), CALL)
      if (result.laps.some(l => l.scrappy)) {
        found = true
        expect(result.laps).toHaveLength(c.drivers.length)
        expect(result.order).toHaveLength(c.drivers.length)
      }
    }
    expect(found, 'no scrappy lap in 60 seeds -- errorChance may be broken').toBe(true)
  })

  it('ATTACKING IS FASTER THAN CONSERVING, AVERAGED OVER SEEDS', () => {
    // Per-seed comparison is noise-dominated (sigmaPerSector 0.08), so compare
    // means. This is the test that would catch attack and conserve being
    // wired to the wrong sign.
    const c = config()
    const mean = (attack: 'attack' | 'conserve') => {
      let total = 0
      for (let seed = 0; seed < 40; seed++) {
        const r = runQualifying(c, createRng(seed), { compound: 'S', attack })
        total += r.laps.find(l => l.driverId === c.playerDriverId)!.time
      }
      return total / 40
    }
    expect(mean('attack')).toBeLessThan(mean('conserve'))
  })

  it('DOES NOT DOUBLE-COUNT THE PACE MODE', () => {
    /*
     * computeSectorTime already adds paceModes[car.paceMode].paceDelta / 3 per
     * sector. If a qualifying car were built with paceMode 'push' AS WELL AS
     * the attack paceDelta, attack would be -0.60s/lap rather than -0.45, and
     * every future edit to paceModes would silently retune qualifying.
     *
     * SCRAPPY LAPS MUST BE EXCLUDED, and that is the whole difficulty here.
     * attack errors at 0.15 and balanced at 0.06, so scrappy laps inflate the
     * attack mean by 0.15*1.2 = 0.180s and the balanced mean by 0.06*1.2 =
     * 0.072s -- a systematic 0.108s that shrinks the observed gap. An earlier
     * version of this test compared raw means with a 0.12s tolerance and
     * therefore PASSED with the double-count present: 0.60 - 0.108 = 0.49
     * against an expected 0.45 is a miss of only 0.04. It could not fail.
     *
     * Filtering to clean laps removes that confound entirely, so the gap is
     * the tuning delta plus sampling noise alone and the tolerance can be
     * tight enough to separate 0.45 from 0.60.
     */
    const c = config()
    const cleanMean = (attack: 'attack' | 'balanced') => {
      const times: number[] = []
      for (let seed = 0; seed < 300; seed++) {
        const lap = runQualifying(c, createRng(seed), { compound: 'S', attack })
          .laps.find(l => l.driverId === c.playerDriverId)!
        if (!lap.scrappy) times.push(lap.time)
      }
      expect(times.length, 'too few clean laps to average').toBeGreaterThan(100)
      return times.reduce((a, b) => a + b, 0) / times.length
    }
    const expected = Math.abs(
      c.tuning.qualifying.attackLevels.attack.paceDelta
      - c.tuning.qualifying.attackLevels.balanced.paceDelta,
    )
    const observed = cleanMean('balanced') - cleanMean('attack')
    // A double-count would read ~0.60 against an expected 0.45, a miss of 0.15.
    // Per-lap noise is ~0.139s (sigmaPerSector 0.08 over 3 sectors); at 100+
    // samples the standard error is under 0.015, so 0.08 is >5 SE of headroom
    // while still less than the 0.15 a double-count would produce.
    expect(Math.abs(observed - expected),
      `clean-lap gap ${observed.toFixed(3)}s vs tuning ${expected.toFixed(3)}s`,
    ).toBeLessThan(0.08)
  }, 120_000)
})

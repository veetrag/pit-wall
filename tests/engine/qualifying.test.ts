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
     * Measured against a zero-delta control: the gap between attack and
     * balanced must match tuning, within one lap of noise.
     */
    const c = config()
    const meanFor = (attack: 'attack' | 'balanced') => {
      let total = 0
      for (let seed = 0; seed < 120; seed++) {
        const r = runQualifying(c, createRng(seed), { compound: 'S', attack })
        total += r.laps.find(l => l.driverId === c.playerDriverId)!.time
      }
      return total / 120
    }
    const expected = Math.abs(
      c.tuning.qualifying.attackLevels.attack.paceDelta
      - c.tuning.qualifying.attackLevels.balanced.paceDelta,
    )
    // Scrappy laps inflate both means; compare with a tolerance wide enough for
    // that and for sampling noise, but far tighter than a 0.15s double-count.
    const observed = meanFor('balanced') - meanFor('attack')
    expect(Math.abs(observed - expected)).toBeLessThan(0.12)
  })
})

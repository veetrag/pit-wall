import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'

describe('tuning.qualifying', () => {
  it('LOADS AND VALIDATES', () => {
    const { tuning } = loadGameData()
    const q = tuning.qualifying
    expect(q).toBeDefined()
    expect(q.seedOffset).toBe(777777)
    expect(q.scrappyLapPenalty).toBeGreaterThan(0)
    for (const level of ['conserve', 'balanced', 'attack'] as const) {
      expect(q.attackLevels[level].errorChance).toBeGreaterThanOrEqual(0)
      expect(q.attackLevels[level].errorChance).toBeLessThanOrEqual(1)
    }
  })

  it('ORDERS THE ATTACK LEVELS COHERENTLY', () => {
    /*
     * The whole decision is "faster costs riskier". If a level were ever
     * edited so that attacking is both slower AND safer, the choice becomes
     * strictly dominated and the screen is decoration. This test is a balance
     * guard, not a schema guard -- zod cannot express it.
     */
    const { attackLevels: a } = loadGameData().tuning.qualifying
    expect(a.attack.paceDelta).toBeLessThan(a.balanced.paceDelta)
    expect(a.balanced.paceDelta).toBeLessThan(a.conserve.paceDelta)
    expect(a.attack.errorChance).toBeGreaterThan(a.balanced.errorChance)
    expect(a.balanced.errorChance).toBeGreaterThan(a.conserve.errorChance)
  })
})

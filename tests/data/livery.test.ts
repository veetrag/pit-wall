import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'
describe('livery accents (spec 3.4)', () => {
  it('every team has a hex liveryAccent different from its primary', () => {
    for (const t of loadGameData().cars.teams) {
      expect(t.liveryAccent, t.id).toMatch(/^#[0-9A-F]{6}$/i)
      expect(t.liveryAccent!.toLowerCase()).not.toBe(t.colorPrimary.toLowerCase())
    }
  })
})

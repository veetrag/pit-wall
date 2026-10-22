import { describe, it, expect } from 'vitest'
import { INTERVALS } from '@ui/GameClock'

describe('sim speed labels', () => {
  it('2x and 4x are true multiples of 1x', () => {
    expect(INTERVALS[1]! / INTERVALS[2]!).toBe(2)
    expect(INTERVALS[1]! / INTERVALS[4]!).toBe(4)
  })
})

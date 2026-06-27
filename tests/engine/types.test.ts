import { describe, it, expectTypeOf } from 'vitest'
import type { RaceState, CarState, Compound, PaceMode } from '@engine/types'

describe('engine types', () => {
  it('Compound is the union S|M|H', () => {
    expectTypeOf<Compound>().toEqualTypeOf<'S' | 'M' | 'H'>()
  })
  it('PaceMode is push|neutral|conserve', () => {
    expectTypeOf<PaceMode>().toEqualTypeOf<'push' | 'neutral' | 'conserve'>()
  })
  it('RaceState has lap and cars fields', () => {
    expectTypeOf<RaceState>().toHaveProperty('lap')
    expectTypeOf<RaceState>().toHaveProperty('cars')
  })
  it('CarState has position, raceTime, tyreAge', () => {
    expectTypeOf<CarState>().toHaveProperty('position')
    expectTypeOf<CarState>().toHaveProperty('raceTime')
    expectTypeOf<CarState>().toHaveProperty('tyreAge')
  })
})

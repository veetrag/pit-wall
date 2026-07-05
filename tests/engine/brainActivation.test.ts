import { describe, it, expect, beforeEach } from 'vitest'
import { useRaceStore } from '@state/raceStore'
import { stepSector } from '@engine/index'
import type { RaceConfig, RaceState } from '@engine/types'
import type { Rng } from '@engine/rng'

function getStore() {
  return useRaceStore.getState()
}

function runFullRace(config: RaceConfig, state: RaceState, rng: Rng): RaceState {
  let next = state
  const totalSectors = next.totalLaps * 3
  for (let i = 0; i < totalSectors; i++) {
    next = stepSector(config, next, rng)
  }
  return next
}

describe('rival brain activation (M1)', () => {
  beforeEach(() => {
    useRaceStore.setState({
      phase: 'idle', config: null, raceState: null,
      projectionResult: null, pitPanelOpen: false, rng: null,
    })
  })

  it('brains are live: pro difficulty produces optimal and smart rivals', () => {
    getStore().startSeasonRace('d_voss', 42, 'bengaluru', 'pro')
    const strategies = getStore().config!.strategies
    const brains = strategies.map(s => s.brain)
    expect(brains).toContain('optimal')
    expect(brains).toContain('smart')
    // no rival should silently fall back to the un-configured default
    expect(brains.every(b => b === 'optimal' || b === 'smart' || b === 'naive')).toBe(true)
  })

  it('rookie caps the field at smart — no optimal rivals', () => {
    getStore().startSeasonRace('d_voss', 42, 'bengaluru', 'rookie')
    const strategies = getStore().config!.strategies
    expect(strategies.some(s => s.brain === 'optimal')).toBe(false)
    expect(strategies.some(s => s.brain === 'smart')).toBe(true)
    expect(strategies.some(s => s.brain === 'naive')).toBe(true)
  })

  it('pro promotes every rival past naive', () => {
    getStore().startSeasonRace('d_voss', 42, 'bengaluru', 'pro')
    const strategies = getStore().config!.strategies
    expect(strategies.some(s => s.brain === 'naive')).toBe(false)
  })

  it('difficulty changes race behaviour for an identical seed', () => {
    getStore().startSeasonRace('d_voss', 777, 'bengaluru', 'rookie')
    const rookieFinal = runFullRace(getStore().config!, getStore().raceState!, getStore().rng!)

    getStore().startSeasonRace('d_voss', 777, 'bengaluru', 'pro')
    const proFinal = runFullRace(getStore().config!, getStore().raceState!, getStore().rng!)

    const rookieOrder = rookieFinal.cars.map(c => c.driverId).join(',')
    const proOrder = proFinal.cars.map(c => c.driverId).join(',')
    const differs = rookieFinal.overtakeEvents.length !== proFinal.overtakeEvents.length || rookieOrder !== proOrder
    expect(differs).toBe(true)
  })

  it('same difficulty + same seed is deterministic', () => {
    getStore().startSeasonRace('d_voss', 555, 'bengaluru', 'pro')
    const a = runFullRace(getStore().config!, getStore().raceState!, getStore().rng!)

    getStore().startSeasonRace('d_voss', 555, 'bengaluru', 'pro')
    const b = runFullRace(getStore().config!, getStore().raceState!, getStore().rng!)

    expect(a.cars.map(c => c.driverId)).toEqual(b.cars.map(c => c.driverId))
    expect(a.overtakeEvents.length).toBe(b.overtakeEvents.length)
  })
})

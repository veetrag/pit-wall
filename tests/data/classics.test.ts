import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'
import { packOf } from '@state/scenarioStore'

const { scenarios } = loadGameData()
const classics = scenarios.filter(s => packOf(s) === 'historic')

describe('the historic pack (spec 2026-10-24 §3)', () => {
  it('every shipped core scenario stays core', () => {
    for (const id of ['recovery_drive', 'safety_car_gamble', 'cliff_edge', 'rain_call', 'vsc_gamble', 'sprint_finish', 'red_flag_restart']) {
      expect(packOf(scenarios.find(s => s.id === id)!), id).toBe('core')
    }
  })
  it('every classic carries inspiredBy and era', () => {
    for (const s of classics) {
      expect(s.inspiredBy, s.id).toBeTruthy()
      expect(s.era, s.id).toBeTruthy()
    }
  })
  it('NAMES NO ONE: inspiredBy has no capitalised word except a sentence start (ruling R13)', () => {
    for (const s of classics) {
      const sentences = (s.inspiredBy ?? '').split(/(?<=[.!?])\s+/)
      for (const sentence of sentences) {
        const words = sentence.split(/\s+/).slice(1)
        for (const w of words) expect(/^[A-Z]/.test(w), `${s.id}: "${w}"`).toBe(false)
      }
    }
  })
})

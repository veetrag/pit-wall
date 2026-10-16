import { describe, it, expect } from 'vitest'
import { cautionWashAlpha, SC_WASH_ALPHA, VSC_WASH_ALPHA } from '@canvas/cautionWash'
import type { SafetyCarState } from '@engine/types'

const base: SafetyCarState = { deployedLap: 2, lapsRemaining: 2, cause: 'crash' }

describe('caution wash', () => {
  it('a VSC wash is about half the SC wash, so the two read apart at a glance', () => {
    expect(VSC_WASH_ALPHA).toBeCloseTo(SC_WASH_ALPHA / 2, 9)
    expect(cautionWashAlpha({ ...base, kind: 'sc' }, 'racing')).toBe(SC_WASH_ALPHA)
    expect(cautionWashAlpha(base, 'racing'), 'a kind-less state is a safety car').toBe(SC_WASH_ALPHA)
    expect(cautionWashAlpha({ ...base, kind: 'vsc' }, 'starting')).toBe(VSC_WASH_ALPHA)
  })

  it('no wash on a green track, and none once the race is over', () => {
    expect(cautionWashAlpha(null, 'racing')).toBe(0)
    expect(cautionWashAlpha({ ...base, kind: 'sc' }, 'finished')).toBe(0)
    expect(cautionWashAlpha({ ...base, kind: 'vsc' }, 'idle')).toBe(0)
  })
})

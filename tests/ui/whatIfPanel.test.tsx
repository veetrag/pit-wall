import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

import { WhatIfPanel, futuresSummary, whatIfLines } from '@ui/WhatIfPanel'
import { DebriefCard } from '@ui/DebriefCard'
import { useDebriefStore, setDebriefRunner } from '@state/debriefStore'
import { useSettingsStore } from '@state/settingsStore'
import type { DebriefRunner } from '@state/debriefRunner'
import { buildRaceConfig } from '@state/buildRaceConfig'
import { makeDeterministicTuning } from '../fixtures/tuning'

const job = () => {
  const c = buildRaceConfig(4243, 'd_voss', 'bengaluru', 'rookie',
    { startCompound: 'M', plannedStops: [{ lap: 10, compound: 'H' }] }, null, undefined, true)
  return { config: { ...c, tuning: makeDeterministicTuning(), lapsOverride: 20 }, seed: 4243, calls: [] }
}
const edits: unknown[] = []
let mode: 'done' | 'hang' | 'fail' = 'done'
const runner: DebriefRunner = {
  start(_j, on) { on.done({ futures: 8, verdicts: [], finish: 5, retired: null }); return { cancel() {} } },
  whatIf(_j, e, on) {
    edits.push(e)
    if (mode === 'done') on.done({ mine: [5, 5, 4, 6, 5, 5, 4, 6], theirs: [3, 4, 3, 5, 2, 3, 4, 21] })
    if (mode === 'fail') on.failed('x')
    return { cancel() {} }
  },
}

beforeEach(() => {
  edits.length = 0; mode = 'done'
  useSettingsStore.setState({ reducedMotion: true })
  useDebriefStore.getState().cancel(); setDebriefRunner(runner)
})

describe('read-out (spec 1.6 §5)', () => {
  it('median and range, DNF named', () => {
    expect(futuresSummary([5, 5, 4, 6, 5, 5, 4, 6], 20)).toEqual({ typical: 'P5', range: 'P4–P6' })
    expect(futuresSummary([3, 4, 3, 5, 2, 3, 4, 21], 20)).toEqual({ typical: 'P3', range: 'P2–DNF' })
  })
  it('median is the lower middle at K=8; ties and a lone DNF do not move it', () => {
    expect(futuresSummary([1, 2, 3, 4, 5, 6, 7, 8], 20).typical).toBe('P4')
    expect(futuresSummary([7, 7, 7, 7, 7, 7, 7, 7], 20)).toEqual({ typical: 'P7', range: 'P7–P7' })
    expect(futuresSummary([21, 21, 21, 21, 21, 21, 21, 21], 20)).toEqual({ typical: 'DNF', range: 'DNF–DNF' })
    expect(futuresSummary([2, 2, 3, 3, 4, 4, 21, 21], 20).typical).toBe('P3')
  })
  it('never claims a single exact finish; counts better futures pairwise', () => {
    const l = whatIfLines({ mine: [5, 5, 4, 6, 5, 5, 4, 6], theirs: [3, 4, 3, 5, 2, 3, 4, 21] }, 20)
    expect(l.mine).toBe('Your plan: P5 (P4–P6)')
    expect(l.theirs).toBe('This plan: P3 (P2–DNF) · better in 6 of 8 futures')
  })
  it('better is strict (ties are not better) and 0 reads never better', () => {
    expect(whatIfLines({ mine: [3, 3], theirs: [4, 3] }, 20).theirs).toMatch(/never better/)
    expect(whatIfLines({ mine: [5, 5, 5, 5, 5, 5, 5, 5], theirs: [4, 5, 5, 5, 5, 5, 5, 5] }, 20).theirs).toMatch(/better in 1 of 8 futures/)
    expect(whatIfLines({ mine: [5, 5, 5, 5, 5, 5, 5, 5], theirs: [4, 4, 4, 4, 4, 4, 4, 4] }, 20).theirs).toMatch(/better in 8 of 8 futures/)
    expect(whatIfLines({ mine: [21, 5], theirs: [21, 21] }, 20).theirs).toMatch(/never better/)
  })
})

describe('the panel', () => {
  it('is not offered without a kept job (scenario, resumed race)', () => {
    render(<DebriefCard />)
    expect(screen.queryByRole('button', { name: /try another plan/i })).toBeNull()
  })

  it('is disabled with a visible reason until the debrief is done', () => {
    useDebriefStore.setState({ status: 'running', done: 1, total: 10, result: null, raceKey: 'r', job: job() })
    render(<DebriefCard />)
    expect((screen.getByRole('button', { name: /try another plan/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/available once the review finishes/i)).toBeTruthy()
  })

  it('edits the stop lap within range, runs, and shows both plans', () => {
    useDebriefStore.getState().start(job(), 'r1')
    render(<DebriefCard />)
    fireEvent.click(screen.getByRole('button', { name: /try another plan/i }))
    expect((screen.getByRole('button', { name: /run 8 futures/i }) as HTMLButtonElement).disabled, 'nothing changed yet').toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /one lap earlier/i }))
    fireEvent.click(screen.getByRole('button', { name: /run 8 futures/i }))
    expect(edits).toEqual([{ kind: 'stop', stop: 0, lap: 9, compound: 'H' }])
    expect(screen.getByText('Your plan: P5 (P4–P6)')).toBeTruthy()
    expect(screen.getByText(/This plan: P3/)).toBeTruthy()
  })

  it('hides the read-out once the controls move off the edit that was run', () => {
    useDebriefStore.getState().start(job(), 'r1')
    render(<WhatIfPanel />)
    fireEvent.click(screen.getByRole('button', { name: /one lap earlier/i }))
    fireEvent.click(screen.getByRole('button', { name: /run 8 futures/i }))
    expect(screen.getByText(/This plan: P3/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /one lap later/i }))
    expect(screen.queryByText(/This plan: P3/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /one lap earlier/i }))
    expect(screen.getByText(/This plan: P3/)).toBeTruthy()
  })

  it('says why when the debrief itself failed', () => {
    useDebriefStore.setState({ status: 'failed', result: null, raceKey: 'r', job: job() })
    render(<DebriefCard />)
    expect(screen.getByText('Review unavailable for this race.')).toBeTruthy()
  })

  it('offers only compounds that have sets', () => {
    const j = job()
    useDebriefStore.getState().start({ ...j, config: { ...j.config, tyreAllocationBase: { S: 0, M: 2, H: 2, I: 0, W: 0 } } }, 'r1')
    render(<WhatIfPanel />)
    const names = screen.getAllByRole('radio').map(r => r.getAttribute('aria-label'))
    expect(names).toEqual(['Medium', 'Hard'])
  })

  it('shows a loading moment while running, and an honest message on failure', () => {
    mode = 'hang'
    useDebriefStore.getState().start(job(), 'r1')
    render(<WhatIfPanel />)
    fireEvent.click(screen.getByRole('button', { name: /one lap earlier/i }))
    fireEvent.click(screen.getByRole('button', { name: /run 8 futures/i }))
    expect(screen.getByRole('progressbar', { name: /running futures/i })).toBeTruthy()
    act(() => useDebriefStore.getState().clearWhatIf())
    mode = 'fail'
    fireEvent.click(screen.getByRole('button', { name: /run 8 futures/i }))
    expect(screen.getByText(/couldn't run that plan/i)).toBeTruthy()
  })

  it('every control is labelled and at least 44px', () => {
    useDebriefStore.getState().start(job(), 'r1')
    render(<WhatIfPanel />)
    for (const b of screen.getAllByRole('button').concat(screen.getAllByRole('radio'))) {
      expect(b.getAttribute('aria-label') ?? b.textContent, 'label').toBeTruthy()
      expect(parseInt(b.style.minHeight || b.style.height || '0', 10), b.textContent ?? '').toBeGreaterThanOrEqual(44)
    }
  })
})

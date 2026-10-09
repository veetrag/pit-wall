import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DebriefCard, describeCall, describeAlternative } from '@ui/DebriefCard'
import { useDebriefStore } from '@state/debriefStore'
import { useSettingsStore } from '@state/settingsStore'
import type { DebriefResult } from '@engine/types'

const o = (p: number[]) => ({ positions: p, meanPosition: p.reduce((a, b) => a + b, 0) / p.length })
const result: DebriefResult = {
  futures: 8,
  finish: 6, retired: null,
  verdicts: [
    { call: { kind: 'pit', lap: 25, compound: 'H' }, actual: o([6, 6, 7, 6, 6, 5, 7, 6]),
      better: { ...o([4, 4, 5, 4, 4, 4, 5, 4]), alternative: { kind: 'pit', lap: 22, compound: 'M' }, betterShare: 1 } },
    { call: { kind: 'start', compound: 'M' }, actual: o([6, 6, 6, 6, 6, 6, 6, 6]), better: null },
    { call: { kind: 'pace', lap: 31, mode: 'push' }, actual: o([6, 6, 6, 6, 6, 6, 6, 6]), better: null },
    { call: { kind: 'plan', lap: 40, compound: 'S' }, actual: o([6, 6, 6, 6, 6, 6, 6, 6]), better: null },
  ],
}

beforeEach(() => { useSettingsStore.setState({ reducedMotion: true }) })

describe('DebriefCard', () => {
  it('shows progress while running', () => {
    useDebriefStore.setState({ status: 'running', done: 61, total: 100, result: null, raceKey: 'r' })
    render(<DebriefCard />)
    expect(screen.getByText(/reviewing/i)).toBeTruthy()
    expect(screen.getByText('61%')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('61')
  })

  it('shows a better alternative with ▲, both averages and the share', () => {
    useDebriefStore.setState({ status: 'done', result, raceKey: 'r', done: 0, total: 0 })
    render(<DebriefCard />)
    expect(screen.getByText(/▲ PIT L25 → HARD/)).toBeTruthy()
    expect(screen.getByText(/Better: L22 → MEDIUM/)).toBeTruthy()
    expect(screen.getByText('you P6 · avg P6.1')).toBeTruthy()
    expect(screen.getByText(/avg P4\.3 · 8\/8/)).toBeTruthy()
  })

  it('marks good calls with ✓ and collapses beyond three rows', () => {
    useDebriefStore.setState({ status: 'done', result, raceKey: 'r', done: 0, total: 0 })
    render(<DebriefCard />)
    expect(screen.getAllByText(/GOOD CALL/).length).toBe(2)
    expect(screen.getByText(/\+1 more judged good/)).toBeTruthy()
  })

  it('expands a row to show each future', () => {
    useDebriefStore.setState({ status: 'done', result, raceKey: 'r', done: 0, total: 0 })
    render(<DebriefCard />)
    const btn = screen.getByRole('button', { name: /PIT L25 → HARD/ })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText(/your call, finishing positions/i).textContent).toContain('P6')
  })

  it('shows a single dim line when unavailable', () => {
    useDebriefStore.setState({ status: 'failed', result: null, raceKey: 'r', done: 0, total: 0 })
    render(<DebriefCard />)
    expect(screen.getByText(/Debrief unavailable/)).toBeTruthy()
  })

  it('says why for a resumed race (idle)', () => {
    useDebriefStore.setState({ status: 'idle', result: null, raceKey: null, done: 0, total: 0 })
    render(<DebriefCard />)
    expect(screen.getByText(/Debrief unavailable for a resumed race/)).toBeTruthy()
  })

  it('names calls and alternatives in plain words', () => {
    expect(describeCall({ kind: 'start', compound: 'M' })).toBe('PLAN · START ON MEDIUM')
    expect(describeCall({ kind: 'pace', lap: 31, mode: 'push' })).toBe('PACE → PUSH L31')
    expect(describeAlternative({ kind: 'pace-none' })).toBe('no pace change')
  })

  it('shows a later better row and counts only good calls as hidden', () => {
    const good = (lap: number) => ({ call: { kind: 'pace' as const, lap, mode: 'push' as const }, actual: o([6, 6]), better: null })
    const late = { call: { kind: 'pit' as const, lap: 50, compound: 'S' as const }, actual: o([6, 6]),
      better: { ...o([5, 5]), alternative: { kind: 'pit' as const, lap: 48, compound: 'M' as const }, betterShare: 1 } }
    useDebriefStore.setState({ status: 'done', raceKey: 'r', done: 0, total: 0,
      result: { futures: 2, finish: 6, retired: null, verdicts: [good(1), good(2), good(3), good(4), late] } })
    render(<DebriefCard />)
    expect(screen.getByText(/▲ PIT L50/)).toBeTruthy()
    expect(screen.getByText(/\+1 more judged good/)).toBeTruthy()
  })
})

describe('wing rows', () => {
  it('describes the wing call and alternative', () => {
    expect(describeCall({ kind: 'wing', wing: 2 })).toBe('SETUP · WING 2')
    expect(describeAlternative({ kind: 'wing', wing: 4 })).toBe('WING 4')
  })
})

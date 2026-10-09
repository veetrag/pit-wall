import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDebriefStore, setDebriefRunner } from '@state/debriefStore'
import type { DebriefRunner } from '@state/debriefRunner'
import { inProcessRunner } from '@state/debriefRunner'
import { buildRaceConfig } from '@state/buildRaceConfig'

const job = () => ({
  config: buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie',
    { startCompound: 'M', plannedStops: [{ lap: 24, compound: 'H' }] }, null, undefined, true),
  seed: 4242, calls: [],
})

function manualRunner() {
  const live: { on: Parameters<DebriefRunner['start']>[1]; cancelled: boolean }[] = []
  const runner: DebriefRunner = {
    start(_job, on) { const h = { on, cancelled: false }; live.push(h); return { cancel: () => { h.cancelled = true } } },
  }
  return { runner, live }
}

beforeEach(() => { useDebriefStore.getState().cancel() })

describe('debriefStore', () => {
  it('runs to done with the in-process runner', async () => {
    setDebriefRunner(inProcessRunner)
    useDebriefStore.getState().start(job(), 'race-a')
    await vi.waitFor(() => expect(useDebriefStore.getState().status).toBe('done'), { timeout: 15000 })
    expect(useDebriefStore.getState().result?.verdicts.length).toBeGreaterThan(0)
  })

  it('a new start cancels the previous run', () => {
    const { runner, live } = manualRunner()
    setDebriefRunner(runner)
    useDebriefStore.getState().start(job(), 'race-a')
    useDebriefStore.getState().start(job(), 'race-b')
    expect(live[0]!.cancelled).toBe(true)
    expect(useDebriefStore.getState().raceKey).toBe('race-b')
  })

  it('ignores a result from a race the player has left', () => {
    const { runner, live } = manualRunner()
    setDebriefRunner(runner)
    useDebriefStore.getState().start(job(), 'race-a')
    useDebriefStore.getState().start(job(), 'race-b')
    live[0]!.on.done({ futures: 8, verdicts: [], retired: null })
    expect(useDebriefStore.getState().status).toBe('running')
  })

  it('cancel stops the run and returns to idle', () => {
    const { runner, live } = manualRunner()
    setDebriefRunner(runner)
    useDebriefStore.getState().start(job(), 'race-a')
    useDebriefStore.getState().cancel()
    expect(live[0]!.cancelled).toBe(true)
    expect(useDebriefStore.getState().status).toBe('idle')
  })

  it('times out to failed and never throws', () => {
    vi.useFakeTimers()
    const { runner } = manualRunner()
    setDebriefRunner(runner)
    useDebriefStore.getState().start(job(), 'race-a')
    vi.advanceTimersByTime(job().config.tuning.debrief.timeoutMs + 1)
    expect(useDebriefStore.getState().status).toBe('failed')
    vi.useRealTimers()
  })

  it('a runner failure becomes failed', () => {
    const { runner, live } = manualRunner()
    setDebriefRunner(runner)
    useDebriefStore.getState().start(job(), 'race-a')
    live[0]!.on.failed('boom')
    expect(useDebriefStore.getState().status).toBe('failed')
  })
})

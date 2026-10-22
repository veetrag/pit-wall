import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDebriefStore, setDebriefRunner, whatIfFailureCopy } from '@state/debriefStore'
import { inProcessRunner, type DebriefRunner } from '@state/debriefRunner'
import { buildRaceConfig } from '@state/buildRaceConfig'
import { useRaceStore } from '@state/raceStore'
import { makeDeterministicTuning } from '../fixtures/tuning'

const job = () => {
  const c = buildRaceConfig(4243, 'd_voss', 'bengaluru', 'rookie',
    { startCompound: 'M', plannedStops: [{ lap: 10, compound: 'H' }] }, null, undefined, true)
  return { config: { ...c, tuning: makeDeterministicTuning(), lapsOverride: 20 }, seed: 4243, calls: [] }
}
const EDIT = { kind: 'stop' as const, stop: 0, lap: 8, compound: 'H' as const }

function manual() {
  const whatIfs: { on: Parameters<NonNullable<DebriefRunner['whatIf']>>[2]; cancelled: boolean }[] = []
  const runner: DebriefRunner = {
    start(_j, on) { setTimeout(() => on.done({ futures: 8, verdicts: [], finish: 5, retired: null }), 0); return { cancel() {} } },
    whatIf(_j, _e, on) { const h = { on, cancelled: false }; whatIfs.push(h); return { cancel: () => { h.cancelled = true } } },
  }
  return { runner, whatIfs }
}

beforeEach(() => { useDebriefStore.getState().cancel() })

describe('what-if in the debrief store (spec 1.6 §5)', () => {
  it('keeps the job from start until cancel', () => {
    setDebriefRunner(manual().runner)
    useDebriefStore.getState().start(job(), 'r1')
    expect(useDebriefStore.getState().job?.seed).toBe(4243)
    useDebriefStore.getState().cancel()
    expect(useDebriefStore.getState().job).toBeNull()
  })

  it('runs only once the debrief is done', async () => {
    const m = manual(); setDebriefRunner(m.runner)
    useDebriefStore.getState().start(job(), 'r1')
    useDebriefStore.getState().runWhatIf(EDIT)
    expect(m.whatIfs, 'not while judging').toHaveLength(0)
    await vi.waitFor(() => expect(useDebriefStore.getState().status).toBe('done'))
    useDebriefStore.getState().runWhatIf(EDIT)
    expect(useDebriefStore.getState().whatIf.status).toBe('running')
    m.whatIfs[0]!.on.done({ mine: [5, 5], theirs: [3, 4] })
    expect(useDebriefStore.getState().whatIf).toEqual({ status: 'done', edit: EDIT, result: { mine: [5, 5], theirs: [3, 4] } })
  })

  it('A WHAT-IF THAT LANDS AFTER THE PLAYER LEFT is ignored (Review Focus 3)', async () => {
    const m = manual(); setDebriefRunner(m.runner)
    useDebriefStore.getState().start(job(), 'r1')
    await vi.waitFor(() => expect(useDebriefStore.getState().status).toBe('done'))
    useDebriefStore.getState().runWhatIf(EDIT)
    useDebriefStore.getState().cancel()            // NEXT RACE / RETRY / MENU
    expect(m.whatIfs[0]!.cancelled).toBe(true)
    m.whatIfs[0]!.on.done({ mine: [1], theirs: [1] })
    expect(useDebriefStore.getState().whatIf.status).toBe('idle')
    expect(useDebriefStore.getState().whatIf.result).toBeNull()
  })

  it('a second run supersedes the first; the first result is dropped', async () => {
    const m = manual(); setDebriefRunner(m.runner)
    useDebriefStore.getState().start(job(), 'r1')
    await vi.waitFor(() => expect(useDebriefStore.getState().status).toBe('done'))
    useDebriefStore.getState().runWhatIf(EDIT)
    useDebriefStore.getState().runWhatIf({ ...EDIT, lap: 12 })
    expect(m.whatIfs[0]!.cancelled).toBe(true)
    m.whatIfs[0]!.on.done({ mine: [9], theirs: [9] })
    expect(useDebriefStore.getState().whatIf.status).toBe('running')
  })

  it('a runner without whatIf reports failed rather than hanging', async () => {
    setDebriefRunner({ start(_j, on) { setTimeout(() => on.done({ futures: 8, verdicts: [], finish: 5, retired: null }), 0); return { cancel() {} } } })
    useDebriefStore.getState().start(job(), 'r1')
    await vi.waitFor(() => expect(useDebriefStore.getState().status).toBe('done'))
    useDebriefStore.getState().runWhatIf(EDIT)
    expect(useDebriefStore.getState().whatIf.status).toBe('failed')
  })

  it('a RangeError from the engine surfaces as failed', async () => {
    setDebriefRunner(inProcessRunner)
    useDebriefStore.getState().start(job(), 'r1')
    await vi.waitFor(() => expect(useDebriefStore.getState().status).toBe('done'), { timeout: 30000 })
    useDebriefStore.getState().runWhatIf({ ...EDIT, stop: 9 })
    await vi.waitFor(() => expect(useDebriefStore.getState().whatIf.status).toBe('failed'), { timeout: 30000 })
  }, 60_000)

  it('runs end to end in process after the race store has reset', async () => {
    setDebriefRunner(inProcessRunner)
    useDebriefStore.getState().start(job(), 'r1')
    useRaceStore.getState().resetRace()
    await vi.waitFor(() => expect(useDebriefStore.getState().status).toBe('done'), { timeout: 30000 })
    useDebriefStore.getState().runWhatIf(EDIT)
    await vi.waitFor(() => expect(useDebriefStore.getState().whatIf.status).toBe('done'), { timeout: 30000 })
    expect(useDebriefStore.getState().whatIf.result!.theirs).toHaveLength(8)
  }, 60_000)

  describe('why a what-if failed (item 16a)', () => {
    it('maps the worker reason to friendly copy', () => {
      expect(whatIfFailureCopy('RangeError: whatIf: no stop 9')).toBe("That change isn't possible in this race.")
      expect(whatIfFailureCopy('RangeError: whatIf: "add" is only for a race without a stop')).toBe("That change isn't possible in this race.")
      expect(whatIfFailureCopy('RangeError: whatIf: call 2 is not a pit call')).toBe("That change isn't possible in this race.")
      expect(whatIfFailureCopy('RangeError: whatIfLapRange: no stop 3')).toBe("That change isn't possible in this race.")
      expect(whatIfFailureCopy('RangeError: whatIf: no S sets left at the branch')).toBe('No sets of that tyre were left.')
      expect(whatIfFailureCopy('timeout')).toBe("Couldn't run that plan.")
      expect(whatIfFailureCopy('TypeError: boom')).toBe("Couldn't run that plan.")
      expect(whatIfFailureCopy(undefined)).toBe("Couldn't run that plan.")
    })

    it('carries the runner reason on status failed', async () => {
      const m = manual(); setDebriefRunner(m.runner)
      useDebriefStore.getState().start(job(), 'r1')
      await vi.waitFor(() => expect(useDebriefStore.getState().status).toBe('done'))
      useDebriefStore.getState().runWhatIf(EDIT)
      m.whatIfs[0]!.on.failed('RangeError: whatIf: no H sets left at the branch')
      expect(useDebriefStore.getState().whatIf.status).toBe('failed')
      expect(useDebriefStore.getState().whatIf.reason).toBe('RangeError: whatIf: no H sets left at the branch')
    })

    it('a timeout carries the reason timeout', async () => {
      vi.useFakeTimers()
      try {
        const m = manual(); setDebriefRunner(m.runner)
        useDebriefStore.getState().start(job(), 'r1')
        await vi.advanceTimersByTimeAsync(1)
        expect(useDebriefStore.getState().status).toBe('done')
        useDebriefStore.getState().runWhatIf(EDIT)
        await vi.advanceTimersByTimeAsync(job().config.tuning.debrief.timeoutMs + 1)
        expect(useDebriefStore.getState().whatIf.status).toBe('failed')
        expect(whatIfFailureCopy(useDebriefStore.getState().whatIf.reason)).toBe("Couldn't run that plan.")
      } finally { vi.useRealTimers() }
    })

    it('a real impossible edit in process reads as impossible', async () => {
      setDebriefRunner(inProcessRunner)
      useDebriefStore.getState().start(job(), 'r1')
      await vi.waitFor(() => expect(useDebriefStore.getState().status).toBe('done'), { timeout: 30000 })
      useDebriefStore.getState().runWhatIf({ ...EDIT, stop: 9 })
      await vi.waitFor(() => expect(useDebriefStore.getState().whatIf.status).toBe('failed'), { timeout: 30000 })
      expect(whatIfFailureCopy(useDebriefStore.getState().whatIf.reason)).toBe("That change isn't possible in this race.")
    }, 60_000)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDebriefStore, setDebriefRunner } from '@state/debriefStore'
import { inProcessRunner, type DebriefRunner } from '@state/debriefRunner'
import { buildRaceConfig } from '@state/buildRaceConfig'
import type { LapHistory } from '@engine/raceHistory'
import type { DebriefResult } from '@engine/types'

// Ruling P14: the judge is stubbed so this file never waits on real judging.
// The stub records whether the history had already reached the store.
const judged = vi.hoisted(() => ({ historyFirst: null as boolean | null }))
vi.mock('@engine/debrief', async (importOriginal) => {
  const real = await importOriginal<typeof import('@engine/debrief')>()
  return {
    ...real,
    judgeCalls: (): DebriefResult => {
      judged.historyFirst = useDebriefStore.getState().history !== null
      return { futures: 0, finish: 1, verdicts: [], retired: null }
    },
  }
})

const job = () => ({
  config: buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie',
    { startCompound: 'M', plannedStops: [{ lap: 24, compound: 'H' }] }, null, undefined, true),
  seed: 4242, calls: [],
})

function manualRunner() {
  const live: { on: Parameters<DebriefRunner['start']>[1] }[] = []
  const runner: DebriefRunner = { start(_job, on) { live.push({ on }); return { cancel: () => {} } } }
  return { runner, live }
}
const fake = (totalLaps: number): LapHistory => ({ totalLaps, lapsRun: totalLaps, cars: [], neutralisations: [] })

beforeEach(() => { useDebriefStore.getState().cancel(); judged.historyFirst = null })

describe('the debrief carries the lap history', () => {
  it('the in-process runner delivers the history before judging starts', async () => {
    setDebriefRunner(inProcessRunner)
    useDebriefStore.getState().start(job(), 'race-a')
    await vi.waitFor(() => expect(useDebriefStore.getState().history).not.toBeNull(), { timeout: 15000 })
    expect(useDebriefStore.getState().history!.totalLaps).toBe(56)
    expect(useDebriefStore.getState().history!.cars).toHaveLength(20)
    await vi.waitFor(() => expect(useDebriefStore.getState().status).toBe('done'), { timeout: 5000 })
    expect(judged.historyFirst).toBe(true)
  }, 20_000)

  it('ignores a history from a race the player has left', () => {
    const { runner, live } = manualRunner()
    setDebriefRunner(runner)
    useDebriefStore.getState().start(job(), 'race-a')
    useDebriefStore.getState().start(job(), 'race-b')
    live[0]!.on.history(fake(1))
    expect(useDebriefStore.getState().history).toBeNull()
    live[1]!.on.history(fake(2))
    expect(useDebriefStore.getState().history?.totalLaps).toBe(2)
  })

  it('keeps the chart when the judging fails, and clears it on cancel', () => {
    const { runner, live } = manualRunner()
    setDebriefRunner(runner)
    useDebriefStore.getState().start(job(), 'race-a')
    live[0]!.on.history(fake(3))
    live[0]!.on.failed('timeout')
    expect(useDebriefStore.getState().status).toBe('failed')
    expect(useDebriefStore.getState().history?.totalLaps).toBe(3)
    useDebriefStore.getState().cancel()
    expect(useDebriefStore.getState().history).toBeNull()
  })
})

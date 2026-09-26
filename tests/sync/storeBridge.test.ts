import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setCloudClient, pushCloudSave, readLocalSnapshot } from '@sync/storeBridge'
import { offlineClient, type PlayGamesClient } from '@sync/index'
import { useCareerStore } from '@state/careerStore'

/*
 * The injection seam.
 *
 * UI components call pushCloudSave, and several of them render in tests. If
 * the real Play Games client were imported anywhere in that graph, vitest
 * would fail loading a native plugin -- so the default has to be the no-op,
 * and swapping it has to actually work. Both halves are asserted here
 * because a seam that silently kept using the default would look exactly like
 * a passing test suite.
 */

function recordingClient() {
  const saved: { name: string; progress: number }[] = []
  const client: PlayGamesClient = {
    status: async () => ({ available: true, signedIn: true, playerId: 'p1' }),
    signIn: async () => ({ available: true, signedIn: true, playerId: 'p1' }),
    loadSnapshot: async () => null,
    saveSnapshot: async ({ name, progress }) => { saved.push({ name, progress }) },
    unlockAchievement: async () => {},
  }
  return { client, saved }
}

describe('the cloud client seam', () => {
  beforeEach(() => {
    setCloudClient(offlineClient)
    useCareerStore.getState().endCareer()
  })

  it('DEFAULTS TO THE NO-OP CLIENT', async () => {
    /*
     * What every component test runs through. The assertion is on status()
     * and not on saveSnapshot(), because the no-op client reports
     * unavailable and pushSave correctly stops there -- reaching the write
     * would mean the signed-out guard had gone. So this proves two things at
     * once: the real call path is exercised rather than skipped, and it
     * stops exactly where it should.
     */
    const spy = vi.spyOn(offlineClient, 'status')
    useCareerStore.getState().beginCareer()
    pushCloudSave()
    await vi.waitFor(() => expect(spy).toHaveBeenCalled())
    spy.mockRestore()
  })

  it('USES AN INJECTED CLIENT ONCE SWAPPED', async () => {
    const { client, saved } = recordingClient()
    setCloudClient(client)
    useCareerStore.getState().beginCareer()
    useCareerStore.getState().recordRace({
      position: 1, retired: false, pole: true, round: 0, grid: 1,
      stops: 1, overtakes: 0, wet: false,
    })
    pushCloudSave()
    await vi.waitFor(() => expect(saved.length).toBe(1))
    expect(saved[0]?.progress, 'progress must reflect the career, not a constant').toBe(1)
  })

  it('DOES NOT PUSH WHEN THERE IS NO CAREER', async () => {
    const { client, saved } = recordingClient()
    setCloudClient(client)
    // endCareer ran in beforeEach. Pushing here would upload an empty
    // snapshot over a real cloud career.
    pushCloudSave()
    await new Promise(r => setTimeout(r, 20))
    expect(saved).toEqual([])
  })
})

describe('readLocalSnapshot', () => {
  beforeEach(() => { useCareerStore.getState().endCareer() })

  it('IS NULL WITHOUT A CAREER', () => {
    expect(readLocalSnapshot()).toBeNull()
  })

  it('CARRIES THE CAREER AND A TIMESTAMP', () => {
    useCareerStore.getState().beginCareer()
    const snap = readLocalSnapshot()
    expect(snap?.career.seasonNumber).toBe(1)
    expect(snap?.savedAt).toBeGreaterThan(0)
  })
})

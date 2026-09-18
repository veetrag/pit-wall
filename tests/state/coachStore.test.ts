import { describe, it, expect, beforeEach } from 'vitest'
import { useCoachStore } from '@state/coachStore'

describe('coachStore', () => {
  beforeEach(() => {
    useCoachStore.setState({ active: null, done: {} })
  })

  it('request sets active', () => {
    useCoachStore.getState().request('tyre_cliff')
    expect(useCoachStore.getState().active).toBe('tyre_cliff')
  })

  it('a second request for a different id while one is active does nothing', () => {
    useCoachStore.getState().request('tyre_cliff')
    useCoachStore.getState().request('projection')
    expect(useCoachStore.getState().active).toBe('tyre_cliff')
  })

  it('dismiss clears active and marks done', () => {
    useCoachStore.getState().request('tyre_cliff')
    useCoachStore.getState().dismiss('tyre_cliff')
    expect(useCoachStore.getState().active).toBeNull()
    expect(useCoachStore.getState().done.tyre_cliff).toBe(true)
  })

  it('request after dismiss does not re-raise', () => {
    useCoachStore.getState().request('tyre_cliff')
    useCoachStore.getState().dismiss('tyre_cliff')
    useCoachStore.getState().request('tyre_cliff')
    expect(useCoachStore.getState().active).toBeNull()
  })

  it('reset clears both active and done', () => {
    useCoachStore.getState().request('tyre_cliff')
    useCoachStore.getState().dismiss('tyre_cliff')
    useCoachStore.getState().reset()
    expect(useCoachStore.getState().active).toBeNull()
    expect(useCoachStore.getState().done).toEqual({})
  })
})

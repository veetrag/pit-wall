import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSafetyCar, useSafetyCarDeployCount } from '@hooks/useSafetyCar'
import type { IncidentEvent, RaceState, SafetyCarState } from '@engine/types'

function incident(kind: IncidentEvent['kind']): IncidentEvent {
  return { lap: 3, sector: 0, kind, driverId: null, timeLoss: null }
}

/** Only the two fields these hooks read; cast because a full RaceState is 20 cars of noise. */
function setRaceState(safetyCar: SafetyCarState | null, incidents: IncidentEvent[]) {
  useRaceStore.setState({ raceState: { safetyCar, incidents } as unknown as RaceState })
}

describe('useSafetyCar', () => {
  beforeEach(() => { useRaceStore.setState({ raceState: null }) })

  it('is null with no race and with no safety car', () => {
    const { result, rerender } = renderHook(() => useSafetyCar())
    expect(result.current).toBeNull()
    act(() => { setRaceState(null, []) })
    rerender()
    expect(result.current).toBeNull()
  })

  it('returns the active safety car state', () => {
    const sc: SafetyCarState = { deployedLap: 12, lapsRemaining: 4, cause: 'crash' }
    const { result, rerender } = renderHook(() => useSafetyCar())
    act(() => { setRaceState(sc, [incident('safety_car_deployed')]) })
    rerender()
    expect(result.current).toEqual(sc)
  })
})

describe('useSafetyCarDeployCount', () => {
  beforeEach(() => { useRaceStore.setState({ raceState: null }) })

  it('counts deployments from the incident log, not the live state', () => {
    /*
     * Derived from the log rather than tracked as a local edge, and this test is
     * why. A consumer that watched `safetyCar !== null` for a rising edge would
     * miss a second deployment if it happened to be sampled while the flag was
     * already up, and React 19 may batch two ticks into one render. The log is
     * append-only, so the count is monotonic and cannot be missed.
     */
    const { result, rerender } = renderHook(() => useSafetyCarDeployCount())
    expect(result.current).toBe(0)

    act(() => { setRaceState({ deployedLap: 5, lapsRemaining: 3, cause: 'crash' }, [incident('safety_car_deployed')]) })
    rerender()
    expect(result.current).toBe(1)

    // Ended, then a second deployment -- both log entries present at once.
    act(() => {
      setRaceState({ deployedLap: 30, lapsRemaining: 4, cause: 'mechanical' }, [
        incident('safety_car_deployed'), incident('safety_car_ended'), incident('safety_car_deployed'),
      ])
    })
    rerender()
    expect(result.current, 'safety_car_ended must not be counted').toBe(2)
  })

  it('does not count driver errors or crashes', () => {
    const { result, rerender } = renderHook(() => useSafetyCarDeployCount())
    act(() => { setRaceState(null, [incident('driver_error'), incident('crash')]) })
    rerender()
    expect(result.current).toBe(0)
  })
})

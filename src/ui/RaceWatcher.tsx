import { useEffect, useRef } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSeasonStore } from '@state/seasonStore'
import { useClockStore } from '@state/clockStore'

export function RaceWatcher() {
  const racePhase = useRaceStore(s => s.phase)
  const raceState = useRaceStore(s => s.raceState)
  const resetRace = useRaceStore(s => s.resetRace)
  const startSeasonRace = useRaceStore(s => s.startSeasonRace)
  const seasonPhase = useSeasonStore(s => s.phase)
  const playerDriverId = useSeasonStore(s => s.playerDriverId)
  const currentSeed = useSeasonStore(s => s.currentSeed)
  const currentCircuitId = useSeasonStore(s => s.currentCircuitId)
  const recordRaceResult = useSeasonStore(s => s.recordRaceResult)
  const setSpeed = useClockStore(s => s.setSpeed)

  const hasFiredRef = useRef(false)

  // When season transitions to 'racing' and raceStore is idle, kick off the race
  useEffect(() => {
    if (seasonPhase === 'racing' && racePhase === 'idle' && playerDriverId) {
      hasFiredRef.current = false
      startSeasonRace(playerDriverId, currentSeed(), currentCircuitId())
    }
  }, [seasonPhase, racePhase, playerDriverId]) // eslint-disable-line react-hooks/exhaustive-deps

  // When race finishes, record result and transition to result screen
  useEffect(() => {
    if (racePhase === 'finished' && raceState && !hasFiredRef.current) {
      hasFiredRef.current = true
      setSpeed(0)
      const positions = [...raceState.cars]
        .sort((a, b) => a.position - b.position)
        .map(car => ({ driverId: car.driverId, position: car.position }))
      recordRaceResult(positions)
      setTimeout(() => resetRace(), 1500)
    }
  }, [racePhase]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

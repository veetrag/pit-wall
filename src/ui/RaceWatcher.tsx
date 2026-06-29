import { useEffect, useRef } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSeasonStore } from '@state/seasonStore'
import { useClockStore } from '@state/clockStore'
import type { RaceEventSummary } from '@state/seasonStore'

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

  useEffect(() => {
    if (seasonPhase === 'racing' && racePhase === 'idle' && playerDriverId) {
      hasFiredRef.current = false
      startSeasonRace(playerDriverId, currentSeed(), currentCircuitId())
    }
  }, [seasonPhase, racePhase, playerDriverId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (racePhase === 'finished' && raceState && !hasFiredRef.current) {
      hasFiredRef.current = true
      setSpeed(0)
      const sorted = [...raceState.cars].sort((a, b) => a.position - b.position)
      const positions = sorted.map(car => ({ driverId: car.driverId, position: car.position }))
      const player = raceState.cars.find(c => c.isPlayer)
      const events: RaceEventSummary = {
        overtakesGained: raceState.overtakeEvents.filter(e => e.overtakerId === player?.driverId).length,
        pitsDone: player?.pitsDone ?? 0,
        hadRain: raceState.weatherTimeline.some(w => w !== 'DRY'),
      }
      recordRaceResult(positions, events)
      setTimeout(() => resetRace(), 1500)
    }
  }, [racePhase]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

import { useEffect, useRef } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSeasonStore } from '@state/seasonStore'
import { useClockStore } from '@state/clockStore'
import { useSettingsStore } from '@state/settingsStore'
import { useScenarioStore } from '@state/scenarioStore'
import { goalMet } from '@engine/scenario'
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
  const playerStrategy = useSeasonStore(s => s.playerStrategy)
  // The overlay is injected into raceStore from here rather than read inside it:
  // raceStore must not import seasonStore as a value (ESM cycle). This component
  // already subscribes to both stores, so it is the natural seam.
  const purchasedTiers = useSeasonStore(s => s.purchasedTiers)
  const rivalDevelopment = useSeasonStore(s => s.rivalDevelopment)
  const setSpeed = useClockStore(s => s.setSpeed)
  const difficulty = useSettingsStore(s => s.difficulty)
  const startScenarioRace = useRaceStore(s => s.startScenarioRace)
  const activeScenario = useScenarioStore(s => s.active)
  const recordScenarioOutcome = useScenarioStore(s => s.recordOutcome)
  const toScenarioResult = useSeasonStore(s => s.toScenarioResult)

  const hasFiredRef = useRef(false)
  const scenarioFiredRef = useRef(false)
  const scenarioResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (scenarioResetRef.current !== null) clearTimeout(scenarioResetRef.current)
  }, [])

  useEffect(() => {
    if (seasonPhase === 'racing' && racePhase === 'idle' && playerDriverId) {
      hasFiredRef.current = false
      startSeasonRace(playerDriverId, currentSeed(), currentCircuitId(), difficulty, playerStrategy, { purchasedTiers, rivalDevelopment })
    }
  }, [seasonPhase, racePhase, playerDriverId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // The seasonPhase guard is NOT redundant with hasFiredRef.
    //
    // hasFiredRef starts false and is only reset by the SEASON start effect, so
    // a scenario played on a freshly launched app reaches the flag with it
    // still false. Without this guard that wrote 20 championship standings
    // entries and a race of development points out of a scenario, and set phase
    // 'result', stealing the player away from their scenario result screen.
    // Covered by tests/ui/scenarioWatcher.test.tsx.
    if (seasonPhase !== 'racing') return
    if (racePhase === 'finished' && raceState && !hasFiredRef.current) {
      hasFiredRef.current = true
      setSpeed(0)
      const sorted = [...raceState.cars].sort((a, b) => a.position - b.position)
      const positions = sorted.map(car => ({ driverId: car.driverId, position: car.position, retired: car.retired, retiredCause: car.retiredCause }))
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

  useEffect(() => {
    if (seasonPhase === 'scenario_racing' && racePhase === 'idle' && activeScenario) {
      scenarioFiredRef.current = false
      startScenarioRace(activeScenario)
      /*
       * Scenarios have to start their own clock.
       *
       * clockStore initialises at speed 0 and StartLights -- the only thing in
       * the app that ever sets it to 1 -- renders exclusively during the
       * 'starting' phase, which a mid-race takeover deliberately skips. Without
       * this the scenario opened fully rendered and frozen, and the player had
       * to find the speed control to start their own race. It recurs on every
       * retry, because the finish handler below sets the speed back to 0.
       */
      setSpeed(1)
    }
  }, [seasonPhase, racePhase, activeScenario]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (seasonPhase !== 'scenario_racing') return
    if (racePhase !== 'finished' || !raceState || scenarioFiredRef.current) return
    scenarioFiredRef.current = true
    setSpeed(0)
    const spec = activeScenario
    if (!spec) return
    const car = raceState.cars.find(c => c.driverId === spec.playerDriverId)
    recordScenarioOutcome({
      met: goalMet(raceState, spec.playerDriverId, spec.goal),
      position: car?.position ?? 0,
      retired: car?.retired ?? false,
    })
    toScenarioResult()
    /*
     * Tracked and cleared on unmount: TRY AGAIN is live the instant the result
     * screen appears, and it restarts the race itself. An orphaned timeout
     * firing 1.5s later would reset a race the player had already resumed,
     * which the start effect above then restarts from the handover lap --
     * silently discarding ~1.3s of the retry.
     */
    if (scenarioResetRef.current !== null) clearTimeout(scenarioResetRef.current)
    scenarioResetRef.current = setTimeout(() => { scenarioResetRef.current = null; resetRace() }, 1500)
  }, [racePhase, seasonPhase]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

import { create } from 'zustand'
import { loadGameData } from '@data/validators'
import {
  initRace, stepSector, projectPitNow,
  type RaceConfig, type RaceState, type Compound, type PaceMode, type ProjectionResult,
} from '@engine/index'
import { createRng, type Rng } from '@engine/rng'
import type { AlertMessage } from '../ui/HudAlert'

export type RacePhase = 'idle' | 'starting' | 'racing' | 'finished'

interface RaceStore {
  phase: RacePhase
  config: RaceConfig | null
  raceState: RaceState | null
  projectionResult: ProjectionResult | null
  pitPanelOpen: boolean
  playerInPit: boolean
  pitEndTime: number
  rng: Rng | null
  hudAlerts: AlertMessage[]

  startRace: () => void
  startSeasonRace: (playerDriverId: string, seed: number, circuitId?: string) => void
  initForStartSequence: () => void
  confirmRaceStart: () => void
  resetRace: () => void
  step: () => void
  pitNow: (compound: Compound) => void
  setPaceMode: (mode: PaceMode) => void
  openPitPanel: () => void
  closePitPanel: () => void
  updateProjection: (compound: Compound) => void
  pushAlert: (alert: Omit<AlertMessage, 'id'>) => void
  dismissAlert: (id: string) => void
}

export const CIRCUIT_ORDER = [
  'bengaluru', 'veloce', 'sol_desert', 'highland',
  'monsoon_bay', 'grand_savane', 'aurora', 'harbour_lights',
] as const

function buildConfig(seed: number, playerDriverId: string, circuitId = 'bengaluru'): RaceConfig {
  const data = loadGameData()
  const circuit = data.circuits[circuitId] ?? data.circuits['bengaluru']!
  const laps = circuit.laps
  // Scale planned pit laps proportionally to this circuit (reference: 30 laps)
  const strategies = data.strategies.defaults.map(s => ({
    ...s,
    plannedStops: s.plannedStops.map(stop => ({
      ...stop,
      lap: Math.round((stop.lap / 30) * laps),
    })),
  }))
  return {
    circuit,
    tuning: data.tuning,
    compounds: data.compounds,
    drivers: data.drivers.drivers,
    teams: data.cars.teams,
    strategies,
    playerDriverId,
    seed,
  }
}

let alertCounter = 0

export const useRaceStore = create<RaceStore>((set, get) => ({
  phase: 'idle',
  config: null,
  raceState: null,
  projectionResult: null,
  pitPanelOpen: false,
  playerInPit: false,
  pitEndTime: 0,
  rng: null,
  hudAlerts: [],

  startRace() {
    const seed = 42
    const config = buildConfig(seed, 'd_voss')
    const raceState = initRace(config)
    const rng = createRng(seed)
    set({ phase: 'racing', config, raceState, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, pitEndTime: 0 })
  },

  startSeasonRace(playerDriverId, seed, circuitId) {
    const config = buildConfig(seed, playerDriverId, circuitId)
    const raceState = initRace(config)
    const rng = createRng(seed)
    set({ phase: 'starting', config, raceState, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, pitEndTime: 0 })
  },

  initForStartSequence() {
    const seed = 42
    const config = buildConfig(seed, 'd_voss')
    const raceState = initRace(config)
    const rng = createRng(seed)
    set({ phase: 'starting', config, raceState, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, pitEndTime: 0 })
  },

  confirmRaceStart() {
    set({ phase: 'racing' })
  },

  resetRace() {
    set({ phase: 'idle', config: null, raceState: null, rng: null, projectionResult: null, pitPanelOpen: false, playerInPit: false, pitEndTime: 0, hudAlerts: [] })
  },

  step() {
    const { phase, config, raceState, rng, playerInPit, pitEndTime } = get()
    if (phase !== 'racing' || !config || !raceState || !rng) return

    const nextState = stepSector(config, raceState, rng)
    const finished = nextState.lap >= nextState.totalLaps && nextState.sector === 0

    const playerNow = nextState.cars.find(c => c.isPlayer)?.raceTime ?? 0
    const stillInPit = playerInPit && playerNow < pitEndTime + config.tuning.pit.laneTimeLoss

    set({ raceState: nextState, phase: finished ? 'finished' : 'racing', playerInPit: stillInPit })
  },

  pitNow(compound: Compound) {
    const { config, raceState, rng } = get()
    if (!config || !raceState || !rng) return
    const { laneTimeLoss, stopMean, stopSigma } = config.tuning.pit
    const stopTime = laneTimeLoss + stopMean + (rng() - 0.5) * 2 * stopSigma

    const updatedCars = raceState.cars.map(car => {
      if (!car.isPlayer) return car
      return { ...car, raceTime: car.raceTime + stopTime, compound, tyreAge: 0, pitsDone: car.pitsDone + 1 }
    })
    const playerTime = updatedCars.find(c => c.isPlayer)?.raceTime ?? 0
    set({
      raceState: { ...raceState, cars: updatedCars },
      pitPanelOpen: false,
      playerInPit: true,
      pitEndTime: playerTime,
    })
  },

  setPaceMode(mode: PaceMode) {
    const { raceState } = get()
    if (!raceState) return
    const updatedCars = raceState.cars.map(car => car.isPlayer ? { ...car, paceMode: mode } : car)
    set({ raceState: { ...raceState, cars: updatedCars } })
  },

  openPitPanel() { set({ pitPanelOpen: true }) },
  closePitPanel() { set({ pitPanelOpen: false, projectionResult: null }) },

  pushAlert(alert) {
    const id = `alert-${++alertCounter}`
    set(s => ({ hudAlerts: [...s.hudAlerts, { ...alert, id }] }))
  },

  dismissAlert(id) {
    set(s => ({ hudAlerts: s.hudAlerts.filter(a => a.id !== id) }))
  },

  updateProjection(compound: Compound) {
    const { config, raceState } = get()
    if (!config || !raceState) return
    const result = projectPitNow(config, raceState, compound, Date.now() % 100000)
    set({ projectionResult: result })
  },
}))

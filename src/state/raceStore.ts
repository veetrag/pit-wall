import { create } from 'zustand'
import { loadGameData } from '@data/validators'
import {
  initRace, stepSector, projectPitNow,
  type RaceConfig, type RaceState, type Compound, type PaceMode, type ProjectionResult,
} from '@engine/index'
import { createRng, type Rng } from '@engine/rng'

export type RacePhase = 'idle' | 'racing' | 'finished'

interface RaceStore {
  phase: RacePhase
  config: RaceConfig | null
  raceState: RaceState | null
  projectionResult: ProjectionResult | null
  pitPanelOpen: boolean
  rng: Rng | null

  startRace: () => void
  step: () => void
  pitNow: (compound: Compound) => void
  setPaceMode: (mode: PaceMode) => void
  openPitPanel: () => void
  closePitPanel: () => void
  updateProjection: (compound: Compound) => void
}

function buildConfig(seed: number): RaceConfig {
  const data = loadGameData()
  const circuit = data.circuits['silverpark']!
  return {
    circuit,
    tuning: data.tuning,
    compounds: data.compounds,
    drivers: data.drivers.drivers,
    teams: data.cars.teams,
    strategies: data.strategies.defaults,
    playerDriverId: 'd_ver',
    seed,
  }
}

export const useRaceStore = create<RaceStore>((set, get) => ({
  phase: 'idle',
  config: null,
  raceState: null,
  projectionResult: null,
  pitPanelOpen: false,
  rng: null,

  startRace() {
    const seed = 42
    const config = buildConfig(seed)
    const raceState = initRace(config)
    const rng = createRng(seed)
    set({ phase: 'racing', config, raceState, rng, projectionResult: null, pitPanelOpen: false })
  },

  step() {
    const { phase, config, raceState, rng } = get()
    if (phase !== 'racing' || !config || !raceState || !rng) return

    const nextState = stepSector(config, raceState, rng)
    const finished = nextState.lap >= nextState.totalLaps && nextState.sector === 0

    set({ raceState: nextState, phase: finished ? 'finished' : 'racing' })
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
    set({ raceState: { ...raceState, cars: updatedCars }, pitPanelOpen: false })
  },

  setPaceMode(mode: PaceMode) {
    const { raceState } = get()
    if (!raceState) return
    const updatedCars = raceState.cars.map(car => car.isPlayer ? { ...car, paceMode: mode } : car)
    set({ raceState: { ...raceState, cars: updatedCars } })
  },

  openPitPanel() { set({ pitPanelOpen: true }) },
  closePitPanel() { set({ pitPanelOpen: false, projectionResult: null }) },

  updateProjection(compound: Compound) {
    const { config, raceState } = get()
    if (!config || !raceState) return
    const result = projectPitNow(config, raceState, compound, Date.now() % 100000)
    set({ projectionResult: result })
  },
}))

import { create } from 'zustand'
import { loadGameData } from '@data/validators'
import {
  initRace, stepSector, projectPitNow, resolveAllocatedCompound, consumeTyreSet,
  type RaceConfig, type RaceState, type Compound, type PaceMode, type ProjectionResult, type StrategyBrain,
} from '@engine/index'
import { createRng, type Rng } from '@engine/rng'
import type { AlertMessage } from '../ui/HudAlert'
import { processRadioTick, makeRadioState, type RadioState } from './radioMapper'
import type { Difficulty } from './settingsStore'
import type { PlayerStrategyChoice } from './seasonStore'

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
  radioState: RadioState

  startRace: () => void
  startSeasonRace: (playerDriverId: string, seed: number, circuitId?: string, difficulty?: Difficulty, playerStrategy?: PlayerStrategyChoice | null) => void
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

function applyBrain(baseBrain: StrategyBrain, difficulty: Difficulty): StrategyBrain {
  if (difficulty === 'pro') {
    if (baseBrain === 'naive') return 'smart'
    if (baseBrain === 'smart') return 'optimal'
    return 'optimal'
  }
  // rookie: cap at smart
  return baseBrain === 'optimal' ? 'smart' : baseBrain
}

function buildConfig(
  seed: number,
  playerDriverId: string,
  circuitId = 'bengaluru',
  difficulty: Difficulty = 'rookie',
  playerStrategy?: PlayerStrategyChoice | null,
): RaceConfig {
  const data = loadGameData()
  const circuit = data.circuits[circuitId] ?? data.circuits['bengaluru']!
  const laps = circuit.laps
  // Scale planned pit laps proportionally to this circuit (reference: 30 laps)
  const strategies = data.strategies.defaults.map(s => ({
    ...s,
    brain: applyBrain((s.brain ?? 'naive') as StrategyBrain, difficulty),
    plannedStops: s.plannedStops.map(stop => ({
      ...stop,
      lap: Math.round((stop.lap / 30) * laps),
    })),
  }))

  const playerTeamId = data.drivers.drivers.find(d => d.id === playerDriverId)?.teamId ?? ''
  const playerStrategyOverride = playerStrategy
    ? { teamId: playerTeamId, startCompound: playerStrategy.startCompound, plannedStops: playerStrategy.plannedStops }
    : undefined

  return {
    circuit,
    tuning: data.tuning,
    compounds: data.compounds,
    drivers: data.drivers.drivers,
    teams: data.cars.teams,
    strategies,
    playerDriverId,
    seed,
    playerStrategyOverride,
    tyreAllocationBase: data.tuning.tyreRules.allocation[difficulty],
    mandatoryTwoCompound: data.tuning.tyreRules.mandatoryTwoCompound[difficulty],
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
  radioState: makeRadioState(),

  startRace() {
    const seed = 42
    const config = buildConfig(seed, 'd_voss')
    const raceState = initRace(config)
    const rng = createRng(seed)
    set({ phase: 'racing', config, raceState, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, pitEndTime: 0 })
  },

  startSeasonRace(playerDriverId, seed, circuitId, difficulty, playerStrategy) {
    const config = buildConfig(seed, playerDriverId, circuitId, difficulty, playerStrategy)
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
    set({ phase: 'idle', config: null, raceState: null, rng: null, projectionResult: null, pitPanelOpen: false, playerInPit: false, pitEndTime: 0, hudAlerts: [], radioState: makeRadioState() })
  },

  step() {
    const { phase, config, raceState, rng, playerInPit, pitEndTime, radioState } = get()
    if (phase !== 'racing' || !config || !raceState || !rng) return

    const nextState = stepSector(config, raceState, rng)
    const finished = nextState.lap >= nextState.totalLaps && nextState.sector === 0

    const playerNow = nextState.cars.find(c => c.isPlayer)?.raceTime ?? 0
    const stillInPit = playerInPit && playerNow < pitEndTime + config.tuning.pit.laneTimeLoss

    const nextRadio = processRadioTick(nextState, config, radioState, (msg, severity) => {
      const id = `alert-${++alertCounter}`
      set(s => ({ hudAlerts: [...s.hudAlerts, { id, severity, category: 'RADIO', message: msg, icon: '📻' }] }))
    })

    set({ raceState: nextState, phase: finished ? 'finished' : 'racing', playerInPit: stillInPit, radioState: nextRadio })
  },

  pitNow(compound: Compound) {
    const { config, raceState, rng } = get()
    if (!config || !raceState || !rng) return
    const player = raceState.cars.find(c => c.isPlayer)
    if (!player) return

    const resolved = resolveAllocatedCompound(compound, player.tyreAllocation)
    if (!resolved) {
      const id = `alert-${++alertCounter}`
      set(s => ({
        pitPanelOpen: false,
        hudAlerts: [...s.hudAlerts, { id, severity: 'urgent' as const, category: 'RADIO', message: 'No tyres left of any type. Staying out.', icon: '⚠️' }],
      }))
      return
    }

    const { laneTimeLoss, stopMean, stopSigma } = config.tuning.pit
    const stopTime = laneTimeLoss + stopMean + (rng() - 0.5) * 2 * stopSigma

    const updatedCars = raceState.cars.map(car => {
      if (!car.isPlayer) return car
      return {
        ...car,
        raceTime: car.raceTime + stopTime,
        compound: resolved,
        tyreAge: 0,
        pitsDone: car.pitsDone + 1,
        tyreAllocation: consumeTyreSet(car.tyreAllocation, resolved),
        compoundsUsed: [...car.compoundsUsed, resolved],
      }
    })
    const playerTime = updatedCars.find(c => c.isPlayer)?.raceTime ?? 0
    const id = `alert-${++alertCounter}`
    set(s => ({
      raceState: { ...raceState, cars: updatedCars },
      pitPanelOpen: false,
      playerInPit: true,
      pitEndTime: playerTime,
      hudAlerts: [...s.hudAlerts, { id, severity: 'caution' as const, category: 'RADIO', message: 'Box box box. Come in now.', icon: '📻' }],
    }))
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

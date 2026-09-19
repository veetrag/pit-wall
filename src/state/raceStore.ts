import { create } from 'zustand'
import {
  initRace, stepSector, projectPitNow, resolveAllocatedCompound, consumeTyreSet,
  effectivePitLaneLoss,
  type RaceConfig, type RaceState, type Compound, type PaceMode, type ProjectionResult,
} from '@engine/index'
import { createRng, type Rng } from '@engine/rng'
import type { AlertMessage } from '../ui/HudAlert'
import { processRadioTick, makeRadioState, type RadioState } from './radioMapper'
import type { Difficulty } from './settingsStore'
import type { PlayerStrategyChoice } from './seasonStore'
import type { UpgradeOverlayInput } from './upgradeOverlay'
import { buildRaceConfig, buildScenarioConfig } from './buildRaceConfig'
import { startScenario } from '@engine/scenario'

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
  startSeasonRace: (playerDriverId: string, seed: number, circuitId?: string, difficulty?: Difficulty, playerStrategy?: PlayerStrategyChoice | null, upgrades?: UpgradeOverlayInput | null, gridOrder?: string[], dryStart?: boolean) => void
  startScenarioRace: (spec: { circuitId: string; seed: number; playerDriverId: string; startLap: number }) => void
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
  // Wet-leaning rounds (rainProbability >= 0.35) sit on the odd rounds only, so
  // no two back-to-back rounds are both wet-leaning. See the adjacency test in
  // tests/data/calendar.test.ts.
  'bengaluru', 'veloce', 'silverpark', 'sol_desert',
  'highland', 'costa_verde', 'kaido', 'grand_savane',
  'monsoon_bay', 'altiplano', 'aurora', 'harbour_lights',
] as const

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
    const config = buildRaceConfig(seed, 'd_voss')
    const raceState = initRace(config)
    const rng = createRng(seed)
    set({ phase: 'racing', config, raceState, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, pitEndTime: 0 })
  },

  startSeasonRace(playerDriverId, seed, circuitId, difficulty, playerStrategy, upgrades, gridOrder, dryStart) {
    const config = buildRaceConfig(seed, playerDriverId, circuitId, difficulty, playerStrategy, upgrades, gridOrder, dryStart)
    const raceState = initRace(config)
    const rng = createRng(seed)
    set({ phase: 'starting', config, raceState, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, pitEndTime: 0 })
  },

  /**
   * Enters a race already in progress.
   *
   * Goes straight to 'racing', not 'starting': there are no start lights
   * halfway through a grand prix. The rng comes from startScenario and MUST be
   * the one stored -- it carries the draw sequence forward from the handover,
   * and a fresh one would fork the race off the branch the scenario was
   * authored on. See src/engine/scenario.ts.
   */
  startScenarioRace(spec) {
    const config = buildScenarioConfig(spec)
    const { state, rng } = startScenario(config, spec.startLap)
    set({ phase: 'racing', config, raceState: state, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, pitEndTime: 0, hudAlerts: [], radioState: makeRadioState() })
  },

  initForStartSequence() {
    const seed = 42
    const config = buildRaceConfig(seed, 'd_voss')
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
    // Same effective loss the stop itself was charged, so a stop taken under
    // yellow is not held "in the pit lane" for the full green-flag duration.
    const stillInPit = playerInPit &&
      playerNow < pitEndTime + effectivePitLaneLoss(config.circuit, nextState.safetyCar, config.tuning)

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

    const { stopMean, stopSigma } = config.tuning.pit
    const stopTime = effectivePitLaneLoss(config.circuit, raceState.safetyCar, config.tuning) +
      stopMean + (rng() - 0.5) * 2 * stopSigma

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
    /*
     * Seeded from the RACE, not the clock.
     *
     * This was `Date.now() % 100000`, which meant the same race state produced
     * DIFFERENT advice every time the pit panel was opened. A player who closed
     * the panel to think and reopened it could be told something else, with
     * nothing in the race having changed -- on the single highest-stakes number
     * the game shows. It was also the last value in the game not reproducible
     * from a seed, which made the projection impossible to test or to reproduce
     * from a bug report.
     *
     * rngState is the live race RNG, so it is fully determined by the race seed
     * and advances every tick: the projection is stable at a given moment and
     * still moves as the race moves. Reading it does not consume it.
     *
     * The compound is deliberately NOT mixed in, so soft/medium/hard are
     * projected under identical luck and the only difference the player sees
     * between them is the tyre.
     */
    const result = projectPitNow(config, raceState, compound, raceState.rngState)
    set({ projectionResult: result })
  },
}))

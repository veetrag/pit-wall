import { create } from 'zustand'
import { loadGameData } from '@data/validators'
import {
  initRace, stepSector, projectPitNow, resolveAllocatedCompound, consumeTyreSet,
  type RaceConfig, type RaceState, type Compound, type PaceMode, type ProjectionResult,
  type StrategyBrain, type DifficultyProfile,
} from '@engine/index'
import { createRng, type Rng } from '@engine/rng'
import type { AlertMessage } from '../ui/HudAlert'
import { processRadioTick, makeRadioState, type RadioState } from './radioMapper'
import type { Difficulty } from './settingsStore'
import type { PlayerStrategyChoice } from './seasonStore'
import { applyUpgrades, type UpgradeOverlayInput } from './upgradeOverlay'

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
  startSeasonRace: (playerDriverId: string, seed: number, circuitId?: string, difficulty?: Difficulty, playerStrategy?: PlayerStrategyChoice | null, upgrades?: UpgradeOverlayInput | null) => void
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

const BRAIN_ORDER: StrategyBrain[] = ['naive', 'smart', 'optimal']

// M5: brain mix is now one profile lookup instead of a difficulty if/else —
// promote one step if the profile allows it, then cap at the profile's ceiling.
function applyBrainProfile(baseBrain: StrategyBrain, profile: DifficultyProfile): StrategyBrain {
  const baseIdx = BRAIN_ORDER.indexOf(baseBrain)
  const capIdx = BRAIN_ORDER.indexOf(profile.brainCap)
  const promotedIdx = profile.brainPromote ? Math.min(baseIdx + 1, BRAIN_ORDER.length - 1) : baseIdx
  return BRAIN_ORDER[Math.min(promotedIdx, capIdx)]!
}

function buildConfig(
  seed: number,
  playerDriverId: string,
  circuitId = 'bengaluru',
  difficulty: Difficulty = 'rookie',
  playerStrategy?: PlayerStrategyChoice | null,
  // Injected, not read from seasonStore: a value import of seasonStore here
  // would close a real ESM cycle (seasonStore imports CIRCUIT_ORDER from this
  // module as a value). buildConfig stays a pure function of its arguments.
  upgrades?: UpgradeOverlayInput | null,
): RaceConfig {
  const data = loadGameData()
  const circuit = data.circuits[circuitId] ?? data.circuits['bengaluru']!
  const laps = circuit.laps
  const profile = data.tuning.difficultyProfiles[difficulty]
  // Scale planned pit laps proportionally to this circuit (reference: 30 laps)
  const strategies = data.strategies.defaults.map(s => ({
    ...s,
    brain: applyBrainProfile((s.brain ?? 'naive') as StrategyBrain, profile),
    plannedStops: s.plannedStops.map(stop => ({
      ...stop,
      lap: Math.round((stop.lap / 30) * laps),
    })),
  }))

  // `playerTeam` is undefined when playerDriverId matches no driver. The `?? ''`
  // fallback below is pre-existing behaviour for playerStrategyOverride; the
  // overlay must NOT reuse it, see the guard at `overlayActive`.
  const playerTeam = data.drivers.drivers.find(d => d.id === playerDriverId)?.teamId
  const playerTeamId = playerTeam ?? ''
  const playerStrategyOverride = playerStrategy
    ? { teamId: playerTeamId, startCompound: playerStrategy.startCompound, plannedStops: playerStrategy.plannedStops }
    : undefined

  // Upgrades are applied here and nowhere else: the engine receives ordinary
  // facet numbers and never learns that progression exists (CLAUDE.md §3).
  //
  // Run unconditionally, even with no overlay, so `config` never aliases the
  // objects `loadGameData()` returned. That loader does not memoise today (it
  // re-parses every schema per call), so this is currently belt-and-braces —
  // but memoising it is an obvious optimisation, and this keeps that refactor
  // from silently leaking one race's upgrades into the next.
  //
  // If playerDriverId resolves to no team, apply NO overlay rather than an
  // inverted one: with playerTeamId falling back to '', `appliesTo` is false
  // for every team, so the player's purchases would be discarded *and* the
  // player's own team would take the rival-development branch — a bad id would
  // produce a loudly wrong grid instead of a harmless no-op.
  const overlayActive = playerTeam !== undefined
  const purchasedTiers = overlayActive ? upgrades?.purchasedTiers ?? {} : {}
  const rivalDevelopment = overlayActive ? upgrades?.rivalDevelopment ?? {} : {}
  const teams = applyUpgrades(data.cars.teams, {
    attributes: data.upgrades.attributes,
    purchasedTiers,
    target: 'team',
    // Car upgrades belong to the chassis, so the player's teammate gets them too.
    appliesTo: t => t.id === playerTeamId,
    rivalDevelopment,
  })
  const drivers = applyUpgrades(data.drivers.drivers, {
    attributes: data.upgrades.attributes,
    purchasedTiers,
    target: 'driver',
    // Driver upgrades are personal — the teammate does not get them.
    appliesTo: d => d.id === playerDriverId,
  })

  return {
    circuit,
    tuning: data.tuning,
    compounds: data.compounds,
    drivers,
    teams,
    strategies,
    playerDriverId,
    seed,
    playerStrategyOverride,
    tyreAllocationBase: data.tuning.tyreRules.allocation[difficulty],
    mandatoryTwoCompound: data.tuning.tyreRules.mandatoryTwoCompound[difficulty],
    coverReactionScale: profile.coverReactionScale,
    paceModeAggression: profile.aiPaceModeAggression,
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

  startSeasonRace(playerDriverId, seed, circuitId, difficulty, playerStrategy, upgrades) {
    const config = buildConfig(seed, playerDriverId, circuitId, difficulty, playerStrategy, upgrades)
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
    const stillInPit = playerInPit && playerNow < pitEndTime + config.circuit.pitLaneTimeLoss

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
    const stopTime = config.circuit.pitLaneTimeLoss + stopMean + (rng() - 0.5) * 2 * stopSigma

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

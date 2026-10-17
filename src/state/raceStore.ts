import { create } from 'zustand'
import {
  initRace, stepSector, projectPitNow, effectivePitLaneLoss,
  applyPlayerPit, applyPlayerPace, expectedPitStopTime, type PlayerCall,
  type RaceConfig, type RaceState, type Compound, type PaceMode, type ProjectionResult,
} from '@engine/index'
import { createRng, type Rng } from '@engine/rng'
import type { AlertMessage } from '../ui/HudAlert'
import { processRadioTick, makeRadioState, requestLine, type RadioState } from './radioMapper'
import { detectRadioRequest, makeRequestTracker, type RadioRequest, type RequestTracker } from './radioRequests'
import type { Difficulty } from './settingsStore'
import type { PlayerStrategyChoice } from './seasonStore'
import type { UpgradeOverlayInput } from './upgradeOverlay'
import { buildRaceConfig, buildScenarioConfig } from './buildRaceConfig'
import { startScenario } from '@engine/scenario'

export type RacePhase = 'idle' | 'starting' | 'racing' | 'finished'

/** A season race's format (spec 1.5 §3). Absent = a Grand Prix. */
export interface SeasonRaceOptions {
  sprint?: boolean
  /** The first career race: every lap dry (spec 1.6 §0.2). */
  allDry?: boolean
  /** The pace off the line. Logged as a step-0 call so replay and the debrief see it. */
  initialPace?: PaceMode
}

/** A driver radio request on screen (spec 1.6 §2). */
export type ActiveRadioRequest = RadioRequest & { id: number; line: string }

interface RaceStore {
  phase: RacePhase
  config: RaceConfig | null
  raceState: RaceState | null
  projectionResult: ProjectionResult | null
  pitPanelOpen: boolean
  playerInPit: boolean
  playerCalls: PlayerCall[]
  stepCount: number
  pitEndTime: number
  /**
   * The lane loss the player's current (or last) stop was CHARGED. Latched at
   * the stop rather than recomputed from the live safetyCar, because the
   * neutralisation can change mid-stop -- an SC superseding a VSC would
   * otherwise re-price a stop already made, and the pit timer would jump.
   */
  pitLaneLoss: number
  /**
   * What the player's most recent stop cost, and how much of it was a slow
   * stop (spec 1.6 §1). The PIT button's is exact (the raceTime delta of
   * applyPlayerPit); a plan stop's is the expected stop plus its exact slow
   * seconds -- the engine does not report the ±0.3 s noise (ruling R5).
   */
  lastStopTime: number
  lastStopSlow: number
  rng: Rng | null
  hudAlerts: AlertMessage[]
  radioState: RadioState
  /** The driver's pending yes/no question, if any. Never two at once. */
  radioRequest: ActiveRadioRequest | null
  requestTracker: RequestTracker
  /** YES runs the existing logged call (pitNow / setPaceMode); NO logs nothing. */
  answerRadioRequest: (yes: boolean) => void
  /** Expiry = NO. */
  dismissRadioRequest: () => void

  startRace: () => void
  startSeasonRace: (playerDriverId: string, seed: number, circuitId?: string, difficulty?: Difficulty, playerStrategy?: PlayerStrategyChoice | null, upgrades?: UpgradeOverlayInput | null, gridOrder?: string[], dryStart?: boolean, opts?: SeasonRaceOptions) => void
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
let requestCounter = 0

/**
 * The seed for a pit projection made at (lap, sector) of the race with this
 * seed. Pure, so the same moment of the same race always gets the same
 * advice, and every tick gets fresh dice.
 *
 * Integer-only mixing (mulberry-style finaliser over seed XOR tick * golden
 * ratio). Every step is a bijection on 32 bits, so two ticks of one race can
 * never share a seed.
 */
export function projectionSeed(raceSeed: number, lap: number, sector: number): number {
  const tick = lap * 3 + sector + 1
  let h = (raceSeed ^ Math.imul(tick, 0x9E3779B1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

export const useRaceStore = create<RaceStore>((set, get) => ({
  phase: 'idle',
  config: null,
  raceState: null,
  projectionResult: null,
  pitPanelOpen: false,
  playerInPit: false,
  playerCalls: [],
  stepCount: 0,
  pitEndTime: 0,
  pitLaneLoss: 0,
  lastStopTime: 0,
  lastStopSlow: 0,
  rng: null,
  hudAlerts: [],
  radioState: makeRadioState(),
  radioRequest: null,
  requestTracker: makeRequestTracker(),

  startRace() {
    const seed = 42
    const config = buildRaceConfig(seed, 'd_voss')
    const raceState = initRace(config)
    const rng = createRng(seed)
    set({ phase: 'racing', config, raceState, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, playerCalls: [], stepCount: 0, pitEndTime: 0, pitLaneLoss: 0, lastStopTime: 0, lastStopSlow: 0, radioState: makeRadioState(), radioRequest: null, requestTracker: makeRequestTracker() })
  },

  startSeasonRace(playerDriverId, seed, circuitId, difficulty, playerStrategy, upgrades, gridOrder, dryStart, opts) {
    const config = buildRaceConfig(seed, playerDriverId, circuitId, difficulty, playerStrategy, upgrades, gridOrder, dryStart, opts?.sprint ?? false, opts?.allDry ?? false)
    let raceState = initRace(config)
    const playerCalls: PlayerCall[] = []
    const pace = opts?.initialPace
    if (pace && pace !== 'neutral') {
      // Exactly what setPaceMode would do at step 0, so (config, seed, calls)
      // still reproduces the race (tests/engine/replayFidelity.test.ts).
      raceState = applyPlayerPace(raceState, pace)
      playerCalls.push({ step: 0, kind: 'pace', mode: pace })
    }
    const rng = createRng(seed)
    set({ phase: 'starting', config, raceState, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, playerCalls, stepCount: 0, pitEndTime: 0, pitLaneLoss: 0, lastStopTime: 0, lastStopSlow: 0, radioState: makeRadioState(), radioRequest: null, requestTracker: makeRequestTracker() })
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
    set({ phase: 'racing', config, raceState: state, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, playerCalls: [], stepCount: 0, pitEndTime: 0, pitLaneLoss: 0, lastStopTime: 0, lastStopSlow: 0, hudAlerts: [], radioState: makeRadioState(), radioRequest: null, requestTracker: makeRequestTracker() })
  },

  initForStartSequence() {
    const seed = 42
    const config = buildRaceConfig(seed, 'd_voss')
    const raceState = initRace(config)
    const rng = createRng(seed)
    set({ phase: 'starting', config, raceState, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, playerCalls: [], stepCount: 0, pitEndTime: 0, pitLaneLoss: 0, lastStopTime: 0, lastStopSlow: 0, radioState: makeRadioState(), radioRequest: null, requestTracker: makeRequestTracker() })
  },

  confirmRaceStart() {
    set({ phase: 'racing' })
  },

  resetRace() {
    set({ phase: 'idle', config: null, raceState: null, rng: null, projectionResult: null, pitPanelOpen: false, playerInPit: false, playerCalls: [], stepCount: 0, pitEndTime: 0, pitLaneLoss: 0, lastStopTime: 0, lastStopSlow: 0, hudAlerts: [], radioState: makeRadioState(), radioRequest: null, requestTracker: makeRequestTracker() })
  },

  step() {
    const { phase, config, raceState, rng, playerInPit, pitEndTime, radioState } = get()
    if (phase !== 'racing' || !config || !raceState || !rng) return

    const nextState = stepSector(config, raceState, rng)
    const finished = nextState.lap >= nextState.totalLaps && nextState.sector === 0

    const before = raceState.cars.find(c => c.isPlayer)
    const after = nextState.cars.find(c => c.isPlayer)
    const autoStopped = !!before && !!after && after.pitsDone > before.pitsDone

    const playerNow = after?.raceTime ?? 0
    // A plan stop executes inside stepSector at the lap boundary and is charged
    // with the post-tick neutralisation -- nextState.safetyCar.
    const autoLoss = effectivePitLaneLoss(config.circuit, nextState.safetyCar, config.tuning)
    // A plan stop's slow seconds, from the incident the engine logged this tick.
    const autoSlow = autoStopped && after
      ? nextState.incidents.slice(raceState.incidents.length)
          .find(i => i.kind === 'slow_stop' && i.driverId === after.driverId)?.timeLoss ?? 0
      : 0
    const chargedLoss = autoStopped ? autoLoss : get().pitLaneLoss
    const stillInPit = autoStopped || (playerInPit && playerNow < pitEndTime + chargedLoss)

    const nextRadio = processRadioTick(nextState, config, radioState, (msg, severity) => {
      const id = `alert-${++alertCounter}`
      set(s => ({ hudAlerts: [...s.hudAlerts, { id, severity, category: 'RADIO', message: msg, icon: '📻' }] }))
    })

    // Driver radio requests (spec 1.6 §2). A plan stop answers a pending box
    // request (ruling R8); the flag ends every question.
    let radioRequest = get().radioRequest
    if (radioRequest?.kind === 'box' && autoStopped) radioRequest = null
    const detected = finished
      ? { request: null, tracker: get().requestTracker }
      : detectRadioRequest(nextState, config, get().requestTracker,
          { inPit: stillInPit, pitPanelOpen: get().pitPanelOpen, pending: radioRequest !== null })
    if (detected.request) radioRequest = { ...detected.request, id: ++requestCounter, line: requestLine(detected.request, config) }
    if (finished) radioRequest = null

    set(s => ({
      raceState: nextState,
      stepCount: s.stepCount + 1,
      phase: finished ? 'finished' : 'racing',
      playerInPit: stillInPit,
      radioState: nextRadio,
      radioRequest,
      requestTracker: detected.tracker,
      ...(autoStopped && after ? {
        pitPanelOpen: false,      // a plan stop can land while the panel is open; confirming would charge a second stop
        projectionResult: null,
        pitEndTime: after.raceTime,
        pitLaneLoss: autoLoss,
        lastStopTime: expectedPitStopTime(config, after.teamId, nextState.safetyCar) + autoSlow,
        lastStopSlow: autoSlow,
        hudAlerts: [...s.hudAlerts, { id: `alert-${++alertCounter}`, severity: 'caution' as const, category: 'RADIO', message: 'Box box -- plan stop.', icon: '📻' }],
      } : {}),
    }))
  },

  pitNow(compound: Compound) {
    const { config, raceState, rng, stepCount } = get()
    if (!config || !raceState || !rng) return

    const next = applyPlayerPit(config, raceState, compound, rng)
    if (!next) {
      const id = `alert-${++alertCounter}`
      set(s => ({
        pitPanelOpen: false,
        hudAlerts: [...s.hudAlerts, { id, severity: 'urgent' as const, category: 'RADIO', message: 'No tyres left of any type. Staying out.', icon: '⚠️' }],
      }))
      return
    }

    const playerTime = next.cars.find(c => c.isPlayer)?.raceTime ?? 0
    const playerBefore = raceState.cars.find(c => c.isPlayer)?.raceTime ?? playerTime
    // applyPlayerPit adds only the stop, so the delta IS the stop, exactly.
    const slow = next.incidents.slice(raceState.incidents.length).find(i => i.kind === 'slow_stop')?.timeLoss ?? 0
    const id = `alert-${++alertCounter}`
    set(s => ({
      raceState: next,
      playerCalls: [...s.playerCalls, { step: stepCount, kind: 'pit' as const, compound }],
      pitPanelOpen: false,
      radioRequest: s.radioRequest?.kind === 'box' ? null : s.radioRequest,
      playerInPit: true,
      pitEndTime: playerTime,
      pitLaneLoss: effectivePitLaneLoss(config.circuit, raceState.safetyCar, config.tuning),
      lastStopTime: playerTime - playerBefore,
      lastStopSlow: slow,
      hudAlerts: [...s.hudAlerts, { id, severity: 'caution' as const, category: 'RADIO', message: 'Box box box. Come in now.', icon: '📻' }],
    }))
  },

  setPaceMode(mode: PaceMode) {
    const { raceState, stepCount } = get()
    if (!raceState) return
    set(s => ({
      raceState: applyPlayerPace(raceState, mode),
      playerCalls: [...s.playerCalls, { step: stepCount, kind: 'pace' as const, mode }],
      // The player pushed on their own: the driver's push request is answered.
      radioRequest: mode === 'push' && s.radioRequest?.kind === 'push' ? null : s.radioRequest,
    }))
  },

  // Opening the panel dismisses a pending box request (spec 1.6 §2): the
  // player is now answering it themselves.
  openPitPanel() { set(s => ({ pitPanelOpen: true, radioRequest: s.radioRequest?.kind === 'box' ? null : s.radioRequest })) },
  closePitPanel() { set({ pitPanelOpen: false, projectionResult: null }) },

  pushAlert(alert) {
    const id = `alert-${++alertCounter}`
    set(s => ({ hudAlerts: [...s.hudAlerts, { ...alert, id }] }))
  },

  dismissAlert(id) {
    set(s => ({ hudAlerts: s.hudAlerts.filter(a => a.id !== id) }))
  },

  answerRadioRequest(yes) {
    const req = get().radioRequest
    if (!req) return
    set({ radioRequest: null })
    if (!yes || get().phase !== 'racing') return
    if (req.kind === 'box') get().pitNow(req.compound ?? 'M')
    else get().setPaceMode('push')
  },

  dismissRadioRequest() { set({ radioRequest: null }) },

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
     * From the race seed AND the moment (lap, sector), via projectionSeed:
     * stable at a given moment, fresh dice every tick. The 1.4 version used
     * raceState.rngState, believing it advanced every tick; it does not
     * (initRace sets it to the seed and nothing writes it again), so every
     * projection in a race drew the same dice, and one unlucky stop-time draw
     * biased the advice for the whole race. Nothing is consumed from the live
     * race RNG either way.
     *
     * The compound is deliberately NOT mixed in, so soft/medium/hard are
     * projected under identical luck and the only difference the player sees
     * between them is the tyre.
     */
    const result = projectPitNow(config, raceState, compound, projectionSeed(config.seed, raceState.lap, raceState.sector))
    set({ projectionResult: result })
  },
}))

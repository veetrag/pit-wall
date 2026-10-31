import { create } from 'zustand'
import {
  initRace, stepSector, projectPitNow, effectivePitLaneLoss,
  applyPlayerPit, applyPlayerPace, applyPlanHold, applyCall, expectedPitStopTime, type PlayerCall,
  type RaceConfig, type RaceState, type Compound, type PaceMode, type ProjectionResult,
} from '@engine/index'
import { createRng, type Rng } from '@engine/rng'
import { V2_CIRCUITS } from '@data/circuitPaths'
import type { AlertMessage } from '../ui/HudAlert'
import { processRadioTick, makeRadioState, requestLine, type RadioState } from './radioMapper'
import { detectRadioRequest, makeRequestTracker, type RadioRequest, type RequestTracker } from './radioRequests'
import type { Difficulty } from './settingsStore'
import type { PlayerStrategyChoice } from './seasonStore'
import type { UpgradeOverlayInput } from './upgradeOverlay'
import { buildRaceConfig, buildScenarioConfig } from './buildRaceConfig'
import { buildConfigFromRecipe, type RaceRecipe, type LapsPercent, type WeatherMix } from './raceRecipe'
import { startScenario } from '@engine/scenario'
import { redFlagPending } from '@engine/redFlag'
import { neutralisationKind } from '@engine/incidents'

/**
 * 'red_flag' (spec 1.6 §4): the race is suspended at the step after which the
 * restart is next. The clock stops (GameClock steps only in 'racing'); the
 * RED FLAG card asks for the restart tyre; confirming goes to 'starting', so
 * the start lights run a standing restart.
 */
export type RacePhase = 'idle' | 'starting' | 'racing' | 'red_flag' | 'finished'

/** A season race's format (spec 1.5 §3). Absent = a Grand Prix. */
export interface SeasonRaceOptions {
  sprint?: boolean
  /** The first career race: every lap dry (spec 1.6 §0.2). */
  allDry?: boolean
  /** The pace off the line. Logged as a step-0 call so replay and the debrief see it. */
  initialPace?: PaceMode
  /** A custom race's distance (spec 2026-10-24 §6.2). */
  lapsPercent?: LapsPercent
  /** A custom race's weather mix. */
  weather?: WeatherMix
}

/** A driver radio request on screen (spec 1.6 §2). */
export type ActiveRadioRequest = RadioRequest & { id: number; line: string }

interface RaceStore {
  phase: RacePhase
  /** Completed lap at each change of the player's tyres (stop, plan stop, red-flag change), for the career's longest-stint fact (spec 1.6 §7). */
  playerTyreChanges: number[]
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

  /** The recipe of the current season race (null for any other race), spec 2026-10-24 §5.2. */
  recipe: RaceRecipe | null
  startRace: () => void
  startSeasonRace: (playerDriverId: string, seed: number, circuitId?: string, difficulty?: Difficulty, playerStrategy?: PlayerStrategyChoice | null, upgrades?: UpgradeOverlayInput | null, gridOrder?: string[], dryStart?: boolean, opts?: SeasonRaceOptions) => void
  startScenarioRace: (spec: { circuitId: string; seed: number; playerDriverId: string; startLap: number; sprint?: boolean }) => void
  initForStartSequence: () => void
  confirmRaceStart: () => void
  /** The RED FLAG card's RESTART: logs the restart_tyre call and starts the lights. */
  confirmRedFlagRestart: (compound: Compound) => void
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

/** The round strip: the calendar, then circuits authored since 2.0 (spec 2026-10-24 R2). */
export const PICKABLE_CIRCUITS: readonly string[] = [...CIRCUIT_ORDER, ...V2_CIRCUITS]

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
  playerTyreChanges: [],
  recipe: null,
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
    set({ phase: 'racing', config, raceState, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, playerCalls: [], stepCount: 0, pitEndTime: 0, pitLaneLoss: 0, lastStopTime: 0, lastStopSlow: 0, radioState: makeRadioState(), radioRequest: null, requestTracker: makeRequestTracker(), playerTyreChanges: [], recipe: null })
  },

  startSeasonRace(playerDriverId, seed, circuitId, difficulty, playerStrategy, upgrades, gridOrder, dryStart, opts) {
    const recipe: RaceRecipe = {
      seed, playerDriverId, circuitId: circuitId ?? 'bengaluru', difficulty: difficulty ?? 'rookie', strategy: playerStrategy ?? null, overlay: upgrades ?? null,
      gridOrder: gridOrder ?? null, dryStart: dryStart ?? false, sprint: opts?.sprint ?? false, allDry: opts?.allDry ?? false,
      lapsPercent: opts?.lapsPercent ?? 100, weather: opts?.weather ?? 'circuit',
    }
    const config = buildConfigFromRecipe(recipe)
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
    set({ phase: 'starting', config, raceState, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, playerCalls, stepCount: 0, pitEndTime: 0, pitLaneLoss: 0, lastStopTime: 0, lastStopSlow: 0, radioState: makeRadioState(), radioRequest: null, requestTracker: makeRequestTracker(), playerTyreChanges: [], recipe })
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
    set({ phase: 'racing', config, raceState: state, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, playerCalls: [], stepCount: 0, pitEndTime: 0, pitLaneLoss: 0, lastStopTime: 0, lastStopSlow: 0, hudAlerts: [], radioState: makeRadioState(), radioRequest: null, requestTracker: makeRequestTracker(), playerTyreChanges: [], recipe: null })
  },

  initForStartSequence() {
    const seed = 42
    const config = buildRaceConfig(seed, 'd_voss')
    const raceState = initRace(config)
    const rng = createRng(seed)
    set({ phase: 'starting', config, raceState, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, playerCalls: [], stepCount: 0, pitEndTime: 0, pitLaneLoss: 0, lastStopTime: 0, lastStopSlow: 0, radioState: makeRadioState(), radioRequest: null, requestTracker: makeRequestTracker(), playerTyreChanges: [], recipe: null })
  },

  confirmRaceStart() {
    set({ phase: 'racing' })
  },

  confirmRedFlagRestart(compound) {
    const { phase, config, raceState, rng, stepCount } = get()
    if (phase !== 'red_flag' || !config || !raceState || !rng) return
    const call = { step: stepCount, kind: 'restart_tyre' as const, compound }
    set(s => ({
      raceState: applyCall(config, raceState, call, rng),   // draws nothing
      playerCalls: [...s.playerCalls, call],
      phase: 'starting',
    }))
  },

  resetRace() {
    set({ phase: 'idle', config: null, raceState: null, rng: null, projectionResult: null, pitPanelOpen: false, playerInPit: false, playerCalls: [], stepCount: 0, pitEndTime: 0, pitLaneLoss: 0, lastStopTime: 0, lastStopSlow: 0, hudAlerts: [], radioState: makeRadioState(), radioRequest: null, requestTracker: makeRequestTracker(), playerTyreChanges: [], recipe: null })
  },

  step() {
    const { phase, config, raceState, rng, playerInPit, pitEndTime, radioState } = get()
    if (phase !== 'racing' || !config || !raceState || !rng) return

    const nextState = stepSector(config, raceState, rng)
    const finished = nextState.lap >= nextState.totalLaps && nextState.sector === 0

    const before = raceState.cars.find(c => c.isPlayer)
    const after = nextState.cars.find(c => c.isPlayer)
    // A tyre change is anything that grows compoundsUsed: a plan stop here, and
    // the red-flag free change (Plan A §4) too -- confirmRedFlagRestart only
    // records the choice; the engine fits the tyre on this restart step.
    // Manual stops are recorded in pitNow.
    const changed = !!before && !!after && after.compoundsUsed.length > before.compoundsUsed.length
    // A red-flag restart may consume a planned stop (pitsDone + 1) with no stop
    // time: bookkeeping, not a stop -- no timer, no "Box box" (preflight S1).
    const restarted = nextState.incidents.slice(raceState.incidents.length).some(i => i.kind === 'red_flag_restart')
    const autoStopped = !!before && !!after && after.pitsDone > before.pitsDone && !restarted
    // The restart is the next step and the player is still racing: stop here
    // for their tyre (ruling R13). A retired player gets no card.
    const redPending = !finished && redFlagPending(nextState) && !!after && !after.retired

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
    if (radioRequest && radioRequest.kind !== 'push' && autoStopped) radioRequest = null
    const detected = finished
      ? { request: null, tracker: get().requestTracker }
      : detectRadioRequest(nextState, config, get().requestTracker,
          { inPit: stillInPit, pitPanelOpen: get().pitPanelOpen, pending: radioRequest !== null })
    if (detected.request) radioRequest = { ...detected.request, id: ++requestCounter, line: requestLine(detected.request, config) }
    // The flag ends every question: on the deploy tick as well as when pending.
    const flagDeployed = nextState.incidents.slice(raceState.incidents.length).some(i => i.kind === 'red_flag')
    if (finished || flagDeployed) radioRequest = null

    // The red-flag card closes the panel: release a hold with it, logged at
    // the step count this step reaches, so replay applies it at the same point.
    const releaseHold = redPending && !!nextState.planHold
    set(s => ({
      raceState: releaseHold ? applyPlanHold(nextState, false) : nextState,
      ...(releaseHold ? { playerCalls: [...s.playerCalls, { step: s.stepCount + 1, kind: 'hold_plan' as const, hold: false }] } : {}),
      stepCount: s.stepCount + 1,
      phase: finished ? 'finished' : redPending ? 'red_flag' : 'racing',
      playerInPit: stillInPit,
      radioState: nextRadio,
      radioRequest,
      requestTracker: detected.tracker,
      ...(changed ? { playerTyreChanges: [...s.playerTyreChanges, nextState.lap] } : {}),
      ...(autoStopped && after ? {
        pitPanelOpen: false,      // a plan stop can land while the panel is open; confirming would charge a second stop
        projectionResult: null,
        pitEndTime: after.raceTime,
        pitLaneLoss: autoLoss,
        lastStopTime: expectedPitStopTime(config, after.teamId, nextState.safetyCar) + autoSlow,
        lastStopSlow: autoSlow,
        hudAlerts: [...s.hudAlerts, { id: `alert-${++alertCounter}`, severity: 'caution' as const, category: 'RADIO', message: 'Box box -- plan stop.', icon: '📻' }],
      } : {}),
      // The card takes the screen: nothing may be left half-decided under it.
      ...(redPending ? { pitPanelOpen: false, projectionResult: null, radioRequest: null } : {}),
    }))
  },

  pitNow(compound: Compound) {
    const { config, raceState, rng, stepCount } = get()
    if (!config || !raceState || !rng) return

    const next = applyPlayerPit(config, raceState, compound, rng)
    if (!next && neutralisationKind(raceState.safetyCar) === 'red') {
      // The pit lane is closed under red; the free change comes on the card.
      const id = `alert-${++alertCounter}`
      set(s => ({
        pitPanelOpen: false,
        hudAlerts: [...s.hudAlerts, { id, severity: 'caution' as const, category: 'RADIO', message: 'Red flag — choose your restart tyre.', icon: '📻' }],
      }))
      get().closePitPanel()   // releases a held plan stop with it
      return
    }
    if (!next) {
      const id = `alert-${++alertCounter}`
      set(s => ({
        pitPanelOpen: false,
        hudAlerts: [...s.hudAlerts, { id, severity: 'urgent' as const, category: 'RADIO', message: 'No tyres left of any type. Staying out.', icon: '⚠️' }],
      }))
      get().closePitPanel()   // releases a held plan stop with it
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
      // A mid-lap stop counts at the completed-lap mark (raceState.lap), like every other change.
      playerTyreChanges: [...s.playerTyreChanges, raceState.lap],
      pitPanelOpen: false,
      radioRequest: s.radioRequest && s.radioRequest.kind !== 'push' ? null : s.radioRequest,
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
  // 1.6.2: while the panel is open the planned stop is HELD -- it must not
  // fire behind the player. A logged call, so replay and the debrief see it.
  // Logged on every open over a pending plan stop (not only when one is due):
  // the hold is then a pure function of the panel, nothing to predict.
  openPitPanel() {
    const { config, raceState, stepCount } = get()
    const player = raceState?.cars.find(c => c.isPlayer)
    const pending = !!config?.playerStrategyOverride && !!player && !player.retired &&
      player.strategy.plannedStops[player.pitsDone] !== undefined
    if (raceState && pending && !raceState.planHold) {
      set(s => ({
        raceState: applyPlanHold(raceState, true),
        playerCalls: [...s.playerCalls, { step: stepCount, kind: 'hold_plan' as const, hold: true }],
      }))
    }
    set(s => ({ pitPanelOpen: true, radioRequest: s.radioRequest && s.radioRequest.kind !== 'push' ? null : s.radioRequest }))
  },
  // Released on close: a due stop fires at the next lap boundary.
  closePitPanel() {
    const { raceState, stepCount } = get()
    if (raceState?.planHold) {
      set(s => ({
        raceState: applyPlanHold(raceState, false),
        playerCalls: [...s.playerCalls, { step: stepCount, kind: 'hold_plan' as const, hold: false }],
      }))
    }
    set({ pitPanelOpen: false, projectionResult: null })
  },

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
    switch (req.kind) {
      case 'box': get().pitNow(req.compound ?? 'M'); break
      case 'rain': get().pitNow(req.compound ?? 'I'); break
      case 'push': get().setPaceMode('push'); break
      default: { const never: never = req.kind; return never }
    }
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

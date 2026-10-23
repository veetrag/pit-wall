import type { Wing } from './setup'

export type Compound = 'S' | 'M' | 'H' | 'I' | 'W'
export type TyreAllocation = Record<Compound, number>
export type PaceMode = 'push' | 'neutral' | 'conserve'
export type SectorIndex = 0 | 1 | 2
export type WeatherState = 'DRY' | 'DAMP' | 'WET'

export interface CompoundSpec {
  name: string
  type: 'dry' | 'wet'
  offset: number
  lin: number
  cliff: number
  pen: number
  colorToken: string
  optimalState?: WeatherState
}

export interface TuningConstants {
  carPerformance: { deltaPerRating: number; sectorSplit: [number, number, number] }
  driverPerformance: { deltaPerSkill: number; sectorSplit: [number, number, number] }
  fuel: { effectPerLap: number }
  noise: { sigmaPerSector: number; consistencyReliefFactor: number }
  trackEvolution: { startDelta: number; decayLaps: number }
  traffic: {
    gapThreshold: number
    penalty: number
    trafficCap: number
    /** Numerator of the circuit-dependent penalty scale, `hardCircuitScale /
     *  max(overtakingFactor[sector], factorFloor)`. Scales the penalty's
     *  MAGNITUDE, not just its cap — capping alone left `penalty / 3` as the
     *  binding term under the `min`, so the cap never applied. */
    hardCircuitScale: number
    dirtyAirDegBonus: number
    dirtyAirDegCapLaps: number
  }
  overtaking: {
    base: number
    paceGateMin: number
    paceMultiplier: number
    attackRacecraftBase: number
    defenceRacecraftFactor: number
    tyreFreshnessBonusMax: number
    paceModeFactor: number
    /** Seconds added to the OVERTAKEN car alone on a completed pass — its lost
     *  momentum is a genuinely uncompensated cost, whereas the attacker has
     *  already paid through the traffic penalty it accumulated while following.
     *  Charged to both cars it inverted the value of racecraft: the brain that
     *  passed most was billed most (MODEL_SPEC.md §9). */
    fightCost: number
    /** Lower bound on the circuit overtakingFactor where it is used as a
     *  divisor. It bounds BOTH divisors: the traffic penalty's magnitude
     *  (`hardCircuitScale / factor`, the term that actually binds) and its cap
     *  (`trafficCap / factor`).
     *
     *  **This is a BALANCE constant, not only a divide-by-zero guard, and at
     *  the shipped 0.35 it CLIPS REAL CIRCUITS.** Sectors clipped (factor <
     *  0.35), from circuits.json:
     *
     *  - `harbour_lights` `[0.35, 0.10, 0.20]` — **2 of 3** (S2, S3)
     *  - `kaido` `[0.55, 0.15, 0.30]` — **2 of 3** (S2, S3)
     *  - `bengaluru` `[0.60, 0.30, 0.40]` — 1 of 3 (S2)
     *  - `monsoon_bay` `[0.90, 0.30, 0.55]` — 1 of 3 (S2)
     *
     *  Consequences a reader tuning this must know: in those clipped sectors the
     *  penalty is a flat `hardCircuitScale / 0.35` = 7.14×, so harbour_lights
     *  and kaido are *identical* to each other in S2 and S3 and harbour_lights'
     *  authored intent (S2 3.5× harder to pass in than S1) is erased there. The
     *  hard-end differentiation the gates assert therefore comes from
     *  `sectorEase` in `resolveOvertakes`, which reads the **unclipped**
     *  `circuit.overtakingFactor`, not from the penalty. The floor is also a
     *  plausible contributor to `hardCircuitScale`'s saturation at 2.5.
     *
     *  Kept at 0.35 on measurement, not by default — see MODEL_SPEC.md §7 for
     *  the 0.35/0.20/0.10/0.05 sweep, what lowering it buys (harbour_lights
     *  enters spec §6.1's target band) and what it costs (the OPTIMAL-brain
     *  gate collapses to zero). Upper-bounded at 0.35 in validators.ts. */
    factorFloor: number
  }
  pit: {
    stopMean: number
    stopSigma: number
    pitCrewMeanRelief: number
    pitCrewSigmaRelief: number
    /**
     * Slow stops (spec 2026-10-17 §1). Chance per stop before crew relief; a
     * slow stop adds slowStopMin..slowStopMax seconds. Decided from the second
     * value of the gaussianPair pitStopTime already draws, so 0 changes nothing.
     */
    slowStopChance: number
    slowStopMin: number
    slowStopMax: number
    /** chance x (1 - pitCrew/100 x this). */
    pitCrewSlowRelief: number
  }
  paceModes: Record<PaceMode, { paceDelta: number; degMultiplier: number }>
  qualifying: {
    attackLevels: Record<AttackLevel, { paceDelta: number; errorChance: number }>
    scrappyLapPenalty: number
    seedOffset: number
    gridSlotGapSec: number
  }
  career: {
    tierDecayPerSeason: number
    rivalCatchUp: { base: number; championBonus: number }
    seedStride: number
  }
  tyreManagement: { degReliefFactor: number }
  strategyReaction: {
    coverUndercutEnabled: boolean
    coverWindowGap: number
    coverReactionProb: Record<StrategyBrain, number>
    minCliffFracToCover: number
    minRemainingLaps: number
  }
  /**
   * AI reaction to a neutralisation (SC or VSC), spec 2026-10-16 §1; and to a
   * weather change, spec 2026-10-17 §0.1: a car changes tyre family only once
   * the change has held for weatherConfirmLaps completed laps (WET switches a
   * slick-shod car at once), and never with weatherMinLapsLeft laps or fewer
   * to go. confirm 1 / minLapsLeft 0 is the pre-1.6 rule exactly.
   */
  ai: { neutralisationWindowLaps: number; neutralisationCliffFrac: number; weatherConfirmLaps: number; weatherMinLapsLeft: number }
  /** Rival intel box window (spec 2026-10-16 §2). Half-width in laps per brain; the brain is never shown. */
  rivalIntel: { halfWidth: Record<StrategyBrain, number>; maxOffsetLaps: number }
  /**
   * Driver radio requests (spec 2026-10-17 §2). Read by src/state/radioRequests.ts
   * only -- the engine never asks. Lives here so RaceConfig.tuning carries it.
   */
  radioRequests: {
    boxCliffFrac: number
    boxPlanWindowLaps: number
    minLapsLeft: number
    pushGap: number
    pushLapEnds: number
    pushPaceMargin: number
    pushMaxCliffFrac: number
    cooldownLaps: number
    maxPerRace: number
    expirySec: number
  }
  projection: { horizonLaps: number; useOvertakeRolls: boolean; netEstimateHorizonLaps: number }
  incidents: {
    // dnfPerLap is dead: no consumer in src/engine/. Kept because removing it
    // is outside the race-incidents plan's scope.
    dnfPerLap: number
    driverErrorPerLap: number
    terminalFraction: number
    errorTimeLossMean: number
    errorTimeLossSigma: number
    consistencyReliefMax: number
    safetyCar: {
      crashDeployChance: number
      mechanicalDeployChance: number
      gapCompression: number
      paceMultiplier: number
      laneTimeLossUnderSc: number
      durationLapsMin: number
      durationLapsMax: number
      maxPerRace: number
    }
    /** Virtual safety car (spec 2026-10-16 §1). Rolled only when the SC is not. */
    vsc: {
      crashDeployChance: number
      mechanicalDeployChance: number
      paceMultiplier: number
      laneLossFactor: number
      durationLapsMin: number
      durationLapsMax: number
      maxPerRace: number
    }
    /**
     * Red flag (spec 2026-10-17 §4). Rolled on a crash BEFORE the SC/VSC; at
     * crashChance 0 it draws nothing. planWindowLaps: a planned stop that
     * close is fitted (and consumed) at the free tyre change.
     */
    redFlag: {
      crashChance: number
      maxPerRace: number
      minLapsLeft: number
      planWindowLaps: number
    }
  }
  weather: {
    crossoverPenalty: Record<string, Record<string, number>>
    wetDegMultiplier: Record<string, Record<string, number>>
    wetSkillReliefMax: number
    wetNoiseReliefFactor: number
    wetIncident: {
      spinChance: { DRY: number; DAMP: number; WET: number }
      spinTimeLossMean: number
      spinTimeLossSigma: number
      // Mirrors spinChance but for the opposite mismatch (wet-family
      // compound on a genuinely DRY track) — a single flat chance since
      // there's only one "wrong" direction there, unlike dry-in-wet which
      // scales with how wet it actually is.
      dryTrackSpinChance: number
    }
    /** Laps ahead the forecast looks (spec 2026-10-17 §3). */
    forecastHorizon: number
    /** Half-width of the forecast window by laps ahead (index 0 unused). Length >= forecastHorizon + 1. */
    forecastSpread: number[]
    /** Shown chance by laps ahead. Length >= forecastHorizon + 1. */
    forecastConfidence: number[]
    timeline: {
      onsetWindow: [number, number]
      minDuration: number
      maxDuration: number
      intensityBias: Record<string, number>
    }
  }
  tyreRules: {
    allocation: { rookie: TyreAllocation; pro: TyreAllocation }
    mandatoryTwoCompound: { rookie: boolean; pro: boolean }
    twoCompoundPenaltySec: number
  }
  // Tyre-failure risk: running a tyre meaningfully past its cliff carries a
  // real chance of a puncture/mechanical failure that retires the car, not
  // just an ever-steeper time-loss curve with no floor. Rolled per sector
  // once tyreCliffFraction exceeds cliffFractionThreshold; chance scales
  // linearly with how far over, capped at maxChancePerLap.
  tyreFailure: {
    cliffFractionThreshold: number
    chancePerLapOverThreshold: number
    maxChancePerLap: number
  }
  // Per-lap mechanical failure chance at reliability 0, scaled down linearly by
  // the team's reliability facet. Rolled per sector as chance/3. Solved from the
  // target DNF bands in the design spec — see docs/superpowers/specs.
  mechanicalFailure: {
    baseChancePerLap: number
  }
  // M5: every difficulty-sensitive lever built across M1-M4, collected into one
  // profile so difficulty is a coordinated curve rather than scattered branches.
  // tyreRules.allocation/mandatoryTwoCompound (M3) stay difficulty-keyed above —
  // not duplicated here — buildConfig composes both when resolving a RaceConfig.
  difficultyProfiles: {
    rookie: DifficultyProfile
    pro: DifficultyProfile
  }
  // Post-race debrief (docs/superpowers/specs/2026-10-09-post-race-debrief-design.md).
  debrief: {
    futures: number
    lapOffsets: number[]
    minGain: number
    minShare: number
    timeoutMs: number
    whatIfMaxShift: number
  }
  // Car setup (docs/superpowers/specs/2026-10-09-car-setup-design.md section 2).
  setup: {
    _note?: string
    speedGain: number
    gripGain: number
    balanceCost: number
    overtakeGain: number
    wetGain: number
    wetSeverity: { DAMP: number; WET: number }
    aiNoise: number
    seedOffset: number
  }
  _regressionBands?: Record<string, unknown>
}

export interface DifficultyProfile {
  brainCap: StrategyBrain
  brainPromote: boolean
  coverReactionScale: number
  aiPaceModeAggression: number
  pitCrewConsistency: number
}

export interface CircuitSpec {
  name: string
  laps: number
  sectorBase: [number, number, number]
  carSensitivity: [number, number, number]
  driverSensitivity: [number, number, number]
  overtakingFactor: [number, number, number]
  pitLaneTimeLoss: number
  rainProbability?: number
  weatherBias?: string
  characterNote?: string
  trackPath?: string
  location?: string
  flag?: string
  funFacts?: string[]
  atmosphere?: string
}

export interface DriverFacets {
  pace: number
  racecraft: number
  tyreManagement: number
  consistency: number
  wetWeather: number
  experience: number
}

export interface TeamFacets {
  power: number
  aero: number
  handling: number
  reliability: number
  pitCrew: number
}

export interface DriverSpec {
  id: string
  name: string
  code: string
  teamId: string
  facets: DriverFacets
  potential?: number
  age?: number
}

export interface TeamSpec {
  id: string
  name: string
  colorPrimary: string
  colorSecondary: string
  liveryAccent?: string // presentation only; the engine never reads it
  facets: TeamFacets
  developmentRate?: number
}

export interface PitStop {
  lap: number
  compound: Compound
}

export type StrategyBrain = 'naive' | 'smart' | 'optimal'

export interface StrategyPlan {
  teamId: string
  startCompound: Compound
  plannedStops: PitStop[]
  brain?: StrategyBrain
}

export interface CarState {
  driverId: string
  teamId: string
  position: number
  raceTime: number
  lap: number
  sector: SectorIndex
  compound: Compound
  tyreAge: number
  paceMode: PaceMode
  pitted: boolean
  pitsDone: number
  strategy: StrategyPlan
  isPlayer: boolean
  tyreAllocation: TyreAllocation
  compoundsUsed: Compound[]
  lapsInDirtyAir: number
  // Set once by a tyre-failure roll (see tuning.tyreFailure); once true the
  // car is frozen — no more sector time, traffic, overtakes, or AI pit
  // decisions — and sorts after every classified car in final position.
  retired: boolean
  retiredLap: number | null
  // Which roll ended the car's race, so the UI can attribute the retirement
  // correctly instead of assuming it was always a tyre failure.
  retiredCause: 'tyre' | 'mechanical' | 'crash' | null
}

export interface SectorResult {
  driverId: string
  sectorTime: number
  tyreContribution: number
  trafficPenalty: number
  noiseSample: number
  spinLoss: number
}

export interface OvertakeEvent {
  lap: number
  sector: SectorIndex
  overtakerId: string
  overtakenId: string
}

export type IncidentKind =
  | 'driver_error'
  | 'crash'
  | 'safety_car_deployed'
  | 'safety_car_ended'
  | 'vsc_deployed'
  | 'vsc_ended'
  | 'slow_stop'
  | 'red_flag'
  | 'red_flag_restart'

/**
 * A full safety car bunches the field; a virtual safety car slows every car and
 * never bunches it; a red flag (spec 2026-10-17 §4) suspends the race until
 * the next lap boundary, where it restarts from a fresh grid.
 */
export type NeutralisationKind = 'sc' | 'vsc' | 'red'

export interface IncidentEvent {
  lap: number
  sector: SectorIndex
  kind: IncidentKind
  /** null for safety-car events, which belong to the race rather than a car. */
  driverId: string | null
  /** Seconds, for 'driver_error' and 'slow_stop' only; null otherwise. */
  timeLoss: number | null
}

export interface SafetyCarState {
  deployedLap: number
  lapsRemaining: number
  cause: 'crash' | 'mechanical'
  /**
   * Which neutralisation this is. Optional on purpose: a state built before the
   * VSC existed (and every older test fixture) has no kind and WAS a safety car.
   * Always read it through incidents.ts `neutralisationKind`, never directly.
   */
  kind?: NeutralisationKind
}

export interface RaceState {
  lap: number
  sector: SectorIndex
  totalLaps: number
  cars: CarState[]
  sectorResults: SectorResult[]
  overtakeEvents: OvertakeEvent[]
  /**
   * Lives on RaceState rather than in the Zustand store deliberately, and it is
   * load-bearing: projection.ts clones RaceState and fast-forwards it, so with
   * safetyCar here the "if you pit now" overlay prices a stop under yellow
   * correctly with no changes to projection.ts at all.
   */
  safetyCar: SafetyCarState | null
  incidents: IncidentEvent[]
  trackEvolutionLaps: number
  rngState: number
  weatherTimeline: WeatherState[]
  weatherState: WeatherState
  /**
   * The player's restart tyre (spec 2026-10-17 §4), set by a 'restart_tyre'
   * call ONLY while the restart is the next step (redFlagPending), and always
   * stripped by that step. ABSENT on every other state, so the golden race
   * and every serialised state are unchanged.
   */
  redFlagTyre?: Compound
  /**
   * 1.6.2: the player's planned stop is HELD while the pit panel is open
   * ('hold_plan' calls). The plan check skips the player while set; released,
   * a due stop fires at the next lap boundary (`lap >= stop.lap`). A player
   * PIT clears it. ABSENT when not held, so the golden race is unchanged.
   */
  planHold?: true
}

export interface RaceConfig {
  circuit: CircuitSpec
  tuning: TuningConstants
  compounds: Record<string, CompoundSpec>
  drivers: DriverSpec[]
  teams: TeamSpec[]
  strategies: StrategyPlan[]
  playerDriverId: string
  seed: number
  weatherSeed?: number
  /**
   * Forces lap 1 to start DRY. The timeline still evolves normally afterwards,
   * so rain can arrive later -- this constrains the OPENING conditions only.
   *
   * Set by the season for round 1. A new player's first ever race was wet:
   * currentSeed() at raceIndex 0 is 42, and at seed 42 the opening roll lands
   * wet at almost every circuit on the calendar (measured: every one except
   * sol_desert, including circuits with rainProbability as low as 0.15). So it
   * could not be fixed by reordering the calendar, and changing the seed base
   * would have shifted every race in the game.
   */
  dryStart?: boolean
  /**
   * The whole timeline is DRY (spec 2026-10-17 §0.2): a new player's very
   * first career race. The weather rolls are consumed exactly as without it,
   * so the stream is unchanged; only the result is overridden. ABSENT on every
   * other config -- byteIdentity, the bands and the scenarios rely on that.
   */
  allDry?: true
  // Starting grid, P1 first, as driverIds. ABSENT means "use drivers.json
  // order", which is exactly what the engine did before qualifying existed --
  // byteIdentity, the Monte-Carlo bands and all three scenarios depend on that
  // fallback being byte-identical, so do not make this required.
  gridOrder?: string[]
  // Rear-wing level per car, keyed by driverId. Absent => every car level 3 =>
  // zero effect. byteIdentity, Monte-Carlo and scenarios depend on absence
  // staying meaningful.
  setups?: Record<string, Wing>
  // Separate RNG stream for qualifying, same pattern as weatherSeed above, so
  // a qualifying session consumes nothing from the main race seed.
  qualifyingSeed?: number
  // Overrides the player's own strategy (start compound + planned stops) chosen
  // at Race Setup. Only applies to the car whose driverId === playerDriverId —
  // teammates and rivals keep whatever `strategies` assigns them.
  playerStrategyOverride?: StrategyPlan
  // Resolved per-difficulty by the caller (mirrors how brains are resolved in
  // raceStore's buildConfig) — the engine itself is difficulty-agnostic. If
  // absent, tyre sets are treated as unlimited (back-compat for configs that
  // don't care about allocation).
  tyreAllocationBase?: TyreAllocation
  mandatoryTwoCompound?: boolean
  // M5: resolved from the active DifficultyProfile by the caller, same pattern
  // as tyreAllocationBase above. Undefined defaults to 1.0 (no scaling) so
  // configs built before M5 behave identically.
  coverReactionScale?: number
  paceModeAggression?: number
  /**
   * Race distance in laps when it is not the circuit's (a sprint). ABSENT
   * means `circuit.laps`; byteIdentity, the Monte-Carlo bands and every
   * scenario depend on absence staying meaningful, so never default it.
   */
  lapsOverride?: number
}

export type AttackLevel = 'conserve' | 'balanced' | 'attack'

export interface QualifyingCall {
  compound: Compound
  attack: AttackLevel
}

export interface QualifyingLap {
  driverId: string
  teamId: string
  /** Total lap time in seconds, including the attack delta and any scrappy penalty. */
  time: number
  compound: Compound
  attack: AttackLevel
  /** An error was rolled on this lap. Never a retirement -- see qualifying.ts. */
  scrappy: boolean
}

export interface QualifyingResult {
  /** Sorted ascending by time. */
  laps: QualifyingLap[]
  /** driverIds, P1 first. Derived from `laps`; stored so consumers never re-sort. */
  order: string[]
}

// ---- Post-race debrief results ----
export type JudgedCall =
  | { kind: 'start'; compound: Compound }
  | { kind: 'plan'; lap: number; compound: Compound }     // display lap (state.lap + 1)
  | { kind: 'pit'; lap: number; compound: Compound }
  | { kind: 'pace'; lap: number; mode: PaceMode }
  | { kind: 'wing'; wing: Wing }

export type Alternative =
  | { kind: 'start'; compound: Compound }
  | { kind: 'plan' | 'pit'; lap: number; compound: Compound }
  | { kind: 'pace'; lap: number; mode: PaceMode }
  | { kind: 'pace-none' }
  | { kind: 'wing'; wing: Wing }

export interface OptionOutcome { meanPosition: number; positions: number[] }

export interface CallVerdict {
  call: JudgedCall
  actual: OptionOutcome
  better: (OptionOutcome & { alternative: Alternative; betterShare: number }) | null
}

export interface DebriefResult {
  futures: number
  finish: number                   // the player's real finishing position (retired = cars + 1)
  verdicts: CallVerdict[]          // sorted by places left on the table, largest first
  retired: { lap: number; cause: 'tyre' | 'mechanical' | 'crash' } | null
}

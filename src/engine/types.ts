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
  traffic: { gapThreshold: number; penalty: number; trafficCap: number; dirtyAirDegBonus: number; dirtyAirDegCapLaps: number }
  overtaking: {
    base: number
    paceGateMin: number
    paceMultiplier: number
    sectorFactor: [number, number, number]
    attackRacecraftBase: number
    defenceRacecraftFactor: number
    tyreFreshnessBonusMax: number
    paceModeFactor: number
  }
  pit: {
    laneTimeLoss: number
    stopMean: number
    stopSigma: number
    pitCrewMeanRelief: number
    pitCrewSigmaRelief: number
  }
  paceModes: Record<PaceMode, { paceDelta: number; degMultiplier: number }>
  tyreManagement: { degReliefFactor: number }
  strategyReaction: {
    coverUndercutEnabled: boolean
    coverWindowGap: number
    coverReactionProb: Record<StrategyBrain, number>
    minCliffFracToCover: number
    minRemainingLaps: number
  }
  projection: { horizonLaps: number; useOvertakeRolls: boolean; netEstimateHorizonLaps: number }
  incidents: { dnfPerLap: number; driverErrorPerLap: number }
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
    forecastConfidence: [number, number, number, number, number]
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

export interface WeatherForecast {
  currentState: WeatherState
  lap1: WeatherState
  lap2: WeatherState
  lap2Confidence: number
}

export interface RaceState {
  lap: number
  sector: SectorIndex
  totalLaps: number
  cars: CarState[]
  sectorResults: SectorResult[]
  overtakeEvents: OvertakeEvent[]
  trackEvolutionLaps: number
  rngState: number
  weatherTimeline: WeatherState[]
  weatherState: WeatherState
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
}

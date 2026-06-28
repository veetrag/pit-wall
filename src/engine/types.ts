export type Compound = 'S' | 'M' | 'H' | 'I' | 'W'
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
  traffic: { gapThreshold: number; penalty: number }
  overtaking: {
    base: number
    paceMultiplier: number
    sectorFactor: [number, number, number]
    attackRacecraftBase: number
    defenceRacecraftFactor: number
    tyreFreshnessBonusMax: number
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
  projection: { horizonLaps: number; useOvertakeRolls: boolean; netEstimateHorizonLaps: number }
  incidents: { dnfPerLap: number; driverErrorPerLap: number }
  weather: {
    crossoverPenalty: Record<string, Record<string, number>>
    wetDegMultiplier: Record<string, Record<string, number>>
    wetSkillReliefMax: number
    wetNoiseReliefFactor: number
    forecastLap2Confidence: number
    timeline: {
      onsetWindow: [number, number]
      minDuration: number
      maxDuration: number
      intensityBias: Record<string, number>
    }
  }
  _regressionBands?: Record<string, unknown>
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

export interface StrategyPlan {
  teamId: string
  startCompound: Compound
  plannedStops: PitStop[]
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
}

export interface SectorResult {
  driverId: string
  sectorTime: number
  tyreContribution: number
  trafficPenalty: number
  noiseSample: number
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
}

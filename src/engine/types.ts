export type Compound = 'S' | 'M' | 'H' | 'I' | 'W'
export type WeatherState = 'DRY' | 'DAMP' | 'WET'
export type PaceMode = 'push' | 'neutral' | 'conserve'
export type SectorIndex = 0 | 1 | 2

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
  noise: { sigmaPerSector: number }
  trackEvolution: { startDelta: number; decayLaps: number }
  traffic: { gapThreshold: number; penalty: number }
  overtaking: { base: number; paceMultiplier: number; sectorFactor: [number, number, number] }
  pit: { laneTimeLoss: number; stopMean: number; stopSigma: number }
  paceModes: Record<PaceMode, { paceDelta: number; degMultiplier: number }>
  projection: { horizonLaps: number; useOvertakeRolls: boolean }
  incidents: { dnfPerLap: number; driverErrorPerLap: number }
  weather: {
    crossoverPenalty: {
      dryInWet: number
      dryInDamp: number
      wetInDry: number
      dampInDry: number
    }
    wetDegMultiplier: number
    wetSkillReliefMax: number
    forecastLap2Confidence: number
    minDryLaps: number
    minWetLaps: number
    dampToWetProb: number
    dampToDryProb: number
    wetToDampProb: number
    dryToDampProb: number
  }
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
}

export interface DriverFacets {
  pace: number           // 0–100, feeds Layer 1 sector time
  racecraft: number      // 0–100, attack & defence in Layer 2 overtaking
  tyreManagement: number // 0–100, scales effective tyre age (deg rate)
  consistency: number    // 0–100, reduces per-sector noise sigma
  wetWeather: number     // 0–100, dormant in v1
  experience: number     // 0–100, light effect in v1
}

export interface TeamFacets {
  power: number      // 0–100, governs S1 delta
  aero: number       // 0–100, governs S2 delta (biggest differentiator)
  handling: number   // 0–100, governs S3 delta
  reliability: number // 0–100, dormant in v1
  pitCrew: number    // 0–100, lowers stop mean + sigma
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
  lap1: WeatherState          // certain
  lap2: WeatherState          // 70% confidence
  lap2Confidence: number      // 0-1
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
  weatherTimeline: WeatherState[]   // index = lap number (0-based), length = totalLaps
  weatherState: WeatherState
}

export interface RaceConfig {
  circuit: CircuitSpec
  tuning: TuningConstants
  compounds: Record<Compound, CompoundSpec>
  drivers: DriverSpec[]
  teams: TeamSpec[]
  strategies: StrategyPlan[]
  playerDriverId: string
  seed: number
  weatherSeed?: number
}

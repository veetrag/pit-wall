export type Compound = 'S' | 'M' | 'H'
export type PaceMode = 'push' | 'neutral' | 'conserve'
export type SectorIndex = 0 | 1 | 2

export interface CompoundSpec {
  name: string
  offset: number
  lin: number
  cliff: number
  pen: number
  colorToken: string
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
}

export interface CircuitSpec {
  name: string
  laps: number
  sectorBase: [number, number, number]
  carSensitivity: [number, number, number]
  driverSensitivity: [number, number, number]
  overtakingFactor: [number, number, number]
  pitLaneTimeLoss: number
}

export interface DriverSpec {
  id: string
  name: string
  code: string
  teamId: string
  skill: number
  racecraft: number
  consistency: number
}

export interface TeamSpec {
  id: string
  name: string
  rating: number
  reliability: number
  colorPrimary: string
  colorSecondary: string
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

export interface RaceState {
  lap: number
  sector: SectorIndex
  totalLaps: number
  cars: CarState[]
  sectorResults: SectorResult[]
  overtakeEvents: OvertakeEvent[]
  trackEvolutionLaps: number
  rngState: number
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
}

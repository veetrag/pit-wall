export { initRace, stepSector } from './race'
export { projectPitNow } from './projection'
export { shouldAIPit, aiDecision } from './strategy'
export type { AIDecision } from './strategy'
export {
  tyreDelta, tyreCliffFraction, effectiveTyreAge,
  resolveAllocatedCompound, consumeTyreSet, UNLIMITED_TYRE_ALLOCATION,
} from './tyres'
export { computeSectorTime } from './lapModel'
export { createRng, gaussianPair } from './rng'
export { generateWeatherTimeline, getWeatherForecast } from './weather'
export type {
  RaceConfig, RaceState, CarState, SectorResult, OvertakeEvent,
  Compound, PaceMode, SectorIndex, TuningConstants, CompoundSpec,
  CircuitSpec, DriverSpec, TeamSpec, PitStop, StrategyPlan, StrategyBrain,
  TyreAllocation, DifficultyProfile, WeatherState, WeatherForecast,
} from './types'
export type { ProjectionResult } from './projection'
export type { Rng } from './rng'

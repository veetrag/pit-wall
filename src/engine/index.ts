export { initRace, stepSector } from './race'
export { projectPitNow } from './projection'
export { shouldAIPit, aiDecision } from './strategy'
export type { AIDecision } from './strategy'
export {
  tyreDelta, tyreCliffFraction, effectiveTyreAge,
  resolveAllocatedCompound, consumeTyreSet, UNLIMITED_TYRE_ALLOCATION,
} from './tyres'
export { computeSectorTime } from './lapModel'
export {
  driverErrorChancePerSector, rollDriverError, rollErrorIsTerminal, rollErrorTimeLoss,
  rollSafetyCarDeployment, rollSafetyCarDuration, compressRaceTimes, effectivePitLaneLoss,
  rollVscDeployment, rollVscDuration, neutralisationKind, neutralisationPaceMultiplier,
} from './incidents'
export * from './setup'
export { createRng, gaussianPair } from './rng'
export { generateWeatherTimeline, getWeatherForecast, openingTimeline } from './weather'
export { runQualifying, qualifyingRng } from './qualifying'
export type {
  RaceConfig, RaceState, CarState, SectorResult, OvertakeEvent,
  Compound, PaceMode, SectorIndex, TuningConstants, CompoundSpec,
  CircuitSpec, DriverSpec, TeamSpec, PitStop, StrategyPlan, StrategyBrain,
  TyreAllocation, DifficultyProfile, WeatherState, WeatherForecast, SafetyCarState,
  IncidentEvent, IncidentKind, NeutralisationKind,
  AttackLevel, QualifyingCall, QualifyingLap, QualifyingResult,
} from './types'
export type { ProjectionResult } from './projection'
export type { Rng } from './rng'
export { applyPlayerPit, applyPlayerPace, applyCall } from './playerCalls'
export type { PlayerCall } from './playerCalls'
export { isFinished, simulate, replay, judgeCalls, pickBetter, futureSeed } from './debrief'
export type { JudgedCall, Alternative, OptionOutcome, CallVerdict, DebriefResult } from './types'
export { lapHistory } from './raceHistory'
export type { LapHistory, CarHistory, NeutralisationPeriod } from './raceHistory'
export { rivalIntel, intelOffset } from './rivalIntel'
export type { RivalIntel } from './rivalIntel'
export { PIT_CLIFF_THRESHOLD } from './strategy'

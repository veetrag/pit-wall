export { initRace, stepSector } from './race'
export { projectPitNow } from './projection'
export { shouldAIPit, aiDecision, bestDryCompound } from './strategy'
export type { AIDecision } from './strategy'
export {
  tyreDelta, tyreCliffFraction, effectiveTyreAge,
  resolveAllocatedCompound, consumeTyreSet, UNLIMITED_TYRE_ALLOCATION,
} from './tyres'
export { computeSectorTime } from './lapModel'
export {
  driverErrorChancePerSector, rollDriverError, rollErrorIsTerminal, rollErrorTimeLoss,
  rollSafetyCarDeployment, rollSafetyCarDuration, compressRaceTimes, effectivePitLaneLoss,
  rollVscDeployment, rollVscDuration, neutralisationKind, neutralisationPaceMultiplier, rollRedFlag,
} from './incidents'
export { restartTyre, applyRedFlagRestart, restartConditions, redFlagPending, defaultRestartCompound } from './redFlag'
export * from './setup'
export { createRng, gaussianPair } from './rng'
export { pitStopTime, expectedPitStopTime, slowStopComponent, normalCdf } from './pitStop'
export type { PitStopCost } from './pitStop'
export { generateWeatherTimeline, openingTimeline } from './weather'
export { forecast, forecastOffset } from './forecast'
export type { WeatherForecast } from './forecast'
export { runQualifying, qualifyingRng } from './qualifying'
export type {
  RaceConfig, RaceState, CarState, SectorResult, OvertakeEvent,
  Compound, PaceMode, SectorIndex, TuningConstants, CompoundSpec,
  CircuitSpec, DriverSpec, TeamSpec, PitStop, StrategyPlan, StrategyBrain,
  TyreAllocation, DifficultyProfile, WeatherState, SafetyCarState,
  IncidentEvent, IncidentKind, NeutralisationKind,
  AttackLevel, QualifyingCall, QualifyingLap, QualifyingResult,
} from './types'
export type { ProjectionResult } from './projection'
export type { Rng } from './rng'
export { applyPlayerPit, applyPlayerPace, applyRestartTyre, applyCall } from './playerCalls'
export type { PlayerCall } from './playerCalls'
export { isFinished, simulate, replay, judgeCalls, pickBetter, futureSeed, playerStops, whatIfLapRange, addStopLapRange, whatIf } from './debrief'
export type { PlayerStop, WhatIfEdit, WhatIfResult } from './debrief'
export type { JudgedCall, Alternative, OptionOutcome, CallVerdict, DebriefResult } from './types'
export { lapHistory } from './raceHistory'
export type { LapHistory, CarHistory, NeutralisationPeriod } from './raceHistory'
export { rivalIntel, intelOffset } from './rivalIntel'
export type { RivalIntel } from './rivalIntel'
export { PIT_CLIFF_THRESHOLD } from './strategy'

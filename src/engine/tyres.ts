import type { CarState, Compound, CompoundSpec, DriverSpec, TuningConstants, TyreAllocation, WeatherState } from './types'

// Formula: offset + lin*age + pen * max(0, age - cliff)^2
export function tyreDelta(spec: CompoundSpec, ageLaps: number): number {
  const postCliff = Math.max(0, ageLaps - spec.cliff)
  return spec.offset + spec.lin * ageLaps + spec.pen * postCliff * postCliff
}

// 0 = fresh, 1 = at cliff, >1 = past cliff
export function tyreCliffFraction(spec: CompoundSpec, ageLaps: number): number {
  return spec.cliff > 0 ? ageLaps / spec.cliff : 0
}

// The age a tyre "feels" for wear purposes — accelerated by pace mode, the
// weather/compound mismatch, and relieved by the driver's tyre management skill.
// This MUST be the single source of truth for tyre wear: lapModel.ts uses it to
// compute pace, and every cliff-fraction consumer (AI pit decisions, the HUD
// gauge, radio warnings) must use it too, or a car can look fine on the gauge
// while it's already well past its real cliff (e.g. wet tyres on a dry track).
export function effectiveTyreAge(
  car: Pick<CarState, 'tyreAge' | 'paceMode' | 'compound' | 'lapsInDirtyAir'>,
  driver: Pick<DriverSpec, 'facets'>,
  weatherState: WeatherState,
  tuning: TuningConstants,
): number {
  const paceDegMultiplier = tuning.paceModes[car.paceMode].degMultiplier
  const wetDegKey = car.compound === 'I' ? 'inter' : car.compound === 'W' ? 'wet' : null
  const wetDegMult = wetDegKey ? (tuning.weather.wetDegMultiplier[wetDegKey]?.[weatherState] ?? 1.0) : 1.0
  const tyreManagementFactor = 1 - (driver.facets.tyreManagement / 100) * tuning.tyreManagement.degReliefFactor
  // Dirty air: sitting in another car's wake for consecutive laps cooks tyres
  // slightly faster (real-world overheating from turbulent air), capped so it
  // doesn't runaway for a car stuck in traffic for the whole race.
  const cappedDirtyAirLaps = Math.min(car.lapsInDirtyAir, tuning.traffic.dirtyAirDegCapLaps)
  const dirtyAirMult = 1 + cappedDirtyAirLaps * tuning.traffic.dirtyAirDegBonus
  return car.tyreAge * tyreManagementFactor * paceDegMultiplier * wetDegMult * dirtyAirMult
}

// Effectively-infinite sets — used when a RaceConfig doesn't specify
// tyreAllocationBase (back-compat: configs that don't care about M3 scarcity).
export const UNLIMITED_TYRE_ALLOCATION: TyreAllocation = { S: 999, M: 999, H: 999, I: 999, W: 999 }

// Nearest-available fallback order per requested compound, within the same
// family (dry stays dry, wet stays wet) — spec: "pick the nearest available
// dry compound (S↔M↔H)".
const COMPOUND_FALLBACK_ORDER: Record<Compound, Compound[]> = {
  S: ['S', 'M', 'H'],
  M: ['M', 'H', 'S'],
  H: ['H', 'M', 'S'],
  I: ['I', 'W'],
  W: ['W', 'I'],
}

// Returns the requested compound if sets remain, else the nearest available
// compound in the same family, else null if literally nothing is left.
export function resolveAllocatedCompound(
  requested: Compound,
  allocation: TyreAllocation,
): Compound | null {
  for (const c of COMPOUND_FALLBACK_ORDER[requested]) {
    if ((allocation[c] ?? 0) > 0) return c
  }
  return null
}

export function consumeTyreSet(allocation: TyreAllocation, compound: Compound): TyreAllocation {
  return { ...allocation, [compound]: Math.max(0, (allocation[compound] ?? 0) - 1) }
}

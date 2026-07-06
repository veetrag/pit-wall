import type { CarState, CompoundSpec, DriverSpec, TuningConstants, WeatherState } from './types'

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
  car: Pick<CarState, 'tyreAge' | 'paceMode' | 'compound'>,
  driver: Pick<DriverSpec, 'facets'>,
  weatherState: WeatherState,
  tuning: TuningConstants,
): number {
  const paceDegMultiplier = tuning.paceModes[car.paceMode].degMultiplier
  const wetDegKey = car.compound === 'I' ? 'inter' : car.compound === 'W' ? 'wet' : null
  const wetDegMult = wetDegKey ? (tuning.weather.wetDegMultiplier[wetDegKey]?.[weatherState] ?? 1.0) : 1.0
  const tyreManagementFactor = 1 - (driver.facets.tyreManagement / 100) * tuning.tyreManagement.degReliefFactor
  return car.tyreAge * tyreManagementFactor * paceDegMultiplier * wetDegMult
}

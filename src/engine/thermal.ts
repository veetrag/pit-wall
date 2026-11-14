import type { CarState, Compound, PaceMode, RaceConfig, ThermalState, TuningConstants, WeatherState } from './types'
import { trackTemp } from './track'

/**
 * Tyre temperature (spec 2026-10-24 §5; 2.1 scope Task 5). One scalar per car
 * (ruling H1). Pace comes only from distance outside the compound's window;
 * the out-lap cost is simply the cold side after fitTyres resets to blanket
 * temperature (H2), so the projection prices it through the same stop path.
 *
 * Invariant: a car has `thermal` <=> tyreTemp.enabled at initRace. Readers key
 * off `car.thermal`, never the switch, and the key is absent while off, so the
 * off path is the 2.0 engine byte for byte. No rng draw anywhere here.
 */
export function initThermal(t: TuningConstants): ThermalState {
  return { temp: t.tyreTemp.blankets + t.tyreTemp.formationWarm, coldLaps: 0, grainLaps: 0, heatWear: 0 }
}

/** A fresh set straight off the blankets (every stop, via fitTyres). */
export function outLapThermal(t: TuningConstants): ThermalState {
  return { temp: t.tyreTemp.blankets, coldLaps: 0, grainLaps: 0, heatWear: 0 }
}

/** The temperature the tyre is heading to this sector (°C). */
export function thermalTarget(config: RaceConfig, car: CarState, weather: WeatherState, neutralised: boolean): number {
  const tt = config.tuning.tyreTemp
  return trackTemp(config.circuit, weather, config.tuning) + tt.runningHeat + tt.paceHeat[car.paceMode]
    + (car.lapsInDirtyAir > 0 ? tt.dirtyAirHeat : 0) + (neutralised ? tt.neutralisedHeat : 0)
}

export function thermalWindow(
  config: RaceConfig, car: Pick<CarState, 'compound' | 'thermal'>, weather: WeatherState,
): { deficit: number; excess: number; applies: boolean } {
  const th = car.thermal
  const spec = config.compounds[car.compound]
  if (!th || !spec) return { deficit: 0, excess: 0, applies: false }
  const [lo, hi] = config.tuning.tyreTemp.windows[car.compound]
  // Ruling H3: the crossover model owns a tyre on the wrong family's weather.
  const applies = (spec.type === 'dry') === (weather === 'DRY')
  return { deficit: Math.max(0, lo - th.temp), excess: Math.max(0, th.temp - hi), applies }
}

/**
 * Seconds this sector, at the temperature the sector starts with. Ruling H6:
 * 0 while neutralised -- the tyres still cool (thermalAfterSector), so the
 * restart is cold, but nobody loses lap time behind the SC/VSC.
 */
export function thermalPace(config: RaceConfig, car: CarState, weather: WeatherState, neutralised = false): number {
  if (!car.thermal || neutralised) return 0
  const { deficit: d, excess: e, applies } = thermalWindow(config, car, weather)
  if (!applies) return 0
  const tt = config.tuning.tyreTemp
  const grain = car.thermal.grainLaps > 0 ? tt.grainPenalty : 0
  return (tt.coldCoeff * (d / 10) ** 2 + tt.overheatCoeff * (e / 10) ** 2 + grain) / 3
}

/**
 * The state after one sector: temperature toward the target, and overheating
 * wear from the temperature the sector started with (spec §5.2). heatWear is
 * extra laps of effective tyre age; effectiveTyreAge adds it.
 */
export function thermalAfterSector(config: RaceConfig, car: CarState, weather: WeatherState, neutralised: boolean): ThermalState {
  const th = car.thermal!
  const target = thermalTarget(config, car, weather, neutralised)
  const { excess, applies } = thermalWindow(config, car, weather)
  const wear = applies && excess > 0 ? config.tuning.tyreTemp.overheatWearPerLap * (excess / 10) / 3 : 0
  return {
    ...th,
    temp: th.temp + config.tuning.tyreTemp.responsePerSector * (target - th.temp),
    heatWear: wear === 0 ? th.heatWear : th.heatWear + wear,
  }
}

/**
 * Seconds the first lap on a fresh `compound` costs from blanket temperature
 * (spec §5.4): three sectors, temperature evolving, exactly as stepSector
 * charges them after fitTyres. 0 while off (keyed on the car, per the
 * invariant), and 0 while `neutralised` (ruling H6). For the pit panel.
 */
export function outLapCost(
  config: RaceConfig, car: CarState, compound: Compound, weather: WeatherState, neutralised = false,
): number {
  if (!car.thermal) return 0
  let c: CarState = { ...car, compound, thermal: outLapThermal(config.tuning) }
  let sum = 0
  for (let s = 0; s < 3; s++) {
    sum += thermalPace(config, c, weather, neutralised)
    c = { ...c, thermal: thermalAfterSector(config, c, weather, neutralised) }
  }
  return sum
}

/**
 * Lap-boundary bookkeeping: graining onset and countdown (spec §5.2, ruling H4).
 * A soft or medium held more than grainMargin below its window for
 * grainOnsetLaps lap ends on a still-green dry track (grip under grainMaxGrip)
 * grains for grainDurationLaps. A grain in progress only counts down.
 */
export function thermalAtLapEnd(
  config: RaceConfig, car: CarState, weather: WeatherState, grip: number,
): { thermal: ThermalState; grained: boolean } {
  const th = car.thermal!
  const tt = config.tuning.tyreTemp
  if (th.grainLaps > 0) return { thermal: { ...th, grainLaps: th.grainLaps - 1 }, grained: false }
  if (weather !== 'DRY' || !tt.grainCompounds.includes(car.compound)) {
    return { thermal: th.coldLaps === 0 ? th : { ...th, coldLaps: 0 }, grained: false }
  }
  const [lo] = tt.windows[car.compound]
  const coldLaps = th.temp < lo - tt.grainMargin ? th.coldLaps + 1 : 0
  if (coldLaps >= tt.grainOnsetLaps && grip < tt.grainMaxGrip) {
    return { thermal: { ...th, coldLaps: 0, grainLaps: tt.grainDurationLaps }, grained: true }
  }
  return { thermal: { ...th, coldLaps }, grained: false }
}

/**
 * Where the tyre sits against its window, for the UI and radio. About the
 * window, not pace: a car behind the SC still reads COLD. Null while off, and
 * null while thermal pace does not apply (ruling H3: a slick on a wet track or
 * a wet-family tyre on a dry one belongs to the crossover model), so no
 * consumer -- meter, tower tag, radio, coach mark -- reads HOT/COLD there.
 */
export function thermalStatus(
  config: RaceConfig, car: CarState, weather: WeatherState,
): { zone: 'cold' | 'window' | 'hot'; lo: number; hi: number; temp: number; grainLaps: number } | null {
  if (!car.thermal) return null
  const [lo, hi] = config.tuning.tyreTemp.windows[car.compound]
  const { deficit, excess, applies } = thermalWindow(config, car, weather)
  if (!applies) return null
  const zone: 'cold' | 'window' | 'hot' = deficit > 0 ? 'cold' : excess > 0 ? 'hot' : 'window'
  return { zone, lo, hi, temp: car.thermal.temp, grainLaps: car.thermal.grainLaps }
}

/**
 * The AI's thermal pace call (spec §5.3): back off a push on an overheating
 * tyre, push to bring a cold tyre in. Smart/optimal only; the caller skips
 * naive brains. Neutralised: no call (the field is held anyway). Pure, no draw.
 */
export function aiThermalPaceMode(
  config: RaceConfig, car: CarState, weather: WeatherState, neutralised: boolean, proposed: PaceMode,
): PaceMode {
  if (!car.thermal || neutralised) return proposed
  const { deficit, excess, applies } = thermalWindow(config, car, weather)
  if (!applies) return proposed
  const ai = config.tuning.tyreTemp.ai
  if (proposed === 'push' && excess > ai.hotExcess) return 'neutral'
  if (deficit > ai.coldDeficit) return 'push'
  return proposed
}

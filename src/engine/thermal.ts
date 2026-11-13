import type { CarState, RaceConfig, ThermalState, TuningConstants, WeatherState } from './types'
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

/** The state after one sector: temperature toward the target (overheat wear: Task 6). */
export function thermalAfterSector(config: RaceConfig, car: CarState, weather: WeatherState, neutralised: boolean): ThermalState {
  const th = car.thermal!
  const target = thermalTarget(config, car, weather, neutralised)
  return { ...th, temp: th.temp + config.tuning.tyreTemp.responsePerSector * (target - th.temp) }
}

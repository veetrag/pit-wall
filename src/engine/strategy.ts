import type { RaceConfig, CarState, RaceState, Compound } from './types'
import { tyreCliffFraction } from './tyres'

const CLIFF_EMERGENCY_THRESHOLD = 1.5

export function shouldAIPit(
  config: RaceConfig,
  car: CarState,
  _state: RaceState,
): { pit: boolean; compound: Compound } {
  const { compounds } = config
  const nextStop = car.strategy.plannedStops.find(s => s.lap >= car.lap)

  // Emergency pit: tyre deeply past cliff
  const spec = compounds[car.compound]!
  if (tyreCliffFraction(spec, car.tyreAge) >= CLIFF_EMERGENCY_THRESHOLD) {
    const fallback: Compound = car.compound === 'S' ? 'M' : car.compound === 'M' ? 'H' : 'H'
    return { pit: true, compound: nextStop?.compound ?? fallback }
  }

  // Planned stop
  if (nextStop && car.lap >= nextStop.lap) {
    return { pit: true, compound: nextStop.compound }
  }

  return { pit: false, compound: car.compound }
}

import type { RaceConfig, CircuitSpec } from '@engine/index'
import type { Tuning } from '@data/validators'
import type { Difficulty } from './settingsStore'
import type { PlayerStrategyChoice } from './seasonStore'
import type { UpgradeOverlayInput } from './upgradeOverlay'
import { buildRaceConfig } from './buildRaceConfig'

export type LapsPercent = 25 | 50 | 75 | 100
export type WeatherMix = 'circuit' | 'dry' | 'changeable' | 'wet'

/**
 * Everything buildRaceConfig needs, as data (spec 2026-10-24 §5.2, R19). With
 * the seed and the player's calls it reproduces a race exactly; it is what a
 * custom start and its share code carry.
 */
export interface RaceRecipe {
  seed: number
  playerDriverId: string
  circuitId: string
  difficulty: Difficulty
  strategy: PlayerStrategyChoice | null
  overlay: UpgradeOverlayInput | null
  gridOrder: string[] | null
  dryStart: boolean
  sprint: boolean
  allDry: boolean
  lapsPercent: LapsPercent
  weather: WeatherMix
}

export function buildConfigFromRecipe(r: RaceRecipe): RaceConfig {
  return buildRaceConfig(r.seed, r.playerDriverId, r.circuitId, r.difficulty, r.strategy, r.overlay,
    r.gridOrder ?? undefined, r.dryStart, r.sprint, r.allDry, r.lapsPercent, r.weather)
}

/** The circuit as a weather mix races it. 'circuit' and 'dry' return the data object itself. */
export function weatherCircuit(c: CircuitSpec, mix: WeatherMix, t: Tuning): CircuitSpec {
  switch (mix) {
    case 'circuit': case 'dry': return c
    case 'changeable': {
      const w = t.custom.weather.changeable
      return { ...c, rainProbability: Math.min(w.rainMax, Math.max(w.rainMin, (c.rainProbability ?? 0) * w.rainScale)), weatherBias: w.bias }
    }
    case 'wet': return { ...c, rainProbability: t.custom.weather.wet.rainProbability, weatherBias: t.custom.weather.wet.bias }
    default: { const never: never = mix; return never }
  }
}

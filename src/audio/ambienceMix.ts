import type { RaceState, PaceMode, WeatherState, NeutralisationKind } from '@engine/types'
import { neutralisationKind } from '@engine/incidents'

/*
 * Race state -> ambience mix. PURE: no Web Audio, no stores, no clocks.
 * Both functions write into a caller-owned object so the per-sector call
 * allocates nothing (CLAUDE.md §5 performance budget).
 */

export type AmbiencePhase = 'idle' | 'starting' | 'racing' | 'red_flag' | 'finished'

export interface AmbienceInput {
  phase: AmbiencePhase
  paused: boolean
  /** A radio request / commentary line is on screen: duck the bed under it. */
  radioActive: boolean
  neutralisation: NeutralisationKind | null
  weather: WeatherState
  paceMode: PaceMode
  /** 0..1, 1 = a car within ~0.3s of the player (ahead or behind). */
  battle: number
  /** 0..1, 1 = whole running field within a few seconds. */
  fieldTightness: number
  finalLap: boolean
}

export interface AmbienceMix {
  master: number
  engineGain: number
  /** Multiplier on the base engine fundamental (1 = racing note). */
  enginePitch: number
  /** Lowpass cutoff in Hz: brighter = harder-driven engines. */
  engineCutoff: number
  crowdGain: number
  rainGain: number
  /** Pit-lane murmur under a red flag. */
  murmurGain: number
}

export function makeAmbienceInput(): AmbienceInput {
  return {
    phase: 'idle', paused: false, radioActive: false, neutralisation: null, weather: 'DRY',
    paceMode: 'neutral', battle: 0, fieldTightness: 0, finalLap: false,
  }
}

export function makeAmbienceMix(): AmbienceMix {
  return { master: 0, engineGain: 0, enginePitch: 1, engineCutoff: 220, crowdGain: 0, rainGain: 0, murmurGain: 0 }
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Gap (s) at which a car counts as "in a battle" with the player. */
export const BATTLE_GAP_S = 2.0
/** Leader-to-last spread (s) at which the field counts as fully strung out. */
export const SPREAD_FULL_S = 60

export const WETNESS: Record<WeatherState, number> = { DRY: 0, DAMP: 0.5, WET: 1 }

/** Fill `out` from the live race. Reads only; never mutates `state`. */
export function deriveAmbienceInput(
  state: RaceState | null,
  phase: AmbiencePhase,
  paused: boolean,
  radioActive: boolean,
  out: AmbienceInput,
): AmbienceInput {
  out.phase = phase
  out.paused = paused
  out.radioActive = radioActive
  if (!state) {
    out.neutralisation = null; out.weather = 'DRY'; out.paceMode = 'neutral'
    out.battle = 0; out.fieldTightness = 0; out.finalLap = false
    return out
  }
  out.neutralisation = neutralisationKind(state.safetyCar)
  out.weather = state.weatherState
  out.finalLap = state.lap >= state.totalLaps - 1

  // One pass, no sorting/allocation: player time, nearest rival either side,
  // and the running field's min/max race time.
  let player: number | null = null
  let min = Infinity, max = -Infinity
  out.paceMode = 'neutral'
  for (const c of state.cars) {
    if (c.retired) continue
    if (c.raceTime < min) min = c.raceTime
    if (c.raceTime > max) max = c.raceTime
    if (c.isPlayer) { player = c.raceTime; out.paceMode = c.paceMode }
  }
  let nearest = Infinity
  if (player !== null) {
    for (const c of state.cars) {
      if (c.retired || c.isPlayer) continue
      const d = Math.abs(c.raceTime - player)
      if (d < nearest) nearest = d
    }
  }
  out.battle = nearest === Infinity ? 0 : clamp01(1 - nearest / BATTLE_GAP_S)
  out.fieldTightness = max > min ? clamp01(1 - (max - min) / SPREAD_FULL_S) : 0
  return out
}

/*
 * Levels are absolute Web Audio gains, tuned by ear against the existing
 * cue sounds (0.12-0.3): the bed sits well underneath them.
 */
export const LEVELS = {
  engineBase: 0.045,
  engineBattle: 0.025,
  engineTight: 0.01,
  engineCutoffBase: 240,
  crowdBase: 0.03,
  crowdBattle: 0.015,
  rainMax: 0.075,
  murmur: 0.03,
  radioDuck: 0.55,
  finalLapCrowd: 1.7,
  chequerCrowd: 2.6,
} as const

const PACE: Record<PaceMode, { pitch: number; cutoff: number; gain: number }> = {
  push: { pitch: 1.08, cutoff: 1.45, gain: 1.15 },
  neutral: { pitch: 1, cutoff: 1, gain: 1 },
  conserve: { pitch: 0.93, cutoff: 0.75, gain: 0.85 },
}

export function computeAmbienceMix(i: AmbienceInput, out: AmbienceMix): AmbienceMix {
  const wet = WETNESS[i.weather]
  const pace = PACE[i.paceMode]

  out.engineGain = (LEVELS.engineBase + LEVELS.engineBattle * i.battle + LEVELS.engineTight * i.fieldTightness) * pace.gain
  out.enginePitch = pace.pitch
  out.engineCutoff = LEVELS.engineCutoffBase * pace.cutoff * (1 + 0.4 * i.battle)
  out.crowdGain = (LEVELS.crowdBase + LEVELS.crowdBattle * i.battle) * (1 - 0.3 * wet)
  out.rainGain = LEVELS.rainMax * wet
  out.murmurGain = 0
  out.master = 1

  switch (i.neutralisation) {
    case 'sc':
      out.engineGain *= 0.55; out.enginePitch *= 0.68; out.engineCutoff = 150; out.crowdGain *= 0.6
      break
    case 'vsc':
      out.engineGain *= 0.7; out.enginePitch *= 0.8; out.engineCutoff = 180; out.crowdGain *= 0.75
      break
    case 'red':
    case null:
      break
    default: {
      const never: never = i.neutralisation
      return never
    }
  }

  switch (i.phase) {
    case 'idle':
      out.master = 0
      break
    case 'starting':
      // On the grid: engines revving, crowd up for the lights.
      out.engineGain = LEVELS.engineBase * 1.2; out.enginePitch = 0.9; out.engineCutoff = 300
      out.crowdGain = LEVELS.crowdBase * 1.5
      break
    case 'racing':
      if (i.finalLap) out.crowdGain *= LEVELS.finalLapCrowd
      break
    case 'red_flag':
      // Engines off, cars in the pit lane: murmur and a hushed crowd.
      out.engineGain = 0; out.murmurGain = LEVELS.murmur; out.crowdGain = LEVELS.crowdBase * 0.5
      break
    case 'finished':
      // Chequered flag: the crowd swells, engines back off to a cool-down lap.
      out.crowdGain = LEVELS.crowdBase * LEVELS.chequerCrowd
      out.engineGain = LEVELS.engineBase * 0.35; out.enginePitch = 0.75; out.engineCutoff = 170
      break
    default: {
      const never: never = i.phase
      return never
    }
  }

  if (i.paused) out.master = 0
  else if (i.radioActive && out.master > 0) out.master = LEVELS.radioDuck
  return out
}

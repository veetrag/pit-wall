import { useRaceStore } from '@state/raceStore'
import type { SafetyCarState } from '@engine/types'

/**
 * The single read of safety-car state for the whole UI.
 *
 * Four surfaces need this (banner, pit panel, timing tower, track canvas) and
 * they must agree: a banner saying SAFETY CAR while the pit panel quotes the
 * full green-flag pit loss is worse than showing neither.
 */
export function useSafetyCar(): SafetyCarState | null {
  return useRaceStore(s => s.raceState?.safetyCar ?? null)
}

/**
 * How many neutralisations (safety cars, virtual safety cars AND red flags,
 * spec 1.6 §4) have been deployed this race so far. An SC superseding a VSC counts as a new one.
 *
 * DERIVED FROM THE INCIDENT LOG, not from watching `safetyCar` go null -> set.
 * The log is append-only and monotonic, so a consumer that fires a one-shot in
 * a `useEffect` keyed on this number cannot miss a deployment even if two sim
 * ticks land in one React render -- or an SC replaces a VSC without the state
 * ever passing through null.
 */
export function useSafetyCarDeployCount(): number {
  return useRaceStore(s =>
    s.raceState?.incidents.reduce(
      (n, i) => n + (i.kind === 'safety_car_deployed' || i.kind === 'vsc_deployed' || i.kind === 'red_flag' ? 1 : 0), 0,
    ) ?? 0,
  )
}

/** SC and VSC deployments only (no red flags): what the safety_car coach mark counts. */
export function useSafetyCarOnlyDeployCount(): number {
  return useRaceStore(s =>
    s.raceState?.incidents.reduce(
      (n, i) => n + (i.kind === 'safety_car_deployed' || i.kind === 'vsc_deployed' ? 1 : 0), 0,
    ) ?? 0,
  )
}

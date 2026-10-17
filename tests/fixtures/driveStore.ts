import { useRaceStore } from '@state/raceStore'
import { defaultRestartCompound } from '@engine/redFlag'

/**
 * Drives the live race store to the flag the way the app does: steps while
 * racing, answers a red-flag card with the default tyre, and runs the lights.
 * `before` runs before each step (make calls there), `after` after it. Bounded:
 * returns the number of steps taken; callers assert the terminal phase.
 */
export function driveToFlag(
  maxSteps: number,
  hooks: { before?: (n: number) => void; after?: (n: number) => void } = {},
): number {
  const r = () => useRaceStore.getState()
  let n = 0
  for (let guard = 0; guard < maxSteps * 2 && n < maxSteps; guard++) {
    const phase = r().phase
    if (phase === 'finished' || phase === 'idle') break
    if (phase === 'red_flag') { r().confirmRedFlagRestart(defaultRestartCompound(r().config!, r().raceState!)); continue }
    if (phase === 'starting') { r().confirmRaceStart(); continue }
    hooks.before?.(n)
    r().step()
    n++
    hooks.after?.(n)
  }
  return n
}

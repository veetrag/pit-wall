/**
 * Career statistics (spec 1.6 §7). PURE: no store, no React -- the same
 * discipline as badges.ts, so every number on the STATS screen is a fold over
 * the race log and unit-tested here.
 */

/**
 * The longest run of completed laps on one set of tyres. `changeLaps` are the
 * completed-lap counts at each tyre change; `lapsRun` is the car's completed
 * laps at the flag (or at retirement).
 */
export function longestStint(changeLaps: readonly number[], lapsRun: number): number {
  const marks = [0, ...changeLaps, lapsRun]
  let best = 0
  for (let i = 1; i < marks.length; i++) best = Math.max(best, marks[i]! - marks[i - 1]!)
  return Math.max(0, best)
}

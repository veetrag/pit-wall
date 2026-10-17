/**
 * Career statistics (spec 1.6 §7). PURE: no store, no React -- the same
 * discipline as badges.ts, so every number on the STATS screen is a fold over
 * the race log and unit-tested here.
 */

import type { RaceFact } from './badges'
import type { Compound } from '@engine/types'

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

export interface RecordLine { races: number; wins: number; podiums: number; best: number | null }
export interface CareerStatsView {
  gpRaces: number
  bestByCircuit: { circuitId: string; best: number | null; races: number }[]
  circuitPartial: boolean
  byStartCompound: { compound: Compound; races: number; winRate: number; podiumRate: number }[]
  compoundPartial: boolean
  longestStint: number | null
  stintPartial: boolean
  biggestComeback: { gained: number; season: number; round: number } | null
  wet: RecordLine
  sprint: RecordLine
  dnfRate: number | null
  averageBySeason: { season: number; races: number; average: number | null }[]
}

const COMPOUND_ORDER: Compound[] = ['S', 'M', 'H', 'I', 'W']
const classified = (f: RaceFact) => !f.retired
const won = (f: RaceFact) => classified(f) && f.finish === 1
const podium = (f: RaceFact) => classified(f) && f.finish <= 3

function recordOf(facts: readonly RaceFact[]): RecordLine {
  const fin = facts.filter(classified).map(f => f.finish)
  return {
    races: facts.length, wins: facts.filter(won).length, podiums: facts.filter(podium).length,
    best: fin.length ? Math.min(...fin) : null,
  }
}

/** Every number on the STATS screen. Grand Prix facts only, except `sprint` and `longestStint` (plan Task 6 ruling). */
export function careerStats(log: readonly RaceFact[], circuitOrder: readonly string[]): CareerStatsView {
  const gp = log.filter(f => f.kind !== 'sprint')
  const sprints = log.filter(f => f.kind === 'sprint')

  const bestByCircuit = circuitOrder.map(circuitId => {
    const here = gp.filter(f => f.circuitId === circuitId)
    const fin = here.filter(classified).map(f => f.finish)
    return { circuitId, best: fin.length ? Math.min(...fin) : null, races: here.length }
  })

  const byStartCompound = COMPOUND_ORDER.flatMap(compound => {
    const on = gp.filter(f => f.startCompound === compound)
    return on.length === 0 ? [] : [{
      compound, races: on.length,
      winRate: on.filter(won).length / on.length,
      podiumRate: on.filter(podium).length / on.length,
    }]
  })

  const stints = log.map(f => f.longestStint).filter((n): n is number => n !== undefined)

  let biggestComeback: CareerStatsView['biggestComeback'] = null
  for (const f of gp) {
    const gained = f.grid - f.finish
    if (classified(f) && gained > 0 && (!biggestComeback || gained > biggestComeback.gained)) {
      biggestComeback = { gained, season: f.season, round: f.round }
    }
  }

  const seasons = [...new Set(gp.map(f => f.season))].sort((a, b) => a - b)
  const averageBySeason = seasons.map(season => {
    const inSeason = gp.filter(f => f.season === season)
    const fin = inSeason.filter(classified).map(f => f.finish)
    return { season, races: inSeason.length, average: fin.length ? fin.reduce((a, b) => a + b, 0) / fin.length : null }
  })

  return {
    gpRaces: gp.length,
    bestByCircuit,
    circuitPartial: gp.some(f => f.circuitId === undefined),
    byStartCompound,
    compoundPartial: gp.some(f => f.startCompound === undefined),
    longestStint: stints.length ? Math.max(...stints) : null,
    stintPartial: log.some(f => f.longestStint === undefined),
    biggestComeback,
    wet: recordOf(gp.filter(f => f.wet)),
    sprint: recordOf(sprints),
    dnfRate: gp.length ? gp.filter(f => f.retired).length / gp.length : null,
    averageBySeason,
  }
}

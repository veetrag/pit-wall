import { create } from 'zustand'
import { loadGameData } from '@data/validators'
import { newlyEarned, type RaceFact } from './badges'

/**
 * The career: the layer above a season that owns what survives one.
 *
 * It deliberately does NOT own purchasedTiers or rivalDevelopment. Those are
 * read every race and live on seasonStore; the career's job at a boundary is to
 * TRANSFORM them and hand them back. That is also why rollOverSeason returns
 * the eroded tiers instead of writing them: seasonStore imports this module as
 * a value, so a value import back would close an ESM cycle -- the same
 * constraint documented at src/state/buildRaceConfig.ts:25.
 */

export interface SeasonSummary {
  seasonNumber: number
  teamId: string
  driverId: string
  championshipPosition: number
  points: number
  wins: number
}

export interface CareerRecord {
  /** 1-based. A career's first season is 1, and season 1 must seed exactly as today. */
  seasonNumber: number
  titles: number
  /** Career wins, across every season. */
  wins: number
  /** Wins in the CURRENT season only; reset at each rollover so SeasonSummary
   *  can record what the season was actually worth. */
  seasonWins: number
  podiums: number
  poles: number
  racesStarted: number
  /** Lowest position number achieved; null before any race. */
  bestFinish: number | null
  seasonHistory: SeasonSummary[]
  /**
   * Every race this career has run, oldest first. Badges fold over this.
   *
   * A log rather than incremental counters: "longest run of consecutive
   * finishes" is subtly wrong as a maintained counter and obviously right as
   * a fold, and a log makes a badge added later retroactive over races
   * already played. ~12 entries per season; a few KB at any real career
   * length. See docs/superpowers/specs/2026-09-19-badges-design.md §2.2.
   */
  raceLog: RaceFact[]
}

const FRESH: CareerRecord = {
  seasonNumber: 1, titles: 0, wins: 0, seasonWins: 0, podiums: 0, poles: 0,
  racesStarted: 0, bestFinish: null, seasonHistory: [], raceLog: [],
}

/** Each attribute drops by at most `decay` tiers, floored at 0. */
export function erodeTiers(
  tiers: Record<string, number>, decay: number,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [id, owned] of Object.entries(tiers)) {
    out[id] = Math.max(0, owned - decay)
  }
  return out
}

/**
 * One off-season boost for every rival.
 *
 * It reuses the SAME pool constant the per-race accrual uses, so the winter
 * counts as a number of extra races rather than a second economy to tune.
 * Winning the title buys the grid a bigger winter -- a single legible step, not
 * a continuous function of margin, because a smooth rubber band keyed to how
 * well the player drives is the kind of mechanic players detect and resent.
 */
export function escalateRivals(
  current: Record<string, number>, wonTitle: boolean,
): Record<string, number> {
  const { cars, upgrades, tuning } = loadGameData()
  const { poolPerRace, facets } = upgrades.rivalDevelopment
  const { base, championBonus } = tuning.career.rivalCatchUp
  const winterRaces = base + (wonTitle ? championBonus : 0)

  const next = { ...current }
  for (const team of cars.teams) {
    const rate = team.developmentRate ?? 1.0
    next[team.id] = (next[team.id] ?? 0) + poolPerRace * rate * facets.length * winterRaces
  }
  return next
}

interface CareerStore extends CareerRecord {
  hasCareer: boolean
  /**
   * Badges earned by the race just recorded.
   *
   * Deliberately on the STORE and not on CareerRecord: careerSnapshotFrom
   * takes a CareerRecord, so keeping this off the record makes "it is never
   * saved" a type-level guarantee rather than a convention. It is a UI
   * signal -- if it persisted, reopening the app would re-toast an old badge.
   */
  justEarned: string[]
  recordRace: (r: {
    position: number; retired: boolean; pole: boolean
    round: number; grid: number; stops: number; overtakes: number; wet: boolean
  }) => void
  /**
   * Ends a season. Takes the player's current tiers and returns the eroded
   * ones -- it never reads or writes seasonStore, which is what keeps this
   * module free of the import cycle described in the header.
   */
  rollOverSeason: (
    s: SeasonSummary, tiers: Record<string, number>,
  ) => { erodedTiers: Record<string, number> }
  beginCareer: () => void
  endCareer: () => void
  resumeCareer: (snap: CareerRecord) => void
}

export const useCareerStore = create<CareerStore>((set, get) => ({
  ...FRESH,
  hasCareer: false,
  justEarned: [],

  recordRace({ position, retired, pole, round, grid, stops, overtakes, wet }) {
    const s = get()
    // A DNF is never a win or a podium, matching recordRaceResult, which
    // already scores a retirement as 0 points regardless of classified
    // position. A car classified P3 because others retired behind it did not
    // stand on a podium.
    const scored = !retired
    const won = scored && position === 1

    const fact: RaceFact = {
      season: s.seasonNumber, round, grid,
      finish: position, retired, pole, stops, overtakes, wet,
    }

    // Built as a whole record so the badge difference below compares two
    // complete states rather than a patch against a partial one.
    const next: CareerRecord = {
      seasonNumber: s.seasonNumber,
      titles: s.titles,
      wins: s.wins + (won ? 1 : 0),
      seasonWins: s.seasonWins + (won ? 1 : 0),
      podiums: s.podiums + (scored && position <= 3 ? 1 : 0),
      poles: s.poles + (pole ? 1 : 0),
      racesStarted: s.racesStarted + 1,
      bestFinish: scored
        ? (s.bestFinish === null ? position : Math.min(s.bestFinish, position))
        : s.bestFinish,
      seasonHistory: s.seasonHistory,
      raceLog: [...s.raceLog, fact],
    }

    set({ ...next, justEarned: newlyEarned(s, next) })
  },

  rollOverSeason(summary, tiers) {
    const s = get()
    const { tierDecayPerSeason } = loadGameData().tuning.career
    set({
      seasonNumber: s.seasonNumber + 1,
      titles: s.titles + (summary.championshipPosition === 1 ? 1 : 0),
      // The caller cannot know this -- seasonStore does not count wins -- so
      // the store fills it in from its own season-scoped counter.
      seasonHistory: [...s.seasonHistory, { ...summary, wins: s.seasonWins }],
      seasonWins: 0,
    })
    return { erodedTiers: erodeTiers(tiers, tierDecayPerSeason) }
  },

  beginCareer() { set({ ...FRESH, hasCareer: true, justEarned: [] }) },
  endCareer() { set({ ...FRESH, hasCareer: false, justEarned: [] }) },
  resumeCareer(snap) { set({ ...snap, hasCareer: true, justEarned: [] }) },
}))

import { create } from 'zustand'
import { loadGameData } from '@data/validators'
import { newlyEarned, type RaceFact } from './badges'
import type { Wing } from '@engine/setup'

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
  /**
   * Team id -> ladder offset. The one piece of state that crosses seasons for
   * EVERY team, which is why it is the career's and not the season's. Missing
   * key means 0. See docs/superpowers/specs/2026-10-09-team-ladder-design.md.
   */
  teamTiers: Record<string, number>
  /**
   * Circuit id -> the wing the player last ran there. A convenience: the
   * strategy screen opens on it. Missing key means no memory yet, and the
   * UI falls back to the circuit's own default.
   */
  wingByCircuit: Record<string, Wing>
}

const FRESH: CareerRecord = {
  seasonNumber: 1, titles: 0, wins: 0, seasonWins: 0, podiums: 0, poles: 0,
  racesStarted: 0, bestFinish: null, seasonHistory: [], raceLog: [], teamTiers: {}, wingByCircuit: {},
}

/**
 * Each attribute drops by at most `decay` tiers, but never below `floor`.
 *
 * The floor is what stops erosion from being a flat tax on everyone. With
 * tierCosts [10, 18, 27] and 120 points of race income a season, a decay that
 * reaches every tier bills a climbing player for ground they are still paying
 * off, and the Development screen becomes "rebuy what you lost" for the whole
 * career. A floor of 2 taxes only the summit: tier 3 slips to 2, and tiers 1
 * and 2 are yours to keep.
 *
 * It cannot RAISE a tier. An attribute already below the floor is untouched --
 * hence the Math.min, without which floor 2 would gift a tier-1 attribute a
 * free upgrade every winter.
 */
export function erodeTiers(
  tiers: Record<string, number>, decay: number, floor = 0,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [id, owned] of Object.entries(tiers)) {
    out[id] = Math.max(Math.min(owned, floor), owned - decay, 0)
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
  recordRace: (r: RaceRecordInput) => void
  /**
   * Banks the season that has just finished: the title, the history entry,
   * the season-win reset, and the badges those earn. Called on the TRANSITION
   * to the championship screen, not when the player leaves it.
   *
   * Split out of rollOverSeason because a title used to be recorded only when
   * the player tapped NEXT SEASON. The championship screen therefore showed a
   * career record that did not yet contain the title just won, and the
   * Champion badge could not be announced there without inventing a second
   * source of truth for it.
   *
   * It deliberately does NOT advance seasonNumber: that feeds seedFor(), and
   * moving it would shift every seed in the game.
   *
   * Returns whether it actually banked. The idempotency guard below is the
   * only place that knows a season was already recorded, so the caller needs
   * that answer to keep its own once-per-season side effects -- the season-end
   * development bonus -- from firing twice on a re-entry.
   */
  recordSeasonEnd: (s: SeasonSummary) => boolean
  /**
   * Starts the next season. Takes the player's current tiers and returns the
   * eroded ones -- it never reads or writes seasonStore, which is what keeps
   * this module free of the import cycle described in the header.
   */
  rollOverSeason: (
    tiers: Record<string, number>,
  ) => { erodedTiers: Record<string, number> }
  /**
   * Replaces the ladder offsets. seasonStore settles the ladder at season end
   * and hands the result here, the same way rollOverSeason hands back eroded
   * tiers -- this module never reads seasonStore.
   */
  setTeamTiers: (tiers: Record<string, number>) => void
  rememberWing: (circuitId: string, wing: Wing) => void
  beginCareer: () => void
  endCareer: () => void
  resumeCareer: (snap: CareerRecord) => void
}

/** One race, as the career records it. */
export interface RaceRecordInput {
  position: number; retired: boolean; pole: boolean
  round: number; grid: number; stops: number; overtakes: number; wet: boolean
}

/**
 * The career record after one more race. Pure, so the result screen can ask
 * "what would keeping this race award?" without recording anything -- see
 * previewRaceBadges, and recordRaceResult / nextRace in seasonStore for why a
 * race is only recorded when the player keeps it.
 */
export function nextRecordAfterRace(s: CareerRecord, r: RaceRecordInput): CareerRecord {
  const { position, retired, pole, round, grid, stops, overtakes, wet } = r
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
    teamTiers: s.teamTiers,
    wingByCircuit: s.wingByCircuit,
  }

  return next
}

/**
 * The badges keeping this race would award, computed exactly as recordRace
 * computes them. The result screen shows these before the player chooses
 * between NEXT RACE and RETRY, so a preview and a real award cannot differ.
 */
export function previewRaceBadges(s: CareerRecord, r: RaceRecordInput): string[] {
  return newlyEarned(s, nextRecordAfterRace(s, r))
}

export const useCareerStore = create<CareerStore>((set, get) => ({
  ...FRESH,
  hasCareer: false,
  justEarned: [],

  recordRace(r) {
    const s = get()
    const next = nextRecordAfterRace(s, r)
    set({ ...next, justEarned: newlyEarned(s, next) })
  },

  recordSeasonEnd(summary) {
    const s = get()
    /*
     * Idempotent for a season already banked. nextRace() sets phase
     * 'championship' whenever raceIndex passes the final round, and any
     * re-entry of that path -- a restored save, a future retry button --
     * would otherwise award a SECOND title for the same season. Titles are
     * the rarest thing in the game; double-counting one is worse than
     * missing one.
     */
    if (s.seasonHistory.some(h => h.seasonNumber === summary.seasonNumber)) return false

    // Built as a whole record, same as recordRace, so newlyEarned compares two
    // complete states. titles is bumped here and ONLY here -- a season win is
    // not a race, so recordRace never sees it -- which is why this action must
    // compute justEarned itself: champion/dynasty can only ever become true
    // when a season ends, never at a race.
    const next: CareerRecord = {
      // NOT advanced here. The season has ENDED; the next one starts in
      // rollOverSeason. seasonNumber feeds seedFor().
      seasonNumber: s.seasonNumber,
      titles: s.titles + (summary.championshipPosition === 1 ? 1 : 0),
      wins: s.wins,
      // The caller cannot know this -- seasonStore does not count wins -- so
      // the store fills it in from its own season-scoped counter.
      seasonHistory: [...s.seasonHistory, { ...summary, wins: s.seasonWins }],
      seasonWins: 0,
      podiums: s.podiums,
      poles: s.poles,
      racesStarted: s.racesStarted,
      bestFinish: s.bestFinish,
      // Ending a season is not a race: raceLog is carried over unchanged.
      raceLog: s.raceLog,
      teamTiers: s.teamTiers,
      wingByCircuit: s.wingByCircuit,
    }

    set({ ...next, justEarned: newlyEarned(s, next) })
    return true
  },

  rollOverSeason(tiers) {
    const { tierDecayPerSeason, tierDecayFloor } = loadGameData().tuning.career
    // Only the season counter and the tier erosion remain here. The title and
    // the history entry were banked by recordSeasonEnd when the season ended.
    set({ seasonNumber: get().seasonNumber + 1 })
    return { erodedTiers: erodeTiers(tiers, tierDecayPerSeason, tierDecayFloor) }
  },

  setTeamTiers(teamTiers) { set({ teamTiers }) },
  rememberWing(circuitId, wing) { set(s => ({ wingByCircuit: { ...s.wingByCircuit, [circuitId]: wing } })) },
  beginCareer() { set({ ...FRESH, hasCareer: true, justEarned: [] }) },
  endCareer() { set({ ...FRESH, hasCareer: false, justEarned: [] }) },
  resumeCareer(snap) { set({ ...snap, hasCareer: true, justEarned: [] }) },
}))

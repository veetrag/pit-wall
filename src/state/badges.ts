/**
 * Badges: fifteen cosmetic records of what the player has done.
 *
 * Every badge is a PURE PREDICATE over the career record. Nothing about a
 * badge is persisted -- no "earned" list, no flags. That is deliberate: a
 * stored earned-list is a second source of truth that drifts from the stats
 * it claims to summarise, can award twice, and cannot retroactively grant a
 * badge added later. Deriving instead means the trophy case and the stats
 * screen above it are reading the same numbers, always.
 *
 * This module is pure. It imports no store, no React and no Zustand, so it
 * unit-tests directly. It also declares the shape it READS (BadgeInput)
 * rather than importing CareerRecord, so there is no import edge back to
 * careerStore at all -- careerStore imports this module as a value, and the
 * reverse edge would be a cycle waiting for someone to make it a value
 * import. Same class of constraint as src/state/buildRaceConfig.ts:25.
 */

/** One race, as it happened. Every field is already computed at the
 *  recordRace call site in seasonStore -- nothing new is simulated. */
export interface RaceFact {
  /** careerRecord.seasonNumber at the time. */
  season: number
  /** seasonStore.raceIndex, 0-based. */
  round: number
  /** 1-based grid slot, from qualifyingResult.order. */
  grid: number
  /** 1-based classified finishing position. */
  finish: number
  retired: boolean
  pole: boolean
  stops: number
  overtakes: number
  wet: boolean
}

/**
 * The slice of the career record badges read.
 *
 * CareerRecord is structurally assignable to this, so callers pass the record
 * directly. Declaring it here rather than importing keeps this module free of
 * any dependency on the store.
 */
export interface BadgeInput {
  titles: number
  wins: number
  podiums: number
  poles: number
  racesStarted: number
  bestFinish: number | null
  raceLog: readonly RaceFact[]
}

export interface BadgeDef {
  id: string
  name: string
  /** Shown on the LOCKED badge. A locked badge whose requirement is hidden is
   *  a mystery box, not a goal. */
  condition: string
  earned: (r: BadgeInput) => boolean
}

/** A DNF is never a win, whatever position it was classified in. */
function won(f: RaceFact): boolean {
  return !f.retired && f.finish === 1
}

/** Longest run of consecutive races finished. A fold, not a counter --
 *  see the spec, §2.2. */
function longestFinishStreak(log: readonly RaceFact[]): number {
  let best = 0
  let run = 0
  for (const f of log) {
    if (f.retired) { run = 0; continue }
    run += 1
    if (run > best) best = run
  }
  return best
}

export const BADGES: readonly BadgeDef[] = [
  // Milestones -- derived from fields that already exist, so an existing
  // career earns these retroactively the moment the screen appears.
  { id: 'in_the_points', name: 'In The Points', condition: 'Finish in the top 10',
    earned: r => r.bestFinish !== null && r.bestFinish <= 10 },
  { id: 'rostrum', name: 'Rostrum', condition: 'Finish on the podium',
    earned: r => r.podiums >= 1 },
  { id: 'winner', name: 'Winner', condition: 'Win a race',
    earned: r => r.wins >= 1 },
  { id: 'pole_position', name: 'Pole Position', condition: 'Qualify on pole',
    earned: r => r.poles >= 1 },
  { id: 'champion', name: 'Champion', condition: 'Win the championship',
    earned: r => r.titles >= 1 },
  { id: 'dynasty', name: 'Dynasty', condition: 'Win three championships',
    earned: r => r.titles >= 3 },
  { id: 'double_figures', name: 'Double Figures', condition: 'Win 10 races',
    earned: r => r.wins >= 10 },
  { id: 'veteran', name: 'Veteran', condition: 'Start 50 races',
    earned: r => r.racesStarted >= 50 },
  { id: 'centurion', name: 'Centurion', condition: 'Start 100 races',
    earned: r => r.racesStarted >= 100 },

  // Event badges -- fold over the log, so they count from the first race
  // logged. They cannot be retroactive: the facts were never recorded.
  { id: 'storm_chaser', name: 'Storm Chaser', condition: 'Win a wet race',
    earned: r => r.raceLog.some(f => f.wet && won(f)) },
  { id: 'comeback', name: 'Comeback', condition: 'Win from P10 or worse',
    earned: r => r.raceLog.some(f => f.grid >= 10 && won(f)) },
  { id: 'lights_to_flag', name: 'Lights To Flag', condition: 'Take pole and win the same race',
    earned: r => r.raceLog.some(f => f.pole && won(f)) },
  { id: 'one_stop_wonder', name: 'One-Stop Wonder', condition: 'Win using exactly one pit stop',
    earned: r => r.raceLog.some(f => f.stops === 1 && won(f)) },
  { id: 'ironman', name: 'Ironman', condition: 'Finish 12 races in a row',
    earned: r => longestFinishStreak(r.raceLog) >= 12 },
  { id: 'damage_limitation', name: 'Damage Limitation', condition: 'Score points from P15 or worse',
    earned: r => r.raceLog.some(f => !f.retired && f.grid >= 15 && f.finish <= 10) },
]

/** Ids of every badge the record satisfies. */
export function earnedBadges(r: BadgeInput): string[] {
  return BADGES.filter(b => b.earned(r)).map(b => b.id)
}

/**
 * Ids earned by `after` but not by `before`.
 *
 * A set difference over two pure evaluations is what makes "announce it once"
 * fall out of the design instead of needing an `announced` flag kept in sync.
 */
export function newlyEarned(before: BadgeInput, after: BadgeInput): string[] {
  const had = new Set(earnedBadges(before))
  return earnedBadges(after).filter(id => !had.has(id))
}

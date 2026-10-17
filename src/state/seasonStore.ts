import { create } from 'zustand'
import { CIRCUIT_ORDER } from './raceStore'
import { buildRaceConfig } from './buildRaceConfig'
import { runQualifying, qualifyingRng, type Compound, type PaceMode, type PitStop, type QualifyingCall, type QualifyingResult } from '@engine/index'
import type { Wing } from '@engine/setup'
import type { Difficulty } from './settingsStore'
import { loadGameData } from '@data/validators'
import { useCareerStore, escalateRivals, previewRaceBadges, type RaceRecordInput, type SprintRecordInput } from './careerStore'
import { isSprintRound, sprintPointsFor } from './sprint'
import { settleSeason, type LadderMove } from './teamLadder'
import type { UpgradeOverlayInput } from './upgradeOverlay'

export type SeasonPhase = 'menu' | 'grid' | 'team_select' | 'driver_select' | 'development' | 'race_setup' | 'qualifying' | 'racing' | 'result' | 'championship' | 'how_to_play' | 'settings' | 'scenario_select' | 'scenario_racing' | 'scenario_result' | 'career' | 'sprint_setup' | 'sprint_racing' | 'sprint_result'

// Type-only on purpose: seasonPersistence imports THIS module at runtime to
// subscribe to the store, so a value import here would close a cycle.
import type { SeasonSnapshot } from './seasonPersistence'

export interface SeasonResult {
  driverId: string
  position: number
  points: number
  retired: boolean
  retiredCause: 'tyre' | 'mechanical' | 'crash' | null
}

export interface Standing {
  driverId: string
  points: number
}

export interface RaceEventSummary {
  overtakesGained: number
  pitsDone: number
  hadRain: boolean
}

export interface PlayerStrategyChoice {
  startCompound: Compound
  plannedStops: PitStop[]
  wing?: Wing
}

export type RaceKind = 'gp' | 'sprint'

/** A sprint is set up with a start tyre and a pace off the line; no planned stop (spec 1.5 §3). */
export interface SprintStrategyChoice { startCompound: Compound; paceMode: PaceMode }

export interface FinishPosition {
  driverId: string
  position: number
  retired?: boolean
  retiredCause?: 'tyre' | 'mechanical' | 'crash' | null
}

export const TOTAL_RACES = 12
const POINTS_TABLE: number[] = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]

function pointsFor(position: number): number {
  return POINTS_TABLE[position - 1] ?? 0
}

/**
 * Development points paid at season end for a championship podium.
 *
 * Race income is flat -- every driver banks `income.perRace` whatever they
 * finish -- so without this a champion and a backmarker funded their winter
 * identically, while escalateRivals handed the champion a BIGGER rival boost
 * for having won. Winning the title strictly worsened the next season.
 *
 * It is also the only thing that makes a full car sustainable: holding all
 * five attributes at the top tier bills 5 x 27 = 135 a winter against 120 of
 * race income, so the summit is affordable only to a player who keeps winning
 * the championship. That is the intended shape -- the plateau is earned every
 * season, not reached once.
 */
export function seasonEndBonusFor(championshipPosition: number): number {
  return loadGameData().tuning.career.seasonEndBonus[championshipPosition - 1] ?? 0
}

export function raceHeadline(pos: number, events: RaceEventSummary): string {
  const { pitsDone, overtakesGained, hadRain } = events
  if (pos === 1) {
    if (pitsDone >= 2) return 'Two-stop gamble lands the win.'
    if (overtakesGained >= 3) return 'Charged through the field to take P1.'
    return 'Converted the strategy into victory.'
  }
  if (pos <= 3) {
    if (hadRain) return `Smart tyre call in the wet secured P${pos}.`
    if (overtakesGained >= 2) return `Fought through to the podium at P${pos}.`
    return `Held on for a hard-fought P${pos}.`
  }
  if (pos <= 5 && hadRain) return `Made the right call in the wet. P${pos}.`
  if (pos <= 5 && pitsDone >= 2) return `Two-stop strategy delivered P${pos}.`
  if (pos <= 5) return `Clean race earns P${pos}.`
  if (pos <= 10) return `Points finish at P${pos}. Keep building.`
  return `Tough race. P${pos} — more to come.`
}


// Facet points a developmentRate-1.0 team gains per race, and how many team
// facets that pool is split across, both live in data/upgrades.json
// (`rivalDevelopment.poolPerRace` / `.facets`) rather than here — per
// CLAUDE.md §4/§5 ("the player/designer balances by editing data, not
// code"), a designer tuning how fast rivals close in on the player must
// never require a code change.
//
// SIZING, derived rather than guessed (and now pinned by a test that asserts
// SECONDS, not the accrual/application identity — see
// tests/state/rivalDevelopmentMagnitude.test.ts). Each facet gains
// `poolPerRace * rate * accruals` points, and one facet point is worth
// `(9/100) * carPerformance.deltaPerRating * sectorSplit[s] * 3` seconds a lap.
// The three car sectorSplits sum to 1, so equal points on power/aero/handling
// are worth `points * (9/100) * 0.22 * 3 = points * 0.0594` s/lap. Eleven
// accruals precede the last spending opportunity, so at `poolPerRace: 0.36` a
// rate-1.0 team gains 3.96 points per facet = **0.235 s/lap per season**, and
// Terra at rate 1.4 gains 0.329.
//
// That is the owner's ~0.24 s/lap target, set against the ~0.54 s/lap a player
// can buy with their real 110-DP budget. The previous value of 1 gave a
// rate-1.0 team 0.71 s/lap and Terra 1.00 — more than the player could buy
// with the whole season's income, which inverted the underdog arc the feature
// exists to create (measured: a Zenith player finished the season 0.79
// positions WORSE than they started).
//
// developmentRate in cars.json correlates *inversely* with team strength today
// (apex/meridian, the two strongest grids, sit at 1.0; terra/zenith, the two
// weakest, sit at 1.4/1.2) — confirmed by reading the real file rather than
// assumed. Applying the rate directly is therefore already the intended
// "weakest team develops fastest" compression, not an inversion that needs
// correcting.
function accumulateRivalDevelopment(current: Record<string, number>): Record<string, number> {
  const { cars, upgrades } = loadGameData()
  const { poolPerRace, facets } = upgrades.rivalDevelopment
  const next: Record<string, number> = { ...current }
  for (const team of cars.teams) {
    const rate = team.developmentRate ?? 1.0
    next[team.id] = (next[team.id] ?? 0) + poolPerRace * rate * facets.length
  }
  return next
}

interface SeasonStore {
  phase: SeasonPhase
  playerDriverId: string | null
  raceIndex: number
  standings: Standing[]
  lastRaceResults: SeasonResult[] | null
  lastRaceEvents: RaceEventSummary | null
  /**
   * True from the chequered flag until the player keeps the race (NEXT RACE /
   * FINAL STANDINGS) or throws it away (RETRY). While it is true, the result
   * is shown but NOT yet counted: no points, no development, no rival
   * development, nothing in the career. Saved, so a player who closes the app
   * on the result screen still has the race waiting.
   */
  resultPending: boolean
  /**
   * The player's race as the career will record it, captured AT THE FLAG while
   * the qualifying grid is still known. qualifyingResult is not saved, so
   * deriving this at commit time after the app was reopened would lose the
   * grid slot and pole -- and with them the Comeback badge.
   */
  pendingRace: RaceRecordInput | null
  /**
   * Counts the pending race: points, development points, rival development
   * and the career record, exactly once. nextRace calls it -- leaving the
   * result screen forward is what keeping a race means. A no-op when nothing
   * is pending.
   */
  keepResult: () => void
  /** Badges keeping the pending race would award. Empty when nothing is pending. */
  pendingBadges: () => string[]
  selectedCircuitId: string | null
  selectedTeamId: string | null
  playerStrategy: PlayerStrategyChoice | null
  qualifyingResult: QualifyingResult | null
  // M5: increments each time the player retries the current round without
  // advancing — varies the seed (and therefore the weather stream, which
  // derives from seed+999999) so a retry isn't a byte-identical replay.
  attemptNonce: number
  /** The sprint's own retry counter: retrying the sprint never re-rolls the Grand Prix, and vice versa. */
  sprintAttemptNonce: number
  sprintStrategy: SprintStrategyChoice | null
  lastSprintResults: SeasonResult[] | null
  lastSprintEvents: RaceEventSummary | null
  /** Same pending/keep contract as resultPending: shown at the flag, counted when the player leaves forward. */
  sprintPending: boolean
  /** The sprint as the career will log it, captured at the flag while the grid is known. */
  pendingSprint: SprintRecordInput | null
  /** True once this round's sprint is counted. Gates the Grand Prix and keeps the shared grid on a GP retry. */
  sprintBanked: boolean

  // Season-scoped progression. Flat, separately-serialisable shapes so wiring
  // these into persistence later (deferred item 35) stays small.
  devPoints: number
  purchasedTiers: Record<string, number>
  rivalDevelopment: Record<string, number>
  /**
   * The season-end podium bonus just paid, for the championship screen to
   * show. UI-only and deliberately NOT persisted: it is an announcement of a
   * transition, and a restored save reopening on the championship screen
   * should not re-announce a payment made before the app closed.
   */
  lastSeasonBonus: number
  /**
   * The ladder verdict for the season just banked, for the championship
   * screen. UI only and never persisted, like lastSeasonBonus: a reload on
   * that screen shows the standings without the reveal rather than a stale one.
   */
  lastLadder: LadderMove[] | null
  /**
   * Everything the overlay needs to build this season's cars. The ONLY place
   * that input is assembled, so qualifying, the race and the ladder cannot
   * disagree about what the cars were.
   */
  overlayInput: () => UpgradeOverlayInput

  tierCost: (attributeId: string) => number | null
  canAfford: (attributeId: string) => boolean
  purchaseTier: (attributeId: string) => void

  currentSeed: () => number
  currentSprintSeed: () => number
  confirmSprintSetup: (choice: SprintStrategyChoice) => void
  recordSprintResult: (positions: FinishPosition[], events: RaceEventSummary) => void
  keepSprint: () => void
  toGrandPrix: () => void
  retrySprint: () => void
  retryRace: () => void
  currentCircuitId: () => string
  setCircuit: (id: string) => void
  viewGrid: () => void
  exitGrid: () => void
  viewCareer: () => void
  exitCareer: () => void
  viewHowToPlay: () => void
  exitHowToPlay: () => void
  viewSettings: () => void
  exitSettings: () => void
  viewScenarios: () => void
  exitScenarios: () => void
  startScenarioPhase: () => void
  toScenarioResult: () => void
  backToMenu: () => void
  backToTeamSelect: () => void
  backToDriverSelect: () => void
  startNewSeason: () => void
  selectTeam: (id: string) => void
  confirmTeam: () => void
  selectDriver: (id: string) => void
  confirmDriver: () => void
  toRaceSetup: () => void
  confirmRaceSetup: (circuitId?: string, strategy?: PlayerStrategyChoice | null) => void
  runQualifyingSession: (call: QualifyingCall, difficulty: Difficulty) => void
  startRaceFromQualifying: () => void
  recordRaceResult: (positions: FinishPosition[], events: RaceEventSummary) => void
  nextRace: () => void
  startNextSeason: () => void
  endCareer: () => void
  resumeSeason: (snap: SeasonSnapshot) => void
}

/**
 * The race seed, as a pure function of the three things that vary.
 *
 * Extracted from currentSeed so the collision guarantee can be exercised over
 * a large domain without driving it through the store: asserting it via
 * setState took 360,000 store notifications and 37 seconds, which is how a
 * genuine guarantee turns into a test people start skipping.
 *
 * (seasonNumber - 1), NOT seasonNumber: season 1 must add exactly zero so its
 * seeds are byte-identical to the pre-career game. tests/engine/byteIdentity,
 * the Monte-Carlo bands in MODEL_SPEC.md 10.1 and all three scenarios in
 * src/data/scenarios.json depend on that.
 *
 * Collisions are prevented MODULARLY, not by magnitude. attemptNonce is
 * unbounded -- retryRace never caps it -- so "the stride is bigger than the
 * other terms" is false: thirteen retries already exceed it. The real
 * argument: seedStride and 1000 are both multiples of 1000 and
 * gcd(7919, 1000) = 1, so a collision needs the nonce difference to be a
 * multiple of 1000, which then needs |dRace| >= 100 -- impossible across a
 * 12-round season.
 */
// Cached deliberately. loadGameData() re-parses every zod schema on every
// call -- it does not memoise -- and seedFor is called in tight loops by the
// collision test. Reading it per call cost 360,000 full schema parses and blew
// a 5s test timeout. The stride is a build-time constant in tuning.json, so
// reading it once is safe; a test that needs a different stride should call
// seedFor's arithmetic directly rather than mutating tuning underneath it.
let cachedStride: number | null = null
function seedStride(): number {
  if (cachedStride === null) cachedStride = loadGameData().tuning.career.seedStride
  return cachedStride
}

/**
 * Standings with one race's points added. Pure: returns new objects and never
 * edits `standings` -- the old version did `existing.points +=` on a shallow
 * copy, which silently changed the previous state too. Shared by the commit
 * in nextRace and the provisional table on the result screen, so the two
 * always agree.
 */
export function addResultsToStandings(standings: readonly Standing[], results: readonly SeasonResult[]): Standing[] {
  const out = standings.map(x => ({ ...x }))
  for (const r of results) {
    const existing = out.find(x => x.driverId === r.driverId)
    if (existing) existing.points += r.points
    else out.push({ driverId: r.driverId, points: r.points })
  }
  return out.sort((a, b) => b.points - a.points)
}

/**
 * The player's race as the career would record it, from a pending result.
 * One function for both the commit and the badge preview, so the screen can
 * never promise a badge the commit does not award.
 */
function pendingRaceRecord(s: Pick<SeasonStore, 'lastRaceResults' | 'lastRaceEvents' | 'playerDriverId' | 'qualifyingResult' | 'raceIndex'>): RaceRecordInput | null {
  const player = s.lastRaceResults?.find(r => r.driverId === s.playerDriverId)
  if (!player || !s.lastRaceEvents) return null
  const grid = s.qualifyingResult
  const playerId = s.playerDriverId
  // 1-based grid slot. Without a qualifying result the field starts in
  // championship order, so the player's standings slot is the honest
  // fallback -- never 0, which would read as "started ahead of pole".
  const gridSlot = grid && playerId ? grid.order.indexOf(playerId) + 1 : player.position
  return {
    position: player.position,
    retired: player.retired,
    pole: grid ? grid.order[0] === playerId : false,
    round: s.raceIndex,
    grid: gridSlot > 0 ? gridSlot : player.position,
    stops: s.lastRaceEvents.pitsDone,
    overtakes: s.lastRaceEvents.overtakesGained,
    wet: s.lastRaceEvents.hadRain,
  }
}

let cachedSalt: number | null = null
function sprintSalt(): number {
  if (cachedSalt === null) cachedSalt = loadGameData().tuning.sprint.seedSalt
  return cachedSalt
}

/**
 * kind 'gp' (the default) is byte-identical to 1.4, so every Grand Prix seed in
 * the game is unchanged. A sprint adds tuning.sprint.seedSalt (50021). The
 * salt cancels between two sprints, so sprint-vs-sprint is the GP argument
 * above; sprint-vs-GP needs 7919 x dNonce = 21 (mod 1000), i.e. dNonce = 259
 * (mod 1000) -- at least 259 retries of one round, and then also 20 seasons
 * apart. Pinned over 200 retries in tests/state/sprintWeekend.test.ts.
 */
export function seedFor(seasonNumber: number, raceIndex: number, attemptNonce: number, kind: RaceKind = 'gp'): number {
  const base = (seasonNumber - 1) * seedStride() + raceIndex * 1000 + 42 + attemptNonce * 7919
  return kind === 'sprint' ? base + sprintSalt() : base
}

/** Every sprint field at its "no sprint this round" value. */
const SPRINT_CLEAR = {
  sprintAttemptNonce: 0, sprintStrategy: null, lastSprintResults: null, lastSprintEvents: null,
  sprintPending: false, pendingSprint: null, sprintBanked: false,
} satisfies Partial<SeasonStore>

function pendingSprintRecord(
  s: Pick<SeasonStore, 'playerDriverId' | 'qualifyingResult' | 'raceIndex'>,
  results: readonly SeasonResult[], events: RaceEventSummary,
): SprintRecordInput | null {
  const player = results.find(r => r.driverId === s.playerDriverId)
  if (!player) return null
  const slot = s.qualifyingResult && s.playerDriverId ? s.qualifyingResult.order.indexOf(s.playerDriverId) + 1 : player.position
  return {
    position: player.position, retired: player.retired, round: s.raceIndex,
    grid: slot > 0 ? slot : player.position,
    stops: events.pitsDone, overtakes: events.overtakesGained, wet: events.hadRain,
  }
}

export const useSeasonStore = create<SeasonStore>((set, get) => ({
  phase: 'menu',
  playerDriverId: null,
  raceIndex: 0,
  standings: [],
  lastRaceResults: null,
  lastRaceEvents: null,
  resultPending: false,
  pendingRace: null,
  selectedCircuitId: null,
  selectedTeamId: null,
  playerStrategy: null,
  qualifyingResult: null,
  attemptNonce: 0,
  ...SPRINT_CLEAR,
  devPoints: 0,
  purchasedTiers: {},
  rivalDevelopment: {},
  lastSeasonBonus: 0,
  lastLadder: null,

  tierCost(attributeId) {
    const { tierCosts, attributes } = loadGameData().upgrades
    if (!attributes.some(a => a.id === attributeId)) return null // unknown attribute id
    const owned = get().purchasedTiers[attributeId] ?? 0
    return tierCosts[owned] ?? null // null once all three tiers are owned
  },

  canAfford(attributeId) {
    const cost = get().tierCost(attributeId)
    return cost !== null && get().devPoints >= cost
  },

  purchaseTier(attributeId) {
    const cost = get().tierCost(attributeId)
    if (cost === null || get().devPoints < cost) return // maxed, unaffordable, or unknown id
    set(s => ({
      devPoints: s.devPoints - cost,
      purchasedTiers: { ...s.purchasedTiers, [attributeId]: (s.purchasedTiers[attributeId] ?? 0) + 1 },
    }))
  },

  // 7919 is prime — keeps each attempt's seed stream well-separated from the
  // next round's base seed (raceIndex*1000+42) and from other attempts.
  currentSeed() {
    const { raceIndex, attemptNonce } = get()
    const { seasonNumber } = useCareerStore.getState()
    return seedFor(seasonNumber, raceIndex, attemptNonce)
  },

  currentSprintSeed() {
    const { raceIndex, sprintAttemptNonce } = get()
    return seedFor(useCareerStore.getState().seasonNumber, raceIndex, sprintAttemptNonce, 'sprint')
  },

  /*
   * Once-only guards. A banked sprint is closed for the round: resume restores
   * sprintBanked (seasonPersistence), so the store refuses a second sprint
   * itself rather than trusting the screens never to route back into one.
   */
  confirmSprintSetup(choice) {
    if (get().sprintBanked) return
    set({ sprintStrategy: choice, phase: 'sprint_racing' })
  },

  recordSprintResult(positions, events) {
    if (get().sprintBanked) return
    const results: SeasonResult[] = positions.map(p => ({
      driverId: p.driverId,
      position: p.position,
      points: p.retired ? 0 : sprintPointsFor(p.position),
      retired: p.retired ?? false,
      retiredCause: p.retiredCause ?? null,
    }))
    set({
      phase: 'sprint_result', lastSprintResults: results, lastSprintEvents: events, sprintPending: true,
      pendingSprint: pendingSprintRecord(get(), results, events),
    })
  },

  keepSprint() {
    // Sprint points only: no development points, no rival development, no
    // wing memory -- those stay tied to the Grand Prix (spec 1.5 §3).
    const s = get()
    if (s.sprintBanked || !s.sprintPending || !s.lastSprintResults) return
    set({
      standings: addResultsToStandings(s.standings, s.lastSprintResults),
      sprintPending: false, pendingSprint: null, sprintBanked: true,
    })
    if (s.pendingSprint) useCareerStore.getState().recordSprint(s.pendingSprint)
  },

  toGrandPrix() {
    get().keepSprint()
    if (!get().sprintBanked) return
    set({ phase: 'racing' })
  },

  retrySprint() {
    // Only from the result screen: a double tap during the exit animation must not bump the nonce twice.
    if (get().sprintBanked || get().phase !== 'sprint_result') return
    set(s => ({
      sprintAttemptNonce: s.sprintAttemptNonce + 1, phase: 'sprint_setup',
      lastSprintResults: null, lastSprintEvents: null, sprintPending: false, pendingSprint: null,
    }))
  },

  retryRace() {
    /*
     * Reopens RACE SETUP for the same round, the previous plan pre-filled
     * (Veet's ruling, 2026-10-16). It used to go straight back to 'racing' on
     * the old plan, but the new attemptNonce re-rolls the weather: a wet-start
     * plan retried into a dry race started on full wets and was P20 by lap 1,
     * the new forecast never shown. Setup shows it, and RaceSetup keeps the
     * old start tyre only where it still suits the new conditions.
     *
     * playerStrategy and selectedCircuitId are kept on purpose: they are the
     * plan RaceSetup pre-fills from.
     *
     * qualifyingResult is cleared, so the round is qualified again. The grid
     * was set under the previous attempt's seed, and therefore its weather;
     * keeping it would line up a wet-qualified grid for a dry race.
     * startRaceFromQualifying refuses to race without a fresh one.
     *
     * Nothing to undo in the standings or the career: the attempt was never
     * counted (see resultPending). Dropping the pending result is the whole of
     * discarding it, and with resultPending false a later keepResult is a
     * no-op, so the discarded attempt can never be counted.
     */
    set(s => ({
      attemptNonce: s.attemptNonce + 1, phase: 'race_setup',
      // One qualifying sets both grids (spec 1.5 §3): once the sprint is
      // counted on this grid, a Grand Prix retry keeps it rather than
      // qualifying again.
      qualifyingResult: isSprintRound(s.raceIndex) && s.sprintBanked ? s.qualifyingResult : null,
      lastRaceResults: null, lastRaceEvents: null, resultPending: false, pendingRace: null,
    }))
  },

  currentCircuitId() {
    const { selectedCircuitId, raceIndex } = get()
    return selectedCircuitId ?? (CIRCUIT_ORDER[raceIndex % CIRCUIT_ORDER.length] ?? CIRCUIT_ORDER[0]!)
  },

  setCircuit(id) { set({ selectedCircuitId: id }) },

  viewGrid() { set({ phase: 'grid' }) },
  exitGrid() { set({ phase: 'menu' }) },
  viewCareer() { set({ phase: 'career' }) },
  exitCareer() { set({ phase: 'menu' }) },
  viewHowToPlay() { set({ phase: 'how_to_play' }) },
  exitHowToPlay() { set({ phase: 'menu' }) },
  viewSettings() { set({ phase: 'settings' }) },
  exitSettings() { set({ phase: 'menu' }) },
  viewScenarios() { set({ phase: 'scenario_select' }) },
  exitScenarios() { set({ phase: 'menu' }) },
  // Every scenario phase transition is an ACTION, never a setState from a
  // component. RaceWatcher and the screens below all go through these, so the
  // set of reachable phases stays readable from this file alone.
  startScenarioPhase() { set({ phase: 'scenario_racing' }) },
  toScenarioResult() { set({ phase: 'scenario_result' }) },
  backToMenu() { set({ phase: 'menu' }) },
  backToTeamSelect() { set({ phase: 'team_select', playerDriverId: null }) },
  backToDriverSelect() { set({ phase: 'driver_select' }) },

  overlayInput() {
    const s = get()
    return {
      purchasedTiers: s.purchasedTiers,
      rivalDevelopment: s.rivalDevelopment,
      teamTiers: useCareerStore.getState().teamTiers,
    }
  },

  startNewSeason() {
    useCareerStore.getState().beginCareer()
    set({ phase: 'team_select', playerDriverId: null, selectedTeamId: null, raceIndex: 0, standings: [], lastRaceResults: null, lastRaceEvents: null, resultPending: false, pendingRace: null, selectedCircuitId: null, playerStrategy: null, attemptNonce: 0, devPoints: 0, purchasedTiers: {}, rivalDevelopment: {}, lastSeasonBonus: 0, lastLadder: null, ...SPRINT_CLEAR })
  },

  selectTeam(id) { set({ selectedTeamId: id, playerDriverId: null }) },

  confirmTeam() {
    if (!get().selectedTeamId) return
    set({ phase: 'driver_select' })
  },

  selectDriver(id) { set({ playerDriverId: id }) },

  confirmDriver() {
    if (!get().playerDriverId) return
    const defaultCircuit = CIRCUIT_ORDER[get().raceIndex % CIRCUIT_ORDER.length] ?? CIRCUIT_ORDER[0]!
    // Round 1 goes through the development screen too, so the player meets it
    // once before it matters. With 0 DP nothing is affordable and the screen is
    // a one-tap pass-through, which is cheaper than a special case.
    set({ phase: 'development', selectedCircuitId: defaultCircuit })
  },

  // The development screen is skippable by design: unspent points bank rather
  // than expire, so it reads as a decision point and not a toll booth.
  toRaceSetup() { set({ phase: 'race_setup', qualifyingResult: null }) },

  confirmRaceSetup(circuitId, strategy) {
    if (circuitId) set({ selectedCircuitId: circuitId })
    const s = get()
    if (isSprintRound(s.raceIndex) && s.sprintBanked && s.qualifyingResult) {
      // The sprint already ran on this grid: straight to the Grand Prix.
      set({ phase: 'racing', playerStrategy: strategy ?? null })
      return
    }
    set({ phase: 'qualifying', playerStrategy: strategy ?? null, qualifyingResult: null })
  },

  runQualifyingSession(call, difficulty) {
    const s = get()
    // Built with EXACTLY the arguments RaceWatcher passes to startSeasonRace
    // (see src/ui/RaceWatcher.tsx:44). If these two ever diverge, the grid
    // would be qualified under different car performance than the race runs
    // with -- a bug that would look like the simulation being unfair.
    // RaceWatcher guards its own startSeasonRace call on `playerDriverId`
    // being set, and this must match it. A null id reaching buildRaceConfig
    // resolves to no team, which disables the upgrade overlay entirely -- so
    // an unguarded call here would qualify the grid WITHOUT the player's
    // upgrades and then race WITH them. That is precisely the config
    // divergence the comment below warns about, arriving through the back
    // door.
    if (!s.playerDriverId) {
      throw new Error('runQualifyingSession called with no playerDriverId')
    }
    const config = buildRaceConfig(
      s.currentSeed(), s.playerDriverId, s.currentCircuitId(), difficulty,
      s.playerStrategy, s.overlayInput(),
      // No grid order: qualifying is what PRODUCES it.
      undefined,
      // Round 1 opens dry, and qualifying must agree with the race it precedes.
      s.raceIndex === 0,
    )
    set({ qualifyingResult: runQualifying(config, qualifyingRng(config), call) })
  },

  startRaceFromQualifying() {
    const result = get().qualifyingResult
    // No result means the player reached the race without a session, which the
    // UI does not allow. Racing with an undefined grid would silently fall back
    // to the fixed drivers.json order -- the exact defect this feature removes.
    if (!result) throw new Error('startRaceFromQualifying called with no qualifyingResult')
    const s = get()
    set({ phase: isSprintRound(s.raceIndex) && !s.sprintBanked ? 'sprint_setup' : 'racing' })
  },

  // Invariant: must be called at most once per race. There is no idempotency
  // guard here — a second call for the same race would double-award
  // devPoints and rivalDevelopment (and double-count standings points, which
  // predates this feature). Enforcement lives outside the store, in
  // src/ui/RaceWatcher.tsx's `hasFiredRef` guard. No `phase` check is added
  // here deliberately: tests call this action directly and rely on being
  // able to invoke it repeatedly in a single race's worth of assertions.
  /**
   * Called at the chequered flag. Records the result as PENDING and counts
   * nothing yet -- see `resultPending`. It used to commit points, development,
   * rival development and the career record right here, before the player
   * had chosen between NEXT RACE and RETRY, and retryRace undid none of it:
   * on device a rival reached 65 points in a one-race season. A race now
   * counts when it is kept, in nextRace.
   */
  recordRaceResult(positions, events) {
    const results: SeasonResult[] = positions.map(p => ({
      driverId: p.driverId,
      position: p.position,
      points: p.retired ? 0 : pointsFor(p.position), // a DNF never scores, regardless of classified position
      retired: p.retired ?? false,
      retiredCause: p.retiredCause ?? null,
    }))
    const pendingRace = pendingRaceRecord({ ...get(), lastRaceResults: results, lastRaceEvents: events })
    set({ phase: 'result', lastRaceResults: results, lastRaceEvents: events, resultPending: true, pendingRace })
  },

  pendingBadges() {
    const s = get()
    if (!s.resultPending) return []
    return s.pendingRace ? previewRaceBadges(useCareerStore.getState(), s.pendingRace) : []
  },

  keepResult() {
    // Keeping the race: count it now, exactly once. A save written on the
    // result screen by a build from before this existed has resultPending
    // false (its race was already counted at the flag), so it is not counted
    // a second time.
    const pending = get()
    if (pending.resultPending && pending.lastRaceResults) {
      set({
        standings: addResultsToStandings(pending.standings, pending.lastRaceResults),
        devPoints: pending.devPoints + loadGameData().upgrades.income.perRace,
        rivalDevelopment: accumulateRivalDevelopment(pending.rivalDevelopment),
        resultPending: false,
        pendingRace: null,
      })
      // The career's running totals, captured at the flag from the same
      // results the standings use.
      if (pending.pendingRace) useCareerStore.getState().recordRace(pending.pendingRace)
      // The wing is remembered on KEEP, not at the flag, so a retried attempt
      // leaves the career's memory of this circuit untouched.
      // currentCircuitId() falls back to the calendar slot, so a legacy save
      // with a null selectedCircuitId still remembers.
      const wing = pending.playerStrategy?.wing
      if (wing !== undefined) {
        useCareerStore.getState().rememberWing(get().currentCircuitId(), wing)
      }
    }
  },

  nextRace() {
    get().keepResult()

    const { raceIndex } = get()
    const next = raceIndex + 1
    if (next >= TOTAL_RACES) {
      // Bank the season BEFORE the championship screen renders, so the career
      // record it reads already contains the title -- which is what lets the
      // Champion badge be announced there rather than a screen later.
      const career = useCareerStore.getState()
      const standing = get().standings.findIndex(x => x.driverId === get().playerDriverId)
      const finishedPosition = standing >= 0 ? standing + 1 : get().standings.length
      const banked = career.recordSeasonEnd({
        seasonNumber: career.seasonNumber,
        teamId: get().selectedTeamId ?? '',
        driverId: get().playerDriverId ?? '',
        championshipPosition: finishedPosition,
        points: get().standings.find(x => x.driverId === get().playerDriverId)?.points ?? 0,
        // Overwritten by careerStore from its own season-scoped counter --
        // seasonStore does not track wins, so it must not guess at them.
        wins: 0,
      })
      // Paid only when recordSeasonEnd actually banked. Re-entering this path
      // for a season already recorded must not pay the bonus twice, for the
      // same reason it must not award the title twice.
      const bonus = banked ? seasonEndBonusFor(finishedPosition) : 0
      // The ladder is judged on the end-of-season state: rival pools after the
      // final race's development, the player's upgrade tiers before winter
      // erosion. That is what spec section 5 specifies, so it is settled HERE,
      // before startNextSeason erodes or resets anything. Only when the season actually banked: a re-entry must not
      // move every team a second time.
      let lastLadder = get().lastLadder
      if (banked && get().playerDriverId) {
        const r = settleSeason({
          standings: get().standings,
          playerDriverId: get().playerDriverId!,
          overlay: get().overlayInput(),
          tiers: useCareerStore.getState().teamTiers,
        })
        useCareerStore.getState().setTeamTiers(r.tiers)
        lastLadder = r.moves
      }
      set({ phase: 'championship', devPoints: get().devPoints + bonus, lastSeasonBonus: bonus, lastLadder })
    } else {
      const nextCircuit = CIRCUIT_ORDER[next % CIRCUIT_ORDER.length] ?? CIRCUIT_ORDER[0]!
      set({ raceIndex: next, phase: 'development', lastRaceResults: null, lastRaceEvents: null, selectedCircuitId: nextCircuit, playerStrategy: null, attemptNonce: 0, qualifyingResult: null, ...SPRINT_CLEAR })
    }
  },

  /**
   * A new season inside the SAME career. Keeps the seat (the player is not on
   * the driver market) and the eroded upgrades; resets everything season-scoped.
   */
  startNextSeason() {
    const s = get()
    const career = useCareerStore.getState()
    const standing = s.standings.findIndex(x => x.driverId === s.playerDriverId)
    // The title and the history entry were already banked by recordSeasonEnd
    // when the season ended; this only starts the new one.
    const { erodedTiers } = career.rollOverSeason(s.purchasedTiers)
    set({
      phase: 'development',
      raceIndex: 0,
      standings: [],
      lastRaceResults: null,
      lastRaceEvents: null,
      selectedCircuitId: CIRCUIT_ORDER[0] ?? null,
      playerStrategy: null,
      qualifyingResult: null,
      attemptNonce: 0,
      ...SPRINT_CLEAR,
      // devPoints are NOT reset. Unspent points bank rather than expire --
      // the principle already stated at toRaceSetup above, applied across the
      // season boundary as well as within one.
      //
      // Discarding them made the career go dead flat. Simulated over 10
      // seasons with optimal buying, a player who loses their unspent points
      // plateaus at 11 of 15 tiers from season 3 and then burns 21 points
      // every season forever, because erosion keeps eating tiers they can
      // never quite afford to replace. The Development screen becomes "rebuy
      // what you lost, waste the rest" -- no progression and no decision,
      // which is the outcome erosion was introduced to prevent, arriving by a
      // different route. Banking them instead climbs 8 -> 10 -> 12 -> 13 and
      // is still rising at season 10, while erosion still stops a max-out.
      lastSeasonBonus: 0,
      purchasedTiers: erodedTiers,
      /*
       * RESET to the winter head start, not carried forward. Carrying it
       * forward saturated the grid: by season 4 every rival's power, aero and
       * handling sat at 100 (docs/superpowers/specs/2026-10-09-team-ladder-design.md
       * section 5). Rival development is now the in-season race against the
       * player's purchases; what carries across seasons is the team ladder.
       * escalateRivals from zero is exactly the old winter boost, so "win the
       * title and the grid has a bigger winter" survives.
       */
      rivalDevelopment: escalateRivals({}, standing === 0),
      lastLadder: null,
      // playerDriverId and selectedTeamId are deliberately NOT reset.
    })
  },

  /** Abandon the career. This is what playAgain used to do, named honestly. */
  endCareer() {
    useCareerStore.getState().endCareer()
    set({
      phase: 'menu', playerDriverId: null, selectedTeamId: null, raceIndex: 0,
      standings: [], lastRaceResults: null, lastRaceEvents: null, resultPending: false, pendingRace: null,
      selectedCircuitId: null, playerStrategy: null, qualifyingResult: null,
      attemptNonce: 0, devPoints: 0, purchasedTiers: {}, rivalDevelopment: {},
      lastSeasonBonus: 0, lastLadder: null, ...SPRINT_CLEAR,
    })
  },

  /**
   * Restores a saved season wholesale.
   *
   * Sets `phase` from the snapshot, which is the exact thing the previous
   * attempt at persistence forgot to do -- it restored every other field and
   * left the player sitting in the main menu with an invisible season loaded,
   * which is why that code was dead and got deleted. tests/state/
   * seasonPersistence.test.ts asserts the phase specifically for that reason.
   */
  resumeSeason(snap) {
    set({
      phase: snap.resumePhase,
      playerDriverId: snap.playerDriverId,
      selectedTeamId: snap.selectedTeamId,
      selectedCircuitId: snap.selectedCircuitId,
      raceIndex: snap.raceIndex,
      standings: snap.standings,
      playerStrategy: snap.playerStrategy,
      attemptNonce: snap.attemptNonce,
      devPoints: snap.devPoints,
      purchasedTiers: snap.purchasedTiers,
      rivalDevelopment: snap.rivalDevelopment,
      lastRaceResults: snap.lastRaceResults,
      lastRaceEvents: snap.lastRaceEvents,
      resultPending: snap.resultPending,
      pendingRace: snap.pendingRace,
      qualifyingResult: snap.qualifyingResult,
      sprintAttemptNonce: snap.sprintAttemptNonce,
      sprintStrategy: snap.sprintStrategy,
      lastSprintResults: snap.lastSprintResults,
      lastSprintEvents: snap.lastSprintEvents,
      sprintPending: snap.sprintPending,
      pendingSprint: snap.pendingSprint,
      sprintBanked: snap.sprintBanked,
    })
  },
}))

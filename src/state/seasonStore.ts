import { create } from 'zustand'
import { CIRCUIT_ORDER } from './raceStore'
import { buildRaceConfig } from './buildRaceConfig'
import { runQualifying, qualifyingRng, type Compound, type PitStop, type QualifyingCall, type QualifyingResult } from '@engine/index'
import type { Difficulty } from './settingsStore'
import { loadGameData } from '@data/validators'
import { useCareerStore, escalateRivals } from './careerStore'

export type SeasonPhase = 'menu' | 'grid' | 'team_select' | 'driver_select' | 'development' | 'race_setup' | 'qualifying' | 'racing' | 'result' | 'championship' | 'how_to_play' | 'settings' | 'scenario_select' | 'scenario_racing' | 'scenario_result' | 'career'

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
  selectedCircuitId: string | null
  selectedTeamId: string | null
  playerStrategy: PlayerStrategyChoice | null
  qualifyingResult: QualifyingResult | null
  // M5: increments each time the player retries the current round without
  // advancing — varies the seed (and therefore the weather stream, which
  // derives from seed+999999) so a retry isn't a byte-identical replay.
  attemptNonce: number

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

  tierCost: (attributeId: string) => number | null
  canAfford: (attributeId: string) => boolean
  purchaseTier: (attributeId: string) => void

  currentSeed: () => number
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
  recordRaceResult: (positions: { driverId: string; position: number; retired?: boolean; retiredCause?: 'tyre' | 'mechanical' | 'crash' | null }[], events: RaceEventSummary) => void
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

export function seedFor(seasonNumber: number, raceIndex: number, attemptNonce: number): number {
  return (seasonNumber - 1) * seedStride() + raceIndex * 1000 + 42 + attemptNonce * 7919
}

export const useSeasonStore = create<SeasonStore>((set, get) => ({
  phase: 'menu',
  playerDriverId: null,
  raceIndex: 0,
  standings: [],
  lastRaceResults: null,
  lastRaceEvents: null,
  selectedCircuitId: null,
  selectedTeamId: null,
  playerStrategy: null,
  qualifyingResult: null,
  attemptNonce: 0,
  devPoints: 0,
  purchasedTiers: {},
  rivalDevelopment: {},
  lastSeasonBonus: 0,

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

  retryRace() {
    set(s => ({ attemptNonce: s.attemptNonce + 1, phase: 'racing', lastRaceResults: null, lastRaceEvents: null }))
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

  startNewSeason() {
    useCareerStore.getState().beginCareer()
    set({ phase: 'team_select', playerDriverId: null, selectedTeamId: null, raceIndex: 0, standings: [], lastRaceResults: null, lastRaceEvents: null, selectedCircuitId: null, playerStrategy: null, attemptNonce: 0, devPoints: 0, purchasedTiers: {}, rivalDevelopment: {}, lastSeasonBonus: 0 })
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
      s.playerStrategy, { purchasedTiers: s.purchasedTiers, rivalDevelopment: s.rivalDevelopment },
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
    set({ phase: 'racing' })
  },

  // Invariant: must be called at most once per race. There is no idempotency
  // guard here — a second call for the same race would double-award
  // devPoints and rivalDevelopment (and double-count standings points, which
  // predates this feature). Enforcement lives outside the store, in
  // src/ui/RaceWatcher.tsx's `hasFiredRef` guard. No `phase` check is added
  // here deliberately: tests call this action directly and rely on being
  // able to invoke it repeatedly in a single race's worth of assertions.
  recordRaceResult(positions, events) {
    const { standings } = get()
    const results: SeasonResult[] = positions.map(p => ({
      driverId: p.driverId,
      position: p.position,
      points: p.retired ? 0 : pointsFor(p.position), // a DNF never scores, regardless of classified position
      retired: p.retired ?? false,
      retiredCause: p.retiredCause ?? null,
    }))
    const newStandings = [...standings]
    for (const r of results) {
      const existing = newStandings.find(s => s.driverId === r.driverId)
      if (existing) {
        existing.points += r.points
      } else {
        newStandings.push({ driverId: r.driverId, points: r.points })
      }
    }
    newStandings.sort((a, b) => b.points - a.points)
    set({
      phase: 'result', standings: newStandings, lastRaceResults: results, lastRaceEvents: events,
      devPoints: get().devPoints + loadGameData().upgrades.income.perRace,
      rivalDevelopment: accumulateRivalDevelopment(get().rivalDevelopment),
    })

    // The career's running totals. Read from the same results the standings
    // use, so the two can never disagree.
    const player = results.find(r => r.driverId === get().playerDriverId)
    if (player) {
      const grid = get().qualifyingResult
      const playerId = get().playerDriverId
      // 1-based grid slot. Without a qualifying result the field starts in
      // championship order, so the player's standings slot is the honest
      // fallback -- never 0, which would read as "started ahead of pole".
      const gridSlot = grid && playerId
        ? grid.order.indexOf(playerId) + 1
        : player.position
      useCareerStore.getState().recordRace({
        position: player.position,
        retired: player.retired,
        pole: grid ? grid.order[0] === playerId : false,
        round: get().raceIndex,
        grid: gridSlot > 0 ? gridSlot : player.position,
        stops: events.pitsDone,
        overtakes: events.overtakesGained,
        wet: events.hadRain,
      })
    }
  },

  nextRace() {
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
      set({ phase: 'championship', devPoints: get().devPoints + bonus, lastSeasonBonus: bonus })
    } else {
      const nextCircuit = CIRCUIT_ORDER[next % CIRCUIT_ORDER.length] ?? CIRCUIT_ORDER[0]!
      set({ raceIndex: next, phase: 'development', lastRaceResults: null, lastRaceEvents: null, selectedCircuitId: nextCircuit, playerStrategy: null, attemptNonce: 0 })
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
      rivalDevelopment: escalateRivals(s.rivalDevelopment, standing === 0),
      // playerDriverId and selectedTeamId are deliberately NOT reset.
    })
  },

  /** Abandon the career. This is what playAgain used to do, named honestly. */
  endCareer() {
    useCareerStore.getState().endCareer()
    set({
      phase: 'menu', playerDriverId: null, selectedTeamId: null, raceIndex: 0,
      standings: [], lastRaceResults: null, lastRaceEvents: null,
      selectedCircuitId: null, playerStrategy: null, qualifyingResult: null,
      attemptNonce: 0, devPoints: 0, purchasedTiers: {}, rivalDevelopment: {},
      lastSeasonBonus: 0,
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
    })
  },
}))

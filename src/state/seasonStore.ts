import { create } from 'zustand'
import { CIRCUIT_ORDER } from './raceStore'
import type { Compound, PitStop } from '@engine/index'
import { loadGameData } from '@data/validators'

export type SeasonPhase = 'menu' | 'grid' | 'team_select' | 'driver_select' | 'development' | 'race_setup' | 'racing' | 'result' | 'championship' | 'how_to_play' | 'settings'

export interface SeasonResult {
  driverId: string
  position: number
  points: number
  retired: boolean
  retiredCause: 'tyre' | 'mechanical' | null
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
  // M5: increments each time the player retries the current round without
  // advancing — varies the seed (and therefore the weather stream, which
  // derives from seed+999999) so a retry isn't a byte-identical replay.
  attemptNonce: number

  // Season-scoped progression. Flat, separately-serialisable shapes so wiring
  // these into persistence later (deferred item 35) stays small.
  devPoints: number
  purchasedTiers: Record<string, number>
  rivalDevelopment: Record<string, number>

  tierCost: (attributeId: string) => number | null
  canAfford: (attributeId: string) => boolean
  purchaseTier: (attributeId: string) => void

  currentSeed: () => number
  retryRace: () => void
  currentCircuitId: () => string
  setCircuit: (id: string) => void
  viewGrid: () => void
  exitGrid: () => void
  viewHowToPlay: () => void
  exitHowToPlay: () => void
  viewSettings: () => void
  exitSettings: () => void
  backToMenu: () => void
  backToTeamSelect: () => void
  backToDriverSelect: () => void
  startNewSeason: () => void
  selectTeam: (id: string) => void
  confirmTeam: () => void
  selectDriver: (id: string) => void
  confirmDriver: () => void
  toRaceSetup: () => void
  confirmRaceSetup: (circuitId?: string, strategy?: PlayerStrategyChoice) => void
  recordRaceResult: (positions: { driverId: string; position: number; retired?: boolean; retiredCause?: 'tyre' | 'mechanical' | null }[], events: RaceEventSummary) => void
  nextRace: () => void
  playAgain: () => void
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
  attemptNonce: 0,
  devPoints: 0,
  purchasedTiers: {},
  rivalDevelopment: {},

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
    return get().raceIndex * 1000 + 42 + get().attemptNonce * 7919
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
  viewHowToPlay() { set({ phase: 'how_to_play' }) },
  exitHowToPlay() { set({ phase: 'menu' }) },
  viewSettings() { set({ phase: 'settings' }) },
  exitSettings() { set({ phase: 'menu' }) },
  backToMenu() { set({ phase: 'menu' }) },
  backToTeamSelect() { set({ phase: 'team_select', playerDriverId: null }) },
  backToDriverSelect() { set({ phase: 'driver_select' }) },

  startNewSeason() {
    set({ phase: 'team_select', playerDriverId: null, selectedTeamId: null, raceIndex: 0, standings: [], lastRaceResults: null, lastRaceEvents: null, selectedCircuitId: null, playerStrategy: null, attemptNonce: 0, devPoints: 0, purchasedTiers: {}, rivalDevelopment: {} })
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
  toRaceSetup() { set({ phase: 'race_setup' }) },

  confirmRaceSetup(circuitId, strategy) {
    if (circuitId) set({ selectedCircuitId: circuitId })
    set({ phase: 'racing', playerStrategy: strategy ?? null })
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
  },

  nextRace() {
    const { raceIndex } = get()
    const next = raceIndex + 1
    if (next >= TOTAL_RACES) {
      set({ phase: 'championship' })
    } else {
      const nextCircuit = CIRCUIT_ORDER[next % CIRCUIT_ORDER.length] ?? CIRCUIT_ORDER[0]!
      set({ raceIndex: next, phase: 'development', lastRaceResults: null, lastRaceEvents: null, selectedCircuitId: nextCircuit, playerStrategy: null, attemptNonce: 0 })
    }
  },

  playAgain() {
    set({ phase: 'menu', playerDriverId: null, selectedTeamId: null, raceIndex: 0, standings: [], lastRaceResults: null, lastRaceEvents: null, selectedCircuitId: null, playerStrategy: null, attemptNonce: 0, devPoints: 0, purchasedTiers: {}, rivalDevelopment: {} })
  },
}))

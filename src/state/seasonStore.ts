import { create } from 'zustand'
import { Preferences } from '@capacitor/preferences'
import { CIRCUIT_ORDER } from './raceStore'
import type { Compound, PitStop } from '@engine/index'
import { loadGameData } from '@data/validators'

export type SeasonPhase = 'menu' | 'grid' | 'team_select' | 'driver_select' | 'race_setup' | 'racing' | 'result' | 'championship' | 'how_to_play' | 'settings'

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

const SAVE_KEY = 'season.v1'

// Facet points a developmentRate-1.0 team gains per race. Sized so that over 12
// rounds an average team gains ~12 points spread across three facets (~4 each,
// about 0.07s/lap) — enough to keep the grid moving without out-developing a
// player who is spending on the same facets.
//
// developmentRate in cars.json correlates *inversely* with team strength today
// (apex/meridian, the two strongest grids, sit at 1.0; terra/zenith, the two
// weakest, sit at 1.4/1.2) — confirmed by reading the real file rather than
// assumed. Applying the rate directly is therefore already the intended
// "weakest team develops fastest" compression, not an inversion that needs
// correcting.
const RIVAL_POOL_PER_RACE = 1

function accumulateRivalDevelopment(current: Record<string, number>): Record<string, number> {
  const teams = loadGameData().cars.teams
  const next: Record<string, number> = { ...current }
  for (const team of teams) {
    const rate = team.developmentRate ?? 1.0
    next[team.id] = (next[team.id] ?? 0) + RIVAL_POOL_PER_RACE * rate * 3
  }
  return next
}

// Converts a raw accumulated development pool for one team into the effective
// value of a single facet, given that facet's un-upgraded base rating. The
// pool is a season-long total meant to be split evenly across three team
// facets by whichever caller applies it (a future race-setup overlay), so
// it is divided by 3 here, at the same point that caller would otherwise
// write pool/3 straight onto a facet.
//
// Clamped to 100 HERE, at the point where the effective facet value is
// produced for consumption (e.g. by a future race-setup overlay), rather than
// on the raw pool: the pool itself is not a facet and clamping it would
// silently cap development for every facet the moment any one of them (e.g.
// a team already near 100 in one area) hit the ceiling. facetToRating9 in
// engine/lapModel.ts inverts above 100, so an unclamped facet of 101+ would
// turn a development bonus into a lap-time penalty — exactly backwards.
export function rivalFacetValue(baseFacet: number, pool: number): number {
  return Math.min(100, baseFacet + pool / 3)
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
  confirmRaceSetup: (circuitId?: string, strategy?: PlayerStrategyChoice) => void
  recordRaceResult: (positions: { driverId: string; position: number; retired?: boolean; retiredCause?: 'tyre' | 'mechanical' | null }[], events: RaceEventSummary) => void
  nextRace: () => void
  playAgain: () => void
  loadSeason: () => Promise<void>
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
    set({ phase: 'race_setup', selectedCircuitId: defaultCircuit })
  },

  confirmRaceSetup(circuitId, strategy) {
    if (circuitId) set({ selectedCircuitId: circuitId })
    set({ phase: 'racing', playerStrategy: strategy ?? null })
  },

  recordRaceResult(positions, events) {
    const { standings, raceIndex, playerDriverId } = get()
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
    void Preferences.set({ key: SAVE_KEY, value: JSON.stringify({ raceIndex, standings: newStandings, playerDriverId }) })
  },

  nextRace() {
    const { raceIndex } = get()
    const next = raceIndex + 1
    if (next >= TOTAL_RACES) {
      set({ phase: 'championship' })
    } else {
      const nextCircuit = CIRCUIT_ORDER[next % CIRCUIT_ORDER.length] ?? CIRCUIT_ORDER[0]!
      set({ raceIndex: next, phase: 'race_setup', lastRaceResults: null, lastRaceEvents: null, selectedCircuitId: nextCircuit, playerStrategy: null, attemptNonce: 0 })
    }
  },

  playAgain() {
    set({ phase: 'menu', playerDriverId: null, selectedTeamId: null, raceIndex: 0, standings: [], lastRaceResults: null, lastRaceEvents: null, selectedCircuitId: null, playerStrategy: null, attemptNonce: 0, devPoints: 0, purchasedTiers: {}, rivalDevelopment: {} })
    void Preferences.remove({ key: SAVE_KEY })
  },

  async loadSeason() {
    try {
      const { value } = await Preferences.get({ key: SAVE_KEY })
      if (!value) return
      const saved = JSON.parse(value) as { raceIndex: number; standings: Standing[]; playerDriverId: string }
      if (typeof saved.raceIndex === 'number' && Array.isArray(saved.standings)) {
        set({ raceIndex: saved.raceIndex, standings: saved.standings, playerDriverId: saved.playerDriverId ?? null })
      }
    } catch {
      void Preferences.remove({ key: SAVE_KEY })
    }
  },
}))

import { create } from 'zustand'
import { Preferences } from '@capacitor/preferences'
import { CIRCUIT_ORDER } from './raceStore'

export type SeasonPhase = 'menu' | 'grid' | 'team_select' | 'driver_select' | 'race_setup' | 'racing' | 'result' | 'championship' | 'how_to_play' | 'settings'

export interface SeasonResult {
  driverId: string
  position: number
  points: number
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

export const TOTAL_RACES = 8
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

interface SeasonStore {
  phase: SeasonPhase
  playerDriverId: string | null
  raceIndex: number
  standings: Standing[]
  lastRaceResults: SeasonResult[] | null
  lastRaceEvents: RaceEventSummary | null
  selectedCircuitId: string | null
  selectedTeamId: string | null

  currentSeed: () => number
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
  confirmRaceSetup: (circuitId?: string) => void
  recordRaceResult: (positions: { driverId: string; position: number }[], events: RaceEventSummary) => void
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

  currentSeed() {
    return get().raceIndex * 1000 + 42
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
    set({ phase: 'team_select', playerDriverId: null, selectedTeamId: null, raceIndex: 0, standings: [], lastRaceResults: null, lastRaceEvents: null, selectedCircuitId: null })
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

  confirmRaceSetup(circuitId) {
    if (circuitId) set({ selectedCircuitId: circuitId })
    set({ phase: 'racing' })
  },

  recordRaceResult(positions, events) {
    const { standings, raceIndex, playerDriverId } = get()
    const results: SeasonResult[] = positions.map(p => ({
      driverId: p.driverId,
      position: p.position,
      points: pointsFor(p.position),
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
    set({ phase: 'result', standings: newStandings, lastRaceResults: results, lastRaceEvents: events })
    void Preferences.set({ key: SAVE_KEY, value: JSON.stringify({ raceIndex, standings: newStandings, playerDriverId }) })
  },

  nextRace() {
    const { raceIndex } = get()
    const next = raceIndex + 1
    if (next >= TOTAL_RACES) {
      set({ phase: 'championship' })
    } else {
      const nextCircuit = CIRCUIT_ORDER[next % CIRCUIT_ORDER.length] ?? CIRCUIT_ORDER[0]!
      set({ raceIndex: next, phase: 'race_setup', lastRaceResults: null, lastRaceEvents: null, selectedCircuitId: nextCircuit })
    }
  },

  playAgain() {
    set({ phase: 'menu', playerDriverId: null, selectedTeamId: null, raceIndex: 0, standings: [], lastRaceResults: null, lastRaceEvents: null, selectedCircuitId: null })
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

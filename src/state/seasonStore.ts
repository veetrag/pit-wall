import { create } from 'zustand'
import { CIRCUIT_ORDER } from './raceStore'

export type SeasonPhase = 'menu' | 'grid' | 'driver_select' | 'race_setup' | 'racing' | 'result' | 'championship' | 'how_to_play'

export interface SeasonResult {
  driverId: string
  position: number
  points: number
}

export interface Standing {
  driverId: string
  points: number
}

export const TOTAL_RACES = 5
const POINTS_TABLE: number[] = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]

function pointsFor(position: number): number {
  return POINTS_TABLE[position - 1] ?? 0
}

interface SeasonStore {
  phase: SeasonPhase
  playerDriverId: string | null
  raceIndex: number
  standings: Standing[]
  lastRaceResults: SeasonResult[] | null

  currentSeed: () => number
  currentCircuitId: () => string
  viewGrid: () => void
  exitGrid: () => void
  viewHowToPlay: () => void
  exitHowToPlay: () => void
  startNewSeason: () => void
  selectDriver: (id: string) => void
  confirmDriver: () => void
  confirmRaceSetup: () => void
  recordRaceResult: (positions: { driverId: string; position: number }[]) => void
  nextRace: () => void
  playAgain: () => void
}

export const useSeasonStore = create<SeasonStore>((set, get) => ({
  phase: 'menu',
  playerDriverId: null,
  raceIndex: 0,
  standings: [],
  lastRaceResults: null,

  currentSeed() {
    return get().raceIndex * 1000 + 42
  },

  currentCircuitId() {
    return CIRCUIT_ORDER[get().raceIndex % CIRCUIT_ORDER.length] ?? CIRCUIT_ORDER[0]!
  },

  viewGrid() { set({ phase: 'grid' }) },
  exitGrid() { set({ phase: 'menu' }) },
  viewHowToPlay() { set({ phase: 'how_to_play' }) },
  exitHowToPlay() { set({ phase: 'menu' }) },

  startNewSeason() {
    set({ phase: 'driver_select', playerDriverId: null, raceIndex: 0, standings: [], lastRaceResults: null })
  },

  selectDriver(id) {
    set({ playerDriverId: id })
  },

  confirmDriver() {
    if (!get().playerDriverId) return
    set({ phase: 'race_setup' })
  },

  confirmRaceSetup() {
    set({ phase: 'racing' })
  },

  recordRaceResult(positions) {
    const { standings } = get()
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

    set({ phase: 'result', standings: newStandings, lastRaceResults: results })
  },

  nextRace() {
    const { raceIndex } = get()
    if (raceIndex >= TOTAL_RACES - 1) {
      set({ phase: 'championship' })
    } else {
      set({ raceIndex: raceIndex + 1, phase: 'racing', lastRaceResults: null })
    }
  },

  playAgain() {
    set({ phase: 'menu', playerDriverId: null, raceIndex: 0, standings: [], lastRaceResults: null })
  },
}))

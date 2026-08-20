import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'
import { CIRCUIT_ORDER } from '@state/raceStore'
import { TOTAL_RACES } from '@state/seasonStore'
import { CIRCUIT_PATHS } from '@canvas/TrackCanvas'

describe('calendar', () => {
  it('has an entry for every circuit in the order', () => {
    const { circuits } = loadGameData()
    for (const id of CIRCUIT_ORDER) expect(circuits[id]).toBeTruthy()
  })

  it('never repeats a circuit', () => {
    expect(new Set(CIRCUIT_ORDER).size).toBe(CIRCUIT_ORDER.length)
  })

  it('has exactly one circuit per round', () => {
    expect(CIRCUIT_ORDER.length).toBe(TOTAL_RACES)
  })

  it('includes silverpark', () => {
    expect(loadGameData().circuits['silverpark']).toBeTruthy()
  })

  // carSensitivity/driverSensitivity are currently dead data: lapModel.ts takes
  // per-sector weighting from tuning.carPerformance.sectorSplit /
  // tuning.driverPerformance.sectorSplit (global, identical for every circuit),
  // not from these per-circuit fields. So these sums are not normalised
  // weightings today, just flavour text encoded as numbers -- e.g.
  // harbour_lights' asymmetry (car 0.78 / driver 1.36) is deliberate intent
  // ("street circuit: driver matters more than car"), not a bug. The wide band
  // below only catches typos / order-of-magnitude errors on existing circuits.
  it('keeps sector sensitivities within a sane order of magnitude', () => {
    const { circuits } = loadGameData()
    for (const [id, c] of Object.entries(circuits)) {
      const car = c.carSensitivity.reduce((a, b) => a + b, 0)
      const drv = c.driverSensitivity.reduce((a, b) => a + b, 0)
      expect(car, `${id} carSensitivity`).toBeGreaterThanOrEqual(0.75)
      expect(car, `${id} carSensitivity`).toBeLessThanOrEqual(1.40)
      expect(drv, `${id} driverSensitivity`).toBeGreaterThanOrEqual(0.75)
      expect(drv, `${id} driverSensitivity`).toBeLessThanOrEqual(1.40)
    }
  })

  // Circuits authored by this plan (twelve-race-calendar) are deliberately
  // normalised to sum to ~1.0, unlike the legacy circuits above. Guarded on
  // existence so this doesn't fail before later tasks in the plan land theirs.
  const PLAN_CIRCUITS = ['silverpark', 'costa_verde', 'kaido', 'altiplano']

  it('normalises sector sensitivities to ~1.0 for plan-authored circuits', () => {
    const { circuits } = loadGameData()
    for (const id of PLAN_CIRCUITS) {
      const c = circuits[id]
      if (!c) continue
      const car = c.carSensitivity.reduce((a, b) => a + b, 0)
      const drv = c.driverSensitivity.reduce((a, b) => a + b, 0)
      expect(car, `${id} carSensitivity`).toBeGreaterThan(0.95)
      expect(car, `${id} carSensitivity`).toBeLessThan(1.05)
      expect(drv, `${id} driverSensitivity`).toBeGreaterThan(0.95)
      expect(drv, `${id} driverSensitivity`).toBeLessThan(1.05)
    }
  })
})

describe('new circuits', () => {
  const NEW_IDS = ['silverpark', 'costa_verde', 'kaido', 'altiplano']

  it('defines all four new circuits', () => {
    const { circuits } = loadGameData()
    for (const id of NEW_IDS) expect(circuits[id], id).toBeTruthy()
  })

  // Note: sectorBoundaries holds the TWO interior sector boundaries; S3 runs
  // from the second boundary to the close of the loop. All existing path files
  // use two entries, so the length assertion is 2, not 3.
  //
  // Geometry is read through CIRCUIT_PATHS (the canvas registry of static JSON
  // imports) rather than the filesystem: @types/node is not installed, and the
  // static imports themselves are the proof that each file resolves.
  it('gives every circuit a track path file that exists and is registered', () => {
    const { circuits } = loadGameData()
    for (const [id, c] of Object.entries(circuits)) {
      expect(c.trackPath, `${id} trackPath`).toBe(`paths/${id}.json`)
      const path = CIRCUIT_PATHS[id]
      expect(path, `${id} registered in CIRCUIT_PATHS`).toBeTruthy()
      expect(Array.isArray(path!.points), `${id} points`).toBe(true)
      expect(path!.points.length, `${id} points length`).toBeGreaterThan(10)
      expect(path!.sectorBoundaries.length, `${id} sectorBoundaries`).toBe(2)
      const [b1, b2] = path!.sectorBoundaries as [number, number]
      expect(b1, `${id} boundary 1`).toBeGreaterThanOrEqual(1)
      expect(b2, `${id} boundary 2`).toBeGreaterThan(b1)
      expect(b2, `${id} boundary 2`).toBeLessThan(path!.points.length - 1)
      // pitEntry / pitExit are [x, y] coordinate pairs, not indices.
      expect(path!.pitEntry.length, `${id} pitEntry`).toBe(2)
      expect(path!.pitExit.length, `${id} pitExit`).toBe(2)
    }
  })

  it('closes every track loop and keeps segment lengths smooth', () => {
    const { circuits } = loadGameData()
    for (const id of Object.keys(circuits)) {
      const pts = CIRCUIT_PATHS[id]!.points as [number, number][]
      const first = pts[0]!, last = pts[pts.length - 1]!
      expect(Math.hypot(last[0] - first[0], last[1] - first[1]), `${id} loop close`).toBeLessThan(6)
      const segs: number[] = []
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!, b = pts[i]!
        const d = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (i < pts.length - 1) expect(d, `${id} duplicate point at ${i}`).toBeGreaterThan(0)
        segs.push(d)
      }
      // no segment wildly longer than its neighbour (renders as a straight-line artefact)
      for (let i = 1; i < segs.length - 1; i++) {
        expect(segs[i]! / segs[i - 1]!, `${id} segment jump at ${i}`).toBeLessThan(4)
      }
    }
  })

  // This guards AUTHORED DATA INTENT, not a gameplay property. circuit
  // overtakingFactor has no consumer today: race.ts:284 takes its per-sector
  // overtaking difficulty from the global tuning.overtaking.sectorFactor
  // ([1.0, 0.25, 0.55], identical for every circuit), so Kaido is not in fact
  // harder to pass on than Veloce in play. Wiring the field is a balance change
  // owned elsewhere; until then this assertion is the only thing preserving the
  // intended ordering, so that the intent is what emerges once it is wired.
  it('makes Kaido the hardest non-street circuit to overtake on', () => {
    const { circuits } = loadGameData()
    const total = (id: string) => circuits[id]!.overtakingFactor.reduce((a, b) => a + b, 0)
    expect(total('kaido')).toBeGreaterThan(total('harbour_lights'))
    for (const id of Object.keys(circuits)) {
      if (id === 'kaido' || id === 'harbour_lights') continue
      expect(total(id), id).toBeGreaterThan(total('kaido'))
    }
  })

  it('registers a canvas track path for every circuit in the order', () => {
    for (const id of CIRCUIT_ORDER) expect(CIRCUIT_PATHS[id], id).toBeTruthy()
  })
})

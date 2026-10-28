import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'
import { CIRCUIT_ORDER } from '@state/raceStore'
import { TOTAL_RACES } from '@state/seasonStore'
import { CIRCUIT_PATHS } from '@canvas/TrackCanvas'
import { isSprintRound } from '@state/sprint'

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

  // carSensitivity/driverSensitivity are LIVE as of 2026-08-23: lapModel.ts reads
  // them per circuit, RAW, in place of the global sectorSplits it used to read.
  // (This comment previously said the opposite -- "dead data ... just flavour text
  // encoded as numbers" -- and every clause of it was falsified by that wiring.)
  //
  // Because they are used raw and are NOT normalised, the sums matter: they set how
  // much the car and driver matter at all on a circuit, not merely which sector.
  // harbour_lights' asymmetry (car 0.78 / driver 1.36) is deliberate intent
  // ("street circuit: driver matters more than car") and now has teeth -- see
  // MODEL_SPEC.md section 4, where it turns out to be why the per-circuit |dpos|
  // ratio went DOWN when these were wired.
  //
  // The wide band below is a typo / order-of-magnitude guard on the data only. It
  // is deliberately not a balance gate: the behavioural gates live in
  // tests/engine/circuitDifferentiation.test.ts.
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
  // normalised to sum to ~1.0, unlike the legacy circuits above. A missing id
  // fails loudly rather than skipping the strict assertion.
  const PLAN_CIRCUITS = ['silverpark', 'costa_verde', 'kaido', 'altiplano']

  it('normalises sector sensitivities to ~1.0 for plan-authored circuits', () => {
    const { circuits } = loadGameData()
    for (const id of PLAN_CIRCUITS) {
      const c = circuits[id]
      expect(c, `${id} missing from circuits.json`).toBeTruthy()
      const car = c!.carSensitivity.reduce((a, b) => a + b, 0)
      const drv = c!.driverSensitivity.reduce((a, b) => a + b, 0)
      expect(car, `${id} carSensitivity`).toBeGreaterThan(0.95)
      expect(car, `${id} carSensitivity`).toBeLessThan(1.05)
      expect(drv, `${id} driverSensitivity`).toBeGreaterThan(0.95)
      expect(drv, `${id} driverSensitivity`).toBeLessThan(1.05)
    }
  })
})

describe('new circuits', () => {
  const NEW_IDS = ['silverpark', 'costa_verde', 'kaido', 'altiplano']

  it('schedules the sprint weekends on real rounds that are not wet-leaning', () => {
    const { circuits, tuning } = loadGameData()
    const rounds = tuning.sprint.rounds
    expect(rounds).toEqual([4, 8, 12])
    expect(new Set(rounds).size).toBe(rounds.length)
    for (const r of rounds) {
      expect(r).toBeGreaterThanOrEqual(1)
      expect(r).toBeLessThanOrEqual(TOTAL_RACES)
      expect(isSprintRound(r - 1)).toBe(true)
      const c = circuits[CIRCUIT_ORDER[r - 1]!]!
      expect(c.rainProbability ?? 0, `round ${r} (${CIRCUIT_ORDER[r - 1]}) must not be wet-leaning`).toBeLessThan(0.35)
    }
  })

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
        expect(d, `${id} duplicate point at ${i}`).toBeGreaterThan(0)
        segs.push(d)
      }
      // No segment wildly out of scale with its neighbour, in EITHER direction
      // (a long one renders as a straight-line artefact, a very short one as a
      // stall). segs is cyclic -- the last entry is the closing segment back to
      // the first point -- so every pair including the wrap is compared.
      //
      // The wrap pair gets a looser bound: on a real layout it is the short
      // final corner feeding the long start/finish straight, so a big step is
      // legitimate there and two incumbents genuinely exceed 4 across it
      // (harbour_lights 4.45, veloce 4.21). Interior pairs, where a jump is an
      // authoring mistake rather than a feature, keep the calibrated 4.
      for (let i = 0; i < segs.length; i++) {
        const cur = segs[i]!, next = segs[(i + 1) % segs.length]!
        const limit = i === segs.length - 1 ? 5 : 4
        expect(cur / next, `${id} segment jump at ${i}`).toBeLessThan(limit)
        expect(next / cur, `${id} segment jump at ${i}`).toBeLessThan(limit)
      }
    }
  })

  // This guards AUTHORED DATA INTENT, and since the overtaking-race-time work
  // it also guards a live gameplay property: resolveOvertakes now takes its
  // per-sector overtaking difficulty from circuit.overtakingFactor (it used to
  // be shadowed by the global tuning.overtaking.sectorFactor -- now deleted as
  // dead data, since resolveOvertakes was its only consumer -- identical for
  // every circuit, so Kaido was not in fact harder to pass on than Veloce in
  // play), and the layer-2 traffic cap divides by the same field. The ordering
  // asserted here is therefore the ordering the sim now races to.
  // Spec 2026-10-24 ruling R8: the old test's own message asked for this update
  // when a deliberately harder circuit arrived. Street circuits are the hardest
  // places to pass; Kaido is the hardest PERMANENT circuit.
  it('makes every street circuit harder to pass on than every permanent one, and Kaido the hardest permanent', () => {
    const { circuits } = loadGameData()
    const total = (id: string) => circuits[id]!.overtakingFactor.reduce((a, b) => a + b, 0)
    const street = Object.keys(circuits).filter(id => circuits[id]!.layout === 'street')
    const permanent = Object.keys(circuits).filter(id => circuits[id]!.layout !== 'street')
    expect(street.sort()).toEqual(['harbour_lights', 'lantern_quay'])
    for (const s of street) for (const p of permanent) {
      expect(total(s), `${s} (${total(s)}) must be harder than ${p} (${total(p)})`).toBeLessThan(total(p))
    }
    for (const p of permanent) if (p !== 'kaido') expect(total(p), p).toBeGreaterThan(total('kaido'))
  })

  it('registers a canvas track path for every circuit in the order', () => {
    for (const id of CIRCUIT_ORDER) expect(CIRCUIT_PATHS[id], id).toBeTruthy()
  })

  it('runs a twelve-round championship', () => {
    expect(TOTAL_RACES).toBe(12)
    expect(CIRCUIT_ORDER.length).toBe(12)
  })

  // weatherBias and atmosphere are both z.string().optional() in the schema and
  // both fall back silently at runtime (weather.ts: intensityBias[bias] ?? 0.2,
  // TrackCanvas: atmosphere default 'day'), so a typo is invisible without these.
  it('gives every circuit a weatherBias the weather model knows', () => {
    const { circuits, tuning } = loadGameData()
    const legal = Object.keys(tuning.weather.timeline.intensityBias)
    expect(legal.length, 'intensityBias keys').toBeGreaterThan(0)
    for (const [id, c] of Object.entries(circuits)) {
      if (c.weatherBias === undefined) continue
      expect(legal, `${id} weatherBias`).toContain(c.weatherBias)
    }
  })

  it('gives every circuit an atmosphere the canvas knows', () => {
    const { circuits } = loadGameData()
    const LEGAL_ATMOSPHERES = ['day', 'dusk', 'night', 'desert_night', 'storm', 'northern_dusk']
    for (const [id, c] of Object.entries(circuits)) {
      if (c.atmosphere === undefined) continue
      expect(LEGAL_ATMOSPHERES, `${id} atmosphere`).toContain(c.atmosphere)
    }
  })

  it('never schedules two wet-leaning rounds back to back', () => {
    const { circuits } = loadGameData()
    // Inclusive: kaido is exactly 0.35 and is a wet-leaning round for this rule.
    const RAIN_THRESHOLD = 0.35
    for (let i = 0; i < CIRCUIT_ORDER.length - 1; i++) {
      const a = circuits[CIRCUIT_ORDER[i]!]!
      const b = circuits[CIRCUIT_ORDER[i + 1]!]!
      const bothWet = (a.rainProbability ?? 0) >= RAIN_THRESHOLD && (b.rainProbability ?? 0) >= RAIN_THRESHOLD
      expect(bothWet, `${CIRCUIT_ORDER[i]} -> ${CIRCUIT_ORDER[i + 1]}`).toBe(false)
    }
  })
})

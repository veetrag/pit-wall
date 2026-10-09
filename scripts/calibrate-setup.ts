/**
 * Measures the car-setup (rear wing) tuning against the spec's section 5
 * targets (docs/superpowers/specs/2026-10-09-car-setup-design.md):
 *   - best levels across the 12 circuits cover at least 4 of the 5
 *   - best vs one step off: 0.08-0.30 s/lap (dry)
 *   - best vs worst over a dry race: ~1.5-4 places
 *   - Monte-Carlo with AI setups on stays inside every band
 *
 * Run: npx tsx scripts/calibrate-setup.ts
 * Results are recorded in MODEL_SPEC.md (Car setup).
 */
import { loadGameData } from '../src/data/validators'
import { expectedBestWing, expectedLapDelta, aiSetups, WINGS, type Wing } from '../src/engine/setup'
import { replay } from '../src/engine/debrief'
import { buildRaceConfig } from '../src/state/buildRaceConfig'
import { runRaces, type Metrics } from '../tests/engine/monteCarloHarness'
import type { RaceConfig } from '../src/engine/types'

const SEEDS = 100
const PLAYER = 'd_rossi'
// The four circuits tests/engine/monteCarlo.test.ts gates on.
const SAMPLE = ['monsoon_bay', 'sol_desert', 'harbour_lights', 'veloce']

const data = loadGameData()
const t = data.tuning
// circuits.json is keyed by id; the specs carry no id field of their own.
const circuits = Object.entries(data.circuits).map(([id, c]) => ({ id, c }))

console.log('setup tuning:', JSON.stringify(t.setup))

// 1. Per-circuit analytic optimum and step-off loss.
console.log('\n1. Expected best wing and step-off loss (dry)')
const rows = circuits.map(({ id, c }) => {
  const f = (w: Wing) => expectedLapDelta(c, t, w, 0)
  const dryBest = expectedBestWing(c, t, 0)
  const steps = WINGS.filter(w => Math.abs(w - dryBest) === 1).map(w => f(w) - f(dryBest))
  const worst = WINGS.reduce((a, w) => (f(w) > f(a) ? w : a), dryBest)
  return {
    circuit: id,
    rain: c.rainProbability ?? 0,
    best: expectedBestWing(c, t, c.rainProbability ?? 0),
    bestDry: dryBest,
    worstDry: worst,
    stepOff: Number(Math.min(...steps).toFixed(3)),
    worstLoss: Number((f(worst) - f(dryBest)).toFixed(3)),
  }
})
console.table(rows)

// 2. Distinct levels.
const distinct = new Set(rows.map(r => r.best))
console.log(`\n2. distinct best levels (rain-weighted): ${distinct.size} of 5 -> [${[...distinct].sort().join(', ')}]`)
const stepMin = Math.min(...rows.map(r => r.stepOff))
const stepMax = Math.max(...rows.map(r => r.stepOff))
console.log(`   step-off loss range: ${stepMin.toFixed(3)} .. ${stepMax.toFixed(3)} s/lap (target 0.08-0.30)`)

// 3. Race-level best vs worst, dry, rivals on aiSetups.
function dryConfig(seed: number, circuitId: string, laps: number, wing: Wing): RaceConfig {
  const built = buildRaceConfig(seed, PLAYER, circuitId, 'pro', {
    startCompound: 'M',
    plannedStops: [{ lap: Math.round(laps * 0.45), compound: 'H' }],
    wing,
  }, null)
  // Force a dry race; rivals pick against the same dry circuit they race on.
  const config: RaceConfig = { ...built, circuit: { ...built.circuit, rainProbability: 0 } }
  return { ...config, setups: { ...aiSetups(config), [PLAYER]: wing } }
}

// Finishing positions per seed (retired = 21), so best and worst can be paired.
function finishes(circuitId: string, laps: number, wing: Wing): number[] {
  const out: number[] = []
  for (let seed = 1; seed <= SEEDS; seed++) {
    const { state } = replay(dryConfig(seed, circuitId, laps, wing), seed, [])
    const me = state.cars.find(c => c.driverId === PLAYER)!
    out.push(me.retired ? 21 : me.position)
  }
  return out
}
const mean = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / xs.length

console.log(`\n3. Best vs worst wing over a dry race (${PLAYER}, pro, n=${SEEDS} seeds each)`)
const raceRows = circuits.map(({ id, c }, i) => {
  const best = finishes(id, c.laps, rows[i]!.bestDry)
  const worst = finishes(id, c.laps, rows[i]!.worstDry)
  // Paired by seed: SE of the mean per-seed difference.
  const diffs = worst.map((w, k) => w - best[k]!)
  const md = mean(diffs)
  const se = Math.sqrt(diffs.reduce((a, v) => a + (v - md) ** 2, 0) / (diffs.length - 1) / diffs.length)
  return {
    circuit: id,
    bestWing: rows[i]!.bestDry,
    worstWing: rows[i]!.worstDry,
    meanPosBest: Number(mean(best).toFixed(2)),
    meanPosWorst: Number(mean(worst).toFixed(2)),
    places: Number(md.toFixed(2)),
    se: Number(se.toFixed(2)),
  }
})
console.table(raceRows)
const places = raceRows.map(r => r.places).sort((a, b) => a - b)
const median = (places[5]! + places[6]!) / 2
console.log(`   places best vs worst: mean ${mean(places).toFixed(2)}, median ${median.toFixed(2)} (target ~1.5-4)`)

// 4. Monte-Carlo with setups on vs off, against the monteCarlo.test.ts bands.
console.log('\n4. Monte-Carlo, n=120 on the gated 4-circuit sample')
const b = t._regressionBands!
const off = runRaces({ races: 120, circuitIds: SAMPLE, withSetups: false })
const on = runRaces({ races: 120, circuitIds: SAMPLE, withSetups: true })
type Gate = [string, (m: Metrics) => number, (v: number) => boolean, string]
const gates: Gate[] = [
  ['topTeamShare', m => m.topTeamShare, v => v > b.topTeamWinRate[0] && v <= b.topTeamWinRate[1], `(${b.topTeamWinRate[0]}, ${b.topTeamWinRate[1]}]`],
  ['meanAbsPosChange', m => m.meanAbsPosChange, v => v > b.meanAbsPosChange[0] && v < b.meanAbsPosChange[1], `(${b.meanAbsPosChange[0]}, ${b.meanAbsPosChange[1]})`],
  ['gridFinishSpearman', m => m.gridFinishSpearman, v => v > b.gridFinishSpearman[0] && v < b.gridFinishSpearman[1], `(${b.gridFinishSpearman[0]}, ${b.gridFinishSpearman[1]})`],
  ['paceRankCorrelation', m => m.paceRankCorrelation, v => v >= Math.max(b.minPaceRankCorrelation, 0.9), `>= ${b.minPaceRankCorrelation}`],
  ['distinctWinners', m => m.distinctWinners, v => v >= Math.max(b.minDistinctWinners, 4), `>= ${b.minDistinctWinners}`],
  ['mechanicalDnfPerCarRace', m => m.mechanicalDnfPerCarRace, v => v >= b.mechanicalDnfPerCarRace[0] && v <= b.mechanicalDnfPerCarRace[1], `[${b.mechanicalDnfPerCarRace[0]}, ${b.mechanicalDnfPerCarRace[1]}]`],
  ['crashesPerCarRace', m => m.crashesPerCarRace, v => v >= b.crashesPerCarRace[0] && v <= b.crashesPerCarRace[1], `[${b.crashesPerCarRace[0]}, ${b.crashesPerCarRace[1]}]`],
  ['safetyCarsPerRace', m => m.safetyCarsPerRace, v => v >= b.safetyCarsPerRace[0] && v <= b.safetyCarsPerRace[1], `[${b.safetyCarsPerRace[0]}, ${b.safetyCarsPerRace[1]}]`],
  ['meanOvertakeEvents (unbanded)', m => m.meanOvertakeEvents, () => true, '-'],
]
console.table(gates.map(([name, get, ok, band]) => ({
  metric: name,
  band,
  off: Number(get(off).toFixed(4)),
  on: Number(get(on).toFixed(4)),
  inBand: ok(get(on)) ? 'yes' : 'NO',
})))
console.log(`   top team off=${off.topTeamId} on=${on.topTeamId}`)

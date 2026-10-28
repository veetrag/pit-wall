/*
 * Circuit calibration report (docs/CIRCUIT-AUTHORING.md step 5). Not a gate:
 *   CIRCUIT_REPORT=1 CIRCUITS=lantern_quay npx vitest run tests/tools/circuitReport.run.test.ts --reporter=verbose
 * Prints geometry, the wing optimum, and n=N races per difficulty for each
 * circuit and for the 4-circuit SAMPLE reference. Tune only the circuit's data.
 */
import { loadGameData } from '../src/data/validators'
import { CIRCUIT_PATHS, sectorArcShares } from '../src/data/circuitPaths'
import { expectedBestWing, expectedLapDelta, WINGS, type Wing } from '../src/engine/setup'
import { circuitTraits } from '../src/engine/circuitTraits'
import { runRaces, type Metrics } from '../tests/engine/monteCarloHarness'
import { measureClearing } from '../tests/engine/overtakeClearing'

const DATA = loadGameData()
const SAMPLE = ['monsoon_bay', 'sol_desert', 'harbour_lights', 'veloce']
const N = Number(process.env.RACES ?? 120)
const ids = (process.env.CIRCUITS ?? '').split(',').filter(Boolean)
const f = (x: number, d = 3) => x.toFixed(d)

function line(label: string, m: Metrics): string {
  return `${label.padEnd(22)} dpos ${f(m.meanAbsPosChange)} rho ${f(m.gridFinishSpearman)} pace ${f(m.paceRankCorrelation)} ` +
    `winners ${m.distinctWinners} crash ${f(m.crashesPerCarRace)} mech ${f(m.mechanicalDnfPerCarRace)} tyreDnf ${f(m.tyreDnfPerCarRace)} ` +
    `sc ${f(m.safetyCarsPerRace)} vsc ${f(m.vscPerRace)} stops ${f(m.meanStopsPerClassifiedCar)} top ${m.topTeamId} ${f(m.topTeamShare)}`
}

for (const id of ids) {
  const c = DATA.circuits[id]
  if (!c) { console.log(`unknown circuit ${id}`); continue }
  const path = CIRCUIT_PATHS[id]
  const total = c.sectorBase[0] + c.sectorBase[1] + c.sectorBase[2]
  const best = expectedBestWing(c, DATA.tuning, 0)
  const lap = (w: Wing) => expectedLapDelta(c, DATA.tuning, w, 0)
  const neighbours = WINGS.filter(w => Math.abs(w - best) === 1)
  const stepOff = Math.min(...neighbours.map(w => lap(w) - lap(best)))
  const w = c.carSensitivity
  const dStar = (DATA.tuning.setup.gripGain * (w[1] + w[2]) - DATA.tuning.setup.speedGain * w[0]) / (2 * DATA.tuning.setup.balanceCost)
  console.log(`\n=== ${id} (${c.name}) traits ${JSON.stringify(circuitTraits(c, DATA.tuning))}`)
  if (path) console.log(`arc shares ${sectorArcShares(path).map(x => f(x)).join(' / ')}  sectorBase shares ${c.sectorBase.map(x => f(x / total)).join(' / ')}`)
  console.log(`wing d* ${f(dStar)} best W${best} step-off ${f(stepOff)} s/lap (gate 0.08-0.30)`)
  for (const difficulty of ['pro', 'rookie'] as const) {
    console.log(line(`${id} ${difficulty}`, runRaces({ races: N, circuitIds: [id], difficulty })))
  }
  // 120 seeds: the same sample size the Task 3 gate checks.
  const seeds = Array.from({ length: 120 }, (_, i) => 500 + 13 * i)
  const clear = measureClearing({ circuitId: id, seeds, advantage: 0.4 })
  console.log(`clearing @0.4 s/lap fail ${f(clear.failureRate)} +- ${f(clear.seFailureRate)} median ${clear.medianLapsToClear}`)
}
console.log('\n' + line('SAMPLE pro (reference)', runRaces({ races: N, circuitIds: SAMPLE, difficulty: 'pro' })))

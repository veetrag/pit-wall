// Captures a serialised end-of-race RaceState as the byte-identity reference
// used by tests/engine/byteIdentity.test.ts.
//
// MUST mirror that test's config exactly. It did not, between the incidents
// landing and 2026-09-12: this script still passed DATA.tuning while the test
// had moved to makeDeterministicTuning, so a capture produced a fixture with
// incidents ON that the test could never match. Fixed below -- if you change
// the test's config, change it here too.
//
// Re-capture ONLY for a deliberate DATA change (see the test's own comment for
// the rule). Never to make a failing test pass after touching engine code.
//   npx vite-node scripts/capture-golden-race.ts
import { writeFileSync } from 'node:fs'
import { initRace, stepSector } from '../src/engine/index'
import { createRng } from '../src/engine/rng'
import { loadGameData } from '../src/data/validators'
import { makeDeterministicTuning } from '../tests/fixtures/tuning'
import type { RaceConfig } from '../src/engine/types'

const DATA = loadGameData()
const circuit = DATA.circuits['bengaluru']!
const config: RaceConfig = {
  circuit,
  // Mirrors byteIdentity.test.ts exactly -- incidents explicitly zeroed.
  tuning: makeDeterministicTuning({ mechanicalFailure: { baseChancePerLap: 0.008 } }),
  compounds: DATA.compounds,
  drivers: DATA.drivers.drivers,
  teams: DATA.cars.teams,
  strategies: DATA.strategies.defaults,
  playerDriverId: '__none__',
  seed: 424242,
}
let state = initRace(config)
const rng = createRng(424242)
for (let i = 0; i < circuit.laps * 3; i++) state = stepSector(config, state, rng)
writeFileSync(
  'tests/fixtures/golden-race-pre-incidents.json',
  JSON.stringify(state, null, 2) + '\n',
)
// eslint-disable-next-line no-console
console.log('captured', state.cars.length, 'cars, lap', state.lap, 'rngState', state.rngState)

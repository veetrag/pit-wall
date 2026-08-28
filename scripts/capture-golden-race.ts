// Captures a serialised end-of-race RaceState as the byte-identity reference
// for the race-incidents work. Run BEFORE any engine change:
//   npx vite-node scripts/capture-golden-race.ts
import { writeFileSync } from 'node:fs'
import { initRace, stepSector } from '../src/engine/index'
import { createRng } from '../src/engine/rng'
import { loadGameData } from '../src/data/validators'
import type { RaceConfig } from '../src/engine/types'

const DATA = loadGameData()
const circuit = DATA.circuits['bengaluru']!
const config: RaceConfig = {
  circuit,
  tuning: DATA.tuning,
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

import type { StartPayload } from '@state/startCode'
import { loadGameData } from '@data/validators'

const DATA = loadGameData()
export const FULL: StartPayload = {
  fingerprint: 0xDEADBEEF,
  recipe: {
    seed: 4_000_123_456, playerDriverId: 'd_rossi', circuitId: 'lantern_quay', difficulty: 'pro',
    strategy: { startCompound: 'M', plannedStops: [{ lap: 20, compound: 'H' }, { lap: 40, compound: 'S' }], wing: 4 },
    overlay: { purchasedTiers: { power: 3, aero: 1, pace: 2 }, rivalDevelopment: { apex: 1.4399999999999997, zenith: 2.0159999999999996 }, teamTiers: { kestrel: 3, terra: -2 } },
    gridOrder: DATA.drivers.drivers.map(d => d.id).reverse(), dryStart: false, sprint: false, allDry: false,
    lapsPercent: 75, weather: 'changeable',
  },
  calls: [
    { step: 0, kind: 'pace', mode: 'push' }, { step: 31, kind: 'hold_plan', hold: true },
    { step: 32, kind: 'hold_plan', hold: false }, { step: 60, kind: 'pit', compound: 'I' },
    { step: 61, kind: 'restart_tyre', compound: 'W' }, { step: 90, kind: 'pace', mode: 'conserve' },
  ],
  startLap: 35,
  expect: { position: 6, lapsRemaining: 9, compound: 'H', tyreAge: 12, par: 7 },
  name: 'Quay chaos L35',
}
export const MINIMAL: StartPayload = {
  fingerprint: 1,
  recipe: {
    seed: 0, playerDriverId: 'd_voss', circuitId: 'bengaluru', difficulty: 'rookie', strategy: null, overlay: null,
    gridOrder: null, dryStart: true, sprint: true, allDry: true, lapsPercent: 100, weather: 'circuit',
  },
  calls: [], startLap: 1, expect: { position: 1, lapsRemaining: 17, compound: 'S', tyreAge: 1, par: 2 }, name: 'x',
}

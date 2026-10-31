import { createRng } from '@engine/rng'
import { initRace, stepSector } from '@engine/race'
import { describeSituation, type ScenarioSituation } from '@engine/scenario'
import { neutralisationKind } from '@engine/incidents'
import { circuitTraits } from '@engine/circuitTraits'
import type { RaceState } from '@engine/types'
import { loadGameData } from '@data/validators'
import { buildScenarioConfig } from './buildRaceConfig'
import { PICKABLE_CIRCUITS } from './raceStore'
import { fnv1a } from './fingerprint'
import type { ActiveChallenge } from './scenarioStore'

export type DailyArchetype = 'recovery' | 'defend' | 'safety_car' | 'rain' | 'cliff' | 'open'
const ARCHETYPES: readonly DailyArchetype[] = ['recovery', 'defend', 'safety_car', 'rain', 'cliff', 'open']
const AUTOPILOT = '__none__'
const GAME = loadGameData()

export interface DailyChallenge {
  dateKey: string
  spec: ActiveChallenge
  archetype: DailyArchetype
  /** circuit:seed:lap:driver -- a best recorded under another signature is a different challenge (R18). */
  signature: string
  /** 0 = its archetype, 1 = open, 2 = last resort. Tests assert 2 never happens. */
  tier: 0 | 1 | 2
  racesRun: number
}

/** The device's local calendar date, 'YYYY-MM-DD' (ruling R15). */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function dailyHash(key: string): number {
  return fnv1a(`daily:v${GAME.tuning.daily.rulesVersion}:${key}`)
}

function cliffFrac(circuitId: string, car: RaceState['cars'][number]): number {
  const wear = circuitTraits(GAME.circuits[circuitId]!, GAME.tuning).wear
  return (car.tyreAge * wear) / (GAME.compounds[car.compound]?.cliff ?? 1)
}

function matches(a: DailyArchetype, sit: ScenarioSituation, st: RaceState, car: RaceState['cars'][number], circuitId: string): boolean {
  switch (a) {
    case 'recovery': return sit.position >= 8 && car.tyreAge <= 5
    case 'defend': return sit.position <= 4 && cliffFrac(circuitId, car) >= 0.6
    case 'safety_car': { const k = neutralisationKind(st.safetyCar); return k === 'sc' || k === 'vsc' }
    case 'rain': return ['S', 'M', 'H'].includes(car.compound) && st.weatherTimeline[st.lap] === 'DRY'
      && st.weatherTimeline.slice(st.lap + 1, st.lap + 4).some(w => w !== 'DRY')
    case 'cliff': return cliffFrac(circuitId, car) >= 0.8
    case 'open': return true
    default: { const never: never = a; return never }
  }
}

interface Hit { lap: number; sit: ScenarioSituation; par: number; vsc: boolean }

/** One autopilot race: the first matching lap in the window, and par (the find-scenarios rule). */
function scan(circuitId: string, seed: number, driverId: string, a: DailyArchetype, range: readonly [number, number]): Hit | null {
  const config = buildScenarioConfig({ circuitId, seed, playerDriverId: AUTOPILOT })
  const laps = config.circuit.laps
  const [w0, w1] = GAME.tuning.daily.lapWindow
  const from = Math.max(1, Math.floor(laps * w0)), to = Math.floor(laps * w1)
  const rng = createRng(seed)
  let state = initRace(config)
  let first: Omit<Hit, 'par'> | null = null
  for (let lap = 1; lap <= laps; lap++) {
    for (let s = 0; s < 3; s++) state = stepSector(config, state, rng)
    if (first || lap < from || lap > to) continue
    const sit = describeSituation(state, driverId)
    const car = state.cars.find(c => c.driverId === driverId)
    if (!sit || !car || car.retired) continue
    if (sit.position < range[0] || sit.position > range[1] || sit.lapsRemaining < 8) continue
    if (matches(a, sit, state, car, circuitId)) first = { lap, sit, vsc: neutralisationKind(state.safetyCar) === 'vsc' }
  }
  const car = state.cars.find(c => c.driverId === driverId)
  if (!first || !car || car.retired || car.position < 2) return null
  return { ...first, par: car.position }
}

const BLURB: Record<DailyArchetype, (s: ScenarioSituation) => string> = {
  recovery: s => `P${s.position} on fresh tyres with ${s.lapsRemaining} laps to go. Carve back through.`,
  defend: s => `P${s.position}, tyres past their best, ${s.lapsRemaining} laps left. Hold it or stop and fight.`,
  safety_car: s => `The field is neutralised and you are P${s.position}. Cheap stop, or track position?`,
  rain: s => `Dry for now, rain is close, and you are P${s.position} on slicks. Call it.`,
  cliff: s => `P${s.position} and your tyres are at the cliff. ${s.lapsRemaining} laps is a long way.`,
  open: s => `P${s.position}, ${s.lapsRemaining} laps to go. Find the strategy that gains a place.`,
}

/** Today's challenge, deterministic from the date key (spec 2026-10-24 §4.2). */
export function generateDaily(key: string): DailyChallenge {
  const h = dailyHash(key)
  const stream = createRng(h)
  const pick = (n: number) => Math.floor(stream() * n)
  const circuitId = PICKABLE_CIRCUITS[h % PICKABLE_CIRCUITS.length]!
  const drivers = GAME.drivers.drivers
  const driverId = drivers[pick(drivers.length)]!.id
  const archetype = ARCHETYPES[pick(ARCHETYPES.length)]!
  const range = GAME.tuning.daily.positionRange
  const tiers: [DailyArchetype, readonly [number, number]][] = [[archetype, range], ['open', range], ['open', [2, 20]]]
  let racesRun = 0
  for (let t = 0; t < tiers.length; t++) {
    const [a, r] = tiers[t]!
    for (let k = 0; k < GAME.tuning.daily.maxSearchRaces; k++) {
      const seed = Math.floor(stream() * 2 ** 31)
      racesRun++
      const hit = scan(circuitId, seed, driverId, a, r)
      if (!hit) continue
      const circuit = GAME.circuits[circuitId]!
      const spec: ActiveChallenge = {
        kind: 'daily', id: `daily-${key}`, name: `Daily · ${circuit.name}`, blurb: BLURB[a](hit.sit),
        circuitId, seed, playerDriverId: driverId, startLap: hit.lap, goal: { position: hit.par - 1 },
        expect: {
          position: hit.sit.position, lapsRemaining: hit.sit.lapsRemaining, compound: hit.sit.compound,
          tyreAge: hit.sit.tyreAge, safetyCarOut: hit.sit.safetyCarOut, par: hit.par,
          ...(hit.vsc ? { vscOut: true as const } : {}),
        },
      }
      return { dateKey: key, spec, archetype: a, signature: `${circuitId}:${seed}:${hit.lap}:${driverId}`, tier: t as 0 | 1 | 2, racesRun }
    }
  }
  throw new Error(`daily ${key}: no challenge in ${racesRun} races`)   // tests/state/dailyYear.test.ts proves unreachable
}

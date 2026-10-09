import type {
  RaceConfig, RaceState, Compound, JudgedCall, Alternative, OptionOutcome, CallVerdict, DebriefResult,
} from './types'
import { initRace, stepSector } from './race'
import { createRng, type Rng } from './rng'
import { applyCall, type PlayerCall } from './playerCalls'

/** The same finish condition raceStore.step uses. */
export function isFinished(state: RaceState): boolean {
  return state.lap >= state.totalLaps && state.sector === 0
}

/**
 * Runs a race forward from `start`, applying every call whose step is at or
 * after start.step at exactly that step (before the step is simulated), until
 * `untilStep` (exclusive of calls at that step) or the flag.
 */
export function simulate(
  config: RaceConfig,
  start: { state: RaceState; step: number },
  rng: Rng,
  calls: readonly PlayerCall[],
  untilStep = Number.POSITIVE_INFINITY,
): { state: RaceState; step: number } {
  const pending = calls.filter(c => c.step >= start.step).slice().sort((a, b) => a.step - b.step)
  let { state, step } = start
  let i = 0
  for (;;) {
    if (step >= untilStep) break
    while (i < pending.length && pending[i]!.step === step) {
      state = applyCall(config, state, pending[i]!, rng)
      i++
    }
    if (isFinished(state)) break
    state = stepSector(config, state, rng)
    step++
  }
  return { state, step }
}

/** The race as it happened: (config, seed, calls) -> identical state. */
export function replay(
  config: RaceConfig, seed: number, calls: readonly PlayerCall[], untilStep?: number,
): { state: RaceState; step: number; rng: Rng } {
  const rng = createRng(seed)
  const out = simulate(config, { state: initRace(config), step: 0 }, rng, calls, untilStep)
  return { ...out, rng }
}

const COMPOUNDS: Compound[] = ['S', 'M', 'H', 'I', 'W']

export function futureSeed(seed: number, branchStep: number, k: number): number {
  return (Math.imul(seed | 0, 1000003) + Math.imul(branchStep + 1, 7919) + Math.imul(k + 1, 104729)) >>> 0
}

function finishPosition(state: RaceState): number {
  const p = state.cars.find(c => c.isPlayer)!
  return p.retired ? state.cars.length + 1 : p.position
}

function outcome(positions: number[]): OptionOutcome {
  return { positions, meanPosition: positions.reduce((a, b) => a + b, 0) / positions.length }
}

export function pickBetter(
  actual: OptionOutcome,
  candidates: { alternative: Alternative; outcome: OptionOutcome }[],
  minGain: number, minShare: number,
): CallVerdict['better'] {
  let best: CallVerdict['better'] = null
  for (const c of candidates) {
    const gain = actual.meanPosition - c.outcome.meanPosition
    const wins = c.outcome.positions.filter((p, k) => p < actual.positions[k]!).length
    const betterShare = wins / c.outcome.positions.length
    if (gain < minGain || betterShare < minShare) continue
    if (!best || c.outcome.meanPosition < best.meanPosition) {
      best = { ...c.outcome, alternative: c.alternative, betterShare }
    }
  }
  return best
}

/** One branch's comparable option: a config and call list to run from the shared past. */
interface Option { alternative: Alternative | null; config: RaceConfig; calls: readonly PlayerCall[] }

function withPlan(config: RaceConfig, edit: (plan: NonNullable<RaceConfig['playerStrategyOverride']>) => NonNullable<RaceConfig['playerStrategyOverride']>): RaceConfig {
  const plan = config.playerStrategyOverride
  return plan ? { ...config, playerStrategyOverride: edit(plan) } : config
}

/**
 * The engine executes the player's plan from the car's own `strategy`, which
 * initRace copies from config.playerStrategyOverride. A shared past replayed
 * on the ACTUAL config carries the actual plan, so an option that edits the
 * plan must also write its stops onto the car, or the edit is never executed.
 */
function withPlayerPlan(state: RaceState, config: RaceConfig): RaceState {
  const plan = config.playerStrategyOverride
  if (!plan) return state
  return {
    ...state,
    cars: state.cars.map(c => c.isPlayer ? { ...c, strategy: { ...c.strategy, plannedStops: plan.plannedStops } } : c),
  }
}

export function judgeCalls(
  config: RaceConfig, seed: number, calls: readonly PlayerCall[],
  onProgress?: (done: number, total: number) => void,
): DebriefResult {
  const { futures, lapOffsets, minGain, minShare } = config.tuning.debrief
  const minOffset = Math.min(0, ...lapOffsets)

  // The race as it happened, recording the lap of every call and every stop.
  const actualRun = replay(config, seed, calls)
  const player = actualRun.state.cars.find(c => c.isPlayer)!
  const lastLap = actualRun.state.totalLaps - 1

  // Laps at which the plan's stops happened.
  const planStops: { index: number; lap: number; compound: Compound }[] = []
  const callLaps = new Map<number, number>()       // step -> state.lap at that step
  {
    const rng = createRng(seed)
    let state = initRace(config)
    let step = 0
    let pitsBefore = 0
    const sorted = calls.slice().sort((a, b) => a.step - b.step)
    let i = 0
    for (;;) {
      while (i < sorted.length && sorted[i]!.step === step) {
        callLaps.set(step, state.lap)
        state = applyCall(config, state, sorted[i]!, rng)
        i++
      }
      pitsBefore = state.cars.find(c => c.isPlayer)!.pitsDone
      if (isFinished(state)) break
      state = stepSector(config, state, rng)
      step++
      const now = state.cars.find(c => c.isPlayer)!
      // Manual pits are applied BEFORE the step and already counted in
      // pitsBefore, so any increase across the step is the plan's.
      if (now.pitsDone > pitsBefore) {
        const plan = config.playerStrategyOverride
        const planned = plan?.plannedStops[pitsBefore]
        if (planned) planStops.push({ index: pitsBefore, lap: planned.lap, compound: planned.compound })
      }
    }
    // A stop too late to reach is exactly the mistake to catch.
    // Planned stops the race never reached (the car retired first, typically
    // on worn tyres) are still the player's call: judging them is exactly how
    // the debrief says "stop earlier". Without this a tyre failure before the
    // planned lap would leave the plan unjudged.
    const plan = config.playerStrategyOverride
    if (plan) {
      for (let j = pitsBefore; j < plan.plannedStops.length; j++) {
        const s = plan.plannedStops[j]!
        if (s.lap <= lastLap) planStops.push({ index: j, lap: s.lap, compound: s.compound })
      }
    }
  }

  // Every (call, options) group to evaluate.
  const groups: { call: JudgedCall; branchLap: number; options: Option[] }[] = []
  // Alternatives are offered from the STARTING allocation. A compound used
  // up by the time of the call is still offered; applyPlayerPit /
  // resolveAllocatedCompound then fall back to the nearest available set in
  // that branch, so the option is penalised honestly, never crashes.
  const startAllocation = initRace(config).cars.find(c => c.isPlayer)!.tyreAllocation
  const legal = (exclude: Compound, _lap: number) =>
    COMPOUNDS.filter(c => c !== exclude && (startAllocation[c] ?? 0) > 0)

  // Starting compound.
  const plan = config.playerStrategyOverride
  if (plan) {
    groups.push({
      call: { kind: 'start', compound: plan.startCompound },
      branchLap: 0,
      options: [
        { alternative: null, config, calls },
        ...legal(plan.startCompound, 0).map(c => ({
          alternative: { kind: 'start', compound: c } as Alternative,
          config: withPlan(config, p => ({ ...p, startCompound: c })),
          calls,
        })),
      ],
    })
  }

  // Executed plan stops.
  for (const ps of planStops) {
    const editStop = (lap: number, compound: Compound) => withPlan(config, p => ({
      ...p, plannedStops: p.plannedStops.map((s, j) => j === ps.index ? { lap, compound } : s),
    }))
    const timing = lapOffsets
      .map(d => ps.lap + d)
      .filter(l => l >= 1 && l <= lastLap)
      .map(l => ({ alternative: { kind: 'plan', lap: l, compound: ps.compound } as Alternative, config: editStop(l, ps.compound), calls }))
    const tyre = legal(ps.compound, ps.lap)
      .map(c => ({ alternative: { kind: 'plan', lap: ps.lap, compound: c } as Alternative, config: editStop(ps.lap, c), calls }))
    groups.push({
      call: { kind: 'plan', lap: ps.lap, compound: ps.compound },
      branchLap: ps.lap + minOffset,
      options: [{ alternative: null, config, calls }, ...timing, ...tyre],
    })
  }

  // Logged calls.
  calls.forEach((call, idx) => {
    const lap = callLaps.get(call.step) ?? 0
    const others = calls.filter((_, j) => j !== idx)
    const moved = (d: number): PlayerCall => ({ ...call, step: call.step + 3 * d })
    const timing = lapOffsets
      .filter(d => lap + d >= 0 && lap + d <= lastLap)
      .map(d => ({
        alternative: (call.kind === 'pit'
          ? { kind: 'pit', lap: lap + d + 1, compound: call.compound }
          : { kind: 'pace', lap: lap + d + 1, mode: call.mode }) as Alternative,
        config,
        calls: [...others, moved(d)],
      }))
    const extra: Option[] = call.kind === 'pit'
      ? legal(call.compound, lap).map(c => ({
          alternative: { kind: 'pit', lap: lap + 1, compound: c } as Alternative,
          config,
          calls: [...others, { ...call, compound: c }],
        }))
      : [{ alternative: { kind: 'pace-none' }, config, calls: others }]
    groups.push({
      call: call.kind === 'pit'
        ? { kind: 'pit', lap: lap + 1, compound: call.compound }
        : { kind: 'pace', lap: lap + 1, mode: call.mode },
      branchLap: lap + minOffset,
      options: [{ alternative: null, config, calls }, ...timing, ...extra],
    })
  })

  const total = groups.reduce((n, g) => n + g.options.length * futures, 0)
  let done = 0
  const verdicts: CallVerdict[] = []

  for (const g of groups) {
    // Shared past: the real race, on its own seed, up to the branch.
    const branchStep = Math.max(0, 3 * (g.branchLap - 2))
    const isStart = g.call.kind === 'start'
    const outcomes = g.options.map(opt => {
      const positions: number[] = []
      for (let k = 0; k < futures; k++) {
        const past = isStart
          ? { state: initRace(opt.config), step: 0 }
          : (() => { const r = replay(config, seed, calls, branchStep); return { state: withPlayerPlan(r.state, opt.config), step: r.step } })()
        const end = simulate(opt.config, past, createRng(futureSeed(seed, branchStep, k)), opt.calls)
        positions.push(finishPosition(end.state))
        done++
        onProgress?.(done, total)
      }
      return outcome(positions)
    })
    const [actual, ...alts] = outcomes
    verdicts.push({
      call: g.call,
      actual: actual!,
      better: pickBetter(actual!, alts.map((o2, j) => ({ alternative: g.options[j + 1]!.alternative!, outcome: o2 })), minGain, minShare),
    })
  }

  const left = (v: CallVerdict) => (v.better ? v.actual.meanPosition - v.better.meanPosition : 0)
  verdicts.sort((a, b) => left(b) - left(a))

  return {
    futures,
    verdicts,
    retired: player.retired && player.retiredCause
      ? { lap: (player.retiredLap ?? player.lap) + 1, cause: player.retiredCause }
      : null,
  }
}

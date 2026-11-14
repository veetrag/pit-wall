import radioData from '@data/radio.json'
import { tyreCliffFraction, effectiveTyreAge } from '@engine/tyres'
import { neutralisationKind } from '@engine/incidents'
import { thermalStatus } from '@engine/thermal'
import type { RaceState, RaceConfig, Compound, IncidentKind } from '@engine/types'
import { wingOf } from '@engine/setup'
import { soundService } from '@audio/soundService'
import type { RadioRequest } from './radioRequests'

const RETIREMENT_RADIO: Record<'tyre' | 'mechanical' | 'crash', string> = {
  tyre: 'retired',
  mechanical: 'retired_mechanical',
  crash: 'retired_crash',
}

/**
 * The player's 2.0 incidents and the radio trigger each one fires (spec
 * 2026-10-24). One row per kind; later tasks add rows. Lines live in radio.json.
 */
export const V2_RADIO: Partial<Record<IncidentKind, string>> = {
  double_stack: 'double_stack',
  penalty_issued: 'penalty',
  unsafe_release: 'unsafe_release',
  graining: 'graining',
}

type RadioPool = Record<string, string[]>
const pools = radioData as RadioPool

function pick(trigger: string, vars: Record<string, string | number> = {}): string | null {
  const pool = pools[trigger]
  if (!pool || pool.length === 0) return null
  const line = pool[Math.floor(Math.random() * pool.length)]!
  return line.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

const REQUEST_TYRE: Record<Compound, string> = { S: 'softs', M: 'mediums', H: 'hards', I: 'inters', W: 'wets' }

/** The words for a driver radio request (spec 1.6 §2). Chosen here, outside the engine. */
export function requestLine(request: RadioRequest, config: RaceConfig): string {
  const ahead = request.aheadId ? (config.drivers.find(d => d.id === request.aheadId)?.code ?? request.aheadId) : ''
  switch (request.kind) {
    case 'box': return pick('request_box', { ahead }) ?? ''
    case 'push': return pick('request_push', { ahead }) ?? ''
    case 'rain': {
      // Inters/wets are 'rain'; any slick is 'dry' (1.6.2).
      const c = request.compound ?? 'I'
      const wet = c === 'I' || c === 'W'
      return pick(wet ? 'request_rain' : 'request_dry', { tyre: REQUEST_TYRE[c] }) ?? ''
    }
    default: { const never: never = request.kind; return never }
  }
}

let lastRadioMs = 0
const RADIO_COOLDOWN_MS = 2000
let lastPriority = 0
let lastReplaceKey: string | undefined

/** Pushes a radio line. `replaceKey` marks lines that supersede one another. */
export type RadioPushFn = (msg: string, severity: 'info' | 'caution' | 'urgent', replaceKey?: string) => void

/** Key for lines that state the player's position: a newer one replaces an older one. */
export const POSITION_KEY = 'position'

function tryPush(
  trigger: string,
  priority: 2 | 1 | 0,
  vars: Record<string, string | number>,
  pushFn: RadioPushFn,
  replaceKey?: string,
) : boolean {
  const now = Date.now()
  // A line that replaces the last one shown (same key) bypasses the cooldown:
  // it does not add chatter, it corrects a now-stale line.
  const replacing = replaceKey !== undefined && replaceKey === lastReplaceKey
  if (!replacing && now - lastRadioMs < RADIO_COOLDOWN_MS && priority <= lastPriority) return false
  const line = pick(trigger, vars)
  if (!line) return false
  lastRadioMs = now
  lastPriority = priority
  lastReplaceKey = replaceKey
  const severity: 'info' | 'caution' | 'urgent' =
    priority === 2 ? 'urgent' : priority === 1 ? 'caution' : 'info'
  pushFn(line, severity, replaceKey)
  return true
}

export interface RadioState {
  prevOvertakeCount: number
  prevLap: number
  prevPlayerTyreAge: number
  prevPlayerPos: number
  prevGap: number
  prevSpinCount: number
  hasWon: boolean
  cliffWarned: boolean
  prevRetired: boolean
  lowWingWarned: boolean
  prevVscCount: number
  prevSlowStops: number
  prevRedFlags: number
  /** Cursor into the player's own incidents: each is radioed at most once. */
  prevPlayerIncidents: number
  /** Cursor into the team-mate's double_stack incidents. */
  prevMateStacks: number
  /**
   * Running totals over `state.incidents[0, index)`, so each tick only reads
   * the incidents appended since the last one (the log is append-only).
   * Seeded by makeRadioState from a handover state; absent only on a
   * state made without one (the first tick then scans the log once). Reset if the
   * player or team-mate identity changes.
   */
  incidentScan?: IncidentScan
  /** 2.1: the "tyres are cooked" line has gone out this stint (reset at each pit exit). */
  hotWarned: boolean
  /** 2.1: this out-lap has read COLD on an earlier tick, so the turn to the window earns "tyres are in". */
  outLapCold: boolean
  /**
   * 2.1: the player started graining while the field was neutralised; the
   * line waits for green (and is dropped if the grain has cleared by then).
   */
  grainingDeferred: boolean
}

interface IncidentScan {
  index: number
  playerId: string
  mateId: string | null
  redFlags: number
  vsc: number
  mySlow: number
  lastSlowLoss: number
  myCount: number
  mateStacks: number
  /** lap*3+sector of each of the player's track_limits incidents, in log order. */
  myTrackLimits: number[]
}

type Incident = RaceState['incidents'][number]

/**
 * Extends the scan over the incidents appended since `prev.index`. Returns
 * the new scan plus the player's and mate's double_stack incidents found in
 * the new range (in log order).
 */
function scanIncidents(
  incidents: readonly Incident[], prev: IncidentScan | undefined, playerId: string, mateId: string | null,
): { scan: IncidentScan; newMine: Incident[]; newMateStacks: Incident[]; myBefore: number; mateBefore: number } {
  const fresh = !prev || prev.playerId !== playerId || prev.mateId !== mateId || prev.index > incidents.length
  const scan: IncidentScan = fresh
    ? { index: 0, playerId, mateId, redFlags: 0, vsc: 0, mySlow: 0, lastSlowLoss: 0, myCount: 0, mateStacks: 0, myTrackLimits: [] }
    : { ...prev }
  const myBefore = scan.myCount
  const mateBefore = scan.mateStacks
  const newMine: Incident[] = []
  const newMateStacks: Incident[] = []
  let tl = scan.myTrackLimits
  for (let i = scan.index; i < incidents.length; i++) {
    const ev = incidents[i]!
    if (ev.kind === 'red_flag') scan.redFlags++
    else if (ev.kind === 'vsc_deployed') scan.vsc++
    if (ev.driverId === playerId) {
      scan.myCount++
      newMine.push(ev)
      if (ev.kind === 'slow_stop') { scan.mySlow++; scan.lastSlowLoss = ev.timeLoss ?? 0 }
      if (ev.kind === 'track_limits') { if (tl === scan.myTrackLimits) tl = [...tl]; tl.push(ev.lap * 3 + ev.sector) }
    } else if (mateId !== null && ev.driverId === mateId && ev.kind === 'double_stack') {
      scan.mateStacks++
      newMateStacks.push(ev)
    }
  }
  scan.myTrackLimits = tl
  scan.index = incidents.length
  return { scan, newMine, newMateStacks, myBefore, mateBefore }
}

/** The k-th onward incidents of a driver: the new range when the cursor is in step, else a full filter (seeded oddly). */
function fromCursor(all: () => Incident[], cursor: number, scannedBefore: number, fresh: Incident[]): Incident[] {
  return cursor === scannedBefore ? fresh : all().slice(cursor)
}

/**
 * A fresh radio state. Pass the race state when starting mid-race (scenario,
 * custom start): every count cursor is seeded past what already happened in
 * it (incidents, red flags, VSCs, slow stops, spins, overtakes), so the first
 * tick does not replay their radio lines. Pass the config too so a handover on
 * an already-overheating tyre does not announce it as news (2.1).
 */
export function makeRadioState(state?: RaceState, config?: RaceConfig): RadioState {
  const player = state?.cars.find(c => c.isPlayer)
  const mate = player ? state?.cars.find(c => c.teamId === player.teamId && c.driverId !== player.driverId) : undefined
  const incidents = state?.incidents ?? []
  const count = (kind: IncidentKind) => incidents.reduce((n, i) => n + (i.kind === kind ? 1 : 0), 0)
  return {
    prevOvertakeCount: state?.overtakeEvents.length ?? 0,
    prevLap: state?.lap ?? 0,
    prevPlayerTyreAge: player?.tyreAge ?? 0,
    prevPlayerPos: -1,
    prevGap: Infinity,
    prevSpinCount: player ? (state?.sectorResults ?? []).filter(r => r.driverId === player.driverId && r.spinLoss > 0).length : 0,
    hasWon: false,
    cliffWarned: false,
    prevRetired: player?.retired ?? false,
    lowWingWarned: false,
    prevVscCount: count('vsc_deployed'),
    prevSlowStops: player ? incidents.filter(i => i.kind === 'slow_stop' && i.driverId === player.driverId).length : 0,
    prevRedFlags: count('red_flag'),
    prevPlayerIncidents: player ? incidents.filter(i => i.driverId === player.driverId).length : 0,
    prevMateStacks: mate ? incidents.filter(i => i.kind === 'double_stack' && i.driverId === mate.driverId).length : 0,
    incidentScan: player ? scanIncidents(incidents, undefined, player.driverId, mate?.driverId ?? null).scan : undefined,
    hotWarned: !!(state && config && player && thermalStatus(config, player, state.weatherState)?.zone === 'hot'),
    outLapCold: false,
    grainingDeferred: false,
  }
}

export function processRadioTick(
  state: RaceState,
  config: RaceConfig,
  radio: RadioState,
  pushAlert: RadioPushFn,
): RadioState {
  const player = state.cars.find(c => c.isPlayer)
  if (!player) return radio

  const next = { ...radio }
  const pos = player.position
  const totalLaps = state.totalLaps
  const compound = config.compounds[player.compound]

  // 0. Retirement (highest priority — the race is over, nothing else matters)
  if (player.retired && !radio.prevRetired) {
    // Keyed rather than a ternary: the generic 'retired' bucket contains
    // "Puncture, nothing we could do", so routing a crash there would have the
    // engineer report the wrong incident on the one call the player always hears.
    const trigger = RETIREMENT_RADIO[player.retiredCause ?? 'tyre']
    tryPush(trigger, 2, {}, pushAlert)
  }
  next.prevRetired = player.retired
  if (player.retired) return next // nothing else is relevant once retired

  // 2.0 incidents (V2_RADIO). A cursor, so each fires once however many ticks see it.
  const mate = state.cars.find(c => c.teamId === player.teamId && c.driverId !== player.driverId)
  const mateCode = mate ? (config.drivers.find(d => d.id === mate.driverId)?.code ?? mate.driverId) : ''
  const { scan, newMine, newMateStacks, myBefore, mateBefore } =
    scanIncidents(state.incidents, radio.incidentScan, player.driverId, mate?.driverId ?? null)
  next.incidentScan = scan
  const allowed = config.tuning.penalties.trackLimits.warningsAllowed
  // Graining nearly always starts behind (or as) the SC/VSC (MODEL_SPEC §17.2):
  // "We're graining" over a neutralised field is noise, so it waits for green.
  const neutralised = neutralisationKind(state.safetyCar) !== null
  let grainingDeferred = radio.grainingDeferred
  for (const ev of fromCursor(() => state.incidents.filter(i => i.driverId === player.driverId), radio.prevPlayerIncidents, myBefore, newMine)) {
    if (ev.kind === 'graining' && neutralised) { grainingDeferred = true; continue }
    const trigger = V2_RADIO[ev.kind]
    if (trigger) tryPush(trigger, 1, { sec: ev.timeLoss?.toFixed(1) ?? '', mate: mateCode }, pushAlert)
    // The warning that uses up the allowance: one more and it is a penalty.
    if (ev.kind === 'track_limits' && allowed > 0) {
      const at = ev.lap * 3 + ev.sector
      let n = 0
      for (const k of scan.myTrackLimits) if (k <= at) n++
      if (n === allowed) tryPush('track_limits_last', 1, {}, pushAlert)
    }
  }
  next.prevPlayerIncidents = scan.myCount
  if (grainingDeferred && !neutralised) {
    // Green again: say it once if the tyre is still graining, else let it go.
    if (!(player.thermal && player.thermal.grainLaps > 0) || tryPush('graining', 1, {}, pushAlert)) grainingDeferred = false
  }
  next.grainingDeferred = grainingDeferred
  // The team-mate queued behind the player: told when it lands within a lap of the player's last stop.
  const myLastStop = player.pitsDone > 0 ? player.lap - player.tyreAge : -Infinity
  const mateNew = mate
    ? fromCursor(() => state.incidents.filter(i => i.kind === 'double_stack' && i.driverId === mate.driverId), radio.prevMateStacks, mateBefore, newMateStacks)
    : []
  for (const ev of mateNew) {
    if (Math.abs(ev.lap - myLastStop) <= 1) tryPush('double_stack_mate', 1, { mate: mateCode }, pushAlert)
  }
  next.prevMateStacks = scan.mateStacks

  // 0a. The red flag (spec 1.6 §4): the most urgent call of the race.
  const redFlags = scan.redFlags
  if (redFlags > radio.prevRedFlags) tryPush('red_flag', 2, {}, pushAlert)
  next.prevRedFlags = redFlags

  // 0b. A VSC opening with the player's planned stop close: the cheap stop is a
  // now-or-never call. Same window the AI reacts on (tuning.ai), so the
  // engineer never tells the player to box for a stop the smart teams would
  // not take. (Pre-flight ruling P6: planned stop only, no tyre-wear clause.)
  const vscCount = scan.vsc
  // Only while the VSC is still live: never call a cheap stop that has gone.
  const liveKind = neutralisationKind(state.safetyCar)
  let vscLive: boolean
  switch (liveKind) {
    case 'vsc': vscLive = true; break
    case 'sc':
    case 'red':
    case null: vscLive = false; break
    default: { const never: never = liveKind; vscLive = never }
  }
  if (vscCount > radio.prevVscCount && vscLive) {
    const nextStop = player.strategy.plannedStops[player.pitsDone]
    if (nextStop !== undefined && nextStop.lap - player.lap <= config.tuning.ai.neutralisationWindowLaps) {
      tryPush('vsc_box', 2, {}, pushAlert)
    }
  }
  next.prevVscCount = vscCount

  // 0c. The player's own slow stop (spec 1.6 §1). Counted from the incident
  // log, so a stop made by the PIT button between ticks is not missed.
  if (scan.mySlow > radio.prevSlowStops) {
    tryPush('slow_stop', 2, { loss: scan.lastSlowLoss.toFixed(1) }, pushAlert)
  }
  next.prevSlowStops = scan.mySlow

  // 0d. Tyre temperature (2.1, spec §5.4): state-based, so one-shot flags.
  // Null while tyre temperature is off -- the flags then never move.
  const temp = thermalStatus(config, player, state.weatherState)
  if (temp) {
    const pitExit = player.tyreAge === 0 && radio.prevPlayerTyreAge > 0
    let hotWarned = pitExit ? false : radio.hotWarned
    let outLapCold = pitExit ? false : radio.outLapCold
    // Once per stint: well past the window (more than 6 above it), not a brush with it.
    if (!hotWarned && temp.zone === 'hot' && temp.temp - temp.hi > 6) {
      if (tryPush('tyres_hot', 1, {}, pushAlert)) hotWarned = true
    }
    // Once per out-lap: the fresh set read cold, and has now come into its window.
    const outLap = player.tyreAge === 0 && player.pitsDone > 0
    if (!outLap) outLapCold = false
    else if (temp.zone === 'cold') outLapCold = true
    else if (temp.zone === 'window' && outLapCold) {
      if (tryPush('tyres_in', 0, {}, pushAlert)) outLapCold = false
    }
    next.hotWarned = hotWarned
    next.outLapCold = outLapCold
  }

  // 1. Tyre cliff (high priority, fire once per stint)
  if (compound) {
    const driver = config.drivers.find(d => d.id === player.driverId)
    const effAge = driver ? effectiveTyreAge(player, driver, state.weatherState, config) : player.tyreAge
    const cliffFrac = tyreCliffFraction(compound, effAge)
    if (cliffFrac >= 0.75 && !radio.cliffWarned && player.tyreAge > 5) {
      tryPush('tyre_cliff', 2, {}, pushAlert)
      next.cliffWarned = true
    }
    if (player.tyreAge === 0) next.cliffWarned = false // reset after pit
  }

  // 2. Wet spin — event-driven (fires exactly when it happens), not a vague
  // weather forecast. The strip in the HUD already covers "what's the weather."
  const playerSpinCount = state.sectorResults.filter(r => r.driverId === player.driverId && r.spinLoss > 0).length
  if (playerSpinCount > radio.prevSpinCount) {
    // Wet-family tyres on a dry track also spin (engine dryTrackSpinChance); the
    // wet_spin pool blames slicks, which would be wrong there.
    const onWetTyres = compound?.type === 'wet'
    tryPush(onWetTyres && state.weatherState === 'DRY' ? 'dry_spin' : 'wet_spin', 2, {}, pushAlert)
  }
  next.prevSpinCount = playerSpinCount

  // Setup consequence: rain on a low wing. Once per race; only when setups exist.
  if (!radio.lowWingWarned && state.weatherState !== 'DRY' && config.setups && wingOf(config, player.driverId) <= 2) {
    // Only spend the one-shot warning if the line actually went out; a cooldown drop retries next tick.
    if (tryPush('low_wing_wet', 1, {}, pushAlert)) next.lowWingWarned = true
  }

  // 3. Win / podium (fire once)
  if (state.lap >= totalLaps && !radio.hasWon) {
    if (pos === 1) {
      tryPush('win', 2, { pos }, pushAlert)
    } else if (pos <= 3) {
      tryPush('podium', 2, { pos }, pushAlert)
    }
    next.hasWon = true
  }

  // 4. Pit exit (tyreAge reset from non-zero)
  if (player.tyreAge === 0 && radio.prevPlayerTyreAge > 5) {
    tryPush('pit_exit', 1, {}, pushAlert)
  }
  next.prevPlayerTyreAge = player.tyreAge

  // 5. Overtakes: every event since the cursor (not only the last one), one
  // line per tick, stating the player's position as it is now.
  const newOvertakes = state.overtakeEvents.length
  if (newOvertakes > radio.prevOvertakeCount) {
    let net = 0
    let lastInvolved: 'made' | 'lost' | null = null
    for (const ev of state.overtakeEvents.slice(radio.prevOvertakeCount)) {
      if (ev.overtakerId === player.driverId) { net++; lastInvolved = 'made' }
      else if (ev.overtakenId === player.driverId) { net--; lastInvolved = 'lost' }
    }
    const kind = net > 0 ? 'made' : net < 0 ? 'lost' : lastInvolved
    if (kind === 'made') {
      tryPush('overtake_made', 1, { pos }, pushAlert, POSITION_KEY)
      soundService.play('positionGain')
    } else if (kind === 'lost') {
      tryPush('overtake_lost', 1, { pos }, pushAlert, POSITION_KEY)
      soundService.play('positionLoss')
    }
    next.prevOvertakeCount = newOvertakes
  }

  // 6. Final lap
  if (state.lap === totalLaps - 1 && radio.prevLap < totalLaps - 1) {
    tryPush('final_lap', 1, {}, pushAlert)
  }
  next.prevLap = state.lap

  // 7. Gap to car ahead (low priority)
  const ahead = state.cars.find(c => c.position === pos - 1)
  if (ahead) {
    const curGap = Math.abs(player.raceTime - ahead.raceTime)
    const n = curGap.toFixed(1)
    if (curGap < radio.prevGap - 0.5 && curGap < 3) {
      tryPush('gap_closing', 0, { n }, pushAlert)
    } else if (curGap > radio.prevGap + 0.8 && radio.prevGap < 3) {
      tryPush('gap_pulling', 0, { n }, pushAlert)
    }
    next.prevGap = curGap
  }

  next.prevPlayerPos = pos
  return next
}

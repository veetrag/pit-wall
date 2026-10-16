import radioData from '@data/radio.json'
import { tyreCliffFraction, effectiveTyreAge } from '@engine/tyres'
import type { RaceState, RaceConfig } from '@engine/types'
import { wingOf } from '@engine/setup'
import { soundService } from '@audio/soundService'

const RETIREMENT_RADIO: Record<'tyre' | 'mechanical' | 'crash', string> = {
  tyre: 'retired',
  mechanical: 'retired_mechanical',
  crash: 'retired_crash',
}

type RadioPool = Record<string, string[]>
const pools = radioData as RadioPool

function pick(trigger: string, vars: Record<string, string | number> = {}): string | null {
  const pool = pools[trigger]
  if (!pool || pool.length === 0) return null
  const line = pool[Math.floor(Math.random() * pool.length)]!
  return line.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

let lastRadioMs = 0
const RADIO_COOLDOWN_MS = 2000
let lastPriority = 0

function tryPush(
  trigger: string,
  priority: 2 | 1 | 0,
  vars: Record<string, string | number>,
  pushFn: (msg: string, severity: 'info' | 'caution' | 'urgent') => void,
) : boolean {
  const now = Date.now()
  if (now - lastRadioMs < RADIO_COOLDOWN_MS && priority <= lastPriority) return false
  const line = pick(trigger, vars)
  if (!line) return false
  lastRadioMs = now
  lastPriority = priority
  const severity: 'info' | 'caution' | 'urgent' =
    priority === 2 ? 'urgent' : priority === 1 ? 'caution' : 'info'
  pushFn(line, severity)
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
}

export function makeRadioState(): RadioState {
  return {
    prevOvertakeCount: 0,
    prevLap: 0,
    prevPlayerTyreAge: 0,
    prevPlayerPos: -1,
    prevGap: Infinity,
    prevSpinCount: 0,
    hasWon: false,
    cliffWarned: false,
    prevRetired: false,
    lowWingWarned: false,
    prevVscCount: 0,
  }
}

export function processRadioTick(
  state: RaceState,
  config: RaceConfig,
  radio: RadioState,
  pushAlert: (msg: string, severity: 'info' | 'caution' | 'urgent') => void,
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

  // 0b. A VSC opening with the player's planned stop close: the cheap stop is a
  // now-or-never call. Same window the AI reacts on (tuning.ai), so the
  // engineer never tells the player to box for a stop the smart teams would
  // not take. (Pre-flight ruling P6: planned stop only, no tyre-wear clause.)
  const vscCount = state.incidents.reduce((n, i) => n + (i.kind === 'vsc_deployed' ? 1 : 0), 0)
  if (vscCount > radio.prevVscCount) {
    const nextStop = player.strategy.plannedStops[player.pitsDone]
    if (nextStop !== undefined && nextStop.lap - player.lap <= config.tuning.ai.neutralisationWindowLaps) {
      tryPush('vsc_box', 2, {}, pushAlert)
    }
  }
  next.prevVscCount = vscCount

  // 1. Tyre cliff (high priority, fire once per stint)
  if (compound) {
    const driver = config.drivers.find(d => d.id === player.driverId)
    const effAge = driver ? effectiveTyreAge(player, driver, state.weatherState, config.tuning) : player.tyreAge
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

  // 5. Overtakes
  const newOvertakes = state.overtakeEvents.length
  if (newOvertakes > radio.prevOvertakeCount) {
    const latest = state.overtakeEvents[newOvertakes - 1]!
    if (latest.overtakerId === player.driverId) {
      tryPush('overtake_made', 1, { pos }, pushAlert)
      soundService.play('positionGain')
    } else if (latest.overtakenId === player.driverId) {
      tryPush('overtake_lost', 1, { pos }, pushAlert)
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

import type { RaceConfig, RaceState } from './types'
import { driverErrorChancePerSector, incidentRiskFactor, neutralisationKind } from './incidents'
import { effectiveTyreAge, tyreCliffFraction } from './tyres'
import { circuitTraits } from './circuitTraits'

export type OutlookReason = 'street' | 'wet' | 'worn_tyres' | 'sc_used' | 'all_used'
export type NeutralisationOutlook =
  | { kind: 'out' }
  | { kind: 'clear'; chance: number; band: 'low' | 'medium' | 'high'; horizon: number; reasons: OutlookReason[] }

type OutlookState = Pick<RaceState, 'cars' | 'lap' | 'totalLaps' | 'safetyCar' | 'incidents' | 'weatherState'>

/**
 * P(an SC, VSC or red flag within `horizon` laps), from the engine's own hazard
 * (spec 2026-10-24 §9.2, ruling O1): driver error x terminal x crashRisk x
 * circuit/weather factor, mechanical by reliability, tyre failure from each
 * car's projected cliff fraction, times the deployment chances (x the 1.7
 * neutralisationRisk trait) still available under the caps -- the same order
 * race.ts rolls them in (red flag on a crash, then SC, then VSC).
 * Pure; no rng; no memory the model does not have.
 */
export function neutralisationOutlook(config: RaceConfig, state: OutlookState, horizon = config.tuning.scOutlook.horizonLaps): NeutralisationOutlook {
  if (neutralisationKind(state.safetyCar) !== null) return { kind: 'out' }
  const t = config.tuning
  const inc = t.incidents
  const traits = circuitTraits(config.circuit, t)
  const H = Math.max(0, Math.min(horizon, state.totalLaps - state.lap))
  const count = (k: string) => state.incidents.filter(i => i.kind === k).length
  const scLeft = count('safety_car_deployed') < inc.safetyCar.maxPerRace
  const vscLeft = count('vsc_deployed') < inc.vsc.maxPerRace
  const rfLeft = count('red_flag') < inc.redFlag.maxPerRace && state.totalLaps - state.lap > inc.redFlag.minLapsLeft
  const nr = traits.neutralisationRisk
  const rf = rfLeft ? inc.redFlag.crashChance : 0
  const sc = (c: number) => (scLeft ? Math.min(1, c * nr) : 0)
  const vsc = (c: number) => (vscLeft ? Math.min(1, c * nr) : 0)
  const pScCrash = sc(inc.safetyCar.crashDeployChance)
  const pScMech = sc(inc.safetyCar.mechanicalDeployChance)
  const pCrash = rf + (1 - rf) * (pScCrash + (1 - pScCrash) * vsc(inc.vsc.crashDeployChance))
  const pMech = pScMech + (1 - pScMech) * vsc(inc.vsc.mechanicalDeployChance)
  if (pCrash === 0 && pMech === 0) return { kind: 'clear', chance: 0, band: 'low', horizon: H, reasons: ['all_used'] }

  const risk = traits.crashRisk * incidentRiskFactor(config, state.weatherState)
  const tf = t.tyreFailure
  let lambda = 0
  let worn = 0
  for (const car of state.cars) {
    if (car.retired) continue
    const driver = config.drivers.find(d => d.id === car.driverId)
    const team = config.teams.find(tm => tm.id === car.teamId)
    if (!driver || !team) continue
    const crash = driverErrorChancePerSector(driver.facets.consistency, t, risk) * 3 * inc.terminalFraction
    const mech = t.mechanicalFailure.baseChancePerLap * (1 - team.facets.reliability / 100)
    const spec = config.compounds[car.compound]
    const f = spec ? tyreCliffFraction(spec, effectiveTyreAge(car, driver, state.weatherState, config)) : 0
    const g = spec ? tyreCliffFraction(spec, effectiveTyreAge({ ...car, tyreAge: car.tyreAge + 1 }, driver, state.weatherState, config)) - f : 0
    let tyre = 0
    for (let k = 1; k <= H; k++) tyre += Math.min(tf.maxChancePerLap, tf.chancePerLapOverThreshold * Math.max(0, f + k * g - tf.cliffFractionThreshold))
    if (f + H * g > tf.cliffFractionThreshold) worn++
    lambda += H * (crash * pCrash + mech * pMech) + tyre * pMech
  }
  const chance = 1 - Math.exp(-lambda)
  const [lo, hi] = t.scOutlook.bands
  const reasons: OutlookReason[] = []
  if ((config.circuit.incidentRisk ?? 1) >= 1.15 && inc.circuitRiskWeight > 0) reasons.push('street')
  if (state.weatherState !== 'DRY' && inc.wetErrorMultiplier[state.weatherState] > 1) reasons.push('wet')
  if (worn > 0) reasons.push('worn_tyres')
  if (!scLeft) reasons.push('sc_used')
  return { kind: 'clear', chance, band: chance < lo ? 'low' : chance < hi ? 'medium' : 'high', horizon: H, reasons }
}

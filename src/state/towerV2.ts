import { drsOpenSet, drsTrains } from '@engine/index'
import type { ProjectionResult } from '@engine/projection'
import type { RaceConfig, RaceState, SectorIndex } from '@engine/types'

export interface TowerV2Row {
  drs: 'open' | 'neutralised' | null
  train: { index: number; size: number; first: boolean; last: boolean } | null
  penaltySec: number
}

/**
 * Per-row 2.0 facts for the tower, derived ONCE per raceState (spec §3.4).
 * DRS is shown for the sector about to be raced (state.sector), which is the
 * sector the engine will evaluate on the next step. With drs.enabled off no
 * row carries DRS or train facts, so the tower renders exactly as in 1.9
 * (drsTrains itself does not check `enabled`).
 */
export function towerV2(config: RaceConfig, state: RaceState): Map<string, TowerV2Row> {
  const enabled = config.tuning.drs.enabled
  const open = drsOpenSet(config, state, state.sector as SectorIndex)
  const sorted = state.cars.filter(c => !c.retired).sort((a, b) => a.raceTime - b.raceTime)
  const aheadOf = new Map(sorted.map((c, i) => [c.driverId, sorted[i - 1]?.driverId]))
  const trains = enabled ? drsTrains(config, state) : []
  const out = new Map<string, TowerV2Row>()
  for (const car of state.cars) {
    const ahead = aheadOf.get(car.driverId)
    const drs = !open.has(car.driverId) ? null : ahead !== undefined && open.has(ahead) ? 'neutralised' : 'open'
    const ti = trains.findIndex(t => t.carIds.includes(car.driverId))
    const t = ti >= 0 ? trains[ti]! : null
    const pos = t ? t.carIds.indexOf(car.driverId) : -1
    out.set(car.driverId, {
      drs,
      train: t ? { index: ti, size: t.carIds.length, first: pos === 0, last: pos === t.carIds.length - 1 } : null,
      penaltySec: car.penalty?.pendingSec ?? 0,
    })
  }
  return out
}

/**
 * Size of the DRS train the player would rejoin into, or null (spec §3.4):
 * the rejoin gap to the car ahead is within detection range and that car is
 * itself in a train (counted from the current order, without the player).
 * The returned size includes the player.
 */
export function rejoinTrainSize(config: RaceConfig, state: RaceState, result: ProjectionResult): number | null {
  const d = config.tuning.drs
  if (!d.enabled || result.driverAheadId === null || result.rejoinGap > d.detectionGap) return null
  const others = { cars: state.cars.filter(c => c.driverId !== config.playerDriverId) }
  const train = drsTrains(config, others).find(t => t.carIds.includes(result.driverAheadId!))
  return train ? train.carIds.length + 1 : null
}

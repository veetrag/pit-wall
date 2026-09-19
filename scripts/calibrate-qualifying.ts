/**
 * Measures what the qualifying tuning numbers are actually worth, in grid
 * slots, so they can be chosen rather than guessed.
 *
 * Run: npx tsx scripts/calibrate-qualifying.ts
 */
import { runQualifying, createRng } from '../src/engine/index'
import { buildRaceConfig } from '../src/state/buildRaceConfig'

const SEEDS = 400
const config = buildRaceConfig(1, 'd_voss', 'bengaluru', 'rookie', null, null)
const PLAYER = config.playerDriverId

function sample(attack: 'conserve' | 'balanced' | 'attack') {
  const positions: number[] = []
  const times: number[] = []
  const nonScrappyTimes: number[] = []
  let scrappy = 0
  let fieldSpread = 0
  for (let seed = 0; seed < SEEDS; seed++) {
    const r = runQualifying(config, createRng(seed), { compound: 'S', attack })
    positions.push(r.order.indexOf(PLAYER) + 1)
    const lap = r.laps.find(l => l.driverId === PLAYER)!
    times.push(lap.time)
    if (lap.scrappy) {
      scrappy++
    } else {
      nonScrappyTimes.push(lap.time)
    }
    fieldSpread += r.laps[r.laps.length - 1]!.time - r.laps[0]!.time
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  return {
    attack,
    meanPosition: mean(positions).toFixed(2),
    meanTime: mean(times).toFixed(3),
    meanTimeNonScrappy: nonScrappyTimes.length ? mean(nonScrappyTimes).toFixed(3) : 'n/a',
    scrappyRate: (scrappy / SEEDS).toFixed(3),
    meanFieldSpread: (fieldSpread / SEEDS).toFixed(3),
  }
}

const rows = (['conserve', 'balanced', 'attack'] as const).map(sample)
console.table(rows)

const spread = Number(rows[0]!.meanFieldSpread)
const perSlot = spread / (config.drivers.length - 1)
console.log(`\nField spread: ${spread.toFixed(3)}s across ${config.drivers.length} cars`)
console.log(`One grid slot is worth roughly ${perSlot.toFixed(3)}s`)
console.log(`scrappyLapPenalty ${config.tuning.qualifying.scrappyLapPenalty}s ` +
  `=> about ${(config.tuning.qualifying.scrappyLapPenalty / perSlot).toFixed(1)} slots`)
console.log(`attack paceDelta ${config.tuning.qualifying.attackLevels.attack.paceDelta}s ` +
  `=> about ${Math.abs(config.tuning.qualifying.attackLevels.attack.paceDelta / perSlot).toFixed(1)} slots`)

// Non-scrappy-filtered attack vs balanced delta (unconfounded by scrappy penalty asymmetry)
const balancedNS = Number(rows[1]!.meanTimeNonScrappy)
const attackNS = Number(rows[2]!.meanTimeNonScrappy)
const attackVsBalancedDeltaNS = balancedNS - attackNS
console.log(`\n[non-scrappy filtered] attack vs balanced pace delta: ${attackVsBalancedDeltaNS.toFixed(3)}s ` +
  `=> about ${(attackVsBalancedDeltaNS / perSlot).toFixed(1)} slots`)

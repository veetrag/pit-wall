/**
 * Simulates N seasons of a consistently strong player to see whether erosion
 * and rival escalation actually hold a career open.
 *
 * Run: npx tsx scripts/simulate-career.ts
 */
import { erodeTiers, escalateRivals } from '../src/state/careerStore'
import { loadGameData } from '../src/data/validators'

const { attributes, tierCosts, income } = loadGameData().upgrades
const { tierDecayPerSeason } = loadGameData().tuning.career
const SEASONS = 10
const RACES = 12

// A strong player: spends every point on the cheapest available tier each
// season, and wins the title whenever their total tier count leads.
let tiers: Record<string, number> = Object.fromEntries(attributes.map(a => [a.id, 0]))
let rivals: Record<string, number> = {}
// Unspent points BANK across the winter, matching startNextSeason. Modelling
// them as discarded understates the career badly: it plateaus at 11/15 from
// season 3 and burns 21 points a season forever.
let banked = 0

for (let season = 1; season <= SEASONS; season++) {
  let budget = income.perRace * RACES + banked
  // Buy greedily, cheapest tier first.
  for (;;) {
    const affordable = attributes
      .map(a => ({ id: a.id, owned: tiers[a.id] ?? 0 }))
      .filter(x => x.owned < tierCosts.length)
      .map(x => ({ ...x, cost: tierCosts[x.owned]! }))
      .filter(x => x.cost <= budget)
      .sort((a, b) => a.cost - b.cost)
    const pick = affordable[0]
    if (!pick) break
    budget -= pick.cost
    tiers[pick.id] = pick.owned + 1
  }
  banked = budget
  const total = Object.values(tiers).reduce((a, b) => a + b, 0)
  const maxTotal = attributes.length * tierCosts.length
  const rivalTotal = Object.values(rivals).reduce((a, b) => a + b, 0)
  const wonTitle = total >= maxTotal * 0.8

  console.log(
    `season ${String(season).padStart(2)}  tiers ${String(total).padStart(2)}/${maxTotal}` +
    `  unspent ${String(budget).padStart(3)}  rivalDev ${rivalTotal.toFixed(1).padStart(7)}` +
    `  ${wonTitle ? 'TITLE' : ''}`,
  )

  tiers = erodeTiers(tiers, tierDecayPerSeason)
  rivals = escalateRivals(rivals, wonTitle)
}

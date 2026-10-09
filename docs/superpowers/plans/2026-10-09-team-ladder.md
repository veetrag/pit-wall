# Team Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At each season end, every team climbs or slips a performance ladder according to whether it beat the constructors' position its car deserved, and rival development stops accumulating forever.

**Architecture:** A pure module (`src/state/teamLadder.ts`) holds the whole rule. Tier offsets live on the career (`CareerRecord.teamTiers`), are applied to team facets by the existing upgrade overlay (the only place progression becomes simulation input), and are settled by `seasonStore` when a season is banked. The same overlay builds both the races and the ratings the ladder judges, so the two cannot drift.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Zustand, zod, Vitest, React + Framer Motion.

**Spec:** `docs/superpowers/specs/2026-10-09-team-ladder-design.md`

## Global Constraints

- `src/engine/` is untouched. No file in this plan imports from or into `engine/` except existing imports. The ladder never reaches the engine as anything but ordinary facet numbers (CLAUDE.md §3).
- No `Math.random()`. Every tie-break is deterministic (team id last).
- All ladder numbers live in `src/data/tuning.json` under `career.teamTiers`, validated by zod in `src/data/validators.ts`: `step 3`, `min -3`, `max 3`, `threshold 2`, `facets ["power", "aero", "handling"]`.
- Facets never exceed `facetCeiling(facet)` from `src/state/upgradeOverlay.ts` (100, or the per-attribute `facetMax`). Above 100 the engine inverts the benefit.
- **No save version bump.** `teamTiers` is added to `CareerSnapshotSchema` with `.default({})`. `CAREER_SAVE_VERSION` stays `1`, `CLOUD_SAVE_VERSION` stays `1`.
- `careerStore` must never import `seasonStore` as a value (documented ESM cycle). `buildRaceConfig.ts` must never import `seasonStore` as a value.
- `src/state/teamLadder.ts` may import `@data/validators`, `@data/drivers.json`, and `./buildRaceConfig` / `./upgradeOverlay` only. It imports nothing from `seasonStore` or `careerStore`.
- Non-career paths (`raceStore.startRace`, scenarios) pass no `teamTiers` and must build byte-identical configs to today.
- All new live-updating numbers use `font-variant-numeric: tabular-nums` and the mono font. Every colour signal carries an arrow too (CLAUDE.md §6.3). Every animation respects `reducedMotion`.
- Run the full suite (`npx vitest run`) and `npx tsc --noEmit -p .` before every commit. Both must be clean.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Rulings against the spec

Two places where this plan departs from the spec's wording, deliberately:

- **`TeamSelect` labels are not changed** (spec §7, "labels tell the truth"). `TeamSelect` only renders when a career *begins*, and `beginCareer` resets every offset to 0. At that moment the static label is the effective label. The place a non-zero tier exists is the Development screen, which gets the chip (Task 5). Cost if wrong: a stale label on a screen that cannot currently show one.
- **Deserved and finished positions fade in in sequence rather than "rolling up" digit by digit** (spec §7). A position is a small integer, and a roll from P1 to P7 reads as a race result being counted, not a verdict being revealed. The stagger (positions, then verdict, then movers) keeps the one-orchestrated-moment intent. Cost if wrong: a cosmetic change in `LadderReveal.tsx` only.

---

## File map

| file | change | responsibility |
|---|---|---|
| `src/data/tuning.json` | modify | `career.teamTiers` values |
| `src/data/validators.ts` | modify | schema for `career.teamTiers` |
| `src/state/teamLadder.ts` | **create** | constructors' table, deserved order, the settle rule, `settleSeason` |
| `src/state/upgradeOverlay.ts` | modify | apply tier offsets to team facets |
| `src/state/buildRaceConfig.ts` | modify | extract `effectiveTeams()`; `buildRaceConfig` uses it |
| `src/state/careerStore.ts` | modify | `teamTiers` on the record, `setTeamTiers` action |
| `src/state/careerPersistence.ts` | modify | `teamTiers` in schema (`.default({})`) and snapshot |
| `src/state/seasonStore.ts` | modify | `overlayInput()`, settle at season end, `lastLadder`, rival reset at rollover |
| `src/ui/RaceWatcher.tsx` | modify | race uses `overlayInput()` |
| `src/ui/Development.tsx` | modify | previews include tiers; tier chip |
| `src/ui/LadderReveal.tsx` | **create** | championship reveal + constructors' table |
| `src/ui/Championship.tsx` | modify | mount the reveal; drivers/constructors toggle |
| `tests/state/teamLadder.test.ts` | **create** | the rule |
| `tests/state/teamLadderOverlay.test.ts` | **create** | offsets reach facets; non-career unchanged |
| `tests/state/teamLadderCareer.test.ts` | **create** | record, saves, cloud |
| `tests/state/teamLadderSeason.test.ts` | **create** | wiring, order, coupling, saturation |
| `tests/state/careerSeasonWiring.test.ts` | modify | old carryover assertion rewritten |
| `tests/state/careerBalance.test.ts` | modify | old compounding assertion rewritten |
| `tests/ui/ladderReveal.test.tsx` | **create** | reveal renders verdicts with arrows |
| `docs/V2-CHECKLIST.md` | modify | record the work |

---

### Task 1: The rule, as a pure module

**Files:**
- Modify: `src/data/tuning.json` (inside `"career"`)
- Modify: `src/data/validators.ts:90-114` (the `career` object)
- Create: `src/state/teamLadder.ts`
- Test: `tests/state/teamLadder.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `type TeamTierTuning = { step: number; min: number; max: number; threshold: number; facets: string[] }`
  - `interface ConstructorRow { teamId: string; points: number; bestDriverRank: number }`
  - `interface LadderMove { teamId: string; deserved: number; finished: number; before: number; after: number }`
  - `meanFacet(facets: Record<string, number>): number`
  - `constructorsTable(standings: readonly { driverId: string; points: number }[], driverTeam: ReadonlyMap<string, string>): ConstructorRow[]`
  - `deservedOrder(ratings: Readonly<Record<string, number>>, baseRatings: Readonly<Record<string, number>>): string[]`
  - `settleTeamTiers(finishedOrder: readonly string[], deserved: readonly string[], tiers: Readonly<Record<string, number>>, t: TeamTierTuning): { tiers: Record<string, number>; moves: LadderMove[] }`

- [ ] **Step 1: Add the tuning block**

In `src/data/tuning.json`, inside `"career"`, after `"seedStride"`:

```json
    "teamTiers": {
      "step": 3,
      "min": -3,
      "max": 3,
      "threshold": 2,
      "facets": ["power", "aero", "handling"]
    }
```

In `src/data/validators.ts`, inside the `career: z.object({ ... })`, after `seedStride`:

```ts
    /**
     * The team ladder (docs/superpowers/specs/2026-10-09-team-ladder-design.md).
     * A team's offset moves one step at season end when it finishes
     * `threshold` or more constructors' places better (or worse) than its car
     * deserved. Each step adds `step` to every facet in `facets`.
     */
    teamTiers: z.object({
      step: z.number().int().min(0),
      min: z.number().int().max(0),
      max: z.number().int().min(0),
      threshold: z.number().int().min(1),
      facets: z.array(z.string()).min(1),
    }),
```

- [ ] **Step 2: Write the failing tests**

Create `tests/state/teamLadder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  constructorsTable, deservedOrder, settleTeamTiers, meanFacet,
  type TeamTierTuning,
} from '@state/teamLadder'
import { loadGameData } from '@data/validators'
import { createRng, gaussianPair } from '@engine/rng'

const T: TeamTierTuning = { step: 3, min: -3, max: 3, threshold: 2, facets: ['power', 'aero', 'handling'] }
const ids = ['a', 'b', 'c', 'd', 'e']

describe('tuning', () => {
  it('ships the approved values', () => {
    expect(loadGameData().tuning.career.teamTiers).toEqual(T)
  })
  it('every ladder facet exists on every team', () => {
    for (const team of loadGameData().cars.teams) {
      for (const f of T.facets) expect(team.facets, `${team.id}.${f}`).toHaveProperty(f)
    }
  })
})

describe('constructorsTable', () => {
  const driverTeam = new Map([['d1', 'a'], ['d2', 'a'], ['d3', 'b'], ['d4', 'b'], ['d5', 'c'], ['d6', 'c']])

  it('sums both drivers and orders by points', () => {
    const rows = constructorsTable(
      [{ driverId: 'd3', points: 50 }, { driverId: 'd1', points: 30 }, { driverId: 'd2', points: 25 },
       { driverId: 'd5', points: 10 }, { driverId: 'd4', points: 2 }, { driverId: 'd6', points: 0 }],
      driverTeam,
    )
    expect(rows.map(r => [r.teamId, r.points])).toEqual([['a', 55], ['b', 52], ['c', 10]])
  })

  it('breaks a points tie by the best-placed driver', () => {
    const rows = constructorsTable(
      [{ driverId: 'd3', points: 20 }, { driverId: 'd1', points: 15 }, { driverId: 'd2', points: 10 },
       { driverId: 'd4', points: 5 }, { driverId: 'd5', points: 0 }, { driverId: 'd6', points: 0 }],
      driverTeam,
    )
    // a and b both 25; b's driver is P1.
    expect(rows.map(r => r.teamId).slice(0, 2)).toEqual(['b', 'a'])
  })

  it('lists a team with no classified drivers last rather than dropping it', () => {
    const rows = constructorsTable([{ driverId: 'd1', points: 5 }], driverTeam)
    expect(rows.map(r => r.teamId)).toEqual(['a', 'b', 'c'])
  })
})

describe('deservedOrder', () => {
  it('orders by rating, then base rating, then id', () => {
    expect(deservedOrder({ a: 90, b: 92, c: 90, d: 90 }, { a: 85, b: 80, c: 88, d: 85 }))
      .toEqual(['b', 'c', 'a', 'd'])
  })
})

describe('settleTeamTiers', () => {
  const move = (finished: string[], deserved: string[], tiers: Record<string, number> = {}) =>
    settleTeamTiers(finished, deserved, tiers, T)

  it('steps up exactly at the threshold, holds just below it', () => {
    // e deserved P5, finished P3: +2 places -> up. d deserved P4, finished P3? see below.
    const r = move(['a', 'b', 'e', 'c', 'd'], ['a', 'b', 'c', 'd', 'e'])
    expect(r.tiers.e).toBe(1)   // deserved 5, finished 3: delta +2
    expect(r.tiers.c).toBe(0)   // deserved 3, finished 4: delta -1
    expect(r.tiers.d).toBe(0)   // deserved 4, finished 5: delta -1
  })

  it('steps down exactly at the threshold', () => {
    const r = move(['b', 'c', 'a', 'd', 'e'], ['a', 'b', 'c', 'd', 'e'])
    expect(r.tiers.a).toBe(-1)  // deserved 1, finished 3: delta -2
    expect(r.tiers.b).toBe(0)   // deserved 2, finished 1: delta +1
  })

  it('clamps at max and min', () => {
    const r = move(['e', 'b', 'c', 'd', 'a'], ['a', 'b', 'c', 'd', 'e'], { e: 3, a: -3 })
    expect(r.tiers.e).toBe(3)
    expect(r.tiers.a).toBe(-3)
  })

  it('treats a missing offset as 0 and records every team', () => {
    const r = move(ids, ids)
    expect(r.tiers).toEqual({ a: 0, b: 0, c: 0, d: 0, e: 0 })
    expect(r.moves).toHaveLength(5)
  })

  it('reports before, after, deserved and finished per team', () => {
    const r = move(['a', 'b', 'e', 'c', 'd'], ids, { e: 1 })
    expect(r.moves.find(m => m.teamId === 'e')).toEqual({ teamId: 'e', deserved: 5, finished: 3, before: 1, after: 2 })
  })

  it('applies ONE rule to every team -- there is no player in it', () => {
    // Rotate the same over-performance through every team: each one, in
    // turn, gets the same verdict. The function has no player parameter, and
    // this pins that no team id is special-cased inside it.
    for (let i = 0; i < ids.length; i++) {
      const deserved = [...ids.slice(i), ...ids.slice(0, i)]
      const winner = deserved[deserved.length - 1]!
      const finished = [winner, ...deserved.slice(0, -1)]
      expect(move(finished, deserved).tiers[winner], winner).toBe(1)
    }
  })

  it('is deterministic and does not mutate its inputs', () => {
    const tiers = { a: 1 }
    const finished = ['b', 'a', 'c', 'd', 'e']
    const a = move(finished, ids, tiers)
    const b = move(finished, ids, tiers)
    expect(a).toEqual(b)
    expect(tiers).toEqual({ a: 1 })
    expect(finished).toEqual(['b', 'a', 'c', 'd', 'e'])
  })
})

describe('the ladder over a long career', () => {
  /*
   * Spec §3 and §8. Simulated in Python before this plan was written: over
   * 200 ten-season careers the sum of offsets never strayed more than 7 from
   * zero, every career still had moves in seasons 6-10, and the rating spread
   * never fell below 5.6. The bounds below leave margin around those.
   */
  const teams = loadGameData().cars.teams
  const base = Object.fromEntries(teams.map(t => [t.id, meanFacet(t.facets)]))

  for (const seed of [1, 7, 42, 99, 1234]) {
    it(`stays conserved, spread and alive (seed ${seed})`, () => {
      const rng = createRng(seed)
      let tiers: Record<string, number> = {}
      let lateMoves = 0
      for (let season = 1; season <= 10; season++) {
        const rating = Object.fromEntries(teams.map(t =>
          [t.id, base[t.id]! + (tiers[t.id] ?? 0) * T.step * T.facets.length / 5]))
        const deserved = deservedOrder(rating, base)
        const noisy = Object.fromEntries(teams.map(t => [t.id, rating[t.id]! + gaussianPair(rng)[0] * 2]))
        const finished = [...teams.map(t => t.id)].sort((x, y) => noisy[y]! - noisy[x]!)
        const r = settleTeamTiers(finished, deserved, tiers, T)
        if (season > 5) lateMoves += r.moves.filter(m => m.after !== m.before).length
        tiers = r.tiers

        const sum = Object.values(tiers).reduce((s, n) => s + n, 0)
        expect(Math.abs(sum), `season ${season} offset sum`).toBeLessThanOrEqual(10)
        const eff = teams.map(t => base[t.id]! + (tiers[t.id] ?? 0) * T.step * T.facets.length / 5)
        expect(Math.max(...eff) - Math.min(...eff), `season ${season} spread`).toBeGreaterThanOrEqual(4)
      }
      expect(lateMoves, 'the ladder froze').toBeGreaterThan(0)
    })
  }
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run tests/state/teamLadder.test.ts`
Expected: FAIL — `Failed to resolve import "@state/teamLadder"`.

- [ ] **Step 4: Implement**

Create `src/state/teamLadder.ts`:

```ts
/**
 * The team ladder: at each season end every team, the player's included,
 * climbs or slips one tier according to whether it beat the constructors'
 * position its car deserved. See
 * docs/superpowers/specs/2026-10-09-team-ladder-design.md.
 *
 * Everything here is pure. It imports neither seasonStore nor careerStore,
 * so both can call it without an ESM cycle.
 */

export interface TeamTierTuning {
  step: number
  min: number
  max: number
  threshold: number
  facets: string[]
}

export interface ConstructorRow {
  teamId: string
  points: number
  /** 1-based position of the team's best driver in the drivers' championship. */
  bestDriverRank: number
}

export interface LadderMove {
  teamId: string
  /** 1-based constructors' position the car deserved. */
  deserved: number
  /** 1-based constructors' position actually achieved. */
  finished: number
  before: number
  after: number
}

/** A car's rating: the mean of its facets. The same measure TeamSelect shows. */
export function meanFacet(facets: Record<string, number>): number {
  const vals = Object.values(facets)
  return vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length
}

/**
 * The constructors' championship, folded from the drivers'.
 *
 * `standings` must be in drivers' championship order (seasonStore sorts it
 * by points). Every team in `driverTeam` appears, even with no classified
 * driver, so the ladder judges all ten every season.
 */
export function constructorsTable(
  standings: readonly { driverId: string; points: number }[],
  driverTeam: ReadonlyMap<string, string>,
): ConstructorRow[] {
  const rows = new Map<string, ConstructorRow>()
  for (const teamId of driverTeam.values()) {
    if (!rows.has(teamId)) rows.set(teamId, { teamId, points: 0, bestDriverRank: standings.length + 1 })
  }
  standings.forEach((s, i) => {
    const teamId = driverTeam.get(s.driverId)
    if (teamId === undefined) return
    const row = rows.get(teamId)!
    row.points += s.points
    row.bestDriverRank = Math.min(row.bestDriverRank, i + 1)
  })
  return [...rows.values()].sort((a, b) =>
    b.points - a.points
    || a.bestDriverRank - b.bestDriverRank
    || a.teamId.localeCompare(b.teamId))
}

/**
 * Where each team's car deserved to finish: best rating first. Ties fall to
 * the authored base rating, then to team id, so the order is total and
 * deterministic.
 */
export function deservedOrder(
  ratings: Readonly<Record<string, number>>,
  baseRatings: Readonly<Record<string, number>>,
): string[] {
  return Object.keys(ratings).sort((a, b) =>
    ratings[b]! - ratings[a]!
    || (baseRatings[b] ?? 0) - (baseRatings[a] ?? 0)
    || a.localeCompare(b))
}

/**
 * The rule. `delta = deserved - finished`: positive means the team finished
 * better than its car deserved. At or beyond `threshold` either way the
 * offset moves one step, clamped to [min, max].
 *
 * There is deliberately no notion of a player here. One rule, ten teams.
 */
export function settleTeamTiers(
  finishedOrder: readonly string[],
  deserved: readonly string[],
  tiers: Readonly<Record<string, number>>,
  t: TeamTierTuning,
): { tiers: Record<string, number>; moves: LadderMove[] } {
  const out: Record<string, number> = { ...tiers }
  const moves: LadderMove[] = []
  finishedOrder.forEach((teamId, i) => {
    const finished = i + 1
    const d = deserved.indexOf(teamId)
    const deservedPos = d < 0 ? finished : d + 1
    const delta = deservedPos - finished
    const before = tiers[teamId] ?? 0
    const stepBy = delta >= t.threshold ? 1 : delta <= -t.threshold ? -1 : 0
    const after = Math.max(t.min, Math.min(t.max, before + stepBy))
    out[teamId] = after
    moves.push({ teamId, deserved: deservedPos, finished, before, after })
  })
  return { tiers: out, moves }
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run tests/state/teamLadder.test.ts`
Expected: PASS, all tests. Then `npx vitest run` and `npx tsc --noEmit -p .`: clean.

- [ ] **Step 6: Commit**

```bash
git add src/data/tuning.json src/data/validators.ts src/state/teamLadder.ts tests/state/teamLadder.test.ts
git commit -m "feat(career): the team ladder rule, as a pure module

Constructors' table, deserved order and the settle rule from the spec
(docs/superpowers/specs/2026-10-09-team-ladder-design.md section 3). One
rule for all ten teams; no player in it. A ten-season property test pins
conservation, spread and that the ladder never freezes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Offsets reach the cars

**Files:**
- Modify: `src/state/upgradeOverlay.ts` (`UpgradeOverlayInput`, `UpgradeOverlayOptions`, `applyUpgrades`)
- Modify: `src/state/buildRaceConfig.ts:60-90`
- Test: `tests/state/teamLadderOverlay.test.ts`

**Interfaces:**
- Consumes: `career.teamTiers` tuning from Task 1.
- Produces:
  - `UpgradeOverlayInput.teamTiers?: Record<string, number>`
  - `UpgradeOverlayOptions.teamTiers?: Record<string, number>`
  - `effectiveTeams(playerDriverId: string, upgrades?: UpgradeOverlayInput | null): Cars['teams']` exported from `src/state/buildRaceConfig.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/state/teamLadderOverlay.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildRaceConfig, effectiveTeams } from '@state/buildRaceConfig'
import { applyUpgrades, facetCeiling } from '@state/upgradeOverlay'
import { loadGameData } from '@data/validators'

const data = loadGameData()
const base = (id: string) => data.cars.teams.find(t => t.id === id)!.facets
const { step, facets } = data.tuning.career.teamTiers

describe('tier offsets on team facets', () => {
  it('adds offset x step to the ladder facets only', () => {
    const terra = effectiveTeams('d_voss', { purchasedTiers: {}, teamTiers: { terra: 2 } })
      .find(t => t.id === 'terra')!.facets
    for (const f of facets) expect(terra[f], f).toBe(base('terra')[f as 'power']! + 2 * step)
    expect(terra.reliability).toBe(base('terra').reliability)
    expect(terra.pitCrew).toBe(base('terra').pitCrew)
  })

  it('subtracts for a negative offset', () => {
    const apex = effectiveTeams('d_voss', { purchasedTiers: {}, teamTiers: { apex: -1 } })
      .find(t => t.id === 'apex')!.facets
    expect(apex.power).toBe(base('apex').power - step)
  })

  it('never exceeds the facet ceiling', () => {
    // Meridian power is 98: +9 would be 107, which the engine inverts.
    const meridian = effectiveTeams('d_voss', { purchasedTiers: {}, teamTiers: { meridian: 3 } })
      .find(t => t.id === 'meridian')!.facets
    expect(meridian.power).toBe(facetCeiling('power'))
  })

  it('applies to the player team AND rivals alike', () => {
    // d_voss drives for apex.
    const teams = effectiveTeams('d_voss', { purchasedTiers: {}, teamTiers: { apex: 1, terra: 1 } })
    expect(teams.find(t => t.id === 'apex')!.facets.aero).toBe(Math.min(100, base('apex').aero + step))
    expect(teams.find(t => t.id === 'terra')!.facets.aero).toBe(base('terra').aero + step)
  })

  it('stacks under upgrades and rival development, each clamped', () => {
    const teams = effectiveTeams('d_voss', {
      purchasedTiers: {}, rivalDevelopment: { terra: 3 }, teamTiers: { terra: 1 },
    })
    // rival pool 3 spread over 3 facets = +1 each, on top of +step.
    expect(teams.find(t => t.id === 'terra')!.facets.power).toBe(base('terra').power + step + 1)
  })

  it('buildRaceConfig races the same teams effectiveTeams returns', () => {
    const input = { purchasedTiers: { power: 2 }, rivalDevelopment: { terra: 4 }, teamTiers: { terra: 2, apex: -1 } }
    const config = buildRaceConfig(42, 'd_voss', 'bengaluru', 'rookie', null, input)
    expect(config.teams).toEqual(effectiveTeams('d_voss', input))
  })

  it('without teamTiers, builds exactly what it built before', () => {
    const plain = buildRaceConfig(42, 'd_voss')
    const zeroed = buildRaceConfig(42, 'd_voss', 'bengaluru', 'rookie', null, { purchasedTiers: {}, teamTiers: {} })
    expect(zeroed.teams).toEqual(plain.teams)
  })

  it('does not mutate its input entities', () => {
    const teams = data.cars.teams
    const before = JSON.stringify(teams)
    applyUpgrades(teams, {
      attributes: data.upgrades.attributes, purchasedTiers: {}, target: 'team',
      appliesTo: () => false, teamTiers: { terra: 3 },
    })
    expect(JSON.stringify(teams)).toBe(before)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/state/teamLadderOverlay.test.ts`
Expected: FAIL — `effectiveTeams` is not exported.

- [ ] **Step 3: Implement in `upgradeOverlay.ts`**

Add `teamTiers` to both interfaces:

```ts
export interface UpgradeOverlayInput {
  purchasedTiers: Record<string, number>
  rivalDevelopment?: Record<string, number>
  /** team id -> ladder offset. Career only; absent everywhere else. */
  teamTiers?: Record<string, number>
}
```

and in `UpgradeOverlayOptions<T>`, after `rivalDevelopment`:

```ts
  /**
   * team id -> ladder offset. Applies to EVERY team, player included -- it is
   * the car's base, not a purchase. Only meaningful when target is 'team'.
   */
  teamTiers?: Record<string, number>
```

Add a memoised tuning reader beside `rivalFacets()`:

```ts
// The ladder's step and facet list, memoised for the same reason as
// rivalFacets(): the JSON is a static import and cannot change in-process.
let tierTuningCache: { step: number; facets: readonly string[] } | null = null
function tierTuning(): { step: number; facets: readonly string[] } {
  if (tierTuningCache === null) {
    const { step, facets } = loadGameData().tuning.career.teamTiers
    tierTuningCache = { step, facets }
  }
  return tierTuningCache
}
```

In `applyUpgrades`, destructure `teamTiers` and apply it first, right after `const facets = { ...entity.facets }`:

```ts
    // The ladder offset is the car's base for this season, so it goes on
    // FIRST; upgrades and rival development stack on top. Clamped here as
    // well as below, because a negative offset must not go under 0 and a
    // positive one must not cross the correctness ceiling on its own.
    const offset = target === 'team' ? (teamTiers?.[entity.id] ?? 0) : 0
    if (offset !== 0) {
      const { step, facets: tierFacets } = tierTuning()
      for (const facet of tierFacets) {
        const v = facets[facet]
        if (v === undefined) continue
        facets[facet] = Math.max(0, Math.min(facetCeiling(facet), v + offset * step))
      }
    }
```

(`const { attributes, purchasedTiers, target, appliesTo, rivalDevelopment, teamTiers } = opts`.)

- [ ] **Step 4: Extract `effectiveTeams` in `buildRaceConfig.ts`**

Add the import `import type { Cars } from '@data/validators'` (alongside the existing `loadGameData` import). Add, above `buildRaceConfig`:

```ts
/**
 * The ten cars as a race would receive them: authored facets, the ladder
 * offset, then the player's upgrades or a rival's development.
 *
 * Exported because the team ladder must judge teams by EXACTLY the cars
 * they raced with. Building both from this one function is what stops the
 * ladder measuring something subtly different from what was simulated.
 */
export function effectiveTeams(
  playerDriverId: string,
  upgrades?: UpgradeOverlayInput | null,
): Cars['teams'] {
  const data = loadGameData()
  const playerTeam = data.drivers.drivers.find(d => d.id === playerDriverId)?.teamId
  const overlayActive = playerTeam !== undefined
  return applyUpgrades(data.cars.teams, {
    attributes: data.upgrades.attributes,
    purchasedTiers: overlayActive ? upgrades?.purchasedTiers ?? {} : {},
    target: 'team',
    appliesTo: t => t.id === (playerTeam ?? ''),
    rivalDevelopment: overlayActive ? upgrades?.rivalDevelopment ?? {} : {},
    // Offsets belong to the team, not to the player, so they apply even when
    // the player id resolves to no team.
    teamTiers: upgrades?.teamTiers ?? {},
  })
}
```

In `buildRaceConfig`, replace the `const teams = applyUpgrades(data.cars.teams, { ... })` call with:

```ts
  const teams = effectiveTeams(playerDriverId, upgrades)
```

Keep the existing long comment above it (move its "If playerDriverId resolves to no team" paragraph into `effectiveTeams` if it no longer sits beside the logic). Leave the `drivers` overlay as it is; `overlayActive` and `purchasedTiers` remain in use there.

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run tests/state/teamLadderOverlay.test.ts`
Expected: PASS. Then the full suite and `tsc`: clean. In particular `tests/state/upgradeOverlay.test.ts`, `tests/state/qualifyingUpgrades.test.ts` and the engine determinism tests must be unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/state/upgradeOverlay.ts src/state/buildRaceConfig.ts tests/state/teamLadderOverlay.test.ts
git commit -m "feat(career): ladder offsets reach the cars through the overlay

Offsets apply to every team's power/aero/handling, first, under upgrades
and rival development, clamped to the facet ceiling. effectiveTeams() is
extracted so the ladder can judge teams by exactly the cars they raced.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Offsets belong to the career, and survive saves

**Files:**
- Modify: `src/state/careerStore.ts` (`CareerRecord`, `FRESH`, `recordRace`, `recordSeasonEnd`, store interface, new action)
- Modify: `src/state/careerPersistence.ts:50-92`
- Test: `tests/state/teamLadderCareer.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces:
  - `CareerRecord.teamTiers: Record<string, number>`
  - `useCareerStore.getState().setTeamTiers(tiers: Record<string, number>): void`
  - `CareerSnapshot.teamTiers` (always present after parse; `{}` for old saves)

- [ ] **Step 1: Write the failing tests**

Create `tests/state/teamLadderCareer.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCareerStore } from '@state/careerStore'
import { CareerSnapshotSchema, careerSnapshotFrom } from '@state/careerPersistence'
import { parseCloud, CLOUD_SAVE_VERSION } from '@sync/cloudSave'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

beforeEach(() => { useCareerStore.getState().endCareer() })

describe('teamTiers on the career', () => {
  it('starts empty and is reset by a new career', () => {
    useCareerStore.getState().beginCareer()
    useCareerStore.getState().setTeamTiers({ terra: 2 })
    useCareerStore.getState().beginCareer()
    expect(useCareerStore.getState().teamTiers).toEqual({})
  })

  it('survives a race and a season end', () => {
    const c = useCareerStore.getState()
    c.beginCareer()
    c.setTeamTiers({ terra: 2 })
    c.recordRace({ position: 3, retired: false, pole: false, round: 1, grid: 5, stops: 1, overtakes: 2, wet: false })
    c.recordSeasonEnd({ seasonNumber: 1, teamId: 'terra', driverId: 'd_x', championshipPosition: 4, points: 90, wins: 0 })
    expect(useCareerStore.getState().teamTiers).toEqual({ terra: 2 })
  })

  it('is saved in the snapshot', () => {
    useCareerStore.getState().beginCareer()
    useCareerStore.getState().setTeamTiers({ apex: -1 })
    const snap = careerSnapshotFrom(useCareerStore.getState())!
    expect(snap.teamTiers).toEqual({ apex: -1 })
    expect(CareerSnapshotSchema.parse(JSON.parse(JSON.stringify(snap))).teamTiers).toEqual({ apex: -1 })
  })
})

describe('saves written before the ladder', () => {
  const legacy = {
    v: 1, seasonNumber: 3, titles: 1, wins: 6, seasonWins: 0, podiums: 14, poles: 4,
    racesStarted: 24, bestFinish: 1, seasonHistory: [], raceLog: [],
  }

  it('load locally with every offset at 0, and are NOT discarded', () => {
    const parsed = CareerSnapshotSchema.safeParse(legacy)
    expect(parsed.success, 'a legacy save must still load').toBe(true)
    expect(parsed.success && parsed.data.teamTiers).toEqual({})
  })

  it('load from the cloud the same way', () => {
    const remote = parseCloud(JSON.stringify({
      v: CLOUD_SAVE_VERSION, savedAt: 1, career: legacy, season: null,
    }))
    expect(remote, 'cloud copy must parse').not.toBeNull()
    expect(remote!.career.teamTiers).toEqual({})
  })
})
```

The envelope fields (`v`, `career`, `season` nullable, `savedAt`) are those of `CloudSnapshotSchema` in `src/sync/cloudSave.ts`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/state/teamLadderCareer.test.ts`
Expected: FAIL — `setTeamTiers is not a function`, `teamTiers` undefined.

- [ ] **Step 3: Implement in `careerStore.ts`**

Add to `CareerRecord`, after `raceLog`:

```ts
  /**
   * Team id -> ladder offset. The one piece of state that crosses seasons for
   * EVERY team, which is why it is the career's and not the season's. Missing
   * key means 0. See docs/superpowers/specs/2026-10-09-team-ladder-design.md.
   */
  teamTiers: Record<string, number>
```

Add `teamTiers: {}` to `FRESH`.

In `recordRace`'s `const next: CareerRecord = { ... }` and in `recordSeasonEnd`'s `const next: CareerRecord = { ... }`, add `teamTiers: s.teamTiers,` (TypeScript will refuse to compile until both have it).

Add to the `CareerStore` interface:

```ts
  /**
   * Replaces the ladder offsets. seasonStore settles the ladder at season end
   * and hands the result here, the same way rollOverSeason hands back eroded
   * tiers -- this module never reads seasonStore.
   */
  setTeamTiers: (tiers: Record<string, number>) => void
```

and the implementation, beside `beginCareer`:

```ts
  setTeamTiers(teamTiers) { set({ teamTiers }) },
```

- [ ] **Step 4: Implement in `careerPersistence.ts`**

In `CareerSnapshotSchema`, after `raceLog`:

```ts
  /*
   * .default({}) and NOT a version bump, for the reason given on raceLog
   * above: a bump makes every existing save load as null. A save from before
   * the ladder has never moved a team, so "every offset 0" is simply true.
   */
  teamTiers: z.record(z.string(), z.number()).default({}),
```

In `careerSnapshotFrom`, add `teamTiers: r.teamTiers,` after `raceLog: r.raceLog,`.

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run tests/state/teamLadderCareer.test.ts`
Expected: PASS. Then the full suite and `tsc`: clean. `tests/state/careerPersistence.test.ts` and `tests/sync/*` must pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/state/careerStore.ts src/state/careerPersistence.ts tests/state/teamLadderCareer.test.ts
git commit -m "feat(career): ladder offsets live on the career and survive saves

teamTiers joins CareerRecord with a setter. The snapshot schema takes it
with .default({}), not a version bump, so every existing career -- local
or cloud -- loads with all offsets at 0 instead of being discarded.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Settle at season end; reset rival development

**Files:**
- Modify: `src/state/teamLadder.ts` (add `settleSeason`)
- Modify: `src/state/seasonStore.ts` (interface, `overlayInput`, `runQualifyingSession`, `nextRace`, `startNextSeason`, initial state, reset paths)
- Modify: `src/ui/RaceWatcher.tsx:47`
- Modify: `tests/state/careerSeasonWiring.test.ts:84-90`
- Modify: `tests/state/careerBalance.test.ts:39-51`
- Test: `tests/state/teamLadderSeason.test.ts`

**Interfaces:**
- Consumes: `constructorsTable`, `deservedOrder`, `settleTeamTiers`, `meanFacet`, `LadderMove` (Task 1); `effectiveTeams`, `UpgradeOverlayInput.teamTiers` (Task 2); `teamTiers`, `setTeamTiers` (Task 3).
- Produces:
  - `settleSeason(args: { standings: readonly { driverId: string; points: number }[]; playerDriverId: string; overlay: UpgradeOverlayInput; tiers: Readonly<Record<string, number>> }): { tiers: Record<string, number>; moves: LadderMove[] }` in `teamLadder.ts`
  - `SeasonStore.overlayInput(): UpgradeOverlayInput`
  - `SeasonStore.lastLadder: LadderMove[] | null` (UI only, never persisted)

- [ ] **Step 1: Write the failing tests**

Create `tests/state/teamLadderSeason.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSeasonStore, TOTAL_RACES } from '@state/seasonStore'
import { useCareerStore, escalateRivals } from '@state/careerStore'
import { buildRaceConfig, effectiveTeams } from '@state/buildRaceConfig'
import { settleSeason, meanFacet } from '@state/teamLadder'
import { loadGameData } from '@data/validators'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

const data = loadGameData()
// Every driver, ordered so terra's pair (a weak car) tops the table: a clear
// over-performance the ladder must reward.
const terraDrivers = data.drivers.drivers.filter(d => d.teamId === 'terra').map(d => d.id)
const others = data.drivers.drivers.filter(d => d.teamId !== 'terra').map(d => d.id)
const standings = [...terraDrivers, ...others].map((driverId, i) => ({ driverId, points: 400 - i * 10 }))
const player = terraDrivers[0]!

function atFinalRound() {
  useCareerStore.getState().beginCareer()
  useSeasonStore.setState({
    phase: 'result', playerDriverId: player, selectedTeamId: 'terra',
    raceIndex: TOTAL_RACES - 1, standings, purchasedTiers: { power: 2 },
    rivalDevelopment: { apex: 12, meridian: 12 }, devPoints: 0, lastLadder: null,
  })
}

beforeEach(atFinalRound)

describe('settling the ladder at season end', () => {
  it('moves the over-performing team up when the season is banked', () => {
    useSeasonStore.getState().nextRace()
    expect(useSeasonStore.getState().phase).toBe('championship')
    expect(useCareerStore.getState().teamTiers.terra).toBe(1)
    const move = useSeasonStore.getState().lastLadder!.find(m => m.teamId === 'terra')!
    expect(move.finished).toBe(1)
    expect(move.after).toBe(1)
  })

  it('settles only once per season, however often the path is re-entered', () => {
    useSeasonStore.getState().nextRace()
    useSeasonStore.setState({ raceIndex: TOTAL_RACES - 1 })
    useSeasonStore.getState().nextRace()
    expect(useCareerStore.getState().teamTiers.terra).toBe(1)
  })

  it('judges the cars the season was raced with', () => {
    // The coupling the spec warns about: deserved rank must come from the
    // same overlay that built the races, including end-of-season rival pools.
    const s = useSeasonStore.getState()
    const overlay = s.overlayInput()
    const config = buildRaceConfig(42, player, 'bengaluru', 'rookie', null, overlay)
    expect(config.teams).toEqual(effectiveTeams(player, overlay))
    const ratings = Object.fromEntries(config.teams.map(t => [t.id, meanFacet(t.facets)]))
    const r = settleSeason({ standings, playerDriverId: player, overlay, tiers: {} })
    const deservedFirst = r.moves.reduce((best, m) => (m.deserved < best.deserved ? m : best)).teamId
    const topRated = Object.entries(ratings).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0]
    expect(deservedFirst).toBe(topRated)
  })
})

describe('the season boundary', () => {
  it('settles BEFORE erosion and the rival reset', () => {
    // If settlement ran after the reset, rivals would be judged on next
    // season's (weaker) cars and look like over-performers.
    useSeasonStore.getState().nextRace()
    const settled = { ...useCareerStore.getState().teamTiers }
    useSeasonStore.getState().startNextSeason()
    expect(useCareerStore.getState().teamTiers, 'rollover must not re-settle').toEqual(settled)
  })

  it('resets rival development to the winter head start', () => {
    useSeasonStore.getState().nextRace()
    useSeasonStore.getState().startNextSeason()
    // The player (terra driver) finished P1 in this fixture: champion's winter.
    expect(useSeasonStore.getState().rivalDevelopment).toEqual(escalateRivals({}, true))
  })

  it('races next season with the new offsets', () => {
    useSeasonStore.getState().nextRace()
    useSeasonStore.getState().startNextSeason()
    expect(useSeasonStore.getState().overlayInput().teamTiers).toEqual(useCareerStore.getState().teamTiers)
  })
})

describe('the saturation bug stays fixed', () => {
  it('by season 8, rivals are NOT all pinned at 100', () => {
    /*
     * Before the ladder, rival pools never reset: by season 4 every rival's
     * power/aero/handling sat at 100 (spec section 5). Drive eight rollovers
     * through the real store, accruing a full season of pool each time.
     */
    const { poolPerRace, facets } = data.upgrades.rivalDevelopment
    for (let season = 1; season <= 8; season++) {
      const accrued = Object.fromEntries(data.cars.teams.map(t =>
        [t.id, (useSeasonStore.getState().rivalDevelopment[t.id] ?? 0)
          + poolPerRace * (t.developmentRate ?? 1) * facets.length * TOTAL_RACES]))
      useSeasonStore.setState({ rivalDevelopment: accrued, raceIndex: TOTAL_RACES - 1, phase: 'result' })
      useSeasonStore.getState().nextRace()
      useSeasonStore.getState().startNextSeason()
    }
    const teams = effectiveTeams(player, { ...useSeasonStore.getState().overlayInput(), purchasedTiers: {} })
    const pinned = teams.filter(t => t.id !== 'terra')
      .flatMap(t => facets.map(f => t.facets[f as 'power']!))
      .filter(v => v >= 100).length
    expect(pinned).toBeLessThan(27)
  })
})
```

Note on the saturation test: `startNextSeason` resets pools to the winter head start, so each loop iteration accrues one season on top of that, which is what the live game does. Before this task the pools would compound, and `pinned` would be 27 (all nine rivals × three facets).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/state/teamLadderSeason.test.ts`
Expected: FAIL — `settleSeason` not exported, `overlayInput is not a function`.

- [ ] **Step 3: Add `settleSeason` to `teamLadder.ts`**

Add the imports at the top of `src/state/teamLadder.ts`:

```ts
import { loadGameData } from '@data/validators'
import { effectiveTeams } from './buildRaceConfig'
import type { UpgradeOverlayInput } from './upgradeOverlay'
```

And at the bottom:

```ts
/**
 * Settles one season: builds the constructors' table from the drivers'
 * standings, rates every car with the SAME overlay that built the races, and
 * applies the rule. Called by seasonStore once, when a season is banked.
 */
export function settleSeason(args: {
  standings: readonly { driverId: string; points: number }[]
  playerDriverId: string
  overlay: UpgradeOverlayInput
  tiers: Readonly<Record<string, number>>
}): { tiers: Record<string, number>; moves: LadderMove[] } {
  const data = loadGameData()
  const driverTeam = new Map(data.drivers.drivers.map(d => [d.id, d.teamId] as [string, string]))
  const finished = constructorsTable(args.standings, driverTeam).map(r => r.teamId)
  const teams = effectiveTeams(args.playerDriverId, { ...args.overlay, teamTiers: args.tiers })
  const ratings = Object.fromEntries(teams.map(t => [t.id, meanFacet(t.facets)]))
  const base = Object.fromEntries(data.cars.teams.map(t => [t.id, meanFacet(t.facets)]))
  return settleTeamTiers(finished, deservedOrder(ratings, base), args.tiers, data.tuning.career.teamTiers)
}
```

Check `buildRaceConfig.ts` does not import `teamLadder` (it must not; that would be a cycle).

- [ ] **Step 4: Wire `seasonStore.ts`**

Imports: add `import { settleSeason, type LadderMove } from './teamLadder'` and `import type { UpgradeOverlayInput } from './upgradeOverlay'`.

In the `SeasonStore` interface:

```ts
  /**
   * The ladder verdict for the season just banked, for the championship
   * screen. UI only and never persisted, like lastSeasonBonus: a reload on
   * that screen shows the standings without the reveal rather than a stale one.
   */
  lastLadder: LadderMove[] | null
  /**
   * Everything the overlay needs to build this season's cars. The ONLY place
   * that input is assembled, so qualifying, the race and the ladder cannot
   * disagree about what the cars were.
   */
  overlayInput: () => UpgradeOverlayInput
```

Initial state: `lastLadder: null,`. Add `lastLadder: null` to every `set({...})` that already resets `lastSeasonBonus: 0` (the new-career reset near line 309, `startNextSeason`, `endCareer`).

Implementation:

```ts
  overlayInput() {
    const s = get()
    return {
      purchasedTiers: s.purchasedTiers,
      rivalDevelopment: s.rivalDevelopment,
      teamTiers: useCareerStore.getState().teamTiers,
    }
  },
```

In `runQualifyingSession`, replace `{ purchasedTiers: s.purchasedTiers, rivalDevelopment: s.rivalDevelopment }` with `s.overlayInput()`.

In `nextRace`, inside the season-end branch, after `const bonus = ...` and before the `set(...)`:

```ts
      // The ladder is judged on the cars this season was raced with, so it is
      // settled HERE, before startNextSeason erodes upgrades and resets rival
      // development. Only when the season actually banked: a re-entry must not
      // move every team a second time.
      let lastLadder = get().lastLadder
      if (banked && get().playerDriverId) {
        const r = settleSeason({
          standings: get().standings,
          playerDriverId: get().playerDriverId!,
          overlay: get().overlayInput(),
          tiers: useCareerStore.getState().teamTiers,
        })
        useCareerStore.getState().setTeamTiers(r.tiers)
        lastLadder = r.moves
      }
```

and add `lastLadder` to that branch's `set({ phase: 'championship', ... })`.

In `startNextSeason`, replace

```ts
      rivalDevelopment: escalateRivals(s.rivalDevelopment, standing === 0),
```

with

```ts
      /*
       * RESET to the winter head start, not carried forward. Carrying it
       * forward saturated the grid: by season 4 every rival's power, aero and
       * handling sat at 100 (docs/superpowers/specs/2026-10-09-team-ladder-design.md
       * section 5). Rival development is now the in-season race against the
       * player's purchases; what carries across seasons is the team ladder.
       * escalateRivals from zero is exactly the old winter boost, so "win the
       * title and the grid has a bigger winter" survives.
       */
      rivalDevelopment: escalateRivals({}, standing === 0),
      lastLadder: null,
```

- [ ] **Step 5: Wire `RaceWatcher.tsx`**

Replace, at line 47, the argument `{ purchasedTiers, rivalDevelopment }` with `useSeasonStore.getState().overlayInput()`. If `purchasedTiers` and `rivalDevelopment` selectors in this component become unused, remove them (lint must stay clean).

- [ ] **Step 6: Rewrite the two tests that pinned the old behaviour**

These assert the carryover the spec deliberately removes. Replace, do not delete: the intent "rivals get stronger every season" now has a different mechanism, and the tests should say so.

In `tests/state/careerSeasonWiring.test.ts`, replace the test `startNextSeason ESCALATES THE RIVALS RATHER THAN DISCARDING THEM` with:

```ts
  it('startNextSeason RESETS RIVAL DEVELOPMENT TO THE WINTER HEAD START', () => {
    // It used to carry pools forward forever, which pinned every rival at 100
    // by season 4 (team ladder spec, section 5). What crosses seasons now is
    // the ladder; the pool restarts from the winter boost alone. The fixture
    // is P1 here, so it is the champion's -- bigger -- winter.
    useCareerStore.getState().beginCareer()
    useSeasonStore.getState().startNextSeason()
    expect(useSeasonStore.getState().rivalDevelopment).toEqual(escalateRivals({}, true))
  })
```

and add `escalateRivals` to that file's `@state/careerStore` import.

In `tests/state/careerBalance.test.ts`, replace the test `RIVAL DEVELOPMENT COMPOUNDS ACROSS SEASONS` with:

```ts
  it('THE WINTER BOOST IS BIGGER FOR A CHAMPION, AND DOES NOT COMPOUND', () => {
    // escalateRivals is now called from zero each winter (team ladder spec,
    // section 5), so its job is the head start alone. The cross-season
    // escalation it used to provide is the ladder's.
    const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
    expect(total(escalateRivals({}, true))).toBeGreaterThan(total(escalateRivals({}, false)))
    expect(escalateRivals({}, true)).toEqual(escalateRivals({}, true))
  })
```

- [ ] **Step 7: Run to verify they pass**

Run: `npx vitest run tests/state/teamLadderSeason.test.ts tests/state/careerSeasonWiring.test.ts tests/state/careerBalance.test.ts`
Expected: PASS. Then the full suite and `tsc`: clean. If `tests/state/storeBoundaries.test.ts` flags the new imports, read why before changing anything: `teamLadder.ts` must not import `seasonStore` or `careerStore`.

- [ ] **Step 8: Commit**

```bash
git add src/state/teamLadder.ts src/state/seasonStore.ts src/ui/RaceWatcher.tsx tests/state/teamLadderSeason.test.ts tests/state/careerSeasonWiring.test.ts tests/state/careerBalance.test.ts
git commit -m "feat(career): settle the ladder at season end; reset rival development

The ladder is settled when a season banks, judged on the cars that
season raced, and only once. Qualifying, the race and the ladder all take
their cars from one overlayInput(), so they cannot disagree.

Rival development now resets each winter to the head start escalateRivals
always gave. Carried forward, it pinned every rival at 100 on power,
aero and handling by season 4 -- a balance bug in the live game, and fatal
to the ladder. Two tests that pinned the carryover are rewritten to the
new intent, not deleted.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Development screen tells the truth

**Files:**
- Modify: `src/ui/Development.tsx` (`facetsWith` at ~316, header at ~419)
- Test: `tests/ui/development.test.tsx` (existing; add cases)

**Interfaces:**
- Consumes: `teamTiers` from `useCareerStore` (Task 3); `applyUpgrades` `teamTiers` option (Task 2).
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the failing tests**

In `tests/ui/development.test.tsx`, add `import { useCareerStore } from '@state/careerStore'` to the imports. The file's `beforeEach` already sets `playerDriverId: 'd_voss', selectedTeamId: 'apex'`. Append:

```tsx
describe('the ladder on the Development screen', () => {
  beforeEach(() => { useCareerStore.setState({ teamTiers: {} }) })

  it('shows the team tier chip when the team has an offset', () => {
    useCareerStore.setState({ teamTiers: { apex: 2 } })
    render(<Development />)
    expect(screen.getByLabelText('Team tier +2')).toBeInTheDocument()
  })

  it('shows a negative tier with a down arrow', () => {
    useCareerStore.setState({ teamTiers: { apex: -1 } })
    render(<Development />)
    expect(screen.getByLabelText('Team tier -1').textContent).toContain('▼')
  })

  it('shows no chip at offset 0', () => {
    render(<Development />)
    expect(screen.queryByLabelText(/^Team tier/)).toBeNull()
  })

  it('previews the next upgrade on top of the offset', () => {
    /*
     * The screen promises the number the engine will receive. Apex aero is
     * 95: today the next +5 tier gains the full 5 points. At ladder tier +1
     * the car is already at 98, so the 100 ceiling cuts that gain to 2 --
     * and the displayed consequence must say so, or the screen is lying.
     */
    render(<Development />)
    const without = screen.getByTestId('effect-aero').textContent
    cleanup()
    useCareerStore.setState({ teamTiers: { apex: 1 } })
    render(<Development />)
    const withTier = screen.getByTestId('effect-aero').textContent
    expect(withTier).not.toBe(without)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/ui/development.test.tsx`
Expected: FAIL — no element labelled `Team tier +2`; the aero preview is identical with and without the offset.

- [ ] **Step 3: Implement**

In `Development.tsx`, read the offsets: `const teamTiers = useCareerStore(s => s.teamTiers)` (import `useCareerStore` from `@state/careerStore`).

In `facetsWith`, pass them to the team overlay:

```ts
        const teams = applyUpgrades(GAME.cars.teams, {
          attributes: UPGRADES.attributes, purchasedTiers: tiers, target: 'team',
          appliesTo: t => t.id === playerTeamId,
          teamTiers,
        })
```

and add `teamTiers` to that `useMemo`'s dependency list.

In the header, after the `Development` title div, inside the same left-hand `<div>`:

```tsx
          {(teamTiers[playerTeamId] ?? 0) !== 0 && (() => {
            const t = teamTiers[playerTeamId] ?? 0
            const up = t > 0
            return (
              <div
                aria-label={`Team tier ${up ? '+' : ''}${t}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
                  padding: '2px 8px', borderRadius: 999,
                  border: `1px solid ${up ? 'var(--accent)' : 'var(--accent-warm)'}`,
                  color: up ? 'var(--accent)' : 'var(--accent-warm)',
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0.08em',
                }}
              >
                {up ? '▲' : '▼'} TIER {up ? '+' : ''}{t}
              </div>
            )
          })()}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/ui/development.test.tsx`
Expected: PASS. Then the full suite and `tsc`: clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Development.tsx tests/ui/development.test.tsx
git commit -m "feat(ui): the Development screen shows the team tier

Previews now include the ladder offset, so the screen still shows the
number the engine receives. A chip shows the team's tier when it is not
zero, with an arrow as well as colour.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The reveal on the championship screen

**Files:**
- Create: `src/ui/LadderReveal.tsx`
- Modify: `src/ui/Championship.tsx` (mount the reveal above the season boundary; drivers/constructors toggle on the standings list)
- Test: `tests/ui/ladderReveal.test.tsx`

**Interfaces:**
- Consumes: `lastLadder` (Task 4), `LadderMove`, `constructorsTable` (Task 1), `useHaptics`, `soundService`.
- Produces: `LadderReveal({ moves, playerTeamId }: { moves: LadderMove[]; playerTeamId: string })`, `ConstructorsList({ standings, playerTeamId })`.

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/ladderReveal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LadderReveal, ConstructorsList } from '@ui/LadderReveal'
import { useSettingsStore } from '@state/settingsStore'
import type { LadderMove } from '@state/teamLadder'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) },
  ImpactStyle: { Medium: 'MEDIUM' }, NotificationType: { Success: 'SUCCESS', Warning: 'WARNING' },
}))
vi.mock('@audio/soundService', () => ({ soundService: { play: vi.fn() } }))

const m = (teamId: string, deserved: number, finished: number, before: number, after: number): LadderMove =>
  ({ teamId, deserved, finished, before, after })

beforeEach(() => { useSettingsStore.setState({ reducedMotion: true }) })

describe('LadderReveal', () => {
  it('announces a step up with an arrow and both positions', () => {
    render(<LadderReveal moves={[m('terra', 7, 4, 1, 2)]} playerTeamId="terra" />)
    expect(screen.getByText('▲ STEP UP')).toBeInTheDocument()
    expect(screen.getByLabelText('Deserved P7')).toBeInTheDocument()
    expect(screen.getByLabelText('Finished P4')).toBeInTheDocument()
    expect(screen.getByLabelText('Tier +1 to +2')).toBeInTheDocument()
  })

  it('announces a step down', () => {
    render(<LadderReveal moves={[m('terra', 3, 6, 0, -1)]} playerTeamId="terra" />)
    expect(screen.getByText('▼ STEP DOWN')).toBeInTheDocument()
  })

  it('announces a hold', () => {
    render(<LadderReveal moves={[m('terra', 5, 5, 1, 1)]} playerTeamId="terra" />)
    expect(screen.getByText('● HELD')).toBeInTheDocument()
  })

  it('lists the other teams that moved, and only those', () => {
    render(<LadderReveal
      moves={[m('terra', 5, 5, 0, 0), m('apex', 1, 4, 0, -1), m('zenith', 9, 6, 0, 1), m('nimbus', 6, 7, 0, 0)]}
      playerTeamId="terra" />)
    const movers = screen.getByLabelText('Grid movers')
    expect(movers.textContent).toContain('▼')
    expect(movers.textContent).toContain('▲')
    expect(movers.textContent).not.toMatch(/nimbus/i)
  })

  it('renders nothing when the player team is not in the moves', () => {
    const { container } = render(<LadderReveal moves={[m('apex', 1, 1, 0, 0)]} playerTeamId="terra" />)
    expect(container.textContent).toBe('')
  })
})

describe('ConstructorsList', () => {
  it('orders teams by summed points and marks the player team', () => {
    render(<ConstructorsList
      standings={[{ driverId: 'd_voss', points: 100 }, { driverId: 'd_chen', points: 90 }]}
      playerTeamId="apex" />)
    const first = screen.getAllByRole('listitem')[0]!
    expect(first.textContent).toMatch(/190/)
    expect(first.getAttribute('aria-current')).toBe('true')
  })
})
```

(`d_voss` and `d_chen` are both Apex drivers in `src/data/drivers.json`.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/ui/ladderReveal.test.tsx`
Expected: FAIL — cannot resolve `@ui/LadderReveal`.

- [ ] **Step 3: Implement `src/ui/LadderReveal.tsx`**

```tsx
import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useSettingsStore } from '@state/settingsStore'
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'
import { soundService } from '@audio/soundService'
import { constructorsTable, type LadderMove } from '@state/teamLadder'
import { loadGameData } from '@data/validators'

const DATA = loadGameData()
const DRIVER_TEAM = new Map(DATA.drivers.drivers.map(d => [d.id, d.teamId] as [string, string]))
const TEAM_NAME = new Map(DATA.cars.teams.map(t => [t.id, t.name]))
const name = (id: string) => (TEAM_NAME.get(id) ?? id).toUpperCase()
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`

type Verdict = { text: string; color: string }
function verdictOf(m: LadderMove): Verdict {
  if (m.after > m.before) return { text: '▲ STEP UP', color: 'var(--accent)' }
  if (m.after < m.before) return { text: '▼ STEP DOWN', color: 'var(--accent-warm)' }
  return { text: '● HELD', color: 'var(--text-dim)' }
}

/**
 * The season's one orchestrated moment for the ladder (CLAUDE.md §6.2):
 * deserved and finished positions, then the verdict, then who else moved.
 */
export function LadderReveal({ moves, playerTeamId }: { moves: LadderMove[]; playerTeamId: string }) {
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const { impact } = useHaptics()
  const mine = moves.find(m => m.teamId === playerTeamId)
  const stepped = mine !== undefined && mine.after !== mine.before
  const up = mine !== undefined && mine.after > mine.before

  useEffect(() => {
    if (!stepped) return
    impact(ImpactStyle.Medium)
    if (up) soundService.play('positionGain')
  }, [stepped, up]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!mine) return null
  const v = verdictOf(mine)
  const movers = moves.filter(m => m.teamId !== playerTeamId && m.after !== m.before)
  const enter = (delay: number) => reducedMotion
    ? { initial: false as const, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { delay, ease: [0.2, 0, 0, 1] } }

  return (
    <div style={{
      border: '1px solid var(--line-hair)', borderRadius: 10, padding: '12px 14px',
      background: 'var(--bg-panel)', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.15em' }}>
          CONSTRUCTORS'
        </span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.08em' }}>
          {name(playerTeamId)}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-mid)', display: 'grid', gap: 4 }}>
          <motion.div {...enter(0.1)} aria-label={`Deserved P${mine.deserved}`}>Deserved <b style={{ color: 'var(--text-hi)' }}>P{mine.deserved}</b></motion.div>
          <motion.div {...enter(0.35)} aria-label={`Finished P${mine.finished}`}>Finished <b style={{ color: 'var(--text-hi)' }}>P{mine.finished}</b></motion.div>
        </div>
        <motion.div {...enter(0.7)} style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: v.color, letterSpacing: '0.08em' }}>
            {v.text}
          </div>
          <div aria-label={`Tier ${signed(mine.before)} to ${signed(mine.after)}`}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
            Tier {signed(mine.before)} → {signed(mine.after)}
          </div>
        </motion.div>
      </div>
      {movers.length > 0 && (
        <motion.div {...enter(0.95)} aria-label="Grid movers"
          style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--line-hair)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)' }}>
          {movers.map((m, i) => (
            <span key={m.teamId}>
              {i > 0 && ' · '}
              {name(m.teamId)}{' '}
              <span style={{ color: m.after > m.before ? 'var(--accent)' : 'var(--accent-warm)' }}>
                {m.after > m.before ? '▲' : '▼'}
              </span>
            </span>
          ))}
        </motion.div>
      )}
    </div>
  )
}

/** The constructors' championship, folded from the drivers'. */
export function ConstructorsList({ standings, playerTeamId }: {
  standings: readonly { driverId: string; points: number }[]
  playerTeamId: string
}) {
  const rows = constructorsTable(standings, DRIVER_TEAM)
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {rows.map((r, i) => {
        const me = r.teamId === playerTeamId
        return (
          <li key={r.teamId} aria-current={me ? 'true' : undefined} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', borderRadius: 8, marginBottom: 4,
            background: me ? 'rgba(0,229,208,0.08)' : 'transparent',
            borderLeft: me ? '2px solid var(--accent)' : '2px solid transparent',
          }}>
            <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', width: 20 }}>{i + 1}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: me ? 'var(--accent)' : 'var(--text-hi)' }}>
                {name(r.teamId)}
              </span>
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-hi)', fontVariantNumeric: 'tabular-nums' }}>
              {r.points} PTS
            </span>
          </li>
        )
      })}
    </ul>
  )
}
```

Before relying on them, confirm `--accent-warm`, `--text-mid` and `--bg-panel` exist in `src/styles/tokens.css` (CLAUDE.md §6.1 lists them). Do not introduce raw hex. The `rgba(0,229,208,0.08)` highlight matches the existing standings rows in `Championship.tsx`; if `tests/ui/colorMixBan.test.ts` or a token test rejects it, use whatever that file's rows use.

- [ ] **Step 4: Mount it in `Championship.tsx`**

Imports: `import { LadderReveal, ConstructorsList } from './LadderReveal'` and add `lastLadder` and `selectedTeamId` to the `useSeasonStore()` destructure. Add `const [table, setTable] = useState<'drivers' | 'constructors'>('drivers')`.

Directly above the `{/* Full standings */}` comment, insert:

```tsx
        {lastLadder && selectedTeamId && (
          <LadderReveal moves={lastLadder} playerTeamId={selectedTeamId} />
        )}
```

Replace the `FINAL STANDINGS` label div with a two-option toggle, and render the list it selects:

```tsx
        <div role="tablist" style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {(['drivers', 'constructors'] as const).map(k => (
            <button key={k} role="tab" aria-selected={table === k} onClick={() => { uiTap(); setTable(k) }}
              style={{
                background: table === k ? 'var(--bg-elevated)' : 'transparent',
                border: '1px solid var(--line-hair)', borderRadius: 999, padding: '4px 10px', cursor: 'pointer',
                fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.15em',
                color: table === k ? 'var(--text-hi)' : 'var(--text-dim)',
              }}>
              {k === 'drivers' ? 'DRIVERS' : "CONSTRUCTORS'"}
            </button>
          ))}
        </div>
        {table === 'constructors' && selectedTeamId && (
          <ConstructorsList standings={standings} playerTeamId={selectedTeamId} />
        )}
```

and wrap the existing `{standings.map(...)}` block as `{table === 'drivers' && standings.map(...)}`.

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run tests/ui/ladderReveal.test.tsx tests/ui/seasonEnd.test.tsx tests/ui/championshipRollover.test.tsx`
Expected: PASS. Then the full suite and `tsc`: clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/LadderReveal.tsx src/ui/Championship.tsx tests/ui/ladderReveal.test.tsx
git commit -m "feat(ui): the ladder reveal and the constructors' table

The championship screen shows where the team's car deserved to finish,
where it did, and the verdict -- STEP UP, HELD or STEP DOWN, each with an
arrow -- then the other teams that moved. A haptic marks any step and a
sound marks a step up. Drivers' and constructors' tables share a toggle.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Device pass and the record

**Files:**
- Modify: `docs/V2-CHECKLIST.md` (append a dated section)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

Automated tests cannot judge game feel (CLAUDE.md §8). This task is the on-device check and the honest record of it.

- [ ] **Step 1: Build and install on the device**

```bash
npm run build && npx cap sync android
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/opt/homebrew/share/android-commandlinetools ./gradlew assembleRelease
/opt/homebrew/share/android-commandlinetools/platform-tools/adb install -r app/build/outputs/apk/release/app-release.apk
```

Then launch and confirm no `FATAL` in `adb logcat -d`.

- [ ] **Step 2: Reach a season end on device**

Play (or simulate) a season to the championship screen. Check, with screenshots:
- the reveal appears, positions then verdict, with an arrow;
- the grid-movers line lists only teams that moved;
- the CONSTRUCTORS' toggle shows ten teams summing to the drivers' points;
- with reduced motion on in Settings, nothing slides;
- NEXT SEASON leads to a Development screen whose tier chip matches the reveal.

A 12-race season takes a while. If the device run cannot reach the end in the time available, record that in Step 3 rather than claiming it was checked.

- [ ] **Step 3: Record it**

Append to `docs/V2-CHECKLIST.md`:

```markdown
## 2026-10-09: the team ladder

- Spec `docs/superpowers/specs/2026-10-09-team-ladder-design.md`, plan
  `docs/superpowers/plans/2026-10-09-team-ladder.md`.
- Teams climb or slip at season end against the constructors' position
  their car deserved. One rule for all ten.
- **Balance change in the live game:** rival development now resets each
  winter. Before, it pinned every rival at 100 on power/aero/handling by
  season 4.
- Device pass: <what was actually checked, with dates; what was not>.
```

Fill the last line with what was really observed. Do not leave the angle brackets.

- [ ] **Step 4: Commit**

```bash
git add docs/V2-CHECKLIST.md
git commit -m "docs: record the team ladder and its device pass

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

# Development Points Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Earn Development Points each race and spend them on tiered upgrade packages that improve the player's car and driver, while rival teams develop in parallel — turning a season into an arc instead of eight identical races.

**Architecture:** Upgrades are an **overlay applied at the `buildConfig` boundary** in `src/state/raceStore.ts`. `seasonStore` owns the upgrade state; `buildConfig` deep-copies the facet objects from `loadGameData()` and adds the accumulated deltas before constructing the `RaceConfig`. The engine receives ordinary facet numbers and never learns that progression exists — `engine/` stays pure and deterministic.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Zustand, React 19, framer-motion, zod, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-20-development-points-design.md` (§1–4, §6, §7, §9)

**Depends on:** `2026-08-20-reliability-mechanical-failure.md` must land first — `reliability` is one of the eight upgradeable attributes and upgrading it is a no-op until that plan wires it up.

## Global Constraints

- `src/engine/` must not change in this plan. If a task seems to need an engine edit, stop — the overlay design is wrong somewhere.
- **The overlay MUST deep-copy facets.** `loadGameData()` returns shared objects; mutating them leaks upgrades into every later race and breaks determinism.
- All balance numbers live in `src/data/upgrades.json`, zod-validated. No costs or point values in logic.
- Income: **10 DP per race, flat** — independent of finishing position and of DNF.
- Tier costs: **Mk1 10 · Mk2 18 · Mk3 30**. Maxing one attribute costs 58 DP.
- Eight upgradeable attributes only: `power`, `aero`, `handling`, `pace`, `reliability`, `tyreManagement`, `racecraft`, `wetWeather`. **`pitCrew`, `consistency`, and `experience` are deliberately excluded** (spec §3) — do not add them.
- Points per tier: `power` +5, `aero` +3, `handling` +6, `pace` +3, `reliability` +5, `tyreManagement` +5, `racecraft` +5, `wetWeather` +6. These are normalised so each tier is worth ~0.085 s/lap; changing one in isolation breaks that.
- Car upgrades (`power`, `aero`, `handling`, `reliability`) apply to **both team cars**. Driver upgrades (`pace`, `tyreManagement`, `racecraft`, `wetWeather`) apply **only to the player's driver**.
- Upgrades reset in `startNewSeason()` and `playAgain()`.
- TypeScript strict: no `any`.

---

### Task 1: Upgrade data and validator

**Files:**
- Create: `src/data/upgrades.json`
- Modify: `src/data/validators.ts`
- Test: `tests/data/upgrades.test.ts` (create)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type UpgradeTarget = 'team' | 'driver'`
  - `type UpgradeUnit = 'laptime' | 'failureRisk' | 'cliffLaps' | 'passChance' | 'wetPace'`
  - `interface UpgradeAttribute { id: string; label: string; facet: string; target: UpgradeTarget; pointsPerTier: number; unit: UpgradeUnit }`
  - `interface UpgradesData { income: { perRace: number }; tierCosts: number[]; attributes: UpgradeAttribute[] }`
  - `loadGameData().upgrades: UpgradesData`

- [ ] **Step 1: Write the failing test**

Create `tests/data/upgrades.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'

describe('upgrades data', () => {
  it('exposes income and escalating tier costs', () => {
    const { upgrades } = loadGameData()
    expect(upgrades.income.perRace).toBe(10)
    expect(upgrades.tierCosts).toEqual([10, 18, 30])
  })

  it('offers exactly the eight viable attributes', () => {
    const { upgrades } = loadGameData()
    const ids = upgrades.attributes.map(a => a.id).sort()
    expect(ids).toEqual([
      'aero', 'handling', 'pace', 'power', 'racecraft',
      'reliability', 'tyreManagement', 'wetWeather',
    ])
  })

  it('excludes the attributes that are traps or inert', () => {
    // pitCrew gives ~0.09s per stop vs power's ~5s per race for the same cost;
    // consistency moves noise sigma by single-digit percent; experience has zero
    // engine references. See spec section 3.
    const { upgrades } = loadGameData()
    const facets = upgrades.attributes.map(a => a.facet)
    expect(facets).not.toContain('pitCrew')
    expect(facets).not.toContain('consistency')
    expect(facets).not.toContain('experience')
  })

  it('names a real facet for every attribute', () => {
    const data = loadGameData()
    const teamFacets = Object.keys(data.cars.teams[0]!.facets)
    const driverFacets = Object.keys(data.drivers.drivers[0]!.facets)
    for (const attr of data.upgrades.attributes) {
      const pool = attr.target === 'team' ? teamFacets : driverFacets
      expect(pool).toContain(attr.facet)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data/upgrades.test.ts`
Expected: FAIL — `upgrades` does not exist on the loaded data.

- [ ] **Step 3: Create `src/data/upgrades.json`**

```json
{
  "income": { "perRace": 10 },
  "tierCosts": [10, 18, 30],
  "attributes": [
    { "id": "power",          "label": "Power Unit",     "facet": "power",          "target": "team",   "pointsPerTier": 5, "unit": "laptime" },
    { "id": "aero",           "label": "Aero Package",   "facet": "aero",           "target": "team",   "pointsPerTier": 3, "unit": "laptime" },
    { "id": "handling",       "label": "Chassis",        "facet": "handling",       "target": "team",   "pointsPerTier": 6, "unit": "laptime" },
    { "id": "reliability",    "label": "Reliability",    "facet": "reliability",    "target": "team",   "pointsPerTier": 5, "unit": "failureRisk" },
    { "id": "pace",           "label": "Driver Pace",    "facet": "pace",           "target": "driver", "pointsPerTier": 3, "unit": "laptime" },
    { "id": "tyreManagement", "label": "Tyre Handling",  "facet": "tyreManagement", "target": "driver", "pointsPerTier": 5, "unit": "cliffLaps" },
    { "id": "racecraft",      "label": "Racecraft",      "facet": "racecraft",      "target": "driver", "pointsPerTier": 5, "unit": "passChance" },
    { "id": "wetWeather",     "label": "Wet Weather",    "facet": "wetWeather",     "target": "driver", "pointsPerTier": 6, "unit": "wetPace" }
  ]
}
```

- [ ] **Step 4: Add the schema and wire it into `loadGameData`**

In `src/data/validators.ts`, add near the other schemas:

```ts
const UpgradeAttributeSchema = z.object({
  id: z.string(),
  label: z.string(),
  facet: z.string(),
  target: z.enum(['team', 'driver']),
  pointsPerTier: z.number().int().positive(),
  unit: z.enum(['laptime', 'failureRisk', 'cliffLaps', 'passChance', 'wetPace']),
})

const UpgradesSchema = z.object({
  income: z.object({ perRace: z.number().int().positive() }),
  tierCosts: z.array(z.number().int().positive()).length(3),
  attributes: z.array(UpgradeAttributeSchema).length(8),
})

export type UpgradeAttribute = z.infer<typeof UpgradeAttributeSchema>
export type UpgradesData = z.infer<typeof UpgradesSchema>
```

Add `import upgradesJson from './upgrades.json'` at the top, `upgrades: UpgradesData` to the `GameData` interface, `const upgrades = UpgradesSchema.parse(upgradesJson)` in `loadGameData`, and `upgrades,` to its returned object.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/data/upgrades.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/data/upgrades.json src/data/validators.ts tests/data/upgrades.test.ts
git commit -m "feat(data): add upgrades.json with tier costs and attribute definitions

Eight upgradeable attributes with per-attribute point sizes normalised so each
tier is worth roughly equal lap time (aero sits in S2 at weight 0.45, so uniform
sizes would make it dominant). pitCrew, consistency and experience are excluded:
measured against current tuning they deliver ~2% of power's benefit for the same
cost, or nothing at all."
```

---

### Task 2: Upgrade state in `seasonStore`

**Files:**
- Modify: `src/state/seasonStore.ts`
- Test: `tests/state/development.test.ts` (create)

**Interfaces:**
- Consumes: `loadGameData().upgrades` from Task 1
- Produces, on `useSeasonStore`:
  - `devPoints: number`
  - `purchasedTiers: Record<string, number>` — attribute id → tiers owned (0–3)
  - `rivalDevelopment: Record<string, number>` — team id → accumulated facet points per facet
  - `purchaseTier(attributeId: string): void`
  - `tierCost(attributeId: string): number | null` — cost of the next tier, `null` if maxed
  - `canAfford(attributeId: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/state/development.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSeasonStore } from '@state/seasonStore'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

describe('development points', () => {
  beforeEach(() => { useSeasonStore.getState().startNewSeason() })

  it('starts a season with no points and no tiers', () => {
    const s = useSeasonStore.getState()
    expect(s.devPoints).toBe(0)
    expect(s.purchasedTiers['power'] ?? 0).toBe(0)
  })

  it('charges escalating costs and decrements the balance', () => {
    useSeasonStore.setState({ devPoints: 100 })
    const s = () => useSeasonStore.getState()

    expect(s().tierCost('power')).toBe(10)
    s().purchaseTier('power')
    expect(s().devPoints).toBe(90)
    expect(s().purchasedTiers['power']).toBe(1)

    expect(s().tierCost('power')).toBe(18)
    s().purchaseTier('power')
    expect(s().devPoints).toBe(72)

    expect(s().tierCost('power')).toBe(30)
    s().purchaseTier('power')
    expect(s().devPoints).toBe(42)
    expect(s().purchasedTiers['power']).toBe(3)
  })

  it('refuses a fourth tier', () => {
    useSeasonStore.setState({ devPoints: 200, purchasedTiers: { power: 3 } })
    expect(useSeasonStore.getState().tierCost('power')).toBeNull()
    useSeasonStore.getState().purchaseTier('power')
    expect(useSeasonStore.getState().purchasedTiers['power']).toBe(3)
    expect(useSeasonStore.getState().devPoints).toBe(200)
  })

  it('refuses a purchase the player cannot afford', () => {
    useSeasonStore.setState({ devPoints: 9 })
    expect(useSeasonStore.getState().canAfford('power')).toBe(false)
    useSeasonStore.getState().purchaseTier('power')
    expect(useSeasonStore.getState().purchasedTiers['power'] ?? 0).toBe(0)
    expect(useSeasonStore.getState().devPoints).toBe(9)
  })

  it('cannot buy two attributes to max on one season of income', () => {
    // 12 races x 10 DP = 120 DP; maxing one attribute costs 58.
    useSeasonStore.setState({ devPoints: 120 })
    const s = () => useSeasonStore.getState()
    for (const id of ['power', 'aero']) for (let i = 0; i < 3; i++) s().purchaseTier(id)
    expect(s().devPoints).toBe(120 - 58 - 58)
    // ...and a third attribute is then unaffordable, forcing specialisation.
    expect(s().canAfford('handling')).toBe(false)
  })

  it('clears everything on a new season', () => {
    useSeasonStore.setState({ devPoints: 50, purchasedTiers: { power: 2 }, rivalDevelopment: { terra: 6 } })
    useSeasonStore.getState().startNewSeason()
    const s = useSeasonStore.getState()
    expect(s.devPoints).toBe(0)
    expect(s.purchasedTiers).toEqual({})
    expect(s.rivalDevelopment).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/state/development.test.ts`
Expected: FAIL — `devPoints`, `tierCost`, `purchaseTier` do not exist.

- [ ] **Step 3: Add state and actions to `seasonStore`**

Add to the store's state interface and its `create()` initial state:

```ts
  // Season-scoped progression. Flat, separately-serialisable shapes so wiring
  // these into persistence later (deferred item 35) stays small.
  devPoints: number
  purchasedTiers: Record<string, number>
  rivalDevelopment: Record<string, number>
```

Initial values: `devPoints: 0, purchasedTiers: {}, rivalDevelopment: {}`.

Add to the actions, and import `loadGameData` from `@data/validators`:

```ts
  tierCost(attributeId) {
    const { tierCosts } = loadGameData().upgrades
    const owned = get().purchasedTiers[attributeId] ?? 0
    return tierCosts[owned] ?? null   // null once all three tiers are owned
  },

  canAfford(attributeId) {
    const cost = get().tierCost(attributeId)
    return cost !== null && get().devPoints >= cost
  },

  purchaseTier(attributeId) {
    const cost = get().tierCost(attributeId)
    if (cost === null || get().devPoints < cost) return   // maxed or unaffordable
    set(s => ({
      devPoints: s.devPoints - cost,
      purchasedTiers: { ...s.purchasedTiers, [attributeId]: (s.purchasedTiers[attributeId] ?? 0) + 1 },
    }))
  },
```

Add `devPoints: 0, purchasedTiers: {}, rivalDevelopment: {}` to the `set({...})` calls in **both** `startNewSeason()` and `playAgain()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/state/development.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/state/seasonStore.ts tests/state/development.test.ts
git commit -m "feat(state): development-point balance and tier purchasing

Season-scoped devPoints, purchasedTiers and rivalDevelopment, with escalating
tier costs read from upgrades.json. Includes a test asserting that one season of
income cannot max three attributes, which is the mechanism that forces
specialisation instead of an arbitrary cap."
```

---

### Task 3: Income on race completion

**Files:**
- Modify: `src/state/seasonStore.ts` (`recordRaceResult`)
- Test: `tests/state/development.test.ts`

**Interfaces:**
- Consumes: `devPoints` from Task 2, `loadGameData().upgrades.income.perRace` from Task 1
- Produces: nothing new

- [ ] **Step 1: Write the failing test**

Append to `tests/state/development.test.ts`:

```ts
describe('development income', () => {
  beforeEach(() => { useSeasonStore.getState().startNewSeason() })

  function finishRace(position: number, retired = false) {
    useSeasonStore.getState().recordRaceResult(
      [{ driverId: 'd_voss', position, points: 0, retired }],
      { overtakesGained: 0, pitsDone: 1, hadRain: false },
    )
  }

  it('pays the flat rate for a win', () => {
    finishRace(1)
    expect(useSeasonStore.getState().devPoints).toBe(10)
  })

  it('pays the same flat rate for a poor finish', () => {
    // Flat income is deliberate: position-based income compounds an existing
    // advantage and makes the underdog run impossible. See spec section 2.
    finishRace(18)
    expect(useSeasonStore.getState().devPoints).toBe(10)
  })

  it('pays the same flat rate for a DNF', () => {
    finishRace(20, true)
    expect(useSeasonStore.getState().devPoints).toBe(10)
  })

  it('accumulates unspent points across rounds', () => {
    finishRace(1); finishRace(5); finishRace(9)
    expect(useSeasonStore.getState().devPoints).toBe(30)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/state/development.test.ts`
Expected: FAIL — `devPoints` stays 0; income is not awarded.

- [ ] **Step 3: Award income in `recordRaceResult`**

In `recordRaceResult`, add to the existing `set({...})` call:

```ts
      devPoints: get().devPoints + loadGameData().upgrades.income.perRace,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/state/development.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/state/seasonStore.ts tests/state/development.test.ts
git commit -m "feat(state): award flat development points per race

Flat income regardless of position or DNF. Tests pin all three cases explicitly
because the flatness is a deliberate design decision, not an oversight — the
underdog arc requires that a strong team cannot out-earn a weak one."
```

---

### Task 4: The `buildConfig` overlay

The heart of the plan. Purchased tiers become facet deltas here, and nowhere else.

**Files:**
- Create: `src/state/upgradeOverlay.ts`
- Modify: `src/state/raceStore.ts` (`buildConfig`, around lines 59–100)
- Test: `tests/state/upgradeOverlay.test.ts` (create)

**Interfaces:**
- Consumes: `purchasedTiers`, `rivalDevelopment` (Task 2); `UpgradeAttribute` (Task 1)
- Produces:
  ```ts
  export function applyUpgrades<T extends { id: string; facets: Record<string, number> }>(
    entities: T[],
    opts: {
      attributes: UpgradeAttribute[]
      purchasedTiers: Record<string, number>
      target: 'team' | 'driver'
      appliesTo: (entity: T) => boolean
      rivalDevelopment?: Record<string, number>
    },
  ): T[]
  ```
  Returns new objects with new `facets` objects. Never mutates its input.

- [ ] **Step 1: Write the failing test**

Create `tests/state/upgradeOverlay.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applyUpgrades } from '@state/upgradeOverlay'
import { loadGameData } from '@data/validators'

const ATTRS = loadGameData().upgrades.attributes

function team(id: string, facets: Record<string, number>) { return { id, facets } }

describe('applyUpgrades', () => {
  it('adds pointsPerTier for each owned tier', () => {
    // power is +5 per tier; 2 tiers = +10
    const out = applyUpgrades([team('apex', { power: 92, aero: 95 })], {
      attributes: ATTRS, purchasedTiers: { power: 2 }, target: 'team',
      appliesTo: () => true,
    })
    expect(out[0]!.facets.power).toBe(102)
    expect(out[0]!.facets.aero).toBe(95)
  })

  it('never mutates the input — the load cache is shared', () => {
    // loadGameData() returns shared objects. Mutating them would leak upgrades
    // into every later race and break determinism.
    const original = team('apex', { power: 92 })
    const snapshot = { ...original.facets }
    const out = applyUpgrades([original], {
      attributes: ATTRS, purchasedTiers: { power: 3 }, target: 'team',
      appliesTo: () => true,
    })
    expect(original.facets).toEqual(snapshot)
    expect(out[0]!.facets).not.toBe(original.facets)
  })

  it('applies only to entities that pass appliesTo', () => {
    const out = applyUpgrades(
      [team('apex', { power: 92 }), team('zenith', { power: 66 })],
      { attributes: ATTRS, purchasedTiers: { power: 1 }, target: 'team',
        appliesTo: t => t.id === 'apex' },
    )
    expect(out[0]!.facets.power).toBe(97)
    expect(out[1]!.facets.power).toBe(66)
  })

  it('ignores attributes belonging to the other target', () => {
    // pace is a driver attribute; it must not touch a team's facets.
    const out = applyUpgrades([team('apex', { power: 92 })], {
      attributes: ATTRS, purchasedTiers: { pace: 3 }, target: 'team',
      appliesTo: () => true,
    })
    expect(out[0]!.facets.power).toBe(92)
  })

  it('adds rival development to teams other than the player', () => {
    const out = applyUpgrades([team('terra', { power: 70, aero: 71, handling: 72 })], {
      attributes: ATTRS, purchasedTiers: {}, target: 'team',
      appliesTo: () => false,
      rivalDevelopment: { terra: 9 },
    })
    // 9 points spread evenly across power/aero/handling = +3 each
    expect(out[0]!.facets.power).toBe(73)
    expect(out[0]!.facets.aero).toBe(74)
    expect(out[0]!.facets.handling).toBe(75)
  })

  it('clamps facets to 100', () => {
    const out = applyUpgrades([team('apex', { power: 98 })], {
      attributes: ATTRS, purchasedTiers: { power: 3 }, target: 'team',
      appliesTo: () => true,
    })
    // facetToRating9 would go negative above 100, inverting the pace benefit.
    expect(out[0]!.facets.power).toBe(100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/state/upgradeOverlay.test.ts`
Expected: FAIL — module `@state/upgradeOverlay` not found.

- [ ] **Step 3: Implement the overlay**

Create `src/state/upgradeOverlay.ts`:

```ts
import type { UpgradeAttribute } from '@data/validators'

// Facets feed facetToRating9() in lapModel as (1 - facet/100)*9. Above 100 that
// goes negative and the benefit inverts, so the ceiling is a correctness bound,
// not a balance choice.
const FACET_MAX = 100

// Rival development is spread evenly across the three pace facets rather than
// weighted toward a team's strength, so it stays legible and does not silently
// amplify the aero-is-worth-more asymmetry (spec section 4).
const RIVAL_FACETS = ['power', 'aero', 'handling'] as const

export function applyUpgrades<T extends { id: string; facets: Record<string, number> }>(
  entities: T[],
  opts: {
    attributes: UpgradeAttribute[]
    purchasedTiers: Record<string, number>
    target: 'team' | 'driver'
    appliesTo: (entity: T) => boolean
    rivalDevelopment?: Record<string, number>
  },
): T[] {
  const { attributes, purchasedTiers, target, appliesTo, rivalDevelopment } = opts
  const relevant = attributes.filter(a => a.target === target)

  return entities.map(entity => {
    // Always a fresh facets object: loadGameData() hands out shared references.
    const facets: Record<string, number> = { ...entity.facets }
    let touched = false

    if (appliesTo(entity)) {
      for (const attr of relevant) {
        const tiers = purchasedTiers[attr.id] ?? 0
        if (tiers <= 0) continue
        const base = facets[attr.facet]
        if (base === undefined) continue
        facets[attr.facet] = Math.min(FACET_MAX, base + tiers * attr.pointsPerTier)
        touched = true
      }
    } else if (rivalDevelopment) {
      const pool = rivalDevelopment[entity.id] ?? 0
      if (pool > 0) {
        const per = Math.floor(pool / RIVAL_FACETS.length)
        for (const facet of RIVAL_FACETS) {
          const base = facets[facet]
          if (base === undefined) continue
          facets[facet] = Math.min(FACET_MAX, base + per)
          touched = true
        }
      }
    }

    return touched ? { ...entity, facets } : entity
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/state/upgradeOverlay.test.ts`
Expected: PASS (all 6)

- [ ] **Step 5: Wire the overlay into `buildConfig`**

In `src/state/raceStore.ts`, `buildConfig` currently passes raw data:

```ts
    drivers: data.drivers.drivers,
    teams: data.cars.teams,
```

Add the overlay above the `return` (import `applyUpgrades` from `./upgradeOverlay` and `useSeasonStore` from `./seasonStore`):

```ts
  // Upgrades are applied here and nowhere else: the engine receives ordinary
  // facet numbers and never learns that progression exists.
  const season = useSeasonStore.getState()
  const upgrades = data.upgrades
  const playerTeam = data.drivers.drivers.find(d => d.id === playerDriverId)?.teamId

  const teams = applyUpgrades(data.cars.teams, {
    attributes: upgrades.attributes,
    purchasedTiers: season.purchasedTiers,
    target: 'team',
    // Car upgrades benefit the whole team, so the player's teammate gets them too.
    appliesTo: t => t.id === playerTeam,
    rivalDevelopment: season.rivalDevelopment,
  })

  const drivers = applyUpgrades(data.drivers.drivers, {
    attributes: upgrades.attributes,
    purchasedTiers: season.purchasedTiers,
    target: 'driver',
    // Driver upgrades are personal — the teammate does not get them.
    appliesTo: d => d.id === playerDriverId,
  })
```

Then change the returned config to use `drivers` and `teams`. Note `playerTeamId` already exists in `buildConfig` for `playerStrategyOverride`; reuse it rather than adding `playerTeam` if it is in scope.

- [ ] **Step 6: Verify the whole suite still passes**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS. `raceStore` now reads `seasonStore`; if a `raceStore` test fails on store coupling, have it call `useSeasonStore.getState().startNewSeason()` in `beforeEach` to get a clean zero-upgrade baseline.

- [ ] **Step 7: Commit**

```bash
git add src/state/upgradeOverlay.ts src/state/raceStore.ts tests/state/upgradeOverlay.test.ts
git commit -m "feat(state): apply upgrades as an overlay at the buildConfig boundary

Purchased tiers become facet deltas here and nowhere else, so engine/ stays
pure and never learns progression exists. The overlay always allocates a fresh
facets object — loadGameData() returns shared references, and mutating them
would leak upgrades into every later race and break determinism. Facets clamp
at 100 because facetToRating9 inverts above that."
```

---

### Task 5: Rival development per race

**Files:**
- Modify: `src/state/seasonStore.ts` (`recordRaceResult`)
- Test: `tests/state/development.test.ts`

**Interfaces:**
- Consumes: `rivalDevelopment` (Task 2), `developmentRate` from `cars.json`
- Produces: nothing new

- [ ] **Step 1: Write the failing test**

Append to `tests/state/development.test.ts`:

```ts
describe('rival development', () => {
  beforeEach(() => { useSeasonStore.getState().startNewSeason() })

  function finishRace() {
    useSeasonStore.getState().recordRaceResult(
      [{ driverId: 'd_voss', position: 1, points: 25, retired: false }],
      { overtakesGained: 0, pitsDone: 1, hadRain: false },
    )
  }

  it('develops rivals in proportion to developmentRate', () => {
    finishRace()
    const dev = useSeasonStore.getState().rivalDevelopment
    // Terra 1.4 develops fastest, Apex 1.0 slowest.
    expect(dev['terra']!).toBeGreaterThan(dev['apex']!)
  })

  it('accumulates across the season', () => {
    finishRace()
    const afterOne = useSeasonStore.getState().rivalDevelopment['terra']!
    finishRace()
    expect(useSeasonStore.getState().rivalDevelopment['terra']!).toBeGreaterThan(afterOne)
  })

  it('is deterministic — no RNG', () => {
    finishRace()
    const first = { ...useSeasonStore.getState().rivalDevelopment }
    useSeasonStore.getState().startNewSeason()
    finishRace()
    expect(useSeasonStore.getState().rivalDevelopment).toEqual(first)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/state/development.test.ts`
Expected: FAIL — `rivalDevelopment` stays `{}`.

- [ ] **Step 3: Accumulate rival development in `recordRaceResult`**

Add a module-level constant and helper in `seasonStore.ts`:

```ts
// Facet points a developmentRate-1.0 team gains per race. Sized so that over 12
// rounds an average team gains ~12 points spread across three facets (~4 each,
// about 0.07s/lap) — enough to keep the grid moving without out-developing a
// player who is spending on the same facets.
const RIVAL_POOL_PER_RACE = 1

function accumulateRivalDevelopment(current: Record<string, number>): Record<string, number> {
  const teams = loadGameData().cars.teams
  const next: Record<string, number> = { ...current }
  for (const team of teams) {
    const rate = team.developmentRate ?? 1.0
    next[team.id] = (next[team.id] ?? 0) + RIVAL_POOL_PER_RACE * rate * 3
  }
  return next
}
```

The `* 3` gives a whole-number pool per race that divides evenly across the three facets in the overlay.

Add to `recordRaceResult`'s `set({...})`:

```ts
      rivalDevelopment: accumulateRivalDevelopment(get().rivalDevelopment),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/state/development.test.ts`
Expected: PASS

- [ ] **Step 5: Sanity-check the end-of-season spread**

Add a temporary reporting test, read the output, then delete it:

```ts
it('REPORT: rival facet gain over a 12-race season', () => {
  for (let i = 0; i < 12; i++) useSeasonStore.getState().recordRaceResult(
    [{ driverId: 'd_voss', position: 1, points: 25, retired: false }],
    { overtakesGained: 0, pitsDone: 1, hadRain: false })
  const dev = useSeasonStore.getState().rivalDevelopment
  console.log('per-facet gain:', Object.fromEntries(
    Object.entries(dev).map(([k, v]) => [k, Math.floor(v / 3)])))
  expect(true).toBe(true)
})
```

Expected: Apex ~+12/facet, Terra ~+16/facet. If Terra ends up faster than a fully-upgraded player, lower `RIVAL_POOL_PER_RACE`. The player's ceiling is +15 `power` from three tiers, so a rival gaining more than ~12 per facet across the whole season would erase the point of upgrading.

- [ ] **Step 6: Commit**

```bash
git add src/state/seasonStore.ts tests/state/development.test.ts
git commit -m "feat(state): rival teams develop each race by developmentRate

Puts the previously-unread developmentRate data in cars.json to work: Terra
(1.4) and Zenith (1.2) climb fastest while Apex (1.0) barely moves, so the
field compresses over a season. Deterministic — no RNG — so a given season
always produces the same rival development."
```

---

### Task 6: The development screen

**Files:**
- Create: `src/ui/Development.tsx`
- Modify: `src/state/seasonStore.ts` (add `'development'` to `SeasonPhase`; route `nextRace`)
- Modify: `src/App.tsx` (render the new phase)
- Test: `tests/ui/development.test.tsx` (create)

**Interfaces:**
- Consumes: `devPoints`, `purchasedTiers`, `tierCost`, `canAfford`, `purchaseTier` (Task 2)
- Produces: `export function Development(): JSX.Element`; new `SeasonPhase` member `'development'`

- [ ] **Step 1: Write the failing test**

Create `tests/ui/development.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { act } from 'react'
import { Development } from '@ui/Development'
import { useSeasonStore } from '@state/seasonStore'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

describe('Development screen', () => {
  beforeEach(() => {
    cleanup()
    useSeasonStore.getState().startNewSeason()
    useSeasonStore.setState({ phase: 'development', playerDriverId: 'd_voss', selectedTeamId: 'apex' })
  })

  it('shows the current DP balance', () => {
    useSeasonStore.setState({ devPoints: 40 })
    render(<Development />)
    expect(screen.getByText('40')).toBeTruthy()
  })

  it('buys a tier and deducts the cost', () => {
    useSeasonStore.setState({ devPoints: 40 })
    render(<Development />)
    const buy = screen.getByTestId('buy-power')
    act(() => { buy.click() })
    expect(useSeasonStore.getState().purchasedTiers['power']).toBe(1)
    expect(useSeasonStore.getState().devPoints).toBe(30)
  })

  it('disables a tier the player cannot afford', () => {
    useSeasonStore.setState({ devPoints: 5 })
    render(<Development />)
    expect(screen.getByTestId('buy-power').hasAttribute('disabled')).toBe(true)
  })

  it('skipping banks the points and starts the race', () => {
    useSeasonStore.setState({ devPoints: 40 })
    render(<Development />)
    act(() => { screen.getByTestId('to-race').click() })
    expect(useSeasonStore.getState().phase).toBe('race_setup')
    expect(useSeasonStore.getState().devPoints).toBe(40)
  })

  it('does not offer the excluded attributes', () => {
    render(<Development />)
    expect(screen.queryByTestId('buy-pitCrew')).toBeNull()
    expect(screen.queryByTestId('buy-consistency')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/development.test.tsx`
Expected: FAIL — `@ui/Development` not found.

- [ ] **Step 3: Add the phase and route it**

In `src/state/seasonStore.ts`, add `'development'` to the `SeasonPhase` union. Then in `nextRace()`, change the non-season-end branch's `phase: 'race_setup'` to `phase: 'development'`, and add an action:

```ts
  toRaceSetup() { set({ phase: 'race_setup' }) },
```

Also route the **first** race there: in `confirmDriver()`, change `phase: 'race_setup'` to `phase: 'development'` so round 1 also gets the screen (with 0 DP it simply shows nothing affordable and the player continues).

- [ ] **Step 4: Build the screen**

Create `src/ui/Development.tsx`, following `RaceSetup.tsx`'s conventions: header, `flex: 1` scrollable body, fixed bottom action, design tokens only (no raw hex), `useUiTap` for haptics.

Requirements:
- Header: "DEVELOPMENT", round number, and the DP balance in `var(--font-mono)` with `fontVariantNumeric: 'tabular-nums'`.
- One row per attribute from `loadGameData().upgrades.attributes`, showing `label`, three tier pips (owned / next / locked), and the next tier's cost.
- A **consequence line per row, not a raw facet number** (spec §4). Compute from `unit`:
  - `laptime` → `−0.09s/lap` style, derived from `tuning.carPerformance`/`driverPerformance` exactly as spec §4 does
  - `failureRisk` → `−N% failure risk`
  - `cliffLaps` → `+N laps before the cliff`
  - `passChance` → `+N% pass chance`
  - `wetPace` → `−0.Ns/lap in the wet`
- Buy button per row with `data-testid={`buy-${attr.id}`}`, `disabled` when `!canAfford(attr.id)` or maxed, and an `aria-label` naming the attribute and cost.
- Bottom action `data-testid="to-race"` labelled "TO RACE SETUP →" calling `toRaceSetup()`.
- `role="status"` on the DP balance so a screen reader announces changes.

- [ ] **Step 5: Render the phase in `App.tsx`**

Add the import and, alongside the other phases inside `<AnimatePresence>`:

```tsx
        {phase === 'development' && <Development key="development" />}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/ui/development.test.tsx && npx tsc --noEmit && npx vitest run`
Expected: PASS throughout. `tests/ui/seasonEnd.test.tsx` asserts that mid-season `NEXT RACE` lands on `race_setup` — that assertion must now change to `development`. Update it; do not weaken it.

- [ ] **Step 7: Commit**

```bash
git add src/ui/Development.tsx src/App.tsx src/state/seasonStore.ts tests/ui/
git commit -m "feat(ui): development screen between races

New 'development' phase in the season flow. Rows show the consequence of each
package (-0.09s/lap) rather than the raw facet delta, since '+3 aero' reads as
arbitrary and normalised sizes differ per attribute. Skippable: unspent points
bank, so it is a decision point rather than a toll booth."
```

---

### Task 7: On-device verification of the arc

The economy is tuned on paper. This task checks it *plays*.

**Files:** none — verification only.

- [ ] **Step 1: Build and install**

```bash
npm run build && npx cap sync android
cd android && ./gradlew installDebug
```

Requires `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`.

- [ ] **Step 2: Play the underdog arc**

Start a season with **Zenith Racing** (the weakest car, `power` 66). Play at least 4 rounds, spending everything on `power` and `aero`.

Check:
- The development screen's consequence lines match the pace change you feel
- By round 4 the gap to the leaders has visibly narrowed on the timing tower
- Your teammate (Kanda) also improved — car upgrades are team-wide
- Rival midfielders have not run away

- [ ] **Step 3: Confirm the ceiling is a fight, not a walkover**

Continue to round 8+ with two attributes maxed. The target is a genuine fight with the front-runners, not dominance. If you are lapping the field, lower `pointsPerTier` in `upgrades.json` before touching costs — it preserves the economy's shape.

- [ ] **Step 4: Record the outcome**

Add a short "Playtest notes" section to the spec with what you observed and any constant you changed, then commit. Feel judgements belong in the spec, not in a test.

```bash
git add docs/superpowers/specs/2026-08-20-development-points-design.md
git commit -m "docs: playtest notes for the development-point economy"
```

---

## Self-Review

**Spec coverage:** §1 architecture/overlay — Task 4. §2 economy — Tasks 2, 3. §3 attribute selection — Task 1. §4 package sizing and consequence-display — Tasks 1, 6. §6 rival development — Task 5. §7 flow and UI — Task 6. §9 data model — Tasks 1, 2. §10 testing — every task. §11 balance risks 2 and 3 — Task 7.

**Deliberately not covered here:** §5 (reliability wiring) is the separate `2026-08-20-reliability-mechanical-failure.md` plan, and §8 (12 races, 4 new circuits) is `2026-08-20-twelve-race-calendar.md`. This plan leaves `TOTAL_RACES` at 8; the economy therefore under-runs its 120 DP design target until the calendar plan lands. That is expected and harmless — points simply accumulate more slowly than designed.

**Type consistency:** `UpgradeAttribute` is defined in Task 1 and consumed with identical field names in Tasks 4 and 6. `purchasedTiers: Record<string, number>` and `rivalDevelopment: Record<string, number>` are declared in Task 2 and used unchanged in Tasks 4, 5, 6. `tierCost` returns `number | null` consistently. `applyUpgrades`'s signature in Task 4's Interfaces block matches its implementation exactly.

**Ordering hazard:** Task 4 makes `raceStore` depend on `seasonStore`. `seasonStore` already imports `CIRCUIT_ORDER` from `raceStore`, so this creates a **circular import**. It works because both are accessed lazily inside functions rather than at module top level, but if the bundler complains, the fix is to move `CIRCUIT_ORDER` into its own module (`src/state/calendar.ts`) rather than to restructure the overlay. Flagged here so the implementer recognises it immediately.

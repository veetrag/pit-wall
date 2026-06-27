# F1 Strategist — Phase 4: Menus, Season Wrapper & Android Build

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a main menu, driver selection, a 5-race season with points standings, post-race and championship screens, and produce a working unsigned Android debug APK.

**Architecture:** A new `seasonStore` owns the top-level flow phase (`menu | driver_select | racing | result | championship`). `App.tsx` reads this phase and renders the right screen. The existing `raceStore` gets a new `startSeasonRace(playerDriverId, seed)` action so each race in the season uses a different seed and player driver. A thin `RaceWatcher` component bridges the two stores — it fires `seasonStore.recordRaceResult()` exactly once when the race finishes.

**Tech Stack:** React 19, Zustand 5, Framer Motion v12 (`framer-motion`), Capacitor 7 (`@capacitor/android` already in deps), TypeScript strict

## Global Constraints

- TypeScript strict + `noUncheckedIndexedAccess` — no `any`
- All colours via CSS tokens (`var(--accent)`, etc.) — no raw hex in components
- All Framer Motion imports from `'framer-motion'` (NOT `'motion/react'`)
- `engine/` imports nothing from `state/`, `ui/`, `canvas/`
- Commit after every task
- No Play Store submission — stop at unsigned debug APK

---

## File Map

```
src/state/
  seasonStore.ts     CREATE — SeasonPhase machine, driver pick, race list, points, standings
  raceStore.ts       MODIFY — add startSeasonRace(playerDriverId, seed) action

src/ui/
  MainMenu.tsx       CREATE — title screen, "New Season" + "About" buttons
  DriverSelect.tsx   CREATE — 10-card driver grid, pick one, CONFIRM
  RaceResult.tsx     CREATE — post-race screen: your finish, points earned, full standings
  Championship.tsx   CREATE — end-of-season screen: final standings, MVP, "Play Again"
  RaceWatcher.tsx    CREATE — headless component: fires recordRaceResult when race finishes

App.tsx              MODIFY — route by seasonStore.phase + raceStore.phase
```

---

## Task 1: Season Store

**Files:**
- Create: `src/state/seasonStore.ts`
- Test: `tests/state/seasonStore.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `useSeasonStore` — Zustand hook
  - `SeasonPhase = 'menu' | 'driver_select' | 'racing' | 'result' | 'championship'`
  - `SeasonResult { driverId: string; position: number; points: number }`
  - `Standing { driverId: string; points: number }`
  - Actions: `startNewSeason()`, `selectDriver(id)`, `confirmDriver()`, `recordRaceResult(positions)`, `nextRace()`, `playAgain()`
  - Selector: `currentSeed(): number` (derived: `raceIndex * 1000 + 42`)

Points system: P1=25, P2=18, P3=15, P4=12, P5=10, P6=8, P7=6, P8=4, P9=2, P10=1, P11+=0

- [ ] **Step 1: Write failing tests**

Create `tests/state/seasonStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useSeasonStore } from '@state/seasonStore'

const CIRCUITS = ['silverpark', 'silverpark', 'silverpark', 'silverpark', 'silverpark']

describe('seasonStore', () => {
  beforeEach(() => {
    useSeasonStore.setState({
      phase: 'menu', playerDriverId: null, raceIndex: 0,
      standings: [], lastRaceResults: null,
    })
  })

  it('starts at menu phase', () => {
    expect(useSeasonStore.getState().phase).toBe('menu')
  })

  it('startNewSeason transitions to driver_select', () => {
    useSeasonStore.getState().startNewSeason()
    expect(useSeasonStore.getState().phase).toBe('driver_select')
  })

  it('selectDriver sets playerDriverId', () => {
    useSeasonStore.getState().startNewSeason()
    useSeasonStore.getState().selectDriver('d_ham')
    expect(useSeasonStore.getState().playerDriverId).toBe('d_ham')
  })

  it('confirmDriver transitions to racing', () => {
    useSeasonStore.getState().startNewSeason()
    useSeasonStore.getState().selectDriver('d_ham')
    useSeasonStore.getState().confirmDriver()
    expect(useSeasonStore.getState().phase).toBe('racing')
  })

  it('currentSeed returns raceIndex * 1000 + 42', () => {
    useSeasonStore.setState({ raceIndex: 2 })
    expect(useSeasonStore.getState().currentSeed()).toBe(2042)
  })

  it('recordRaceResult accumulates points and transitions to result', () => {
    useSeasonStore.setState({ phase: 'racing', playerDriverId: 'd_ver', raceIndex: 0, standings: [], lastRaceResults: null })
    const positions = [
      { driverId: 'd_ver', position: 1 },
      { driverId: 'd_ham', position: 2 },
      { driverId: 'd_lec', position: 3 },
    ]
    useSeasonStore.getState().recordRaceResult(positions)
    const s = useSeasonStore.getState()
    expect(s.phase).toBe('result')
    const verStanding = s.standings.find(st => st.driverId === 'd_ver')
    expect(verStanding?.points).toBe(25)
  })

  it('nextRace at raceIndex 4 transitions to championship', () => {
    useSeasonStore.setState({ phase: 'result', raceIndex: 4, standings: [], playerDriverId: 'd_ver', lastRaceResults: null })
    useSeasonStore.getState().nextRace()
    expect(useSeasonStore.getState().phase).toBe('championship')
  })

  it('nextRace before last race increments raceIndex and goes to racing', () => {
    useSeasonStore.setState({ phase: 'result', raceIndex: 2, standings: [], playerDriverId: 'd_ver', lastRaceResults: null })
    useSeasonStore.getState().nextRace()
    expect(useSeasonStore.getState().raceIndex).toBe(3)
    expect(useSeasonStore.getState().phase).toBe('racing')
  })

  it('playAgain resets to menu', () => {
    useSeasonStore.setState({ phase: 'championship', raceIndex: 4, standings: [{ driverId: 'd_ver', points: 100 }], playerDriverId: 'd_ver', lastRaceResults: null })
    useSeasonStore.getState().playAgain()
    expect(useSeasonStore.getState().phase).toBe('menu')
    expect(useSeasonStore.getState().standings).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
cd "/Users/veetrag/Documents/Claude Expeiments/f1-manager"
npx vitest run tests/state/seasonStore.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/state/seasonStore.ts`**

```typescript
import { create } from 'zustand'

export type SeasonPhase = 'menu' | 'driver_select' | 'racing' | 'result' | 'championship'

export interface SeasonResult {
  driverId: string
  position: number
  points: number
}

export interface Standing {
  driverId: string
  points: number
}

const TOTAL_RACES = 5
const POINTS_TABLE: number[] = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]

function pointsFor(position: number): number {
  return POINTS_TABLE[position - 1] ?? 0
}

interface SeasonStore {
  phase: SeasonPhase
  playerDriverId: string | null
  raceIndex: number
  standings: Standing[]
  lastRaceResults: SeasonResult[] | null

  currentSeed: () => number
  startNewSeason: () => void
  selectDriver: (id: string) => void
  confirmDriver: () => void
  recordRaceResult: (positions: { driverId: string; position: number }[]) => void
  nextRace: () => void
  playAgain: () => void
}

export const useSeasonStore = create<SeasonStore>((set, get) => ({
  phase: 'menu',
  playerDriverId: null,
  raceIndex: 0,
  standings: [],
  lastRaceResults: null,

  currentSeed() {
    return get().raceIndex * 1000 + 42
  },

  startNewSeason() {
    set({ phase: 'driver_select', playerDriverId: null, raceIndex: 0, standings: [], lastRaceResults: null })
  },

  selectDriver(id) {
    set({ playerDriverId: id })
  },

  confirmDriver() {
    if (!get().playerDriverId) return
    set({ phase: 'racing' })
  },

  recordRaceResult(positions) {
    const { standings } = get()
    const results: SeasonResult[] = positions.map(p => ({
      driverId: p.driverId,
      position: p.position,
      points: pointsFor(p.position),
    }))

    const newStandings = [...standings]
    for (const r of results) {
      const existing = newStandings.find(s => s.driverId === r.driverId)
      if (existing) {
        existing.points += r.points
      } else {
        newStandings.push({ driverId: r.driverId, points: r.points })
      }
    }
    newStandings.sort((a, b) => b.points - a.points)

    set({ phase: 'result', standings: newStandings, lastRaceResults: results })
  },

  nextRace() {
    const { raceIndex } = get()
    if (raceIndex >= TOTAL_RACES - 1) {
      set({ phase: 'championship' })
    } else {
      set({ raceIndex: raceIndex + 1, phase: 'racing', lastRaceResults: null })
    }
  },

  playAgain() {
    set({ phase: 'menu', playerDriverId: null, raceIndex: 0, standings: [], lastRaceResults: null })
  },
}))

export { TOTAL_RACES }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/state/seasonStore.test.ts
```

Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/seasonStore.ts tests/state/seasonStore.test.ts
git commit -m "feat(state): season store — 5-race season, points, standings, phase machine"
```

---

## Task 2: raceStore — startSeasonRace action

**Files:**
- Modify: `src/state/raceStore.ts`
- Test: `tests/state/raceStore.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new
- Produces: `startSeasonRace(playerDriverId: string, seed: number): void`

- [ ] **Step 1: Add test**

Open `tests/state/raceStore.test.ts`. Append to the `describe` block:

```typescript
  it('startSeasonRace uses given playerDriverId and produces valid race', () => {
    useRaceStore.getState().startSeasonRace('d_ham', 9042)
    const s = useRaceStore.getState()
    expect(s.phase).toBe('racing')
    const player = s.raceState!.cars.find(c => c.isPlayer)
    expect(player?.driverId).toBe('d_ham')
  })
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
npx vitest run tests/state/raceStore.test.ts
```

Expected: FAIL — `startSeasonRace` not a function.

- [ ] **Step 3: Add `startSeasonRace` to `src/state/raceStore.ts`**

Read the file first. In the `RaceStore` interface, add:

```typescript
  startSeasonRace: (playerDriverId: string, seed: number) => void
```

In the `buildConfig` function signature, change to accept `playerDriverId`:

```typescript
function buildConfig(seed: number, playerDriverId: string): RaceConfig {
  const data = loadGameData()
  const circuit = data.circuits['silverpark']!
  return {
    circuit,
    tuning: data.tuning,
    compounds: data.compounds,
    drivers: data.drivers.drivers,
    teams: data.cars.teams,
    strategies: data.strategies.defaults,
    playerDriverId,
    seed,
  }
}
```

Update all existing callers of `buildConfig` (both `startRace` and `initForStartSequence`) to pass `'d_ver'` as the second argument:

```typescript
  startRace() {
    const seed = 42
    const config = buildConfig(seed, 'd_ver')
    // ...rest unchanged
  },

  initForStartSequence() {
    const seed = 42
    const config = buildConfig(seed, 'd_ver')
    // ...rest unchanged
  },
```

Then add the new action after `initForStartSequence`:

```typescript
  startSeasonRace(playerDriverId, seed) {
    const config = buildConfig(seed, playerDriverId)
    const raceState = initRace(config)
    const rng = createRng(seed)
    set({ phase: 'starting', config, raceState, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, pitEndTime: 0 })
  },
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/state/raceStore.test.ts
```

Expected: 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/raceStore.ts tests/state/raceStore.test.ts
git commit -m "feat(state): raceStore.startSeasonRace — dynamic playerDriverId + seed"
```

---

## Task 3: Main Menu + Driver Select screens

**Files:**
- Create: `src/ui/MainMenu.tsx`
- Create: `src/ui/DriverSelect.tsx`

**Interfaces:**
- Consumes: `useSeasonStore`, driver data from `@data/drivers.json` and `@data/cars.json`
- Produces: `<MainMenu />`, `<DriverSelect />`

No unit tests for pure UI screens — verified visually.

- [ ] **Step 1: Create `src/ui/MainMenu.tsx`**

```tsx
import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'

export function MainMenu() {
  const startNewSeason = useSeasonStore(s => s.startNewSeason)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-deep)', gap: 0,
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {/* Logotype */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
          color: 'var(--accent)', letterSpacing: '0.3em', textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          F1 STRATEGIST
        </div>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 52, fontWeight: 800,
          color: 'var(--text-hi)', letterSpacing: '-0.01em', lineHeight: 1,
          textShadow: '0 0 60px rgba(0,229,208,0.25)',
        }}>
          PIT WALL
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)',
          marginTop: 10, letterSpacing: '0.15em',
        }}>
          SEASON 2025 · SILVERPARK
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 240 }}>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={startNewSeason}
          style={{
            background: 'var(--accent)', color: 'var(--bg-deep)',
            border: 'none', borderRadius: 10, padding: '18px 0',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
            width: '100%',
          }}
        >
          NEW SEASON
        </motion.button>

        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)',
          textAlign: 'center', letterSpacing: '0.1em', marginTop: 8,
        }}>
          5 RACES · 10 DRIVERS
        </div>
      </div>

      {/* Version */}
      <div style={{
        position: 'absolute', bottom: 'calc(var(--safe-bottom) + 16px)',
        fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)',
        letterSpacing: '0.1em',
      }}>
        v0.1 ALPHA
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Create `src/ui/DriverSelect.tsx`**

The 10 drivers are hard-coded in data files. Import them directly; zod is already wired.

```tsx
import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import driversData from '@data/drivers.json'
import carsData from '@data/cars.json'

const TEAM_COLORS: Record<string, string> = {
  apex:     'var(--accent)',
  meridian: 'var(--accent-warm)',
  vortex:   'var(--tyre-medium)',
  zenith:   '#7B5EA7',
  torque:   '#FF7A00',
}

type DriverEntry = { id: string; name: string; teamId: string; skill: number }
type TeamEntry = { id: string; name: string; rating: number }

const drivers = driversData.drivers as DriverEntry[]
const teams = carsData.teams as TeamEntry[]

function teamName(teamId: string): string {
  return teams.find(t => t.id === teamId)?.name ?? teamId
}

function skillLabel(skill: number): string {
  if (skill <= 2) return 'ELITE'
  if (skill <= 4) return 'PRO'
  return 'RESERVE'
}

export function DriverSelect() {
  const playerDriverId = useSeasonStore(s => s.playerDriverId)
  const selectDriver = useSeasonStore(s => s.selectDriver)
  const confirmDriver = useSeasonStore(s => s.confirmDriver)

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-deep)',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '20px 20px 16px',
        borderBottom: '1px solid var(--line-hair)',
        flexShrink: 0,
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
          SEASON 2025
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
          Choose Your Driver
        </div>
      </div>

      {/* Driver grid */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 12px',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        alignContent: 'start',
      }}>
        {drivers.map(driver => {
          const selected = playerDriverId === driver.id
          const color = TEAM_COLORS[driver.teamId] ?? 'var(--text-mid)'
          return (
            <motion.button
              key={driver.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => selectDriver(driver.id)}
              style={{
                border: selected ? `2px solid ${color}` : '2px solid var(--line-hair)',
                borderRadius: 10,
                padding: '14px 12px',
                background: selected ? `color-mix(in srgb, ${color} 12%, var(--bg-elevated))` : 'var(--bg-elevated)',
                cursor: 'pointer', textAlign: 'left',
                boxShadow: selected ? `0 0 16px ${color}44` : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
                color: selected ? color : 'var(--text-hi)', letterSpacing: '0.04em',
              }}>
                {driver.name.toUpperCase()}
              </div>
              <div style={{
                fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', marginTop: 3,
              }}>
                {teamName(driver.teamId)}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                color: selected ? color : 'var(--text-dim)',
                marginTop: 4, letterSpacing: '0.08em',
              }}>
                {skillLabel(driver.skill)}
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* Confirm button */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={confirmDriver}
          disabled={!playerDriverId}
          style={{
            width: '100%', border: 'none', borderRadius: 10, padding: '16px',
            background: playerDriverId ? 'var(--accent)' : 'var(--bg-elevated)',
            color: playerDriverId ? 'var(--bg-deep)' : 'var(--text-dim)',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
            letterSpacing: '0.08em', cursor: playerDriverId ? 'pointer' : 'default',
            outline: playerDriverId ? 'none' : '1px solid var(--line-hair)',
            transition: 'all 0.2s',
          }}
        >
          {playerDriverId ? 'GO RACING →' : 'SELECT A DRIVER'}
        </motion.button>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd "/Users/veetrag/Documents/Claude Expeiments/f1-manager"
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/MainMenu.tsx src/ui/DriverSelect.tsx
git commit -m "feat(ui): main menu + driver select — logotype, 10-driver grid, confirm"
```

---

## Task 4: Race Result + Championship screens

**Files:**
- Create: `src/ui/RaceResult.tsx`
- Create: `src/ui/Championship.tsx`

**Interfaces:**
- Consumes: `useSeasonStore`, driver name lookup from `@data/drivers.json`
- Produces: `<RaceResult />`, `<Championship />`

- [ ] **Step 1: Create `src/ui/RaceResult.tsx`**

```tsx
import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import driversData from '@data/drivers.json'

type DriverEntry = { id: string; name: string; teamId: string }
const drivers = driversData.drivers as DriverEntry[]

function driverName(id: string): string {
  return drivers.find(d => d.id === id)?.name ?? id.replace('d_', '').toUpperCase()
}

function positionLabel(pos: number): string {
  if (pos === 1) return '1ST'
  if (pos === 2) return '2ND'
  if (pos === 3) return '3RD'
  return `${pos}TH`
}

export function RaceResult() {
  const { lastRaceResults, standings, playerDriverId, raceIndex, nextRace } = useSeasonStore()
  const TOTAL_RACES = 5

  const playerResult = lastRaceResults?.find(r => r.driverId === playerDriverId)
  const podium = (lastRaceResults ?? []).filter(r => r.position <= 3).sort((a, b) => a.position - b.position)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-deep)',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {/* Header */}
      <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
          RACE {raceIndex + 1} OF {TOTAL_RACES} · SILVERPARK
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
          Race Result
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* Player result card */}
        {playerResult && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'var(--bg-elevated)', borderRadius: 12,
              border: '1px solid var(--accent)',
              padding: '16px 20px', marginBottom: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.15em' }}>
                YOUR RESULT
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 800, color: 'var(--text-hi)', lineHeight: 1.1 }}>
                {positionLabel(playerResult.position)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
                POINTS
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 800, color: playerResult.points > 0 ? 'var(--positive)' : 'var(--text-dim)' }}>
                +{playerResult.points}
              </div>
            </div>
          </motion.div>
        )}

        {/* Podium */}
        {podium.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 8 }}>
              PODIUM
            </div>
            {podium.map((r, i) => (
              <motion.div
                key={r.driverId}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 8,
                  background: r.driverId === playerDriverId ? 'rgba(0,229,208,0.08)' : 'var(--bg-elevated)',
                  border: r.driverId === playerDriverId ? '1px solid var(--accent)' : '1px solid var(--line-hair)',
                  marginBottom: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: ['var(--tyre-medium)', 'var(--text-mid)', '#CD7F32'][i] ?? 'var(--text-dim)', width: 24 }}>
                    P{r.position}
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: r.driverId === playerDriverId ? 'var(--accent)' : 'var(--text-hi)' }}>
                    {driverName(r.driverId).toUpperCase()}
                  </span>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--positive)', fontVariantNumeric: 'tabular-nums' }}>
                  +{r.points}
                </span>
              </motion.div>
            ))}
          </div>
        )}

        {/* Championship standings */}
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 8 }}>
            CHAMPIONSHIP STANDINGS
          </div>
          {standings.slice(0, 6).map((s, i) => (
            <div
              key={s.driverId}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 14px', borderRadius: 6,
                background: s.driverId === playerDriverId ? 'rgba(0,229,208,0.06)' : 'transparent',
                borderLeft: s.driverId === playerDriverId ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: 3,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', width: 20 }}>
                  {i + 1}
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: s.driverId === playerDriverId ? 'var(--accent)' : 'var(--text-hi)' }}>
                  {driverName(s.driverId).toUpperCase()}
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-hi)', fontVariantNumeric: 'tabular-nums' }}>
                {s.points} PTS
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Continue button */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={nextRace}
          style={{
            width: '100%', border: 'none', borderRadius: 10, padding: '16px',
            background: 'var(--accent)', color: 'var(--bg-deep)',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
            letterSpacing: '0.08em', cursor: 'pointer',
          }}
        >
          {raceIndex < TOTAL_RACES - 1 ? `RACE ${raceIndex + 2} →` : 'FINAL STANDINGS →'}
        </motion.button>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Create `src/ui/Championship.tsx`**

```tsx
import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import driversData from '@data/drivers.json'

type DriverEntry = { id: string; name: string; teamId: string }
const drivers = driversData.drivers as DriverEntry[]

function driverName(id: string): string {
  return drivers.find(d => d.id === id)?.name ?? id.replace('d_', '').toUpperCase()
}

export function Championship() {
  const { standings, playerDriverId, playAgain } = useSeasonStore()

  const winner = standings[0]
  const playerStanding = standings.find(s => s.driverId === playerDriverId)
  const playerRank = standings.findIndex(s => s.driverId === playerDriverId) + 1

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-deep)',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {/* Header */}
      <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
          SEASON 2025 COMPLETE
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
          Championship
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* Champion card */}
        {winner && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            style={{
              background: 'var(--bg-elevated)', borderRadius: 14,
              border: '1px solid var(--tyre-medium)',
              padding: '20px', marginBottom: 20, textAlign: 'center',
              boxShadow: '0 0 40px rgba(242,201,76,0.15)',
            }}
          >
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tyre-medium)', letterSpacing: '0.2em', marginBottom: 6 }}>
              🏆 CHAMPION
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, color: winner.driverId === playerDriverId ? 'var(--accent)' : 'var(--text-hi)' }}>
              {driverName(winner.driverId).toUpperCase()}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--tyre-medium)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
              {winner.points} PTS
            </div>
            {winner.driverId === playerDriverId && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--positive)', marginTop: 8, letterSpacing: '0.1em' }}
              >
                YOU ARE THE CHAMPION
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Player summary if not champion */}
        {playerDriverId && winner?.driverId !== playerDriverId && playerStanding && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={{
              background: 'rgba(0,229,208,0.06)', borderRadius: 10,
              border: '1px solid var(--accent)',
              padding: '14px 18px', marginBottom: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.1em' }}>YOU FINISHED</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--text-hi)' }}>P{playerRank}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>TOTAL PTS</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{playerStanding.points}</div>
            </div>
          </motion.div>
        )}

        {/* Full standings */}
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 8 }}>
          FINAL STANDINGS
        </div>
        {standings.map((s, i) => (
          <motion.div
            key={s.driverId}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i }}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderRadius: 8,
              background: s.driverId === playerDriverId ? 'rgba(0,229,208,0.08)' : i === 0 ? 'rgba(242,201,76,0.06)' : 'transparent',
              borderLeft: s.driverId === playerDriverId ? '2px solid var(--accent)' : i === 0 ? '2px solid var(--tyre-medium)' : '2px solid transparent',
              marginBottom: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', width: 20 }}>
                {i + 1}
              </span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: s.driverId === playerDriverId ? 'var(--accent)' : i === 0 ? 'var(--tyre-medium)' : 'var(--text-hi)' }}>
                {driverName(s.driverId).toUpperCase()}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-hi)', fontVariantNumeric: 'tabular-nums' }}>
              {s.points} PTS
            </span>
          </motion.div>
        ))}
      </div>

      {/* Play again */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={playAgain}
          style={{
            width: '100%', border: 'none', borderRadius: 10, padding: '16px',
            background: 'var(--accent)', color: 'var(--bg-deep)',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
            letterSpacing: '0.08em', cursor: 'pointer',
          }}
        >
          PLAY AGAIN
        </motion.button>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/RaceResult.tsx src/ui/Championship.tsx
git commit -m "feat(ui): race result + championship screens — standings, podium, champion card"
```

---

## Task 5: RaceWatcher + App.tsx routing

**Files:**
- Create: `src/ui/RaceWatcher.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useRaceStore`, `useSeasonStore`
- Produces: `<RaceWatcher />` (headless — renders null), routes in `App.tsx`

**Strategy:** `RaceWatcher` watches `raceStore.phase`. When it transitions to `'finished'`, it reads `raceStore.raceState.cars`, sorts by `position`, calls `seasonStore.recordRaceResult()` once, then calls `raceStore.resetRace()`. A `hasFiredRef` prevents double-firing under StrictMode.

`App.tsx` renders the correct top-level component based on `seasonStore.phase`:
- `'menu'` → `<MainMenu />`
- `'driver_select'` → `<DriverSelect />`
- `'racing'` → `<RaceHUD />` (existing) — `RaceWatcher` launches the race via `raceStore.startSeasonRace` when this phase starts
- `'result'` → `<RaceResult />`
- `'championship'` → `<Championship />`

We also need a `resetRace()` action in raceStore to reset it back to idle after the result is recorded.

- [ ] **Step 1: Add `resetRace()` to `src/state/raceStore.ts`**

Read `src/state/raceStore.ts`. Add to the `RaceStore` interface:

```typescript
  resetRace: () => void
```

Add the action in the `create()` call (after `updateProjection`):

```typescript
  resetRace() {
    set({ phase: 'idle', config: null, raceState: null, rng: null, projectionResult: null, pitPanelOpen: false, playerInPit: false, pitEndTime: 0 })
  },
```

- [ ] **Step 2: Add test for resetRace**

Append to `tests/state/raceStore.test.ts`:

```typescript
  it('resetRace returns to idle with null state', () => {
    getStore().startRace()
    getStore().resetRace()
    expect(getStore().phase).toBe('idle')
    expect(getStore().raceState).toBeNull()
  })
```

Run tests:

```bash
npx vitest run tests/state/raceStore.test.ts
```

Expected: 11 tests PASS.

- [ ] **Step 3: Create `src/ui/RaceWatcher.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSeasonStore } from '@state/seasonStore'
import { useClockStore } from '@state/clockStore'

export function RaceWatcher() {
  const racePhase = useRaceStore(s => s.phase)
  const raceState = useRaceStore(s => s.raceState)
  const resetRace = useRaceStore(s => s.resetRace)
  const startSeasonRace = useRaceStore(s => s.startSeasonRace)
  const seasonPhase = useSeasonStore(s => s.phase)
  const playerDriverId = useSeasonStore(s => s.playerDriverId)
  const currentSeed = useSeasonStore(s => s.currentSeed)
  const recordRaceResult = useSeasonStore(s => s.recordRaceResult)
  const setSpeed = useClockStore(s => s.setSpeed)

  const hasFiredRef = useRef(false)

  // When season transitions to 'racing' and raceStore is idle, kick off the race
  useEffect(() => {
    if (seasonPhase === 'racing' && racePhase === 'idle' && playerDriverId) {
      hasFiredRef.current = false
      startSeasonRace(playerDriverId, currentSeed())
    }
  }, [seasonPhase, racePhase, playerDriverId]) // eslint-disable-line react-hooks/exhaustive-deps

  // When race finishes, record result
  useEffect(() => {
    if (racePhase === 'finished' && raceState && !hasFiredRef.current) {
      hasFiredRef.current = true
      setSpeed(0)
      const positions = [...raceState.cars]
        .sort((a, b) => a.position - b.position)
        .map(car => ({ driverId: car.driverId, position: car.position }))
      recordRaceResult(positions)
      // Small delay so the finish banner shows briefly before switching
      setTimeout(() => resetRace(), 1500)
    }
  }, [racePhase]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
```

- [ ] **Step 4: Modify `src/App.tsx`**

```tsx
import './styles/tokens.css'
import { AnimatePresence } from 'framer-motion'
import { useSeasonStore } from './state/seasonStore'
import { MainMenu } from './ui/MainMenu'
import { DriverSelect } from './ui/DriverSelect'
import { RaceHUD } from './ui/RaceHUD'
import { RaceResult } from './ui/RaceResult'
import { Championship } from './ui/Championship'
import { RaceWatcher } from './ui/RaceWatcher'

export default function App() {
  const phase = useSeasonStore(s => s.phase)

  return (
    <div style={{ height: '100%', overflow: 'hidden', position: 'relative' }}>
      <RaceWatcher />
      <AnimatePresence mode="wait">
        {phase === 'menu' && <MainMenu key="menu" />}
        {phase === 'driver_select' && <DriverSelect key="driver_select" />}
        {phase === 'racing' && <RaceHUD key="race" />}
        {phase === 'result' && <RaceResult key="result" />}
        {phase === 'championship' && <Championship key="championship" />}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 5: Verify TypeScript and full test suite**

```bash
npx tsc --noEmit 2>&1
npx vitest run 2>&1 | tail -6
```

Expected: no TS errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/RaceWatcher.tsx src/App.tsx src/state/raceStore.ts tests/state/raceStore.test.ts
git commit -m "feat(app): full routing — menu → driver select → race → result → championship"
```

---

## Task 6: Capacitor Android Build

**Files:**
- Modify: `capacitor.config.ts`
- Modify: `package.json` (add scripts)
- Run: `npx cap add android`, `npx cap sync`

No unit tests — verified by producing an installable APK.

- [ ] **Step 1: Check Capacitor CLI is available**

```bash
cd "/Users/veetrag/Documents/Claude Expeiments/f1-manager"
npx cap --version
```

Expected: prints version like `7.x.x`.

- [ ] **Step 2: Build the web app**

```bash
npm run build
```

Expected: `✓ built in Xs` with no errors.

- [ ] **Step 3: Add Android platform**

```bash
npx cap add android
```

Expected: creates `android/` directory.

- [ ] **Step 4: Sync assets**

```bash
npx cap sync android
```

Expected: `✔ Copying web assets` and `✔ Updating Android plugins`.

- [ ] **Step 5: Update `capacitor.config.ts`**

Read current `capacitor.config.ts`. Replace with:

```typescript
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.f1strategist.app',
  appName: 'F1 Strategist',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
}

export default config
```

- [ ] **Step 6: Add build scripts to `package.json`**

Read `package.json`. In the `scripts` section, add:

```json
"cap:sync": "npm run build && npx cap sync",
"cap:android": "npm run build && npx cap sync && npx cap open android"
```

- [ ] **Step 7: Build debug APK**

```bash
cd android && ./gradlew assembleDebug 2>&1 | tail -10
```

Expected: `BUILD SUCCESSFUL` and produces `android/app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 8: Verify APK exists**

```bash
ls -lh android/app/build/outputs/apk/debug/app-debug.apk
```

Expected: file present, size ~15–30 MB.

- [ ] **Step 9: Commit**

```bash
cd "/Users/veetrag/Documents/Claude Expeiments/f1-manager"
git add capacitor.config.ts package.json android/
git commit -m "feat(android): Capacitor Android platform — debug APK build"
```

---

## Self-Review

### Spec Coverage

| CLAUDE.md §7 Phase 4 requirement | Task |
|---|---|
| Menus | Task 3 (MainMenu), Task 5 (App routing) |
| Season/championship wrapper (simple v1) | Tasks 1, 4, 5 |
| Capacitor release build | Task 6 (debug APK — Play Store excluded per user) |
| Signing, AAB, store assets | **Excluded** — user-directed skip |

### Placeholder Scan

All steps contain complete code. No TBD/TODO present.

### Type Consistency

- `SeasonResult`, `Standing`, `SeasonPhase` defined in Task 1 and used consistently in Tasks 4, 5
- `startSeasonRace(playerDriverId: string, seed: number)` defined in Task 2, called in Task 5
- `recordRaceResult(positions: { driverId: string; position: number }[])` matches Task 1 signature; called correctly in Task 5
- `resetRace()` added in Task 5 Step 1 — matches the store action name used in `RaceWatcher`
- `TOTAL_RACES = 5` exported from seasonStore and used in RaceResult for "RACE X OF 5" labelling

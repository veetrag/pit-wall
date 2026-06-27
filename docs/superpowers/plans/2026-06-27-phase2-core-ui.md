# F1 Strategist — Phase 2: Core UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Phase 1 engine to a playable React UI — timing tower with FLIP reordering, multi-car track canvas, pace mode toggle, pit panel with projection overlay, and tyre cliff gauge — all driven by Zustand stores.

**Architecture:** A `state/` layer (Zustand) bridges the pure engine to React. A `clockStore` runs a `setInterval` that calls `raceStore.step()` at a configurable rate; React components subscribe to narrow slices of `raceStore` so only the relevant parts re-render on each tick. All design tokens and microinteractions are applied as components are built, not afterwards.

**Tech Stack:** React 19, Zustand, Framer Motion (`motion/react`), PixiJS 7, TypeScript 6 strict

## Global Constraints

- TypeScript strict + `noUncheckedIndexedAccess` — no `any`, use `unknown` + narrowing
- `engine/` imports nothing from `state/`, `ui/`, `canvas/`
- All colours via CSS tokens from `src/styles/tokens.css` — no raw hex in components
- All live-updating numbers: `font-variant-numeric: tabular-nums` + JetBrains Mono
- Framer Motion `motion/react` import (not deprecated `framer-motion`)
- Performance: subscribe narrowly to Zustand slices; never re-render whole tree on sim tick
- `prefers-reduced-motion` respected: replace motion with opacity on reduced-motion
- Mobile-first portrait layout; safe-area insets respected

---

## File Map

```
src/state/
  raceStore.ts       — race lifecycle, RaceState, player actions (pit, pace mode)
  clockStore.ts      — game speed (0/1/2/4x), drives setInterval tick

src/ui/
  RaceHUD.tsx        — root layout composing all panels + canvas
  TimingTower.tsx    — broadcast leaderboard, FLIP reorder, gap numbers, tyre dots
  PitPanel.tsx       — pit decision drawer: projection overlay + compound chips
  TyreGauge.tsx      — living cliff indicator gauge (teal→amber→red, pulses)
  PaceModeToggle.tsx — push/neutral/conserve selector with consequence preview
  GameClock.tsx      — headless component that drives the setInterval tick
  StartScreen.tsx    — pre-race "Start Race" button

src/canvas/
  TrackCanvas.tsx    — UPGRADE: all cars as interpolated dots, player teal trail

src/App.tsx          — MODIFY: mount RaceHUD, remove placeholder text
index.html           — MODIFY: add Google Fonts (Rajdhani, JetBrains Mono, Inter)
```

---

## Task 1: Fonts, App Shell, Google Fonts

**Files:**
- Modify: `index.html`
- Modify: `src/styles/tokens.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: CSS font variables usable in all later components; App renders `<RaceHUD />`

- [ ] **Step 1: Add Google Fonts to `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>F1 Strategist</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Extend `src/styles/tokens.css` with font and layout tokens**

```css
:root {
  --bg-deep:      #0A0E1A;
  --bg-panel:     #121829;
  --bg-elevated:  #1B2238;
  --line-hair:    #2A3350;
  --text-hi:      #F2F5FF;
  --text-mid:     #9AA7C7;
  --text-dim:     #5C6788;
  --accent:       #00E5D0;
  --accent-warm:  #FF4D5E;
  --tyre-soft:    #E8344E;
  --tyre-medium:  #F2C94C;
  --tyre-hard:    #EAEAEA;
  --positive:     #3DDC84;
  --negative:     #FF6B6B;

  --font-display: 'Rajdhani', sans-serif;
  --font-mono:    'JetBrains Mono', monospace;
  --font-body:    'Inter', sans-serif;

  --safe-top:    env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body, #root {
  height: 100%;
  overflow: hidden;
}

body {
  background: var(--bg-deep);
  color: var(--text-hi);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}

.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Update `src/App.tsx` to render `<RaceHUD />`**

```tsx
import './styles/tokens.css'
import { RaceHUD } from './ui/RaceHUD'

export default function App() {
  return <RaceHUD />
}
```

- [ ] **Step 4: Create placeholder `src/ui/RaceHUD.tsx` so App compiles**

```tsx
export function RaceHUD() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <p style={{ color: 'var(--text-mid)', fontFamily: 'var(--font-display)' }}>Phase 2 — wiring up…</p>
    </div>
  )
}
```

- [ ] **Step 5: Verify build is clean**

```bash
npm run build
```

Expected: builds with no TS errors.

- [ ] **Step 6: Commit**

```bash
git add index.html src/styles/tokens.css src/App.tsx src/ui/RaceHUD.tsx
git commit -m "feat(ui): Phase 2 shell — fonts, tokens, App mounts RaceHUD"
```

---

## Task 2: Zustand Race Store

**Files:**
- Create: `src/state/raceStore.ts`
- Test: `tests/state/raceStore.test.ts`

**Interfaces:**
- Consumes: `initRace`, `stepSector`, `projectPitNow` from `@engine/index`; `loadGameData` from `@data/validators`
- Produces:
  - `useRaceStore` — Zustand hook with shape below
  - `RacePhase = 'idle' | 'racing' | 'finished'`

```typescript
interface RaceStore {
  phase: RacePhase
  config: RaceConfig | null
  raceState: RaceState | null
  projectionResult: ProjectionResult | null
  pitPanelOpen: boolean
  rng: Rng | null          // current RNG instance (advances each step)

  startRace: () => void
  step: () => void          // advance one sector; called by GameClock
  pitNow: (compound: Compound) => void
  setPaceMode: (mode: PaceMode) => void
  openPitPanel: () => void
  closePitPanel: () => void
  updateProjection: (compound: Compound) => void
}
```

- [ ] **Step 1: Write failing tests**

Create `tests/state/raceStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useRaceStore } from '@state/raceStore'

function getStore() {
  return useRaceStore.getState()
}

describe('raceStore', () => {
  beforeEach(() => {
    useRaceStore.setState({
      phase: 'idle', config: null, raceState: null,
      projectionResult: null, pitPanelOpen: false, rng: null,
    })
  })

  it('starts in idle phase', () => {
    expect(getStore().phase).toBe('idle')
    expect(getStore().raceState).toBeNull()
  })

  it('startRace transitions to racing and creates raceState', () => {
    getStore().startRace()
    expect(getStore().phase).toBe('racing')
    expect(getStore().raceState).not.toBeNull()
    expect(getStore().raceState!.cars.length).toBeGreaterThan(0)
  })

  it('step advances the sector', () => {
    getStore().startRace()
    const s0 = getStore().raceState!.sector
    getStore().step()
    const s1 = getStore().raceState!.sector
    expect(s1).toBe((s0 + 1) % 3)
  })

  it('setPaceMode changes the player car pace mode', () => {
    getStore().startRace()
    getStore().setPaceMode('push')
    const player = getStore().raceState!.cars.find(c => c.isPlayer)!
    expect(player.paceMode).toBe('push')
  })

  it('pitNow applies stop time and resets tyreAge', () => {
    getStore().startRace()
    const before = getStore().raceState!.cars.find(c => c.isPlayer)!.raceTime
    getStore().pitNow('H')
    const after = getStore().raceState!.cars.find(c => c.isPlayer)!
    expect(after.raceTime).toBeGreaterThan(before)
    expect(after.tyreAge).toBe(0)
    expect(after.compound).toBe('H')
  })

  it('phase transitions to finished when all laps complete', () => {
    getStore().startRace()
    const total = getStore().raceState!.totalLaps * 3
    for (let i = 0; i < total; i++) getStore().step()
    expect(getStore().phase).toBe('finished')
  })
})
```

- [ ] **Step 2: Run failing tests**

```bash
npx vitest run tests/state/raceStore.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/state/raceStore.ts`**

```typescript
import { create } from 'zustand'
import { loadGameData } from '@data/validators'
import {
  initRace, stepSector, projectPitNow,
  type RaceConfig, type RaceState, type Compound, type PaceMode, type ProjectionResult,
} from '@engine/index'
import { createRng, type Rng } from '@engine/rng'

export type RacePhase = 'idle' | 'racing' | 'finished'

interface RaceStore {
  phase: RacePhase
  config: RaceConfig | null
  raceState: RaceState | null
  projectionResult: ProjectionResult | null
  pitPanelOpen: boolean
  rng: Rng | null

  startRace: () => void
  step: () => void
  pitNow: (compound: Compound) => void
  setPaceMode: (mode: PaceMode) => void
  openPitPanel: () => void
  closePitPanel: () => void
  updateProjection: (compound: Compound) => void
}

function buildConfig(seed: number): RaceConfig {
  const data = loadGameData()
  const circuit = data.circuits['silverpark']!
  return {
    circuit,
    tuning: data.tuning,
    compounds: data.compounds,
    drivers: data.drivers.drivers,
    teams: data.cars.teams,
    strategies: data.strategies.defaults,
    playerDriverId: 'd_ver',
    seed,
  }
}

export const useRaceStore = create<RaceStore>((set, get) => ({
  phase: 'idle',
  config: null,
  raceState: null,
  projectionResult: null,
  pitPanelOpen: false,
  rng: null,

  startRace() {
    const seed = 42
    const config = buildConfig(seed)
    const raceState = initRace(config)
    const rng = createRng(seed)
    set({ phase: 'racing', config, raceState, rng, projectionResult: null, pitPanelOpen: false })
  },

  step() {
    const { phase, config, raceState, rng } = get()
    if (phase !== 'racing' || !config || !raceState || !rng) return

    const nextState = stepSector(config, raceState, rng)
    const finished = nextState.lap >= nextState.totalLaps && nextState.sector === 0

    set({ raceState: nextState, phase: finished ? 'finished' : 'racing' })
  },

  pitNow(compound: Compound) {
    const { config, raceState, rng } = get()
    if (!config || !raceState || !rng) return
    const pitConfig = config.tuning.pit
    const stopTime = pitConfig.laneTimeLoss + pitConfig.stopMean + (rng() - 0.5) * 2 * pitConfig.stopSigma

    const updatedCars = raceState.cars.map(car => {
      if (!car.isPlayer) return car
      return { ...car, raceTime: car.raceTime + stopTime, compound, tyreAge: 0, pitsDone: car.pitsDone + 1 }
    })
    set({ raceState: { ...raceState, cars: updatedCars }, pitPanelOpen: false })
  },

  setPaceMode(mode: PaceMode) {
    const { raceState } = get()
    if (!raceState) return
    const updatedCars = raceState.cars.map(car => car.isPlayer ? { ...car, paceMode: mode } : car)
    set({ raceState: { ...raceState, cars: updatedCars } })
  },

  openPitPanel() { set({ pitPanelOpen: true }) },
  closePitPanel() { set({ pitPanelOpen: false, projectionResult: null }) },

  updateProjection(compound: Compound) {
    const { config, raceState } = get()
    if (!config || !raceState) return
    const result = projectPitNow(config, raceState, compound, Date.now() % 100000)
    set({ projectionResult: result })
  },
}))
```

- [ ] **Step 4: Create `tests/state/` directory and run tests**

```bash
mkdir -p tests/state
npx vitest run tests/state/raceStore.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/raceStore.ts tests/state/raceStore.test.ts
git commit -m "feat(state): Zustand race store — startRace, step, pitNow, setPaceMode"
```

---

## Task 3: Clock Store + GameClock Component

**Files:**
- Create: `src/state/clockStore.ts`
- Create: `src/ui/GameClock.tsx`

**Interfaces:**
- Consumes: `useRaceStore().step` and `useRaceStore().phase`
- Produces:
  - `useClockStore` with `speed: 0 | 1 | 2 | 4` and `setSpeed(s)`
  - `<GameClock />` — headless React component; mounts once in RaceHUD

Tick intervals: `speed=1` → 2000ms, `speed=2` → 500ms, `speed=4` → 100ms, `speed=0` → paused.

- [ ] **Step 1: Create `src/state/clockStore.ts`**

```typescript
import { create } from 'zustand'

export type GameSpeed = 0 | 1 | 2 | 4

interface ClockStore {
  speed: GameSpeed
  setSpeed: (s: GameSpeed) => void
}

export const useClockStore = create<ClockStore>(set => ({
  speed: 0,
  setSpeed: (speed) => set({ speed }),
}))
```

- [ ] **Step 2: Create `src/ui/GameClock.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { useClockStore } from '@state/clockStore'
import { useRaceStore } from '@state/raceStore'

const INTERVALS: Record<number, number> = { 1: 2000, 2: 500, 4: 100 }

export function GameClock() {
  const speed = useClockStore(s => s.speed)
  const step = useRaceStore(s => s.step)
  const phase = useRaceStore(s => s.phase)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (speed === 0 || phase !== 'racing') return
    const ms = INTERVALS[speed] ?? 2000
    timerRef.current = setInterval(step, ms)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [speed, phase, step])

  return null
}
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/state/clockStore.ts src/ui/GameClock.tsx
git commit -m "feat(state): clock store + GameClock headless ticker"
```

---

## Task 4: Start Screen

**Files:**
- Create: `src/ui/StartScreen.tsx`

**Interfaces:**
- Consumes: `useRaceStore().startRace`, `useClockStore().setSpeed`
- Produces: `<StartScreen />` — rendered when `phase === 'idle'`

- [ ] **Step 1: Create `src/ui/StartScreen.tsx`**

```tsx
import { motion } from 'motion/react'
import { useRaceStore } from '@state/raceStore'
import { useClockStore } from '@state/clockStore'

export function StartScreen() {
  const startRace = useRaceStore(s => s.startRace)
  const setSpeed = useClockStore(s => s.setSpeed)

  function handleStart() {
    startRace()
    setSpeed(1)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 32,
        background: 'var(--bg-deep)',
      }}
    >
      <h1 style={{
        fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 700,
        color: 'var(--accent)', letterSpacing: '0.05em', textTransform: 'uppercase',
      }}>
        F1 Strategist
      </h1>
      <p style={{ color: 'var(--text-mid)', fontFamily: 'var(--font-body)', fontSize: 16 }}>
        Silverpark · 30 Laps · Verstael / Apex Racing
      </p>
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={handleStart}
        style={{
          background: 'var(--accent)', color: 'var(--bg-deep)',
          border: 'none', borderRadius: 8, padding: '16px 48px',
          fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
        }}
      >
        Start Race
      </motion.button>
    </motion.div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/StartScreen.tsx
git commit -m "feat(ui): start screen with animated Start Race button"
```

---

## Task 5: Timing Tower

**Files:**
- Create: `src/ui/TimingTower.tsx`

**Interfaces:**
- Consumes: `useRaceStore(s => s.raceState)`, `useRaceStore(s => s.config)`
- Produces: `<TimingTower />` — broadcast leaderboard, FLIP position animation

The tower shows per row: position, driver code, gap to leader, tyre compound dot, tyre age, pace mode indicator. The player row is teal-highlighted. Rows animate to new positions with Framer Motion `layout`.

- [ ] **Step 1: Create `src/ui/TimingTower.tsx`**

```tsx
import { motion, AnimatePresence } from 'motion/react'
import { useRaceStore } from '@state/raceStore'
import type { CarState, Compound } from '@engine/types'

const COMPOUND_COLORS: Record<Compound, string> = {
  S: 'var(--tyre-soft)',
  M: 'var(--tyre-medium)',
  H: 'var(--tyre-hard)',
}

function formatGap(gap: number, position: number): string {
  if (position === 1) return 'LEADER'
  return `+${gap.toFixed(3)}`
}

function CompoundDot({ compound, age, cliff }: { compound: Compound; age: number; cliff: number }) {
  const fraction = cliff > 0 ? age / cliff : 0
  const worn = fraction > 0.85
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: COMPOUND_COLORS[compound],
      opacity: worn ? 0.5 : 1,
      boxShadow: worn ? 'none' : `0 0 4px ${COMPOUND_COLORS[compound]}`,
    }} />
  )
}

function TowerRow({ car, leaderTime, compounds }: {
  car: CarState
  leaderTime: number
  compounds: Record<Compound, { cliff: number }>
}) {
  const gap = car.raceTime - leaderTime
  const cliff = compounds[car.compound]?.cliff ?? 22
  const modeColor = car.paceMode === 'push' ? 'var(--accent-warm)' : car.paceMode === 'conserve' ? 'var(--positive)' : 'var(--text-dim)'

  return (
    <motion.div
      layout
      layoutId={car.driverId}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 36px 1fr 80px 12px 28px 8px',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 4,
        background: car.isPlayer ? 'rgba(0,229,208,0.08)' : 'transparent',
        borderLeft: car.isPlayer ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
        {car.position}
      </span>
      <span style={{
        fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
        color: car.isPlayer ? 'var(--accent)' : 'var(--text-hi)', letterSpacing: '0.05em',
      }}>
        {car.driverId.replace('d_', '').toUpperCase().slice(0, 3)}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)', fontVariantNumeric: 'tabular-nums' }}>
        {formatGap(gap, car.position)}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
        L{car.lap + 1}
      </span>
      <CompoundDot compound={car.compound} age={car.tyreAge} cliff={cliff} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
        {car.tyreAge}
      </span>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: modeColor, display: 'inline-block' }} />
    </motion.div>
  )
}

export function TimingTower() {
  const raceState = useRaceStore(s => s.raceState)
  const config = useRaceStore(s => s.config)

  if (!raceState || !config) return null

  const leaderTime = raceState.cars[0]?.raceTime ?? 0
  const sorted = [...raceState.cars].sort((a, b) => a.position - b.position)

  return (
    <div style={{
      background: 'var(--bg-panel)', borderRadius: 8,
      padding: '8px 0', minWidth: 240,
      border: '1px solid var(--line-hair)',
    }}>
      <div style={{
        padding: '6px 10px 8px',
        fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600,
        color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase',
        borderBottom: '1px solid var(--line-hair)',
        marginBottom: 4,
      }}>
        Lap {raceState.lap + 1} / {raceState.totalLaps}
      </div>
      <AnimatePresence initial={false}>
        {sorted.map(car => (
          <TowerRow
            key={car.driverId}
            car={car}
            leaderTime={leaderTime}
            compounds={config.compounds}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/TimingTower.tsx
git commit -m "feat(ui): timing tower — FLIP reordering, gap numbers, tyre dots, player highlight"
```

---

## Task 6: Tyre Cliff Gauge

**Files:**
- Create: `src/ui/TyreGauge.tsx`

**Interfaces:**
- Consumes: `useRaceStore` to find player car; `tyreCliffFraction` from engine
- Produces: `<TyreGauge />` — living gauge teal→amber→red, pulses when >0.85

- [ ] **Step 1: Create `src/ui/TyreGauge.tsx`**

```tsx
import { useRaceStore } from '@state/raceStore'
import { tyreCliffFraction } from '@engine/index'

function cliffColor(fraction: number): string {
  if (fraction >= 1.0) return 'var(--accent-warm)'
  if (fraction >= 0.7) return 'var(--tyre-medium)'
  return 'var(--accent)'
}

export function TyreGauge() {
  const raceState = useRaceStore(s => s.raceState)
  const config = useRaceStore(s => s.config)

  if (!raceState || !config) return null

  const player = raceState.cars.find(c => c.isPlayer)
  if (!player) return null

  const spec = config.compounds[player.compound]
  const fraction = tyreCliffFraction(spec, player.tyreAge)
  const fillPct = Math.min(fraction * 100, 100)
  const color = cliffColor(fraction)
  const isPulsing = fraction >= 0.85

  const COMPOUND_LABEL: Record<string, string> = { S: 'SOFT', M: 'MED', H: 'HARD' }

  return (
    <div style={{
      background: 'var(--bg-panel)', borderRadius: 8, padding: '10px 14px',
      border: '1px solid var(--line-hair)', minWidth: 160,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8,
      }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
          TYRES
        </span>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
          color: color, letterSpacing: '0.05em',
        }}>
          {COMPOUND_LABEL[player.compound] ?? player.compound} · L{player.tyreAge}
        </span>
      </div>

      {/* Track */}
      <div style={{
        height: 6, borderRadius: 3,
        background: 'var(--bg-elevated)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: 3,
          width: `${fillPct}%`,
          background: color,
          boxShadow: `0 0 8px ${color}`,
          transition: 'width 0.4s ease, background 0.4s ease',
          animation: isPulsing ? 'pulse-bar 1s ease-in-out infinite' : 'none',
        }} />
      </div>

      {fraction >= 1.0 && (
        <div style={{
          marginTop: 6, fontFamily: 'var(--font-display)', fontSize: 11,
          color: 'var(--accent-warm)', fontWeight: 700, letterSpacing: '0.1em',
          textAlign: 'center',
        }}>
          BOX BOX BOX
        </div>
      )}

      <style>{`
        @keyframes pulse-bar {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/TyreGauge.tsx
git commit -m "feat(ui): tyre cliff gauge — teal/amber/red, pulse past cliff"
```

---

## Task 7: Pace Mode Toggle

**Files:**
- Create: `src/ui/PaceModeToggle.tsx`

**Interfaces:**
- Consumes: `useRaceStore().setPaceMode`, player car's current `paceMode`
- Produces: `<PaceModeToggle />` — three-button selector with consequence preview

- [ ] **Step 1: Create `src/ui/PaceModeToggle.tsx`**

```tsx
import { motion } from 'motion/react'
import { useRaceStore } from '@state/raceStore'
import type { PaceMode } from '@engine/types'

const MODES: { mode: PaceMode; label: string; sublabel: string; color: string }[] = [
  { mode: 'conserve', label: 'SAVE',  sublabel: '+0.20s  −25% wear', color: 'var(--positive)' },
  { mode: 'neutral',  label: 'HOLD',  sublabel: 'baseline',          color: 'var(--text-mid)' },
  { mode: 'push',     label: 'PUSH',  sublabel: '−0.15s  +30% wear', color: 'var(--accent-warm)' },
]

export function PaceModeToggle() {
  const raceState = useRaceStore(s => s.raceState)
  const setPaceMode = useRaceStore(s => s.setPaceMode)

  const player = raceState?.cars.find(c => c.isPlayer)
  const current = player?.paceMode ?? 'neutral'

  return (
    <div style={{
      display: 'flex', gap: 6,
      background: 'var(--bg-panel)', borderRadius: 8,
      padding: 6, border: '1px solid var(--line-hair)',
    }}>
      {MODES.map(({ mode, label, sublabel, color }) => {
        const active = current === mode
        return (
          <motion.button
            key={mode}
            whileTap={{ scale: 0.95 }}
            onClick={() => setPaceMode(mode)}
            style={{
              flex: 1, border: 'none', borderRadius: 6, padding: '8px 6px',
              cursor: 'pointer',
              background: active ? color : 'transparent',
              outline: active ? 'none' : `1px solid var(--line-hair)`,
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
              color: active ? 'var(--bg-deep)' : color,
              letterSpacing: '0.08em',
            }}>
              {label}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: active ? 'rgba(0,0,0,0.6)' : 'var(--text-dim)',
              marginTop: 2, fontVariantNumeric: 'tabular-nums',
            }}>
              {sublabel}
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/PaceModeToggle.tsx
git commit -m "feat(ui): pace mode toggle — SAVE/HOLD/PUSH with consequence preview"
```

---

## Task 8: Pit Panel + Projection Overlay

**Files:**
- Create: `src/ui/PitPanel.tsx`

**Interfaces:**
- Consumes: `useRaceStore`: `pitPanelOpen`, `openPitPanel`, `closePitPanel`, `pitNow`, `updateProjection`, `projectionResult`
- Produces: `<PitPanel />` — drawer that slides up; compound chips; projection shows rejoin position

- [ ] **Step 1: Create `src/ui/PitPanel.tsx`**

```tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useRaceStore } from '@state/raceStore'
import type { Compound } from '@engine/types'

const COMPOUNDS: { id: Compound; label: string; colorVar: string }[] = [
  { id: 'S', label: 'SOFT',   colorVar: 'var(--tyre-soft)' },
  { id: 'M', label: 'MEDIUM', colorVar: 'var(--tyre-medium)' },
  { id: 'H', label: 'HARD',   colorVar: 'var(--tyre-hard)' },
]

function PitPanelDrawer() {
  const [selected, setSelected] = useState<Compound>('M')
  const { pitNow, closePitPanel, projectionResult, updateProjection } = useRaceStore()

  function handleSelect(c: Compound) {
    setSelected(c)
    updateProjection(c)
  }

  function handleConfirm() {
    pitNow(selected)
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-elevated)', borderRadius: '16px 16px 0 0',
        padding: '20px 20px 32px',
        borderTop: '1px solid var(--line-hair)',
        zIndex: 100,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.05em' }}>
          PIT STOP
        </span>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={closePitPanel}
          style={{
            background: 'transparent', border: '1px solid var(--line-hair)',
            borderRadius: 6, padding: '4px 10px', color: 'var(--text-dim)',
            fontFamily: 'var(--font-display)', fontSize: 12, cursor: 'pointer',
          }}
        >
          CANCEL
        </motion.button>
      </div>

      {/* Projection result */}
      {projectionResult && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: 'var(--bg-panel)', borderRadius: 8, padding: '10px 14px',
            marginBottom: 16, border: '1px solid var(--line-hair)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
            PROJECTED REJOIN
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>
              P{projectionResult.rejoinPosition}
            </span>
            {projectionResult.driverAheadId && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', fontVariantNumeric: 'tabular-nums' }}>
                +{projectionResult.rejoinGap.toFixed(1)}s ahead of next
              </span>
            )}
          </div>
        </motion.div>
      )}

      {/* Compound chips */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {COMPOUNDS.map(({ id, label, colorVar }) => {
          const active = selected === id
          return (
            <motion.button
              key={id}
              whileTap={{ scale: 0.94 }}
              onClick={() => handleSelect(id)}
              style={{
                flex: 1, border: 'none', borderRadius: 10, padding: '14px 8px',
                cursor: 'pointer',
                background: active ? colorVar : 'var(--bg-panel)',
                outline: active ? 'none' : `1px solid var(--line-hair)`,
                boxShadow: active ? `0 0 16px ${colorVar}66` : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
                color: active ? 'var(--bg-deep)' : colorVar,
                letterSpacing: '0.08em',
              }}>
                {id}
              </div>
              <div style={{
                fontFamily: 'var(--font-body)', fontSize: 10,
                color: active ? 'rgba(0,0,0,0.6)' : 'var(--text-dim)',
                marginTop: 2,
              }}>
                {label}
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* Confirm button */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleConfirm}
        style={{
          width: '100%', border: 'none', borderRadius: 10, padding: '16px',
          background: 'var(--accent-warm)', color: 'var(--bg-deep)',
          fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
          letterSpacing: '0.08em', cursor: 'pointer',
        }}
      >
        BOX NOW
      </motion.button>
    </motion.div>
  )
}

export function PitButton() {
  const openPitPanel = useRaceStore(s => s.openPitPanel)
  const phase = useRaceStore(s => s.phase)

  if (phase !== 'racing') return null

  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={openPitPanel}
      style={{
        border: '2px solid var(--accent-warm)', borderRadius: 8,
        padding: '12px 24px', background: 'transparent',
        color: 'var(--accent-warm)', fontFamily: 'var(--font-display)',
        fontSize: 16, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
      }}
    >
      PIT
    </motion.button>
  )
}

export function PitPanel() {
  const pitPanelOpen = useRaceStore(s => s.pitPanelOpen)

  return (
    <AnimatePresence>
      {pitPanelOpen && <PitPanelDrawer />}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/PitPanel.tsx
git commit -m "feat(ui): pit panel — compound chips, projection overlay, BOX NOW confirm"
```

---

## Task 9: Multi-Car Track Canvas

**Files:**
- Modify: `src/canvas/TrackCanvas.tsx`

**Interfaces:**
- Consumes: `useRaceStore(s => s.raceState)`, `useRaceStore(s => s.config)`, silverpark path
- Produces: All cars as animated dots interpolated along the circuit path; player car is teal with a trail

Strategy: store each car's "progress" (0–1 around the track) as a fraction based on `raceTime`. Interpolate smoothly on each Pixi ticker frame. Player car has a larger dot + glow.

- [ ] **Step 1: Replace `src/canvas/TrackCanvas.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import { useRaceStore } from '@state/raceStore'
import pathData from '@data/paths/silverpark.json'

type Point = [number, number]

function lerp(a: Point, b: Point, t: number): Point {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t]
}

function getPointAlongPath(points: Point[], t: number): Point {
  if (points.length < 2) return points[0] ?? [0, 0]
  const totalSegments = points.length - 1
  const scaled = t * totalSegments
  const idx = Math.min(Math.floor(scaled), totalSegments - 1)
  const frac = scaled - idx
  return lerp(points[idx]!, points[idx + 1]!, frac)
}

// Map raceTime to a 0-1 progress around the track
function raceTimeToProgress(raceTime: number, sectorBase: number[]): number {
  const lapTime = (sectorBase[0] ?? 28) + (sectorBase[1] ?? 34) + (sectorBase[2] ?? 28)
  if (lapTime <= 0) return 0
  return (raceTime % lapTime) / lapTime
}

const TEAM_COLORS: Record<string, number> = {
  apex:     0x00E5D0,
  meridian: 0xE8344E,
  vortex:   0xF2C94C,
  zenith:   0x7B5EA7,
  torque:   0xFF7A00,
}

export function TrackCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application | null>(null)
  const dotsRef = useRef<Map<string, PIXI.Graphics>>(new Map())

  const raceState = useRaceStore(s => s.raceState)
  const config = useRaceStore(s => s.config)

  // Init Pixi app once
  useEffect(() => {
    if (!containerRef.current) return
    const app = new PIXI.Application()
    appRef.current = app

    void app.init({ width: 600, height: 500, background: 0x0A0E1A, antialias: true }).then(() => {
      if (!containerRef.current) return
      containerRef.current.appendChild(app.canvas)

      const pts = pathData.points as Point[]
      const track = new PIXI.Graphics()
      track.moveTo(pts[0]![0], pts[0]![1])
      for (let i = 1; i < pts.length; i++) track.lineTo(pts[i]![0], pts[i]![1])
      track.stroke({ color: 0x2A3350, width: 3 })
      app.stage.addChild(track)
    })

    return () => {
      app.destroy(true)
      appRef.current = null
      dotsRef.current.clear()
    }
  }, [])

  // Update car dots when raceState changes
  useEffect(() => {
    const app = appRef.current
    if (!app || !raceState || !config) return

    const pts = pathData.points as Point[]
    const sectorBase = config.circuit.sectorBase

    // Create or update a dot for each car
    raceState.cars.forEach(car => {
      let dot = dotsRef.current.get(car.driverId)
      if (!dot) {
        dot = new PIXI.Graphics()
        app.stage.addChild(dot)
        dotsRef.current.set(car.driverId, dot)
      }

      const color = car.isPlayer ? 0x00E5D0 : (TEAM_COLORS[car.teamId] ?? 0x9AA7C7)
      const radius = car.isPlayer ? 8 : 5

      dot.clear()
      if (car.isPlayer) {
        dot.circle(0, 0, radius + 3).fill({ color, alpha: 0.25 })  // glow
      }
      dot.circle(0, 0, radius).fill({ color })

      const progress = raceTimeToProgress(car.raceTime, [...sectorBase])
      const [x, y] = getPointAlongPath(pts, progress)
      dot.x = x
      dot.y = y
    })

    // Remove dots for cars no longer in state
    for (const [id, dot] of dotsRef.current) {
      if (!raceState.cars.find(c => c.driverId === id)) {
        app.stage.removeChild(dot)
        dotsRef.current.delete(id)
      }
    }
  }, [raceState, config])

  return <div ref={containerRef} style={{ width: 600, height: 500, flexShrink: 0 }} />
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/canvas/TrackCanvas.tsx
git commit -m "feat(canvas): multi-car dots — all cars interpolated, player teal glow"
```

---

## Task 10: RaceHUD — Full Integration

**Files:**
- Modify: `src/ui/RaceHUD.tsx`

**Interfaces:**
- Consumes: all UI components + stores built in Tasks 1–9
- Produces: playable game layout:
  - **Phase idle:** `<StartScreen />`
  - **Phase racing/finished:** track canvas (left) + timing tower (right) + bottom control strip

- [ ] **Step 1: Replace `src/ui/RaceHUD.tsx` with full layout**

```tsx
import { AnimatePresence, motion } from 'motion/react'
import { useRaceStore } from '@state/raceStore'
import { useClockStore, type GameSpeed } from '@state/clockStore'
import { GameClock } from './GameClock'
import { StartScreen } from './StartScreen'
import { TimingTower } from './TimingTower'
import { TyreGauge } from './TyreGauge'
import { PaceModeToggle } from './PaceModeToggle'
import { PitPanel, PitButton } from './PitPanel'
import { TrackCanvas } from '@canvas/TrackCanvas'

function SpeedControl() {
  const speed = useClockStore(s => s.speed)
  const setSpeed = useClockStore(s => s.setSpeed)
  const phase = useRaceStore(s => s.phase)

  if (phase !== 'racing') return null

  const options: { v: GameSpeed; label: string }[] = [
    { v: 0, label: '⏸' },
    { v: 1, label: '1×' },
    { v: 2, label: '2×' },
    { v: 4, label: '4×' },
  ]

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map(({ v, label }) => (
        <motion.button
          key={v}
          whileTap={{ scale: 0.9 }}
          onClick={() => setSpeed(v)}
          style={{
            border: 'none', borderRadius: 6, padding: '6px 10px',
            background: speed === v ? 'var(--accent)' : 'var(--bg-elevated)',
            color: speed === v ? 'var(--bg-deep)' : 'var(--text-mid)',
            fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer',
            outline: speed === v ? 'none' : '1px solid var(--line-hair)',
          }}
        >
          {label}
        </motion.button>
      ))}
    </div>
  )
}

function FinishBanner() {
  const raceState = useRaceStore(s => s.raceState)
  const winner = raceState?.cars[0]

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
        background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
        borderRadius: 10, padding: '12px 28px', textAlign: 'center', zIndex: 50,
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>RACE FINISHED</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--accent)', marginTop: 2 }}>
        {winner?.driverId.replace('d_', '').toUpperCase()} WINS
      </div>
    </motion.div>
  )
}

export function RaceHUD() {
  const phase = useRaceStore(s => s.phase)

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-deep)',
      paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      position: 'relative', overflow: 'hidden',
    }}>
      <GameClock />

      <AnimatePresence mode="wait">
        {phase === 'idle' ? (
          <StartScreen key="start" />
        ) : (
          <motion.div
            key="race"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            {phase === 'finished' && <FinishBanner />}

            {/* Main area: canvas + tower side by side */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '8px 8px 0' }}>
              <div style={{ flex: 1, overflow: 'hidden', borderRadius: 8 }}>
                <TrackCanvas />
              </div>
              <div style={{ width: 260, marginLeft: 8, overflowY: 'auto' }}>
                <TimingTower />
              </div>
            </div>

            {/* Bottom control strip */}
            <div style={{
              padding: '10px 12px',
              background: 'var(--bg-panel)',
              borderTop: '1px solid var(--line-hair)',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <PaceModeToggle />
                </div>
                <TyreGauge />
                <PitButton />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <SpeedControl />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PitPanel />
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass (50+ passing).

- [ ] **Step 4: Commit**

```bash
git add src/ui/RaceHUD.tsx
git commit -m "feat(ui): RaceHUD — full integration, playable race layout, finish banner"
```

---

## Task 11: Smoke Test + Final Verification

**Files:**
- No new files — manual verification + final commit

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open `http://localhost:5173`.

- [ ] **Step 2: Verify golden path**

Manual checklist:
- [ ] Dark "F1 Strategist" start screen renders with Start Race button
- [ ] Tapping Start Race transitions to race view
- [ ] Timing tower shows 10 drivers; lap counter ticks; positions animate on reorder
- [ ] Track canvas shows multiple coloured dots; player dot is larger/teal
- [ ] Tyre gauge fills and changes colour as laps pass (advance with 4× to see quickly)
- [ ] Pace mode toggle: PUSH/HOLD/SAVE, active state fills with colour
- [ ] PIT button opens drawer; compound chips are selectable; projection shows P#
- [ ] BOX NOW confirms pit; tyre age resets to 0; compound dot changes in tower
- [ ] Race finishes after 30 laps; finish banner appears with winner name
- [ ] 1×/2×/4×/⏸ speed controls work

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: TypeScript clean check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: Phase 2 complete — playable race UI, timing tower, pit panel, tyre gauge"
```

---

## Notes for Phase 3

Phase 3 (Polish & feel) will add:
- Race-start lights sequence (5 red lights → lights-out)
- Haptic feedback via Capacitor Haptics on pit confirm, position change
- Howler.js audio: engine SFX, crowd ambience, pit-stop sound
- Particle/shimmer effect on tyre change
- Orchestrated menu transitions
- Settings panel (sound, haptics, reduced motion toggle)
- Save/load via Capacitor Preferences

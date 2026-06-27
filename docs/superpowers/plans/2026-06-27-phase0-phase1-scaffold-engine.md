# F1 Strategist — Phase 0 + Phase 1: Scaffold & Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a fully scaffolded Vite+React+PixiJS+Capacitor project with a single animated car on a canvas, then implement the complete deterministic race simulation engine with full Vitest coverage — no UI beyond the canvas dot.

**Architecture:** The project is split into a pure headless `engine/` module (zero UI deps, deterministic via seeded RNG, pure functional `step(state) → newState` style) and a thin scaffold that proves the deploy loop (Vite dev → Android APK). Phase 1 builds the engine in isolation; it is testable without any visual layer.

**Tech Stack:** TypeScript (strict + `noUncheckedIndexedAccess`), Vite, React 18, PixiJS 7, Zustand, Capacitor 5, Vitest, Zod

## Global Constraints

- TypeScript strict mode ON, `noUncheckedIndexedAccess: true` — no `any`, use `unknown` + narrowing
- `engine/` imports NOTHING from `state/`, `ui/`, `canvas/`, React, Pixi, Zustand
- No `Math.random()` in `engine/` — all randomness via the injected seeded RNG
- All balance numbers live in `src/data/tuning.json` — never hardcoded in logic
- Time is in seconds everywhere; deltas are positive = slower
- Car `rating` 0–9 (0=fastest); Driver `skill` 0–10 (0=best); `racecraft` 0.0–1.0 (1.0=best)
- `sectorBase`, sensitivity arrays MUST have length 3
- Sector overtake checks ONLY at sector boundaries — never continuous within a sector
- Engine must be deterministic: same seed + same inputs ⇒ identical race every time
- Vitest for all tests; no Jest

---

## File Map

### Created by Phase 0

```
/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── capacitor.config.ts
├── index.html
├── src/
│   ├── App.tsx                         # Root; mounts canvas + minimal HUD shell
│   ├── main.tsx
│   ├── styles/
│   │   └── tokens.css                  # Design tokens (full set from CLAUDE.md §6.1)
│   ├── data/
│   │   ├── tuning.json                 # Locked balance constants
│   │   ├── compounds.json
│   │   ├── circuits.json               # Silverpark only for v1
│   │   ├── cars.json
│   │   ├── drivers.json
│   │   ├── strategies.json
│   │   └── validators.ts               # Zod schemas + cross-ref validation
│   └── canvas/
│       └── TrackCanvas.tsx             # PixiJS app, single dot moving on a circuit path
└── android/                            # Capacitor-generated, do not edit manually
```

### Created by Phase 1 (engine layer)

```
src/engine/
├── types.ts          # All domain types: Car, Driver, Tyre, RaceState, SectorResult, …
├── rng.ts            # mulberry32 seeded RNG; Rng type alias
├── tyres.ts          # Tyre compound model + degradation curve
├── lapModel.ts       # Layer 1: per-sector time computation
├── race.ts           # Layer 2: stepable race loop, gaps, overtaking, pits
├── projection.ts     # Layer 3: clone-and-fast-forward what-if
├── strategy.ts       # AI rival strategy decisions
└── index.ts          # Public API surface

src/data/
└── paths/
    └── silverpark.json   # Circuit geometry: ordered points + sector markers + pit lane

tests/engine/
├── rng.test.ts
├── tyres.test.ts
├── lapModel.test.ts
├── race.test.ts
├── projection.test.ts
├── strategy.test.ts
└── monteCarlo.test.ts    # 200-race regression suite
```

---

## Task 0: Project Scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`

**Interfaces:**
- Produces: running `npm run dev` serves a page; `npm test` runs Vitest; `npm run build` produces a web bundle

- [ ] **Step 1: Initialise the project**

```bash
cd "/Users/veetrag/Documents/Claude Expeiments/f1-manager"
npm create vite@latest . -- --template react-ts
```

Accept prompts (current directory, react-ts). This generates `package.json`, `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/App.tsx`.

- [ ] **Step 2: Install all runtime and dev dependencies**

```bash
npm install pixi.js@7 zustand framer-motion howler zod
npm install @capacitor/core @capacitor/android @capacitor/haptics
npm install -D vitest @vitest/coverage-v8 jsdom @testing-library/react
npx cap init "F1 Strategist" "com.f1strategist.app" --web-dir dist
npx cap add android
```

- [ ] **Step 3: Configure TypeScript strict mode**

Replace the generated `tsconfig.json` with:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "paths": {
      "@engine/*": ["./src/engine/*"],
      "@data/*": ["./src/data/*"],
      "@state/*": ["./src/state/*"],
      "@canvas/*": ["./src/canvas/*"],
      "@ui/*": ["./src/ui/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Configure Vite with path aliases and Vitest**

Replace `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': resolve(__dirname, './src/engine'),
      '@data': resolve(__dirname, './src/data'),
      '@state': resolve(__dirname, './src/state'),
      '@canvas': resolve(__dirname, './src/canvas'),
      '@ui': resolve(__dirname, './src/ui'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: { provider: 'v8' },
  },
})
```

- [ ] **Step 5: Create the CSS design tokens file**

Create `src/styles/tokens.css`:

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
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg-deep); color: var(--text-hi); font-family: 'Inter', sans-serif; }
```

- [ ] **Step 6: Verify the scaffold builds**

```bash
npm run dev
```

Expected: Vite dev server starts on http://localhost:5173, browser shows the Vite+React default page (we replace it in Task 2).

```bash
npm run build
```

Expected: `dist/` created with no TS errors.

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "chore: Phase 0 scaffold — Vite+React+TS+Pixi+Capacitor wired up"
```

---

## Task 1: Data Files + Zod Validators

**Files:**
- Create: `src/data/tuning.json`, `src/data/compounds.json`, `src/data/circuits.json`, `src/data/cars.json`, `src/data/drivers.json`, `src/data/strategies.json`, `src/data/paths/silverpark.json`
- Create: `src/data/validators.ts`
- Test: `tests/data/validators.test.ts`

**Interfaces:**
- Produces:
  - `loadGameData(): Promise<GameData>` — validates all files, throws on schema error
  - `GameData` type with fields: `tuning`, `compounds`, `circuits`, `cars`, `drivers`, `strategies`

- [ ] **Step 1: Create `src/data/tuning.json`** (locked balance constants)

```json
{
  "carPerformance": {
    "deltaPerRating": 0.22,
    "sectorSplit": [0.30, 0.45, 0.25]
  },
  "driverPerformance": {
    "deltaPerSkill": 0.10,
    "sectorSplit": [0.30, 0.40, 0.30]
  },
  "fuel": {
    "effectPerLap": 0.035
  },
  "noise": {
    "sigmaPerSector": 0.08
  },
  "trackEvolution": {
    "startDelta": 0.30,
    "decayLaps": 20
  },
  "traffic": {
    "gapThreshold": 2.2,
    "penalty": 0.30
  },
  "overtaking": {
    "base": 0.22,
    "paceMultiplier": 3.0,
    "sectorFactor": [1.0, 0.25, 0.55]
  },
  "pit": {
    "laneTimeLoss": 22.0,
    "stopMean": 2.4,
    "stopSigma": 0.3
  },
  "paceModes": {
    "push":     { "paceDelta": -0.15, "degMultiplier": 1.30 },
    "neutral":  { "paceDelta":  0.00, "degMultiplier": 1.00 },
    "conserve": { "paceDelta":  0.20, "degMultiplier": 0.75 }
  },
  "projection": {
    "horizonLaps": 4,
    "useOvertakeRolls": false
  },
  "incidents": {
    "dnfPerLap": 0.0,
    "driverErrorPerLap": 0.0
  }
}
```

- [ ] **Step 2: Create `src/data/compounds.json`**

```json
{
  "S": { "name": "Soft",   "offset": -0.6, "lin": 0.040, "cliff": 12, "pen": 0.030, "colorToken": "--tyre-soft" },
  "M": { "name": "Medium", "offset":  0.0, "lin": 0.025, "cliff": 22, "pen": 0.020, "colorToken": "--tyre-medium" },
  "H": { "name": "Hard",   "offset":  0.5, "lin": 0.015, "cliff": 35, "pen": 0.012, "colorToken": "--tyre-hard" }
}
```

- [ ] **Step 3: Create `src/data/cars.json`**

```json
{
  "teams": [
    { "id": "apex",     "name": "Apex Racing",    "rating": 0, "reliability": 0.99, "colorPrimary": "#00E5D0", "colorSecondary": "#0A0E1A" },
    { "id": "meridian", "name": "Meridian GP",    "rating": 1, "reliability": 0.98, "colorPrimary": "#E8344E", "colorSecondary": "#FFFFFF" },
    { "id": "vortex",   "name": "Vortex Motors",  "rating": 2, "reliability": 0.97, "colorPrimary": "#F2C94C", "colorSecondary": "#0A0E1A" },
    { "id": "zenith",   "name": "Zenith F1",      "rating": 3, "reliability": 0.97, "colorPrimary": "#7B5EA7", "colorSecondary": "#FFFFFF" },
    { "id": "torque",   "name": "Torque Works",   "rating": 4, "reliability": 0.96, "colorPrimary": "#FF7A00", "colorSecondary": "#0A0E1A" }
  ]
}
```

- [ ] **Step 4: Create `src/data/drivers.json`**

```json
{
  "drivers": [
    { "id": "d_ver", "name": "Verstael",   "code": "VRS", "teamId": "apex",     "skill": 1,  "racecraft": 0.95, "consistency": 0.95 },
    { "id": "d_nor", "name": "Nordvik",    "code": "NRD", "teamId": "apex",     "skill": 2,  "racecraft": 0.88, "consistency": 0.92 },
    { "id": "d_ham", "name": "Hamilcar",   "code": "HMC", "teamId": "meridian", "skill": 1,  "racecraft": 0.92, "consistency": 0.93 },
    { "id": "d_lec", "name": "Leclair",    "code": "LCR", "teamId": "meridian", "skill": 3,  "racecraft": 0.85, "consistency": 0.88 },
    { "id": "d_rus", "name": "Ruskov",     "code": "RSK", "teamId": "vortex",   "skill": 3,  "racecraft": 0.82, "consistency": 0.90 },
    { "id": "d_alo", "name": "Alontez",    "code": "ALZ", "teamId": "vortex",   "skill": 4,  "racecraft": 0.90, "consistency": 0.85 },
    { "id": "d_sai", "name": "Sairal",     "code": "SRL", "teamId": "zenith",   "skill": 4,  "racecraft": 0.83, "consistency": 0.88 },
    { "id": "d_pias","name": "Piaster",    "code": "PST", "teamId": "zenith",   "skill": 5,  "racecraft": 0.80, "consistency": 0.87 },
    { "id": "d_oco", "name": "Oconnel",    "code": "OCN", "teamId": "torque",   "skill": 6,  "racecraft": 0.75, "consistency": 0.82 },
    { "id": "d_gas", "name": "Gascoigne",  "code": "GSC", "teamId": "torque",   "skill": 7,  "racecraft": 0.72, "consistency": 0.80 }
  ]
}
```

- [ ] **Step 5: Create `src/data/circuits.json`**

```json
{
  "silverpark": {
    "name": "Silverpark",
    "laps": 30,
    "sectorBase": [28.0, 34.0, 28.0],
    "carSensitivity": [0.30, 0.45, 0.25],
    "driverSensitivity": [0.30, 0.40, 0.30],
    "overtakingFactor": [1.0, 0.25, 0.55],
    "pitLaneTimeLoss": 22.0,
    "trackPath": "paths/silverpark.json",
    "characterNote": "Balanced reference circuit. S1 power, S2 aero, S3 mixed/traffic."
  }
}
```

- [ ] **Step 6: Create `src/data/strategies.json`**

```json
{
  "defaults": [
    { "teamId": "apex",     "startCompound": "M", "plannedStops": [{ "lap": 16, "compound": "H" }] },
    { "teamId": "meridian", "startCompound": "M", "plannedStops": [{ "lap": 15, "compound": "H" }] },
    { "teamId": "vortex",   "startCompound": "S", "plannedStops": [{ "lap": 11, "compound": "H" }] },
    { "teamId": "zenith",   "startCompound": "M", "plannedStops": [{ "lap": 17, "compound": "H" }] },
    { "teamId": "torque",   "startCompound": "S", "plannedStops": [{ "lap": 10, "compound": "M" }] }
  ]
}
```

- [ ] **Step 7: Create `src/data/paths/silverpark.json`** (simplified oval-ish circuit for Phase 0 canvas)

```json
{
  "points": [
    [250, 80], [380, 70], [470, 90], [520, 130], [510, 190],
    [460, 230], [420, 260], [400, 310], [410, 360], [450, 390],
    [490, 400], [520, 390], [540, 360], [530, 310], [480, 270],
    [440, 240], [390, 200], [360, 160], [300, 140], [250, 140],
    [210, 160], [190, 200], [200, 250], [230, 280], [250, 80]
  ],
  "sectorBoundaries": [8, 16],
  "pitEntry": [520, 130],
  "pitExit": [540, 360]
}
```

- [ ] **Step 8: Write the failing validator tests**

Create `tests/data/validators.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'

describe('loadGameData', () => {
  it('loads and validates all data files without throwing', async () => {
    const data = await loadGameData()
    expect(data.tuning.carPerformance.deltaPerRating).toBe(0.22)
    expect(data.compounds['S'].cliff).toBe(12)
    expect(data.circuits['silverpark'].laps).toBe(30)
    expect(data.cars.teams).toHaveLength(5)
    expect(data.drivers.drivers).toHaveLength(10)
  })

  it('every driver teamId references a valid team', async () => {
    const data = await loadGameData()
    const teamIds = new Set(data.cars.teams.map(t => t.id))
    for (const d of data.drivers.drivers) {
      expect(teamIds.has(d.teamId), `driver ${d.id} has unknown teamId ${d.teamId}`).toBe(true)
    }
  })

  it('all strategy teamIds reference valid teams', async () => {
    const data = await loadGameData()
    const teamIds = new Set(data.cars.teams.map(t => t.id))
    for (const s of data.strategies.defaults) {
      expect(teamIds.has(s.teamId)).toBe(true)
    }
  })

  it('sectorBase arrays all have length 3', async () => {
    const data = await loadGameData()
    for (const [id, circuit] of Object.entries(data.circuits)) {
      expect(circuit.sectorBase, `${id} sectorBase`).toHaveLength(3)
    }
  })

  it('compound keys are exactly S, M, H', async () => {
    const data = await loadGameData()
    expect(Object.keys(data.compounds).sort()).toEqual(['H', 'M', 'S'])
  })
})
```

- [ ] **Step 9: Run failing tests**

```bash
npx vitest run tests/data/validators.test.ts
```

Expected: FAIL — `loadGameData` is not defined.

- [ ] **Step 10: Implement `src/data/validators.ts`**

```typescript
import { z } from 'zod'
import tuningJson from './tuning.json'
import compoundsJson from './compounds.json'
import circuitsJson from './circuits.json'
import carsJson from './cars.json'
import driversJson from './drivers.json'
import strategiesJson from './strategies.json'

const TuningSchema = z.object({
  carPerformance: z.object({ deltaPerRating: z.number(), sectorSplit: z.array(z.number()).length(3) }),
  driverPerformance: z.object({ deltaPerSkill: z.number(), sectorSplit: z.array(z.number()).length(3) }),
  fuel: z.object({ effectPerLap: z.number() }),
  noise: z.object({ sigmaPerSector: z.number() }),
  trackEvolution: z.object({ startDelta: z.number(), decayLaps: z.number() }),
  traffic: z.object({ gapThreshold: z.number(), penalty: z.number() }),
  overtaking: z.object({ base: z.number(), paceMultiplier: z.number(), sectorFactor: z.array(z.number()).length(3) }),
  pit: z.object({ laneTimeLoss: z.number(), stopMean: z.number(), stopSigma: z.number() }),
  paceModes: z.object({
    push:     z.object({ paceDelta: z.number(), degMultiplier: z.number() }),
    neutral:  z.object({ paceDelta: z.number(), degMultiplier: z.number() }),
    conserve: z.object({ paceDelta: z.number(), degMultiplier: z.number() }),
  }),
  projection: z.object({ horizonLaps: z.number(), useOvertakeRolls: z.boolean() }),
  incidents: z.object({ dnfPerLap: z.number(), driverErrorPerLap: z.number() }),
})

const CompoundEntrySchema = z.object({
  name: z.string(), offset: z.number(), lin: z.number(),
  cliff: z.number(), pen: z.number(), colorToken: z.string(),
})
const CompoundsSchema = z.object({ S: CompoundEntrySchema, M: CompoundEntrySchema, H: CompoundEntrySchema })

const CircuitSchema = z.object({
  name: z.string(), laps: z.number(),
  sectorBase: z.array(z.number()).length(3),
  carSensitivity: z.array(z.number()).length(3),
  driverSensitivity: z.array(z.number()).length(3),
  overtakingFactor: z.array(z.number()).length(3),
  pitLaneTimeLoss: z.number(),
  trackPath: z.string(),
  characterNote: z.string().optional(),
})
const CircuitsSchema = z.record(CircuitSchema)

const TeamSchema = z.object({
  id: z.string(), name: z.string(), rating: z.number().int().min(0).max(9),
  reliability: z.number().min(0).max(1), colorPrimary: z.string(), colorSecondary: z.string(),
})
const CarsSchema = z.object({ teams: z.array(TeamSchema) })

const DriverSchema = z.object({
  id: z.string(), name: z.string(), code: z.string().length(3),
  teamId: z.string(), skill: z.number().int().min(0).max(10),
  racecraft: z.number().min(0).max(1), consistency: z.number().min(0).max(1),
})
const DriversSchema = z.object({ drivers: z.array(DriverSchema) })

const StrategyDefaultSchema = z.object({
  teamId: z.string(), startCompound: z.enum(['S', 'M', 'H']),
  plannedStops: z.array(z.object({ lap: z.number(), compound: z.enum(['S', 'M', 'H']) })),
})
const StrategiesSchema = z.object({ defaults: z.array(StrategyDefaultSchema) })

export type Tuning = z.infer<typeof TuningSchema>
export type Compounds = z.infer<typeof CompoundsSchema>
export type Circuits = z.infer<typeof CircuitsSchema>
export type Cars = z.infer<typeof CarsSchema>
export type Drivers = z.infer<typeof DriversSchema>
export type Strategies = z.infer<typeof StrategiesSchema>

export interface GameData {
  tuning: Tuning
  compounds: Compounds
  circuits: Circuits
  cars: Cars
  drivers: Drivers
  strategies: Strategies
}

export function loadGameData(): GameData {
  const tuning = TuningSchema.parse(tuningJson)
  const compounds = CompoundsSchema.parse(compoundsJson)
  const circuits = CircuitsSchema.parse(circuitsJson)
  const cars = CarsSchema.parse(carsJson)
  const drivers = DriversSchema.parse(driversJson)
  const strategies = StrategiesSchema.parse(strategiesJson)

  // Cross-reference: every driver.teamId must be a known team
  const teamIds = new Set(cars.teams.map(t => t.id))
  for (const d of drivers.drivers) {
    if (!teamIds.has(d.teamId)) throw new Error(`Driver ${d.id} references unknown teamId "${d.teamId}"`)
  }
  for (const s of strategies.defaults) {
    if (!teamIds.has(s.teamId)) throw new Error(`Strategy references unknown teamId "${s.teamId}"`)
  }

  return { tuning, compounds, circuits, cars, drivers, strategies }
}
```

- [ ] **Step 11: Run tests**

```bash
npx vitest run tests/data/validators.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 12: Commit**

```bash
git add src/data/ tests/data/
git commit -m "feat(data): data files + zod validators with cross-ref checks"
```

---

## Task 2: Canvas Scaffold — Single Dot on Track

**Files:**
- Create: `src/canvas/TrackCanvas.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `silverpark.json` track points
- Produces: `<TrackCanvas />` React component that renders a PixiJS canvas with one dot traveling the circuit path

- [ ] **Step 1: Create `src/canvas/TrackCanvas.tsx`**

```typescript
import { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import pathData from '@data/paths/silverpark.json'

type Point = [number, number]

function lerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function getPointAlongPath(points: Point[], t: number): Point {
  if (points.length < 2) return points[0] ?? [0, 0]
  const totalSegments = points.length - 1
  const scaled = t * totalSegments
  const idx = Math.min(Math.floor(scaled), totalSegments - 1)
  const frac = scaled - idx
  return lerp(points[idx]!, points[idx + 1]!, frac)
}

export function TrackCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const app = new PIXI.Application({
      width: 600, height: 500,
      backgroundColor: 0x0A0E1A,
      antialias: true,
    })
    containerRef.current.appendChild(app.view as HTMLCanvasElement)

    // Draw track path
    const track = new PIXI.Graphics()
    track.lineStyle(3, 0x2A3350, 1)
    const pts = pathData.points as Point[]
    track.moveTo(pts[0]![0], pts[0]![1])
    for (let i = 1; i < pts.length; i++) track.lineTo(pts[i]![0], pts[i]![1])
    app.stage.addChild(track)

    // Car dot
    const car = new PIXI.Graphics()
    car.beginFill(0x00E5D0)
    car.drawCircle(0, 0, 6)
    car.endFill()
    app.stage.addChild(car)

    let progress = 0
    app.ticker.add((delta) => {
      progress = (progress + delta * 0.001) % 1
      const [x, y] = getPointAlongPath(pts, progress)
      car.x = x
      car.y = y
    })

    return () => { app.destroy(true) }
  }, [])

  return <div ref={containerRef} style={{ width: 600, height: 500 }} />
}
```

- [ ] **Step 2: Update `src/App.tsx`**

```typescript
import './styles/tokens.css'
import { TrackCanvas } from './canvas/TrackCanvas'

export default function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 24 }}>
      <h1 style={{ color: 'var(--accent)', fontFamily: 'monospace', marginBottom: 16 }}>F1 Strategist</h1>
      <TrackCanvas />
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

```bash
npm run dev
```

Expected: browser shows a dark canvas with a grey circuit path and a teal dot smoothly looping around it.

- [ ] **Step 4: Commit**

```bash
git add src/canvas/ src/App.tsx src/styles/
git commit -m "feat(canvas): Phase 0 complete — single dot on Silverpark track path"
```

---

## Task 3: Engine Types

**Files:**
- Create: `src/engine/types.ts`

**Interfaces:**
- Produces all domain types consumed by Tasks 4–9

- [ ] **Step 1: Write the failing type-check test**

Create `tests/engine/types.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest'
import type { RaceState, CarState, Compound, PaceMode, SectorResult } from '@engine/types'

describe('engine types', () => {
  it('Compound is the union S|M|H', () => {
    expectTypeOf<Compound>().toEqualTypeOf<'S' | 'M' | 'H'>()
  })
  it('PaceMode is push|neutral|conserve', () => {
    expectTypeOf<PaceMode>().toEqualTypeOf<'push' | 'neutral' | 'conserve'>()
  })
  it('RaceState has lap and cars fields', () => {
    expectTypeOf<RaceState>().toHaveProperty('lap')
    expectTypeOf<RaceState>().toHaveProperty('cars')
  })
  it('CarState has position, raceTime, tyreAge', () => {
    expectTypeOf<CarState>().toHaveProperty('position')
    expectTypeOf<CarState>().toHaveProperty('raceTime')
    expectTypeOf<CarState>().toHaveProperty('tyreAge')
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
npx vitest run tests/engine/types.test.ts
```

Expected: FAIL — types not found.

- [ ] **Step 3: Implement `src/engine/types.ts`**

```typescript
export type Compound = 'S' | 'M' | 'H'
export type PaceMode = 'push' | 'neutral' | 'conserve'
export type SectorIndex = 0 | 1 | 2

export interface CompoundSpec {
  name: string
  offset: number   // pace vs medium baseline (s)
  lin: number      // linear deg per lap
  cliff: number    // lap age when cliff begins
  pen: number      // squared post-cliff penalty coefficient
  colorToken: string
}

export interface TuningConstants {
  carPerformance: { deltaPerRating: number; sectorSplit: [number, number, number] }
  driverPerformance: { deltaPerSkill: number; sectorSplit: [number, number, number] }
  fuel: { effectPerLap: number }
  noise: { sigmaPerSector: number }
  trackEvolution: { startDelta: number; decayLaps: number }
  traffic: { gapThreshold: number; penalty: number }
  overtaking: { base: number; paceMultiplier: number; sectorFactor: [number, number, number] }
  pit: { laneTimeLoss: number; stopMean: number; stopSigma: number }
  paceModes: Record<PaceMode, { paceDelta: number; degMultiplier: number }>
  projection: { horizonLaps: number; useOvertakeRolls: boolean }
  incidents: { dnfPerLap: number; driverErrorPerLap: number }
}

export interface CircuitSpec {
  name: string
  laps: number
  sectorBase: [number, number, number]
  carSensitivity: [number, number, number]
  driverSensitivity: [number, number, number]
  overtakingFactor: [number, number, number]
  pitLaneTimeLoss: number
}

export interface DriverSpec {
  id: string; name: string; code: string; teamId: string
  skill: number; racecraft: number; consistency: number
}

export interface TeamSpec {
  id: string; name: string; rating: number; reliability: number
  colorPrimary: string; colorSecondary: string
}

export interface PitStop {
  lap: number
  compound: Compound
}

export interface StrategyPlan {
  teamId: string
  startCompound: Compound
  plannedStops: PitStop[]
}

// Per-car live state during a race
export interface CarState {
  driverId: string
  teamId: string
  position: number        // 1-indexed race position
  raceTime: number        // cumulative race time in seconds
  lap: number             // completed laps
  sector: SectorIndex     // current sector (0, 1, or 2)
  compound: Compound
  tyreAge: number         // laps on current tyre (incremented after each full lap)
  paceMode: PaceMode
  pitted: boolean         // currently in pit lane this sector
  pitsDone: number        // number of pit stops completed
  strategy: StrategyPlan
  isPlayer: boolean
}

export interface SectorResult {
  driverId: string
  sectorTime: number     // time taken for this sector
  tyreContribution: number
  trafficPenalty: number
  noiseSample: number
}

export interface OvertakeEvent {
  lap: number
  sector: SectorIndex
  overtakerId: string
  overtakenId: string
}

export interface RaceState {
  lap: number              // current lap (0-indexed during race)
  sector: SectorIndex      // 0, 1, or 2
  totalLaps: number
  cars: CarState[]         // ordered by position
  sectorResults: SectorResult[]
  overtakeEvents: OvertakeEvent[]
  trackEvolutionLaps: number  // laps completed for track evolution calc
  rngState: number         // current RNG seed state for snapshot/resume
}

export interface RaceConfig {
  circuit: CircuitSpec
  tuning: TuningConstants
  compounds: Record<Compound, CompoundSpec>
  drivers: DriverSpec[]
  teams: TeamSpec[]
  strategies: StrategyPlan[]
  playerDriverId: string
  seed: number
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/engine/types.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts tests/engine/types.test.ts
git commit -m "feat(engine): domain types — RaceState, CarState, CompoundSpec, TuningConstants"
```

---

## Task 4: Seeded RNG

**Files:**
- Create: `src/engine/rng.ts`
- Test: `tests/engine/rng.test.ts`

**Interfaces:**
- Produces:
  - `type Rng = () => number` — returns a float in [0, 1)
  - `createRng(seed: number): Rng` — mulberry32 seeded PRNG
  - `gaussianPair(rng: Rng): [number, number]` — Box-Muller pair of N(0,1) samples

- [ ] **Step 1: Write failing tests**

Create `tests/engine/rng.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createRng, gaussianPair } from '@engine/rng'

describe('createRng (mulberry32)', () => {
  it('returns values in [0, 1)', () => {
    const rng = createRng(42)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('same seed produces identical sequence', () => {
    const a = createRng(99)
    const b = createRng(99)
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b())
    }
  })

  it('different seeds produce different sequences', () => {
    const a = createRng(1)
    const b = createRng(2)
    const va = Array.from({ length: 10 }, () => a())
    const vb = Array.from({ length: 10 }, () => b())
    expect(va).not.toEqual(vb)
  })

  it('is not Math.random (different values)', () => {
    const rng = createRng(12345)
    expect(rng()).not.toBe(Math.random())
  })
})

describe('gaussianPair', () => {
  it('returns two numbers', () => {
    const rng = createRng(1)
    const [a, b] = gaussianPair(rng)
    expect(typeof a).toBe('number')
    expect(typeof b).toBe('number')
  })

  it('approximate N(0,1) over 2000 samples (mean ≈ 0, std ≈ 1)', () => {
    const rng = createRng(7)
    const samples: number[] = []
    for (let i = 0; i < 1000; i++) {
      const [a, b] = gaussianPair(rng)
      samples.push(a, b)
    }
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length
    expect(Math.abs(mean)).toBeLessThan(0.1)
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.1)
  })
})
```

- [ ] **Step 2: Run failing tests**

```bash
npx vitest run tests/engine/rng.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/engine/rng.ts`**

```typescript
export type Rng = () => number

// mulberry32 — fast, seedable, good distribution
export function createRng(seed: number): Rng {
  let s = seed >>> 0
  return function () {
    s += 0x6D2B79F5
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Box-Muller transform: two independent N(0,1) samples per call
export function gaussianPair(rng: Rng): [number, number] {
  const u1 = Math.max(rng(), 1e-10)  // avoid log(0)
  const u2 = rng()
  const mag = Math.sqrt(-2 * Math.log(u1))
  const theta = 2 * Math.PI * u2
  return [mag * Math.cos(theta), mag * Math.sin(theta)]
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/engine/rng.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/rng.ts tests/engine/rng.test.ts
git commit -m "feat(engine): mulberry32 seeded RNG + Box-Muller Gaussian"
```

---

## Task 5: Tyre Model

**Files:**
- Create: `src/engine/tyres.ts`
- Test: `tests/engine/tyres.test.ts`

**Interfaces:**
- Consumes: `CompoundSpec` from `types.ts`
- Produces:
  - `tyreDelta(spec: CompoundSpec, ageLaps: number): number` — seconds of pace impact at given tyre age (positive = slower vs medium baseline; soft fresh = negative = faster)
  - `tyreCliffFraction(spec: CompoundSpec, ageLaps: number): number` — 0.0 (fresh) → 1.0+ (past cliff) for UI gauge

- [ ] **Step 1: Write failing tests**

Create `tests/engine/tyres.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { tyreDelta, tyreCliffFraction } from '@engine/tyres'
import type { CompoundSpec } from '@engine/types'

const soft: CompoundSpec = { name: 'Soft', offset: -0.6, lin: 0.040, cliff: 12, pen: 0.030, colorToken: '--tyre-soft' }
const medium: CompoundSpec = { name: 'Medium', offset: 0.0, lin: 0.025, cliff: 22, pen: 0.020, colorToken: '--tyre-medium' }
const hard: CompoundSpec = { name: 'Hard', offset: 0.5, lin: 0.015, cliff: 35, pen: 0.012, colorToken: '--tyre-hard' }

describe('tyreDelta', () => {
  it('fresh soft is faster than fresh medium (negative delta)', () => {
    expect(tyreDelta(soft, 0)).toBeLessThan(tyreDelta(medium, 0))
  })

  it('fresh hard is slower than fresh medium (positive delta)', () => {
    expect(tyreDelta(hard, 0)).toBeGreaterThan(tyreDelta(medium, 0))
  })

  it('increases linearly before cliff', () => {
    const d5 = tyreDelta(soft, 5)
    const d10 = tyreDelta(soft, 10)
    const gap = d10 - d5
    // should be roughly 5 * lin
    expect(gap).toBeCloseTo(5 * soft.lin, 3)
  })

  it('soft past cliff (age 20) is worse than at age 12', () => {
    expect(tyreDelta(soft, 20)).toBeGreaterThan(tyreDelta(soft, 12))
  })

  it('cliff penalty grows quadratically after cliff', () => {
    const atCliff = tyreDelta(soft, soft.cliff)
    const twoLapsOver = tyreDelta(soft, soft.cliff + 2)
    const fourLapsOver = tyreDelta(soft, soft.cliff + 4)
    const gap2 = twoLapsOver - atCliff
    const gap4 = fourLapsOver - atCliff
    // quadratic: gap4 ≈ 4 * gap2 (within rounding)
    expect(gap4).toBeCloseTo(4 * gap2, 1)
  })
})

describe('tyreCliffFraction', () => {
  it('returns 0 for age 0', () => {
    expect(tyreCliffFraction(soft, 0)).toBe(0)
  })

  it('returns 1.0 at cliff lap', () => {
    expect(tyreCliffFraction(soft, soft.cliff)).toBeCloseTo(1.0, 5)
  })

  it('returns > 1 past cliff', () => {
    expect(tyreCliffFraction(soft, soft.cliff + 5)).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run failing tests**

```bash
npx vitest run tests/engine/tyres.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/engine/tyres.ts`**

```typescript
import type { CompoundSpec } from './types'

// Formula: offset + lin*age + pen * max(0, age - cliff)^2
export function tyreDelta(spec: CompoundSpec, ageLaps: number): number {
  const postCliff = Math.max(0, ageLaps - spec.cliff)
  return spec.offset + spec.lin * ageLaps + spec.pen * postCliff * postCliff
}

// 0 = fresh, 1 = at cliff, >1 = past cliff
export function tyreCliffFraction(spec: CompoundSpec, ageLaps: number): number {
  return spec.cliff > 0 ? ageLaps / spec.cliff : 0
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/engine/tyres.test.ts
```

Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/tyres.ts tests/engine/tyres.test.ts
git commit -m "feat(engine): tyre degradation model with cliff penalty"
```

---

## Task 6: Lap Model (Layer 1 — Sector Time)

**Files:**
- Create: `src/engine/lapModel.ts`
- Test: `tests/engine/lapModel.test.ts`

**Interfaces:**
- Consumes: `RaceConfig`, `CarState`, `SectorIndex`, `Rng` from prior tasks
- Produces:
  - `computeSectorTime(config: RaceConfig, car: CarState, sector: SectorIndex, rng: Rng): SectorResult`

- [ ] **Step 1: Write failing tests**

Create `tests/engine/lapModel.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeSectorTime } from '@engine/lapModel'
import { createRng } from '@engine/rng'
import type { RaceConfig, CarState, TuningConstants, CircuitSpec, CompoundSpec } from '@engine/types'

const TUNING: TuningConstants = {
  carPerformance: { deltaPerRating: 0.22, sectorSplit: [0.30, 0.45, 0.25] },
  driverPerformance: { deltaPerSkill: 0.10, sectorSplit: [0.30, 0.40, 0.30] },
  fuel: { effectPerLap: 0.035 },
  noise: { sigmaPerSector: 0.08 },
  trackEvolution: { startDelta: 0.30, decayLaps: 20 },
  traffic: { gapThreshold: 2.2, penalty: 0.30 },
  overtaking: { base: 0.22, paceMultiplier: 3.0, sectorFactor: [1.0, 0.25, 0.55] },
  pit: { laneTimeLoss: 22.0, stopMean: 2.4, stopSigma: 0.3 },
  paceModes: {
    push:     { paceDelta: -0.15, degMultiplier: 1.30 },
    neutral:  { paceDelta:  0.00, degMultiplier: 1.00 },
    conserve: { paceDelta:  0.20, degMultiplier: 0.75 },
  },
  projection: { horizonLaps: 4, useOvertakeRolls: false },
  incidents: { dnfPerLap: 0.0, driverErrorPerLap: 0.0 },
}

const CIRCUIT: CircuitSpec = {
  name: 'Test', laps: 30,
  sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25],
  driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55],
  pitLaneTimeLoss: 22.0,
}

const COMPOUNDS: Record<'S'|'M'|'H', CompoundSpec> = {
  S: { name: 'Soft',   offset: -0.6, lin: 0.040, cliff: 12, pen: 0.030, colorToken: '--tyre-soft' },
  M: { name: 'Medium', offset:  0.0, lin: 0.025, cliff: 22, pen: 0.020, colorToken: '--tyre-medium' },
  H: { name: 'Hard',   offset:  0.5, lin: 0.015, cliff: 35, pen: 0.012, colorToken: '--tyre-hard' },
}

function makeConfig(overrides: Partial<RaceConfig> = {}): RaceConfig {
  return {
    circuit: CIRCUIT, tuning: TUNING, compounds: COMPOUNDS,
    drivers: [{ id: 'd1', name: 'Test', code: 'TST', teamId: 't1', skill: 5, racecraft: 0.8, consistency: 0.9 }],
    teams: [{ id: 't1', name: 'Team', rating: 4, reliability: 0.99, colorPrimary: '#fff', colorSecondary: '#000' }],
    strategies: [{ teamId: 't1', startCompound: 'M', plannedStops: [] }],
    playerDriverId: 'd1',
    seed: 42,
    ...overrides,
  }
}

function makeCar(overrides: Partial<CarState> = {}): CarState {
  return {
    driverId: 'd1', teamId: 't1', position: 1, raceTime: 0,
    lap: 0, sector: 0, compound: 'M', tyreAge: 0,
    paceMode: 'neutral', pitted: false, pitsDone: 0,
    strategy: { teamId: 't1', startCompound: 'M', plannedStops: [] },
    isPlayer: false,
    ...overrides,
  }
}

describe('computeSectorTime', () => {
  it('returns a positive sector time close to sectorBase', () => {
    const rng = createRng(1)
    const result = computeSectorTime(makeConfig(), makeCar(), 0, rng)
    expect(result.sectorTime).toBeGreaterThan(20)
    expect(result.sectorTime).toBeLessThan(45)
  })

  it('better car (lower rating) is faster', () => {
    const config = makeConfig({
      teams: [
        { id: 't1', name: 'Fast', rating: 0, reliability: 0.99, colorPrimary: '#fff', colorSecondary: '#000' },
        { id: 't2', name: 'Slow', rating: 9, reliability: 0.99, colorPrimary: '#fff', colorSecondary: '#000' },
      ],
      drivers: [
        { id: 'd1', name: 'D1', code: 'D1X', teamId: 't1', skill: 5, racecraft: 0.8, consistency: 0.9 },
        { id: 'd2', name: 'D2', code: 'D2X', teamId: 't2', skill: 5, racecraft: 0.8, consistency: 0.9 },
      ],
    })
    const rng1 = createRng(42)
    const rng2 = createRng(42)
    const fast = computeSectorTime(config, makeCar({ driverId: 'd1', teamId: 't1' }), 0, rng1)
    const slow = computeSectorTime(config, makeCar({ driverId: 'd2', teamId: 't2' }), 0, rng2)
    expect(fast.sectorTime).toBeLessThan(slow.sectorTime)
  })

  it('push mode produces faster sector than conserve', () => {
    const rng1 = createRng(7)
    const rng2 = createRng(7)
    const pushing   = computeSectorTime(makeConfig(), makeCar({ paceMode: 'push' }), 0, rng1)
    const conserving = computeSectorTime(makeConfig(), makeCar({ paceMode: 'conserve' }), 0, rng2)
    expect(pushing.sectorTime).toBeLessThan(conserving.sectorTime)
  })

  it('same seed + same inputs = identical result (determinism)', () => {
    const a = computeSectorTime(makeConfig(), makeCar(), 1, createRng(100))
    const b = computeSectorTime(makeConfig(), makeCar(), 1, createRng(100))
    expect(a.sectorTime).toBe(b.sectorTime)
  })

  it('fuel load reduces pace (higher raceTime = more fuel burned = faster)', () => {
    const rng1 = createRng(5)
    const rng2 = createRng(5)
    const heavy = computeSectorTime(makeConfig(), makeCar({ raceTime: 0, lap: 0 }), 0, rng1)
    const light  = computeSectorTime(makeConfig(), makeCar({ raceTime: 2700, lap: 30 }), 0, rng2)
    // 30 laps of fuel burned = 30 * 0.035 = 1.05s/lap faster → noticeable even in one sector
    expect(light.sectorTime).toBeLessThan(heavy.sectorTime)
  })
})
```

- [ ] **Step 2: Run failing tests**

```bash
npx vitest run tests/engine/lapModel.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/engine/lapModel.ts`**

```typescript
import type { RaceConfig, CarState, SectorIndex, SectorResult } from './types'
import type { Rng } from './rng'
import { gaussianPair } from './rng'
import { tyreDelta } from './tyres'

export function computeSectorTime(
  config: RaceConfig,
  car: CarState,
  sector: SectorIndex,
  rng: Rng,
): SectorResult {
  const { tuning, circuit, compounds } = config
  const base = circuit.sectorBase[sector]!

  // Find driver and team
  const driver = config.drivers.find(d => d.id === car.driverId)!
  const team = config.teams.find(t => t.id === car.teamId)!

  // Car performance delta (per rating × sector sensitivity)
  const carDeltaPerLap = team.rating * tuning.carPerformance.deltaPerRating
  const carSplit = circuit.carSensitivity[sector]!
  const carDelta = carDeltaPerLap * carSplit * 3  // sector is 1/3 of a lap

  // Driver performance delta
  const driverDeltaPerLap = driver.skill * tuning.driverPerformance.deltaPerSkill
  const driverSplit = circuit.driverSensitivity[sector]!
  const driverDelta = driverDeltaPerLap * driverSplit * 3

  // Tyre delta (per-lap value, prorated to 1/3 lap)
  const compoundSpec = compounds[car.compound]!
  const tyrePerLap = tyreDelta(compoundSpec, car.tyreAge)
  const tyreSectorDelta = (tyrePerLap / 3) * tuning.paceModes[car.paceMode].degMultiplier

  // Fuel delta (lighter car = faster; each lap burned removes 1 unit of weight effect)
  const fuelDelta = -(car.lap * tuning.fuel.effectPerLap) / 3

  // Track evolution delta (fades over decayLaps)
  const trackFraction = Math.max(0, 1 - car.lap / tuning.trackEvolution.decayLaps)
  const trackDelta = (tuning.trackEvolution.startDelta * trackFraction) / 3

  // Pace mode delta
  const modeDelta = tuning.paceModes[car.paceMode].paceDelta / 3

  // Gaussian noise
  const [noise] = gaussianPair(rng)
  const noiseSample = noise * tuning.noise.sigmaPerSector

  const sectorTime = base + carDelta + driverDelta + tyreSectorDelta + fuelDelta + trackDelta + modeDelta + noiseSample

  return {
    driverId: car.driverId,
    sectorTime: Math.max(sectorTime, base * 0.85), // floor at 85% of base — no teleporting
    tyreContribution: tyreSectorDelta,
    trafficPenalty: 0, // traffic applied in race.ts at boundary
    noiseSample,
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/engine/lapModel.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/lapModel.ts tests/engine/lapModel.test.ts
git commit -m "feat(engine): Layer 1 sector-time model — car/driver/tyre/fuel/noise"
```

---

## Task 7: Race Loop (Layer 2)

**Files:**
- Create: `src/engine/race.ts`
- Test: `tests/engine/race.test.ts`

**Interfaces:**
- Consumes: `RaceConfig`, `RaceState`, all prior engine modules
- Produces:
  - `initRace(config: RaceConfig): RaceState` — build initial race state from config
  - `stepSector(config: RaceConfig, state: RaceState, rng: Rng): RaceState` — advance one sector, pure function

- [ ] **Step 1: Write failing tests**

Create `tests/engine/race.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import type { RaceConfig, TuningConstants, CircuitSpec, CompoundSpec } from '@engine/types'

const TUNING: TuningConstants = {
  carPerformance: { deltaPerRating: 0.22, sectorSplit: [0.30, 0.45, 0.25] },
  driverPerformance: { deltaPerSkill: 0.10, sectorSplit: [0.30, 0.40, 0.30] },
  fuel: { effectPerLap: 0.035 },
  noise: { sigmaPerSector: 0.08 },
  trackEvolution: { startDelta: 0.30, decayLaps: 20 },
  traffic: { gapThreshold: 2.2, penalty: 0.30 },
  overtaking: { base: 0.22, paceMultiplier: 3.0, sectorFactor: [1.0, 0.25, 0.55] },
  pit: { laneTimeLoss: 22.0, stopMean: 2.4, stopSigma: 0.3 },
  paceModes: {
    push:     { paceDelta: -0.15, degMultiplier: 1.30 },
    neutral:  { paceDelta:  0.00, degMultiplier: 1.00 },
    conserve: { paceDelta:  0.20, degMultiplier: 0.75 },
  },
  projection: { horizonLaps: 4, useOvertakeRolls: false },
  incidents: { dnfPerLap: 0.0, driverErrorPerLap: 0.0 },
}

const CIRCUIT: CircuitSpec = {
  name: 'Test', laps: 10,
  sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25],
  driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55],
  pitLaneTimeLoss: 22.0,
}

const COMPOUNDS: Record<'S'|'M'|'H', CompoundSpec> = {
  S: { name: 'Soft',   offset: -0.6, lin: 0.040, cliff: 12, pen: 0.030, colorToken: '--tyre-soft' },
  M: { name: 'Medium', offset:  0.0, lin: 0.025, cliff: 22, pen: 0.020, colorToken: '--tyre-medium' },
  H: { name: 'Hard',   offset:  0.5, lin: 0.015, cliff: 35, pen: 0.012, colorToken: '--tyre-hard' },
}

function makeConfig(): RaceConfig {
  return {
    circuit: CIRCUIT, tuning: TUNING, compounds: COMPOUNDS,
    drivers: [
      { id: 'd1', name: 'Fast', code: 'FST', teamId: 'apex',    skill: 1, racecraft: 0.95, consistency: 0.95 },
      { id: 'd2', name: 'Mid',  code: 'MID', teamId: 'mid',     skill: 5, racecraft: 0.80, consistency: 0.88 },
      { id: 'd3', name: 'Slow', code: 'SLW', teamId: 'back',    skill: 9, racecraft: 0.70, consistency: 0.80 },
    ],
    teams: [
      { id: 'apex', name: 'Apex', rating: 0, reliability: 0.99, colorPrimary: '#0ef', colorSecondary: '#000' },
      { id: 'mid',  name: 'Mid',  rating: 4, reliability: 0.98, colorPrimary: '#f00', colorSecondary: '#fff' },
      { id: 'back', name: 'Back', rating: 8, reliability: 0.97, colorPrimary: '#ff0', colorSecondary: '#000' },
    ],
    strategies: [
      { teamId: 'apex', startCompound: 'M', plannedStops: [{ lap: 5, compound: 'H' }] },
      { teamId: 'mid',  startCompound: 'M', plannedStops: [{ lap: 5, compound: 'H' }] },
      { teamId: 'back', startCompound: 'S', plannedStops: [{ lap: 4, compound: 'H' }] },
    ],
    playerDriverId: 'd1',
    seed: 42,
  }
}

describe('initRace', () => {
  it('creates one CarState per driver', () => {
    const state = initRace(makeConfig())
    expect(state.cars).toHaveLength(3)
  })

  it('starts at lap 0, sector 0', () => {
    const state = initRace(makeConfig())
    expect(state.lap).toBe(0)
    expect(state.sector).toBe(0)
  })

  it('assigns starting compounds from strategy', () => {
    const state = initRace(makeConfig())
    const d3Car = state.cars.find(c => c.driverId === 'd3')!
    expect(d3Car.compound).toBe('S')
  })
})

describe('stepSector', () => {
  it('advances sector by 1', () => {
    const config = makeConfig()
    const s0 = initRace(config)
    const s1 = stepSector(config, s0, createRng(1))
    expect(s1.sector).toBe(1)
  })

  it('advances lap after 3 sectors', () => {
    const config = makeConfig()
    let state = initRace(config)
    const rng = createRng(1)
    state = stepSector(config, state, rng)
    state = stepSector(config, state, rng)
    state = stepSector(config, state, rng)
    expect(state.lap).toBe(1)
    expect(state.sector).toBe(0)
  })

  it('does not mutate the previous state (pure function)', () => {
    const config = makeConfig()
    const s0 = initRace(config)
    const s0Lap = s0.lap
    stepSector(config, s0, createRng(1))
    expect(s0.lap).toBe(s0Lap)
  })

  it('is deterministic: same seed same result', () => {
    const config = makeConfig()
    const s0 = initRace(config)
    const a = stepSector(config, s0, createRng(77))
    const b = stepSector(config, s0, createRng(77))
    expect(a.cars[0]!.raceTime).toBe(b.cars[0]!.raceTime)
  })

  it('best car is leading after 10 laps', () => {
    const config = makeConfig()
    let state = initRace(config)
    const rng = createRng(42)
    for (let i = 0; i < 30; i++) state = stepSector(config, state, rng)
    const leader = state.cars[0]!
    expect(leader.driverId).toBe('d1')
  })

  it('tyreAge increments after each completed lap', () => {
    const config = makeConfig()
    let state = initRace(config)
    const rng = createRng(1)
    for (let i = 0; i < 3; i++) state = stepSector(config, state, rng)
    expect(state.cars[0]!.tyreAge).toBe(1)
  })

  it('triggers AI pit stop on planned lap', () => {
    const config = makeConfig()
    let state = initRace(config)
    const rng = createRng(42)
    // advance to lap 5 sector 2 (just before lap 5 is completed)
    for (let i = 0; i < 5 * 3; i++) state = stepSector(config, state, rng)
    // after lap 5 completes the back car (d3, planned stop lap 4) should have pitted
    const d3Car = state.cars.find(c => c.driverId === 'd3')!
    expect(d3Car.pitsDone).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run failing tests**

```bash
npx vitest run tests/engine/race.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/engine/race.ts`**

```typescript
import type { RaceConfig, RaceState, CarState, SectorIndex, OvertakeEvent } from './types'
import type { Rng } from './rng'
import { gaussianPair } from './rng'
import { computeSectorTime } from './lapModel'

export function initRace(config: RaceConfig): RaceState {
  const cars: CarState[] = config.drivers.map((driver, i) => {
    const strategy = config.strategies.find(s => s.teamId === driver.teamId) ?? {
      teamId: driver.teamId, startCompound: 'M' as const, plannedStops: [],
    }
    return {
      driverId: driver.id,
      teamId: driver.teamId,
      position: i + 1,
      raceTime: 0,
      lap: 0,
      sector: 0,
      compound: strategy.startCompound,
      tyreAge: 0,
      paceMode: 'neutral',
      pitted: false,
      pitsDone: 0,
      strategy,
      isPlayer: driver.id === config.playerDriverId,
    }
  })

  return {
    lap: 0,
    sector: 0,
    totalLaps: config.circuit.laps,
    cars,
    sectorResults: [],
    overtakeEvents: [],
    trackEvolutionLaps: 0,
    rngState: config.seed,
  }
}

export function stepSector(config: RaceConfig, state: RaceState, rng: Rng): RaceState {
  const sector = state.sector as SectorIndex
  const newSectorResults = [...state.sectorResults]
  const newOvertakeEvents: OvertakeEvent[] = [...state.overtakeEvents]

  // 1. Compute sector time for each car
  const updatedCars: CarState[] = state.cars.map(car => {
    const result = computeSectorTime(config, car, sector, rng)
    newSectorResults.push(result)
    return { ...car, raceTime: car.raceTime + result.sectorTime }
  })

  // 2. Apply traffic penalty: car stuck behind another within gapThreshold
  const sorted = [...updatedCars].sort((a, b) => a.raceTime - b.raceTime)
  const penalisedCars = sorted.map((car, idx) => {
    if (idx === 0) return car
    const ahead = sorted[idx - 1]!
    const gap = car.raceTime - ahead.raceTime
    if (gap <= config.tuning.traffic.gapThreshold) {
      return { ...car, raceTime: car.raceTime + config.tuning.traffic.penalty / 3 }
    }
    return car
  })

  // 3. Sector-boundary overtake checks (probabilistic, only at boundaries)
  const afterOvertakes = resolveOvertakes(config, penalisedCars, sector, state.lap, rng, newOvertakeEvents)

  // 4. Advance sector / lap counters; handle pit stops; increment tyre age
  const nextSector = ((sector + 1) % 3) as SectorIndex
  const lapCompleted = sector === 2
  const nextLap = lapCompleted ? state.lap + 1 : state.lap

  const finalCars: CarState[] = afterOvertakes.map(car => {
    let updated = { ...car }
    if (lapCompleted) {
      updated.tyreAge += 1
      updated.lap += 1
      // AI strategy: pit if this is the planned stop lap
      const plannedStop = car.strategy.plannedStops.find(s => s.lap === updated.lap)
      if (plannedStop && !car.isPlayer) {
        const [stopNoise] = gaussianPair(rng)
        const stopTime = config.tuning.pit.laneTimeLoss + config.tuning.pit.stopMean + stopNoise * config.tuning.pit.stopSigma
        updated = {
          ...updated,
          raceTime: updated.raceTime + stopTime,
          compound: plannedStop.compound,
          tyreAge: 0,
          pitsDone: updated.pitsDone + 1,
        }
      }
    }
    return updated
  })

  // Re-sort and assign positions
  const resorted = [...finalCars].sort((a, b) => a.raceTime - b.raceTime)
  const positioned = resorted.map((car, idx) => ({ ...car, position: idx + 1 }))

  return {
    ...state,
    lap: nextLap,
    sector: nextSector,
    trackEvolutionLaps: lapCompleted ? state.trackEvolutionLaps + 1 : state.trackEvolutionLaps,
    cars: positioned,
    sectorResults: newSectorResults,
    overtakeEvents: newOvertakeEvents,
  }
}

function resolveOvertakes(
  config: RaceConfig,
  cars: CarState[],
  sector: SectorIndex,
  lap: number,
  rng: Rng,
  events: OvertakeEvent[],
): CarState[] {
  // Sorted by raceTime (fastest first = leader)
  const sorted = [...cars].sort((a, b) => a.raceTime - b.raceTime)
  const result = [...sorted]

  for (let i = 1; i < result.length; i++) {
    const behind = result[i]!
    const ahead = result[i - 1]!
    const gap = behind.raceTime - ahead.raceTime
    if (gap > config.tuning.traffic.gapThreshold) continue

    // Pace advantage: how many seconds/lap the behind car would be faster
    const paceAdv = calculatePaceAdvantage(config, behind, ahead)
    const sectorEase = config.tuning.overtaking.sectorFactor[sector]!
    const prob = Math.min(
      0.85,
      config.tuning.overtaking.base * sectorEase +
      paceAdv * config.tuning.overtaking.paceMultiplier * sectorEase,
    )

    const [roll] = gaussianPair(rng) // consume RNG — use uniform [0,1] via separate call
    const uniform = rng()
    if (uniform < prob) {
      // Swap positions in the result array
      result[i - 1] = behind
      result[i] = ahead
      events.push({ lap, sector, overtakerId: behind.driverId, overtakenId: ahead.driverId })
    }
  }

  return result
}

function calculatePaceAdvantage(config: RaceConfig, faster: CarState, slower: CarState): number {
  const fasterTeam = config.teams.find(t => t.id === faster.teamId)!
  const slowerTeam = config.teams.find(t => t.id === slower.teamId)!
  const carAdv = (slowerTeam.rating - fasterTeam.rating) * config.tuning.carPerformance.deltaPerRating
  const fasterDriver = config.drivers.find(d => d.id === faster.driverId)!
  const slowerDriver = config.drivers.find(d => d.id === slower.driverId)!
  const driverAdv = (slowerDriver.skill - fasterDriver.skill) * config.tuning.driverPerformance.deltaPerSkill
  return Math.max(0, carAdv + driverAdv)
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/engine/race.test.ts
```

Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/race.ts tests/engine/race.test.ts
git commit -m "feat(engine): Layer 2 race loop — stepSector, overtaking, pit stops, traffic"
```

---

## Task 8: Projection Engine (Layer 3)

**Files:**
- Create: `src/engine/projection.ts`
- Test: `tests/engine/projection.test.ts`

**Interfaces:**
- Consumes: `RaceConfig`, `RaceState`, `stepSector`, `createRng`
- Produces:
  - `projectPitNow(config: RaceConfig, state: RaceState, newCompound: Compound, seed: number): ProjectionResult`
  - `ProjectionResult` type: `{ rejoinPosition: number; rejoinGap: number; driverAheadId: string | null; lapsProjected: number }`

- [ ] **Step 1: Write failing tests**

Create `tests/engine/projection.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { projectPitNow } from '@engine/projection'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import type { RaceConfig, TuningConstants, CircuitSpec, CompoundSpec } from '@engine/types'

const TUNING: TuningConstants = {
  carPerformance: { deltaPerRating: 0.22, sectorSplit: [0.30, 0.45, 0.25] },
  driverPerformance: { deltaPerSkill: 0.10, sectorSplit: [0.30, 0.40, 0.30] },
  fuel: { effectPerLap: 0.035 },
  noise: { sigmaPerSector: 0.08 },
  trackEvolution: { startDelta: 0.30, decayLaps: 20 },
  traffic: { gapThreshold: 2.2, penalty: 0.30 },
  overtaking: { base: 0.22, paceMultiplier: 3.0, sectorFactor: [1.0, 0.25, 0.55] },
  pit: { laneTimeLoss: 22.0, stopMean: 2.4, stopSigma: 0.3 },
  paceModes: {
    push:     { paceDelta: -0.15, degMultiplier: 1.30 },
    neutral:  { paceDelta:  0.00, degMultiplier: 1.00 },
    conserve: { paceDelta:  0.20, degMultiplier: 0.75 },
  },
  projection: { horizonLaps: 4, useOvertakeRolls: false },
  incidents: { dnfPerLap: 0.0, driverErrorPerLap: 0.0 },
}

const CIRCUIT: CircuitSpec = {
  name: 'Proj', laps: 20, sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25], driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55], pitLaneTimeLoss: 22.0,
}

const COMPOUNDS: Record<'S'|'M'|'H', CompoundSpec> = {
  S: { name: 'Soft',   offset: -0.6, lin: 0.040, cliff: 12, pen: 0.030, colorToken: '--tyre-soft' },
  M: { name: 'Medium', offset:  0.0, lin: 0.025, cliff: 22, pen: 0.020, colorToken: '--tyre-medium' },
  H: { name: 'Hard',   offset:  0.5, lin: 0.015, cliff: 35, pen: 0.012, colorToken: '--tyre-hard' },
}

function makeConfig(): RaceConfig {
  return {
    circuit: CIRCUIT, tuning: TUNING, compounds: COMPOUNDS,
    drivers: [
      { id: 'player', name: 'Player', code: 'PLR', teamId: 'apex', skill: 2, racecraft: 0.9, consistency: 0.95 },
      { id: 'rival1', name: 'Rival1', code: 'RV1', teamId: 'mid',  skill: 4, racecraft: 0.8, consistency: 0.88 },
    ],
    teams: [
      { id: 'apex', name: 'Apex', rating: 0, reliability: 0.99, colorPrimary: '#0ef', colorSecondary: '#000' },
      { id: 'mid',  name: 'Mid',  rating: 3, reliability: 0.98, colorPrimary: '#f00', colorSecondary: '#fff' },
    ],
    strategies: [
      { teamId: 'apex', startCompound: 'M', plannedStops: [{ lap: 10, compound: 'H' }] },
      { teamId: 'mid',  startCompound: 'M', plannedStops: [{ lap: 10, compound: 'H' }] },
    ],
    playerDriverId: 'player',
    seed: 1,
  }
}

describe('projectPitNow', () => {
  it('returns a valid position between 1 and grid size', () => {
    const config = makeConfig()
    let state = initRace(config)
    const rng = createRng(1)
    for (let i = 0; i < 15; i++) state = stepSector(config, state, rng)
    const result = projectPitNow(config, state, 'H', 999)
    expect(result.rejoinPosition).toBeGreaterThanOrEqual(1)
    expect(result.rejoinPosition).toBeLessThanOrEqual(config.drivers.length)
  })

  it('does not mutate the live race state', () => {
    const config = makeConfig()
    let state = initRace(config)
    const rng = createRng(1)
    for (let i = 0; i < 12; i++) state = stepSector(config, state, rng)
    const playerBefore = state.cars.find(c => c.driverId === 'player')!.raceTime
    projectPitNow(config, state, 'H', 777)
    expect(state.cars.find(c => c.driverId === 'player')!.raceTime).toBe(playerBefore)
  })

  it('returns lapsProjected equal to projection.horizonLaps', () => {
    const config = makeConfig()
    let state = initRace(config)
    const rng = createRng(1)
    for (let i = 0; i < 9; i++) state = stepSector(config, state, rng)
    const result = projectPitNow(config, state, 'H', 42)
    expect(result.lapsProjected).toBe(config.tuning.projection.horizonLaps)
  })
})
```

- [ ] **Step 2: Run failing tests**

```bash
npx vitest run tests/engine/projection.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/engine/projection.ts`**

```typescript
import type { RaceConfig, RaceState, Compound } from './types'
import { createRng } from './rng'
import { stepSector } from './race'

export interface ProjectionResult {
  rejoinPosition: number
  rejoinGap: number         // seconds behind the car ahead at rejoin
  driverAheadId: string | null
  lapsProjected: number
}

export function projectPitNow(
  config: RaceConfig,
  state: RaceState,
  newCompound: Compound,
  seed: number,
): ProjectionResult {
  const { horizonLaps, useOvertakeRolls } = config.tuning.projection
  const playerDriverId = config.playerDriverId

  // Deep-clone state to avoid mutating live race
  let projState: RaceState = JSON.parse(JSON.stringify(state)) as RaceState

  // Apply pit stop to player car in the clone
  const pitConfig = config.tuning.pit
  const rngForStop = createRng(seed)
  const stopTime = pitConfig.laneTimeLoss + pitConfig.stopMean + (rngForStop() - 0.5) * 2 * pitConfig.stopSigma

  projState = {
    ...projState,
    cars: projState.cars.map(car => {
      if (car.driverId !== playerDriverId) return car
      return {
        ...car,
        raceTime: car.raceTime + stopTime,
        compound: newCompound,
        tyreAge: 0,
        pitsDone: car.pitsDone + 1,
      }
    }),
  }

  // Fast-forward horizonLaps sectors (3 sectors/lap)
  const projectionConfig = useOvertakeRolls ? config : {
    ...config,
    tuning: { ...config.tuning, overtaking: { ...config.tuning.overtaking, base: 0 } },
  }
  const rng = createRng(seed + 1)
  for (let i = 0; i < horizonLaps * 3; i++) {
    projState = stepSector(projectionConfig, projState, rng)
  }

  // Read player's projected position
  const playerCar = projState.cars.find(c => c.driverId === playerDriverId)!
  const position = playerCar.position

  // Gap to the car directly ahead
  const sortedByPosition = [...projState.cars].sort((a, b) => a.position - b.position)
  const aheadCar = sortedByPosition[position - 2] ?? null // position is 1-indexed
  const rejoinGap = aheadCar ? playerCar.raceTime - aheadCar.raceTime : 0

  return {
    rejoinPosition: position,
    rejoinGap: Math.max(0, rejoinGap),
    driverAheadId: aheadCar?.driverId ?? null,
    lapsProjected: horizonLaps,
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/engine/projection.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/projection.ts tests/engine/projection.test.ts
git commit -m "feat(engine): Layer 3 projection engine — pit-now what-if fast-forward"
```

---

## Task 9: AI Strategy

**Files:**
- Create: `src/engine/strategy.ts`
- Test: `tests/engine/strategy.test.ts`

**Interfaces:**
- Consumes: `RaceConfig`, `CarState`, `RaceState`
- Produces:
  - `shouldAIPit(config: RaceConfig, car: CarState, state: RaceState): { pit: boolean; compound: Compound }` — decision for one AI car

- [ ] **Step 1: Write failing tests**

Create `tests/engine/strategy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { shouldAIPit } from '@engine/strategy'
import type { RaceConfig, CarState, RaceState, TuningConstants, CircuitSpec, CompoundSpec } from '@engine/types'

const TUNING: TuningConstants = {
  carPerformance: { deltaPerRating: 0.22, sectorSplit: [0.30, 0.45, 0.25] },
  driverPerformance: { deltaPerSkill: 0.10, sectorSplit: [0.30, 0.40, 0.30] },
  fuel: { effectPerLap: 0.035 },
  noise: { sigmaPerSector: 0.08 },
  trackEvolution: { startDelta: 0.30, decayLaps: 20 },
  traffic: { gapThreshold: 2.2, penalty: 0.30 },
  overtaking: { base: 0.22, paceMultiplier: 3.0, sectorFactor: [1.0, 0.25, 0.55] },
  pit: { laneTimeLoss: 22.0, stopMean: 2.4, stopSigma: 0.3 },
  paceModes: {
    push:     { paceDelta: -0.15, degMultiplier: 1.30 },
    neutral:  { paceDelta:  0.00, degMultiplier: 1.00 },
    conserve: { paceDelta:  0.20, degMultiplier: 0.75 },
  },
  projection: { horizonLaps: 4, useOvertakeRolls: false },
  incidents: { dnfPerLap: 0.0, driverErrorPerLap: 0.0 },
}

const COMPOUNDS: Record<'S'|'M'|'H', CompoundSpec> = {
  S: { name: 'Soft',   offset: -0.6, lin: 0.040, cliff: 12, pen: 0.030, colorToken: '--tyre-soft' },
  M: { name: 'Medium', offset:  0.0, lin: 0.025, cliff: 22, pen: 0.020, colorToken: '--tyre-medium' },
  H: { name: 'Hard',   offset:  0.5, lin: 0.015, cliff: 35, pen: 0.012, colorToken: '--tyre-hard' },
}

const CIRCUIT: CircuitSpec = {
  name: 'Strat', laps: 30, sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25], driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55], pitLaneTimeLoss: 22.0,
}

function makeConfig(): RaceConfig {
  return {
    circuit: CIRCUIT, tuning: TUNING, compounds: COMPOUNDS,
    drivers: [{ id: 'd1', name: 'D1', code: 'DRV', teamId: 't1', skill: 3, racecraft: 0.85, consistency: 0.9 }],
    teams: [{ id: 't1', name: 'Team', rating: 2, reliability: 0.99, colorPrimary: '#fff', colorSecondary: '#000' }],
    strategies: [{ teamId: 't1', startCompound: 'S', plannedStops: [{ lap: 12, compound: 'H' }] }],
    playerDriverId: 'other',
    seed: 1,
  }
}

function makeCar(overrides: Partial<CarState> = {}): CarState {
  return {
    driverId: 'd1', teamId: 't1', position: 5, raceTime: 900, lap: 10,
    sector: 2, compound: 'S', tyreAge: 10, paceMode: 'neutral', pitted: false,
    pitsDone: 0, strategy: { teamId: 't1', startCompound: 'S', plannedStops: [{ lap: 12, compound: 'H' }] },
    isPlayer: false,
    ...overrides,
  }
}

function makeState(overrides: Partial<RaceState> = {}): RaceState {
  return {
    lap: 10, sector: 2, totalLaps: 30, cars: [], sectorResults: [],
    overtakeEvents: [], trackEvolutionLaps: 10, rngState: 1,
    ...overrides,
  }
}

describe('shouldAIPit', () => {
  it('pits on the planned stop lap', () => {
    const car = makeCar({ lap: 12 })
    const result = shouldAIPit(makeConfig(), car, makeState({ lap: 12 }))
    expect(result.pit).toBe(true)
    expect(result.compound).toBe('H')
  })

  it('does not pit before planned lap', () => {
    const car = makeCar({ lap: 8 })
    const result = shouldAIPit(makeConfig(), car, makeState({ lap: 8 }))
    expect(result.pit).toBe(false)
  })

  it('pits early when tyre is way past cliff', () => {
    // Soft cliff = 12, age 20 = past cliff. Should trigger emergency pit.
    const car = makeCar({ compound: 'S', tyreAge: 20, lap: 5 })
    const result = shouldAIPit(makeConfig(), car, makeState({ lap: 5 }))
    expect(result.pit).toBe(true)
  })

  it('does not pit if already pitted on this lap', () => {
    const car = makeCar({ lap: 12, pitsDone: 1 })
    // After a pit, the next strategy entry won't exist — test no-more-stops
    const config = makeConfig()
    const noStopConfig: RaceConfig = {
      ...config,
      strategies: [{ teamId: 't1', startCompound: 'H', plannedStops: [] }],
    }
    const noStopCar: CarState = { ...car, strategy: { teamId: 't1', startCompound: 'H', plannedStops: [] } }
    const result = shouldAIPit(noStopConfig, noStopCar, makeState({ lap: 12 }))
    expect(result.pit).toBe(false)
  })
})
```

- [ ] **Step 2: Run failing tests**

```bash
npx vitest run tests/engine/strategy.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/engine/strategy.ts`**

```typescript
import type { RaceConfig, CarState, RaceState, Compound } from './types'
import { tyreCliffFraction } from './tyres'

const CLIFF_EMERGENCY_THRESHOLD = 1.5  // 150% of cliff = emergency pit

export function shouldAIPit(
  config: RaceConfig,
  car: CarState,
  state: RaceState,
): { pit: boolean; compound: Compound } {
  const { compounds } = config
  const nextStop = car.strategy.plannedStops.find(s => s.lap >= car.lap)

  // Emergency pit: tyre is deeply past cliff
  const spec = compounds[car.compound]!
  if (tyreCliffFraction(spec, car.tyreAge) >= CLIFF_EMERGENCY_THRESHOLD) {
    const fallback: Compound = car.compound === 'S' ? 'M' : car.compound === 'M' ? 'H' : 'H'
    return { pit: true, compound: nextStop?.compound ?? fallback }
  }

  // Planned stop
  if (nextStop && car.lap >= nextStop.lap) {
    return { pit: true, compound: nextStop.compound }
  }

  return { pit: false, compound: car.compound }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/engine/strategy.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/strategy.ts tests/engine/strategy.test.ts
git commit -m "feat(engine): AI strategy — planned pit + emergency cliff detection"
```

---

## Task 10: Engine Public API + Index

**Files:**
- Create: `src/engine/index.ts`
- Test: `tests/engine/index.test.ts`

**Interfaces:**
- Produces the public surface consumed by `state/` in Phase 2

- [ ] **Step 1: Write test**

Create `tests/engine/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { initRace, stepSector, projectPitNow, shouldAIPit } from '@engine/index'
import { loadGameData } from '@data/validators'

describe('engine public API', () => {
  it('exports initRace, stepSector, projectPitNow, shouldAIPit', () => {
    expect(typeof initRace).toBe('function')
    expect(typeof stepSector).toBe('function')
    expect(typeof projectPitNow).toBe('function')
    expect(typeof shouldAIPit).toBe('function')
  })

  it('can init a race from real game data', () => {
    const data = loadGameData()
    const circuit = data.circuits['silverpark']!
    const config = {
      circuit: { ...circuit, sectorBase: circuit.sectorBase as [number,number,number], carSensitivity: circuit.carSensitivity as [number,number,number], driverSensitivity: circuit.driverSensitivity as [number,number,number], overtakingFactor: circuit.overtakingFactor as [number,number,number] },
      tuning: data.tuning as any,
      compounds: data.compounds,
      drivers: data.drivers.drivers,
      teams: data.cars.teams,
      strategies: data.strategies.defaults,
      playerDriverId: 'd_ver',
      seed: 42,
    }
    const state = initRace(config as any)
    expect(state.cars).toHaveLength(data.drivers.drivers.length)
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
npx vitest run tests/engine/index.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `src/engine/index.ts`**

```typescript
export { initRace, stepSector } from './race'
export { projectPitNow } from './projection'
export { shouldAIPit } from './strategy'
export { tyreDelta, tyreCliffFraction } from './tyres'
export { computeSectorTime } from './lapModel'
export { createRng, gaussianPair } from './rng'
export type {
  RaceConfig, RaceState, CarState, SectorResult, OvertakeEvent,
  Compound, PaceMode, SectorIndex, TuningConstants, CompoundSpec,
  CircuitSpec, DriverSpec, TeamSpec, PitStop, StrategyPlan,
} from './types'
export type { ProjectionResult } from './projection'
export type { Rng } from './rng'
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/engine/index.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/index.ts tests/engine/index.test.ts
git commit -m "feat(engine): public API index — Phase 1 engine complete"
```

---

## Task 11: Monte-Carlo Regression Suite

**Files:**
- Test: `tests/engine/monteCarlo.test.ts`

**Interfaces:**
- Consumes: `initRace`, `stepSector` from engine index; real data from validators
- Produces: regression oracle proof that the engine hits the validated bands

- [ ] **Step 1: Write the Monte-Carlo test**

Create `tests/engine/monteCarlo.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import type { RaceConfig } from '@engine/types'

// Build a real config from game data
function buildConfig(seed: number): RaceConfig {
  const data = loadGameData()
  const circuit = data.circuits['silverpark']!
  return {
    circuit: {
      name: circuit.name,
      laps: circuit.laps,
      sectorBase: circuit.sectorBase as [number,number,number],
      carSensitivity: circuit.carSensitivity as [number,number,number],
      driverSensitivity: circuit.driverSensitivity as [number,number,number],
      overtakingFactor: circuit.overtakingFactor as [number,number,number],
      pitLaneTimeLoss: circuit.pitLaneTimeLoss,
    },
    tuning: data.tuning as any,
    compounds: data.compounds,
    drivers: data.drivers.drivers,
    teams: data.cars.teams,
    strategies: data.strategies.defaults,
    playerDriverId: 'd_ver',
    seed,
  }
}

function runFullRace(seed: number): { winnerId: string; overtakes: number } {
  const config = buildConfig(seed)
  let state = initRace(config)
  const rng = createRng(seed)
  const totalSectors = config.circuit.laps * 3
  for (let i = 0; i < totalSectors; i++) {
    state = stepSector(config, state, rng)
  }
  return {
    winnerId: state.cars[0]!.driverId,
    overtakes: state.overtakeEvents.length,
  }
}

describe('Monte-Carlo regression (200 races)', () => {
  it('top team wins 55–68% of races', () => {
    const RACES = 200
    const wins: Record<string, number> = {}
    for (let i = 0; i < RACES; i++) {
      const { winnerId } = runFullRace(i * 7 + 13)
      wins[winnerId] = (wins[winnerId] ?? 0) + 1
    }
    // d_ver and d_nor are both on the best team — count combined
    const apexWins = (wins['d_ver'] ?? 0) + (wins['d_nor'] ?? 0)
    const apexWinRate = apexWins / RACES
    expect(apexWinRate, `Apex win rate ${(apexWinRate * 100).toFixed(1)}% expected 55–68%`)
      .toBeGreaterThanOrEqual(0.55)
    expect(apexWinRate).toBeLessThanOrEqual(0.68)
  }, 60_000) // 60s timeout for 200 races

  it('mean overtakes per race is 12–22', () => {
    const RACES = 200
    let totalOvertakes = 0
    for (let i = 0; i < RACES; i++) {
      const { overtakes } = runFullRace(i * 13 + 7)
      totalOvertakes += overtakes
    }
    const mean = totalOvertakes / RACES
    expect(mean, `Mean overtakes ${mean.toFixed(1)} expected 12–22`).toBeGreaterThanOrEqual(12)
    expect(mean).toBeLessThanOrEqual(22)
  }, 60_000)

  it('every race has at least 2 overtakes', () => {
    for (let i = 0; i < 200; i++) {
      const { overtakes } = runFullRace(i + 500)
      expect(overtakes, `Race ${i} had only ${overtakes} overtakes`).toBeGreaterThanOrEqual(2)
    }
  }, 60_000)

  it('determinism: same seed = same winner', () => {
    const a = runFullRace(42)
    const b = runFullRace(42)
    expect(a.winnerId).toBe(b.winnerId)
    expect(a.overtakes).toBe(b.overtakes)
  })
})
```

- [ ] **Step 2: Run the regression suite**

```bash
npx vitest run tests/engine/monteCarlo.test.ts --reporter=verbose
```

Expected: 4 tests PASS (may take up to 60s for 200-race runs). If win-rate or overtake bands fail, the tuning constants need adjustment — but with the locked values from DATA_SCHEMAS.md they should pass.

- [ ] **Step 3: Commit**

```bash
git add tests/engine/monteCarlo.test.ts
git commit -m "test(engine): Monte-Carlo regression — 200 races, win rate + overtake bands"
```

---

## Task 12: Full Test Run + Android Build Verification

**Files:**
- No new files

- [ ] **Step 1: Run the complete test suite**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass across: `tests/data/`, `tests/engine/`

- [ ] **Step 2: TypeScript build check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Production web build**

```bash
npm run build
```

Expected: `dist/` produced with no errors.

- [ ] **Step 4: Capacitor sync**

```bash
npx cap sync android
```

Expected: no errors. Capacitor syncs the web build to `android/`.

- [ ] **Step 5: Open Android Studio and run on device/emulator**

```bash
npx cap open android
```

Expected: Android Studio opens. Run the app on a connected device or emulator. You should see the dark canvas with the teal dot running around the Silverpark path — Phase 0 visual confirmed on device.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: Phase 0+1 complete — headless engine tested, canvas on device"
```

---

## Notes for Phase 2

Phase 2 (Core UI) requires:
1. This plan complete and passing.
2. A separate plan covering: Zustand stores (`state/`), Timing Tower component, Pit Panel + Projection overlay, Tyre Cliff gauge, player lever controls.
3. The `state/` layer bridges this engine to React — it calls `stepSector` on a tick interval and exposes slices to UI components.

**⚠️ Missing: `MODEL_SPEC.md`** — CLAUDE.md references this as the canonical spec for the simulation numbers. The tuning constants in DATA_SCHEMAS.md are used here as the authoritative source. If MODEL_SPEC.md is provided before Phase 2 planning, reconcile any differences before starting that plan.

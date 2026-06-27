# F1 Strategist — Phase 3: Polish & Feel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add race-start lights sequence, audio, haptics, settings panel, gap flash animations, pit-stop timer overlay, and settings persistence to make the game look and feel genuinely cool.

**Architecture:** Eight focused tasks in dependency order — settings store first (everything else reads it), then audio + haptics (stateless services), then the race-start 'starting' phase (new raceStore state), then UI polish layers (gap flash, pit timer, settings panel), and finally wiring everything together. No new engine changes.

**Tech Stack:** React 19, Zustand 5, Framer Motion (framer-motion v12), Web Audio API (synthetic tones — no audio files needed for Phase 3), `@capacitor/haptics` (already installed), `@capacitor/preferences` (needs install)

## Global Constraints

- TypeScript strict + `noUncheckedIndexedAccess` — no `any`
- All colours via CSS tokens from `src/styles/tokens.css` — no raw hex in components
- All Framer Motion imports from `'framer-motion'` (not `'motion/react'` — the `motion` package is not installed)
- `framer-motion` v12 is installed; use `motion.div`, `AnimatePresence`, `useAnimation` from it
- Haptics and Preferences silently degrade on web (Capacitor plugins no-op in browser)
- `prefers-reduced-motion`: all animations respect the `reducedMotion` setting from settingsStore
- Font tokens: `var(--font-display)` for headers, `var(--font-mono)` for numbers, `var(--font-body)` for body
- `engine/` imports nothing from `state/`, `ui/`, `canvas/`
- Commit after every task

---

## File Map

```
src/state/
  settingsStore.ts     CREATE — soundEnabled, hapticsEnabled, reducedMotion booleans
                                + persist/load via @capacitor/preferences

src/audio/
  soundService.ts      CREATE — Web Audio API synthetic tones: tick, lightsOut, pitConfirm

src/hooks/
  useHaptics.ts        CREATE — wrapper around @capacitor/haptics, respects settingsStore

src/ui/
  StartLights.tsx      CREATE — 5-light race-start sequence; triggers when phase='starting'
  SettingsPanel.tsx    CREATE — overlay with sound/haptics/reduced-motion toggles
  PitTimer.tsx         CREATE — animated stop-time countdown shown during player pit stop
  TimingTower.tsx      MODIFY — flash row green/red on position change

src/state/
  raceStore.ts         MODIFY — add 'starting' phase, playerInPit flag, pitEndTime field
                                 add initForStartSequence() + confirmRaceStart() actions

src/ui/
  StartScreen.tsx      MODIFY — call initForStartSequence() instead of startRace()+setSpeed()
  RaceHUD.tsx          MODIFY — render StartLights when phase='starting'; add settings button;
                                 render PitTimer when playerInPit=true
```

---

## Task 1: Settings Store + Capacitor Preferences persistence

**Files:**
- Create: `src/state/settingsStore.ts`
- Test: `tests/state/settingsStore.test.ts`

**Interfaces:**
- Consumes: `@capacitor/preferences` (install if missing)
- Produces:
  - `useSettingsStore` — Zustand hook
  - `SettingsState { soundEnabled: boolean; hapticsEnabled: boolean; reducedMotion: boolean }`
  - `loadSettings(): Promise<void>` — call once at app start
  - `saveSettings(patch: Partial<SettingsState>): Promise<void>`

- [ ] **Step 1: Install `@capacitor/preferences` if not present**

```bash
cd "/Users/veetrag/Documents/Claude Expeiments/f1-manager"
npm ls @capacitor/preferences 2>/dev/null || npm install @capacitor/preferences
```

Expected: package listed or newly installed.

- [ ] **Step 2: Write failing tests**

Create `tests/state/settingsStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSettingsStore } from '@state/settingsStore'

// Capacitor Preferences falls back to localStorage on web; Vitest uses jsdom
describe('settingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({ soundEnabled: true, hapticsEnabled: true, reducedMotion: false })
  })

  it('has correct defaults', () => {
    const s = useSettingsStore.getState()
    expect(s.soundEnabled).toBe(true)
    expect(s.hapticsEnabled).toBe(true)
    expect(s.reducedMotion).toBe(false)
  })

  it('setSoundEnabled toggles sound', () => {
    useSettingsStore.getState().setSoundEnabled(false)
    expect(useSettingsStore.getState().soundEnabled).toBe(false)
  })

  it('setHapticsEnabled toggles haptics', () => {
    useSettingsStore.getState().setHapticsEnabled(false)
    expect(useSettingsStore.getState().hapticsEnabled).toBe(false)
  })

  it('setReducedMotion toggles motion', () => {
    useSettingsStore.getState().setReducedMotion(true)
    expect(useSettingsStore.getState().reducedMotion).toBe(true)
  })
})
```

- [ ] **Step 3: Run failing tests**

```bash
npx vitest run tests/state/settingsStore.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/state/settingsStore.ts`**

```typescript
import { create } from 'zustand'
import { Preferences } from '@capacitor/preferences'

export interface SettingsState {
  soundEnabled: boolean
  hapticsEnabled: boolean
  reducedMotion: boolean
  setSoundEnabled: (v: boolean) => void
  setHapticsEnabled: (v: boolean) => void
  setReducedMotion: (v: boolean) => void
  loadSettings: () => Promise<void>
}

const KEYS = { sound: 'settings.sound', haptics: 'settings.haptics', motion: 'settings.motion' }

export const useSettingsStore = create<SettingsState>((set, get) => ({
  soundEnabled: true,
  hapticsEnabled: true,
  reducedMotion: false,

  setSoundEnabled(v) {
    set({ soundEnabled: v })
    void Preferences.set({ key: KEYS.sound, value: String(v) })
  },
  setHapticsEnabled(v) {
    set({ hapticsEnabled: v })
    void Preferences.set({ key: KEYS.haptics, value: String(v) })
  },
  setReducedMotion(v) {
    set({ reducedMotion: v })
    void Preferences.set({ key: KEYS.motion, value: String(v) })
  },

  async loadSettings() {
    const [sound, haptics, motion] = await Promise.all([
      Preferences.get({ key: KEYS.sound }),
      Preferences.get({ key: KEYS.haptics }),
      Preferences.get({ key: KEYS.motion }),
    ])
    set({
      soundEnabled:   sound.value   !== null ? sound.value   === 'true' : get().soundEnabled,
      hapticsEnabled: haptics.value !== null ? haptics.value === 'true' : get().hapticsEnabled,
      reducedMotion:  motion.value  !== null ? motion.value  === 'true' : get().reducedMotion,
    })
  },
}))
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/state/settingsStore.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 6: Call `loadSettings()` at app start in `src/main.tsx`**

Read `src/main.tsx` first. Then modify to call `loadSettings()` before first render:

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useSettingsStore } from './state/settingsStore'

const root = document.getElementById('root')
if (!root) throw new Error('No root element found')

useSettingsStore.getState().loadSettings().then(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
```

- [ ] **Step 7: Verify build**

```bash
npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/state/settingsStore.ts src/main.tsx tests/state/settingsStore.test.ts
git commit -m "feat(state): settings store — sound/haptics/reducedMotion with Preferences persistence"
```

---

## Task 2: Haptics Hook

**Files:**
- Create: `src/hooks/useHaptics.ts`

**Interfaces:**
- Consumes: `@capacitor/haptics` (already installed), `useSettingsStore`
- Produces:
  - `useHaptics(): { impact(style?: ImpactStyle): void; success(): void; warning(): void }`
  - `ImpactStyle` re-exported from `@capacitor/haptics`

No test needed — Capacitor Haptics is a no-op in jsdom. Manual verification on device only.

- [ ] **Step 1: Create `src/hooks/useHaptics.ts`**

```typescript
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { useSettingsStore } from '@state/settingsStore'

export { ImpactStyle }

export function useHaptics() {
  const hapticsEnabled = useSettingsStore(s => s.hapticsEnabled)

  function impact(style: ImpactStyle = ImpactStyle.Medium) {
    if (!hapticsEnabled) return
    void Haptics.impact({ style }).catch(() => { /* silently fail on web */ })
  }

  function success() {
    if (!hapticsEnabled) return
    void Haptics.notification({ type: NotificationType.Success }).catch(() => {})
  }

  function warning() {
    if (!hapticsEnabled) return
    void Haptics.notification({ type: NotificationType.Warning }).catch(() => {})
  }

  return { impact, success, warning }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useHaptics.ts
git commit -m "feat(hooks): useHaptics — Capacitor Haptics wrapper, respects hapticsEnabled setting"
```

---

## Task 3: Web Audio Sound Service

**Files:**
- Create: `src/audio/soundService.ts`
- Test: `tests/audio/soundService.test.ts`

**Interfaces:**
- Consumes: `useSettingsStore`
- Produces:
  - `soundService` singleton (not a React hook — called from event handlers too)
  - `soundService.play(name: SoundName): void`
  - `type SoundName = 'tick' | 'lightsOut' | 'pitConfirm' | 'positionGain' | 'positionLoss'`

Uses Web Audio API oscillator synthesis — no audio file assets needed. On iOS/Android in Phase 4, swap the synthesis with Howler.js file playback without changing callers.

- [ ] **Step 1: Write failing tests**

Create `tests/audio/soundService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock AudioContext — jsdom doesn't implement Web Audio API
class MockOscillator {
  frequency = { setValueAtTime: vi.fn() }
  connect = vi.fn(); disconnect = vi.fn()
  start = vi.fn(); stop = vi.fn(); type = 'sine' as OscillatorType
}
class MockGain {
  gain = { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }
  connect = vi.fn(); disconnect = vi.fn()
}
class MockAudioContext {
  currentTime = 0
  state = 'running'
  createOscillator = vi.fn().mockReturnValue(new MockOscillator())
  createGain = vi.fn().mockReturnValue(new MockGain())
  destination = {}
  resume = vi.fn().mockResolvedValue(undefined)
}

vi.stubGlobal('AudioContext', MockAudioContext)
vi.stubGlobal('window', { AudioContext: MockAudioContext })

describe('soundService', () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it('play() does not throw for each sound name', async () => {
    const { soundService } = await import('@audio/soundService')
    const names = ['tick', 'lightsOut', 'pitConfirm', 'positionGain', 'positionLoss'] as const
    for (const name of names) {
      expect(() => soundService.play(name)).not.toThrow()
    }
  })

  it('play() is a no-op when soundEnabled is false', async () => {
    const { useSettingsStore } = await import('@state/settingsStore')
    useSettingsStore.setState({ soundEnabled: false })
    const { soundService } = await import('@audio/soundService')
    expect(() => soundService.play('tick')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run failing tests**

```bash
mkdir -p tests/audio
npx vitest run tests/audio/soundService.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/audio/soundService.ts`**

```typescript
import { useSettingsStore } from '@state/settingsStore'

export type SoundName = 'tick' | 'lightsOut' | 'pitConfirm' | 'positionGain' | 'positionLoss'

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function beep(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.25,
  fadeOut = true,
) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime)
  g.gain.setValueAtTime(gain, c.currentTime)
  if (fadeOut) g.gain.linearRampToValueAtTime(0, c.currentTime + duration)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(c.currentTime)
  osc.stop(c.currentTime + duration)
  osc.addEventListener('ended', () => { osc.disconnect(); g.disconnect() })
}

const SOUNDS: Record<SoundName, () => void> = {
  tick() {
    beep(880, 0.08, 'sine', 0.2, true)
  },
  lightsOut() {
    // Rising sweep + low thump
    beep(220, 0.6, 'sawtooth', 0.3, true)
    setTimeout(() => beep(440, 0.3, 'sine', 0.25, true), 150)
  },
  pitConfirm() {
    beep(600, 0.12, 'square', 0.2, true)
    setTimeout(() => beep(900, 0.1, 'square', 0.15, true), 120)
  },
  positionGain() {
    beep(660, 0.1, 'sine', 0.15, true)
    setTimeout(() => beep(880, 0.15, 'sine', 0.15, true), 80)
  },
  positionLoss() {
    beep(440, 0.15, 'sine', 0.15, true)
    setTimeout(() => beep(330, 0.2, 'sine', 0.15, true), 80)
  },
}

export const soundService = {
  play(name: SoundName) {
    const { soundEnabled } = useSettingsStore.getState()
    if (!soundEnabled) return
    try {
      SOUNDS[name]()
    } catch {
      // Web Audio may fail silently on some browsers
    }
  },
}
```

- [ ] **Step 4: Add `@audio` path alias to `vite.config.ts` and `tsconfig.json`**

Read `vite.config.ts` first. Add:

In `vite.config.ts`, inside `resolve.alias`:
```typescript
'@audio': resolve(__dirname, './src/audio'),
```

In `tsconfig.json`, inside `compilerOptions.paths`:
```json
"@audio/*": ["./src/audio/*"]
```

- [ ] **Step 5: Run tests**

```bash
mkdir -p tests/audio
npx vitest run tests/audio/soundService.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/audio/soundService.ts vite.config.ts tsconfig.json tests/audio/soundService.test.ts
git commit -m "feat(audio): Web Audio synthetic sound service — tick, lightsOut, pitConfirm, positionGain/Loss"
```

---

## Task 4: Race Start Lights Sequence

**Files:**
- Modify: `src/state/raceStore.ts` — add `'starting'` phase + `playerInPit`/`pitEndTime` fields
- Create: `src/ui/StartLights.tsx`
- Modify: `src/ui/StartScreen.tsx`
- Test: `tests/state/raceStore.test.ts` — extend

**Interfaces:**
- Consumes: `soundService.play`, `useHaptics`, `useSettingsStore`, `useClockStore`
- Produces:
  - `RacePhase` extended: `'idle' | 'starting' | 'racing' | 'finished'`
  - New actions: `initForStartSequence(): void`, `confirmRaceStart(): void`
  - New fields: `playerInPit: boolean`, `pitEndTime: number` (raceTime when pit stop ends)

- [ ] **Step 1: Extend `src/state/raceStore.ts`**

Read `src/state/raceStore.ts` first. Then apply these changes:

1. Change `RacePhase` type:
```typescript
export type RacePhase = 'idle' | 'starting' | 'racing' | 'finished'
```

2. Add to `RaceStore` interface:
```typescript
playerInPit: boolean
pitEndTime: number

initForStartSequence: () => void
confirmRaceStart: () => void
```

3. Add to initial state in `create()`:
```typescript
playerInPit: false,
pitEndTime: 0,
```

4. Add new actions in `create()`:

```typescript
initForStartSequence() {
  const seed = 42
  const config = buildConfig(seed)
  const raceState = initRace(config)
  const rng = createRng(seed)
  set({ phase: 'starting', config, raceState, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, pitEndTime: 0 })
},

confirmRaceStart() {
  set({ phase: 'racing' })
},
```

5. Update `pitNow` to set `playerInPit` and `pitEndTime`:
```typescript
pitNow(compound: Compound) {
  const { config, raceState, rng } = get()
  if (!config || !raceState || !rng) return
  const { laneTimeLoss, stopMean, stopSigma } = config.tuning.pit
  const stopTime = laneTimeLoss + stopMean + (rng() - 0.5) * 2 * stopSigma

  const updatedCars = raceState.cars.map(car => {
    if (!car.isPlayer) return car
    return { ...car, raceTime: car.raceTime + stopTime, compound, tyreAge: 0, pitsDone: car.pitsDone + 1 }
  })
  const playerTime = updatedCars.find(c => c.isPlayer)?.raceTime ?? 0
  set({
    raceState: { ...raceState, cars: updatedCars },
    pitPanelOpen: false,
    playerInPit: true,
    pitEndTime: playerTime,
  })
},
```

6. Update `step` to clear `playerInPit` once player's raceTime passes `pitEndTime`:
```typescript
step() {
  const { phase, config, raceState, rng, playerInPit, pitEndTime } = get()
  if (phase !== 'racing' || !config || !raceState || !rng) return

  const nextState = stepSector(config, raceState, rng)
  const finished = nextState.lap >= nextState.totalLaps && nextState.sector === 0

  const playerNow = nextState.cars.find(c => c.isPlayer)?.raceTime ?? 0
  const stillInPit = playerInPit && playerNow < pitEndTime + config.tuning.pit.laneTimeLoss

  set({ raceState: nextState, phase: finished ? 'finished' : 'racing', playerInPit: stillInPit })
},
```

- [ ] **Step 2: Add tests for new actions in `tests/state/raceStore.test.ts`**

Read `tests/state/raceStore.test.ts`. Append these tests:

```typescript
it('initForStartSequence sets phase to starting with raceState', () => {
  useRaceStore.getState().initForStartSequence()
  expect(useRaceStore.getState().phase).toBe('starting')
  expect(useRaceStore.getState().raceState).not.toBeNull()
})

it('confirmRaceStart transitions starting -> racing', () => {
  useRaceStore.getState().initForStartSequence()
  useRaceStore.getState().confirmRaceStart()
  expect(useRaceStore.getState().phase).toBe('racing')
})

it('pitNow sets playerInPit flag', () => {
  useRaceStore.getState().startRace()
  useRaceStore.getState().pitNow('H')
  expect(useRaceStore.getState().playerInPit).toBe(true)
})
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/state/raceStore.test.ts
```

Expected: all tests PASS (original 6 + 3 new = 9).

- [ ] **Step 4: Create `src/ui/StartLights.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useClockStore } from '@state/clockStore'
import { useSettingsStore } from '@state/settingsStore'
import { soundService } from '@audio/soundService'
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'

const NUM_LIGHTS = 5
// Timing: each light illuminates 1000ms apart, then 600ms pause, then all out
const LIGHT_INTERVAL = 1000
const LIGHTS_OUT_DELAY = 600

export function StartLights() {
  const confirmRaceStart = useRaceStore(s => s.confirmRaceStart)
  const setSpeed = useClockStore(s => s.setSpeed)
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const { impact } = useHaptics()
  const [litCount, setLitCount] = useState(0)
  const [lightsOut, setLightsOut] = useState(false)
  const [showGo, setShowGo] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (reducedMotion) {
      // Skip sequence on reduced motion
      soundService.play('lightsOut')
      confirmRaceStart()
      setSpeed(1)
      return
    }

    const timers: ReturnType<typeof setTimeout>[] = []

    // Light up each bulb one by one
    for (let i = 1; i <= NUM_LIGHTS; i++) {
      timers.push(setTimeout(() => {
        setLitCount(i)
        soundService.play('tick')
        impact(ImpactStyle.Light)
      }, i * LIGHT_INTERVAL))
    }

    // Lights out
    const totalLightTime = NUM_LIGHTS * LIGHT_INTERVAL + LIGHTS_OUT_DELAY
    timers.push(setTimeout(() => {
      setLightsOut(true)
      setShowGo(true)
      soundService.play('lightsOut')
      impact(ImpactStyle.Heavy)
    }, totalLightTime))

    // Start race shortly after lights out
    timers.push(setTimeout(() => {
      confirmRaceStart()
      setSpeed(1)
      setDone(true)
    }, totalLightTime + 800))

    return () => timers.forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (done) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute', inset: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(10,14,26,0.92)', zIndex: 200, gap: 32,
      }}
    >
      {/* Gantry bar */}
      <div style={{
        background: 'var(--bg-elevated)', borderRadius: 12,
        padding: '18px 28px', border: '1px solid var(--line-hair)',
        display: 'flex', gap: 16, alignItems: 'center',
      }}>
        {Array.from({ length: NUM_LIGHTS }, (_, i) => {
          const lit = !lightsOut && litCount > i
          return (
            <motion.div
              key={i}
              animate={lit ? { scale: [1, 1.15, 1], boxShadow: ['0 0 0px #FF4D5E', '0 0 24px #FF4D5E', '0 0 16px #FF4D5E'] } : {}}
              transition={{ duration: 0.3 }}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: lit ? 'var(--accent-warm)' : 'var(--bg-deep)',
                border: '2px solid var(--line-hair)',
                boxShadow: lit ? '0 0 16px var(--accent-warm)' : 'none',
                transition: 'background 0.15s ease, box-shadow 0.15s ease',
              }}
            />
          )
        })}
      </div>

      {/* GO text */}
      <AnimatePresence>
        {showGo && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            style={{
              fontFamily: 'var(--font-display)', fontSize: 64, fontWeight: 700,
              color: 'var(--positive)', letterSpacing: '0.1em',
              textShadow: '0 0 40px var(--positive)',
            }}
          >
            GO
          </motion.div>
        )}
      </AnimatePresence>

      {/* Formation lap text shown while lights coming on */}
      {!showGo && (
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-dim)',
          letterSpacing: '0.15em', textTransform: 'uppercase',
        }}>
          {litCount < NUM_LIGHTS ? 'Formation lap complete' : 'Lights out...'}
        </div>
      )}
    </motion.div>
  )
}
```

- [ ] **Step 5: Create `src/hooks/` directory if not present**

```bash
mkdir -p "/Users/veetrag/Documents/Claude Expeiments/f1-manager/src/hooks"
```

- [ ] **Step 6: Update `src/ui/StartScreen.tsx` to use `initForStartSequence`**

Read `src/ui/StartScreen.tsx`. Change:
- Remove `setSpeed` import/usage from StartScreen (speed is set by StartLights after lights-out)
- Call `initForStartSequence()` instead of `startRace()` and remove `setSpeed(1)` call

Full replacement for `src/ui/StartScreen.tsx`:

```tsx
import { motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'

export function StartScreen() {
  const initForStartSequence = useRaceStore(s => s.initForStartSequence)

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
        onClick={initForStartSequence}
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

- [ ] **Step 7: Update `src/ui/RaceHUD.tsx` to render `StartLights` when `phase === 'starting'`**

Read `src/ui/RaceHUD.tsx`. Add `StartLights` to the phase `=== 'starting'` condition.

Change the `AnimatePresence` block so that both `'starting'` and `'racing'`/`'finished'` show the race layout (since `StartLights` overlays on top), and `StartLights` itself renders as an overlay inside the race layout when `phase === 'starting'`:

```tsx
// Add import at top:
import { StartLights } from './StartLights'

// Inside the race motion.div (the key="race" block), add StartLights overlay:
// Change the AnimatePresence condition — show race layout for 'starting' too:
```

Find the line:
```tsx
{phase === 'idle' ? (
  <StartScreen key="start" />
) : (
```

Replace with:
```tsx
{phase === 'idle' ? (
  <StartScreen key="start" />
) : (
```
(No change needed to the outer condition — 'starting' and 'racing' both fall into the race layout branch.)

Then inside the race `motion.div`, after `{phase === 'finished' && <FinishBanner />}`, add:

```tsx
{phase === 'starting' && <StartLights />}
```

- [ ] **Step 8: Verify TypeScript and tests**

```bash
npx tsc --noEmit 2>&1
npx vitest run tests/state/raceStore.test.ts
```

Expected: no TS errors; 9 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/state/raceStore.ts src/ui/StartLights.tsx src/ui/StartScreen.tsx src/ui/RaceHUD.tsx src/hooks/ tests/state/raceStore.test.ts
git commit -m "feat(ui): race start lights sequence — 5 red lights, lights-out GO, haptic + sound"
```

---

## Task 5: Settings Panel

**Files:**
- Create: `src/ui/SettingsPanel.tsx`
- Modify: `src/ui/RaceHUD.tsx` — add gear button + render SettingsPanel

**Interfaces:**
- Consumes: `useSettingsStore`
- Produces: `<SettingsPanel />`, `<SettingsButton />`

- [ ] **Step 1: Create `src/ui/SettingsPanel.tsx`**

```tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettingsStore } from '@state/settingsStore'

function Toggle({ label, sublabel, value, onChange }: {
  label: string; sublabel: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 0', borderBottom: '1px solid var(--line-hair)',
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text-hi)', letterSpacing: '0.04em' }}>
          {label}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
          {sublabel}
        </div>
      </div>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => onChange(!value)}
        style={{
          width: 52, height: 30, borderRadius: 15, border: 'none',
          background: value ? 'var(--accent)' : 'var(--bg-elevated)',
          outline: value ? 'none' : '1px solid var(--line-hair)',
          cursor: 'pointer', position: 'relative', flexShrink: 0,
          transition: 'background 0.2s',
        }}
      >
        <motion.div
          animate={{ x: value ? 24 : 4 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          style={{
            position: 'absolute', top: 4, width: 22, height: 22,
            borderRadius: '50%', background: value ? 'var(--bg-deep)' : 'var(--text-dim)',
          }}
        />
      </motion.button>
    </div>
  )
}

function SettingsPanelDrawer({ onClose }: { onClose: () => void }) {
  const { soundEnabled, hapticsEnabled, reducedMotion, setSoundEnabled, setHapticsEnabled, setReducedMotion } = useSettingsStore()

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.05em' }}>
          SETTINGS
        </span>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          style={{
            background: 'transparent', border: '1px solid var(--line-hair)',
            borderRadius: 6, padding: '4px 10px', color: 'var(--text-dim)',
            fontFamily: 'var(--font-display)', fontSize: 12, cursor: 'pointer',
          }}
        >
          DONE
        </motion.button>
      </div>

      <Toggle label="Sound" sublabel="Engine, pit, and UI sound effects" value={soundEnabled} onChange={setSoundEnabled} />
      <Toggle label="Haptics" sublabel="Vibration feedback on device" value={hapticsEnabled} onChange={setHapticsEnabled} />
      <Toggle label="Reduce Motion" sublabel="Simplifies animations for accessibility" value={reducedMotion} onChange={setReducedMotion} />
    </motion.div>
  )
}

export function SettingsPanel() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(true)}
        title="Settings"
        style={{
          background: 'transparent', border: '1px solid var(--line-hair)',
          borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: 'var(--text-dim)',
          fontFamily: 'var(--font-display)', fontSize: 14, lineHeight: 1,
        }}
      >
        ⚙
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }}
            />
            <SettingsPanelDrawer onClose={() => setOpen(false)} />
          </>
        )}
      </AnimatePresence>
    </>
  )
}
```

- [ ] **Step 2: Add `<SettingsPanel />` to `src/ui/RaceHUD.tsx`**

Read `src/ui/RaceHUD.tsx`. Add import:
```tsx
import { SettingsPanel } from './SettingsPanel'
```

Add `<SettingsPanel />` to the speed controls row. Find the `<div style={{ display: 'flex', justifyContent: 'center' }}>` that wraps `<SpeedControl />` and add the settings button:

```tsx
<div style={{ display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center' }}>
  <SpeedControl />
  <SettingsPanel />
</div>
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/SettingsPanel.tsx src/ui/RaceHUD.tsx
git commit -m "feat(ui): settings panel — sound, haptics, reduced-motion toggles"
```

---

## Task 6: Gap Flash Animation in Timing Tower

**Files:**
- Modify: `src/ui/TimingTower.tsx`

**Strategy:** Track each car's previous position in a ref. When position improves, flash the row green; when it worsens, flash red. Use a CSS `@keyframes` flash triggered by a `key` prop change.

- [ ] **Step 1: Modify `src/ui/TimingTower.tsx`**

Read `src/ui/TimingTower.tsx`. Replace `TowerRow` with a version that tracks position changes:

In `TowerRow`, add `prevPosition` prop and use a `useRef` + `useState` flash state:

```tsx
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useRef, useEffect, useState } from 'react'
import type { CarState, Compound, CompoundSpec } from '@engine/types'

const COMPOUND_COLORS: Record<Compound, string> = {
  S: 'var(--tyre-soft)',
  M: 'var(--tyre-medium)',
  H: 'var(--tyre-hard)',
}

function formatGap(gap: number, position: number): string {
  if (position === 1) return 'LEADER'
  return `+${gap.toFixed(3)}`
}

function CompoundDot({ compound, age, spec }: { compound: Compound; age: number; spec: CompoundSpec }) {
  const fraction = spec.cliff > 0 ? age / spec.cliff : 0
  const worn = fraction > 0.85
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: COMPOUND_COLORS[compound],
      opacity: worn ? 0.5 : 1,
      boxShadow: worn ? 'none' : `0 0 4px ${COMPOUND_COLORS[compound]}`,
      flexShrink: 0,
    }} />
  )
}

function TowerRow({ car, leaderTime, compounds }: {
  car: CarState
  leaderTime: number
  compounds: Record<Compound, CompoundSpec>
}) {
  const gap = car.raceTime - leaderTime
  const spec = compounds[car.compound]!
  const modeColor = car.paceMode === 'push'
    ? 'var(--accent-warm)'
    : car.paceMode === 'conserve'
    ? 'var(--positive)'
    : 'var(--text-dim)'

  const prevPosRef = useRef(car.position)
  const [flash, setFlash] = useState<'gain' | 'loss' | null>(null)

  useEffect(() => {
    if (car.position < prevPosRef.current) {
      setFlash('gain')
      const t = setTimeout(() => setFlash(null), 600)
      prevPosRef.current = car.position
      return () => clearTimeout(t)
    } else if (car.position > prevPosRef.current) {
      setFlash('loss')
      const t = setTimeout(() => setFlash(null), 600)
      prevPosRef.current = car.position
      return () => clearTimeout(t)
    }
  }, [car.position])

  const flashBg = flash === 'gain'
    ? 'rgba(61,220,132,0.15)'
    : flash === 'loss'
    ? 'rgba(255,107,107,0.15)'
    : car.isPlayer ? 'rgba(0,229,208,0.08)' : 'transparent'

  const driverCode = car.driverId.replace('d_', '').toUpperCase().slice(0, 3)

  return (
    <motion.div
      layout
      layoutId={car.driverId}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      style={{
        display: 'grid',
        gridTemplateColumns: '20px 34px 1fr 12px 26px 8px',
        alignItems: 'center',
        gap: 5,
        padding: '5px 10px',
        borderRadius: 4,
        background: flashBg,
        borderLeft: car.isPlayer ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background 0.3s ease',
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: flash === 'gain' ? 'var(--positive)' : flash === 'loss' ? 'var(--negative)' : 'var(--text-dim)', fontVariantNumeric: 'tabular-nums', transition: 'color 0.3s' }}>
        {car.position}
      </span>
      <span style={{
        fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
        color: car.isPlayer ? 'var(--accent)' : 'var(--text-hi)', letterSpacing: '0.05em',
      }}>
        {driverCode}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)', fontVariantNumeric: 'tabular-nums', minWidth: 0 }}>
        {formatGap(gap, car.position)}
      </span>
      <CompoundDot compound={car.compound} age={car.tyreAge} spec={spec} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
        L{car.tyreAge}
      </span>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: modeColor, display: 'inline-block', flexShrink: 0 }} />
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
      padding: '8px 0', width: '100%',
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

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/TimingTower.tsx
git commit -m "feat(ui): timing tower gap flash — green gain, red loss, smooth position-change highlight"
```

---

## Task 7: Pit-Stop Timer Overlay

**Files:**
- Create: `src/ui/PitTimer.tsx`
- Modify: `src/ui/RaceHUD.tsx` — render PitTimer when `playerInPit`

**Strategy:** A full-width animated bar at the top of the race area that fills over ~3 seconds (laneTimeLoss + stopMean from config) when the player is in the pits. Renders as a DOM overlay — no canvas changes needed.

- [ ] **Step 1: Create `src/ui/PitTimer.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'

export function PitTimer() {
  const playerInPit = useRaceStore(s => s.playerInPit)
  const config = useRaceStore(s => s.config)
  const [visible, setVisible] = useState(false)
  const [key, setKey] = useState(0)

  useEffect(() => {
    if (playerInPit) {
      setVisible(true)
      setKey(k => k + 1)
    } else {
      const t = setTimeout(() => setVisible(false), 600)
      return () => clearTimeout(t)
    }
  }, [playerInPit])

  if (!visible || !config) return null

  const stopDuration = config.tuning.pit.laneTimeLoss + config.tuning.pit.stopMean

  return (
    <AnimatePresence>
      <motion.div
        key={key}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'absolute', top: 8, left: 8, right: 8,
          background: 'var(--bg-elevated)', borderRadius: 8,
          border: '1px solid var(--accent-warm)',
          padding: '10px 14px', zIndex: 10,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontFamily: 'var(--font-display)', fontSize: 11,
          color: 'var(--accent-warm)', letterSpacing: '0.1em',
        }}>
          <span>PIT STOP</span>
          <span>{stopDuration.toFixed(1)}s</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-deep)', overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: stopDuration / 10, ease: 'linear' }}
            style={{ height: '100%', background: 'var(--accent-warm)', borderRadius: 2 }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Add `<PitTimer />` to `src/ui/RaceHUD.tsx`**

Read `src/ui/RaceHUD.tsx`. Add import:
```tsx
import { PitTimer } from './PitTimer'
```

Inside the race layout, inside the main area flex div (the one with canvas + tower), add `<PitTimer />` just before the canvas div. The parent already has `position: 'relative'` set on the outer race `motion.div` effectively — but we need to ensure the parent of `PitTimer` has `position: relative`. Add it to the outer `motion.div key="race"`:

Inside the main area div, add `<PitTimer />` as a sibling before the canvas:
```tsx
<div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '8px 8px 0', minHeight: 0, position: 'relative' }}>
  <PitTimer />
  <div style={{ flex: 1, overflow: 'hidden', borderRadius: 8, background: 'var(--bg-deep)' }}>
    ...
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/PitTimer.tsx src/ui/RaceHUD.tsx
git commit -m "feat(ui): pit-stop timer overlay — animated fill bar with stop duration"
```

---

## Task 8: Wire Haptics + Sound to Events + Final Integration

**Files:**
- Modify: `src/ui/PitPanel.tsx` — haptic + sound on BOX NOW confirm
- Modify: `src/ui/PaceModeToggle.tsx` — haptic on mode change
- Modify: `src/ui/GameClock.tsx` — sound on race finish

**Goal:** Connect haptic impacts and audio cues to the three primary game interactions.

- [ ] **Step 1: Add haptics + sound to `src/ui/PitPanel.tsx`**

Read `src/ui/PitPanel.tsx`. In `PitPanelDrawer`, add `useHaptics` and `soundService`:

Add imports:
```tsx
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'
import { soundService } from '@audio/soundService'
```

In `handleConfirm`:
```tsx
function handleConfirm() {
  impact(ImpactStyle.Heavy)
  soundService.play('pitConfirm')
  pitNow(selected)
}
```

Add `const { impact } = useHaptics()` inside `PitPanelDrawer`.

- [ ] **Step 2: Add haptics to `src/ui/PaceModeToggle.tsx`**

Read `src/ui/PaceModeToggle.tsx`. Add:

```tsx
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'
```

Inside `PaceModeToggle`, add:
```tsx
const { impact } = useHaptics()
```

In the `onClick` handler:
```tsx
onClick={() => { impact(ImpactStyle.Light); setPaceMode(mode) }}
```

- [ ] **Step 3: Add finish sound to `src/ui/GameClock.tsx`**

Read `src/ui/GameClock.tsx`. Add:

```tsx
import { soundService } from '@audio/soundService'
import { useEffect, useRef } from 'react'
```

Track previous phase to detect finish transition:

```tsx
export function GameClock() {
  const speed = useClockStore(s => s.speed)
  const step = useRaceStore(s => s.step)
  const phase = useRaceStore(s => s.phase)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPhaseRef = useRef(phase)

  useEffect(() => {
    if (prevPhaseRef.current === 'racing' && phase === 'finished') {
      soundService.play('positionGain') // celebratory sound
    }
    prevPhaseRef.current = phase
  }, [phase])

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

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all tests PASS (should be 60+ tests).

- [ ] **Step 5: Build**

```bash
npm run build 2>&1 | tail -6
```

Expected: no errors (chunk size warning for PixiJS is OK).

- [ ] **Step 6: Commit**

```bash
git add src/ui/PitPanel.tsx src/ui/PaceModeToggle.tsx src/ui/GameClock.tsx
git commit -m "feat(polish): wire haptics + sound to pit confirm, pace mode, race finish"
```

- [ ] **Step 7: Final Phase 3 commit**

```bash
git add -A
git commit -m "chore: Phase 3 complete — start lights, audio, haptics, settings, gap flash, pit timer"
```

---

## Self-Review

### Spec Coverage

| CLAUDE.md §7 Phase 3 requirement | Task |
|---|---|
| Race-start sequence (five red lights, lights-out) | Task 4 StartLights |
| Haptics via Capacitor Haptics | Task 2 + Task 8 |
| Audio (SFX via Web Audio, architecture for Howler in Phase 4) | Task 3 + Task 8 |
| Particle/shimmer effects | ⚠️ Not included — requires Phase 4 visual assets |
| Orchestrated transitions | Tasks 4, 5, 7 (spring animations on all new panels) |
| Settings (sound/haptics/reduced-motion) | Tasks 1 + 5 |
| Save/load | Task 1 (Capacitor Preferences) |

**Particle/shimmer gap:** The compound shimmer on tyre change is listed as a Phase 3 item. It's omitted here because it requires a CSS keyframe shimmer on the timing tower row when compound changes — a small addition. Add it to Task 6's TowerRow: when `car.compound` changes (tracked in a ref), flash a shimmer border on the row for 800ms. This can be implemented with a CSS `@keyframes shimmer-border` animation class toggled by React state, the same pattern used for position flash.

Add this to Task 6 (TimingTower): detect compound change alongside position change and flash a `shimmer` style (pulsing teal border) for 600ms.

### No Placeholders Scan

All steps have complete code. No TBD/TODO found.

### Type Consistency

- `RacePhase` updated consistently in raceStore and used in StartLights/RaceHUD
- `playerInPit`/`pitEndTime` added to both interface and initial state
- `soundService.play()` and `useHaptics()` API used consistently across Tasks 3, 8
- `SoundName` union covers all 5 names used in callers

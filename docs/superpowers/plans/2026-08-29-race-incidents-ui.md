# Race Incidents UI Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the race-incident engine — driver errors, crashes, and the safety car — to the player across five UI surfaces, so a feature that already changes every race becomes visible and exploitable.

**Architecture:** Plan A landed the engine and put `safetyCar: SafetyCarState | null` and `incidents: IncidentEvent[]` on `RaceState`, which the UI already reads through `useRaceStore(s => s.raceState)`. No store plumbing is needed. Every surface derives from that existing state. One new shared hook module (`src/hooks/useSafetyCar.ts`) gives all consumers a single, consistent read — including a *deployment counter derived from the incident log* rather than a locally-tracked edge, so no consumer can miss a deployment.

**Tech Stack:** React 19, Framer Motion 12, PixiJS 8, Zustand 5, Capacitor Haptics 8, Vitest 4 + jsdom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-22-race-incidents-design.md` (§6 Player-facing design)

## Global Constraints

Copied from the spec's §6 quality floor and CLAUDE.md §6.3. Every task's requirements implicitly include this section.

- **Engine purity (CLAUDE.md §3):** nothing in this plan modifies `src/engine/`. If a task appears to need an engine change, that is a plan defect — stop and report it. `src/engine/` imports nothing from `state/`, `ui/`, `canvas/`, or `hooks/`.
- **No new tuning constants.** Every number the UI displays is read from `RaceState` or `TuningConstants`. Do not hardcode `10.0` or `12.0` for pit loss anywhere — route through `effectivePitLaneLoss` from `@engine/incidents`.
- **Colour is never the only signal.** The banner carries the literal words `SAFETY CAR`.
- **AA contrast.** `--caution` must reach ≥4.5:1 against `--bg-panel` for any text drawn in it, and any text drawn *on* a `--caution` fill must reach ≥4.5:1 against that fill.
- **`prefers-reduced-motion` / the `reducedMotion` setting** replaces every pulse and flash in this plan with a static equivalent. Nothing may break or disappear when motion is reduced — the information must still be present.
- **Screen-reader label** on the banner announcing deployment and laps remaining.
- **Tokens only.** No raw hex in components, with the one existing exception already documented in `TimingTower.tsx` (`COMPOUND_COLORS`, which needs concatenable hex strings for alpha suffixes). Follow that same documented pattern if a task genuinely needs concatenable hex.
- **No new player control.** This plan adds information, never agency. Adding a button is out of scope.
- **`tsc --noEmit` must be clean** and the full `npm test` suite must pass at the end of every task. `vitest` does not typecheck — running the tests is not sufficient on its own.

---

### Task 1: The `--caution` token and the shared safety-car hook

The foundation both the banner and every later surface consume. Small, but it is the interface every other task depends on, so it lands first and alone.

**Files:**
- Modify: `src/styles/tokens.css`
- Create: `src/hooks/useSafetyCar.ts`
- Test: `tests/ui/safetyCarHook.test.tsx`

**Interfaces:**
- Consumes: `RaceState.safetyCar`, `RaceState.incidents` (already on state from Plan A); `useRaceStore`.
- Produces:
  - CSS custom property `--caution` on `:root`.
  - `useSafetyCar(): SafetyCarState | null`
  - `useSafetyCarDeployCount(): number`

- [ ] **Step 1: Add the `--caution` token**

In `src/styles/tokens.css`, add this immediately after the `--accent-warm` line (so the escalation language accent → caution → warm reads in source order):

```css
  /* Race control caution. Deliberately NOT --tyre-medium (#F2C94C): that is a
     compound colour, and reusing it would tie race-control state to tyre
     semantics in violation of CLAUDE.md 6.3. Shifted orange of the compound
     yellow so the two are distinguishable side by side in the timing tower,
     where a medium-shod car may sit on a caution-flashed row.
     Measured: 9.66:1 against --bg-panel, 8.62:1 against --bg-elevated, and
     10.53:1 for --bg-deep text drawn on a --caution fill. All clear AA. */
  --caution:      #FFB020;
```

- [ ] **Step 2: Write the failing test**

Create `tests/ui/safetyCarHook.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSafetyCar, useSafetyCarDeployCount } from '@hooks/useSafetyCar'
import type { IncidentEvent, RaceState, SafetyCarState } from '@engine/types'

function incident(kind: IncidentEvent['kind']): IncidentEvent {
  return { lap: 3, sector: 0, kind, driverId: null, timeLoss: null }
}

/** Only the two fields these hooks read; cast because a full RaceState is 20 cars of noise. */
function setRaceState(safetyCar: SafetyCarState | null, incidents: IncidentEvent[]) {
  useRaceStore.setState({ raceState: { safetyCar, incidents } as unknown as RaceState })
}

describe('useSafetyCar', () => {
  beforeEach(() => { useRaceStore.setState({ raceState: null }) })

  it('is null with no race and with no safety car', () => {
    const { result, rerender } = renderHook(() => useSafetyCar())
    expect(result.current).toBeNull()
    act(() => { setRaceState(null, []) })
    rerender()
    expect(result.current).toBeNull()
  })

  it('returns the active safety car state', () => {
    const sc: SafetyCarState = { deployedLap: 12, lapsRemaining: 4, cause: 'crash' }
    const { result, rerender } = renderHook(() => useSafetyCar())
    act(() => { setRaceState(sc, [incident('safety_car_deployed')]) })
    rerender()
    expect(result.current).toEqual(sc)
  })
})

describe('useSafetyCarDeployCount', () => {
  beforeEach(() => { useRaceStore.setState({ raceState: null }) })

  it('counts deployments from the incident log, not the live state', () => {
    /*
     * Derived from the log rather than tracked as a local edge, and this test is
     * why. A consumer that watched `safetyCar !== null` for a rising edge would
     * miss a second deployment if it happened to be sampled while the flag was
     * already up, and React 19 may batch two ticks into one render. The log is
     * append-only, so the count is monotonic and cannot be missed.
     */
    const { result, rerender } = renderHook(() => useSafetyCarDeployCount())
    expect(result.current).toBe(0)

    act(() => { setRaceState({ deployedLap: 5, lapsRemaining: 3, cause: 'crash' }, [incident('safety_car_deployed')]) })
    rerender()
    expect(result.current).toBe(1)

    // Ended, then a second deployment -- both log entries present at once.
    act(() => {
      setRaceState({ deployedLap: 30, lapsRemaining: 4, cause: 'mechanical' }, [
        incident('safety_car_deployed'), incident('safety_car_ended'), incident('safety_car_deployed'),
      ])
    })
    rerender()
    expect(result.current, 'safety_car_ended must not be counted').toBe(2)
  })

  it('does not count driver errors or crashes', () => {
    const { result, rerender } = renderHook(() => useSafetyCarDeployCount())
    act(() => { setRaceState(null, [incident('driver_error'), incident('crash')]) })
    rerender()
    expect(result.current).toBe(0)
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run tests/ui/safetyCarHook.test.tsx`
Expected: FAIL — cannot resolve `@hooks/useSafetyCar`.

- [ ] **Step 4: Implement the hook**

Create `src/hooks/useSafetyCar.ts`:

```ts
import { useRaceStore } from '@state/raceStore'
import type { SafetyCarState } from '@engine/types'

/**
 * The single read of safety-car state for the whole UI.
 *
 * Four surfaces need this (banner, pit panel, timing tower, track canvas) and
 * they must agree: a banner saying SAFETY CAR while the pit panel quotes the
 * full green-flag pit loss is worse than showing neither.
 */
export function useSafetyCar(): SafetyCarState | null {
  return useRaceStore(s => s.raceState?.safetyCar ?? null)
}

/**
 * How many safety cars have been deployed this race so far.
 *
 * DERIVED FROM THE INCIDENT LOG, not from watching `safetyCar` go null -> set.
 * The log is append-only and monotonic, so a consumer that fires a one-shot in
 * a `useEffect` keyed on this number cannot miss a deployment even if two sim
 * ticks land in one React render. An edge detector can, and the race allows
 * more than one safety car (`safetyCar.maxPerRace`).
 */
export function useSafetyCarDeployCount(): number {
  return useRaceStore(s =>
    s.raceState?.incidents.reduce((n, i) => n + (i.kind === 'safety_car_deployed' ? 1 : 0), 0) ?? 0,
  )
}
```

- [ ] **Step 5: Verify the token contrast claim**

Run this and confirm every printed ratio is ≥ 4.5. This checks the numbers written into the CSS comment are true, not aspirational:

```bash
python3 -c "
def lum(h):
    h=h.lstrip('#'); c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    c=[x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def cr(a,b):
    l1,l2=sorted([lum(a),lum(b)],reverse=True); return (l1+0.05)/(l2+0.05)
for name,bg in [('--bg-panel','#121829'),('--bg-elevated','#1B2238'),('--bg-deep on caution','#0A0E1A')]:
    print(f'{name:24} {cr(\"#FFB020\",bg):.2f}:1')
"
```

Expected: `9.66`, `8.62`, `10.53`.

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run tests/ui/safetyCarHook.test.tsx && npx tsc --noEmit`
Expected: PASS, and tsc silent.

- [ ] **Step 7: Commit**

```bash
git add src/styles/tokens.css src/hooks/useSafetyCar.ts tests/ui/safetyCarHook.test.tsx
git commit -m "feat(ui): the --caution token and the shared safety-car hook

Spec section 6 needs a caution colour that is not a compound colour, and
four surfaces that agree on safety-car state. The deploy count is derived
from the append-only incident log rather than an edge on the live flag, so
a one-shot cannot be missed when two sim ticks land in one render."
```

---

### Task 2: The safety car banner

Spec §6 surface 1, and the piece that carries the whole feature's quality floor: the words, the countdown, the haptic, the screen-reader label, the reduced-motion fallback.

**Files:**
- Create: `src/ui/SafetyCarBanner.tsx`
- Modify: `src/ui/RaceHUD.tsx`
- Test: `tests/ui/safetyCarBanner.test.tsx`

**Interfaces:**
- Consumes: `useSafetyCar`, `useSafetyCarDeployCount` (Task 1); `useHaptics` from `@hooks/useHaptics` (exports `{ impact, success, warning }` — use `warning()`, which maps to `NotificationType.Warning`); `useSettingsStore(s => s.reducedMotion)`.
- Produces: `<SafetyCarBanner />`, rendered by `RaceHUD` directly above the `<TimingTower />` block.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/safetyCarBanner.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import { SafetyCarBanner } from '@ui/SafetyCarBanner'
import type { IncidentEvent, RaceState, SafetyCarState } from '@engine/types'

const warning = vi.fn()
vi.mock('@hooks/useHaptics', async (orig) => ({
  ...(await orig<typeof import('@hooks/useHaptics')>()),
  useHaptics: () => ({ impact: vi.fn(), success: vi.fn(), warning }),
}))

function deployed(): IncidentEvent {
  return { lap: 3, sector: 0, kind: 'safety_car_deployed', driverId: null, timeLoss: null }
}

function setRaceState(safetyCar: SafetyCarState | null, incidents: IncidentEvent[]) {
  act(() => {
    useRaceStore.setState({ raceState: { safetyCar, incidents } as unknown as RaceState })
  })
}

describe('SafetyCarBanner', () => {
  beforeEach(() => {
    warning.mockClear()
    useRaceStore.setState({ raceState: null })
    useSettingsStore.setState({ reducedMotion: false, hapticsEnabled: true })
  })

  it('renders nothing when no safety car is out', () => {
    const { container } = render(<SafetyCarBanner />)
    expect(container.textContent).toBe('')
    setRaceState(null, [])
    expect(container.textContent).toBe('')
  })

  it('carries the literal words SAFETY CAR -- colour is never the only signal', () => {
    render(<SafetyCarBanner />)
    setRaceState({ deployedLap: 12, lapsRemaining: 4, cause: 'crash' }, [deployed()])
    expect(screen.getByText(/SAFETY CAR/)).toBeTruthy()
  })

  it('counts down the laps remaining', () => {
    render(<SafetyCarBanner />)
    setRaceState({ deployedLap: 12, lapsRemaining: 4, cause: 'crash' }, [deployed()])
    expect(screen.getByText(/4 LAPS/)).toBeTruthy()
    setRaceState({ deployedLap: 12, lapsRemaining: 1, cause: 'crash' }, [deployed()])
    expect(screen.getByText(/1 LAP\b/), 'singular at one lap').toBeTruthy()
  })

  it('exposes a live screen-reader announcement naming the state and the countdown', () => {
    render(<SafetyCarBanner />)
    setRaceState({ deployedLap: 12, lapsRemaining: 3, cause: 'crash' }, [deployed()])
    const live = screen.getByRole('status')
    expect(live.getAttribute('aria-live')).toBe('assertive')
    expect(live.textContent).toMatch(/safety car/i)
    expect(live.textContent).toMatch(/3/)
  })

  it('fires exactly one haptic per deployment, and fires again on a second one', () => {
    /*
     * FAILS IF the haptic is keyed on the banner rendering or on `safetyCar`
     * being truthy rather than on the deploy COUNT -- either of which re-fires
     * the buzz on every sim tick for the whole safety car period, roughly 15
     * times per deployment.
     */
    render(<SafetyCarBanner />)
    const sc: SafetyCarState = { deployedLap: 12, lapsRemaining: 4, cause: 'crash' }
    setRaceState(sc, [deployed()])
    expect(warning).toHaveBeenCalledTimes(1)

    // Three more ticks of the SAME deployment: countdown moves, no new buzz.
    setRaceState({ ...sc, lapsRemaining: 3 }, [deployed()])
    setRaceState({ ...sc, lapsRemaining: 2 }, [deployed()])
    setRaceState({ ...sc, lapsRemaining: 1 }, [deployed()])
    expect(warning, 'one buzz per deployment, not per tick').toHaveBeenCalledTimes(1)

    // Green flag, then a second safety car later in the race.
    setRaceState(null, [deployed()])
    expect(warning).toHaveBeenCalledTimes(1)
    setRaceState({ deployedLap: 40, lapsRemaining: 5, cause: 'mechanical' }, [deployed(), deployed()])
    expect(warning, 'a second deployment is a second buzz').toHaveBeenCalledTimes(2)
  })

  it('still shows the words and the countdown under reduced motion', () => {
    // The pulse goes; the information must not.
    useSettingsStore.setState({ reducedMotion: true })
    render(<SafetyCarBanner />)
    setRaceState({ deployedLap: 12, lapsRemaining: 2, cause: 'crash' }, [deployed()])
    expect(screen.getByText(/SAFETY CAR/)).toBeTruthy()
    expect(screen.getByText(/2 LAPS/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/ui/safetyCarBanner.test.tsx`
Expected: FAIL — cannot resolve `@ui/SafetyCarBanner`.

- [ ] **Step 3: Implement the banner**

Create `src/ui/SafetyCarBanner.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSafetyCar, useSafetyCarDeployCount } from '@hooks/useSafetyCar'
import { useSettingsStore } from '@state/settingsStore'
import { useHaptics } from '@hooks/useHaptics'

/**
 * Spec section 6, surface 1. Full width, above the timing tower.
 *
 * The banner is the signal for the whole feature -- the canvas wash and the
 * tower flash are atmosphere around it. So it carries the quality floor: the
 * literal words (colour is never the only signal), a countdown, one haptic per
 * deployment, a live region for screen readers, and a reduced-motion path that
 * drops the pulse without dropping any information.
 */
export function SafetyCarBanner() {
  const safetyCar = useSafetyCar()
  const deployCount = useSafetyCarDeployCount()
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const { warning } = useHaptics()

  // One buzz per DEPLOYMENT. Keyed on the count, not on `safetyCar` being
  // truthy: the latter re-fires on every sim tick for the whole period.
  const buzzedForRef = useRef(0)
  useEffect(() => {
    if (deployCount > buzzedForRef.current) {
      buzzedForRef.current = deployCount
      warning()
    }
    // `warning` is recreated each render by useHaptics; deployCount is the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployCount])

  const laps = safetyCar?.lapsRemaining ?? 0
  const lapText = `${laps} LAP${laps === 1 ? '' : 'S'}`

  return (
    <AnimatePresence>
      {safetyCar && (
        <motion.div
          key="sc-banner"
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.22 }}
          style={{ overflow: 'hidden', flexShrink: 0, margin: '8px 8px 0' }}
        >
          <motion.div
            // The "living gauge" language of CLAUDE.md 6.2: a slow throb, not a
            // static bar. Reduced motion pins it to the bright end -- the state
            // stays legible, only the movement goes.
            animate={reducedMotion ? { opacity: 1 } : { opacity: [1, 0.62, 1] }}
            transition={reducedMotion ? { duration: 0 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, padding: '8px 14px', borderRadius: 8,
              background: 'var(--caution)',
              border: '1px solid var(--caution)',
            }}
          >
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
              // --bg-deep on --caution measures 10.53:1.
              color: 'var(--bg-deep)', letterSpacing: '0.14em', whiteSpace: 'nowrap',
            }}>
              ⚠ SAFETY CAR
            </span>
            <span className="mono" style={{
              fontSize: 12, fontWeight: 700, color: 'var(--bg-deep)',
              letterSpacing: '0.06em', whiteSpace: 'nowrap',
            }}>
              {lapText}
            </span>
          </motion.div>

          {/*
            Separate from the visual row on purpose. The row is a pulsing element
            with abbreviated, styled text; this is one calm sentence, announced
            once per change. Visually hidden rather than aria-label'd onto the row
            so the announcement can differ from the terse on-screen copy.
          */}
          <span
            role="status"
            aria-live="assertive"
            style={{
              position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
              overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
            }}
          >
            {`Safety car deployed. ${laps} lap${laps === 1 ? '' : 's'} remaining.`}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 4: Wire it into the HUD**

In `src/ui/RaceHUD.tsx`, add the import beside the other `./` UI imports:

```tsx
import { SafetyCarBanner } from './SafetyCarBanner'
```

Then place the banner immediately before the RACE LEADERBOARD block — spec §6 says "above the timing tower". Find this existing comment and the `<div>` that follows it:

```tsx
            {/* RACE LEADERBOARD — full field by default, NEARBY toggle for a
                tighter context window (label lives in TimingTower's own header) */}
```

Insert directly ABOVE that comment:

```tsx
            {/* Safety car — spec section 6 surface 1, above the tower because
                its consequence (the field bunching) is read in the tower. */}
            {(phase === 'racing' || phase === 'starting') && <SafetyCarBanner />}

```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/ui/safetyCarBanner.test.tsx && npx tsc --noEmit`
Expected: PASS, tsc silent.

- [ ] **Step 6: Verify the haptic test actually bites**

Temporarily change the `useEffect` dependency from `[deployCount]` to `[safetyCar]` and re-run.
Expected: the "exactly one haptic per deployment" test FAILS with more than 1 call.
Then revert the change and confirm the test passes again. Do not commit the mutation.

- [ ] **Step 7: Run the full suite and commit**

```bash
npm test && npx tsc --noEmit
git add src/ui/SafetyCarBanner.tsx src/ui/RaceHUD.tsx tests/ui/safetyCarBanner.test.tsx
git commit -m "feat(ui): the safety car banner -- words, countdown, haptic, live region

Spec section 6 surface 1. Carries the feature's quality floor: the literal
words so colour is never the only signal, a laps-remaining countdown, one
haptic per deployment keyed on the incident-log count rather than the live
flag, an assertive live region, and a reduced-motion path that drops the
throb without dropping any information."
```

---

### Task 3: The pit panel states the safety-car discount

Spec §6 surface 2. "The feature is worthless if exploiting it requires knowing the mechanic."

**Files:**
- Modify: `src/ui/PitPanel.tsx`
- Test: `tests/ui/pitPanelDiscount.test.tsx`

**Interfaces:**
- Consumes: `useSafetyCar` (Task 1); `effectivePitLaneLoss` from `@engine/incidents` — signature `(circuit: CircuitSpec, safetyCar: SafetyCarState | null, tuning: TuningConstants) => number`.
- Produces: nothing consumed by later tasks.

Note: `effectivePitLaneLoss` is already imported and used in `src/state/raceStore.ts`. Import it in `PitPanel.tsx` the same way. Do NOT hardcode the discount — the point of that function is that it is the single source of truth, and a display that computed its own number could promise a discount the race then failed to give.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/pitPanelDiscount.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { PitPanel } from '@ui/PitPanel'
import { loadGameData } from '@data/validators'
import { makeTuning } from '../fixtures/tuning'
import type { RaceConfig, RaceState, SafetyCarState } from '@engine/types'

const DATA = loadGameData()
const circuit = DATA.circuits['veloce']!   // pitLaneTimeLoss 18.0
const tuning = makeTuning({})

const config = {
  circuit, tuning, compounds: DATA.compounds,
  drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
  strategies: DATA.strategies.defaults, playerDriverId: DATA.drivers.drivers[0]!.id, seed: 1,
} as RaceConfig

function open(safetyCar: SafetyCarState | null) {
  act(() => {
    useRaceStore.setState({
      pitPanelOpen: true,
      config,
      projectionResult: null,
      raceState: { safetyCar, incidents: [], lap: 10, weatherTimeline: [], weatherState: 'DRY' } as unknown as RaceState,
    })
  })
}

describe('PitPanel safety-car discount', () => {
  beforeEach(() => {
    useRaceStore.setState({ pitPanelOpen: false, raceState: null, config: null, projectionResult: null })
  })

  it('states the green-flag pit loss from the circuit', () => {
    render(<PitPanel />)
    open(null)
    expect(screen.getByText(/PIT LOSS/)).toBeTruthy()
    expect(screen.getByText(/18\.0s/), 'veloce pitLaneTimeLoss is 18.0').toBeTruthy()
    expect(screen.queryByText(/UNDER SAFETY CAR/), 'no discount line under green').toBeNull()
  })

  it('states the discounted loss AND the saving under a safety car', () => {
    /*
     * FAILS IF the panel keeps quoting the circuit's green-flag number while a
     * safety car is out -- which is the exact failure that makes the feature
     * unexploitable, since the player has no other way to learn the discount.
     * Both numbers are asserted: the loss that now applies, and the saving
     * against the green-flag figure, because only the saving explains WHY now.
     */
    render(<PitPanel />)
    open({ deployedLap: 9, lapsRemaining: 3, cause: 'crash' })
    const under = tuning.incidents.safetyCar.laneTimeLossUnderSc
    const saving = circuit.pitLaneTimeLoss - under
    expect(saving, 'the fixture must actually produce a discount').toBeGreaterThan(0)
    expect(screen.getByText(new RegExp(`${under.toFixed(1)}s`))).toBeTruthy()
    expect(screen.getByText(/UNDER SAFETY CAR/)).toBeTruthy()
    expect(screen.getByText(new RegExp(`−${saving.toFixed(1)}s`))).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/ui/pitPanelDiscount.test.tsx`
Expected: FAIL — no `PIT LOSS` text in the panel.

- [ ] **Step 3: Implement the display**

In `src/ui/PitPanel.tsx`, add to the imports:

```tsx
import { effectivePitLaneLoss } from '@engine/incidents'
import { useSafetyCar } from '@hooks/useSafetyCar'
```

Add this component immediately above `const ALL_COMPOUNDS`:

```tsx
/**
 * Spec section 6 surface 2 -- the pit loss that applies RIGHT NOW.
 *
 * Routed through effectivePitLaneLoss rather than computed here. That function
 * is the single source of truth shared with race.ts, projection.ts and
 * raceStore.ts; a display that did its own arithmetic could promise a discount
 * the race then failed to give, by 8-12s, on the game's centrepiece decision.
 */
function PitLossLine() {
  const config = useRaceStore(s => s.config)
  const safetyCar = useSafetyCar()
  if (!config) return null

  const loss = effectivePitLaneLoss(config.circuit, safetyCar, config.tuning)
  const saving = config.circuit.pitLaneTimeLoss - loss
  const discounted = safetyCar !== null && saving > 0

  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
      marginBottom: 14, paddingBottom: 10,
      borderBottom: '1px solid var(--line-hair)',
    }}>
      <span style={{
        fontFamily: 'var(--font-display)', fontSize: 10,
        color: 'var(--text-dim)', letterSpacing: '0.1em',
      }}>
        PIT LOSS
      </span>
      <span className="mono" style={{
        fontSize: 18, fontWeight: 700,
        color: discounted ? 'var(--caution)' : 'var(--text-hi)',
      }}>
        {loss.toFixed(1)}s
      </span>
      {discounted && (
        <span className="mono" style={{
          fontSize: 11, fontWeight: 700, color: 'var(--caution)', letterSpacing: '0.04em',
        }}>
          −{saving.toFixed(1)}s UNDER SAFETY CAR
        </span>
      )}
    </div>
  )
}
```

Then render it inside `PitPanelDrawer`, immediately after the header row's closing `</div>` and before the projection card. Find:

```tsx
      {projectionResult && <ProjectionCard result={projectionResult} />}
```

and replace it with:

```tsx
      <PitLossLine />

      {projectionResult && <ProjectionCard result={projectionResult} />}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/ui/pitPanelDiscount.test.tsx && npx tsc --noEmit`
Expected: PASS, tsc silent.

- [ ] **Step 5: Verify the test bites**

Temporarily replace `effectivePitLaneLoss(config.circuit, safetyCar, config.tuning)` with `config.circuit.pitLaneTimeLoss`.
Expected: the second test FAILS. Revert and confirm it passes. Do not commit the mutation.

- [ ] **Step 6: Run the full suite and commit**

```bash
npm test && npx tsc --noEmit
git add src/ui/PitPanel.tsx tests/ui/pitPanelDiscount.test.tsx
git commit -m "feat(ui): the pit panel states the safety-car discount

Spec section 6 surface 2. Shows the loss that applies now and the saving
against the green-flag figure, since only the saving explains why to pit
now. Routed through effectivePitLaneLoss so the panel cannot promise a
discount the race then fails to give."
```

---

### Task 4: Commentary lines for incidents

Spec §6 surface 3, "the cheapest win available: the component exists, and this is where the race acquires a narrative."

**Files:**
- Modify: `src/data/commentary.json`
- Modify: `src/state/commentaryMapper.ts`
- Test: `tests/state/commentaryMapper.test.ts` (exists — add to it)

**Interfaces:**
- Consumes: `RaceState.incidents`, `RaceState.safetyCar`.
- Produces: `CommentaryState` gains one field, `prevIncidentCount: number`. `makeCommentaryState()` initialises it to 0.

Note: `CommentaryTicker.tsx` needs no change — it renders whatever lines the mapper returns.

Note on retirement lines: the mapper already emits a generic `retired` line for any retirement. A crash now ALSO produces a `crash` incident, so a crashed car would get two lines. Suppress the generic one when the car's `retiredCause` is `'crash'`, so the more specific line wins.

- [ ] **Step 1: Add the line pools**

In `src/data/commentary.json`, add four keys alongside the existing ones. Match the existing file's neutral, terse broadcast voice and its `{var}` placeholder style:

```json
  "driver_error": ["Lap {lap}: {code} runs wide and loses {loss}s."],
  "crash": ["Lap {lap}: {code} is into the barriers — race over."],
  "safety_car_deployed": ["Safety car deployed on lap {lap}."],
  "safety_car_ended": ["Safety car in this lap — green flag on lap {lap}."]
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/state/commentaryMapper.test.ts`. The file already provides
`makeCar({ driverId, teamId, ...overrides })`, `makeConfig(drivers: {id, code}[])` and
`makeState(cars, overrides?)` — reuse them exactly as written below; do not add parallel helpers.
Add `IncidentEvent` to the existing `@engine/types` type import.

```ts
describe('incident commentary', () => {
  function inc(kind: IncidentEvent['kind'], over: Partial<IncidentEvent> = {}): IncidentEvent {
    return { lap: 6, sector: 1, kind, driverId: null, timeLoss: null, ...over }
  }
  const CONFIG = makeConfig([{ id: 'a', code: 'AAA' }, { id: 'b', code: 'BBB' }])
  const CARS = [
    makeCar({ driverId: 'a', teamId: 'a', position: 3 }),
    makeCar({ driverId: 'b', teamId: 'b', position: 4 }),
  ]

  it('reports only incidents new since the last tick', () => {
    /*
     * FAILS IF the mapper re-reads the whole log each tick. The log is
     * append-only and reaches ~100 entries in a race; a mapper that emitted
     * every entry every tick would flood the ticker and make it useless.
     * Mirrors how prevOvertakeCount already works.
     */
    let cs = makeCommentaryState()

    const first = processCommentaryTick(
      makeState(CARS, { incidents: [inc('safety_car_deployed')] }), CONFIG, cs)
    cs = first.next
    expect(first.lines.some(l => /safety car deployed/i.test(l))).toBe(true)

    // Same log, next tick: nothing new to say.
    const second = processCommentaryTick(
      makeState(CARS, { incidents: [inc('safety_car_deployed')] }), CONFIG, cs)
    cs = second.next
    expect(second.lines.some(l => /safety car deployed/i.test(l)), 'must not repeat').toBe(false)

    // One more entry appended: only THAT one is reported.
    const third = processCommentaryTick(
      makeState(CARS, { incidents: [inc('safety_car_deployed'), inc('safety_car_ended')] }), CONFIG, cs)
    expect(third.lines.some(l => /green flag/i.test(l))).toBe(true)
    expect(third.lines.some(l => /safety car deployed/i.test(l))).toBe(false)
  })

  it('names the driver and the time lost on an error', () => {
    const { lines } = processCommentaryTick(
      makeState(CARS, { incidents: [inc('driver_error', { driverId: 'a', timeLoss: 3.42 })] }),
      CONFIG, makeCommentaryState())
    const line = lines.find(l => /runs wide/i.test(l))
    expect(line, 'an error should produce a line').toBeTruthy()
    expect(line!).toContain('AAA')
    expect(line!, 'one decimal, not 3.42 and not the raw {loss} placeholder').toContain('3.4s')
    expect(line!).not.toContain('{')
  })

  it('does not also emit the generic retirement line for a crash', () => {
    // Both the crash incident and the retirement fire on the same tick; the
    // specific line must win rather than the ticker reporting it twice.
    const cars = [
      makeCar({ driverId: 'a', teamId: 'a', position: 3, retired: true, retiredCause: 'crash', retiredLap: 6 }),
      makeCar({ driverId: 'b', teamId: 'b', position: 4 }),
    ]
    const { lines } = processCommentaryTick(
      makeState(cars, { incidents: [inc('crash', { driverId: 'a' })] }),
      CONFIG, makeCommentaryState())
    expect(lines.filter(l => l.includes('AAA')), 'exactly one line about this car').toHaveLength(1)
  })

  it('still emits the generic retirement line for a non-crash retirement', () => {
    // The suppression must be narrow. A mechanical or tyre retirement has no
    // incident-log entry of its own, so suppressing it would lose the line.
    const cars = [
      makeCar({ driverId: 'a', teamId: 'a', position: 3, retired: true, retiredCause: 'mechanical', retiredLap: 6 }),
      makeCar({ driverId: 'b', teamId: 'b', position: 4 }),
    ]
    const { lines } = processCommentaryTick(
      makeState(cars, {}), CONFIG, makeCommentaryState())
    expect(lines.some(l => l.includes('AAA')), 'a mechanical DNF still gets its line').toBe(true)
  })
})
```

- [ ] **Step 3: Run and confirm failure**

Run: `npx vitest run tests/state/commentaryMapper.test.ts`
Expected: FAIL — no incident lines emitted.

- [ ] **Step 4: Implement the mapper changes**

In `src/state/commentaryMapper.ts`:

Add `prevIncidentCount: number` to the `CommentaryState` interface, and `prevIncidentCount: 0` to `makeCommentaryState()`.

Insert this block after the overtake block and before the "Pits + retirements" loop:

```ts
  // Incidents — only entries appended since the last tick. The log is
  // append-only and reaches ~100 entries in a race, so re-reading it whole
  // every tick would flood the ticker. Same shape as prevOvertakeCount above.
  const newIncidentCount = state.incidents.length
  for (let i = prev.prevIncidentCount; i < newIncidentCount; i++) {
    const ev = state.incidents[i]!
    const code = ev.driverId ? codeFor(config, ev.driverId) : ''
    const evLap = ev.lap + 1
    switch (ev.kind) {
      case 'driver_error': {
        const line = fill('driver_error', { lap: evLap, code, loss: (ev.timeLoss ?? 0).toFixed(1) })
        if (line) lines.push(line)
        break
      }
      case 'crash': {
        const line = fill('crash', { lap: evLap, code })
        if (line) lines.push(line)
        break
      }
      case 'safety_car_deployed': {
        const line = fill('safety_car_deployed', { lap: evLap })
        if (line) lines.push(line)
        break
      }
      case 'safety_car_ended': {
        const line = fill('safety_car_ended', { lap: evLap })
        if (line) lines.push(line)
        break
      }
      default: {
        const _exhaustive: never = ev.kind
        void _exhaustive
      }
    }
  }
  next.prevIncidentCount = newIncidentCount
```

Then, in the retirement branch of the existing "Pits + retirements" loop, suppress the generic line for a crash. Change:

```ts
    if (car.retired && !wasRetired) {
```

to:

```ts
    // A crash already produced its own, more specific line from the incident
    // log above. Emitting the generic one too would report it twice.
    if (car.retired && !wasRetired && car.retiredCause !== 'crash') {
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/state/commentaryMapper.test.ts && npx tsc --noEmit`
Expected: PASS, tsc silent. The `never` guard means a future `IncidentKind` addition fails typecheck here rather than silently going unreported.

- [ ] **Step 6: Run the full suite and commit**

```bash
npm test && npx tsc --noEmit
git add src/data/commentary.json src/state/commentaryMapper.ts tests/state/commentaryMapper.test.ts
git commit -m "feat(ui): commentary lines for errors, crashes and the safety car

Spec section 6 surface 3 -- where the race acquires a narrative. Reports
only log entries appended since the last tick, matching prevOvertakeCount,
and suppresses the generic retirement line for a crash so the specific
line wins instead of the ticker saying it twice."
```

---

### Task 5: The timing tower compression flash

Spec §6 surface 4: "a ×0.35 collapse is the most dramatic reorder in the game… this adds a one-shot flash on affected rows and nothing else."

**Files:**
- Modify: `src/ui/TimingTower.tsx`
- Test: `tests/ui/timingTowerFlash.test.tsx`

**Interfaces:**
- Consumes: `useSafetyCarDeployCount` (Task 1); `useSettingsStore(s => s.reducedMotion)`.
- Produces: nothing consumed by later tasks.

Scope discipline: this task adds a caution tint to rows for ~1.2s after a deployment. It does NOT touch the existing FLIP `layout` reordering, the gain/loss position flash, or the fresh-tyre shimmer — those already work and are out of scope.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/timingTowerFlash.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import { TimingTower } from '@ui/TimingTower'
import { loadGameData } from '@data/validators'
import { makeTuning } from '../fixtures/tuning'
import { initRace } from '@engine/index'
import type { IncidentEvent, RaceConfig, RaceState } from '@engine/types'

const DATA = loadGameData()
const config = {
  circuit: DATA.circuits['veloce']!, tuning: makeTuning({}), compounds: DATA.compounds,
  drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
  strategies: DATA.strategies.defaults, playerDriverId: DATA.drivers.drivers[0]!.id, seed: 1,
} as RaceConfig

const base: RaceState = initRace(config)

function deployed(): IncidentEvent {
  return { lap: 3, sector: 0, kind: 'safety_car_deployed', driverId: null, timeLoss: null }
}

function setState(incidents: IncidentEvent[]) {
  act(() => {
    useRaceStore.setState({
      config,
      raceState: { ...base, incidents, safetyCar: incidents.length ? { deployedLap: 3, lapsRemaining: 4, cause: 'crash' } : null },
    })
  })
}

/** Rows carry the caution tint via an inline background containing the token. */
function flashedRowCount(container: HTMLElement): number {
  return [...container.querySelectorAll<HTMLElement>('[data-tower-row]')]
    .filter(el => el.style.background.includes('--caution')).length
}

describe('TimingTower compression flash', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useSettingsStore.setState({ reducedMotion: false })
    useRaceStore.setState({ raceState: null, config: null, pitPanelOpen: false, projectionResult: null })
  })
  afterEach(() => { vi.useRealTimers() })

  it('does not tint rows under green flag', () => {
    const { container } = render(<TimingTower />)
    setState([])
    expect(flashedRowCount(container)).toBe(0)
  })

  it('tints rows on deployment and clears the tint afterwards', () => {
    /*
     * FAILS IF the flash never clears -- a permanent tint would make the whole
     * tower unreadable for the rest of the race, and is the likeliest bug in a
     * timeout-driven one-shot.
     */
    const { container } = render(<TimingTower />)
    setState([])
    setState([deployed()])
    expect(flashedRowCount(container), 'every visible row is compressed').toBeGreaterThan(0)

    act(() => { vi.advanceTimersByTime(2000) })
    expect(flashedRowCount(container), 'the flash is a one-shot, not a mode').toBe(0)
  })

  it('does not tint under reduced motion', () => {
    // The banner already carries this information statically; a flash with no
    // motion budget is decoration, and CLAUDE.md 6.4 says cut decoration.
    useSettingsStore.setState({ reducedMotion: true })
    const { container } = render(<TimingTower />)
    setState([])
    setState([deployed()])
    expect(flashedRowCount(container)).toBe(0)
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/ui/timingTowerFlash.test.tsx`
Expected: FAIL — no `data-tower-row` attribute exists yet, so the count is 0 in the deployment case.

- [ ] **Step 3: Implement the flash**

In `src/ui/TimingTower.tsx`:

Add to the imports:

```tsx
import { useSafetyCarDeployCount } from '@hooks/useSafetyCar'
```

Add `compressed?: boolean` to `TowerRow`'s props type and destructuring.

Inside `TowerRow`, the existing `rowBg` computation is:

```tsx
  const rowBg = car.isPlayer
    ? fresh
      ? 'rgba(0,229,208,0.14)'
      : 'rgba(0,229,208,0.07)'
    : 'transparent'
```

Replace it with:

```tsx
  // The compression flash wins over the player highlight for its ~1.2s: the
  // field collapsing is the more urgent thing to communicate, and the row
  // returns to its normal state immediately after.
  const rowBg = compressed
    ? 'color-mix(in srgb, var(--caution) 22%, transparent)'
    : car.isPlayer
    ? fresh
      ? 'rgba(0,229,208,0.14)'
      : 'rgba(0,229,208,0.07)'
    : 'transparent'
```

On the row's `<motion.div>`, add the test hook attribute alongside `layout` / `layoutId`:

```tsx
      data-tower-row
```

In the `TimingTower` component body, add after the other hook calls (before the `if (!raceState || !config) return null` guard, so hook order stays unconditional):

```tsx
  const deployCount = useSafetyCarDeployCount()
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const [compressing, setCompressing] = useState(false)

  // One-shot flash on deployment. Spec section 6 surface 4: the compression is
  // the most dramatic reorder in the game, and the FLIP layout animation alone
  // does not explain WHY twenty rows moved at once.
  useEffect(() => {
    if (deployCount === 0 || reducedMotion) return
    setCompressing(true)
    const t = setTimeout(() => setCompressing(false), 1200)
    return () => clearTimeout(t)
  }, [deployCount, reducedMotion])
```

Then pass it down at the `<TowerRow ... />` call site:

```tsx
                compressed={compressing}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/ui/timingTowerFlash.test.tsx && npx tsc --noEmit`
Expected: PASS, tsc silent.

- [ ] **Step 5: Verify the clear-down test bites**

Temporarily delete the `setTimeout(...)` line so `compressing` never returns to false.
Expected: the "clears the tint afterwards" test FAILS. Revert. Do not commit the mutation.

- [ ] **Step 6: Run the full suite and commit**

```bash
npm test && npx tsc --noEmit
git add src/ui/TimingTower.tsx tests/ui/timingTowerFlash.test.tsx
git commit -m "feat(ui): timing tower compression flash on safety car deployment

Spec section 6 surface 4. A one-shot caution tint for 1.2s, so twenty rows
moving at once reads as the field bunching rather than as a glitch. Adds
nothing else: the FLIP reordering, position flash and fresh-tyre shimmer
are untouched."
```

---

### Task 6: The track canvas yellow wash

Spec §6 surface 5, explicitly "deliberately modest: the banner is the signal, the canvas is atmosphere."

**Files:**
- Modify: `src/canvas/TrackCanvas.tsx`
- Test: none (see below)

**Interfaces:**
- Consumes: `useRaceStore.getState().raceState?.safetyCar` — the canvas reads the store imperatively inside the Pixi ticker, matching how it already reads `weatherState`. It does NOT use the React hooks from Task 1, which cannot be called from a ticker callback.
- Produces: nothing.

**On testing:** the canvas has no existing test — Pixi's WebGL renderer does not initialise under jsdom, which is why `RaceHUD` wraps it in `CanvasBoundary`. Do not add a jsdom test for this task; a test that mocks all of Pixi would assert only that the mock was called. This task's verification is the typecheck, the clean build, and a visual check in the browser preview. Say so plainly in the commit rather than implying coverage that does not exist.

- [ ] **Step 1: Read the existing atmosphere path**

`drawAtmosphere(graphics, cw, ch, atmosphere, weatherState)` draws the full-canvas gradient wash, and `redrawAtmosphere(weatherState)` calls it plus `drawTrack`. There is a `lastWeather` variable guarding redraws. Read lines 298-340 and 400-450 before changing anything: the wash must layer *on top of* the atmosphere without replacing it, or a wet race under a safety car loses its rain tint.

- [ ] **Step 2: Add a dedicated caution overlay layer**

Add a new `PIXI.Graphics` for the wash, placed just above the marker layer and below the cars — the cars must stay fully legible through it. Beside the existing layer construction:

```tsx
        const cautionGfx = new PIXI.Graphics()
```

and in the `addChildAt` sequence, insert it at index 4, shifting `wetOverlayGfx` to 5 and `rainGfx` accordingly (it is added with plain `addChild` at the front, so it needs no change):

```tsx
        app.stage.addChildAt(cautionGfx, 4)
        app.stage.addChildAt(wetOverlayGfx, 5)
```

Update the layer-order comment above that block to name the new layer.

- [ ] **Step 3: Draw and clear the wash from the ticker**

In the ticker callback, beside where `weatherState` is read from the store, add:

```tsx
        // Deliberately modest per spec section 6 surface 5: the banner is the
        // signal, this is atmosphere. A flat 5% caution wash over the whole
        // canvas, redrawn only when the flag state actually changes.
        const scActive = useRaceStore.getState().raceState?.safetyCar != null
        if (scActive !== lastSafetyCar) {
          cautionGfx.clear()
          if (scActive) {
            cautionGfx.rect(0, 0, cw, ch).fill({ color: 0xFFB020, alpha: 0.05 })
          }
          lastSafetyCar = scActive
        }
```

Declare `let lastSafetyCar = false` beside the existing `lastWeather` declaration.

Note the raw hex here: Pixi takes numeric colours and cannot read CSS custom properties. This is the same constraint `COMPOUND_COLORS` documents in `TimingTower.tsx`. Add a comment saying `0xFFB020` is `--caution` and that the two must be changed together.

- [ ] **Step 4: Make cars visibly slower**

The spec asks that cars "visibly slow". They already do — `lapModel.ts` applies `safetyCar.paceMultiplier`, and the canvas interpolates from race positions, so this is automatic. Confirm by reading the interpolation code and add no new logic. If it turns out the canvas interpolates on a fixed wall-clock rate independent of sector times, report that as a finding rather than fixing it here — that would be a separate change with its own risk.

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean.

- [ ] **Step 6: Visual verification**

Start the dev server via the preview tool, run a race at 4× until a safety car deploys (the engine produces roughly 0.52 per race, so several races may be needed — or temporarily raise `incidents.safetyCar.crashDeployChance` in a scratch copy to force one, and revert). Confirm: the banner appears, the tower tints, the canvas washes yellow, and the pit panel shows the discount. Screenshot the result.

- [ ] **Step 7: Commit**

```bash
git add src/canvas/TrackCanvas.tsx
git commit -m "feat(ui): a caution wash on the track canvas under safety car

Spec section 6 surface 5, deliberately modest -- the banner is the signal,
this is atmosphere. A flat 5% wash on its own layer below the cars, redrawn
only on a flag-state change so it costs nothing per frame.

Not unit tested: Pixi's renderer does not initialise under jsdom, which is
why RaceHUD wraps the canvas in an error boundary. Verified by typecheck,
build, and a visual check with a forced deployment."
```

---

## Self-Review

**Spec §6 coverage:** surface 1 → Task 2; surface 2 → Task 3; surface 3 → Task 4; surface 4 → Task 5; surface 5 → Task 6. Quality floor: literal words (Task 2 Step 1 test), `--caution` AA (Task 1 Step 5), reduced motion (Tasks 2 and 5, both tested), haptic (Task 2, mutation-verified), screen-reader label (Task 2, tested).

**Type consistency:** `useSafetyCar` / `useSafetyCarDeployCount` are defined in Task 1 and consumed by Tasks 2, 3 and 5 under exactly those names. `effectivePitLaneLoss`'s signature in Task 3 matches its definition in `src/engine/incidents.ts`. `SafetyCarState` fields used (`lapsRemaining`, `deployedLap`, `cause`) match `types.ts:305-309`. `IncidentEvent` fields used (`kind`, `lap`, `driverId`, `timeLoss`) match `types.ts:295-303`, and the `IncidentKind` switch in Task 4 covers all four members with a `never` guard.

**Pre-flight fix applied:** Task 4's test was first drafted against invented helper signatures. It has been rewritten against the real ones in `tests/state/commentaryMapper.test.ts` (`makeConfig(drivers[])`, `makeState(cars, overrides?)`, `makeCar({driverId, teamId, ...})`) and a fourth case added, asserting the crash suppression stays narrow enough that a mechanical DNF keeps its line — the obvious way to overshoot that change.

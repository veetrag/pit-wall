# Race Day Bold — Plan 2: The Rest of the App

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every remaining screen in Race Day Bold to the canvas, fix the five audit bugs and the Plan 1 leftovers, retire the legacy token names, and take fresh store screenshots.

**Architecture:** Plan 1 left a kit (`src/ui/kit/`) and three hero screens; the other screens still wear the old layouts in the new palette. This plan first adds the kit pieces those screens share (screen frame, header, stat tile, tabs, toggle, standings row, circuit outline, flat helmet), then rebuilds the screens one task at a time on that kit. The screen frame also fixes the blank-frame transition bug for the whole app at once. The last code task replaces every legacy token name with its Race Day Bold name and removes the aliases. No engine, store logic, save schema or gameplay number changes; the only data edits are one team description and one new radio pool.

**Tech Stack:** React 18, TypeScript strict, framer-motion 12, Zustand, Vitest + @testing-library/react (no jest-dom), Capacitor.

**Spec:** `docs/superpowers/specs/2026-10-09-race-day-bold-redesign-design.md` (§4 components, §5 motion, §6 screens, §7 bugs, §8 steps 4–5). Visual reference: the Claude Design canvas https://claude.ai/artifact/7WjMhLd4TeHhHUr81gSNrM — boards Team select, Development, Race setup, Qualifying, Championship, Ladder reveal, Garage, Trophy room, Settings. The spec wins over the canvas; in particular the canvas still draws hot as `#FF2E63` and white text on hot — use `--hot` (#FF4F84) and ink text.

**Scope:** spec §8 steps 4 and 5. Plan 1 (foundations, kit, hero screens) is merged (`b38b759`, design calls `a24b890`).

## Global Constraints

- Presentation only: never change `src/engine/`, store logic, save schemas, or gameplay numbers. Allowed data edits: the Solstice `archetype` copy in `cars.json` (Task 3) and a new `dry_spin` pool in `radio.json` (Task 11).
- Colours only through tokens in `src/styles/tokens.css`; no new raw hex in components (team colours come from data; tyre colours from `TYRE_COLOR`).
- **Volt (`--volt`) is the only call-to-action colour**: one volt primary button per screen, plus "your row" and "earned". **Hot (`--hot`) means urgent or losing**, never decoration or navigation. **Caution (`--caution`) is race control (safety car) only.**
- **Text on a volt, hot, caution or gain fill is `--ink`.** Text on a team-colour fill is `--ink` (Task 3 adds a test that every `colorPrimary` clears 4.5:1 against ink).
- Every live or comparable number uses tabular figures (global on `body`); Big Shoulders has no tabular figures, so a counting display number reserves its final width (see `RaceResult.tsx` points).
- Fonts: Big Shoulders Display 900 italic for titles and heroes, 700 upright for section heads; Barlow for everything else. Self-hosted only.
- One forward slant: `.slant-row` (2%), `.slant-lg` (3.5%), `.slant-md` (6%), `.slant-sm` (12%); no per-component polygon numbers except the documented sheet/band edges. Only pills and avatars are round.
- Touch targets ≥ 48 px in both dimensions where the layout allows, never < 48 px high.
- Motion: snap along the slant (`snapIn`), ≈180 ms, ease `[0.2, 0, 0, 1]`; press = `PRESS`; nothing bounces (no `type: 'spring'` anywhere in `src/ui` after this plan); reduced motion (`settingsStore.reducedMotion`) = opacity only, counts land instantly.
- Focus stays visible on clipped elements via `.kit-focus`, never `outline`.
- No `color-mix()` (`tests/ui/colorMixBan.test.ts`); translucency via `rgba(var(--x-rgb), a)`.
- Copy and hooks that tests pin must survive (each task lists its own). Where a test selected by old visible text that the canvas removes, move the selector to a role or label (spec §9) and say so in the commit.
- TS lib < es2022 (no `.at()`); jest-dom absent (assert with `toBeTruthy()` on `getBy*`, `.toBeNull()` on `queryBy*`).
- Commit after each task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never read or print `android/keystore.properties`; release builds use the existing signing setup.

## Review Focus

1. **Screen switches must never show a blank or half-transparent frame**, including under reduced motion and when going back (Task 1 test: the exiting screen stays fully opaque while the entering one appears).
2. **Long names and descriptions on a 360 px-wide phone** — "Nimbus Grand Prix", the longest archetype, "Harbour Lights" — must wrap, not truncate or overflow (Task 3 and Task 5 tests render at narrow width and assert no `text-overflow: ellipsis` / `nowrap` on description text).
3. **The stint bar at the plan's limits**: dragging or arrowing past the min/max laps, switching 1→2 stops when stop 1 is late, and a 2-stop plan on the shortest circuit must clamp exactly like today's sliders (Task 5 tests `stopBounds` at those edges).
4. **Empty and first-time states**: a career with no seasons, no badges earned, no rival development yet, no qualifying result yet — each must render a designed state, not a blank card (each owning task asserts its empty copy).
5. **Keyboard and screen-reader paths through the new controls** — tabs, toggles, the team strip, the stint split — must be operable with arrows and announce their state (kit tests in Task 1; stint bar in Task 5).

## File Structure

| file | responsibility |
|---|---|
| `src/ui/kit/ScreenFrame.tsx` | opaque, absolutely positioned screen root with the enter/hold-exit motion (fixes the blank frame) |
| `src/ui/kit/ScreenHeader.tsx` | 48 px round back button, eyebrow label, display title, optional right slot |
| `src/ui/kit/StatTile.tsx` | slanted value + label tile |
| `src/ui/kit/Tabs.tsx` | slanted `tablist` with arrow keys |
| `src/ui/kit/Toggle.tsx` | slanted switch row (label, sub, track, knob) |
| `src/ui/kit/StandingRow.tsx` | slanted standings row: position, team slash, name, value, trailing |
| `src/ui/kit/CircuitOutline.tsx` | circuit SVG outline from path data |
| `src/data/circuitPaths.ts` | `CIRCUIT_PATHS` moved out of the Pixi renderer so the kit can import it |
| `src/ui/HelmetAvatar.tsx` | flat parametric helmet (same props) |
| `src/ui/teamTier.ts` | `carRating`, `teamTierByRank` (shared by team select and its test) |
| `src/ui/StintBar.tsx` | stint bar with a draggable, keyboard-operable split; `stopBounds` |
| `src/App.tsx` | `AnimatePresence` without `mode="wait"` |
| screens | `TeamSelect`, `DriverSelect`, `Development`, `RaceSetup`, `Qualifying`, `Championship`, `LadderReveal`, `GridStats`, `CareerRecord`, `BadgeCase`, `BadgeToast`, `MainMenu` (tile), `SettingsPanel`, `HowToPlay`, `ScenarioSelect`, `ScenarioResult`, `StartLights` |
| `src/state/radioMapper.ts`, `src/data/radio.json` | dry-track spin line (audit bug) |
| `src/styles/tokens.css` | legacy aliases removed (Task 12); start-light and floodlight tokens (Task 11) |
| `tests/ui/legacyTokenBan.test.ts` | no legacy token names in `src/` |
| `store/screenshots/` | fresh store screenshots |

---

### Task 1: Kit — screen frame, header, stat tile, tabs, toggle (and the blank-frame fix)

**Files:**
- Create: `src/ui/kit/ScreenFrame.tsx`, `src/ui/kit/ScreenHeader.tsx`, `src/ui/kit/StatTile.tsx`, `src/ui/kit/Tabs.tsx`, `src/ui/kit/Toggle.tsx`
- Modify: `src/ui/kit/index.ts`, `src/App.tsx:91`, `src/ui/RaceHUD.tsx` (its inner `AnimatePresence mode="wait"` near line 248), and the root element of every screen App renders: `MainMenu`, `GridStats`, `TeamSelect`, `DriverSelect`, `Development`, `RaceSetup`, `Qualifying`, `HowToPlay`, `SettingsScreen` (in `SettingsPanel.tsx`), `RaceHUD`, `RaceResult`, `Championship`, `CareerRecord`, `ScenarioSelect`, `ScenarioResult`
- Test: `tests/ui/kit2.test.tsx` (new), `tests/ui/screenFrames.test.ts` (new)

**Interfaces:**
- Produces (later tasks use exactly these):
  - `ScreenFrame({ children, label, style? }: { children: ReactNode; label: string; style?: CSSProperties })`
  - `ScreenHeader({ eyebrow, title, onBack, right }: { eyebrow?: string; title: string; onBack?: () => void; right?: ReactNode })`
  - `StatTile({ value, label, tone = 'default' }: { value: ReactNode; label: string; tone?: 'default' | 'volt' | 'gain' | 'hot' })`
  - `Tabs<T extends string>({ tabs, value, onChange, ariaLabel }: { tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void; ariaLabel: string })`
  - `KitToggle({ label, sub, checked, onChange, disabled }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean })`

Why the blank frame happens: `App.tsx` wraps the screens in `<AnimatePresence mode="wait">`, so the next screen mounts only after the old one has faded out, and every screen enters from opacity 0 — for a moment nothing is drawn. The fix: every screen root is a `ScreenFrame` — absolutely positioned over the same box, opaque `--ink`, the entering frame above the exiting one — and `AnimatePresence` runs in its default `sync` mode, so the old screen stays fully visible underneath while the new one snaps in, then unmounts.

- [ ] **Step 1: Write the failing kit tests** — `tests/ui/kit2.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScreenFrame, ScreenHeader, StatTile, Tabs, KitToggle } from '@ui/kit'
import { useSettingsStore } from '@state/settingsStore'

vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) }, ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {} }))

beforeEach(() => useSettingsStore.setState({ reducedMotion: true }))

describe('kit 2', () => {
  it('ScreenFrame is an opaque, absolutely positioned, labelled region', () => {
    render(<ScreenFrame label="Settings"><p>x</p></ScreenFrame>)
    const el = screen.getByRole('region', { name: 'Settings' })
    expect(el.style.position).toBe('absolute')
    expect(el.style.inset).toBe('0px')
    expect(el.style.background).toContain('--ink')
  })
  it('ScreenHeader has a 48px Back button only when onBack is given', () => {
    let n = 0
    const { rerender } = render(<ScreenHeader eyebrow="CAREER" title="Trophy room" onBack={() => { n++ }} />)
    const back = screen.getByRole('button', { name: 'Back' })
    expect(back.style.width).toBe('48px'); expect(back.style.height).toBe('48px')
    fireEvent.click(back); expect(n).toBe(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Trophy room' })).toBeTruthy()
    rerender(<ScreenHeader title="Trophy room" />)
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })
  it('StatTile shows value and label; volt tone uses ink text', () => {
    render(<StatTile value="P1" label="BEST" tone="volt" />)
    const tile = screen.getByText('P1').parentElement as HTMLElement
    expect(tile.style.background).toContain('--volt')
    expect(tile.style.color).toContain('--ink')
    expect(screen.getByText('BEST')).toBeTruthy()
  })
  it('Tabs is a tablist with one tab stop and arrow keys', () => {
    let v = 'drivers'
    render(<Tabs ariaLabel="Standings" value="drivers" onChange={x => { v = x }}
      tabs={[{ value: 'drivers', label: 'DRIVERS' }, { value: 'teams', label: 'TEAMS' }]} />)
    expect(screen.getByRole('tablist', { name: 'Standings' })).toBeTruthy()
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs.map(t => t.tabIndex)).toEqual([0, -1])
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' }); expect(v).toBe('teams')
    fireEvent.click(tabs[0]!); expect(v).toBe('drivers')
  })
  it('KitToggle is a switch with a 48px target that reports its state', () => {
    let on = false
    render(<KitToggle label="Sound effects" sub="Engine, pit and UI audio" checked={false} onChange={x => { on = x }} />)
    const sw = screen.getByRole('switch', { name: 'Sound effects' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(parseInt(sw.style.minHeight, 10)).toBeGreaterThanOrEqual(48)
    fireEvent.click(sw); expect(on).toBe(true)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run tests/ui/kit2.test.tsx` — expect FAIL (exports missing).

- [ ] **Step 3: Implement the five components.**

`src/ui/kit/ScreenFrame.tsx`:
```tsx
import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useReducedMotion, EASE } from './motion'

/**
 * Every screen's root. Opaque and absolutely stacked so a screen switch never
 * shows an empty frame: AnimatePresence runs in sync mode, the entering frame
 * sits above (zIndex 1) and snaps in, the exiting one holds fully visible
 * underneath (zIndex 0) for the same 180 ms, then unmounts (spec §5).
 */
export function ScreenFrame({ children, label, style }: { children: ReactNode; label: string; style?: CSSProperties }) {
  const reduced = useReducedMotion()
  return (
    <motion.section
      aria-label={label}
      initial={reduced ? { opacity: 0, zIndex: 1 } : { opacity: 0, x: -18, zIndex: 1 }}
      animate={reduced ? { opacity: 1, zIndex: 1 } : { opacity: 1, x: 0, zIndex: 1 }}
      exit={{ opacity: 1, zIndex: 0, transition: { duration: 0.18 } }}
      transition={{ duration: reduced ? 0.12 : 0.18, ease: EASE }}
      style={{
        position: 'absolute', inset: 0, background: 'var(--ink)', color: 'var(--white)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)', boxSizing: 'border-box',
        ...style,
      }}
    >{children}</motion.section>
  )
}
```
(`--safe-top` / `--safe-bottom` exist in `tokens.css`. A screen that already pads for the safe area must drop its own padding when it adopts `ScreenFrame`.)

`src/ui/kit/ScreenHeader.tsx`:
```tsx
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useUiTap } from '@hooks/useUiTap'
import { PRESS } from './motion'

export function ScreenHeader({ eyebrow, title, onBack, right }: { eyebrow?: string; title: string; onBack?: () => void; right?: ReactNode }) {
  const uiTap = useUiTap()
  return (
    <header style={{ padding: '12px 16px 0', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48 }}>
        {onBack && (
          <motion.button type="button" aria-label="Back" className="kit-focus" whileTap={{ scale: 0.96 }} transition={PRESS}
            onClick={() => { uiTap(); onBack() }}
            style={{ width: 48, height: 48, borderRadius: 999, border: 'none', background: 'var(--grape)', color: 'var(--white)',
              fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 20, cursor: 'pointer', flexShrink: 0 }}>←</motion.button>
        )}
        {eyebrow && <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, letterSpacing: 2, color: 'var(--lilac-dim)' }}>{eyebrow}</span>}
        {!eyebrow && <span style={{ flex: 1 }} />}
        {right}
      </div>
      <h1 style={{ margin: '8px 0 0', fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 46,
        lineHeight: 0.95, textTransform: 'uppercase', color: 'var(--white)', overflowWrap: 'anywhere' }}>{title}</h1>
    </header>
  )
}
```

`src/ui/kit/StatTile.tsx`:
```tsx
import type { ReactNode } from 'react'
const TONE = {
  default: ['var(--grape)', 'var(--white)'], volt: ['var(--volt)', 'var(--ink)'],
  gain: ['var(--grape)', 'var(--gain)'], hot: ['var(--grape)', 'var(--hot)'],
} as const
export function StatTile({ value, label, tone = 'default' }: { value: ReactNode; label: string; tone?: keyof typeof TONE }) {
  const [bg, fg] = TONE[tone]
  return (
    <div className="slant-sm" style={{ background: bg, color: fg, padding: '10px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 28, lineHeight: 1 }}>{value}</span>
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 11, color: tone === 'volt' ? 'var(--ink)' : 'var(--lilac-dim)', textAlign: 'center' }}>{label}</span>
    </div>
  )
}
```

`src/ui/kit/Tabs.tsx`:
```tsx
import type { KeyboardEvent } from 'react'
import { useUiTap } from '@hooks/useUiTap'
export function Tabs<T extends string>({ tabs, value, onChange, ariaLabel }: {
  tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void; ariaLabel: string
}) {
  const uiTap = useUiTap()
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const i = tabs.findIndex(t => t.value === value)
    const next = tabs[(i + step + tabs.length) % tabs.length]
    if (!next) return
    uiTap(); onChange(next.value)
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[tabs.indexOf(next)]?.focus()
  }
  return (
    <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className="slant-md"
      style={{ display: 'flex', gap: 2, background: 'var(--grape)', padding: '4px 14px' }}>
      {tabs.map(t => {
        const on = t.value === value
        return (
          <button key={t.value} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1}
            className={`${on ? 'slant-sm ' : ''}kit-focus`} onClick={() => { uiTap(); onChange(t.value) }}
            style={{ flex: 1, minHeight: 48, padding: '0 14px', border: 'none', cursor: 'pointer',
              background: on ? 'var(--white)' : 'transparent', color: on ? 'var(--ink)' : 'var(--lilac)',
              fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 13 }}>{t.label}</button>
        )
      })}
    </div>
  )
}
```

`src/ui/kit/Toggle.tsx`:
```tsx
import { motion } from 'framer-motion'
import { useUiTap } from '@hooks/useUiTap'
import { PRESS } from './motion'
/** Slanted switch row (spec §4 Toggle). The whole row is the switch: label, sub and track. */
export function KitToggle({ label, sub, checked, onChange, disabled }: {
  label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  const uiTap = useUiTap()
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      className="slant-row kit-focus" onClick={() => { uiTap(); onChange(!checked) }}
      style={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px 10px 20px',
        border: 'none', background: 'var(--grape)', color: 'var(--white)', textAlign: 'left',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 15 }}>{label}</span>
        {sub && <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12, color: 'var(--lilac)' }}>{sub}</span>}
      </span>
      <span aria-hidden="true" className="slant-sm" style={{ position: 'relative', width: 52, height: 28, flexShrink: 0,
        background: checked ? 'var(--volt)' : 'var(--dusk)', transition: 'background 0.12s' }}>
        <motion.span animate={{ x: checked ? 26 : 6 }} transition={PRESS}
          style={{ position: 'absolute', top: 4, left: 0, width: 20, height: 20, background: 'var(--ink)', transform: 'skewX(-14deg)' }} />
      </span>
    </button>
  )
}
```
`minHeight: 56` is set in `style`, so the test's `parseInt(sw.style.minHeight)` reads 56.

Add to `src/ui/kit/index.ts`:
```ts
export * from './ScreenFrame'
export * from './ScreenHeader'
export * from './StatTile'
export * from './Tabs'
export * from './Toggle'
```

- [ ] **Step 4: Run** `npx vitest run tests/ui/kit2.test.tsx` — expect PASS.

- [ ] **Step 5: Write the failing structure test** — `tests/ui/screenFrames.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = (f: string) => readFileSync(join(__dirname, '../../src', f), 'utf8')
// Every screen App switches between, and the file that holds its root.
const SCREENS: [string, string][] = [
  ['MainMenu', 'ui/MainMenu.tsx'], ['GridStats', 'ui/GridStats.tsx'], ['TeamSelect', 'ui/TeamSelect.tsx'],
  ['DriverSelect', 'ui/DriverSelect.tsx'], ['Development', 'ui/Development.tsx'], ['RaceSetup', 'ui/RaceSetup.tsx'],
  ['Qualifying', 'ui/Qualifying.tsx'], ['HowToPlay', 'ui/HowToPlay.tsx'], ['SettingsScreen', 'ui/SettingsPanel.tsx'],
  ['RaceHUD', 'ui/RaceHUD.tsx'], ['RaceResult', 'ui/RaceResult.tsx'], ['Championship', 'ui/Championship.tsx'],
  ['CareerRecord', 'ui/CareerRecord.tsx'], ['ScenarioSelect', 'ui/ScenarioSelect.tsx'], ['ScenarioResult', 'ui/ScenarioResult.tsx'],
]

describe('screen transitions never show a blank frame', () => {
  it('App does not wait for the old screen to leave before drawing the next', () => {
    expect(src('App.tsx')).not.toMatch(/mode=["']wait["']/)
  })
  it('the race screen does not either', () => {
    expect(src('ui/RaceHUD.tsx')).not.toMatch(/mode=["']wait["']/)
  })
  it.each(SCREENS)('%s renders its root as a ScreenFrame', (_name, file) => {
    expect(src(file)).toMatch(/<ScreenFrame\b/)
  })
})
```

- [ ] **Step 6: Run** `npx vitest run tests/ui/screenFrames.test.ts` — expect FAIL.

- [ ] **Step 7: Adopt `ScreenFrame` everywhere.** In `App.tsx` change `<AnimatePresence mode="wait">` to `<AnimatePresence initial={false}>`. Give the wrapping div `position: 'relative'` and `background: 'var(--ink)'` (it already has `height: 100%`, `overflow: hidden`). In each screen in the list, replace the outer `motion.div` (with its `initial`/`animate`/`exit`) by `<ScreenFrame label="…">` with these labels: Main menu, Garage, Team select, Driver select, Development, Race setup, Qualifying, How to play, Settings, Race, Race result, Championship, Trophy room, Scenarios, Scenario result. Keep any non-motion styles the old root had (e.g. a background band container) by passing them in `style`; move layout children unchanged. In `RaceHUD.tsx`, drop `mode="wait"` from the inner `AnimatePresence` that swaps `StartScreen` and the race view, and make both of those children `position: 'absolute', inset: 0, background: 'var(--ink)'` so the same overlap rule holds. Do not change anything else in these files.

- [ ] **Step 8: Run** `npx vitest run tests/ui/screenFrames.test.ts tests/ui/kit2.test.tsx`, then the full suite `npx vitest run` and `npx tsc --noEmit -p .`. Fix any test that queried a root by an old style. Expected: all PASS.

- [ ] **Step 9: Commit**
```bash
git add -A
git commit -m "feat(ui): kit screen frame, header, stat tile, tabs, toggle; no blank frame between screens

AnimatePresence no longer waits for the old screen to fade out before the
next mounts (spec §7): every screen root is an opaque, stacked ScreenFrame.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Kit art — circuit outline, flat helmet, standings row

**Files:**
- Create: `src/data/circuitPaths.ts`, `src/ui/kit/CircuitOutline.tsx`, `src/ui/kit/StandingRow.tsx`
- Modify: `src/canvas/TrackCanvas.tsx:5-33` (import `CIRCUIT_PATHS` from the new module and re-export it), `src/ui/HelmetAvatar.tsx` (flat art, same props), `src/ui/kit/index.ts`
- Test: `tests/ui/kitArt2.test.tsx` (new); existing `tests/ui/kitArt.test.tsx`, `tests/ui/raceResultBold.test.tsx` and every test that renders `HelmetAvatar` must pass

**Interfaces:**
- Produces:
  - `CIRCUIT_PATHS: Record<string, { points: number[][]; sectorBoundaries: number[]; pitEntry: number[]; pitExit: number[] }>` from `@data/circuitPaths`
  - `CircuitOutline({ circuitId, width, height, label }: { circuitId: string; width: number; height: number; label: string })` — `role="img"`, `aria-label={label}`; renders nothing if the id has no path
  - `StandingRow({ pos, teamColor, name, value, trailing, mine, bar }: { pos: string | number; teamColor: string; name: ReactNode; value: ReactNode; trailing?: ReactNode; mine?: boolean; bar?: number })` — `bar` is 0..1 for a points bar
  - `HelmetAvatar` keeps its exact props (`teamPrimary`, `teamSecondary?`, `pattern?`, `number?`, `size?`, `selected?`, `selectionColor?`) and its `role`/`aria-label` behaviour

The podium helmets looked soft on the phone because the current helmet is drawn with gradients and blur; the spec asks for the flat two-colour art on the canvas.

- [ ] **Step 1: Write the failing test** — `tests/ui/kitArt2.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CircuitOutline, StandingRow } from '@ui/kit'
import { CIRCUIT_PATHS } from '@data/circuitPaths'
import { HelmetAvatar } from '@ui/HelmetAvatar'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('kit art 2', () => {
  it('has a path for every circuit in circuits.json', async () => {
    const data = (await import('@data/circuits.json')).default as { circuits: Record<string, unknown> }
    for (const id of Object.keys(data.circuits)) expect(CIRCUIT_PATHS[id], id).toBeTruthy()
  })
  it('CircuitOutline draws a closed outline in volt inside the requested box', () => {
    render(<CircuitOutline circuitId="silverpark" width={120} height={100} label="Silverpark layout" />)
    const svg = screen.getByRole('img', { name: 'Silverpark layout' })
    expect(svg.getAttribute('width')).toBe('120')
    const path = svg.querySelector('path')!
    expect(path.getAttribute('d')).toMatch(/^M.*Z$/)
    expect(path.getAttribute('stroke')).toBe('var(--volt)')
  })
  it('CircuitOutline renders nothing for an unknown circuit', () => {
    const { container } = render(<CircuitOutline circuitId="nowhere" width={10} height={10} label="x" />)
    expect(container.querySelector('svg')).toBeNull()
  })
  it('StandingRow: the player row is volt with ink text and is taller', () => {
    render(<div><StandingRow pos={1} teamColor="#00E5D0" name="Lars Voss" value={43} mine bar={1} />
      <StandingRow pos={2} teamColor="#E8344E" name="Enzo Rossi" value={43} bar={1} /></div>)
    const mine = screen.getByText('Lars Voss').closest('[data-standing-row]') as HTMLElement
    const other = screen.getByText('Enzo Rossi').closest('[data-standing-row]') as HTMLElement
    expect(mine.style.background).toContain('--volt'); expect(mine.style.color).toContain('--ink')
    expect(parseInt(mine.style.height, 10)).toBeGreaterThan(parseInt(other.style.height, 10))
  })
  it('the helmet is flat: no gradients or filters', () => {
    const { container } = render(<HelmetAvatar teamPrimary="#00E5D0" teamSecondary="#FFD60A" size={64} />)
    expect(container.querySelector('linearGradient, radialGradient, filter')).toBeNull()
  })
  it('the track renderer no longer owns the circuit paths', () => {
    const tc = readFileSync(join(__dirname, '../../src/canvas/TrackCanvas.tsx'), 'utf8')
    expect(tc).not.toMatch(/@data\/paths\/silverpark\.json/)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run tests/ui/kitArt2.test.tsx` — expect FAIL.

- [ ] **Step 3: Move the paths.** Create `src/data/circuitPaths.ts` containing the twelve `import pathX from '@data/paths/x.json'` lines and the `CIRCUIT_PATHS` object exactly as they are now in `TrackCanvas.tsx` lines 5–33 (export the type as `CircuitPath`). In `TrackCanvas.tsx` delete those imports and the object and add `import { CIRCUIT_PATHS } from '@data/circuitPaths'` plus `export { CIRCUIT_PATHS }` so existing importers keep working.

- [ ] **Step 4: Implement `CircuitOutline`** (`src/ui/kit/CircuitOutline.tsx`):
```tsx
import { CIRCUIT_PATHS } from '@data/circuitPaths'
/** Per-circuit outline (spec §3.4), fitted into width×height with a stroke inset. */
export function CircuitOutline({ circuitId, width, height, label }: { circuitId: string; width: number; height: number; label: string }) {
  const path = CIRCUIT_PATHS[circuitId]
  if (!path || path.points.length < 2) return null
  const xs = path.points.map(p => p[0] ?? 0), ys = path.points.map(p => p[1] ?? 0)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const pad = 5
  const s = Math.min((width - 2 * pad) / Math.max(1, maxX - minX), (height - 2 * pad) / Math.max(1, maxY - minY))
  const ox = (width - (maxX - minX) * s) / 2, oy = (height - (maxY - minY) * s) / 2
  const d = path.points.map((p, i) => `${i ? 'L' : 'M'}${((p[0] ?? 0) - minX) * s + ox} ${((p[1] ?? 0) - minY) * s + oy}`).join(' ') + ' Z'
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path d={d} fill="none" stroke="var(--volt)" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
```

- [ ] **Step 5: Implement `StandingRow`** (`src/ui/kit/StandingRow.tsx`):
```tsx
import type { ReactNode } from 'react'
export function StandingRow({ pos, teamColor, name, value, trailing, mine = false, bar }: {
  pos: string | number; teamColor: string; name: ReactNode; value: ReactNode; trailing?: ReactNode; mine?: boolean; bar?: number
}) {
  const cols = `28px 5px minmax(0, 1fr)${bar !== undefined ? ' 72px' : ''} auto${trailing !== undefined ? ' 26px' : ''}`
  return (
    <div data-standing-row className="slant-row" style={{
      display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center', padding: '0 14px',
      height: mine ? 48 : 40, background: mine ? 'var(--volt)' : 'var(--grape)', color: mine ? 'var(--ink)' : 'var(--white)',
    }}>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 21 }}>{pos}</span>
      <span aria-hidden="true" style={{ height: 20, background: teamColor, transform: 'skewX(-14deg)' }} />
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 15, overflow: 'hidden', overflowWrap: 'anywhere' }}>{name}</span>
      {bar !== undefined && (
        <span aria-hidden="true" style={{ height: 8, background: mine ? 'rgba(var(--ink-rgb), 0.2)' : 'rgba(var(--white-rgb), 0.15)', position: 'relative' }}>
          <span style={{ position: 'absolute', inset: 0, width: `${Math.round(Math.max(0, Math.min(1, bar)) * 100)}%`, background: mine ? 'var(--ink)' : teamColor }} />
        </span>
      )}
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 15, textAlign: 'right' }}>{value}</span>
      {trailing !== undefined && <span>{trailing}</span>}
    </div>
  )
}
```
If `--ink-rgb` or `--white-rgb` do not exist in `tokens.css`, add them next to `--volt-rgb` (`18, 14, 43` and `255, 255, 255`).

Export both from `src/ui/kit/index.ts` (`export * from './CircuitOutline'`, `export * from './StandingRow'`).

- [ ] **Step 6: Redraw `HelmetAvatar` flat.** Keep the exported props, the `HelmetPattern` type, and whatever `role`/`aria-label` it renders today. Replace the drawing with the canvas helmet in a 64×64 viewBox scaled to `size`: shell `M8 38 Q8 10 34 8 Q58 8 58 34 L58 46 Q58 54 50 54 L18 54 Q8 54 8 46 Z` in `teamPrimary`; visor `M28 24 L56 22 Q58 30 56 30 L28 32 Q24 28 28 24 Z` in `var(--ink)`; the pattern in `teamSecondary ?? 'var(--ink)'` — `stripe`: `M8 34 L58 30 L58 38 L8 42 Z`; `chevron`: `M8 44 L33 36 L58 44 L58 50 L33 42 L8 50 Z`; `halo`: `M14 20 Q34 8 54 20 L52 25 Q34 14 16 25 Z`; `solid`: none. `number > 0` draws the number in `var(--ink)` Barlow 800 at (20, 50) font-size 12. `selected` draws a 3px ring circle in `selectionColor ?? teamPrimary` around the helmet. No `<defs>`, gradients or filters.

- [ ] **Step 7: Run** `npx vitest run tests/ui/kitArt2.test.tsx tests/ui/kitArt.test.tsx tests/ui/raceResultBold.test.tsx`, then the full suite and tsc. Expected: PASS.

- [ ] **Step 8: Commit** `feat(ui): kit circuit outline, standings row, flat helmet art` (with the Co-Authored-By line).

---

### Task 3: Team select and driver select (audit bugs: tier label, truncated descriptions)

**Files:**
- Create: `src/ui/teamTier.ts`
- Modify: `src/ui/TeamSelect.tsx` (rewrite render), `src/ui/DriverSelect.tsx` (rewrite render), `src/data/cars.json` (Solstice `archetype` only)
- Test: `tests/ui/teamSelectBold.test.tsx` (new), `tests/ui/teamTier.test.ts` (new)

**Interfaces:**
- Consumes: kit (`ScreenFrame`, `ScreenHeader`, `HeroBand`, `CarArt`, `liveryOf`, `StatTile`, `KitButton`, `snapIn`, `useReducedMotion`), `HelmetAvatar`; seasonStore `selectedTeamId`, `selectTeam`, `confirmTeam`, `backToMenu` (team select) and `selectedTeamId`, `playerDriverId`, `selectDriver`, `confirmDriver`, `backToTeamSelect` (driver select).
- Produces: `carRating(facets: Record<string, number>): number` and `teamTierByRank(teamId: string, teams: { id: string; facets: Record<string, number> }[]): 'FRONT-RUNNER' | 'MIDFIELD' | 'BACKMARKER'` from `@ui/teamTier`.

The tier bug: tiers are cut at a rating of 88/80, which labels six of ten teams FRONT-RUNNER — including Solstice ("Solid midfield") and Delta ("Balanced midfield") — and labels Terra, whose description says "Backmarker", MIDFIELD. Tiers become rank-based on the grid's own spread: ranks 1–3 FRONT-RUNNER, 4–8 MIDFIELD, 9–10 BACKMARKER (ties share the better rank). With today's data that gives Apex, Solstice, Meridian / Vortex, Kestrel, Delta, Halcyon, Nimbus / Zenith, Terra, so every description agrees except Solstice's, whose numbers (rating 92, 2nd) are front-runner: its copy becomes "Front-runner pace — fastest pit crew on the grid". This is copy, not balance; the facets do not change.

Team select layout (canvas "Team select"):
1. `ScreenHeader eyebrow="NEW CAREER · STEP 1 OF 2" title="Pick your team" onBack={backToMenu}`.
2. Hero (height ≈ 300): `HeroBand color={team.colorPrimary} height={270} top={10}`; on it in `var(--ink)`: `{TIER} · {flag}` (800 12px, letter-spacing 2), the team name (display 900 italic 40, uppercase, wraps), and the rating on the right (display 900 italic 72). `CarArt` heading left, height 240, livery `liveryOf(team.id)`, labelled `{team.name} car`. The band and car cross-fade (`snapIn`) when the selection changes, keyed by team id.
3. Four `StatTile`s: POWER, AERO, HANDLING, PIT CREW from `facets.power`, `facets.aero`, `facets.handling`, `facets.pitCrew`.
4. Description: `{archetype}. Drivers: {driver 1 name} and {driver 2 name}.` in `var(--lilac)` 14px, line-height 1.45, wrapping (no `nowrap`, no ellipsis).
5. Team strip: `role="radiogroup" aria-label="Teams"`, horizontally scrollable, one 64×64 `slant-sm` `role="radio"` per team with `aria-checked`, `aria-label="{name}, rating {r}"`, a 22×8 skewed slash in the team colour and the rating; selected = `var(--dusk)` fill; arrows move the selection (same pattern as `Segmented`); the selected radio scrolls into view.
6. `KitButton variant="primary" size="lg"`: `DRIVE FOR {SHORT NAME} →` where short name is the first word of the team name; disabled-looking `SELECT A TEAM` when nothing is selected (keep today's disabled behaviour).

Driver select (not drawn; same kit): `ScreenHeader eyebrow="NEW CAREER · STEP 2 OF 2" title="Pick your driver" onBack={backToTeamSelect}`; for each of the two drivers a `slant-md` grape card with a team-colour band top, `HelmetAvatar size={72}` (existing pattern helper), name (display 900 italic 26), `{flag} {CODE} · {TIER} {n} OVR`, and four `StatTile`s for PACE, RACECRAFT, TYRE MGMT, CONSISTENCY; the card is a `role="radio"` in a `radiogroup` "Drivers", selected = volt 3px inset ring (`box-shadow: inset 0 0 0 3px var(--volt)`). CTA `RACE WITH {CODE} →` / `SELECT A DRIVER`. Keep the empty state copy "No drivers found. Go back and select a team." Replace the `#888` fallbacks with `var(--lilac-dim)`.

- [ ] **Step 1: Write the failing tier test** — `tests/ui/teamTier.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import cars from '@data/cars.json'
import { carRating, teamTierByRank } from '@ui/teamTier'

type Team = { id: string; name: string; archetype: string; facets: Record<string, number>; colorPrimary: string }
const teams = (cars as { teams: Team[] }).teams

// Words in a description that claim a tier.
const CLAIMS: [RegExp, string][] = [
  [/front-runner|benchmark|challenger/i, 'FRONT-RUNNER'],
  [/midfield/i, 'MIDFIELD'],
  [/backmarker|tail of the field/i, 'BACKMARKER'],
]

describe('team tiers', () => {
  it('rating is the rounded facet mean', () => {
    expect(carRating({ a: 90, b: 91 })).toBe(91)
  })
  it('three front-runners, five midfield, two backmarkers', () => {
    const tiers = teams.map(t => teamTierByRank(t.id, teams))
    expect(tiers.filter(t => t === 'FRONT-RUNNER')).toHaveLength(3)
    expect(tiers.filter(t => t === 'BACKMARKER')).toHaveLength(2)
  })
  it.each(teams.map(t => [t.id, t] as const))('%s: description agrees with its tier', (_id, t) => {
    const tier = teamTierByRank(t.id, teams)
    for (const [re, claimed] of CLAIMS) if (re.test(t.archetype)) expect(claimed, t.archetype).toBe(tier)
  })
})
```

- [ ] **Step 2: Run** — FAIL (module missing; Solstice copy disagrees).

- [ ] **Step 3: Implement `src/ui/teamTier.ts`:**
```ts
export type TeamTier = 'FRONT-RUNNER' | 'MIDFIELD' | 'BACKMARKER'
export function carRating(facets: Record<string, number>): number {
  const vals = Object.values(facets)
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
}
/** Rank on the grid's own spread: 1–3 front-runner, 4–8 midfield, the rest backmarker. Ties share the better rank. */
export function teamTierByRank(teamId: string, teams: { id: string; facets: Record<string, number> }[]): TeamTier {
  const mine = teams.find(t => t.id === teamId)
  if (!mine) return 'MIDFIELD'
  const r = carRating(mine.facets)
  const rank = 1 + teams.filter(t => carRating(t.facets) > r).length
  return rank <= 3 ? 'FRONT-RUNNER' : rank <= 8 ? 'MIDFIELD' : 'BACKMARKER'
}
```
Change only Solstice's `"archetype"` in `src/data/cars.json` to `"Front-runner pace — fastest pit crew on the grid"`. Run the test — PASS.

- [ ] **Step 4: Write the failing screen test** — `tests/ui/teamSelectBold.test.tsx` (mock `@capacitor/haptics` and `@capacitor/preferences` as `tests/ui/kit.test.tsx` and `tests/ui/ladderReveal.test.tsx` do):
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamSelect } from '@ui/TeamSelect'
import { DriverSelect } from '@ui/DriverSelect'
import { useSeasonStore } from '@state/seasonStore'
import { useSettingsStore } from '@state/settingsStore'
import cars from '@data/cars.json'

vi.mock('@capacitor/preferences', () => ({ Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) } }))
vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) }, ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {} }))

const ink = [18, 14, 43]
const lum = (rgb: number[]) => { const c = rgb.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]! }
const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))

beforeEach(() => {
  useSettingsStore.setState({ reducedMotion: true })
  useSeasonStore.setState({ phase: 'team_select', selectedTeamId: 'solstice', playerDriverId: null })
})

describe('team select in Race Day Bold', () => {
  it('shows the hero, four stats, the full description and a team strip', () => {
    render(<TeamSelect />)
    expect(screen.getByRole('heading', { level: 1, name: /pick your team/i })).toBeTruthy()
    expect(screen.getByText(/FRONT-RUNNER/)).toBeTruthy()
    for (const k of ['POWER', 'AERO', 'HANDLING', 'PIT CREW']) expect(screen.getByText(k)).toBeTruthy()
    const desc = screen.getByText(/fastest pit crew on the grid/)
    expect(desc.style.whiteSpace).not.toBe('nowrap')
    expect(desc.style.textOverflow).not.toBe('ellipsis')
    const strip = screen.getByRole('radiogroup', { name: 'Teams' })
    expect(strip.querySelectorAll('[role="radio"]').length).toBe((cars as { teams: unknown[] }).teams.length)
    expect(screen.getByRole('button', { name: /DRIVE FOR SOLSTICE/ })).toBeTruthy()
  })
  it('picking a team from the strip selects it', () => {
    render(<TeamSelect />)
    fireEvent.click(screen.getByRole('radio', { name: /^Apex Racing, rating/ }))
    expect(useSeasonStore.getState().selectedTeamId).toBe('apex')
  })
  it('every team colour carries ink text at AA', () => {
    for (const t of (cars as { teams: { colorPrimary: string }[] }).teams) {
      const [a, b] = [lum(hex(t.colorPrimary)), lum(ink)].sort((x, y) => y - x)
      expect((a! + 0.05) / (b! + 0.05), t.colorPrimary).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('driver select offers both drivers as radios with four stats each', () => {
    useSeasonStore.setState({ phase: 'driver_select', selectedTeamId: 'apex' })
    render(<DriverSelect />)
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.getAllByText('TYRE MGMT')).toHaveLength(2)
    expect(screen.getByRole('heading', { level: 1, name: /pick your driver/i })).toBeTruthy()
  })
})
```
If a team colour fails the ink contrast check, stop and report it — do not change team colours (they are design data for Veet's call).

- [ ] **Step 5: Run** — FAIL. **Step 6: Implement** both layouts above; import `carRating`/`teamTierByRank` from `@ui/teamTier` and delete the local `carRating`/`teamTier` from `TeamSelect.tsx`. **Step 7: Run** the two new tests, the full suite and tsc — PASS.

- [ ] **Step 8: Commit** `feat(ui): team and driver select in Race Day Bold; tiers by grid rank, descriptions wrap` (body: names the Solstice copy change and why).

---

### Task 4: Development — "The factory"

**Files:**
- Modify: `src/ui/Development.tsx` (render only; keep every computation and handler)
- Test: `tests/ui/developmentBold.test.tsx` (new); `tests/ui/development.test.tsx` and `tests/ui/colorMixBan.test.ts` must pass unchanged

**Interfaces:**
- Consumes: kit (`ScreenFrame`, `ScreenHeader`, `KitButton`, `Pill`, `snapIn`, `useReducedMotion`), the values the file already computes.

Pinned by `development.test.tsx` (must survive verbatim): `data-testid` `dp-balance` (`role="status"`, contains the number), `buy-{id}`, `effect-{id}`, `rival-development`, `player-arc`, `to-race`; buy button text `MAX`, `NEED`, `BUY T{n}` and their aria-labels (label + cost; capped rows say "no"/"nothing" and do not start with "Buy "); effect text contains `s/lap`; player arc text `YOU −0.xxs` / `—` and its aria-label.

Layout (canvas "Development"):
1. Header row: `ScreenHeader eyebrow="BETWEEN ROUNDS · {n} OF {TOTAL_RACES}" title="The factory"` with `right` = the DP badge: a `slant-sm` volt block, `data-testid="dp-balance" role="status"`, number in display 900 italic 34 ink, caption `DEV POINTS` 800 11 ink. The team-tier pill (`aria-label="Team tier ±n"`) sits under the title as a `Pill` (`▲ TIER +1` in gain text, `▼` in hot text, on grape).
2. Arms race card (`data-testid="rival-development"`): `slant-lg`, `var(--night)`, title `THE ARMS RACE` in `var(--hot)` 800 12 letter-spacing 2 and `season to date` on the right in `var(--lilac-dim)`; a four-column grid of up to three rivals plus YOU: a 4 px skewed bar in the team colour, the short team name in lilac 11, the value 800 16 — rivals in `var(--hot)`, YOU (`data-testid="player-arc"`) in `var(--volt)`. Keep the existing footnote copy beneath in lilac-dim 12.
3. Two groups with display 700 20 uppercase lilac-dim heads `THE CAR` (sub "Shared with your team-mate") and `THE DRIVER` (sub "Yours alone"). Each upgrade is a `slant-row` grape card: name (display 900 italic 22 uppercase), tier marks (one 14×8 skewed mark per tier in the attribute's data, owned = volt, rest = dusk, `aria-label="Tier {owned} of {max}"`), the effect line in `var(--gain)` 700 14 (`data-testid="effect-{id}"`), and on the right an 88×52 `slant-sm` buy button: affordable = volt fill, ink text, cost 800 16 + `BUY T{n}` 700 10; `NEED` = dusk fill, lilac text; `✓ MAX` and `CAPPED` = transparent with lilac-dim text. Buying keeps the existing before→after animation but with `PRESS`/`EASE` timing, no spring.
4. Footer: the existing carry-over/income note centred in lilac-dim 13, then `KitButton primary lg` `TO RACE SETUP →` with `data-testid="to-race"` (pass it through: add an optional `testId` prop to `KitButton` that sets `data-testid`, and a test in `tests/ui/kit.test.tsx` for it).
5. Empty states stay as today ("No rival has developed yet…").

- [ ] **Step 1: Failing test** `tests/ui/developmentBold.test.tsx` — copy the store setup and mocks from `tests/ui/development.test.tsx`, then:
```tsx
it('is the factory: title, volt DP badge, hot arms race, slanted upgrade cards', () => {
  render(<Development />)
  expect(screen.getByRole('heading', { level: 1, name: /the factory/i })).toBeTruthy()
  const dp = screen.getByTestId('dp-balance')
  expect(dp.style.background).toContain('--volt')
  expect(screen.getByText('DEV POINTS')).toBeTruthy()
  expect(screen.getByText('THE ARMS RACE').style.color).toContain('--hot')
  expect(screen.getAllByLabelText(/^Tier \d+ of \d+$/).length).toBeGreaterThan(0)
  expect(screen.getByTestId('to-race').textContent).toMatch(/TO RACE SETUP/)
})
```
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** the new test, `development.test.tsx`, `colorMixBan.test.ts`, `kit.test.tsx`, full suite, tsc — PASS.
- [ ] **Step 5: Commit** `feat(ui): development as the factory in Race Day Bold`.

---

### Task 5: Race setup — circuit card, chips, and the stint bar

**Files:**
- Create: `src/ui/StintBar.tsx`
- Modify: `src/ui/RaceSetup.tsx` (render; replace the range sliders with `StintBar`; move the inline bounds into `stopBounds`)
- Test: `tests/ui/stintBar.test.tsx` (new), `tests/ui/raceSetupBold.test.tsx` (new); `tests/ui/wingSelector.test.tsx`, `tests/ui/qualifying.test.tsx`, `tests/ui/setupWeatherAgrees.test.ts`, `tests/ui/weatherSurfacesAgree.test.ts` must pass

**Interfaces:**
- Consumes: kit (`ScreenFrame`, `ScreenHeader`, `CircuitOutline`, `Pill`, `TyreChip`, `TYRE_NAME`, `TYRE_COLOR`, `Segmented`, `KitButton`), `WingSelector`, the file's existing state (`stopCount`, `pitLap1`, `pitCompound1`, `pitLap2`, `pitCompound2`, `MIN_STINT_GAP`).
- Produces: in `src/ui/StintBar.tsx`
  - `stopBounds(laps: number, stopCount: 1 | 2, pitLap1: number): { min1: number; max1: number; min2: number; max2: number }`
  - `StintBar({ laps, startCompound, stops, onChange }: { laps: number; startCompound: Compound; stops: { lap: number; compound: Compound }[]; onChange: (index: number, lap: number) => void })`

Pinned: `computeStartWeather` and `computeQualifyingWeather` exports and signatures; `radiogroup` named `/wing level/i` with radios labelled `Wing N…`; the plan line text `PLAN: … · W{n}` (`getByText(/PLAN:/)`); a button whose name matches `/qualifying/i` and contains no "lights out"; `data-circuit-idx` on circuit chips; `confirmRaceSetup(circuitId, { startCompound, plannedStops, wing })` payload unchanged.

The collapsed circuit card: the card is a flex child with `overflow: hidden` in a scrolling column; `overflow: hidden` gives it `min-height: 0`, so when the column overflows it shrinks and clips. Give it `flexShrink: 0` (as `Qualifying.tsx` already does for its result box).

Bounds today (keep exactly; this task only names them): stop 1 min `5`, max `laps − 3` with one stop or `laps − 3 − MIN_STINT_GAP` with two; stop 2 min `pitLap1 + MIN_STINT_GAP`, max `laps − 2`; moving stop 1 pushes stop 2 to at least `stop1 + MIN_STINT_GAP`.

Layout (canvas "Race setup"):
1. `ScreenHeader eyebrow="PRE-RACE SETUP" title="Race plan" onBack={backToDriverSelect}`.
2. Circuit chip strip as today (keep `data-circuit-idx`, `scrollIntoView`), restyled as round `Pill`-like buttons, 48 px high, selected = white fill ink text.
3. Circuit card: `slant-lg`, `var(--night)`, `flexShrink: 0`; left: `ROUND {n} · {flag}` label, name (display 900 italic 38, wraps), `{laps} laps · {characterNote's first clause or the circuit's character label}` in lilac 13; right: `CircuitOutline` 120×100 labelled `{name} layout`. The conditions tiles, wet-start warning and fun facts move below the card as today's content restyled: conditions as `Pill`s (`☀ Dry start` / `🌧 Wet start`, `Rain {p}%` when available, `Pit loss {s}s`); the wet-start warning as a hot-text line; fun facts collapsed behind a `MORE ABOUT {NAME}` text button (`aria-expanded`).
4. `START TYRE` (display 700 20 lilac-dim): `role="radiogroup" aria-label="Start tyre"`, five 56-high `slant-sm` radios, each a `TyreChip size={34}`, `aria-label` = `TYRE_NAME`; selected = dusk fill.
5. `WING`: `WingSelector` unchanged in behaviour (it was restyled in Plan 1).
6. `STRATEGY` head with a `Segmented ariaLabel="Number of stops"` (`1 STOP` / `2 STOP`) on the right; per stop a compound row ("Pit {n} — fit" + compact tyre radios as today); then `StintBar`; then the plan line `PLAN: …` exactly as today; then the existing helper sentence, shortened to "Drag a split to move a stop. Stops run automatically; you can pit earlier live, not later."
7. CTA `KitButton primary lg` `TO QUALIFYING →`.

`StintBar` behaviour: a row of stint segments (`flex` = stint length in laps), each `slant-row`-cut, filled with the stint's `TYRE_COLOR` and ink text `{letter} · L{from}–{to}`; between segments a 48×48 hit-area handle, `role="slider"`, `aria-label="Stop {n} lap"`, `aria-valuemin/max/now` from `stopBounds`, `aria-valuetext="Lap {n}"`. Pointer: `onPointerDown` captures the pointer; `onPointerMove` maps x to a lap over the bar width (`Math.round(x / width * laps)`), clamps to the bounds and calls `onChange`. Keyboard: ArrowLeft/ArrowDown −1, ArrowRight/ArrowUp +1, PageDown/PageUp ±5, Home/End to the bounds. The bar has `aria-label` = `Stint plan: {name} laps 1 to {a}, then {name} …to the flag` (as the canvas).

- [ ] **Step 1: Failing test** `tests/ui/stintBar.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StintBar, stopBounds } from '@ui/StintBar'

describe('stopBounds (unchanged rules, now named)', () => {
  it('one stop: lap 5 to laps-3', () => expect(stopBounds(49, 1, 20)).toMatchObject({ min1: 5, max1: 46 }))
  it('two stops: stop 1 leaves room, stop 2 follows by the stint gap', () =>
    expect(stopBounds(49, 2, 20)).toEqual({ min1: 5, max1: 42, min2: 24, max2: 47 }))
  it('shortest sensible race still yields min <= max', () => {
    const b = stopBounds(20, 2, 9)
    expect(b.min1).toBeLessThanOrEqual(b.max1); expect(b.min2).toBeLessThanOrEqual(b.max2)
  })
})

describe('StintBar', () => {
  it('renders one segment per stint and one slider per stop', () => {
    render(<StintBar laps={49} startCompound="M" stops={[{ lap: 23, compound: 'H' }]} onChange={() => {}} />)
    expect(screen.getByText('M · L1–23')).toBeTruthy()
    expect(screen.getByText('H · L24–49')).toBeTruthy()
    const s = screen.getByRole('slider', { name: 'Stop 1 lap' })
    expect(s.getAttribute('aria-valuenow')).toBe('23')
    expect(s.getAttribute('aria-valuemax')).toBe('46')
  })
  it('arrows move the stop within bounds; End goes to the max', () => {
    const calls: [number, number][] = []
    render(<StintBar laps={49} startCompound="M" stops={[{ lap: 46, compound: 'H' }]} onChange={(i, l) => calls.push([i, l])} />)
    const s = screen.getByRole('slider', { name: 'Stop 1 lap' })
    fireEvent.keyDown(s, { key: 'ArrowRight' })
    expect(calls).toEqual([])           // already at max 46: no change
    fireEvent.keyDown(s, { key: 'ArrowLeft' })
    fireEvent.keyDown(s, { key: 'Home' })
    expect(calls).toEqual([[0, 45], [0, 5]])
  })
  it('stop 2 cannot be dragged closer than the stint gap to stop 1', () => {
    const calls: [number, number][] = []
    render(<StintBar laps={49} startCompound="M" stops={[{ lap: 20, compound: 'H' }, { lap: 24, compound: 'M' }]} onChange={(i, l) => calls.push([i, l])} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Stop 2 lap' }), { key: 'ArrowLeft' })
    expect(calls).toEqual([])
  })
})
```
(`MIN_STINT_GAP` is 4; if `RaceSetup.tsx` exports it, import it into `StintBar.tsx`; otherwise move the constant into `StintBar.tsx`, export it, and import it back into `RaceSetup.tsx`.)

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement `StintBar.tsx`** (`stopBounds` returns `{ min1: 5, max1: stopCount === 2 ? laps - 3 - MIN_STINT_GAP : laps - 3, min2: pitLap1 + MIN_STINT_GAP, max2: laps - 2 }`; the component computes bounds per handle from the current `stops`, clamps every candidate lap, and calls `onChange` only when the clamped lap differs from the current one). **Step 4: Run** — PASS.

- [ ] **Step 5: Failing test** `tests/ui/raceSetupBold.test.tsx` — copy mocks and store setup from `tests/ui/wingSelector.test.tsx` (including the `scrollIntoView` stub), then:
```tsx
it('the circuit card does not shrink, shows the outline, and the plan is a stint bar', () => {
  render(<RaceSetup />)
  const outline = screen.getByRole('img', { name: / layout$/ })
  const card = outline.closest('.slant-lg') as HTMLElement
  expect(card.style.flexShrink).toBe('0')
  expect(screen.getByRole('radiogroup', { name: 'Start tyre' }).querySelectorAll('[role="radio"]')).toHaveLength(5)
  expect(screen.getByRole('slider', { name: 'Stop 1 lap' })).toBeTruthy()
  expect(screen.queryByRole('slider', { name: 'Stop 2 lap' })).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: '2 STOP' }))
  expect(screen.getByRole('slider', { name: 'Stop 2 lap' })).toBeTruthy()
  expect(screen.getByText(/PLAN:/)).toBeTruthy()
})
it('long circuit names wrap', () => {
  render(<RaceSetup />)
  const h = screen.getAllByText(/GP|Grand Prix|Lights|Bay/i)[0] as HTMLElement
  expect(h.style.whiteSpace).not.toBe('nowrap')
})
```
(`Segmented` renders `role="radio"` buttons named by their label.)

- [ ] **Step 6: Run** — FAIL. **Step 7: Implement** the layout; the stop sliders become `StintBar` with `onChange(index, lap)` calling the existing `setPitLap1` (plus the existing push of stop 2) / `setPitLap2`. **Step 8: Run** the two new tests and the four pinned tests, full suite, tsc — PASS.
- [ ] **Step 9: Commit** `feat(ui): race setup in Race Day Bold with a draggable stint bar; circuit card no longer collapses`.

---

### Task 6: Qualifying — one flying lap

**Files:**
- Modify: `src/ui/Qualifying.tsx` (render only; keep `computeQualifyingWeather`, `formatDelta`, `formatTime`)
- Test: `tests/ui/qualifyingBold.test.tsx` (new); `tests/ui/qualifying.test.tsx` must pass unchanged

**Interfaces:**
- Consumes: kit (`ScreenFrame`, `ScreenHeader`, `TyreChip`, `KitButton`, `StandingRow`), `liveryOf` or the team colours, seasonStore/settingsStore values the file already reads.

Pinned by `qualifying.test.tsx`: attack buttons are `role="button"` with `aria-pressed`, one named `/attack/i` whose text contains `15%`; buttons `/^run lap$/i`, `/simulate/i`, `/to the grid/i` (absent before a result), compound buttons named `/soft/i`, `/inter/i`, `/wet/i` present or absent by weather; `data-testid` `qualifying-conditions` with `TRACK DRY|DAMP|WET`, `qualifying-status` with `P{n}`, `qualifying-row` (one per classified driver); `[data-animated="true"]` absent under reduced motion; some text matching `/scrappy|error|mistake/i` on a scrappy lap; no button named "lights out".

Layout (canvas "Qualifying"):
1. `ScreenHeader eyebrow="QUALIFYING · {CIRCUIT}" title="One flying lap"`; the `qualifying-conditions` line under it as a `Pill` (`TRACK WET · WETS ADVISED` gets the wet-tyre ring tone `rain` from Plan 1's design calls).
2. Two columns: `TYRE` — compact 48-high `slant-sm` buttons with `TyreChip size={26}`, `aria-label` = compound name (`Soft`, `Medium`, `Hard`, `Intermediate`, `Wet`), selected = volt fill with the chip in ink (`onInk={false}`); `ATTACK · {delta}s · {risk}% risk` (label for the selected level) above three 48-high `slant-sm` buttons labelled `SAFE`, `BAL`, `ATTACK` with a second line `{risk}%`; `aria-pressed` on the selected; selected = white fill ink text, except ATTACK selected = hot fill ink text.
3. Before a lap: a grape `slant-lg` card "Pick a tyre and an attack level, then run your lap." and the buttons `↺ SIMULATE` (secondary, 120 wide) and `RUN LAP` (primary, flex 1).
4. After a lap: the volt lap card (`slant-lg`, ink text): lap time (display 900 italic 54, reserve width as in the global constraint) and `P{n}` (display 900 italic 40); three sector deltas `S1 +0.41` etc. if the result exposes sectors, else omit the row; the line `+{gap} to pole · {n} cars on {compound}s ahead of you` (or the existing summary line); the scrappy/error tag in hot-on-ink pill when present; `qualifying-status` stays as a visually small `role="status"` line `Qualified P{n}`.
5. The grid: every classified row (`data-testid="qualifying-row"`) as a `StandingRow` (pos, team colour, code, time/gap, trailing = compound letter coloured by `TYRE_COLOR`), the player's row `mine`; keep `layoutId` and `data-animated="true"` exactly as today. The list scrolls to the player's row on first render (`scrollIntoView({ block: 'center' })`, guarded for tests).
6. Footer after a lap: `↺ SIMULATE` secondary and `TO THE GRID →` primary.

- [ ] **Step 1: Failing test** `tests/ui/qualifyingBold.test.tsx` (setup from `qualifying.test.tsx`):
```tsx
it('pairs tyre and attack, then shows a volt lap card and the grid with your row', async () => {
  render(<Qualifying />)
  expect(screen.getByRole('heading', { level: 1, name: /one flying lap/i })).toBeTruthy()
  expect(screen.getByRole('button', { name: /attack/i }).textContent).toMatch(/15\s*%/)
  fireEvent.click(screen.getByRole('button', { name: /^run lap$/i }))
  const status = await screen.findByTestId('qualifying-status')
  const rows = screen.getAllByTestId('qualifying-row')
  expect(rows.some(r => (r.closest('[data-standing-row]') as HTMLElement | null)?.style.background.includes('--volt'))).toBe(true)
  expect(status.textContent).toMatch(/P\d+/)
})
```
(If `qualifying-row` is put on the `StandingRow` element itself, `closest` returns it.)
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** both qualifying tests, full suite, tsc — PASS.
- [ ] **Step 5: Commit** `feat(ui): qualifying in Race Day Bold`.

---

### Task 7: Championship and the ladder verdict (audit bug: "SEASON 2025")

**Files:**
- Modify: `src/ui/Championship.tsx`, `src/ui/LadderReveal.tsx`, `src/ui/GridStats.tsx` (delete the dead commented-out `SEASON 2025` header block near line 642 only)
- Test: `tests/ui/championshipBold.test.tsx` (new); `tests/ui/championshipRollover.test.tsx`, `tests/ui/seasonEnd.test.tsx`, `tests/ui/ladderReveal.test.tsx`, `tests/ui/designCalls.test.tsx` must pass

**Interfaces:**
- Consumes: kit (`ScreenFrame`, `ScreenHeader`, `HeroBand`, `Tabs`, `StandingRow`, `StatTile`, `ProgressStrip`, `KitButton`), `HelmetAvatar`; careerStore `seasonNumber`; tuning `career.teamTiers` (`step`, `facets`); everything the two files already read.

Pinned: buttons `/next season/i`, `/end career/i`, `/confirm|yes, end/i`; `BadgeToast` text; `LadderReveal` labels `Deserved P{n}`, `Finished P{n}`, `Tier {a} to {b}`, `Grid movers`, verdict texts `▲ STEP UP` / `▼ STEP DOWN` / `● HELD`; `ConstructorsList` renders `listitem`s with the player's `aria-current="true"`; the verdict's haptic/sound timing (`VERDICT_DELAY`).

One screen, three bands, top to bottom (the canvas draws the verdict as its own board; it stays inside the season-end screen so the flow and the store do not change):
1. `ScreenHeader eyebrow="SEASON {seasonNumber} · FINAL" title="Championship"` — this replaces the hard-coded "SEASON 2025 COMPLETE". `ProgressStrip total={TOTAL_RACES} done={TOTAL_RACES} ariaLabel="Season complete"`.
2. **The verdict** (when `lastLadder && selectedTeamId`): `LadderReveal` becomes a full-width band: `HeroBand` in `var(--gain)` (step up), `var(--hot)` (step down) or `var(--dusk)` (held), height 300; on it in ink (white on dusk) the verdict in display 900 italic 96 on two lines (`▲ STEP` / `UP`, `▼ STEP` / `DOWN`, `● HELD`) — keep the single-string text nodes the tests find by putting the full verdict string in a visually hidden span and the two display lines `aria-hidden` — then `{team} · Tier {a} → {b}` (the `Tier … to …` aria-label stays), then one sentence: `You finished P{finished} in the constructors' — {k} place(s) above/below where the car deserved.` or `…exactly where the car deserved.` (Deserved/Finished labels stay as accessible elements). Beneath the band three `StatTile`s, one per `teamTiers.facets` entry (`POWER`, `AERO`, `HANDLING`), value `{±(after−before)×step}` in gain/hot tone (`±0` default). Then a `var(--night)` `slant-lg` card `ACROSS THE GRID` with the movers line (`Grid movers` label) and `Rival development resets for the new season.` The verdict's haptic/sound timing is unchanged.
3. **The champion**: `HeroBand` in the champion's team colour, height 150, `HelmetAvatar size={72}`, label `CHAMPION` (or `YOU ARE THE CHAMPION` when the player won), name (display 900 italic 38), `{pts} pts`. When the player is not champion, a `StatTile` row: `YOU FINISHED P{rank}`, `{pts} PTS`.
4. **Standings**: `Tabs ariaLabel="Standings"` with `DRIVERS` / `TEAMS`; drivers as `StandingRow`s (pos, team colour, name, pts, `bar = pts / leaderPts`, player `mine`), top 10 with an `ALL {n} DRIVERS ↓` text button (`aria-expanded`) for the rest; teams as `ConstructorsList` restyled to `StandingRow`s inside its `<ul>/<li>` (keep `aria-current`).
5. Footer: the `CHAMPIONSHIP BONUS +{n} PTS` strip as a volt `Pill` when `lastSeasonBonus > 0`; `KitButton primary lg` `NEXT SEASON →` with the existing sub-line; `END CAREER` as a secondary sm button with the existing two-step confirm (`CANCEL` / `CONFIRM — END CAREER`, the confirm as `urgent`).

- [ ] **Step 1: Failing test** `tests/ui/championshipBold.test.tsx` (store setup from `championshipRollover.test.tsx`; set `useCareerStore.setState({ seasonNumber: 3 })` and a `lastLadder` with the player stepping up from 0 to 1):
```tsx
it('names the real season, leads with the verdict band, and keeps the standings in tabs', () => {
  render(<Championship />)
  expect(screen.getByText(/SEASON 3 · FINAL/)).toBeTruthy()
  expect(screen.queryByText(/2025/)).toBeNull()
  expect(screen.getByText('▲ STEP UP')).toBeTruthy()
  expect(screen.getByText('POWER')).toBeTruthy()
  expect(screen.getByText('+3')).toBeTruthy() // one tier × step 3
  expect(screen.getByRole('tablist', { name: 'Standings' })).toBeTruthy()
  expect(screen.getByRole('button', { name: /next season/i })).toBeTruthy()
})
```
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** Also `grep -rn "2025" src/ui` must return nothing afterwards. **Step 4: Run** the new test and the four pinned tests, full suite, tsc — PASS.
- [ ] **Step 5: Commit** `feat(ui): championship and ladder verdict in Race Day Bold; season number from the career`.

---

### Task 8: Garage — collectible cards

**Files:**
- Modify: `src/ui/GridStats.tsx` (render of the header, tabs, `DriverCard`, `CarCard`, and the compare entry; the radar/facet/compare internals restyle by tokens only)
- Test: `tests/ui/garageBold.test.tsx` (new)

**Interfaces:**
- Consumes: kit (`ScreenFrame`, `ScreenHeader`, `Tabs`, `CarArt`, `liveryOf`, `StatTile`), `HelmetAvatar`; seasonStore `exitGrid`; the file's existing state (`tab`, `expanded`, `compareMode`, `compareIds`).

No test renders this screen today, so nothing is pinned; keep the compare logic and rivalry data untouched.

Layout (canvas "Garage"):
1. `ScreenHeader title="The grid" onBack={exitGrid}` with `right` = `Tabs ariaLabel="Garage"` over `DRIVERS` / `CARS` / `VS`. `VS` sets `compareMode` on (drivers compare on the drivers list, teams on the cars list — keep whichever list was showing); leaving `VS` turns it off. The compare hint line stays under the header when compare is on.
2. Drivers: a two-column grid of collectible cards (`slant-md` grape, height 196, `role="button"`, `aria-expanded`, `aria-label="{name}, {team}, rating {r}"`): a 92-high band in the team colour across the top, the rating in display 900 italic 40 ink top-right, `HelmetAvatar size={72}` overlapping the band, name (display 900 italic 22 uppercase, wraps), team in lilac 12. Tapping expands the card to span both columns (`gridColumn: '1 / -1'`) and shows the existing facet bars/radar and rivalry lines below; in compare mode tapping selects for comparison exactly as today (selected = volt inset ring).
3. Cars: the same card shape with `CarArt heading="left"` in the band instead of the helmet, team name and the rating; expanding shows the existing facet detail.
4. Remove the `‹` back glyph, "Grid & Stats" title and the `#888` fallback (use `var(--lilac-dim)`).

- [ ] **Step 1: Failing test** `tests/ui/garageBold.test.tsx` (mock haptics/preferences as in Task 3):
```tsx
it('shows drivers as collectible cards and switches to cars and compare with tabs', () => {
  render(<GridStats />)
  expect(screen.getByRole('heading', { level: 1, name: /the grid/i })).toBeTruthy()
  const tabs = screen.getByRole('tablist', { name: 'Garage' })
  expect(tabs.querySelectorAll('[role="tab"]')).toHaveLength(3)
  const card = screen.getAllByRole('button', { name: /, rating \d+$/ })[0]!
  expect(card.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(card)
  expect(card.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(screen.getByRole('tab', { name: 'CARS' }))
  expect(screen.getAllByRole('img', { name: / car$/ }).length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('tab', { name: 'VS' }))
  expect(screen.getByText(/to compare/i)).toBeTruthy()
})
```
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** the test, full suite, tsc — PASS.
- [ ] **Step 5: Commit** `feat(ui): garage as collectible cards in Race Day Bold`.

---

### Task 9: Trophy room (career record, badge wall, badge toast) and the menu tile

**Files:**
- Modify: `src/ui/CareerRecord.tsx`, `src/ui/BadgeCase.tsx`, `src/ui/BadgeToast.tsx`, `src/ui/MainMenu.tsx` (tile row and the pending-result label only)
- Test: `tests/ui/trophyRoom.test.tsx` (new); `tests/ui/careerRecord.test.tsx`, `tests/ui/badgeCase.test.tsx`, `tests/ui/badgeToast.test.tsx`, `tests/ui/mainMenuBold.test.tsx`, `tests/ui/mainMenuContinue.test.tsx`, `tests/ui/championshipRollover.test.tsx` must pass

**Interfaces:**
- Consumes: kit (`ScreenFrame`, `ScreenHeader`, `StatTile`, `StandingRow`, `KitButton`), `BADGES`, `earnedBadges` from `@state/badges`; careerStore fields `seasonNumber`, `titles`, `wins`, `podiums`, `poles`, `racesStarted`, `bestFinish`, `seasonHistory`; seasonStore `exitCareer`, `viewCareer`; `SeasonSnapshot.resultPending`.

Pinned: `career-season-row` test id (one per season), text matching `/poles/i`; `TROPHY CASE`-style counter `{earned} / {BADGES.length}` text; every badge name as text; the condition text of a locked badge (e.g. `Win the championship`); `badge-{id}` test ids with `data-earned` and `aria-label` `{name} — earned` / `{name} — locked: {condition}`; toast text `BADGE EARNED` and the badge name.

The spec's trophy room is the existing career screen (phase `career`) redesigned — no new phase, no new tracking.

Layout (canvas "Trophy room"):
1. `ScreenHeader eyebrow="CAREER · SEASON {seasonNumber}" title="Trophy room" onBack={exitCareer}`.
2. Four `StatTile`s: `TITLES`, `WINS`, `PODIUMS`, `BEST` (`P{n}` or `—`; tone `volt` when it is P1). Below them one lilac-dim 13 line: `{poles} poles · {racesStarted} races · {seasonNumber − 1} seasons` (keeps `/poles/i`).
3. `BADGES` head (display 700 20 lilac-dim) with `{earned} / {total}` in volt on the right. Badge wall: three columns, each badge a 92-high `slant-md` tile with `data-testid`, `data-earned`, `aria-label` as today; earned = volt fill, ink text, `★`; locked = grape fill, lilac-dim text, `◇`, and the condition in 11px under the name (so locked conditions stay visible text).
4. `SEASON HISTORY` head; rows as `StandingRow` (`pos` = `S{n}`, team colour, `Driver · Team`, value `P{pos} · {pts} PTS`, trailing `🏆` when champion) carrying `data-testid="career-season-row"`; the empty state keeps its two lines in a grape `slant-lg` card.
5. `BadgeToast`: each toast a `slant-md` volt card, ink text, `BADGE EARNED` 800 11 letter-spacing 2 above the name in display 900 italic 22; enters with `snapIn`; positioned as today.
6. **Main menu tile:** the third tile becomes `TROPHIES` (always shown, `viewCareer`) with a second line `{earned} / {total}` in volt 11 (earned from `earnedBadges(useCareerStore.getState())`); remove the `hasCareer` gate for this tile only.
7. **Main menu, result waiting:** when the saved snapshot has `resultPending`, the next-race card label reads `ROUND {n} OF 12 · RESULT WAITING` and the CONTINUE sub-label reads `Round {n} of 12 · result waiting` (the `Round N of 12` substring stays for `mainMenuContinue.test.tsx`).

- [ ] **Step 1: Failing test** `tests/ui/trophyRoom.test.tsx` (store setup from `careerRecord.test.tsx`; for the menu part, the mocks from `mainMenuBold.test.tsx`):
```tsx
it('is the trophy room: four stat tiles, a badge wall with earned volt and locked grape', () => {
  render(<CareerRecord />)
  expect(screen.getByRole('heading', { level: 1, name: /trophy room/i })).toBeTruthy()
  for (const k of ['TITLES', 'WINS', 'PODIUMS', 'BEST']) expect(screen.getByText(k)).toBeTruthy()
  const earned = document.querySelector('[data-earned="true"]') as HTMLElement | null
  const locked = document.querySelector('[data-earned="false"]') as HTMLElement
  if (earned) expect(earned.style.background).toContain('--volt')
  expect(locked.style.background).toContain('--grape')
})
it('a first-time career still shows the wall and the empty history card', () => {
  // reset careerStore to its initial record
  render(<CareerRecord />)
  expect(screen.getByText(/THE RECORD STARTS AT THE CHEQUERED FLAG/)).toBeTruthy()
  expect(screen.getByText(`0 / ${BADGES.length}`)).toBeTruthy()
})
it('the menu offers TROPHIES with the badge count', async () => {
  render(<MainMenu />)
  expect(await screen.findByRole('button', { name: /TROPHIES/ })).toBeTruthy()
})
```
Add to `mainMenuBold.test.tsx` a case with a snapshot whose `resultPending: true` asserting `/RESULT WAITING/`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** the new test and the six pinned tests, full suite, tsc — PASS.
- [ ] **Step 5: Commit** `feat(ui): trophy room, badge wall and toast in Race Day Bold; menu TROPHIES tile`.

---

### Task 10: Settings and how-to-play

**Files:**
- Modify: `src/ui/SettingsPanel.tsx` (both `SettingsScreen` and the in-race drawer), `src/ui/HowToPlay.tsx`
- Test: `tests/ui/settingsBold.test.tsx` (new); `tests/ui/simSpeedSetting.test.tsx`, `tests/ui/mainMenuBold.test.tsx` must pass

**Interfaces:**
- Consumes: kit (`ScreenFrame`, `ScreenHeader`, `KitToggle`, `Segmented`, `Pill`, `KitButton`, `snapIn`, `useReducedMotion`); settingsStore (whole store), coachStore `reset`, seasonStore `exitSettings`, `exitHowToPlay`, `startNewSeason`.

Pinned: the in-race gear button `aria-label="Settings"`; sim speed default setting behaviour.

Settings screen (canvas "Settings"): `ScreenHeader title="Settings" onBack={exitSettings}`; groups with display 700 18 uppercase lilac-dim heads, rows 4 px apart:
- `AUDIO & FEEL`: `KitToggle` Sound effects ("Engine, pit and UI audio"), Haptic feedback ("Vibration on pit stops and actions"), Reduce motion ("Simpler animations everywhere").
- `GAMEPLAY`: Sim speed as a grape `slant-row` row with label/sub on the left and a `Segmented ariaLabel="Sim speed"` (`1×`/`2×`/`4×`) on the right; Difficulty the same with `Rookie`/`Pro`; `KitToggle` Skip start sequence, Pro mode; Replay tutorial (`checked={!coachMarksSeen}`, on change call the existing reset path).
- `ACCOUNT`: `KitToggle` Cloud save, sub "Google Play Games", `disabled`, with a `Pill` `Coming soon` beside the group head (spec: stays "Coming soon").
- Footer row: `Privacy policy` (lilac, "Coming soon" as today) and `Pit Wall v{__APP_VERSION__}` in lilac-dim 13.

The in-race drawer: the gear button stays 48×48 round grape; the sheet uses the pit sheet's shape (night, slanted top edge `clip-path: polygon(0 3%,100% 0,100% 100%,0 100%)`), title `SETTINGS` display 900 italic 30, a `DONE` round pill 48 high, and the three `KitToggle`s (Sound, Haptics, Reduce motion with the drawer's existing subs); slide with `{ duration: 0.22, ease: EASE }`, opacity only when reduced; `role="dialog" aria-modal="true" aria-label="Settings"`. Delete the local `Toggle`, `SpeedSelect`, `DifficultySelect` once unused.

How to play (not drawn): `ScreenHeader eyebrow="HOW TO PLAY · {i+1} OF 6" title={step title}` with `right` = a `SKIP` text button (48 high); one big grape `slant-lg` card with the step's emoji at 48px and the body in lilac 16 / 1.5; a `ProgressStrip total={6} done={i}` style row of six slanted segments that are buttons (`aria-label="Step {n}"`, `aria-current` on the current); footer `← BACK` secondary (from step 2) and `NEXT →` / `START RACING →` primary. Steps swap with `snapIn`, opacity only when reduced (it ignores reduced motion today).

- [ ] **Step 1: Failing test** `tests/ui/settingsBold.test.tsx`:
```tsx
it('settings are slanted switches, segmented speed and difficulty, and cloud save stays coming soon', () => {
  render(<SettingsScreen />)
  for (const n of ['Sound effects', 'Haptic feedback', 'Reduce motion', 'Skip start sequence', 'Pro mode', 'Replay tutorial'])
    expect(screen.getByRole('switch', { name: n })).toBeTruthy()
  expect(screen.getByRole('radiogroup', { name: 'Sim speed' })).toBeTruthy()
  expect(screen.getByRole('radiogroup', { name: 'Difficulty' })).toBeTruthy()
  expect((screen.getByRole('switch', { name: 'Cloud save' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText('Coming soon', { exact: false })).toBeTruthy()
  fireEvent.click(screen.getByRole('switch', { name: 'Reduce motion' }))
  expect(useSettingsStore.getState().reducedMotion).toBe(true)
})
it('how to play steps are reachable from the strip and announce the current step', () => {
  render(<HowToPlay />)
  fireEvent.click(screen.getByRole('button', { name: 'Step 3' }))
  expect(screen.getByRole('button', { name: 'Step 3' }).getAttribute('aria-current')).toBe('step')
  expect(screen.getByText(/3 OF 6/)).toBeTruthy()
})
```
(Set `reducedMotion: false` in `beforeEach` for the toggle assertion.)
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** the test, `simSpeedSetting.test.tsx`, `mainMenuBold.test.tsx`, full suite, tsc — PASS.
- [ ] **Step 5: Commit** `feat(ui): settings and how-to-play in Race Day Bold`.

---

### Task 11: Scenarios, start lights (audit bug: "Slicks won't hold" on a dry track)

**Files:**
- Modify: `src/ui/ScenarioSelect.tsx`, `src/ui/ScenarioResult.tsx`, `src/ui/StartLights.tsx` (palette and type only), `src/styles/tokens.css` (two tokens), `src/state/radioMapper.ts:111-116`, `src/data/radio.json` (new `dry_spin` pool)
- Test: `tests/ui/scenariosBold.test.tsx` (new), `tests/state/radioMapper.test.ts` (add cases); `tests/ui/scenarioSelect.test.tsx`, `tests/ui/scenarioResult.test.tsx`, `tests/ui/simSpeedSetting.test.tsx`, `tests/ui/tutorialMarkTiming.test.tsx` must pass

**Interfaces:**
- Consumes: kit (`ScreenFrame`, `ScreenHeader`, `HeroBand`, `Pill`, `TyreChip`, `KitButton`, `snapIn`, `useReducedMotion`), `CircuitOutline`; `config.compounds[player.compound].type` (`'dry' | 'wet'`) in the radio mapper.

The radio bug: the mapper fires the `wet_spin` pool (lines written for slicks in the rain, e.g. "Slicks won't hold in this.") on ANY new player spin, but the engine also spins wet-family tyres on a dry track (`lapModel.ts`, `dryTrackSpinChance`) — the Cliff Edge scenario starts on inters. Fix: when the spinning car is on a wet-family compound and the track is DRY, use a new `dry_spin` pool instead.

- [ ] **Step 1: Failing radio test** — add to `tests/state/radioMapper.test.ts`, reusing its `makeRadioState`, `makeState`, `makeConfig`, `makeSpinResult` helpers (extend `makeState`/`makeConfig` overrides if needed so the player can be on `I` with `weatherState: 'DRY'`):
```ts
it('a spin on wet tyres on a dry track uses the dry_spin pool, never a slicks line', () => {
  const pushAlert = vi.fn()
  const state = makeState({ weatherState: 'DRY', sectorResults: [makeSpinResult({ spinLoss: 3 })] })
  state.cars.forEach(c => { if (c.driverId === state.cars[0]!.driverId) c.compound = 'I' })
  processRadioTick(state, makeConfig(), makeRadioState(), pushAlert)
  const text = String(pushAlert.mock.calls[0]?.[0]?.text ?? pushAlert.mock.calls[0]?.[0] ?? '')
  expect(radio.dry_spin).toContain(text)
  expect(text).not.toMatch(/slicks/i)
})
```
(Import `radio` from `@data/radio.json`. Read how the existing `wet_spin` test extracts the pushed line and assert the same way; adjust the player lookup to how `makeState` identifies the player.)
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** In `radio.json` add:
```json
"dry_spin": [
  "Those wets are cooking on a dry line. Easy on the throttle.",
  "That's the rubber overheating — the track's too dry for these.",
  "Big slide. The inters won't last on a dry track."
],
```
In `radioMapper.ts` replace the `tryPush('wet_spin', …)` call with:
```ts
    const onWetTyres = compound?.type === 'wet'
    tryPush(onWetTyres && state.weatherState === 'DRY' ? 'dry_spin' : 'wet_spin', 2, {}, pushAlert)
```
(`compound` is the `config.compounds[player.compound]` already in scope at line 85; if the pool names are a typed union, add `'dry_spin'` to it and to the radio data validator.) **Step 4: Run** the radio tests — PASS.

- [ ] **Step 5: Screens.** Pinned: `FINISH P{n} OR BETTER` hidden until a card is expanded; `TAKE OVER`; a back control (move the `getByText('BACK')` in `scenarioSelect.test.tsx` to `getByRole('button', { name: 'Back' })` and say so in the commit); the card is `role="button"` with Enter/Space toggling and `aria-expanded`; result: `/GOAL MET/` with ✓, `/GOAL MISSED/` with ✗, `TARGET P{n}`, `FINISHED P3`, `role="status"`, `TRY AGAIN`, `BACK TO MENU`.
  - **Scenario select:** `ScreenHeader eyebrow="SCENARIOS" title="Jump in" onBack={exitScenarios}` and the existing sub-line "Drop into a race already in progress." in lilac. Each scenario is a `slant-lg` grape card: collapsed = name (display 900 italic 28) + circuit name in lilac-dim + `CircuitOutline` 72×56 on the right; expanded = the blurb, a row of `Pill`s (`P{n}`, `{n} LAPS LEFT`, `TyreChip` + age, and a caution-tone `⚠ SAFETY CAR` pill when applicable — race control, so caution is right), the goal line `FINISH P{n} OR BETTER` in volt 800, and `KitButton primary md` `TAKE OVER`.
  - **Scenario result:** `ScreenHeader eyebrow="SCENARIO" title={active.name}`; a `HeroBand` in `var(--gain)` (met) or `var(--hot)` (missed) with the verdict (`✓ GOAL MET` / `✗ GOAL MISSED`) in display 900 italic 64 ink inside the `role="status"` element, and `TARGET P{n} · FINISHED P{n}` (or `RETIRED`) in ink 800 16; actions `TRY AGAIN` (primary lg) and `BACK TO MENU` (secondary sm).
  - **Start lights:** add to `tokens.css` `--start-light: #FF3B4A;` (a physical red lamp, deliberately not `--hot`) and `--floodlight: #FFFBE6;` with a one-line comment each; replace `#FF4D5E` with `var(--start-light)` (and its glow `rgba(var(--start-light-rgb), …)` — add `--start-light-rgb: 255, 59, 74`), `#fffbe6` stops with `style={{ stopColor: 'var(--floodlight)' }}`, `#0B0820`/`#120E2B` with `var(--ink)`/`var(--night)`, `rgba(10,14,26,…)` with `rgba(var(--ink-rgb), …)`, the unlit lamp `rgba(40,20,20,.8)` with `var(--grape)`. The status text and "GO" use display 900 italic; `GO` in `var(--gain)`. Do not change timing, sound, haptics or `confirmRaceStart`.

- [ ] **Step 6: Failing test** `tests/ui/scenariosBold.test.tsx` (mocks/store from `scenarioSelect.test.tsx` and `scenarioResult.test.tsx`):
```tsx
it('scenario cards show the circuit outline and a volt goal when expanded', () => {
  render(<ScenarioSelect />)
  expect(screen.getAllByRole('img', { name: / layout$/ }).length).toBeGreaterThan(0)
  const first = screen.getByText(SCENARIOS[0]!.name).closest('[role="button"]') as HTMLElement
  fireEvent.click(first)
  expect(screen.getByText(/FINISH P\d+ OR BETTER/).style.color).toContain('--volt')
})
it('start lights carry no raw hex', () => {
  const src = readFileSync(join(__dirname, '../../src/ui/StartLights.tsx'), 'utf8')
  expect(src).not.toMatch(/#[0-9a-fA-F]{6}\b/)
})
```
- [ ] **Step 7: Run** — FAIL. **Step 8: Implement.** **Step 9: Run** all tests named in this task, full suite, tsc — PASS.
- [ ] **Step 10: Commit** `feat(ui): scenarios and start lights in Race Day Bold; dry-track spin radio no longer blames slicks`.

---

### Task 12: Clean-up — retire the legacy token names

**Files:**
- Modify: every file under `src/` that uses a legacy token name; `src/styles/tokens.css` (remove the aliases); `CLAUDE.md` §6.1 only if it names a removed token
- Test: `tests/ui/legacyTokenBan.test.ts` (new); `tests/ui/tokenContrast.test.ts`, `tests/ui/colorMixBan.test.ts`, `tests/ui/timingTowerFlash.test.tsx`, `tests/ui/cautionToken.test.ts` must pass

Mapping (each alias today resolves to exactly its target — verify in `tokens.css` before replacing; if any does not, stop and report):

| legacy | replace with |
|---|---|
| `--bg-deep` | `--ink` |
| `--bg-panel` | `--grape` |
| `--bg-elevated` | `--dusk` |
| `--text-hi` | `--white` |
| `--text-mid` | `--lilac` |
| `--text-dim` | `--lilac-dim` |
| `--accent-rgb` | `--volt-rgb` |
| `--accent` | `--volt` |
| `--accent-warm` | `--hot` |
| `--negative` | `--hot` |
| `--positive-rgb` | `--gain-rgb` |
| `--positive` | `--gain` |
| `--font-mono` | `--font-body` |
| `--accent-violet` | (unused; delete) |

`--line-hair` and the `--tyre-*` tokens are not legacy and stay. Replace longer names first (`--accent-rgb` before `--accent`, `--accent-warm` before `--accent`, `--positive-rgb` before `--positive`) so no partial match corrupts a name. Remove the `.mono` class if nothing uses it.

- [ ] **Step 1: Failing test** `tests/ui/legacyTokenBan.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const LEGACY = ['--bg-deep', '--bg-panel', '--bg-elevated', '--text-hi', '--text-mid', '--text-dim',
  '--accent', '--accent-rgb', '--accent-warm', '--accent-violet', '--negative', '--positive', '--positive-rgb', '--font-mono']
const files: string[] = []
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) && files.push(p) } }
walk(join(__dirname, '../../src'))

describe('Race Day Bold token names only', () => {
  it.each(LEGACY)('%s is gone from src/', name => {
    const re = new RegExp(`${name.replace(/-/g, '\\-')}(?![\\w-])`)
    const hits = files.filter(f => re.test(readFileSync(f, 'utf8')))
    expect(hits, hits.join('\n')).toEqual([])
  })
})
```
- [ ] **Step 2: Run** — FAIL (lists files). **Step 3: Replace** with the table (a short Node script over `src/` using the same `(?![\w-])` boundary is fine; review the diff), then delete the alias block from `tokens.css`. Update any test that asserted a legacy name in an inline style (e.g. `toContain('--accent')`) to the new name and list them in the commit. **Step 4: Run** the full suite, tsc and `npm run build` — PASS; grep `src/` for `type: 'spring'` and replace any remaining with `{ duration: 0.22, ease: EASE }` (global constraint).
- [ ] **Step 5: Commit** `refactor(ui): retire legacy token names; Race Day Bold names only`.

---

### Task 13: Phone pass and store screenshots

**Files:** Modify `docs/V2-CHECKLIST.md`; replace `store/screenshots/*.png`.

- [ ] **Step 1:** `npm run build && npx cap sync android`, then `cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew -q assembleRelease && adb install -r app/build/outputs/apk/release/app-release.apk`. Never read or print `android/keystore.properties`. If the phone is locked, stop and ask Veet to unlock it; never unlock it, change its settings, or open notifications.
- [ ] **Step 2:** On the phone, walk a new career and record per screen: team select (swipe the strip, long names wrap), driver select, the factory (buy one tier), race setup (drag the stint split both ways, 2-stop on the shortest circuit, circuit card fully visible), qualifying (run and simulate), a race (Plan 1 screens unchanged), result, the trophy room, garage (expand a card, VS), settings (every switch), how-to-play, a scenario (Cliff Edge: no "slicks" radio on a dry track), and a season end (verdict band, champion band). For every screen switch, watch for a blank frame. Note anything unreadable or clipped.
- [ ] **Step 3:** Capture eight store screenshots with `adb exec-out screencap -p > store/screenshots/NN-name.png`: `01-main-menu`, `02-team-select`, `03-race-setup`, `04-qualifying`, `05-live-race`, `06-pit-panel`, `07-race-result`, `08-trophy-room` (remove the old seven). Check each image for anything personal (notifications, status-bar content) before keeping it; recapture if any.
- [ ] **Step 4:** Write "Race Day Bold — Plan 2 phone pass" in `docs/V2-CHECKLIST.md` with the results and anything left for Veet; update the "Screenshots" note under "Still Veet's" to say the new set is ready to upload. Commit `docs: Race Day Bold plan 2 phone pass and store screenshots`.

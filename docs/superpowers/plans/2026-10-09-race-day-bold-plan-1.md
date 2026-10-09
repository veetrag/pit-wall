# Race Day Bold — Plan 1: Foundations, Kit, Hero Screens

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the whole app in Race Day Bold through its design tokens, build the shared component kit and art, and rebuild the three hero screens (main menu, race incl. pit panel, race result) to the canvas.

**Architecture:** The app styles everything inline through CSS custom properties (`var(--accent)` ×100, `var(--font-display)` ×139 …). Task 1 therefore re-points the EXISTING tokens at the new palette and fonts, which re-skins every screen at once, and adds the new named tokens. A small kit (`src/ui/kit/`) supplies the slanted shapes, buttons, chips, segmented control, tyre chip, tyre meter, progress strip, hero band and the car art. The hero screens are then rebuilt on the kit. No engine, store or save change except one optional data field (`liveryAccent`).

**Tech Stack:** React 18, TypeScript strict, framer-motion, Zustand, Vitest + @testing-library/react (no jest-dom), Capacitor.

**Spec:** `docs/superpowers/specs/2026-10-09-race-day-bold-redesign-design.md`. Visual reference: the Claude Design canvas https://claude.ai/artifact/7WjMhLd4TeHhHUr81gSNrM (boards "Race Day Bold — design system", "Hero 1 · Main menu", "Hero 2 · Race", "Hero 3 · Race result", "Pit panel"). The spec wins over the canvas.

**Scope:** spec §8 steps 1–3. Plan 2 (remaining screens, the five audit bugs, clean-up, store screenshots) is written after this plan's phone pass.

## Global Constraints

- Presentation only: never change `src/engine/`, store logic, save schemas, or gameplay numbers.
- Colours only through tokens in `src/styles/tokens.css`; no new raw hex in components (team/tyre colours come from data or the `TYRE_COLOR` map in the kit).
- **Volt (`--volt`, #FFD60A) is the only call-to-action colour.** Hot (`--hot`, #FF2E63) means urgent.
- **Text on a hot or volt or caution fill is `--ink`** (white on #FF2E63 is 3.6:1 — fails AA). Text on ink/night/grape/dusk uses `--white`/`--text-mid`/`--text-dim`/`--volt`/`--hot`/`--gain`.
- Every live or comparable number uses tabular figures (`body` sets `font-variant-numeric: tabular-nums` globally from Task 1).
- Fonts are self-hosted woff2 in `public/fonts/` (the app has no INTERNET permission); never a Google Fonts link. Big Shoulders Display ships no italic; `font-style: italic` on it is the browser's synthesized oblique, which is what the canvas shows.
- One forward slant: use the kit classes `.slant-row` (2%), `.slant-lg` (3–4%), `.slant-md` (6%), `.slant-sm` (12%); no per-component polygon numbers.
- Only pills and avatars are round.
- Touch targets ≥ 48 px high.
- Motion: snap along the slant, ≈180 ms ease-out `[0.2, 0, 0, 1]`; nothing bounces; reduced motion (the `settingsStore.reducedMotion` flag) = opacity only, counts land instantly.
- Focus must stay visible on clipped elements: `.kit-focus:focus-visible` (inner box-shadow), never rely on `outline`.
- No `color-mix()` (minSdk 30; `tests/ui/colorMixBan.test.ts`). Translucency via `rgba(var(--x-rgb), a)`.
- Copy that tests pin must survive: 'NEW SEASON', 'CONTINUE SEASON', 'DISCARD AND START OVER?', 'Round N of 12', MENU button, 'PIT LOSS', 'UNDER SAFETY CAR', badge names, 'W{n}' chip, `[data-tower-row]` with the caution flash in inline `style.background` using `--caution-rgb`.
- TS lib < es2022 (no `.at()`); jest-dom absent (assert with `toBeTruthy()` on `getBy*`).
- Commit after each task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| file | responsibility |
|---|---|
| `public/fonts/barlow-latin-{500,600,700,800}-normal.woff2`, `public/fonts/big-shoulders-display-latin-{700,900}-normal.woff2` | new self-hosted fonts |
| `src/styles/fonts.css` | `@font-face` for Barlow + Big Shoulders Display (old faces removed) |
| `src/styles/tokens.css` | new named tokens; old tokens re-pointed |
| `src/styles/kit.css` | slant, focus, hero-band utility classes |
| `src/ui/kit/motion.ts` | `useReducedMotion`, `snapIn`, `useCountUp` |
| `src/ui/kit/Button.tsx` | `KitButton` (primary/urgent/secondary) |
| `src/ui/kit/Pill.tsx` | round status pill |
| `src/ui/kit/Segmented.tsx` | slanted segmented radio group |
| `src/ui/kit/TyreChip.tsx` | compound ring + letter; `TYRE_COLOR` |
| `src/ui/kit/TyreMeter.tsx` | ten-segment wear meter |
| `src/ui/kit/ProgressStrip.tsx` | season strip |
| `src/ui/kit/HeroBand.tsx` | slanted colour band behind a hero |
| `src/ui/kit/CarArt.tsx` | top-down car in a livery |
| `src/ui/kit/index.ts` | re-exports |
| `src/data/cars.json`, `src/data/validators.ts`, `src/engine/types.ts` (type only) | optional `liveryAccent` per team |
| `src/ui/MainMenu.tsx` | hero 1 |
| `src/ui/RaceHUD.tsx`, `TimingTower.tsx`, `TelemetryZone.tsx`, `PaceModeToggle.tsx`, `HudAlert.tsx`, `SafetyCarBanner.tsx`, `WeatherStrip.tsx` (chip) | hero 2 |
| `src/ui/PitPanel.tsx` | pit sheet |
| `src/ui/RaceResult.tsx` | hero 3 |
| `CLAUDE.md` | §6.1 rewritten |

---

### Task 1: Tokens, fonts and the constitution

**Files:**
- Create: `public/fonts/barlow-latin-500-normal.woff2`, `…-600…`, `…-700…`, `…-800…`, `public/fonts/big-shoulders-display-latin-700-normal.woff2`, `…-900…`
- Delete: `public/fonts/inter-var.woff2`, `jetbrains-mono-var.woff2`, `rajdhani-500.woff2`, `rajdhani-600.woff2`, `rajdhani-700.woff2`
- Modify: `src/styles/fonts.css`, `src/styles/tokens.css`, `tests/ui/noRemoteAssets.test.ts`, `CLAUDE.md` §6.1, `public/fonts/OFL.txt` (append the two families' copyright lines)
- Create: `src/styles/kit.css`; Modify: `src/App.tsx` (import it after tokens.css)
- Test: `tests/ui/tokenContrast.test.ts`

**Interfaces:**
- Produces tokens: `--ink #120E2B`, `--night #1B1542`, `--grape #2A2160`, `--dusk #3A2F7A`, `--lilac #CFC8F2`, `--lilac-dim #A99FDB`, `--white #FFFFFF`, `--volt-rgb 255,214,10` / `--volt`, `--hot-rgb 255,46,99` / `--hot`, `--gain` (= existing `--positive`), `--caution` (unchanged #FFB020).
- Re-points: `--bg-deep → #120E2B`, `--bg-panel → #2A2160`, `--bg-elevated → #3A2F7A`, `--line-hair → #3A2F7A`, `--text-hi → #FFFFFF`, `--text-mid → #CFC8F2`, `--text-dim → #A99FDB`, `--accent-rgb → 255, 214, 10`, `--accent-warm → #FF2E63`, `--negative → #FF2E63`, `--tyre-soft → #FF2E63`, `--tyre-medium → #FFD60A`, `--tyre-hard → #FFFFFF`, `--tyre-inter → #3DDC84`, `--tyre-wet → #4DA6FF`, `--font-display → 'Big Shoulders Display', sans-serif`, `--font-body → 'Barlow', sans-serif`, `--font-mono → 'Barlow', sans-serif`.
- Produces classes (kit.css): `.slant-row`, `.slant-lg`, `.slant-md`, `.slant-sm`, `.kit-focus`, `.hero-band`, `.hero-band-stripes`.

- [ ] **Step 1: Vendor the fonts.** In a scratch dir (not the repo):
```bash
npm pack @fontsource/big-shoulders-display@5.3.0 @fontsource/barlow@5.3.0
tar -xzf fontsource-big-shoulders-display-5.3.0.tgz package/files/big-shoulders-display-latin-700-normal.woff2 package/files/big-shoulders-display-latin-900-normal.woff2 package/LICENSE
mv package bsd && tar -xzf fontsource-barlow-5.3.0.tgz package/files/barlow-latin-500-normal.woff2 package/files/barlow-latin-600-normal.woff2 package/files/barlow-latin-700-normal.woff2 package/files/barlow-latin-800-normal.woff2 package/LICENSE
```
Copy the six woff2 into `public/fonts/`. Confirm both LICENSE files say SIL Open Font License 1.1 and append each family's copyright line to `public/fonts/OFL.txt`. Delete the five old font files.

- [ ] **Step 2: Update the asset test first** (`tests/ui/noRemoteAssets.test.ts`): replace the five expected filenames with the six new ones (`barlow-latin-500-normal` … `big-shoulders-display-latin-900-normal`). Keep every other assertion (no googleapis, every `url()` exists, `@import './fonts.css'` in tokens.css). Run `npx vitest run tests/ui/noRemoteAssets.test.ts` — FAIL (fonts.css still old).

- [ ] **Step 3: Rewrite `src/styles/fonts.css`.** Keep the header comment (update its family list and add: "Big Shoulders Display ships no italic: font-style italic is the browser's synthesized oblique, as designed."). Faces:
```css
@font-face { font-family: 'Barlow'; font-style: normal; font-weight: 500; font-display: block; src: url('/fonts/barlow-latin-500-normal.woff2') format('woff2'); }
@font-face { font-family: 'Barlow'; font-style: normal; font-weight: 600; font-display: block; src: url('/fonts/barlow-latin-600-normal.woff2') format('woff2'); }
@font-face { font-family: 'Barlow'; font-style: normal; font-weight: 700; font-display: block; src: url('/fonts/barlow-latin-700-normal.woff2') format('woff2'); }
@font-face { font-family: 'Barlow'; font-style: normal; font-weight: 800; font-display: block; src: url('/fonts/barlow-latin-800-normal.woff2') format('woff2'); }
@font-face { font-family: 'Big Shoulders Display'; font-style: normal; font-weight: 700; font-display: block; src: url('/fonts/big-shoulders-display-latin-700-normal.woff2') format('woff2'); }
@font-face { font-family: 'Big Shoulders Display'; font-style: normal; font-weight: 900; font-display: block; src: url('/fonts/big-shoulders-display-latin-900-normal.woff2') format('woff2'); }
```
(Use the same `font-display` value the old file used if it differs from `block`.) Re-run the asset test — PASS.

- [ ] **Step 4: Write the contrast test** `tests/ui/tokenContrast.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../src/styles/tokens.css'), 'utf8')
const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')))

function hexOf(name: string): string {
  const direct = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(root)
  if (direct) return direct[1]!
  const rgb = new RegExp(`--${name}-rgb:\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)`).exec(root)
  if (rgb) return '#' + [rgb[1], rgb[2], rgb[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('')
  throw new Error(`token --${name} not found as a hex or -rgb channel triple`)
}
function lum(hex: string): number {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(hexOf(a)), lum(hexOf(b))].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

// [text, surface, minimum]. 4.5 = body text; 3 = display text >= 24px only.
const PAIRS: [string, string, number][] = [
  ...['white', 'lilac', 'lilac-dim', 'volt', 'hot', 'gain', 'caution'].flatMap(t =>
    ['ink', 'night', 'grape'].map(s => [t, s, 4.5] as [string, string, number])),
  ['white', 'dusk', 4.5], ['lilac', 'dusk', 4.5], ['lilac-dim', 'dusk', 4.5],
  ['ink', 'volt', 4.5], ['ink', 'hot', 4.5], ['ink', 'caution', 4.5], ['ink', 'gain', 4.5], ['ink', 'white', 4.5],
]

describe('token contrast (spec 3.1)', () => {
  for (const [t, s, min] of PAIRS) {
    it(`--${t} on --${s} >= ${min}:1`, () => { expect(ratio(t, s)).toBeGreaterThanOrEqual(min) })
  }
})
```
Run it — FAIL (tokens missing).

- [ ] **Step 5: Rewrite the `:root` block of `src/styles/tokens.css`.** Keep `@import './fonts.css'` as line 1, keep safe-area tokens, keep the explanatory comments that still apply (update hexes in them), keep `--caution-rgb`/`--caution` and `--positive-rgb`/`--positive` exactly. Add the new tokens and re-point the old ones per Interfaces:
```css
  /* Race Day Bold (spec 2026-10-09-race-day-bold-redesign-design.md §3.1) */
  --ink:        #120E2B;
  --night:      #1B1542;
  --grape:      #2A2160;
  --dusk:       #3A2F7A;
  --lilac:      #CFC8F2;
  --lilac-dim:  #A99FDB;
  --white:      #FFFFFF;
  --volt-rgb:   255, 214, 10;
  --volt:       rgb(var(--volt-rgb));
  --hot-rgb:    255, 46, 99;
  --hot:        rgb(var(--hot-rgb));
  --gain:       var(--positive);

  /* Legacy names, re-pointed so every existing screen re-skins at once. */
  --bg-deep:     #120E2B;
  --bg-panel:    #2A2160;
  --bg-elevated: #3A2F7A;
  --line-hair:   #3A2F7A;
  --text-hi:     #FFFFFF;
  --text-mid:    #CFC8F2;
  --text-dim:    #A99FDB;
  --accent-rgb:  255, 214, 10;
  --accent:      rgb(var(--accent-rgb));
  --accent-warm: #FF2E63;
  --negative:    #FF2E63;
  --tyre-soft:   #FF2E63;
  --tyre-medium: #FFD60A;
  --tyre-hard:   #FFFFFF;
  --tyre-inter:  #3DDC84;
  --tyre-wet:    #4DA6FF;
  --font-display: 'Big Shoulders Display', sans-serif;
  --font-body:    'Barlow', sans-serif;
  --font-mono:    'Barlow', sans-serif;
```
In `body {}` add `font-variant-numeric: tabular-nums;`. Leave `--accent-violet` as is. If the contrast test still fails for a pair, adjust ONLY the new-palette hex of the failing text token (lighten text on dark, darken text on fills) by the smallest step that passes, and note the change in the commit body. Run the contrast test — PASS.

- [ ] **Step 6: kit.css.** Create `src/styles/kit.css` and import it in `src/App.tsx` on the line after `import './styles/tokens.css'`:
```css
/* Race Day Bold shapes (spec 3.3). One forward slant; depth scales with width. */
.slant-row { clip-path: polygon(2% 0, 100% 0, 98% 100%, 0 100%); }
.slant-lg  { clip-path: polygon(3.5% 0, 100% 0, 96.5% 100%, 0 100%); }
.slant-md  { clip-path: polygon(6% 0, 100% 0, 94% 100%, 0 100%); }
.slant-sm  { clip-path: polygon(12% 0, 100% 0, 88% 100%, 0 100%); }
/* clip-path clips outlines; an inset ring stays visible inside the shape. */
.kit-focus:focus-visible { outline: none; box-shadow: inset 0 0 0 3px var(--white), inset 0 0 0 5px var(--ink); }
.hero-band { position: absolute; left: -40px; right: -40px; transform: skewY(-8deg); }
.hero-band-stripes { background-image: repeating-linear-gradient(115deg, rgba(18,14,43,0) 0 30px, rgba(18,14,43,0.10) 30px 60px); }
```

- [ ] **Step 7: Rewrite CLAUDE.md §6.1.** Replace the subsection "6.1 Aesthetic direction — 'Pit Wall at Night'" (heading through the paragraph ending "spend the boldness here.") with:
```markdown
### 6.1 Aesthetic direction — "Race Day Bold"

Chosen 2026-10-09 (spec: `docs/superpowers/specs/2026-10-09-race-day-bold-redesign-design.md`; visual reference: the "Pit Wall — Design Review" Claude Design canvas). Loud and kinetic, at the level of a premium mobile racing game: deep indigo ground, saturated team colours, slanted cards, chunky condensed type, in-house SVG car and helmet art. Motion is fast and directional, never bouncy.

**Tokens** live in `styles/tokens.css`; never scatter raw hex in components:

```
--ink #120E2B (ground)   --night #1B1542   --grape #2A2160 (cards)   --dusk #3A2F7A (lines)
--lilac #CFC8F2 (body)   --lilac-dim #A99FDB (labels)   --white #FFFFFF (titles, numbers)
--volt #FFD60A  — the ONLY call-to-action colour; your row; earned
--hot  #FF2E63  — urgent: PIT, cliff, losing      --gain #3DDC84      --caution #FFB020
tyres: S #FF2E63  M #FFD60A  H #FFFFFF  I #3DDC84  W #4DA6FF
```

Text on a volt, hot or caution fill is `--ink`. **Typography:** Big Shoulders Display (900, italic for heroes and titles; 700 upright for section heads) and Barlow for everything else, self-hosted. **All live-updating numbers MUST use tabular figures** (set globally on `body`). **Shape:** one forward slant (kit classes `.slant-*`); only pills and avatars are round.

**The signature element** stays the live timing tower: rows slide (FLIP / Framer Motion `layout`), gaps tick in tabular figures, your row is the volt row.
```
In §6.4 change "Bouncy, playful, cartoonish easing. Our motion language is **precise, mechanical, confident**" to "Bouncy or cartoonish easing. Our motion language is **fast, directional, confident**". Leave the rest of §6 unchanged.

- [ ] **Step 8: Verify and commit.** `npx vitest run` and `npx tsc --noEmit -p .` — all green (fix any test that asserted an old token value by updating the expected value only when the test's PURPOSE is unchanged; list each in the commit body). `npm run build` succeeds. Commit `feat(ui): Race Day Bold tokens and fonts (CLAUDE.md §6.1)`.

---

### Task 2: Kit — motion, buttons, pills, segmented, tyre chip, progress strip, hero band

**Files:**
- Create: `src/ui/kit/motion.ts`, `Button.tsx`, `Pill.tsx`, `Segmented.tsx`, `TyreChip.tsx`, `ProgressStrip.tsx`, `HeroBand.tsx`, `index.ts`
- Test: `tests/ui/kit.test.tsx`

**Interfaces:**
- Consumes: Task 1 tokens and kit.css classes; `useUiTap` (`src/hooks/useUiTap.ts`, returns `uiTap()`); `useHaptics()` (`impact(ImpactStyle)`); `useSettingsStore(s => s.reducedMotion)`.
- Produces:
  - `useReducedMotion(): boolean`; `snapIn(reduced: boolean, index?: number)` → framer-motion props `{ initial, animate, transition }`; `useCountUp(target: number, durationMs?: number): number`
  - `KitButton({ variant: 'primary'|'urgent'|'secondary', size?: 'lg'|'md'|'sm', onClick, children, ariaLabel?, disabled?, display?: boolean, style? })`
  - `Pill({ children, tone?: 'default'|'volt'|'caution', ariaLabel? })`
  - `Segmented<T extends string>({ options: { value: T; label: string; sub?: string }[], value: T, onChange: (v: T) => void, ariaLabel: string })`
  - `TYRE_COLOR: Record<Compound, string>`, `TYRE_NAME: Record<Compound, string>`, `TyreChip({ compound, size?: number, onInk?: boolean })`
  - `ProgressStrip({ total: number, done: number, ariaLabel?: string })`
  - `HeroBand({ color: string, height: number, top?: number, stripes?: boolean })`

- [ ] **Step 1: Failing tests** `tests/ui/kit.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { KitButton, Pill, Segmented, TyreChip, ProgressStrip, useCountUp } from '@ui/kit'
import { useSettingsStore } from '@state/settingsStore'

vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) }, ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {} }))

beforeEach(() => useSettingsStore.setState({ reducedMotion: true }))

describe('kit', () => {
  it('KitButton is a real button with the variant fill and ink text on volt', () => {
    let n = 0
    render(<KitButton variant="primary" onClick={() => { n++ }}>Race now</KitButton>)
    const b = screen.getByRole('button', { name: 'Race now' })
    expect(b.style.background).toContain('--volt')
    expect(b.style.color).toContain('--ink')
    expect(b.className).toContain('slant-')
    fireEvent.click(b); expect(n).toBe(1)
  })
  it('urgent uses hot with ink text', () => {
    render(<KitButton variant="urgent" onClick={() => {}}>Pit</KitButton>)
    const b = screen.getByRole('button', { name: 'Pit' })
    expect(b.style.background).toContain('--hot')
    expect(b.style.color).toContain('--ink')
  })
  it('Segmented is a radiogroup and reports the picked value', () => {
    let v = ''
    render(<Segmented ariaLabel="Pace mode" value="neutral" onChange={x => { v = x }}
      options={[{ value: 'conserve', label: 'SAVE' }, { value: 'neutral', label: 'HOLD' }, { value: 'push', label: 'PUSH' }]} />)
    expect(screen.getByRole('radiogroup', { name: 'Pace mode' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /HOLD/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: /PUSH/ })); expect(v).toBe('push')
  })
  it('TyreChip names the compound and shows its letter', () => {
    render(<TyreChip compound="M" />)
    expect(screen.getByLabelText('Medium')).toBeTruthy()
    expect(screen.getByText('M')).toBeTruthy()
  })
  it('ProgressStrip states progress for screen readers', () => {
    render(<ProgressStrip total={12} done={3} />)
    expect(screen.getByLabelText('3 of 12 rounds done')).toBeTruthy()
  })
  it('Pill renders its content', () => {
    render(<Pill>190 DP</Pill>); expect(screen.getByText('190 DP')).toBeTruthy()
  })
  it('useCountUp lands instantly under reduced motion', () => {
    function C() { return <span>{useCountUp(18)}</span> }
    render(<C />); expect(screen.getByText('18')).toBeTruthy()
  })
  it('useCountUp counts up when motion is on', () => {
    vi.useFakeTimers(); useSettingsStore.setState({ reducedMotion: false })
    function C() { return <span data-testid="n">{useCountUp(18, 400)}</span> }
    render(<C />)
    expect(Number(screen.getByTestId('n').textContent)).toBeLessThan(18)
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByTestId('n').textContent).toBe('18')
    vi.useRealTimers()
  })
})
```
Run `npx vitest run tests/ui/kit.test.tsx` — FAIL (module missing).

- [ ] **Step 2: `src/ui/kit/motion.ts`:**
```ts
import { useEffect, useState } from 'react'
import { useSettingsStore } from '@state/settingsStore'

export const EASE = [0.2, 0, 0, 1] as const

export function useReducedMotion(): boolean {
  return useSettingsStore(s => s.reducedMotion)
}

/** Enter by snapping along the slant (spec §5); opacity only when reduced. */
export function snapIn(reduced: boolean, index = 0) {
  return reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.12 } }
    : { initial: { opacity: 0, x: -18 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.18, ease: EASE, delay: index * 0.04 } }
}

/** Counts from 0 to target over durationMs on a timer; instant under reduced motion. */
export function useCountUp(target: number, durationMs = 600): number {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(reduced ? target : 0)
  useEffect(() => {
    if (reduced) { setValue(target); return }
    const steps = Math.max(1, Math.round(durationMs / 16))
    let i = 0
    setValue(0)
    const id = setInterval(() => {
      i++
      setValue(i >= steps ? target : Math.round((target * i) / steps))
      if (i >= steps) clearInterval(id)
    }, 16)
    return () => clearInterval(id)
  }, [target, durationMs, reduced])
  return value
}
```

- [ ] **Step 3: `Button.tsx`:**
```tsx
import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useUiTap } from '@hooks/useUiTap'
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'
import { useReducedMotion } from './motion'

type Variant = 'primary' | 'urgent' | 'secondary'
const FILL: Record<Variant, string> = { primary: 'var(--volt)', urgent: 'var(--hot)', secondary: 'var(--grape)' }
const TEXT: Record<Variant, string> = { primary: 'var(--ink)', urgent: 'var(--ink)', secondary: 'var(--white)' }
const HEIGHT = { lg: 64, md: 52, sm: 48 } as const
const SLANT = { lg: 'slant-lg', md: 'slant-md', sm: 'slant-sm' } as const

export function KitButton({ variant, size = 'md', onClick, children, ariaLabel, disabled, display = true, style }: {
  variant: Variant; size?: 'lg' | 'md' | 'sm'; onClick: () => void; children: ReactNode
  ariaLabel?: string; disabled?: boolean; display?: boolean; style?: CSSProperties
}) {
  const uiTap = useUiTap()
  const { impact } = useHaptics()
  const reduced = useReducedMotion()
  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      className={`${SLANT[size]} kit-focus`}
      whileTap={reduced || disabled ? undefined : { scale: 0.96 }}
      onClick={() => { if (variant === 'secondary') uiTap(); else impact(ImpactStyle.Medium); onClick() }}
      style={{
        minHeight: HEIGHT[size], border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: FILL[variant], color: TEXT[variant], opacity: disabled ? 0.45 : 1,
        fontFamily: display ? 'var(--font-display)' : 'var(--font-body)',
        fontWeight: display ? 900 : 800, fontStyle: display ? 'italic' : 'normal',
        fontSize: display ? (size === 'lg' ? 30 : size === 'md' ? 24 : 18) : 15,
        textTransform: 'uppercase', letterSpacing: display ? 0.5 : 1, padding: '0 22px',
        ...style,
      }}
    >{children}</motion.button>
  )
}
```
Read `src/hooks/useHaptics.ts` first and match its real export names (`useHaptics().impact`, `ImpactStyle`); adapt if they differ.

- [ ] **Step 4: `Pill.tsx`, `TyreChip.tsx`, `ProgressStrip.tsx`, `HeroBand.tsx`, `Segmented.tsx`:**
```tsx
// Pill.tsx
import type { ReactNode } from 'react'
const TONE = { default: ['var(--grape)', 'var(--white)'], volt: ['var(--volt)', 'var(--ink)'], caution: ['var(--caution)', 'var(--ink)'] } as const
export function Pill({ children, tone = 'default', ariaLabel }: { children: ReactNode; tone?: keyof typeof TONE; ariaLabel?: string }) {
  const [bg, fg] = TONE[tone]
  return <span aria-label={ariaLabel} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: bg, color: fg,
    borderRadius: 999, padding: '7px 12px', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13 }}>{children}</span>
}
```
```tsx
// TyreChip.tsx
import type { Compound } from '@engine/types'
export const TYRE_COLOR: Record<Compound, string> = { S: 'var(--tyre-soft)', M: 'var(--tyre-medium)', H: 'var(--tyre-hard)', I: 'var(--tyre-inter)', W: 'var(--tyre-wet)' }
export const TYRE_NAME: Record<Compound, string> = { S: 'Soft', M: 'Medium', H: 'Hard', I: 'Intermediate', W: 'Wet' }
export function TyreChip({ compound, size = 26, onInk = true }: { compound: Compound; size?: number; onInk?: boolean }) {
  return <span role="img" aria-label={TYRE_NAME[compound]} style={{ width: size, height: size, borderRadius: 999, boxSizing: 'border-box',
    border: `${Math.max(2, Math.round(size / 9))}px solid ${onInk ? TYRE_COLOR[compound] : 'var(--ink)'}`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: Math.round(size * 0.45), color: onInk ? 'var(--white)' : 'var(--ink)' }}>
    <span aria-hidden="true">{compound}</span></span>
}
```
(`getByText('M')` must find the inner span; `getByLabelText('Medium')` the outer.)
```tsx
// ProgressStrip.tsx
export function ProgressStrip({ total, done, ariaLabel }: { total: number; done: number; ariaLabel?: string }) {
  return <div role="img" aria-label={ariaLabel ?? `${done} of ${total} rounds done`}
    style={{ display: 'grid', gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))`, gap: 3 }}>
    {Array.from({ length: total }, (_, i) => (
      <span key={i} style={{ height: 8, transform: 'skewX(-20deg)',
        background: i < done ? 'var(--volt)' : i === done ? 'var(--white)' : 'var(--dusk)' }} />
    ))}
  </div>
}
```
```tsx
// HeroBand.tsx — decorative slanted colour band behind a hero (spec 3.3)
export function HeroBand({ color, height, top = 0, stripes = true }: { color: string; height: number; top?: number; stripes?: boolean }) {
  return <div aria-hidden="true" className={`hero-band${stripes ? ' hero-band-stripes' : ''}`}
    style={{ top, height, backgroundColor: color }} />
}
```
```tsx
// Segmented.tsx
import { useUiTap } from '@hooks/useUiTap'
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: {
  options: { value: T; label: string; sub?: string }[]; value: T; onChange: (v: T) => void; ariaLabel: string
}) {
  const uiTap = useUiTap()
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="slant-md"
      style={{ display: 'flex', gap: 2, background: 'var(--grape)', padding: '4px 14px' }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} className={`${on ? 'slant-sm ' : ''}kit-focus`}
            onClick={() => { uiTap(); onChange(o.value) }}
            style={{ flex: 1, minHeight: 48, border: 'none', cursor: 'pointer', background: on ? 'var(--white)' : 'transparent',
              color: on ? 'var(--ink)' : 'var(--lilac)', fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 14,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {o.label}
            {o.sub && <span style={{ fontWeight: 600, fontSize: 10, color: on ? 'var(--dusk)' : 'var(--lilac-dim)' }}>{o.sub}</span>}
          </button>
        )
      })}
    </div>
  )
}
```
`index.ts` re-exports everything from the seven files.

- [ ] **Step 5: Run** the kit test — PASS. Full suite + tsc. Commit `feat(ui): Race Day Bold kit — buttons, pills, segmented, tyre chip, strip, band`.

---

### Task 3: Kit — car art, livery accent, tyre meter

**Files:**
- Create: `src/ui/kit/CarArt.tsx`, `src/ui/kit/TyreMeter.tsx` (export both from `index.ts`)
- Modify: `src/data/cars.json` (add `liveryAccent` to every team), `src/data/validators.ts` (`TeamSchema.liveryAccent`), `src/engine/types.ts` (`TeamSpec.liveryAccent?: string` — type only, engine never reads it)
- Test: `tests/ui/kitArt.test.tsx`, `tests/data/livery.test.ts`

**Interfaces:**
- Produces:
  - `CarArt({ primary: string, accent: string, height: number, heading?: 'up'|'left'|'right', label: string })` — SVG, `role="img"`, `aria-label={label}`
  - `liveryOf(teamId: string): { primary: string; accent: string }` (in `CarArt.tsx`, reads `loadGameData().cars.teams`; falls back to `{ primary: 'var(--volt)', accent: 'var(--ink)' }`)
  - `TyreMeter({ compound: Compound, wear: number /*0..1*/, lapsOnTyre: number, cliffLaps: number | null, pastCliff?: boolean })` — `role="meter"`

- [ ] **Step 1: Failing tests.** `tests/data/livery.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'
describe('livery accents (spec 3.4)', () => {
  it('every team has a hex liveryAccent different from its primary', () => {
    for (const t of loadGameData().cars.teams) {
      expect(t.liveryAccent, t.id).toMatch(/^#[0-9A-F]{6}$/i)
      expect(t.liveryAccent!.toLowerCase()).not.toBe(t.colorPrimary.toLowerCase())
    }
  })
})
```
`tests/ui/kitArt.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CarArt, liveryOf, TyreMeter } from '@ui/kit'
import { useSettingsStore } from '@state/settingsStore'
beforeEach(() => useSettingsStore.setState({ reducedMotion: true }))
describe('art kit', () => {
  it('CarArt is a labelled image in the given livery', () => {
    const { container } = render(<CarArt primary="#00E5D0" accent="#FFD60A" height={120} label="Apex Racing car" />)
    expect(screen.getByRole('img', { name: 'Apex Racing car' })).toBeTruthy()
    const fills = Array.from(container.querySelectorAll('[fill]')).map(e => e.getAttribute('fill'))
    expect(fills).toContain('#00E5D0'); expect(fills).toContain('#FFD60A')
  })
  it('liveryOf reads the team data', () => {
    expect(liveryOf('apex').primary).toBe('#00E5D0')
    expect(liveryOf('nope').primary).toBe('var(--volt)')
  })
  it('TyreMeter exposes wear and lights segments in proportion', () => {
    const { container } = render(<TyreMeter compound="M" wear={0.65} lapsOnTyre={13} cliffLaps={8} />)
    const m = screen.getByRole('meter', { name: /tyre wear/i })
    expect(m.getAttribute('aria-valuenow')).toBe('65')
    expect(container.querySelectorAll('[data-lit="true"]').length).toBe(7)
    expect(screen.getByText(/CLIFF ~8L/)).toBeTruthy()
  })
  it('TyreMeter says when the tyre is past the cliff', () => {
    render(<TyreMeter compound="S" wear={1} lapsOnTyre={20} cliffLaps={null} pastCliff />)
    expect(screen.getByText(/PAST CLIFF/)).toBeTruthy()
  })
})
```
Run both — FAIL.

- [ ] **Step 2: Data.** Add `"liveryAccent"` after `colorSecondary` for each team in `cars.json`: apex `#FFD60A`, meridian `#FFFFFF`, vortex `#120E2B`, kestrel `#FFFFFF`, solstice `#120E2B`, delta `#120E2B`, halcyon `#FFFFFF`, nimbus `#FF2E63`, terra `#FFD60A`, zenith `#3DDC84`. In `TeamSchema` add `liveryAccent: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),` and in `TeamSpec` add `liveryAccent?: string // presentation only; the engine never reads it`. Run the livery test — PASS. Run `tests/engine/byteIdentity.test.ts` — unchanged and green.

- [ ] **Step 3: `CarArt.tsx`** (geometry identical to the canvas art kit):
```tsx
import { loadGameData } from '@data/validators'

export function liveryOf(teamId: string): { primary: string; accent: string } {
  const t = loadGameData().cars.teams.find(x => x.id === teamId)
  return t ? { primary: t.colorPrimary, accent: t.liveryAccent ?? t.colorSecondary } : { primary: 'var(--volt)', accent: 'var(--ink)' }
}

const ROT = { up: 0, right: 90, left: -90 } as const

export function CarArt({ primary, accent, height, heading = 'up', label }: {
  primary: string; accent: string; height: number; heading?: 'up' | 'left' | 'right'; label: string
}) {
  const w = (height * 120) / 300
  return (
    <svg role="img" aria-label={label} width={w} height={height} viewBox="0 0 120 300" style={{ transform: `rotate(${ROT[heading]}deg)`, flexShrink: 0 }}>
      <rect x="8" y="40" width="20" height="38" rx="6" fill="#06040F" /><rect x="92" y="40" width="20" height="38" rx="6" fill="#06040F" />
      <rect x="6" y="212" width="24" height="46" rx="7" fill="#06040F" /><rect x="90" y="212" width="24" height="46" rx="7" fill="#06040F" />
      <rect x="10" y="10" width="100" height="14" rx="4" fill={accent} />
      <path d="M54 22 L66 22 L71 112 L49 112 Z" fill={primary} />
      <path d="M44 108 Q38 150 32 188 L32 226 Q40 252 60 256 Q80 252 88 226 L88 188 Q82 150 76 108 Z" fill={primary} />
      <path d="M48 112 Q46 150 42 186 L60 196 L78 186 Q74 150 72 112 Z" fill={accent} />
      <ellipse cx="60" cy="148" rx="9" ry="17" fill="#06040F" />
      <rect x="56" y="168" width="8" height="82" rx="3" fill={accent} />
      <rect x="20" y="266" width="80" height="18" rx="4" fill={accent} />
    </svg>
  )
}
```
(`#06040F` is the tyre/cockpit black inside the art, part of the illustration, not a UI colour.)

- [ ] **Step 4: `TyreMeter.tsx`:**
```tsx
import { motion } from 'framer-motion'
import type { Compound } from '@engine/types'
import { TyreChip } from './TyreChip'
import { useReducedMotion } from './motion'

// Segment colours burn volt -> hot with wear (spec §4).
const RAMP = ['var(--volt)', 'var(--volt)', 'var(--volt)', 'var(--caution)', 'var(--caution)', 'var(--hot)', 'var(--hot)', 'var(--hot)', 'var(--hot)', 'var(--hot)']

export function TyreMeter({ compound, wear, lapsOnTyre, cliffLaps, pastCliff = false }: {
  compound: Compound; wear: number; lapsOnTyre: number; cliffLaps: number | null; pastCliff?: boolean
}) {
  const reduced = useReducedMotion()
  const pct = Math.round(Math.min(1, Math.max(0, wear)) * 100)
  const lit = Math.min(10, Math.round(pct / 10))
  const urgent = pastCliff || (cliffLaps !== null && cliffLaps <= 3)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 14 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TyreChip compound={compound} size={22} />{pct}% worn · {lapsOnTyre} laps</span>
        <span style={{ color: urgent ? 'var(--hot)' : 'var(--lilac)' }}>{pastCliff ? '⚠ PAST CLIFF' : cliffLaps === null ? '' : `CLIFF ~${cliffLaps}L`}</span>
      </div>
      <div role="meter" aria-label="Tyre wear" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 3 }}>
        {RAMP.map((c, i) => {
          const on = i < lit
          const pulse = on && i === lit - 1 && urgent && !reduced
          return <motion.span key={i} data-lit={on} className="slant-sm"
            animate={pulse ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
            transition={pulse ? { duration: 0.8, repeat: Infinity } : { duration: 0 }}
            style={{ height: 12, background: on ? c : 'var(--dusk)' }} />
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run** both tests — PASS; full suite + tsc. Commit `feat(ui): car art, livery accents, tyre meter`.

---

### Task 4: Hero 1 — main menu

**Files:**
- Modify: `src/ui/MainMenu.tsx` (rewrite the render; keep every store action and the confirm-new flow)
- Test: `tests/ui/mainMenuBold.test.tsx` (new); `tests/ui/mainMenuContinue.test.tsx` must pass unchanged

**Interfaces:**
- Consumes: kit (`KitButton`, `Pill`, `ProgressStrip`, `HeroBand`, `CarArt`, `liveryOf`, `snapIn`, `useReducedMotion`); `loadSnapshot()` (`SeasonSnapshot` has `playerDriverId`, `selectedTeamId`, `selectedCircuitId`, `raceIndex`, `standings: {driverId, points}[]`, `devPoints`); `CIRCUIT_ORDER`; `loadGameData().circuits[id].name`; existing actions `startNewSeason`, `resumeSeason`, `viewGrid`, `viewCareer`, `viewHowToPlay`, `viewSettings`, `viewScenarios`; `hasCareer`.

Layout (canvas "Hero 1 · Main menu"), top to bottom, inside the existing safe-area padding:
1. Header row: a pill with the team name (and "Season N" from careerStore if available) when a save exists, else the wordmark "PIT WALL" in display 900 italic 34px; on the right a `Pill tone="volt"` with `{devPoints} DP` (save only) and a 48×48 round settings button `aria-label="Settings"` (gear inline SVG, stroke `var(--white)`) calling `viewSettings`.
2. Hero (height 262): `HeroBand color={team primary or 'var(--volt)'} height={290} top={-40}`; `CarArt` heading "left" height 300 in `liveryOf(selectedTeamId ?? 'apex')`; a large "#1"-style watermark is omitted (no car numbers in data).
3. Next-race card (`slant-lg`, `var(--grape)`), save only: "ROUND {raceIndex+1} OF 12" label, circuit name (display 900 italic 44, uppercase), `ProgressStrip total={12} done={raceIndex}`, a row `P{standing} · {points} pts`. The text `Round {raceIndex+1} of 12` must remain present inside the CONTINUE SEASON button's sub-label (test pins it).
4. Primary: `CONTINUE SEASON` (save) or `NEW SEASON` (no save) as `KitButton variant="primary" size="lg"` with the existing sub-label line beneath the label.
5. Tiles row (3 × `KitButton size="sm"`): SCENARIOS (`variant="urgent"`), GARAGE (`viewGrid`), and CAREER (`viewCareer`, only when `hasCareer`; label "TROPHIES" is Plan 2's job — keep "CAREER" now).
6. Secondary row: when a save exists, `NEW SEASON` as a secondary button keeping the existing two-tap "DISCARD AND START OVER?" / "Tap again to confirm" behaviour; `HOW TO PLAY` secondary.
7. Footer `PIT WALL · v{__APP_VERSION__}` in `var(--lilac-dim)` 12px.
Every block enters with `snapIn(reduced, i)`. Remove `AmbientHero` and the grid-lines overlay and the hard-coded `rgba(0,229,208,…)`.

- [ ] **Step 1: Failing test** `tests/ui/mainMenuBold.test.tsx` — mirror the store/persistence mocking used in `tests/ui/mainMenuContinue.test.tsx` (copy its `vi.mock` blocks and the snapshot fixture builder), then:
```tsx
it('shows the next race card with circuit, round strip and standing when a save exists', async () => {
  // fixture: raceIndex 3, selectedTeamId 'apex', standings with the player first on 43
  render(<MainMenu />)
  expect(await screen.findByText(/ROUND 4 OF 12/)).toBeTruthy()
  expect(screen.getByLabelText('3 of 12 rounds done')).toBeTruthy()
  expect(screen.getByText(/P1 · 43 pts/)).toBeTruthy()
  expect(screen.getByRole('img', { name: /Apex Racing car/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy()
})
it('shows NEW SEASON as the primary action and no race card without a save', async () => {
  render(<MainMenu />)
  expect(await screen.findByText('NEW SEASON')).toBeTruthy()
  expect(screen.queryByText(/OF 12$/)).toBeNull()
})
```
Run — FAIL.

- [ ] **Step 2: Implement** the layout above in `MainMenu.tsx`. Keep the component's exports, effects and handlers; replace only the JSX and local styles. Standing = 1 + index of `playerDriverId` in `standings` sorted by points desc (ties: keep array order).

- [ ] **Step 3: Run** `tests/ui/mainMenuBold.test.tsx` and `tests/ui/mainMenuContinue.test.tsx` — both PASS; full suite + tsc. Commit `feat(ui): main menu in Race Day Bold (hero 1)`.

---

### Task 5: Hero 2a — timing tower, tyre meter zone, pace + PIT bar

**Files:**
- Modify: `src/ui/TimingTower.tsx` (row look; default compact), `src/ui/TelemetryZone.tsx` (TyreMeter replaces `TyreGaugeRadial`; StatCards replaced by one plan line), `src/ui/PaceModeToggle.tsx` (Segmented), `src/ui/PitPanel.tsx` `PitButton` only
- Test: `tests/ui/raceHudBold.test.tsx`; existing `timingTowerFlash.test.tsx`, `wingChip.test.tsx`, `cliffCoachMark.test.tsx` must pass (update only selectors that matched removed copy, and say so in the commit)

**Interfaces:**
- Consumes: kit (`TyreMeter`, `TyreChip`, `Segmented`, `KitButton`), the values `TelemetryZone` already computes (compound, effective tyre age, cliff fraction / laps-to-cliff, past-cliff flag, planned stop lap, `wingOf`), `COMPACT_WINDOW_SIZE`.

Requirements:
1. **Tower rows** (`TowerRow`): keep `motion.div` with `layout`, `layoutId`, `data-tower-row`, `AnimatePresence`, the caution flash (inline `style.background` using `rgba(var(--caution-rgb), …)`), the GhostRow and retired states. New look: `className="slant-row"`, grid `26px 5px 46px 1fr 30px` (position in display 900 italic 20 | team slash: 5×20 span `skewX(-14deg)` in team colour | code 800 15 | gap 700 14 right-aligned | `TyreChip` 24 or the existing wear bar replaced by the chip; retired keeps `DNF`/`OUT`). Player row: background `var(--volt)`, text `var(--ink)`, height 46; others `var(--grape)`, height 36. Gaining/losing flash keeps ▲/▼ glyphs in `--gain`/`--hot`. Replace the hard-coded `rgba(0,229,208,…)` with `rgba(var(--volt-rgb), …)`.
2. **Tower default:** `expanded` initial state `false` (six rows around you, spec §6); the toggle label reads `FULL FIELD ↓` / `NEARBY ↑`. If `timingTowerFlash.test.tsx` needs the flashed car on screen, set the store so it is within the window or click `FULL FIELD`; do not weaken its assertion.
3. **TelemetryZone:** one block: `TyreMeter` (compound, wear = cliff fraction clamped 0..1, laps on tyre, laps to cliff or null, pastCliff) and beneath it one line `PLAN · PIT L{n}` / `NO STOP PLANNED` in `var(--lilac)` 13px, plus the existing `W{n}` chip (keep `aria-label="Wing level N"` and the text `W{n}`). Keep the `tyre_cliff` coach-mark request and its anchor element.
4. **PaceModeToggle:** `Segmented` with options SAVE (`conserve`, sub `+0.20s`), HOLD (`neutral`, sub `base`), PUSH (`push`, sub `−0.15s`); keep the Light haptic and `setPaceMode`.
5. **PitButton:** `KitButton variant="urgent" size="lg"` width 112, label `PIT` or `PIT — P{n}`; keeps the cliff pulse (opacity pulse, not scale, and none under reduced motion) and `openPitPanel`.

- [ ] **Step 1: Failing test** `tests/ui/raceHudBold.test.tsx` — set up the race store the same way `tests/ui/wingChip.test.tsx` and `tests/ui/timingTowerFlash.test.tsx` do (copy their setup), then:
```tsx
it('the player row is the volt row and the tower starts compact', () => {
  render(<TimingTower />)
  const rows = document.querySelectorAll('[data-tower-row]')
  expect(rows.length).toBeLessThanOrEqual(6)
  const mine = Array.from(rows).find(r => (r as HTMLElement).style.background.includes('--volt'))
  expect(mine).toBeTruthy()
  expect(screen.getByRole('button', { name: /FULL FIELD/ })).toBeTruthy()
})
it('telemetry shows the tyre meter and the plan line', () => {
  render(<TelemetryZone />)
  expect(screen.getByRole('meter', { name: /tyre wear/i })).toBeTruthy()
  expect(screen.getByText(/PLAN · PIT L|NO STOP PLANNED/)).toBeTruthy()
})
it('pace mode is a radiogroup', () => {
  render(<PaceModeToggle />)
  expect(screen.getByRole('radiogroup', { name: 'Pace mode' })).toBeTruthy()
})
```
Run — FAIL.

- [ ] **Step 2: Implement** items 1–5. Delete `TyreGaugeRadial` and the three `StatCard`s from TelemetryZone (position now lives in the tower; pit window in the plan line).

- [ ] **Step 3: Run** the new test and the four existing race-UI tests; full suite + tsc. Commit `feat(ui): race tower, tyre meter, pace + PIT bar in Race Day Bold`.

---

### Task 6: Hero 2b — race screen frame and pit sheet

**Files:**
- Modify: `src/ui/RaceHUD.tsx` (StatusBar, LIVE RACE card, track panel, footer), `src/ui/WeatherStrip.tsx` (chip + expand), `src/ui/HudAlert.tsx` (banner), `src/ui/SafetyCarBanner.tsx`, `src/ui/PitPanel.tsx` (`PitPanelDrawer`, `ProjectionCard`)
- Test: `tests/ui/raceFrameBold.test.tsx`; existing `pitPanelDiscount.test.tsx`, `projectionCoachMark.test.tsx`, `tutorialMarkTiming.test.tsx`, `coachMarkFiring.test.tsx` must pass

Requirements (canvas "Hero 2 · Race" and "Pit panel"):
1. **Status bar:** circuit name label (`var(--lilac-dim)` 12/700) above `L{lap}` in display 900 italic 40 with `/{total}` in `var(--lilac-dim)`; speed control as four `slant-sm` 48×48 buttons (`II`/`1×`/`2×`/`4×`, `aria-label="Pause"` on the first), selected = volt fill ink text; settings stays.
2. **Remove the "LIVE RACE" and "RACE CONTROL" group labels and their card chrome.** The track panel becomes a band: `var(--night)` background, height 168, bottom edge slanted (`clip-path: polygon(0 0,100% 0,100% 88%,0 100%)`), `TrackCanvas` and `PitTimer` unchanged inside it. `WeatherChip` (new, in `WeatherStrip.tsx`) sits absolutely at the band's bottom-right: a `Pill` button reading `{icon} {Now} · rain {p}% in {n}L` (or `· dry ahead`) computed from the same forecast data `WeatherStrip` already renders; tapping toggles the full `WeatherStrip` below the band (`aria-expanded`).
3. **HudAlert** becomes a `slant-lg` banner: urgent → `var(--hot)` fill, caution → `var(--caution)` fill, info → `var(--grape)` fill; text `var(--ink)` on hot/caution, `var(--white)` on grape; a display-italic "RADIO" tag; keep dismiss (48×48 hit area) and all existing behaviour. `CommentaryTicker` stays, restyled by tokens only.
4. **SafetyCarBanner:** `slant-lg`, `var(--caution)` fill, ink text, display 900 italic 22: `⚠ SAFETY CAR` left, `{n} LAPS` right.
5. **Order in the column:** status bar → track band (+ optional expanded weather strip) → HudAlert → CommentaryTicker → SafetyCarBanner → TimingTower (flex 1, scroll) → TelemetryZone → footer row (PaceModeToggle flex 1 + PitButton). Coach marks keep their anchors.
6. **Pit sheet** (`PitPanelDrawer`): `var(--night)` background, top edge slanted (`clip-path: polygon(0 3%,100% 0,100% 100%,0 100%)`), title "BOX THIS LAP?" display 900 italic 38; CANCEL as a round pill button (48 px); `PitLossLine` as two pills: `PIT LOSS {loss}s` and, under SC, a caution pill `−{saving}s UNDER SAFETY CAR` (keep both strings exactly: 'PIT LOSS', 'UNDER SAFETY CAR'); `ProjectionCard` becomes a 3–4 row mini tower (rows from the projection: the car ahead, a dashed volt ghost row `P{n} · {your code} · +{gap} · fresh {compound}`, the car behind) — keep the text `P{rejoinPosition}` and the "recovers to ~P{n} by lap {n}" line; compound buttons are `slant-sm` 64-high radios (`role="radio"`, `aria-checked`) showing the compound name and `{k} set(s)` left from the player's `tyreAllocation`; selected = volt fill ink text; confirm = `KitButton variant="urgent" size="lg"` "BOX NOW" (keeps Heavy haptic, sound, `pitNow`). The sheet slides up with the existing spring replaced by `{ duration: 0.22, ease: EASE }` (opacity only when reduced).

- [ ] **Step 1: Failing test** `tests/ui/raceFrameBold.test.tsx` (store setup copied from `pitPanelDiscount.test.tsx`):
```tsx
it('pit sheet asks to box, keeps the pit-loss copy and offers compounds as radios with sets left', () => {
  // open the pit panel via the store as pitPanelDiscount.test.tsx does
  render(<PitPanel />)
  expect(screen.getByText(/BOX THIS LAP\?/)).toBeTruthy()
  expect(screen.getByText(/PIT LOSS/)).toBeTruthy()
  const radios = screen.getAllByRole('radio')
  expect(radios.length).toBeGreaterThanOrEqual(3)
  expect(screen.getAllByText(/set/).length).toBeGreaterThanOrEqual(3)
  expect(screen.getByRole('button', { name: /BOX NOW/ })).toBeTruthy()
})
it('the weather chip expands the full forecast', () => {
  render(<WeatherChip />)   // export it from WeatherStrip.tsx
  const chip = screen.getByRole('button', { expanded: false })
  fireEvent.click(chip)
  expect(chip.getAttribute('aria-expanded')).toBe('true')
})
```
Run — FAIL.

- [ ] **Step 2: Implement** items 1–6.
- [ ] **Step 3: Run** the new test and the four existing tests; full suite + tsc; `npm run build`. Commit `feat(ui): race frame and pit sheet in Race Day Bold (hero 2)`.

---

### Task 7: Hero 3 — race result

**Files:**
- Modify: `src/ui/RaceResult.tsx`
- Test: `tests/ui/raceResultBold.test.tsx`; existing `raceResultMenu.test.tsx`, `raceResultPending.test.tsx`, `debriefCard.test.tsx`, `debriefCancel.test.tsx` must pass

**Interfaces:**
- Consumes: kit (`HeroBand`, `KitButton`, `Pill`, `useCountUp`, `snapIn`), `HelmetAvatar` (`teamPrimary`, `teamSecondary`, `size`), `liveryOf`, seasonStore fields already read (`lastRaceResults`, `lastRaceEvents`, `standings`, `playerDriverId`, `raceIndex`, `resultPending`, `pendingBadges()`), `pendingRace?.grid` (seasonStore `pendingRace: RaceRecordInput | null`, which has `grid`), `loadGameData().upgrades.income.perRace`, `DebriefCard`.

Layout (canvas "Hero 3 · Race result"):
1. `HeroBand color="var(--volt)" height={250} top={12}`; on it in ink: label `{CIRCUIT} · ROUND {n}` (+ ` · WET` when `lastRaceEvents.hadRain`), the position huge (`P{n}` or `DNF`, display 900 italic 150), beside it `+{useCountUp(points)} PTS` (display 900 italic 36) and, when the grid is known, `From P{grid} on the grid ▲{gain}` / `▼{loss}` / `Held P{grid}`; then the existing one-line race summary sentence.
2. Podium: three `slant-md` cards, P1 tallest in the middle, each with `HelmetAvatar` in the driver's team colours, `{pos} · {CODE}` (display italic) and the team name, or `YOU` in volt on the player's card.
3. Two cards side by side: CHAMPIONSHIP (`P{n} · {pts}` after this race, provisional when pending — reuse the existing provisional-standings computation) with a `▲/▼/=` delta line in gain/hot/lilac; EARNED (`+{perRace} DP` in volt and, for each `pendingBadges()` id, `★ {badge name}` — keep badge names as visible text).
4. `DebriefCard` unchanged in behaviour, placed after the cards (it re-skins via tokens).
5. Key moments as `Pill`s in one wrapping row (existing data).
6. Classification behind a `FULL RESULTS` toggle button (`aria-expanded`), expanding inline with the existing table.
7. Actions: `NEXT RACE →` (`KitButton primary lg`, or the existing final-round label), then a row of `↺ RETRY ROUND` and `MENU` (`KitButton secondary sm`; MENU's accessible name must stay `menu` — test `/^menu$/i`). Keep `useDebriefStore.getState().cancel()` before each action and every existing handler.
8. Confetti stays for a win (respecting reduced motion).

- [ ] **Step 1: Failing test** `tests/ui/raceResultBold.test.tsx` (store setup copied from `raceResultPending.test.tsx`):
```tsx
it('leads with the position and points, shows places gained, and hides the full classification', () => {
  // seed a pending P2 from grid 14 as raceResultPending.test.tsx seeds a win
  render(<RaceResult />)
  expect(screen.getByText('P2')).toBeTruthy()
  expect(screen.getByText(/PTS/)).toBeTruthy()
  expect(screen.getByText(/From P14 on the grid ▲12/)).toBeTruthy()
  const toggle = screen.getByRole('button', { name: /FULL RESULTS/ })
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(screen.getByRole('button', { name: /^menu$/i })).toBeTruthy()
})
```
Run — FAIL.

- [ ] **Step 2: Implement** the layout. **Step 3:** run the new and the four existing tests; full suite + tsc. Commit `feat(ui): race result in Race Day Bold (hero 3)`.

---

### Task 8: Phone pass

**Files:** Modify `docs/V2-CHECKLIST.md`.

- [ ] **Step 1:** `npm run build && npx cap sync android`, then the release build the earlier passes used: `cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew -q assembleRelease && adb install -r app/build/outputs/apk/release/app-release.apk` (never read or print `android/keystore.properties`).
- [ ] **Step 2:** On the phone, record: fonts load (Big Shoulders and Barlow, not a system fallback — compare digit widths on the lap counter as it ticks); main menu with the existing career; every other screen readable in the new palette (development, setup, qualifying, championship, settings — Plan 2 redesigns them, but nothing may be unreadable now); race screen at 1×/4× holds 60 fps feel, tower rows slide, tyre meter pulses near the cliff, PIT opens the sheet, the ghost row shows, BOX NOW works; result screen count-up, podium helmets, FULL RESULTS, RETRY, MENU, NEXT RACE.
- [ ] **Step 3:** Write the results under "Race Day Bold — Plan 1 phone pass" in `docs/V2-CHECKLIST.md`, listing anything unreadable for Plan 2. Commit `docs: Race Day Bold plan 1 phone pass`.

# Low-End Device Readiness — Implementation Plan

**Goal:** Remove the two defects that only manifest on a real low-end Android device, and leave a runbook the device pass can execute immediately.

**Architecture:** Both fixes are presentation-layer. Neither touches `engine/`. Item 2 replaces `color-mix()` with composited `rgba(var(--token-rgb), a)`, the pattern already proven for `--caution`. Item 3 moves reduced-motion from "in-app toggle only" to "OS preference is the default, the toggle overrides it", and makes the one component that bypasses the store use it.

**Tech Stack:** TypeScript strict, React, framer-motion, Zustand, Capacitor Preferences, Vitest.

## Global Constraints

- `color-mix()` is BANNED: minSdkVersion is 24 and `color-mix()` needs Chromium 111 (2023). An unsupported declaration is DROPPED, not approximated, so the styling silently vanishes on exactly the devices this targets.
- No raw hex in components; colour via tokens in `src/styles/tokens.css`.
- `vitest` does NOT typecheck. Run `npx tsc --noEmit` separately, every task.
- Baseline: 58 test files, 447 passed, 1 skipped. Do not regress.
- `src/engine/` imports nothing from `state/`/`ui/`/`canvas/`/`hooks/`.

---

## THE TWO DEFECTS

### Item 2 — `color-mix()` survives in `Development.tsx`

Two sites, both silently dropped on a minSdk-24 WebView:

- `Development.tsx:125` — `0 0 6px color-mix(in srgb, ${accent} 40%, transparent)`. Mixing with `transparent` is plain alpha, so this is `rgba(<channels>, 0.4)`.
- `Development.tsx:170` — `color-mix(in srgb, var(--positive) 7%, var(--bg-elevated))`. This is a tint over an OPAQUE base, NOT plain alpha, so it needs compositing (see Task 2).

There is already scar tissue at the first site: a comment records that `${accent}66` once produced `var(--accent)66`, invalid CSS the browser dropped, "so this channel was silently absent". The same class of bug is still live one line below it.

`TimingTower.tsx` documents the ban; `Development.tsx` never got the treatment.

### Item 3 — `prefers-reduced-motion` is not actually honoured

Three separate problems:

1. `settingsStore.loadSettings` defaults `reducedMotion` to `false` and never consults `window.matchMedia`. A user with the OS preference set gets full motion until they find the in-app toggle.
2. `tokens.css` has an `@media (prefers-reduced-motion: reduce)` block, but it only neutralises CSS `animation-duration` / `transition-duration`. Framer Motion drives transforms from JS, so every layout animation and the infinite pulse loops are untouched by it. The media query gives false comfort.
3. `RaceResult.tsx:28`'s `Confetti` reads `window.matchMedia(...)` DIRECTLY instead of the store — so **turning reduced motion on in Settings does not suppress the confetti**. The in-app toggle is silently partial.

---

## File Structure

**Modified:**
- `src/styles/tokens.css` — `--accent-rgb`, `--positive-rgb` channel tokens.
- `src/ui/Development.tsx` — both `color-mix()` sites.
- `src/state/settingsStore.ts` — OS default + explicit-preference tracking.
- `src/ui/RaceResult.tsx` — Confetti reads the store.
- `src/App.tsx` — start the OS-preference watcher.
- `tests/setup.ts` — matchMedia stub must support `addEventListener`.

**Created:**
- `tests/ui/colorMixBan.test.ts` — the ban, mechanically enforced.
- `tests/state/reducedMotion.test.ts` — OS default, explicit override, watcher.
- `docs/DEVICE-CHECKLIST.md` — the runbook for the hardware pass.

---

## Task 1: Channel tokens for `--accent` and `--positive`

**Files:** Modify `src/styles/tokens.css`

- [ ] **Step 1: Add the channels, derive the colours**

Follow exactly the shape `--caution` already uses (declared channels, colour
derived from them), including a comment pointing at the minSdk reason.

```css
  --accent-rgb:   0, 229, 208;
  --accent:       rgb(var(--accent-rgb));
  --positive-rgb: 61, 220, 132;
  --positive:     rgb(var(--positive-rgb));
```

The literal values MUST equal the current `#00E5D0` and `#3DDC84`. Verify by
computing, not by eye: `00=0, E5=229, D0=208` and `3D=61, DC=220, 84=132`.

- [ ] **Step 2: Verify nothing shifted**

Run `npx vitest run && npx tsc --noEmit`. These tokens are consumed in ~30
places; a wrong channel silently recolours the app.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "style(tokens): channel forms for --accent and --positive"
```

---

## Task 2: Remove both `color-mix()` uses

**Files:** Modify `src/ui/Development.tsx`; Test `tests/ui/colorMixBan.test.ts`

- [ ] **Step 1: The glow (line 125)**

`TierPips` receives `accent` as a CSS string (`'var(--accent)'` or
`'var(--positive)'`, set at line 151). It needs the CHANNEL form too, because
`rgba()` cannot take `var(--accent)` as its first three arguments.

Give `TierPips` a second prop `accentRgb`, set alongside `accent`:

```tsx
const accent    = maxed ? 'var(--positive)'     : 'var(--accent)'
const accentRgb = maxed ? 'var(--positive-rgb)' : 'var(--accent-rgb)'
```

and replace the boxShadow:

```tsx
// rgba(var(--x-rgb), 0.4), NOT color-mix(): minSdkVersion is 24 and
// color-mix needs Chromium 111, so the declaration is DROPPED and the glow
// silently disappears on exactly the low-end devices this project targets.
// The comment above records the same channel being lost once already, to
// `${accent}66` producing the invalid `var(--accent)66`.
boxShadow: isOwned ? `0 0 6px rgba(${accentRgb}, 0.4)` : 'none',
```

- [ ] **Step 2: The maxed-row tint (line 170)**

This one is NOT plain alpha — it tints 7% `--positive` over the opaque
`--bg-elevated`. A bare `rgba(var(--positive-rgb), 0.07)` would make the row
translucent over whatever sits behind it, which is a different result.

Composite it instead, which reproduces `color-mix` exactly and still references
only tokens:

```tsx
background: maxed
  // A 7% --positive tint composited over the solid --bg-elevated. The
  // gradient layer is the portable spelling of color-mix's OPAQUE-base blend;
  // a bare rgba() here would make the row translucent instead of tinted.
  ? 'linear-gradient(rgba(var(--positive-rgb), 0.07), rgba(var(--positive-rgb), 0.07)), var(--bg-elevated)'
  : 'var(--bg-elevated)',
```

- [ ] **Step 3: Enforce the ban**

Create `tests/ui/colorMixBan.test.ts`. Read sources as text via
`import.meta.glob('../../src/**/*.{ts,tsx,css}', { query: '?raw', import: 'default', eager: true })`.

NOTE: vitest stubs `.css` module content to an empty string, so CSS files come
back blank through the glob — read `src/styles/tokens.css` with
`readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')` instead
(`@types/node` IS installed; a comment in `storeBoundaries.test.ts` saying
otherwise is stale). See `tests/ui/cautionToken.test.ts`, which already does this.

Assert no `color-mix(` appears in any `src/` file outside a comment. The failure
message must state the minSdk reason and name the portable replacements
(`rgba(var(--x-rgb), a)` for alpha; a `linear-gradient` layer over a solid for
an opaque-base blend).

- [ ] **Step 4: Verify**

Run `npx vitest run && npx tsc --noEmit && npx vite build`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix(ui): drop the last color-mix uses, which minSdk 24 silently ignores"
```

---

## Task 3: Honour the OS reduced-motion preference

**Files:** Modify `src/state/settingsStore.ts`, `src/ui/RaceResult.tsx`, `src/App.tsx`, `tests/setup.ts`; Test `tests/state/reducedMotion.test.ts`

- [ ] **Step 1: Read the OS preference**

Add to `settingsStore.ts`:

```ts
/**
 * The OS-level accessibility preference.
 *
 * Guarded because jsdom has no matchMedia and Capacitor's WebView is a browser
 * but the store is imported by tests that never touch a DOM.
 */
export function osPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
```

- [ ] **Step 2: Make it the default, not an override**

`loadSettings` currently does `reducedMotion: motion != null ? motion === 'true' : false`.
Change the fallback to `osPrefersReducedMotion()`, and record whether the player
has an explicit stored choice:

```ts
      reducedMotion:     motion != null ? motion === 'true' : osPrefersReducedMotion(),
      motionPreferenceStored: motion != null,
```

Add `motionPreferenceStored: boolean` to `SettingsState` (default `false`), and
set it to `true` in `setReducedMotion`. It is deliberately NOT persisted — it is
derived from whether the key exists.

The precedence this encodes, which is the whole point: an explicit in-app choice
always beats the OS preference; the OS preference beats the built-in default.

- [ ] **Step 3: Follow the preference while the app is open**

Add to `settingsStore.ts`:

```ts
/**
 * Keeps reduced motion in step with the OS while the app is open, and returns
 * an unsubscribe.
 *
 * Gated on motionPreferenceStored: a player who has set the toggle themselves
 * owns the setting, and an OS change must not silently overrule them.
 */
export function startReducedMotionWatch(): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  const onChange = (e: MediaQueryListEvent) => {
    if (useSettingsStore.getState().motionPreferenceStored) return
    useSettingsStore.setState({ reducedMotion: e.matches })
  }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
```

Call it from `App.tsx` beside the existing autosave effect:

```tsx
  useEffect(() => startReducedMotionWatch(), [])
```

- [ ] **Step 4: Make the in-app toggle actually reach the confetti**

`RaceResult.tsx`'s `Confetti` reads `window.matchMedia` directly, so the Settings
toggle does not suppress it today. Replace that line with the store:

```tsx
  // The STORE, not matchMedia directly. Reading the media query here meant the
  // in-app reduced-motion toggle did not suppress the confetti -- the one
  // moment in the game with two dozen simultaneously animating elements. The
  // store now carries the OS preference as its default, so this is a superset
  // of the old behaviour, not a replacement for it.
  const reduced = useSettingsStore(s => s.reducedMotion)
```

Import `useSettingsStore` from `@state/settingsStore`.

- [ ] **Step 5: Teach the test stub about listeners**

`tests/setup.ts`'s matchMedia stub has no-op `addEventListener`. Task 3's watcher
needs a stub that can actually dispatch. Upgrade it to keep a listener set and
expose a helper the tests can drive, or let each test install its own stub —
either is fine, but the existing `matches: false` default must be preserved so
no current test changes behaviour.

- [ ] **Step 6: Test**

Create `tests/state/reducedMotion.test.ts` asserting:

1. no stored value + OS says reduce → `reducedMotion` loads `true`
2. no stored value + OS quiet → loads `false`
3. **stored `'false'` + OS says reduce → stays `false`** — the explicit choice wins. *This is the one that matters*: defaulting from the OS is easy to write as an override that overrules a player who deliberately turned it off.
4. an OS change while no explicit preference is stored updates the store
5. an OS change while an explicit preference IS stored does NOT
6. the unsubscribe stops further updates

- [ ] **Step 7: Verify**

Run `npx vitest run && npx tsc --noEmit && npx vite build`.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "fix(a11y): honour the OS reduced-motion preference, and let the toggle reach confetti"
```

---

## Task 4: The device runbook

**Files:** Create `docs/DEVICE-CHECKLIST.md`

- [ ] **Step 1: Write it**

A runbook for the hardware pass, written so it can be executed top-to-bottom
without re-deriving anything. It must contain:

- the exact build + install commands, with the `JAVA_HOME` / `ANDROID_HOME`
  exports this machine needs
- what to check and, for each, **what failure looks like** — the point of the
  pass is the things that cannot fail in CI
- the R8 checks (haptics on pit confirm, settings surviving an app kill), stated
  as the reflective-plugin-stripping risk they are
- the two fixes above, which are *only* observable on-device
- the feel questions, marked clearly as judgement calls rather than pass/fail

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: device verification runbook"
```

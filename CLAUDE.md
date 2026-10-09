# CLAUDE.md — F1 Strategist (working title)

This file is the constitution for this project. Read it fully before writing any code, and re-read the relevant section before starting any task. When in doubt, follow this document over your own defaults.

---

## 1. What we are building

A mobile (Android-first) **F1 race-strategy manager game**. The player is a race strategist: they set a pre-race plan, then watch a race unfold in real time and make a small number of high-stakes calls — when to pit, which tyre to fit, and how hard to push. The race itself is driven by a **deterministic, sector-based discrete-event simulation** that has already been fully designed and validated (see Section 4 and `MODEL_SPEC.md`).

This is **not** a twitch/physics racing game. There is no driving. The fun is strategic decision-making under uncertainty, presented through a beautiful, tactile, broadcast-quality UI.

**Design pillars (in priority order):**
1. **A believable, emergent simulation** — pit strategy, undercut/overcut, and track-position battles must emerge from the model, never be scripted.
2. **Arcade-leaning but grounded** — slightly more action than real F1, but never unrealistic. (The "more action, grounded" tuning is locked; see `MODEL_SPEC.md`.)
3. **It has to look genuinely cool** — broadcast-grade visuals, fluid motion, and rich microinteractions are a first-class requirement, not polish-at-the-end. See Section 6. **Do not treat the UI as secondary.**
4. **Ship to Play Store fast** — bounded v1 scope, clean enough to grow later.

---

## 2. Tech stack (do not change without discussion)

- **Language:** TypeScript (strict mode on, `noUncheckedIndexedAccess` on).
- **Build:** Vite.
- **Rendering:** Hybrid, deliberately split (see Section 3):
  - **Game/track canvas:** PixiJS (WebGL) for the live track map, cars, and high-frequency animated telemetry. Chosen over Phaser because this is a data-viz/HUD game, not a scene-graph game engine title — Pixi gives us fast 2D rendering without engine overhead.
  - **HUD / menus / strategy UI:** React + the DOM, styled with CSS (see Section 6 for the styling approach). DOM is the right tool for the timing tower, pit panel, buttons, and transitions — it gives us accessibility, layout, and CSS microinteractions for free.
- **State:** Zustand (lightweight, predictable, testable). The simulation engine is **framework-agnostic and does not import React or Zustand** — see Section 3.
- **Animation/motion:** Framer Motion (`motion/react`) for DOM/React UI transitions and microinteractions; Pixi's own ticker + a tween lib (e.g. `@tweenjs/tween.js`) for canvas motion. Respect `prefers-reduced-motion` everywhere.
- **Mobile wrapper:** Capacitor, to package the web build as an Android APK/AAB.
- **Audio:** Howler.js for SFX and ambient engine/crowd loops.
- **Testing:** Vitest for unit tests (the engine MUST be well-tested — see Section 5).

Add dependencies sparingly and state why in the PR/commit. Prefer small, well-maintained libraries.

---

## 3. Architecture: the golden rule

**The simulation engine is a pure, headless, deterministic module with zero UI dependencies.**

This is the single most important architectural constraint. The engine was prototyped and validated in isolation; it must stay that way.

```
src/
  engine/            # PURE SIMULATION. No React, no Pixi, no DOM, no Zustand. No randomness except via injected RNG.
    types.ts         # Core domain types (Car, Driver, Tyre, RaceState, SectorResult, etc.)
    rng.ts           # Seedable RNG (mulberry32 or similar). ALL randomness flows through this.
    lapModel.ts      # Layer 1: sector-time computation (pace, tyre, fuel, noise)
    tyres.ts         # Tyre compound model + degradation curve (the cliff)
    race.ts          # Layer 2: the stepable race loop, gaps, boundary overtaking, pit stops
    projection.ts    # Layer 3: clone-and-fast-forward "what-if" for post-pit projections
    strategy.ts      # AI rival strategy decisions (when they pit, compound choice)
    index.ts         # Public API surface
  state/             # Zustand stores. Bridges engine <-> UI. Owns the game/race lifecycle.
  ui/                # React components: HUD, timing tower, pit panel, menus
  canvas/            # PixiJS track renderer, car sprites, telemetry visuals
  data/              # JSON: circuits, cars, drivers, tyre compounds, TUNING constants
  audio/             # Howler setup + sound manager
  styles/            # Design tokens, global CSS
  App.tsx
```

**Rules that enforce the golden rule:**
- `engine/` may be imported by `state/`, but `engine/` imports nothing from `state/`, `ui/`, or `canvas/`. (Consider an ESLint boundary rule.)
- The engine is **deterministic**: same seed + same inputs ⇒ identical race, every time. This is non-negotiable — it's what makes the projection engine and testing possible. No `Math.random()` anywhere in `engine/`; use the injected seeded RNG only.
- The engine is **stepable and queryable**: the UI advances the race one sector (or one lap) at a time and reads full state between steps. The engine never "runs the whole race" in one blocking call during play.
- **Real time ≠ sim time.** The engine has no concept of wall-clock. A "game speed" controller in `state/` decides how often to call `engine.step()` (e.g. 1 sector every N ms, with pause/2x/4x). This keeps the sim pure and lets us add replay/fast-forward trivially.

---

## 4. The simulation model (summary — full detail in MODEL_SPEC.md)

The model is **already designed and validated**. Do not redesign it. Implement it faithfully from `MODEL_SPEC.md`. High-level:

- **Tick unit = one sector.** 3 sectors per lap. A race is `laps × 3 × cars` ticks.
- **Layer 1 — sector time:** each car's time for each sector = sector base + car-performance delta + driver delta + tyre delta + fuel delta + track evolution + traffic penalty + Gaussian noise. Tyre delta uses a gentle-then-steep "cliff" curve that creates the pit decision as an emergent property.
- **Layer 2 — racing:** cumulative race time determines order and gaps. Overtaking is resolved as **discrete probabilistic checks at sector boundaries only** (the "overtaking discipline rule" — NEVER continuous within a sector). A proximity-based traffic penalty makes track position valuable. Undercut/overcut emerge naturally from pit-loss + fresh-tyre pace; they are NOT scripted.
- **Layer 3 — the player:** three levers — **pace mode** (push/neutral/conserve, which trades pace for tyre life and reshapes pit math live), **pit now** (override the plan), and **compound choice**. A **projection engine** clones race state and fast-forwards ~4 laps to show "if you pit now, you rejoin P5, +3.4s behind X" before the player commits.

**All tuning constants live in `data/tuning.json`, never hardcoded.** The "more action, grounded" config is locked and documented in `MODEL_SPEC.md`. The player/designer balances by editing data, not code.

---

## 5. Engineering conventions

- **TypeScript strict.** No `any` (use `unknown` + narrowing). Exhaustive `switch` on unions with a `never` guard.
- **Engine is pure functions where possible.** `step(state) -> newState` style; avoid hidden mutation. Immutability makes the projection clone trivial and testing clean.
- **Test the engine hard.** Vitest unit tests for: tyre curve shape, deg cliff, determinism (same seed ⇒ same result), pit-loss application, gap math, overtake probability bounds, and a Monte-Carlo sanity test (run 200 races, assert win distribution and overtake counts fall in expected bands — these bands are in `MODEL_SPEC.md`). The validated numbers there are your regression oracle.
- **Data-driven.** Circuits, cars, drivers, compounds, tuning all in `data/*.json` with TS types + a runtime validator (zod) on load. Never bury balance numbers in logic.
- **One system per session.** Build and review in small, understandable increments. Don't generate the whole game in one pass. Each PR/commit should be reviewable and tested.
- **Commit messages** describe the *what* and *why*, referencing the layer/section.
- **No `localStorage`/`sessionStorage` assumptions in engine.** Persistence (save/load) lives in `state/` via Capacitor Preferences, added in the ship phase.
- **Performance budget:** target a smooth 60fps on a mid-range Android phone. The canvas is the hot path — pool sprites, avoid per-frame allocations, never re-render the whole React tree on a sim tick (subscribe narrowly to Zustand slices).

---

## 6. Visual design & microinteractions — A FIRST-CLASS REQUIREMENT

The brief is explicit: **the game must look genuinely cool, with proper microinteractions and modern features.** Treat this section with the same weight as the architecture. A correct simulation in an ugly, static UI is a failed deliverable.

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

### 6.2 Microinteractions — REQUIRED, not optional

Every interactive element must feel alive and responsive. Specific requirements (build these as reusable primitives/hooks so they're consistent):

- **Buttons & taps:** every tappable element has a press state (scale ~0.96, subtle inner-shadow) with a spring release. Tactile haptic feedback on Android via Capacitor Haptics for primary actions (pit, push, confirm). No "dead" taps — every interaction acknowledges itself within 100ms.
- **Position changes in the timing tower:** when cars swap places, rows **animate to their new position** (FLIP technique / Framer Motion `layout`), never jump. A brief flash (green gaining / red losing) on the moved row.
- **Gap numbers:** count/roll to new values rather than snapping; subtle colour pulse when a gap crosses a meaningful threshold (e.g. enters DRS/battle range < 1.0s).
- **The pit decision:** the centrepiece interaction. When the player opens the pit panel, the **projection overlay animates in** showing rejoin position with a ghosted car sliding into its projected slot on the tower. Compound selection chips have satisfying selected states (fill, glow, scale). Confirming the pit triggers: haptic, a sweep animation, the car peeling into the pit lane on the track canvas, an animated pit-stop timer, and the car rejoining with a fresh-tyre shimmer.
- **The tyre cliff indicator:** not a static bar. A **living gauge** that shifts colour (teal → amber → hot red) and begins to *pulse/throb* as the cliff approaches — the player should feel urgency rising peripherally without reading a number. This is the most important piece of ambient feedback in the game.
- **Pace-mode toggle:** switching push/neutral/conserve animates with a clear visual language (e.g. the car's telemetry glow intensifies on PUSH, cools on CONSERVE) and an immediate, legible consequence preview ("+tyre wear, −0.15s/lap").
- **Track canvas:** cars are smooth-interpolated dots/chevrons moving along the circuit path (don't teleport between sector points — tween along the spline). The player's car is visually distinct (teal trail/glow). Overtakes get a brief highlight. Subtle ambient: floodlight glow, a faint moving "rubber line," start-lights sequence at race start.
- **Race start:** a proper sequence — formation settle, the five red lights illuminating one-by-one (with sound + haptic), then lights-out and GO. First impressions matter; this is the hook.
- **State transitions:** menus and panels enter/exit with orchestrated motion (stagger children, ease curves that feel mechanical-precise, not bouncy-cartoonish). One orchestrated moment beats scattered effects.

### 6.3 Modern features & quality floor

- **Responsive & mobile-first.** Designed for portrait phone first; must adapt to landscape and larger screens. Safe-area insets respected (notches).
- **Reduced motion:** honour `prefers-reduced-motion` — replace large motion with instant/opacity transitions. Microinteractions degrade gracefully, never break.
- **Accessibility:** visible keyboard/focus states, adequate contrast (our dark theme must still pass AA for text), screen-reader labels on controls, colour never the *only* signal (tyre compounds also have letters S/M/H; gains/losses have arrows, not just colour).
- **Haptics & sound** as feedback channels (with a mute/settings toggle).
- **Loading & empty states** are designed moments, not blank screens — a stylised "formation lap" loader, etc.
- **Theming-ready:** all colour via tokens so a future "day race" / team-colour theme is trivial.

### 6.4 What to avoid

- Generic dashboard-template look; default Material components dropped in unstyled.
- Motion for motion's sake — every animation must communicate something (a state change, a consequence, a transition). Cut anything decorative that doesn't.
- Janky re-renders on sim ticks. Visual smoothness is part of "looking cool"; 60fps is a design requirement.
- Bouncy or cartoonish easing. Our motion language is **fast, directional, confident** — like a high-end car's switchgear.

---

## 7. Build order (phased)

Follow this sequence. Each phase is reviewable and testable before the next.

- **Phase 0 — Scaffold & deploy loop.** Vite + TS + React + Pixi + Zustand + Capacitor. "Hello race" — a single dot moving around a track path on the canvas, building to an Android APK on device. Establish `data/` schemas + zod validators. Lock the deploy loop before anything else.
- **Phase 1 — Engine, headless + tested.** Implement `engine/` faithfully from `MODEL_SPEC.md`: lap model, tyres, race loop, overtaking, pits, projection. Full Vitest suite incl. the Monte-Carlo regression bands. NO UI yet — prove it in tests/console exactly as it was prototyped.
- **Phase 2 — Core UI wired to engine.** Timing tower (with FLIP reordering), track canvas with interpolated cars, the three player levers, the pit panel + projection overlay, tyre cliff gauge. Make it *playable*. Apply the design tokens and core microinteractions from Section 6 as you build each component — not afterwards.
- **Phase 3 — Polish & feel.** Race-start sequence, haptics, audio, particle/shimmer effects, orchestrated transitions, settings (sound/haptics/reduced-motion), save/load. This is where "looks really cool" is fully realised.
- **Phase 4 — Ship.** Menus, season/championship wrapper (simple v1), Capacitor release build, signing, AAB, store assets.

---

## 8. The human's role

The human (Veet) is the **architect and reviewer**, with deep simulation/algorithm background and limited recent hands-on coding. He defines specs and reviews diffs; he tests game feel on-device (the thing automated tests can't judge). Optimise for: small reviewable changes, clear explanations of trade-offs in PRs, well-tested engine code he can trust, and honest flagging when something is a judgement call rather than a fact. When a decision affects game feel or balance, surface it for his call rather than deciding silently.

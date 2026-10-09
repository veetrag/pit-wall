# Race Day Bold — visual redesign

**Status:** approved in conversation, 2026-10-09. Not yet planned.
**Design source:** Claude Design canvas "Pit Wall — Design Review",
https://claude.ai/artifact/7WjMhLd4TeHhHUr81gSNrM (private to Veet). The
canvas holds the audit of v1.3, the three directions explored, the design
system board, and every screen. Where this spec and the canvas disagree,
this spec wins; where this spec is silent, the canvas is the reference.

## 1. Why

Measured against premium mobile games, v1.3 falls short in six ways (audit
board on the canvas):

1. Almost no art: text in rounded rectangles; one track outline, one emoji.
2. Every screen is the same dark card stack; nothing marks a moment.
3. No reward: a win is three flat blocks and "+25" in a list.
4. The race screen is crowded and the timing tower, the signature, is ~1 row.
5. Type has no hierarchy: wide-tracked uppercase labels everywhere.
6. The main menu is a list of five buttons with no live state.

Decisions made in conversation:

| question | decision |
|---|---|
| Reference bar | **Premium mobile game** |
| Art | **Stylised art made in-house** (SVG/CSS), no licensed or raster art |
| What carries over | **Nothing is protected** — palette, type and layouts all open |
| Approach | **Identity first, three hero screens, then the rest** |
| Direction | **B · Race Day Bold** (chosen over Night Paddock and Grand Prix Luxe) |

## 2. The constitution changes

CLAUDE.md §6 currently locks "Pit Wall at Night" and its token list, and
calls for a "precise, mechanical" motion language with no "bouncy, playful,
cartoonish" easing. Race Day Bold replaces the identity, so §6.1's
aesthetic direction, token block and typography paragraph are rewritten to
this spec as the first task of the build. The rest of §6 stands unchanged:
microinteractions (§6.2), accessibility, reduced motion and the quality
floor (§6.3), and the bans on motion for its own sake and on janky
re-renders (§6.4). The motion rule is restated rather than dropped: Race
Day Bold motion is fast and directional, never bouncy (§5).

The engine, the simulation and every gameplay rule are out of scope. This is
a presentation change only.

## 3. Identity

### 3.1 Colour (tokens in `src/styles/tokens.css`)

| token | hex | use |
|---|---|---|
| `--ink` | `#120E2B` | ground |
| `--grape` | `#2A2160` | cards, secondary buttons |
| `--dusk` | `#3A2F7A` | lines, unlit meter segments, selected-but-not-primary |
| `--night` | `#1B1542` | sheets, inset panels, the track band |
| `--lilac` | `#CFC8F2` | body text |
| `--lilac-dim` | `#A99FDB` | labels |
| `--white` | `#FFFFFF` | titles, numbers |
| `--volt` | `#FFD60A` | **the only call-to-action colour**; your row; earned |
| `--hot` | `#FF4F84` (lightened from #FF2E63 to clear 4.5:1 on --grape) | urgent: PIT, cliff, losing, radio alerts |
| `--gain` | `#3DDC84` | gaining, good call, step up |
| `--caution` | `#FFB020` | safety car |

Tyre colours: S `#FF4F84` (lightened from #FF2E63 to clear 4.5:1 on --grape), M `#FFD60A`, H `#FFFFFF`, I `#3DDC84`,
W `#4DA6FF`. Team colours stay as `cars.json` defines them. A colour that
carries meaning always travels with a letter, name, or ▲/▼ (§6.3 holds).

Contrast: every text/background pair used on the canvas is checked to WCAG AA
in the build's first task; any pair that fails is darkened or lightened, not
waived. Known risk: `--lilac-dim` on `--grape` at 11–12px.

### 3.2 Type

- **Display:** Big Shoulders Display, 900 italic for heroes and titles, 700
  upright for section heads.
- **Everything else:** Barlow 500–800, with `font-variant-numeric:
  tabular-nums` on every live or comparable number (the digit-jitter rule).
- Self-hosted woff2, latin subset only, beside the existing fonts in
  `public/fonts/`, with the OFL licence — the app has no INTERNET
  permission, so Google Fonts links cannot work on Android (see the
  `fonts.css` header). Rajdhani, Inter and JetBrains Mono are removed once
  no screen uses them.
- Scale: hero 96–150, title 44–46, section 20–24, body 16, label 11–13,
  numbers 14–54.

### 3.3 Shape

One forward slant everywhere: cards, buttons, rows, meter segments and
progress strips are parallelograms leaning the same way. Only status pills
and avatars are round. Slant depth scales with width (≈2–4% for full-width
rows and cards, ≈10–14% for small buttons and chips) so the angle looks the
same at every size. A slanted colour band behind the hero (skewY ≈ −8°)
with a faint diagonal stripe marks the screen's moment.

Implemented as a small set of CSS utilities (e.g. `.slant-lg`, `.slant-md`,
`.slant-sm` via `clip-path: polygon(...)`), never per-component magic
numbers. Focus rings must stay visible on clipped elements (outline is
clipped by `clip-path`; use an inner box-shadow or a wrapper).

### 3.4 Art kit (in-house SVG)

- **Car**, top-down, one parametric component, two colours: team primary
  body and nose, secondary on wings, spine and halo panel.
- **Helmet**, parametric, extends the existing `HelmetAvatar.tsx`: team
  primary shell, secondary stripe, per-driver pattern.
- **Circuit outline**, per circuit, from the existing `paths/*.json`.
- **Livery second colours** are design data, added to `cars.json` (e.g.
  Apex `#00E5D0` + volt) with zod validation; the current `colorSecondary`
  values are mostly ink and read as black.

## 4. Components

Built once in `src/ui/kit/` and used by every screen:

- **Button**: primary (volt), urgent (hot), secondary (grape); 48 px minimum
  height; press = scale 0.96 + haptic on primary/urgent.
- **Chip / pill**: round; used for status (weather, DP, pit loss).
- **Segmented control**: slanted track, the selected segment a white
  parallelogram (pace mode, stop count, tabs, speed).
- **Tyre chip**: round ring in compound colour with the letter.
- **Tower row**: position (display italic), team slash, code, gap, tyre ring.
  Your row: volt fill, taller. Gaining/losing flash green ▲ / hot ▼. Rows
  slide to new positions (the existing FLIP behaviour), never jump.
- **Tyre meter**: ten slanted segments burning volt → hot with wear; the
  last lit segment pulses as the cliff nears (replaces the circular gauge).
- **Card**: slanted grape panel; **hero band**: slanted team/volt/green band.
- **Sheet**: bottom sheet on `--night` with a slanted top edge (pit panel).
- **Progress strip**: 12 slanted segments for the season.
- **Toggle**: slanted track and knob.
- **Car**, **Helmet**, **Circuit** art components (§3.4).

## 5. Motion

Fast and directional: elements enter by snapping along the slant (≈180 ms,
ease-out) then settle; staggers are short. Hero numbers count up (points,
P-position on the result). Nothing bounces. Reduced motion (the app setting
and `prefers-reduced-motion`): opacity only, counts land instantly.
Screen transitions must never show a blank frame (one of the audit's bugs).

## 6. Screens

All twelve, as drawn on the canvas:

| screen | key change |
|---|---|
| Main menu | team-colour hero band with your car; next-race card with season strip, standings and last result; RACE NOW; Scenarios / Garage / Trophies |
| Team select | hero band per team with car, rating and four stats; team strip; "Drive for <team>" |
| Development | "The factory"; DP badge; arms race in hot; upgrade cards with tier marks |
| Race setup | circuit card with outline; condition chips; tyre chips; wing; **stint bar** with a draggable split |
| Qualifying | tyre + attack side by side; volt lap card with sectors; grid preview |
| Race | big lap counter; slanted speed control; track band; hot radio banner; **tower as the centre (6 rows)**; tyre meter; pace + big PIT |
| Pit panel | bottom sheet "Box this lap?"; pit loss and SC saving; **ghost rejoin row**; compound with sets left; BOX NOW |
| Race result | giant position on a volt band with points count-up and places gained; helmet podium; championship and earnings cards; compact debrief row; NEXT RACE |
| Championship | tabs; season strip; leader banner; rows with points bars |
| Ladder reveal | full-screen STEP UP / HOLD / SLIP band with the reason and stat changes |
| Garage | collectible driver cards; Drivers / Cars / VS tabs |
| Trophy room | **new screen**: career stats and the badge wall (earned volt, locked dim) |
| Settings | slanted toggles; existing options only |

Remaining screens not drawn (scenario select and result, how-to-play,
driver select, start lights, career record, badge toast) follow the same
kit; the plan names each.

**Behaviour that changes with the layout** (and nothing else does):

- The race screen's weather strip collapses to one chip; the full forecast
  opens on tap.
- The timing tower shows six rows around you by default; "Full field"
  expands it.
- The race-setup plan is edited by dragging the stint split; the existing
  lap limits (stint gap, laps) are unchanged.
- The trophy room reads the existing badge and career data; no new
  tracking.
- Cloud save stays "Coming soon" until Play Games sign-in works.

## 7. Bugs fixed along the way

Found while capturing the audit; each gets a test:

- "SEASON 2025" header is hard-coded.
- Solstice is labelled FRONT-RUNNER while its description says "solid midfield"; the tier label and the copy must agree.
- Team descriptions truncate.
- Scenario radio says "Slicks won't hold" on a dry track.
- Blank frame during screen transitions.

## 8. Build order

1. **Foundations:** tokens, fonts (self-hosted), slant utilities, motion
   presets, CLAUDE.md §6 rewrite, contrast check.
2. **Kit:** the §4 components and the art kit, each with tests.
3. **Hero screens:** main menu, race (incl. pit panel), race result. Phone
   check after each.
4. **The rest:** team select, development, race setup, qualifying,
   championship, ladder reveal, garage, trophy room, settings, then the
   undrawn screens.
5. **Clean-up:** remove the old fonts and unused tokens; fresh store
   screenshots.

Each step ships on its own and leaves the app consistent enough to play.
Old and new styles may coexist between steps 3 and 4.

## 9. Testing

- Existing UI tests keep passing; selectors move to roles and labels where
  they relied on old class names.
- Kit components: render tests for roles, labels, selected/pressed states,
  reduced-motion behaviour.
- Contrast: a test that computes the ratio for every declared text/surface
  token pair and fails under 4.5:1 (3:1 for display text ≥ 24 px).
- Fonts: the existing font-loading check extended to the new families.
- Performance: the race screen keeps 60 fps on the Pixel; `clip-path` on
  tower rows is measured during the race-screen task.
- Every screen gets a phone pass with screenshots.

## 10. Out of scope

- Gameplay, engine, balance, save formats.
- New sound design (existing audio stays).
- Raster, 3D or licensed art.
- Landscape and tablet-specific layouts beyond what the current responsive
  rules give.

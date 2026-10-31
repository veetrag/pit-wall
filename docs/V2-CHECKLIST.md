# Post-1.2 checklist

Sorted by value, not by the order the source list happened to be written in.
Tick items as they land. Each one says *why it is where it is*, because a
checklist without reasons gets reordered by whoever reads it last.

Status at the time of writing: **1.2 (versionCode 3) submitted to Google for
review on 2026-09-24**, full rollout to production, 0 installs, 0 ratings.

---

## The decision that sorts most of this list

Eight otherwise-unrelated items — Play Games achievements, cloud save,
leaderboards, friends, In-App Review, In-App Updates, Play Integrity, and
Crashlytics/analytics — **all require the `INTERNET` permission**, which the app
does not currently request. `tests/data/androidManifest.test.ts` fails if
anything adds it.

That is deliberate, and the published store listing says so:

> Pit Wall makes no network requests at all — it does not even request
> permission to use the internet.

So it is **one decision, not eight**. Paying it costs:

- the most distinctive claim in the store listing,
- a data-safety form update (currently "no data collected"),
- a privacy-policy update.

Once paid, the other seven get much cheaper. **Do not pay it for achievements
alone** — see Tier 2 for the only item that is a real argument for it.

- [ ] **Decide: does the app request `INTERNET`?** Decide it on the strength of
      cloud save alone. If cloud save is not worth the claim, none of the other
      seven are either.

---

## Tier 1 — next, no network, real value

- [ ] **Screenshots and feature graphic.**
      The highest-value item on the whole list. The live listing still shows
      1.0-era art: no qualifying, no career, no badges. It is under-selling the
      app to everyone who finds it *right now*, and store assets can be updated
      without a new review cycle. Shot list: `docs/store/listing-copy.md`.
- [ ] **Predictive back gesture.**
      The app targets API 36, where this is an expectation rather than a nicety.
      `src/hooks/useAndroidBackButton.ts` already owns back handling, so this
      extends existing code rather than adding a system.
- [ ] **Verify behaviour when the app is backgrounded mid-race.**
      There is no `visibilitychange` or `appStateChange` handler anywhere in
      `src/`. Take a call during a race and watch what happens on resume. This
      may well be fine — the render loop is driven by Pixi's ticker, which the
      OS throttles — but it is *unverified*, and "probably fine" is how the font
      bug survived to production.
- [ ] **Low-end device and frame-rate check.**
      Every on-device test so far has been one 120Hz Pixel 10 Pro XL. The 60fps
      budget in `CLAUDE.md` §5 is unverified on anything else, and the canvas is
      the hot path. An emulator at low resolution is a start; a real mid-range
      phone is better.
- [ ] **Tablet and foldable layout.**
      Play already distributes to 4,815 tablets. Nobody has ever looked at the
      layout on one. Portrait-phone-first is the stated design (§6.3) but
      "adapts to larger screens" is currently an untested claim.

---

## Tier 2 — the network bundle, in order, only if the permission is paid

1. - [ ] **Cloud save (Play Games Saved Games).**
        The only item here that is a real argument for the permission. A career
        now spans multiple seasons and carries titles, badges and a race log;
        losing it to a lost phone is exactly the "angry review" case, and it is
        much more true now than it was at 1.0.
2. - [ ] **In-App Review API.**
        Cheap, and there is an obvious trigger already built: the championship
        screen after winning a title. The app has 0 ratings.
3. - [ ] **Crashlytics or equivalent.**
        Play demotes apps that exceed the crash/ANR thresholds, and there is
        currently no crash visibility at all. Note this contradicts the "no
        analytics" decision unless scoped to crashes only.
4. - [ ] **Play Games achievements.**
        Mostly redundant: 15 in-game badges and a trophy case already ship
        (`src/state/badges.ts`). This duplicates them for the Play-profile
        audience rather than adding anything for the player in the game.
5. - [ ] **In-App Updates / Play Integrity.**
        Integrity exists to protect leaderboards and purchases. There are
        neither. Lowest value in the bundle.

---

## Tier 3 — low value for this game specifically

- **Leaderboards.** More interesting here than usual: a deterministic seeded
  simulation makes "same seed, best finish" a genuinely comparable score, which
  most games cannot offer. But without server-side validation it is trivially
  cheatable, and there is no server. Revisit only if a backend ever exists.
- **Friends.** Depends on leaderboards.
- **Controller support.** No reason to expect a gamepad on a portrait-phone
  strategy game. Relevant only if Google Play Games on PC is ever a target.
- **Notifications.** There is nothing to notify anyone about. No energy, no
  timers, no multiplayer. Asking for the permission would be worse than not
  having it.

---

## Does not apply — do not spend time here

Recorded so these do not get re-investigated every few months.

- **16 KB page size.** Verified 2026-09-24: the release AAB contains **zero
  `.so` files**. This is a Unity/Unreal/native-C++ concern and the app is a
  WebView.
- **Closed testing requirement.** Applies to personal developer accounts created
  after the rule landed. This account has published apps dating to 2016 and is
  already live in production.
- **Play Billing, restore purchases, server-side purchase verification.** The
  game is free with no monetisation — decided, and stated in the listing.
- **Account deletion (in-app and web).** There are no accounts.
- **Families policy ad and data rules.** No ads, no data collection.
- **Target API level.** Currently 36; the requirement is met. Re-check each
  August.
- **Android App Bundle.** Already shipping an AAB. Play Asset Delivery is for
  games past the base size limit; this one is 6.2 MB.
- **Data safety form.** Complete — the app could not be live in production
  otherwise. It changes only if the `INTERNET` decision above goes the other
  way.

### Actively argued against

- **Daily rewards and streaks.** These are retention mechanics built for
  monetised games. This game deliberately ships with no ads, no IAP and no
  tracking; a login streak would be the first dark pattern in it, and it would
  undercut the one paragraph of the store listing that people are most likely to
  believe.

---

## Already done — verified, not assumed

Checked against the repo and the Play Console on 2026-09-24.

- [x] **Back button** — `src/hooks/useAndroidBackButton.ts` handles it; it never
      silently quits.
- [x] **Edge-to-edge and cutouts** — `--safe-top` / `--safe-bottom` from
      `env(safe-area-inset-*)` in `src/styles/tokens.css`.
- [x] **Haptics, with a toggle** — `hapticsEnabled` in `settingsStore`.
- [x] **Sound toggle** — `soundEnabled`.
- [x] **Reduced motion** — honoured throughout, defaults from the OS preference.
- [x] **Tutorial skippable and replayable** — the coach marks can be re-armed
      from `SettingsPanel.tsx`, which resets `coachStore` too.
- [x] **Offline play** — the entire game, including saves, runs with no network.
- [x] **Android App Bundle**, **target API 36**, **data safety form**.

---

## State as of 2026-09-26, end of day

### Done since this list was written

- **INTERNET permission decision: made.** Cloud save is being built, so the
  permission is in, and the manifest guard now pins the exact permission set
  rather than banning network access.
- **Cloud save, steps 1 and 2: merged to main** (`41e5a47`, `e17dfaa`).
  687 tests, the plugin confined behind an interface, conflict resolution and
  the sync decision both pure and hard-tested.
- **Play Games console setup: complete and published.** PGS project linked to
  `pitwall-fc924`, saved games enabled, OAuth consent screen, two OAuth
  clients and two credentials, both allow-lists filled, project published.

### Blocked, waiting on Google

- **Cloud save does not work on device yet.** Sign-in succeeds but Play Games
  will not mint a player id. The publish dialog said provisioning "may take a
  few hours". Retry with the command in the session notes; `snapshot calls`
  above 0 means it is live. Nothing in the code or the console is known to be
  wrong.

### Next, in order

1. **Retry cloud save on device.** Everything downstream assumes it works.
2. **Step 3 — achievements.** 15 IDs, names, descriptions and 512x512 icons in
   the Play Console, then the mapping in `src/sync/achievements.ts`.
   **Note: published achievements cannot be deleted.** Get the ids and names
   right the first time.
3. **Step 3 — Crashlytics.** Needs a fresh `google-services.json`: the
   committed copy still has `oauth_client: []` and predates the OAuth clients.
   Downloads do not reach disk through browser automation (Chrome's "ask where
   to save" setting), so this one has to be downloaded by hand.
4. **Step 4 — In-App Review.** Trigger on the championship screen after a
   title, once per career.
5. **Step 5 — In-App Updates and Play Integrity.** Plumbing only; nothing
   gated on integrity.
6. **Step 6 — store paperwork.** The listing's "no network requests at all"
   paragraph becomes false the moment 1.3 ships; data safety and the privacy
   policy both change too.

### Still Veet's, unchanged

- **Screenshots.** Replaced 2026-10-10 with 6 Race Day Bold shots in
  `store/screenshots/` (menu, race setup, qualifying, live race, pit panel,
  trophy room; status and nav bars cropped). Ready to upload; a race result
  and a team-select shot are still missing (see the Plan 2 phone pass). The
  icon and feature graphic predate the redesign.
- **Privacy policy hosting.** Still not at a public URL, and 1.3 needs it to
  say more than 1.2 did.
- **1.2 review status.** Submitted 2026-09-24; unknown since.

### Cleanup worth doing

- `store/listing.md` and `docs/store/listing-copy.md` are two listing
  documents. The second is current; the first predates it and should go, or
  they will drift.

---

## 2026-09-26, later: Tier 2 is done bar the device proof

- **Steps 3b, 4, 5 merged** (`e7f20cb`, `2221218`): Crashlytics scoped to
  crashes only, in-app review on a title, flexible updates, integrity
  plumbing. The device pass found a crash-on-launch the whole test suite had
  missed — Crashlytics without its Gradle plugin — now guarded.
- **Step 3a merged** (`b2efe8f`): eight Play Games achievements created in the
  console with generated icons, and mirrored from the badge system.
- **Step 6 drafted**: privacy policy, data-safety answers and the listing
  copy all rewritten for 1.3.

### What is left

1. **Cloud save has never worked on a device.** Google has not minted a
   player id for the account. Until it does, no achievement can unlock and no
   save can sync, so nothing in Tier 2 is proven end to end.
2. **Publish the eight achievements.** They are drafts, which is the
   reversible state. A published achievement cannot be deleted, so read the
   names once more first.
3. **A contact address for the privacy policy**, and hosting for it. Play
   will not accept the policy without an address, and 1.3 cannot ship without
   the policy.
4. **Screenshots.** Replaced 2026-10-10 (Race Day Bold, 6 shots).
5. **1.2's review status**, still unknown.

## 2026-10-09: the team ladder

- Spec `docs/superpowers/specs/2026-10-09-team-ladder-design.md`, plan
  `docs/superpowers/plans/2026-10-09-team-ladder.md`.
- Teams climb or slip at season end against the constructors' position
  their car deserved. One rule for all ten.
- **Balance change in the live game:** rival development now resets each
  winter. Before, it pinned every rival at 100 on power/aero/handling by
  season 4.
- Device pass: on 2026-10-09, Pixel 10 Pro XL, release build, no crash.
  Played rounds 1 to 12 and reached the championship screen. Seen: the
  reveal (Deserved P4, Finished P5, HELD, Tier 0 to 0), a grid-movers
  line listing only Kestrel Sport (up) and Solstice Racing (down), and
  the CONSTRUCTORS' toggle with ten teams whose points sum to 1212, the
  season total for 12 races. NEXT SEASON led to a Development screen with
  no tier chip, as expected for tier 0. Not checked: a STEP UP or STEP
  DOWN verdict on the player team and the tier chip it drives (this run
  was a HELD), and the reduced-motion behaviour (not toggled; the reveal
  could not be replayed).
- Forced-tier device pass, 2026-10-09, same phone, using a temporary
  uncommitted build (1-race seasons, ladder threshold 1) so a season end
  was one race away. Seen: STEP DOWN twice (deserved P1 finished P4,
  tier 0 to -1; deserved P4 finished P6, tier -1 to -2), STEP UP once
  (deserved P6 finished P4, tier -2 to -1), the Development chip as
  "TIER -1" with a down arrow after both a step down and a step up, and
  reduced motion (every reveal element in its final place at 0.25s). The
  tier survived reinstalling the normal build. Everything on the
  team-ladder device list is now checked.
- Found during it, not fixed: "Retry this round" keeps the abandoned
  attempt's points, development points, rival development and career
  record (a rival reached 65 points in a one-race season). Logged as a
  separate task. The championship header reads "SEASON 2025" in every
  season.

## 2026-10-09: module Web Workers on device

Spike for the post-race debrief: a Vite module worker
(`new Worker(new URL(..., import.meta.url), { type: 'module' })`) loaded and
replied inside the Capacitor WebView on the Pixel 10 Pro XL
(PITWALL_WORKER_OK). Spike code removed.

## 2026-10-09: post-race debrief

- Spec `docs/superpowers/specs/2026-10-09-post-race-debrief-design.md`, plan
  `docs/superpowers/plans/2026-10-09-post-race-debrief.md`.
- The pre-race plan now executes (it never did); all stops share one
  stop-time model including pit crew.
- Device pass (Pixel 10 Pro XL, 3 races at 4x; Veloce GP, plan "M -> H on lap 15"):
  - Plan executes: with no PIT tap, the lap counter read L16 with a
    "PIT STOP 20.4s" bar running, the tyre gauge showing H at 0% worn and
    the pit-window tile reading "No stop"; the finished race listed
    "1 pit stop". The "Box box -- plan stop." radio line was NOT caught
    (4x, screenshots 4s apart; the radio showed other messages).
  - Debrief timing: NOT measured and "reviewing..." with its percentage was
    NOT seen. The card was already finished every time I looked (first
    look about 2s after the flag in race 1; in race 3 a uiautomator poll
    saw the result screen and the card was complete in the screenshot
    taken right after, under about 2s). So the debrief takes well under
    2 seconds on this phone, and the progress state could not be caught.
  - Finished card, as shown: "YOUR CALLS  2 judged - 8 futures". Race 1:
    "check PLAN - START ON MEDIUM  GOOD CALL" and "check PLAN - PIT L15 ->
    HARD  GOOD CALL". Race 3: "triangle PLAN - PIT L15 -> HARD  you avg
    P3.4 / Better: L15 -> SOFT  avg P1.0 - 8/8" and "check PLAN - START ON
    MEDIUM  GOOD CALL". Layout was clean, nothing overlapping.
  - Expand: tapping the PIT L15 row in race 1 expanded it to "P1 P1 P1 P1
    P1 P1 P1 P1" (the 8 futures). The triangle row was not expanded.
  - RETRY: tapped on the finished result; a new race started at lap 1 and
    its result card showed its own fresh verdicts (different from the first
    attempt's). RETRY while the card still said "reviewing..." was NOT
    checked because the card finishes too fast to catch.
  - Scroll stutter during the worker run: NOT checkable for the same
    reason; scrolling the finished result screen looked smooth.
  - NEXT RACE during "reviewing...": not checked. Left on a result screen.

## Car setup — device pass (2026-10-09, Pixel, release build of feat/car-setup)

- WING row renders at phone width, no horizontal scroll; five bars, selected bar filled teal, best-level dot under the bar.
- Silverpark: best dot on 3 ("Aero track · S2 weighted"); tapping 1 shows `+0.81 s/lap vs best · Straights ▲ · Rain +0.4 s` with the lap figure in red; PLAN line updates to `· W1`.
- Switching circuit to Veloce re-seeds the wing to its best (1, "Power track · S1 weighted", `+0.00 s/lap vs best`).
- Qualifying ran with the wing (P14 at Veloce on Mediums, Tier -1 car).
- In race: `W1` chip legible at the top-left of the tyre gauge.
- Race turned wet; finished P2. Debrief card: "3 judged · 8 futures" — ✓ PLAN · START ON MEDIUM, ✓ SETUP · WING 1, ✓ PLAN · PIT L15 → HARD, all GOOD CALL.
- Not observed: the low-wing rain radio line (the race ran at 4× and the banner was not caught), and the remembered wing on a return visit (Veloce's remembered and best level are both 1, so it cannot show the difference). Both are unit-tested.
- Unspecced observation: unselected bars are outline-only and the level-1 bar is very small; fine at arm's length but worth a look.

## Race Day Bold — Plan 1 phone pass (2026-10-09, Pixel, release build of feat/race-day-bold)

- Fonts load on device: Big Shoulders Display (heroes, titles) and Barlow (everything else); no system fallback.
- Main menu with the existing career: team pill, 200 DP, Apex band with the car (ink body, volt accents), ROUND 4 OF 12 · SOL DESERT GP, season strip, P1 · 43 pts, CONTINUE SEASON, tiles.
- Race (Sol Desert, 1× and 4×): big lap counter, slanted speed buttons, track band with "DRY · dry ahead" chip, radio banner, tower compact around you with the volt row and tyre rings, tyre meter + "PLAN · PIT L18" + W3, pace SAVE/HOLD/PUSH with wear, big PIT.
- Pit sheet: BOX THIS LAP?, PIT LOSS 23.0s, sets left per compound, projected rejoin mini-tower with the dashed ghost row (now computed on open), BOX NOW.
- Result: P3, +15 PTS count-up, From P10 ▲7, helmet podium, provisional championship P2 · 58 ▼, +10 DP, debrief rows (better lines in hot), NEXT RACE / RETRY ROUND / MENU.
- Untouched screens readable in the new palette: development, race setup, qualifying.
- Fixed after the first pass: invisible car on the menu band, digit gaps, empty space above the tower, "1 laps", projection only after a tyre tap.
- Left for Plan 2: race-setup circuit card renders collapsed (pre-existing); a small gap remains in "+ 15 PTS"; podium helmets look soft at small size; menu "next race" shows the pending round while a result is unkept (old semantics).

## 2026-10-10: Race Day Bold — Plan 2 phone pass

Release build on the Pixel-class test phone (1080x2404), Veet's season-5 career, round 6.

- Seen and working: the factory, race setup (circuit card full height, laps 2–4 forecast pills, REC on the recommended tyre, stint split dragged L21→L33 and the PLAN line followed), qualifying (lap card, grid, SIMULATE + TO THE GRID after a lap), race (tower, tyre meter, PIT sheet with ghost row and sets left), result (flat helmets, DNF band), menu (RESULT WAITING, TROPHIES 7/15), trophy room, garage (collectible cards, white visors), settings, scenarios.
- Fixed during the pass (f4bd690): settings speed/difficulty selectors crushed; factory eyebrow clipped at "6 OF"; selected tyre too faint in race setup; HUD lap counter gap "L   1/46"; scenario pills invisible on the card.
- Not exercised on the phone: team and driver select (reachable only through NEW SEASON, which would discard the career), the season-end verdict, start lights (the race started without the sequence), the dry-track spin radio (unit-tested).
- The round-6 result was left unkept on purpose (two test races: P19, then a retry that ended DNF) — RETRY or play it out.
- For Veet:
  - Status-bar icons render dark on the dark ground (StatusBar style); pick light icons.
  - RETRY ROUND re-rolls the weather but keeps the start tyre from the plan, so a wet-start plan retried into a dry race starts P20 on wets. Pre-existing; decide whether retry should reopen setup.
  - The pit sheet's slanted top cuts a tower row in half behind it.
  - Championship footer is ~260px tall on short phones; badge tiles' text sits close to the slant edge.

## 2026-10-10: 1.4 submitted to production

- versionCode 5 / 1.4 (`bb4995d`), signed AAB uploaded as production release "5 (1.4) Race Day Bold", full rollout, release notes cover the redesign, wing setup, debrief, team ladder and the winter reset of rival development.
- Submitting it cancelled the 1.3 review (in review since 3 Oct) and restarted review with 1.4, which contains everything in 1.3. Managed publishing is off, so it goes live when approved.
- Only warning: no native debug symbols uploaded.
- Not done: the new store screenshots are not uploaded to the listing yet; the privacy-policy hosting/contact address is still open and may come up in review.

### 2026-10-10, later: store paperwork for 1.4

- **Data safety updated in the console** (it still said "collects nothing" from August). As submitted: crash logs (required, app functionality), device or other IDs (required, app functionality), app activity → other actions = career progress via Play Games (optional, app functionality); nothing shared; encrypted in transit; no account creation. Two departures from `docs/store/data-safety.md`: crash logs and IDs are *required* (there is no in-app switch to turn crash reporting off), and game progress is "Other actions" (Google's definition names gameplay). The optional "can users request deletion" question is left blank — answering Yes requires a public deletion-request URL, which does not exist yet.
- **Store listing:** full description replaced with the 1.4 copy (wing, debrief, team ladder, rival-development reset; tyre meter wording), 7 old screenshots replaced by the 6 Race Day Bold ones, which are labelled as AI-assisted in the new AI-asset declaration. App name and short description unchanged.
- **Achievements:** the 8 Play Games achievements are published (IDs match `src/sync/achievements.ts`). Permanent.
- **Debug symbols:** not possible — the only native library is AndroidX DataStore's `libdatastore_shared_counter.so`, which ships stripped. The console warning is harmless.
- All of the above plus the 1.4 release were submitted together; the review restarted once more.
- **Still open, needs Veet:** a contact address and a public URL for the privacy policy (and with them a data-deletion URL); a git remote to push to.
- **Privacy policy hosted (2026-10-10):** https://veetrag.github.io/pit-wall/privacy/ — the `gh-pages` branch of the now-public repo github.com/veetrag/pit-wall (an HTML render of `docs/store/privacy-policy.md`, contact veetrag@gmail.com). Play's privacy-policy URL now points there (it was an old Google Doc) and is in review with 1.4. If the policy text changes, re-render the page on `gh-pages`.
- Worth doing: restrict the Firebase API key in `google-services.json` to the Android app in Google Cloud, now that the repo is public.
- **Firebase keys (2026-10-13):** the Android key is restricted to `com.veetrag.pitwall` + the Play signing and upload SHA-1s; the unused Browser key is deleted (restorable for 30 days).
- **Data deletion (2026-10-13):** https://veetrag.github.io/pit-wall/delete-data/ (source `docs/store/delete-data.md`). Saved in the data-safety form but **not sent for review** — send it from Publishing overview once 1.4 is live, so 1.4's review doesn't restart.
- BillDesk KYC banner: only affects paid sales; Pit Wall has none. Ignored.

---

## 2026-10-16: open to-do and feature ideas

### Fixes for 1.5 (from the 1.4 phone pass)

Branch `fix/1.5`. Everything below still needs the phone pass; none of it has
been on a device.

- [x] Status-bar icons: light style on the dark ground. `34c517d`:
      `plugins.SystemBars.style: 'DARK'` (Capacitor 8's built-in SystemBars;
      "DARK" means light icons). Reaches the phone on the next `npx cap sync`,
      run from the repo root, never from a worktree.
- [x] Pit sheet's slanted top cuts a tower row in half. `bcdd815`: scrim above
      the slant, deepest at the edge; taps still reach the speed control.
- [x] Championship footer ~260px on short phones; badge text too close to the
      slant. `b085632`: at <= 740px tall END CAREER moves to the end of the
      content (210 -> 124px at 360x640); badge tiles padded 32px; the badge
      toast is in flow above the footer, no longer over NEXT SEASON.
- [x] RETRY ROUND keeps the plan's start tyre into re-rolled weather. `c7861b3`:
      retry reopens race setup for the round with the plan pre-filled, start
      tyre kept only if it suits the new opening; qualifying is re-run.
- [x] Start lights did not play before the round-6 race. `586945d`: not the
      qualifying path. Reduced motion skipped the whole sequence; it now runs it
      without the pulse, and the (previously dead) "Skip start sequence"
      setting is what skips. Check the phone's Reduce motion / Skip start
      sequence settings during the pass.
- [x] Backgrounding mid-race. Already fixed in 1.4 (`8d61d9f`); this item was
      stale. `bcea2b9` adds a test for the listener wiring.
- [ ] On-device: team/driver select, season-end verdict.
- [x] Round one of every new season is wet. Already fixed in 1.4 (`23dafd1`,
      `dryStart`): the opening lap is dry; rain can still arrive later (the
      first-ever race, seed 42, turns at lap 18 of 56). Whether the first race
      should be fully dry is open.
- [x] `projectPitNow` seeded from `Date.now()`. Clock removed in 1.4
      (`59de173`), but its `rngState` seed never advanced. `6ebd11b` seeds
      from (race seed, lap, sector).
- [x] Predictive back gesture (API 36). `5da43db`: `enableOnBackInvokedCallback`
      on `<application>`; @capacitor/app 8 uses an androidx
      OnBackPressedCallback, so the back mapping is unchanged. Verify a back
      press on every screen.
- [ ] Low-end phone frame rate; tablet/foldable layout.

### Features for 1.5 (spec 2026-10-16, plan 2026-10-16-pit-wall-1.5-features)

Ships as 1.5 / versionCode 6 with the fixes above. None of it has been on a
device. Phone pass: a VSC and an SC-over-VSC in one race (banner, wash, pit
timer), rival intel open through a stop and a retirement, a sprint weekend
end to end including an app kill mid-sprint, the lap chart after a lap-1 DNF.
Balance calls for Veet after the pass: VSC chances 0.25/0.40, pace 1.30, lane
0.60; AI window 6 laps / cliff 0.55; intel widths 2/3/5; sprint 0.33 of the
distance, rounds 4/8/12; the 36px tower rows versus the 44px target rule.

### Store, once 1.4 is live

- [ ] Send the data-deletion change for review.
- [ ] Missing screenshots: race result, team select.

### Feature ideas (proposals, not decided — each needs Veet's call)

Updated 2026-10-17 after 1.5. Already ruled out and not repeated here: run both
cars, practice, driver market, rule changes between seasons, weekend tyre
allocation, daily rewards/streaks, leaderboards/friends.

Shipped from the 2026-10-16 list (1.5): virtual safety car, rival intel, sprint
weekends, lap chart in the debrief. The In-App Review prompt is already built
(`src/sync/platform*.ts`).

**In the race (the core loop)**
- [ ] **Driver radio requests.** The driver occasionally asks for something —
      "tyres are gone, box?", "I'm faster than him, let me push" — and the
      player answers yes/no in one tap. Uses the existing pace and pit levers,
      so no new mechanics; it makes the race talk back. Data in `radio.json`.
- [ ] **Red flag.** A big crash stops the race: cars line up in order, every
      team gets a free tyre change, then a standing restart. A third kind of
      neutralisation next to the SC and VSC, with its own decision (which tyre
      for the restart sprint). Rare: rolled after the SC, like the VSC.
- [ ] **Pit stop variance.** Most stops take the nominal time; a small chance
      of a slow stop (wheel-gun, 2–6s) for anyone, the player included. Makes
      "box behind your rival" a gamble and gives the commentary something to
      call. One seeded draw per stop, rate in `tuning.json`.
- [ ] **Weather forecast confidence.** The rain call shows a percentage that
      firms up as it gets closer ("rain in 6–9 laps, 60%"), instead of the
      weather arriving as a surprise. The timeline already exists; this is how
      much of it the player sees.

**After the race**
- [ ] **"What if" replay in the debrief.** Pick a different stop lap or
      compound for your stint and the debrief re-runs the race from the same
      seed to show where you would have finished. The engine is deterministic
      and the debrief already replays the race, so this is mostly UI. Turns the
      verdicts into something the player can test.
- [ ] **Share a result card.** Render the podium/result as an image and open
      the Android share sheet (Capacitor Share). No server, no account — the
      only free growth channel the game has.

**Career and seasons**
- [ ] **Team offers (the deferred "promotion" idea).** After a strong season a
      bigger team offers a seat with a harder board target; the player can
      decline. Gives an endless career an arc. Open questions are in
      `docs/superpowers/specs/2026-09-19-v2-roadmap.md` (development tiers,
      demotion, what the target is).
- [ ] **Career stats and records page.** Best finish per circuit, win rate by
      start compound, longest stint, biggest comeback, sprint record. Data the
      career record mostly holds already; feeds the trophy room.
- [ ] **More scenarios.** The scenario mode has three. The `findScenarios`
      tool can author more from real seeds (a VSC gamble, a rain call, a sprint
      finish, a red-flag restart once it exists). Cheap content.

**First-time player**
- [ ] **A guided first race.** Short prompts the first time each lever matters
      (first pit window, first cliff warning, first safety car), dismissible
      and never shown again. Settles the open question of a fully dry first
      race at the same time.

**Reach and quality**
- [ ] **Colour-blind tyre palette** in Settings. Letters already back up the
      colours, but S (hot pink) and M (volt) are the two most-used and the
      hardest pair for deuteranopia. Token swap via `styles/tokens.css`.
- [ ] **Text size setting.** One step larger for the tower and the pit panel,
      for small phones and older eyes. Pairs with the tablet/foldable layout
      already on the fix list.

**Suggested order:** driver radio requests and pit stop variance (small, make
the race feel alive) → "what if" replay and share card (cheap, visible) →
guided first race → red flag → career stats → team offers.

### 1.6 Plan B: around the race (spec 2026-10-17, plan 2026-10-17-pit-wall-1.6-around)

Ships as 1.6 / versionCode 7 with Plan A. None of it has been on a device.

**Build note, before the first release build:** the two new plugins
(`@capacitor/share`, `@capacitor/filesystem`) were installed in the worktree
only. After merging, run `npm install` then `npx cap sync android` **from the repo root**, never
from a worktree (a worktree sync writes `../../../node_modules` into
`android/capacitor.settings.gradle`; `tests/data/androidManifest.test.ts`
fails it). Then build release and confirm the merged-manifest permission test
still sees exactly ACCESS_NETWORK_STATE, INTERNET, VIBRATE and the dynamic
receiver permission.

**Phone pass:** high-contrast tyres on the tower, pit panel, setup and weather
strip; Large text on a 360x640 phone (tower five rows, pit panel fits, banner
not clipped); first SC, pit window and radio request tips each once, the
request not expiring under its tip; STATS after an old career; TRY ANOTHER
PLAN after a GP and a sprint, and after NEXT RACE mid-run; SHARE from a GP,
a sprint, a DNF and the championship into a real app; the four new scenarios
and their BEST pills; a season-end offer accepted (driver pick, kill the app
mid-pick, resume) and declined.

**Calls for Veet after the pass:** high-contrast values; Large = 1.15 and five
compact rows; new tips shown once to returning players; the what-if median and
range read-out and +-10 laps; stats counting Grand Prix only (except sprint
record and stint); offers beatBy 2 / stepUp 2 on authored + ladder rating,
STAY the default.

### 1.7 Circuits & Night (spec 2026-10-24 slice A)

Phone pass: Lantern Quay at 1x (SCs frequent, not every lap; S1 the only real
passing place; floodlights legible; 60fps); Mesa Roja (three stops the norm,
two a gamble; is passing too easy?); pills on setup, menu, qualifying; extra
circuits on the setup strip; career BEST BY CIRCUIT shows the two new rows.
Decided 2026-10-31: night wear stays at 1.0 (night is presentation only;
MODEL_SPEC §17). Lantern Quay keeps crashRisk 1.3 / neutralisationRisk 1.5
(passes every gate; 1.2 / 1.6 is the fallback if a later retune drops rho
under 0.50). Mesa Roja keeps tyreWear 1.40, 52 laps and open passing: it is
the tyre-management circuit, and the Mediums-heavy default plan is a sane
three-stop starting point the player can reshape.

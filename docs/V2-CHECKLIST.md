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

- **Screenshots.** The 7 in `store/screenshots/` are from August and
  September: no qualifying, no career, no badges, and shot before the font
  fix. The icon and feature graphic are fine and were reused for PGS.
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
4. **Screenshots.** Still August and September: no qualifying, no career, no
   badges, shot before the font fix.
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

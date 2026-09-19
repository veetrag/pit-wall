# Device verification runbook

The pass that CI cannot do. Everything here fails **only** on real hardware —
which is precisely why it keeps being deferred, and why two of the items below
were shipped broken and found by reading rather than running.

Run it top to bottom. Each check says what failure looks like, because several
of these fail *silently*.

---

## 0. Setup

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$ANDROID_HOME/platform-tools:$PATH"
adb devices          # the device must appear as `device`, not `unauthorized`
```

`unauthorized` means the USB-debugging prompt is still waiting on the phone.

## 1. Build and install the RELEASE binary

The release build is the only one worth testing here: `assembleDebug` does not
run R8, so it cannot reproduce section 2 at all.

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleRelease && cd ..
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

`android/keystore.properties` is present on this machine, so the release build
is signed. If that file is ever missing the build still succeeds and produces an
**unsigned** APK — Gradle only logs a warning.

Keep a logcat open in a second terminal for the whole pass:

```bash
adb logcat -c && adb logcat | grep -iE "pitwall|capacitor|AndroidRuntime|chromium"
```

---

## 2. R8 — the highest-risk item

**Why this is dangerous:** Capacitor resolves plugins reflectively, by name,
across the WebView bridge. R8 has no way to see those references, so without
the keep rules in `android/app/proguard-rules.pro` it strips them — and the
build succeeds. The failure appears only at runtime, only in release.

| Check | How | Failure looks like |
|---|---|---|
| Haptics | Confirm a pit stop | No buzz. Logcat shows a plugin-not-found or a silent no-op on `Haptics.impact` |
| Haptics (heavier) | Trigger a safety car, feel for the one-per-deployment warning buzz | Nothing on deployment |
| Settings persist | Change sound/haptics/difficulty → force-stop the app → reopen → Settings | Values reset to defaults. `Preferences` was stripped |
| Season persists | Start a season, play a round, force-stop, reopen | **CONTINUE SEASON** missing from the menu |
| App lifecycle | Press the hardware back button mid-race | The activity finishes and the race is destroyed (that is what `useAndroidBackButton` exists to prevent) |

Force-stop properly — swiping the app away is not the same thing:

```bash
adb shell am force-stop com.veetrag.pitwall
```

---

## 3. The two low-end-device fixes (this branch)

Both were invisible in dev and in CI. They need a **minSdk-24-era WebView** to
be meaningful — an old device or an API 24–28 emulator image. On a current
phone with an updated WebView both will look correct whether or not the fix
works, so **testing these on a modern device proves nothing**.

| Check | Where | Failure looks like |
|---|---|---|
| Tier-pip glow | Development screen, any facet with ≥1 tier bought (needs 10 DP, so after round 1) | Owned pips are flat colour with no surrounding glow |
| Maxed-row tint | Development screen, a facet with all 3 tiers bought | The row is the same background as every other row, with no green wash |
| Reduced motion (OS) | Android Settings → Accessibility → **Remove animations** ON, then cold-start the app | Menus still slide, the tyre gauge still pulses, the safety-car banner still throbs |
| Reduced motion (toggle) | In-app Settings → Reduced motion ON → finish a race on the podium | Confetti still falls |
| Reduced motion (precedence) | OS animations OFF, then in-app toggle explicitly OFF | Motion should return and **stay** off-preference — the explicit choice wins |

## 4. Rendering and performance

| Check | Failure looks like |
|---|---|
| 60fps during a race at 4× | Visible stutter in the timing tower or the track canvas |
| Safe-area insets | Content under the notch or the gesture bar |
| Timing tower reorder | Rows jump instead of animating |
| Track canvas | Cars teleport between sector points rather than tweening |

## 5. New since the last device pass

| Check | Failure looks like |
|---|---|
| Scenario mode runs | Pick any scenario → **TAKE OVER**. The race must advance on its own. A frozen HUD means the clock was not started |
| Scenario briefing | "Safety Car Gamble" shows `⚠ SAFETY CAR` in its situation line |
| Scenario result | Finishing gives GOAL MET / GOAL MISSED with a ✓ or ✗, never a season result screen |
| Scenario isolation | Play a scenario **while a season is in progress**, then return to the menu. CONTINUE SEASON must still show the same round, and standings must be untouched |
| Coach marks | First race only: the cliff mark near the tyre cliff, the projection mark on first opening the pit panel with a compound selected. Each pauses the race and restores the previous speed on GOT IT |
| Coach marks retire | After dismissing both, they never return. Settings → **Replay tutorial** brings them back |

---

## 6. Judgement calls — not pass/fail

These need an opinion, not a check. Nothing here can be automated and nothing
here should block a release on its own.

- **Title fight.** Play 3–4 seasons. The challengers were raised rather than
  Voss flattened; the regression bands pass. Does the championship feel earned?
- **Scenario difficulty.** Goals are `par - 1` — one place better than the AI
  manages unattended. Too tight? Too soft? `cliff_edge` is deliberately
  defensive; the other two attack.
- **Audio.** Everything is synthesised WebAudio since howler was dropped. Are
  the beeps good enough to ship, or does this need real samples?
- **Caution amber.** Caution alerts moved from `--tyre-medium` yellow to
  `--caution` amber, so they match the safety-car banner. Right call?

---

## 7. If something fails

Capture the evidence before changing anything:

```bash
adb logcat -d > /tmp/pitwall-logcat.txt
adb exec-out screencap -p > /tmp/pitwall-screen.png
```

For a suspected R8 strip, check the mapping file rather than guessing:

```bash
ls android/app/build/outputs/mapping/release/mapping.txt
```

Note that `strings | grep` on the DEX has given a **false negative** here
before — a method that was present read as absent through macOS tooling. Count
raw bytes, or confirm behaviourally, rather than trusting a grep.

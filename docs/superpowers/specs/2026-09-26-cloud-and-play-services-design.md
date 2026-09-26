# Cloud save and Play services — design

**Status:** for review.
**Decided by Veet, 2026-09-26:** Crashlytics scoped to crashes only; all 15
badges mirrored as Play Games achievements; save conflicts resolved by keeping
the further career.

---

## 1. What this is, and the one thing it costs

Five things from `docs/V2-CHECKLIST.md` Tier 2, built together because they
share a single prerequisite: the `android.permission.INTERNET` permission.

Cloud save is the reason. The rest are cheap once the permission is paid.

The permission is not a technicality. `tests/data/androidManifest.test.ts:167`
states the standing position: adding it "is a legitimate decision, not a
forbidden one -- but it is a PRODUCT decision with a store-disclosure
consequence". Three things follow, and none of them are optional:

1. The data-safety declaration changes from "collects nothing" to declaring a
   Play Games player ID, a Firebase installation ID, and crash logs.
2. The privacy policy has to say the same, and it still is not hosted anywhere.
3. **This paragraph of the live store listing becomes false and must be
   rewritten before 1.3 ships:**

   > Pit Wall makes no network requests at all -- it does not even request
   > permission to use the internet.

The replacement is not "delete the paragraph". Offline play is still true and
still worth saying; what changes is the absolute claim about permissions. §8
covers the rewrite.

**Nothing here may make the game require a network.** The whole product runs
offline today and must still run offline afterwards: signed out, declined,
airplane mode, or on a device with no Play Games at all. Every feature in this
spec is additive and every one of them degrades to a no-op.

---

## 2. Dependencies, and where the risk actually sits

| Purpose | Package | Version | Downloads/mo |
|---|---|---|---|
| Play Games (sign-in, saved games, achievements) | `@modbender/capacitor-play-games` | 0.5.0 | 24k |
| In-app review | `@capacitor-community/in-app-review` | 8.0.0 | 614k |
| In-app updates | `@capawesome/capacitor-app-update` | 8.0.5 | 363k |
| Crashlytics | `@capacitor-firebase/crashlytics` | 8.5.2 | 203k |
| Play Integrity | `@capacitor-community/play-integrity` | 8.0.0 | — |

Four of the five are mature and widely used. The fifth is not: there is **no
official Play Games plugin for Capacitor**, and the best available option is
pre-1.0, two weeks old, and maintained by one person.

That is an uncomfortable shape -- the single feature justifying the permission
rides the least mature dependency -- and §3 is the direct response to it. The
plugin is isolated behind an interface we own, so replacing it (or writing a
native plugin ourselves) is a change to one file rather than a change to the
game.

CLAUDE.md §2 asks for dependencies to be added sparingly and justified. Five at
once is a lot; four of them are three-line integrations, and the justification
for each is its row above.

---

## 3. Architecture

A new `src/sync/` directory. It may import from `state/`; nothing in `engine/`
changes or is imported by it, so CLAUDE.md §3 is untouched.

```
src/sync/
  types.ts          # the interfaces below -- no plugin imports
  playGamesClient.ts# THE ONLY file that imports @modbender/capacitor-play-games
  cloudSave.ts      # payload shape, conflict resolution -- pure
  achievements.ts   # badge id -> PGS achievement id -- pure mapping
  review.ts         # in-app review trigger policy
  appUpdate.ts      # update check policy
  index.ts          # public surface consumed by state/ and ui/
```

**The rule that makes this testable:** every plugin lives behind an interface
declared in `types.ts`, and exactly one file imports each plugin. Vitest cannot
run a native Android plugin, so all real logic -- conflict resolution, payload
migration, the achievement mapping, the review trigger policy -- is pure and
tested against a fake client. The plugin wrappers stay thin enough that reading
them is sufficient review, and they are verified on the device pass instead.

This is the same separation the engine already has from the UI, applied to a
different boundary and for the same reason.

---

## 4. Cloud save

### 4.1 Payload

One snapshot containing both existing save shapes:

```ts
interface CloudSnapshot {
  v: number                    // CLOUD_SAVE_VERSION
  career: CareerSnapshot       // from careerPersistence.ts
  season: SeasonSnapshot | null// from seasonPersistence.ts; null between seasons
  savedAt: number              // epoch ms, for display only -- NOT for conflicts
}
```

It reuses the existing zod schemas rather than defining new ones. A second
description of the save format would drift from the first.

**Loading a cloud snapshot goes through `migrateSave` exactly as a local load
does.** This is the easiest thing in the whole spec to get wrong: a cloud save
written by an older version of the app outlives the device it came from, so
cloud is *more* likely to hand us an old format than local storage is, not
less.

### 4.2 Conflict resolution

Play Games surfaces a conflict when two devices wrote independently. Decided
policy: **keep the further career.**

```ts
export function pickFurther(a: CloudSnapshot, b: CloudSnapshot): CloudSnapshot
```

Ordering, in sequence, first difference wins:

1. `career.seasonNumber` -- more seasons is further
2. `career.racesStarted` -- more races is further
3. `savedAt` -- newest, purely to break an exact tie deterministically

Pure, total, and deterministic. It never loses the larger investment, needs no
UI, and handles the overwhelmingly common real case (a new phone replacing an
old one) correctly without asking a question at the worst possible moment.

The known cost, stated plainly: a player who deliberately starts a short new
career on a second device will have it beaten by their long career from the
first. That is the right trade -- the alternative silently destroys years of
progress -- and it is why `savedAt` is deliberately NOT the primary key.

### 4.3 When it syncs

- On sign-in at app start: fetch, compare with local, resolve, apply.
- After `recordSeasonEnd` and after `startNextSeason`: write.
- Never mid-race. A race is not a save point today and this does not make it
  one.

Local storage stays the source of truth during play. Cloud is a mirror, not a
dependency: every write is fire-and-forget and a failure is logged, never
surfaced as an error the player has to dismiss.

---

## 5. Achievements

All 15 badges in `src/state/badges.ts` get a Play Games achievement.

`achievements.ts` holds a `Record<BadgeId, string>` mapping to the console's
achievement IDs. A test asserts the map is **total over the badge list** -- add
a badge later and the test fails until the mapping exists, which is the only
thing that stops the two lists drifting.

The unlock hook already exists: `careerStore.justEarned` is computed by
`newlyEarned(before, after)` and is already the signal the toast listens to.
Achievements listen to the same signal. No new game logic, no new balance
question, and the in-game trophy case remains the primary surface.

**Your console work, and it is the real cost here:** 15 achievement IDs, each
needing a name, a description, and a **512x512 icon**. That is 15 pieces of
art, and it is the largest non-code task in this spec.

---

## 6. In-app review

Trigger: the championship screen, only after winning a title, and only once per
career. Google throttles the actual prompt independently, so our job is to ask
at a moment the player is happy rather than to ask often.

Explicitly not triggered: after a loss, on launch, after a retirement, or
anywhere in the first race.

---

## 7. In-app updates and Play Integrity

**Updates:** a flexible (non-blocking) update check on app start. Immediate/
forced updates are deliberately not implemented -- there is no server contract
to break, so nothing justifies blocking a player from a game they already have.

**Integrity:** the plumbing goes in, and **nothing is gated on it**. Integrity
exists to protect leaderboards and purchases; this game has neither. Wiring it
now means a later leaderboard does not have to retrofit it. Failing an
integrity check must never prevent play.

---

## 8. Store paperwork

All three need updating before 1.3 is submitted, and they are listed here so
they are not discovered at submission time:

- **Listing full description** -- rewrite the closing paragraph. Keep "no ads,
  no in-app purchases, no analytics beyond crash reports", keep offline play,
  drop the absolute no-permission claim.
- **Data safety form** -- declare: Play Games player ID (account linking, for
  cloud save), Firebase installation ID, crash logs. Not linked to advertising,
  not sold, not shared.
- **Privacy policy** -- same three items, and it still needs hosting at a public
  URL. Already outstanding from before this work.

---

## 9. Testing

Pure and tested in vitest:

- `pickFurther` -- ordering, each tiebreak level, exact ties, and specifically
  that a newer-but-shorter career loses.
- Cloud payload round-trip through the zod schemas.
- Cloud load through `migrateSave`, including an old-version snapshot.
- The achievement map is total over `badges.ts`.
- Review trigger policy: fires on a title, not on a loss, once per career.
- Every feature no-ops when the client reports signed-out.

Changed guards:

- `androidManifest.test.ts` flips from "must not contain INTERNET" to pinning
  the **exact** permission set, so the guard keeps its value: one deliberate
  addition, and nothing else slips in behind it.
- `noRemoteAssets.test.ts` **stays**. Its rationale changes -- remote assets no
  longer fail silently, they now work in dev and break offline play, which is
  worse -- but the ban is still correct.

Device pass, because none of it can run in CI: sign-in, a real cloud save
round-trip across two installs, a forced conflict, an achievement unlock, and
airplane-mode play with sign-in unavailable.

---

## 10. Staging

Six reviewable steps, in dependency order:

1. Permission, manifest guard flip, `src/sync/` boundary, and conflict
   resolution -- all pure, all tested, no plugin yet.
2. Play Games client and cloud save end-to-end.
3. Achievements.
4. In-app review.
5. In-app updates and Play Integrity.
6. Store paperwork.

Steps 2 onward are blocked on console setup that only Veet can do: the Play
Games Services project, the OAuth consent screen, the achievement IDs and
icons, and the Firebase project with its `google-services.json`. Step 1 needs
none of it and can start immediately.

---

## 11. Console setup — state as of 2026-09-26

Recorded because it is spread across three consoles and none of it is visible
from the repo.

### Done

- **Firebase project** `pitwall-fc924` (project number 609398586580).
- **Firebase Android app** registered: `com.veetrag.pitwall`, nickname
  "Pit Wall". `google-services.json` is at `android/app/`, committed.
- **Both SHA-1 fingerprints** added to the Firebase app:
  - upload key `AB:83:66:3E:33:E7:5A:07:57:78:04:27:95:1E:D8:E7:A9:08:8D:0D`
  - app signing key `C3:02:B5:4D:BD:CB:8E:1A:42:4F:1C:7D:C6:FD:85:DA:EF:58:BF:22`

  Both are needed. The app signing key is what Play-installed builds present;
  the upload key is what a local release build presents. With only one
  registered, sign-in works in exactly one of those two situations and the
  failure looks like a code bug.
- **Play Games Services project created** and linked to the same cloud
  project, `pitwall-fc924`. PGS project ID 609398586580.
- **Saved games: enabled.** Cloud save cannot work without it, and the console
  warns it *cannot be turned off after publishing*.
- Display name corrected from "Pitwall" to "Pit Wall", matching the app.

- **OAuth consent screen** created on the Google Auth Platform for
  `pitwall-fc924`: app name "Pit Wall", user support and developer contact
  both `veetrag@gmail.com`, audience **External**, publishing status
  **Testing**.

  External is the only valid choice: Internal requires a Google Workspace
  organisation and this is a personal account. Testing status means only
  listed test users can sign in, which is what we want until 1.3.

- **Two Android OAuth clients** created, because an Android OAuth client binds
  exactly one SHA-1 and we have two signing identities:
  - `Pit Wall (Play app signing key)` — cert C3:02:B5:... — what Play installs
    present.
  - `Pit Wall (upload key, dev builds)` — cert AB:83:66:... — what a local
    release build presents.

- **PGS Android credential** created, authorised by the Play app signing
  client. Anti-piracy left **Off**: it is a licensing check that exists to
  protect paid apps, and on a free offline game it can only ever block a
  legitimate player.

PGS setup is now **4 of 6**. The two remaining are "add the SDK to your
production APK", which is implementation work, and "publish your project",
which is deliberately deferred to 1.3.

### Outstanding, in order

1. **A fresh `google-services.json`.** The committed copy predates the OAuth
   clients and still has `oauth_client: []`. File downloads stopped reaching
   disk through browser automation partway through this setup, so this one has
   to be downloaded by hand from the Firebase console and dropped into
   `android/app/`. **Verify `oauth_client` is non-empty before starting step
   2** -- the whole chain has been "necessary but not sufficient" twice, and
   an empty array is the symptom every time.
2. **A second PGS credential** for the upload-key OAuth client, if sideloaded
   release builds need to sign in during development. The client exists; only
   the PGS credential linking it does not.
3. **Publish the PGS project** — until then only listed testers can sign in.
   This is deliberate: do it when 1.3 is ready, not before.

`google-services.json` currently has **no `oauth_client` entry**, which is the
observable symptom of 1-2 being incomplete. Adding the fingerprints was
necessary but not sufficient: the entry appears only once a credential exists,
and a credential cannot be created before the consent screen. It must be re-downloaded once
credentials exist, or sign-in will fail at runtime with nothing in the file to
explain why.

### Not a blocker, but noted

The PGS summary still reads "Firebase not linked" even though both sit on
cloud project `pitwall-fc924`. That flag concerns Firebase-specific PGS
features rather than the sign-in path cloud save uses. Revisit only if
sign-in misbehaves after credentials exist.

---

## 12. Device pass, 2026-09-26 — partial

Pixel 10 Pro XL, release APK sideloaded. **The app-side wiring is proven; Play
Games account provisioning is not yet working.**

### Proven on device

- The plugin is reached with our exact snapshot name. The first run logged
  `PgsSnapshotAgent: Failed to open snapshot file pitwall.career status: 4000`
  -- a "no such snapshot" from Google, which means the whole path from
  App.tsx through storeBridge, cloudSync and playGamesClient executed and
  asked Play Games the right question.
- The signing-credential fix worked. Before it,
  `GameNetworkException ... UNAUTHENTICATED`; after adding the upload-key
  credential, `GamesConnectSignInOp: signIn: Returning SUCCESS`.
- **Offline degradation is correct.** In the final run, with no player id,
  `pitwall.career` appears zero times in the log: signIn reported signed-out
  and the code stopped there rather than pressing on. That is the designed
  behaviour, observed rather than assumed.
- No crash, no fatal exception, and the game renders and plays normally.

### The failure that remains

```
ScopedIdsTransformer: Fetching game player id for
  (Account {name=veetrag@gmail.com}) (609398586580) failed
PlayGamesServices[DataBroker]: No player ID found when refreshing
```

Sign-in succeeds at the broker, but Play Games will not mint a game player id
for the account against this project. Two candidates, in order:

1. **Propagation.** Every piece of this configuration -- consent screen, both
   OAuth clients, both PGS credentials, the OAuth test user -- was created
   within about fifteen minutes of the test. Google documents these as taking
   minutes to hours. Retry before changing anything.
2. **The PGS project is still Draft.** "Publish your project" is the one
   remaining unticked setup item. Google's documentation says testers of an
   unpublished project can sign in, which is why this is second rather than
   first -- but it is the only structural difference left.

### What was fixed during the pass

- A **second PGS credential** for the upload-key OAuth client. The sideloaded
  APK is signed with the upload key (verified: apksigner reports
  `ab83663e...`), and the only credential was bound to the Play app signing
  key. This is exactly the failure §11 predicted in writing, arriving on
  schedule.
  "Use this credential for new installs" was left unchecked, so production
  installs still use the app-signing credential.
- **veetrag@gmail.com added as an OAuth test user.** The Audience page had
  "No rows to display" while publishing status is Testing, which restricts
  access to listed test users. This is a SECOND allow-list, separate from the
  PGS tester list, and having one without the other is silent.

### Ruled out

- PGS tester list: contains veetrag@gmail.com, the same account signed in on
  the phone.
- The games APP_ID: the credential page reports Application ID 609398586580,
  matching `game_services_project_id` in strings.xml.
- App permissions: the merged-manifest guard still passes, so the plugin
  added none of its own.

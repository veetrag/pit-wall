# Play Console — Data Safety declaration

**Status:** draft for Veet to submit. I cannot and will not fill in the Console
form.
**Last verified against the code:** 2026-09-26, commit b2efe8f

> **This replaces the 1.2 declaration, which said the app collects nothing.**
> That was true and enforced by tests until cloud save landed. It is no longer
> true, and submitting the old answers for 1.3 would be a false declaration.

---

## The short version

Pit Wall collects three things, all in service of a feature the player can
see, and none of them for advertising or profiling:

1. a **Play Games player ID**, so a career can be restored on a new phone
2. a **Firebase installation ID** and **crash logs**, so crashes can be fixed
3. nothing else

Firebase Analytics is **off**, enforced by
`firebase_analytics_collection_enabled=false` in the manifest and asserted by
`tests/data/playGamesConfig.test.ts`. Verified on device: Google's own
settings response reports `collect_analytics: false`.

The permission set is pinned by `tests/data/androidManifest.test.ts`:

```
android.permission.ACCESS_NETWORK_STATE
android.permission.INTERNET
android.permission.VIBRATE
com.veetrag.pitwall.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
```

`ACCESS_NETWORK_STATE` arrived transitively from
`com.google.firebase:firebase-installations` via Crashlytics; it reads whether
a connection exists and collects nothing.

---

## Answers to the form

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all user data collected by your app encrypted in transit? | **Yes** — all three services use HTTPS |
| Do you provide a way for users to request that their data is deleted? | **Yes** — a cloud save can be deleted from the Play Games app; uninstalling removes local data |

### Data types to declare

**App activity → Other user-generated content** — *or* **Other data**, if the
form's wording fits better.

- Collected: **Yes**. Shared: **No**.
- Processed ephemerally: **No** — the cloud save persists by design.
- Required or optional: **Optional** — the game is fully playable signed out.
- Purpose: **App functionality** only.
- What it is: career progress (seasons, titles, wins, poles, races run,
  badges) stored against a Play Games player ID.

**App info and performance → Crash logs**

- Collected: **Yes**. Shared: **No**.
- Required or optional: **Optional**.
- Purpose: **App functionality**, and **Analytics** only if the form treats
  crash reporting as such. No behavioural analytics is collected.

**Device or other IDs → Device or other IDs**

- Collected: **Yes**. Shared: **No**.
- Purpose: **App functionality**.
- What it is: the Firebase installation ID that accompanies a crash report,
  and the Play Games player ID. Neither is an advertising identifier.

### Explicitly NOT collected

Name, email, address, phone, financial data, location, contacts, photos,
files, messages, calendar, health, browsing history, search history,
installed apps, advertising ID, or any usage or behavioural analytics.

---

## If the review asks

The claim that analytics is off is checkable three ways: the manifest flag,
the test that asserts it, and the settings payload Crashlytics fetched on
device, which reads `"collect_analytics": false` alongside
`"collect_reports": true`.

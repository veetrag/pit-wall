import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/*
 * Crashlytics needs BOTH halves, and the failure mode for having one is
 * total.
 *
 * On 2026-09-26 the SDK was added without the Gradle plugin. Everything
 * off-device was green -- 698 tests, tsc, vite build, and assembleRelease all
 * passed -- and the release APK did not start at all:
 *
 *   FATAL EXCEPTION: main
 *   java.lang.RuntimeException: Unable to get provider FirebaseInitProvider
 *   Caused by: The Crashlytics build ID is missing. This occurs when the
 *   Crashlytics Gradle plugin is missing from your app's build configuration.
 *
 * Crashlytics initialises from a ContentProvider, before any application code
 * runs, so it takes the whole app down on launch. Nothing in the JS or TS
 * world can observe that. This test is the only thing standing between a
 * dependency bump and shipping an app that cannot open.
 */
const ROOT = resolve(process.cwd())

function read(p: string): string {
  return readFileSync(resolve(ROOT, p), 'utf8')
}

describe('the Crashlytics Gradle plugin', () => {
  const usesCrashlytics = 'crashlytics' in
    (JSON.parse(read('package.json')).dependencies ?? {} as Record<string, string>)
      ? true
      : Object.keys(JSON.parse(read('package.json')).dependencies ?? {})
          .some(d => d.includes('crashlytics'))

  it('IS A DEPENDENCY THIS TEST IS ACTUALLY ABOUT', () => {
    // Guards the guard: if the Crashlytics package is ever removed, the two
    // assertions below would pass vacuously against a build that no longer
    // needs them, and nobody would notice the file had stopped meaning
    // anything.
    expect(usesCrashlytics, 'no crashlytics dependency -- delete this file').toBe(true)
  })

  it('IS ON THE BUILDSCRIPT CLASSPATH', () => {
    expect(read('android/build.gradle'))
      .toMatch(/classpath\s+['"]com\.google\.firebase:firebase-crashlytics-gradle:[\d.]+['"]/)
  })

  it('IS APPLIED IN THE APP MODULE', () => {
    expect(read('android/app/build.gradle'))
      .toMatch(/apply plugin:\s*['"]com\.google\.firebase\.crashlytics['"]/)
  })

  it('IS APPLIED ALONGSIDE google-services, NOT INSTEAD OF IT', () => {
    // Both live inside the same `if (servicesJSON.text)` block. Applying the
    // Crashlytics plugin without google-services would fail differently and
    // just as fatally.
    const app = read('android/app/build.gradle')
    expect(app).toMatch(/apply plugin:\s*['"]com\.google\.gms\.google-services['"]/)
  })
})

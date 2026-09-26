import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

/*
 * The Play Games wiring that lives in Android XML rather than in TypeScript.
 *
 * Nothing off-device reads these files: vitest, tsc and `vite build` are all
 * perfectly green with the project id missing or wrong, and the failure shows
 * up only as a sign-in that does not work on a real phone, with an error
 * message that does not mention the manifest. That gap is exactly what this
 * file exists to close.
 */
const ANDROID = resolve(process.cwd(), 'android/app/src/main')

/** The PGS project number, from Play Console > Play Games Services. */
const PGS_PROJECT_ID = '609398586580'

describe('the Play Games Android configuration', () => {
  it('DECLARES THE GAMES APP_ID META-DATA', () => {
    const manifest = readFileSync(join(ANDROID, 'AndroidManifest.xml'), 'utf8')
    expect(manifest).toMatch(
      /<meta-data\s+android:name="com\.google\.android\.gms\.games\.APP_ID"\s+android:value="@string\/game_services_project_id"\s*\/>/,
    )
  })

  it('RESOLVES THAT STRING TO THE PGS PROJECT ID', () => {
    /*
     * The meta-data above points at a string resource, so a manifest that
     * looks right can still ship a missing or wrong id. Both halves have to
     * be asserted or the reference proves nothing.
     */
    const strings = readFileSync(join(ANDROID, 'res/values/strings.xml'), 'utf8')
    const match = strings.match(
      /<string name="game_services_project_id"[^>]*>([^<]+)<\/string>/,
    )
    expect(match?.[1], 'game_services_project_id is missing from strings.xml').toBe(PGS_PROJECT_ID)
  })

  it('DOES NOT CONFUSE THE PROJECT ID WITH THE PACKAGE NAME', () => {
    // The two sit next to each other in strings.xml and one is a plausible
    // typo for the other. A package name here fails only on device.
    const strings = readFileSync(join(ANDROID, 'res/values/strings.xml'), 'utf8')
    const match = strings.match(/<string name="game_services_project_id"[^>]*>([^<]+)<\/string>/)
    expect(match?.[1]).toMatch(/^\d+$/)
  })
})

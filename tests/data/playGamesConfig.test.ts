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

  it('AGREES WITH THE COPY IN TYPESCRIPT', async () => {
    /*
     * The project number lives twice: strings.xml, which the Games SDK reads
     * and TypeScript cannot see, and CLOUD_PROJECT_NUMBER in platform.ts,
     * which Play Integrity requires as a number. Nothing makes them agree
     * except this test, and a mismatch fails only on a device.
     *
     * platform.ts imports native plugins, so the constant is read from source
     * rather than imported -- importing it here would drag a Capacitor plugin
     * into vitest, which is exactly the failure that shaped src/sync.
     */
    const src = readFileSync(resolve(process.cwd(), 'src/sync/platform.ts'), 'utf8')
    const match = src.match(/CLOUD_PROJECT_NUMBER\s*=\s*(\d+)/)
    expect(match?.[1], 'CLOUD_PROJECT_NUMBER is missing from platform.ts').toBe(PGS_PROJECT_ID)
  })

  it('DISABLES FIREBASE ANALYTICS COLLECTION', () => {
    /*
     * The "crashes only, no analytics" decision, asserted rather than
     * trusted. Crashlytics pulls Firebase Analytics in transitively and it
     * collects by default, so the absence of this flag is not "no analytics"
     * -- it is analytics nobody declared. The data-safety form says crash
     * logs and an installation id, and this is what keeps that true.
     */
    const manifest = readFileSync(join(ANDROID, 'AndroidManifest.xml'), 'utf8')
    expect(manifest).toMatch(
      /<meta-data\s+android:name="firebase_analytics_collection_enabled"\s+android:value="false"\s*\/>/,
    )
  })

  it('DOES NOT CONFUSE THE PROJECT ID WITH THE PACKAGE NAME', () => {
    // The two sit next to each other in strings.xml and one is a plausible
    // typo for the other. A package name here fails only on device.
    const strings = readFileSync(join(ANDROID, 'res/values/strings.xml'), 'utf8')
    const match = strings.match(/<string name="game_services_project_id"[^>]*>([^<]+)<\/string>/)
    expect(match?.[1]).toMatch(/^\d+$/)
  })
})

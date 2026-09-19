import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ANDROID = resolve(process.cwd(), 'android/app/src/main')

function xmlFiles(): string[] {
  const out: string[] = []
  const manifest = join(ANDROID, 'AndroidManifest.xml')
  if (existsSync(manifest)) out.push(manifest)
  const xmlDir = join(ANDROID, 'res/xml')
  if (existsSync(xmlDir)) {
    for (const f of readdirSync(xmlDir)) if (f.endsWith('.xml')) out.push(join(xmlDir, f))
  }
  return out
}

describe('Android XML is well-formed', () => {
  it('PARSES, INCLUDING COMMENTS', () => {
    /*
     * Nothing else in this repo reads these files. vitest, tsc and `vite build`
     * all pass with a malformed AndroidManifest.xml; the failure surfaces only
     * at `./gradlew assembleRelease`, which nobody runs until release day.
     *
     * It has already happened once: a comment added to document the
     * FileProvider used `--` as an em-dash, which XML forbids inside a comment.
     * The manifest merger failed with "Error parsing AndroidManifest.xml" and
     * the release build was broken on main for a whole session before a device
     * pass caught it.
     */
    const offenders: string[] = []
    for (const path of xmlFiles()) {
      const text = readFileSync(path, 'utf8')
      const doc = new DOMParser().parseFromString(text, 'application/xml')
      const err = doc.querySelector('parsererror')
      if (err) offenders.push(`${path.replace(process.cwd() + '/', '')}: ${err.textContent?.slice(0, 120)}`)
    }
    expect(offenders, 'malformed Android XML fails only at assembleRelease').toEqual([])
  })

  it('has no `--` inside a comment, which XML forbids', () => {
    // Belt and braces: jsdom's DOMParser is lenient about some things the
    // Android manifest merger is not, and `--` in a comment is the specific
    // mistake that has actually been made here.
    const offenders: string[] = []
    for (const path of xmlFiles()) {
      const text = readFileSync(path, 'utf8')
      for (const m of text.matchAll(/<!--([\s\S]*?)-->/g)) {
        if (m[1]!.includes('--')) {
          offenders.push(`${path.replace(process.cwd() + '/', '')}: comment contains "--"`)
        }
      }
    }
    expect(offenders, [
      'XML forbids "--" inside a comment; the Android manifest merger rejects',
      'the file outright and the release build fails. Use an em dash, a colon,',
      'or split the sentence.',
    ].join('\n')).toEqual([])
  })

  it('finds the files it claims to check', () => {
    const files = xmlFiles()
    expect(files.some(f => f.endsWith('AndroidManifest.xml')), 'the manifest must be covered').toBe(true)
  })
})

describe('minSdkVersion matches what the bundle can actually run', () => {
  it('IS AT LEAST 30', () => {
    /*
     * This floor is measured, not chosen for neatness.
     *
     * vite.config.ts sets no `build.target`, so Vite uses its default
     * ('modules') and emits optional chaining and nullish coalescing. Probed
     * on a factory system-images;android-24;google_apis emulator, whose
     * bundled WebView is Chromium 53:
     *
     *     optional-chaining: SYNTAX ERROR
     *     nullish:           SYNTAX ERROR
     *
     * A parse error takes out the whole module, so the app rendered nothing
     * but the native background colour -- it did not degrade, it did not
     * start. minSdkVersion was 24 at the time, which made the manifest a
     * promise the bundle could not keep.
     *
     * API 30's factory WebView is Chromium 91, which parses both and runs the
     * app correctly (verified: main menu renders, accent tokens correct).
     * That makes 30 the lowest HONEST floor for the current build target.
     *
     * If you lower this, you are asserting the bundle parses on that API
     * level's factory WebView. Verify it on an emulator of that level before
     * changing the number -- `docs/DEVICE-CHECKLIST.md` has the commands.
     * Alternatively, set an explicit lower `build.target` in vite.config.ts,
     * re-verify, and then lower this together with it.
     */
    const gradle = readFileSync(resolve(process.cwd(), 'android/variables.gradle'), 'utf8')
    const match = /minSdkVersion\s*=\s*(\d+)/.exec(gradle)
    expect(match, 'minSdkVersion not found in android/variables.gradle').not.toBeNull()
    const minSdk = Number(match![1])
    expect(
      minSdk,
      'the bundle needs a Chromium 87+ WebView; API 30 ships Chromium 91, API 24 ships 53',
    ).toBeGreaterThanOrEqual(30)
  })
})

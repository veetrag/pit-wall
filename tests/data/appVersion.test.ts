import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/*
 * One version number, three places that used to disagree.
 *
 * Before this test: package.json said 0.1.0, android/app/build.gradle said
 * 1.1, and src/ui/MainMenu.tsx had "PIT WALL - v1.0" typed into the markup.
 * The number a player could actually SEE was the one nobody had updated, and
 * the number Play would show was a third thing.
 *
 * package.json is the single source. The menu reads it through a Vite define,
 * and this test pins the gradle file to it -- gradle cannot import JSON at
 * build time, and nothing else in the toolchain reads Android config.
 */
const ROOT = resolve(process.cwd())
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { version: string }
const gradle = readFileSync(resolve(ROOT, 'android/app/build.gradle'), 'utf8')

describe('the app version is stated once', () => {
  it('ANDROID versionName MATCHES package.json', () => {
    const m = gradle.match(/versionName\s+"([^"]+)"/)
    expect(m, 'could not find versionName in android/app/build.gradle').not.toBeNull()
    expect(m![1], [
      `android/app/build.gradle says versionName "${m?.[1]}"`,
      `package.json says version "${pkg.version}"`,
      'These must match. package.json is the source; update the gradle file.',
    ].join('\n')).toBe(pkg.version)
  })

  it('NO SOURCE FILE HARDCODES A VERSION STRING', () => {
    // The specific regression: "PIT WALL - v1.0" sat in MainMenu.tsx through
    // four feature releases, so the menu advertised a version that had not
    // been true for months.
    const menu = readFileSync(resolve(ROOT, 'src/ui/MainMenu.tsx'), 'utf8')
    expect(menu).not.toMatch(/v\d+\.\d+/)
    expect(menu, 'the menu must read the injected version').toContain('__APP_VERSION__')
  })

  it('versionCode is an integer ahead of what Play already has', () => {
    /*
     * Play rejects a duplicate versionCode outright. versionCode 2 is the AAB
     * that went to review, so anything shipped after it must be 3 or higher.
     * This does not know what Play actually holds -- it only stops the number
     * going backwards or being edited to something non-numeric.
     */
    const m = gradle.match(/versionCode\s+(\d+)/)
    expect(m).not.toBeNull()
    // 1.5 is versionCode 6; 1.6 must be 7+.
    expect(Number(m![1])).toBeGreaterThanOrEqual(7)
  })

  it('this release is 1.6.1', () => {
    expect(pkg.version).toBe('1.6.1')
  })
})

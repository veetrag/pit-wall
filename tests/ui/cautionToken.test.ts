import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/*
 * Reads sources as text, the same technique (and for the same reason) as
 * tests/state/storeBoundaries.test.ts: this repo has no ESLint config, so a
 * literal creeping back in would pass tsc, the build and every other test.
 */
const SOURCES = import.meta.glob('../../src/{ui,canvas}/**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/*
 * tokens.css is read through node:fs, not import.meta.glob('?raw').
 *
 * Vitest stubs CSS module content to an empty string (css is off by default),
 * so the glob resolves the path and hands back ''. An assertion against that
 * would have passed vacuously for any regex that can match nothing -- and
 * failed confusingly for every one that cannot.
 */
// Resolved from the repo root: vitest runs with cwd there, and import.meta.url
// is not a file: URL under this setup.
const TOKENS_CSS = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')

describe('--caution has one source of truth', () => {
  it('NO COMPONENT RESTATES THE CAUTION COLOUR', () => {
    /*
     * --caution used to exist in three shapes at once: the token in
     * tokens.css, a literal rgba(255,176,32,0.22) in TimingTower under a
     * comment asking whoever changed the token to remember this too, and
     * HudAlert's caution severity on #F2C94C -- which was not even the same
     * colour, but --tyre-medium, the one reuse the token file explicitly
     * legislates against.
     *
     * The token is now declared as channels (--caution-rgb) with the colour
     * derived from them, so a translucent wash references it instead of
     * restating it. This keeps it that way.
     */
    const offenders: string[] = []
    for (const [path, text] of Object.entries(SOURCES)) {
      // The channel triple in any spacing, or the hex, outside a comment line.
      for (const [i, line] of text.split('\n').entries()) {
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
        if (/255\s*,\s*176\s*,\s*32/.test(code) || /#FFB020/i.test(code)) {
          offenders.push(`${path.replace('../../', '')}:${i + 1}  ${line.trim()}`)
        }
      }
    }
    expect(offenders, [
      'These restate --caution instead of referencing it.',
      '',
      'Use var(--caution) for the solid colour, or',
      'rgba(var(--caution-rgb), <alpha>) for a translucent wash.',
      '',
      'Do NOT use color-mix(): minSdkVersion is 24 and color-mix needs',
      'Chromium 111, so the declaration is dropped on exactly the low-end',
      'devices this project targets.',
    ].join('\n')).toEqual([])
  })

  it('the token is still declared as channels with the colour derived', () => {
    // Guards the other half: if --caution went back to a bare hex, every
    // rgba(var(--caution-rgb), a) in the app would silently stop resolving and
    // those washes would vanish rather than fail.
    const css = TOKENS_CSS
    expect(css, 'channels must exist').toMatch(/--caution-rgb:\s*255,\s*176,\s*32/)
    expect(css, '--caution must derive from them').toMatch(/--caution:\s*rgb\(var\(--caution-rgb\)\)/)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/*
 * Sources read as text, the same technique as tests/state/storeBoundaries.test.ts
 * and tests/ui/cautionToken.test.ts: this repo has no ESLint config, so a
 * color-mix() creeping back in would pass tsc, the build, and every other test
 * -- and then fail only on a device nobody runs CI on.
 *
 * node:fs rather than import.meta.glob('?raw') because vitest stubs CSS module
 * content to an empty string, and this must cover tokens.css too. @types/node
 * IS installed; a comment in storeBoundaries.test.ts saying otherwise is stale.
 */
const SRC = resolve(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|css)$/.test(e.name) ? [path] : []
  })
}

/** Strips `//` line comments and `/* *\/` block-comment bodies. */
function stripComments(text: string): string[] {
  const out: string[] = []
  let inBlock = false
  for (const raw of text.split('\n')) {
    let line = raw
    if (inBlock) {
      const end = line.indexOf('*/')
      if (end === -1) { out.push(''); continue }
      line = line.slice(end + 2)
      inBlock = false
    }
    const start = line.indexOf('/*')
    if (start !== -1) {
      const end = line.indexOf('*/', start + 2)
      if (end === -1) { inBlock = true; line = line.slice(0, start) }
      else line = line.slice(0, start) + line.slice(end + 2)
    }
    out.push(line.replace(/\/\/.*$/, ''))
  }
  return out
}

describe('color-mix() is banned', () => {
  it('NO SOURCE FILE USES color-mix()', () => {
    /*
     * android/variables.gradle sets minSdkVersion 24. color-mix() needs
     * Chromium 111 (2023), and an unsupported CSS value is DROPPED, not
     * approximated -- so the declaration silently does nothing on exactly the
     * low-end devices this project targets, while looking perfect in dev.
     *
     * It survived in Development.tsx long after TimingTower documented the ban,
     * on a tier-pip glow that had ALREADY been lost once to a different
     * unparseable colour spelling, and on a maxed-row tint.
     *
     * Portable replacements:
     *   alpha over anything      -> rgba(var(--token-rgb), <alpha>)
     *   a tint over a SOLID base -> linear-gradient(<rgba>, <rgba>), <base>
     * The second is not interchangeable with the first: a bare rgba() over an
     * opaque surface makes it translucent rather than tinted.
     */
    const offenders: string[] = []
    for (const path of sourceFiles(SRC)) {
      const text = readFileSync(path, 'utf8')
      for (const [i, line] of stripComments(text).entries()) {
        if (line.includes('color-mix(')) {
          offenders.push(`${path.replace(process.cwd() + '/', '')}:${i + 1}`)
        }
      }
    }
    expect(offenders, [
      'color-mix() is unsupported at minSdkVersion 24 (needs Chromium 111).',
      'An unsupported value is DROPPED, so this styling silently vanishes on',
      'the low-end devices this project targets -- and looks fine in dev.',
      '',
      'Use rgba(var(--token-rgb), <alpha>) for alpha, or',
      'linear-gradient(<rgba>, <rgba>), <solid> to tint an opaque surface.',
    ].join('\n')).toEqual([])
  })

  it('finds the sources it claims to be checking', () => {
    // Without this, a bad glob or a moved src/ would make the ban above pass
    // by checking nothing at all.
    const files = sourceFiles(SRC)
    expect(files.length).toBeGreaterThan(30)
    expect(files.some(f => f.endsWith('tokens.css')), 'CSS must be covered').toBe(true)
    expect(files.some(f => f.endsWith('Development.tsx'))).toBe(true)
  })
})

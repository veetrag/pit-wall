import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/*
 * The app must fetch NOTHING to render or to play.
 *
 * Originally this guard leaned on the manifest: with no INTERNET permission,
 * a remote asset failed on device while working perfectly in the dev browser.
 * That is exactly how three Google Fonts <link> tags survived in index.html
 * from Phase 0 until they were measured on an emulator, with every timing
 * number in the game rendering in the system sans for the whole time.
 *
 * Cloud save added the INTERNET permission on 2026-09-26, and that makes this
 * file MORE important rather than less. The failure it catches used to be
 * loud: broken for everyone, including the developer, the moment it shipped.
 * Now a remote asset will load perfectly for an online player and fail only
 * for someone on a plane -- the exact user the offline promise is for, and the
 * one least able to report what went wrong.
 *
 * Play Games traffic is the ONE exception, and it does not belong to any
 * screen: it is a background sync that no frame waits on. Nothing the player
 * looks at may depend on a request.
 */
const ROOT = resolve(process.cwd())
const SRC = join(ROOT, 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|css|html)$/.test(e.name) ? [path] : []
  })
}

/*
 * Strips comment BODIES so that a URL merely discussed in prose does not fail
 * the ban, while a real one still does.
 *
 * The `//` line-comment rule is the trap: a naive /\/\/.*$/ also eats the
 * "//" in "https://fonts.googleapis.com", deleting the offending URL and
 * making this whole test pass by finding nothing. That is why `//` only counts
 * as a comment when it is NOT preceded by a colon. CSS and HTML have no line
 * comments at all, so the rule is applied to .ts/.tsx only.
 */
function stripComments(text: string, allowLineComments: boolean): string[] {
  const out: string[] = []
  let inBlock = false
  let inHtmlComment = false
  for (const raw of text.split('\n')) {
    let line = raw
    if (inHtmlComment) {
      const end = line.indexOf('-->')
      if (end === -1) { out.push(''); continue }
      line = line.slice(end + 3); inHtmlComment = false
    }
    if (inBlock) {
      const end = line.indexOf('*/')
      if (end === -1) { out.push(''); continue }
      line = line.slice(end + 2); inBlock = false
    }
    const hs = line.indexOf('<!--')
    if (hs !== -1) {
      const he = line.indexOf('-->', hs + 4)
      if (he === -1) { inHtmlComment = true; line = line.slice(0, hs) }
      else line = line.slice(0, hs) + line.slice(he + 3)
    }
    const start = line.indexOf('/*')
    if (start !== -1) {
      const end = line.indexOf('*/', start + 2)
      if (end === -1) { inBlock = true; line = line.slice(0, start) }
      else line = line.slice(0, start) + line.slice(end + 2)
    }
    // NOT /\/\/.*$/ -- see the comment above. A colon before `//` means URL.
    out.push(allowLineComments ? line.replace(/(^|[^:])\/\/.*$/, '$1') : line)
  }
  return out
}

const REMOTE = /\bhttps?:\/\/(?!localhost)[a-z0-9]/i

/*
 * An `xmlns` value is an XML NAMESPACE IDENTIFIER, not a resource: no browser
 * ever fetches http://www.w3.org/2000/svg, and every inline <svg> needs it.
 * Excluded by ATTRIBUTE rather than by domain, so an actual request to w3.org
 * -- or to any other host -- is still caught.
 */
const XMLNS = /\bxmlns(:[a-z]+)?=["'][^"']*["']/gi

describe('the app fetches nothing at runtime', () => {
  it('NO SHIPPED SOURCE REFERENCES A REMOTE URL', () => {
    const offenders: string[] = []
    for (const path of [join(ROOT, 'index.html'), ...sourceFiles(SRC)]) {
      const isTs = /\.tsx?$/.test(path)
      for (const [i, raw] of stripComments(readFileSync(path, 'utf8'), isTs).entries()) {
        const line = raw.replace(XMLNS, '')
        if (REMOTE.test(line)) offenders.push(`${path.replace(ROOT + '/', '')}:${i + 1}  ${line.trim()}`)
      }
    }
    expect(offenders, [
      'These reference a remote URL. The Android app has no INTERNET',
      'permission, so the request fails on device while working in the dev',
      'browser -- and it breaks the "collects nothing" data-safety claim.',
      'Vendor the asset into public/ instead.',
    ].join('\n')).toEqual([])
  })

  it('the fonts are vendored, not linked', () => {
    // The specific regression this file was written for.
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
    const faces = readFileSync(join(SRC, 'styles/fonts.css'), 'utf8')
    for (const file of ['inter-var', 'jetbrains-mono-var', 'rajdhani-500', 'rajdhani-600', 'rajdhani-700']) {
      expect(faces, `${file}.woff2 must be declared`).toContain(`/fonts/${file}.woff2`)
    }
    // Declared faces must actually exist, or they fail exactly like the <link> did.
    const shipped = readdirSync(join(ROOT, 'public/fonts'))
    for (const m of faces.matchAll(/url\('\/fonts\/([^']+)'\)/g)) {
      expect(shipped, `fonts.css references ${m[1]} which is not in public/fonts`).toContain(m[1])
    }
    // tokens.css is the only stylesheet App.tsx imports; without this line the
    // faces are never declared and every family silently falls back again.
    expect(readFileSync(join(SRC, 'styles/tokens.css'), 'utf8')).toContain("@import './fonts.css'")
  })

  it('the URL detector actually detects', () => {
    // Without this, a broken regex or a too-eager comment stripper would make
    // the ban above pass by examining nothing. The second case is the real
    // hazard: /\/\/.*$/ would reduce the URL to "https:" and find no match.
    expect(REMOTE.test("  <link href='https://fonts.googleapis.com/css2' />")).toBe(true)
    expect(stripComments(["const u = 'https://evil.example.com'"].join('\n'), true)[0])
      .toContain('https://evil.example.com')
    expect(REMOTE.test('// see https://example.com for why')).toBe(true)
    expect(stripComments(['// see https://example.com for why'].join('\n'), true)[0]).toBe('')
    expect(REMOTE.test("fetch('http://localhost:5173/x')")).toBe(false)
    // xmlns is excluded, but only as an attribute -- a real fetch to the same
    // host must still be caught, or the exclusion becomes a hole.
    expect(REMOTE.test('<svg xmlns="http://www.w3.org/2000/svg">'.replace(XMLNS, ''))).toBe(false)
    expect(REMOTE.test("fetch('http://www.w3.org/spec')".replace(XMLNS, ''))).toBe(true)
  })
})

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

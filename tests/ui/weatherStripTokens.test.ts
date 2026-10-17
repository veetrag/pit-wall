import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Strips // and /* *\/ comments so a hex quoted in a comment does not count. */
function code(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

describe('WeatherStrip uses tokens (spec 1.6 §10)', () => {
  it('HAS NO HEX COLOUR LITERALS, so the high-contrast palette reaches it', () => {
    expect(code('src/ui/WeatherStrip.tsx').match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []).toEqual([])
  })
})

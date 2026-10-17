import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../src/styles/tokens.css'), 'utf8')
const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')))

function hexOf(name: string): string {
  const direct = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(root)
  if (direct) return direct[1]!
  const rgb = new RegExp(`--${name}-rgb:\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)`).exec(root)
  if (rgb) return '#' + [rgb[1], rgb[2], rgb[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('')
  throw new Error(`token --${name} not found as a hex or -rgb channel triple`)
}
function lum(hex: string): number {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(hexOf(a)), lum(hexOf(b))].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

// hot text on --dusk / --dusk is NOT allowed (3.6:1); put hot text on ink, night or grape.
// [text, surface, minimum]. 4.5 = body text; 3 = display text >= 24px only.
const PAIRS: [string, string, number][] = [
  ...['white', 'lilac', 'lilac-dim', 'volt', 'hot', 'gain', 'caution'].flatMap(t =>
    ['ink', 'night', 'grape'].map(s => [t, s, 4.5] as [string, string, number])),
  ['white', 'dusk', 4.5], ['lilac', 'dusk', 4.5], ['lilac-dim', 'dusk', 4.5],
  ['volt', 'dusk', 4.5], ['gain', 'dusk', 4.5], ['caution', 'dusk', 4.5],
  ['ink', 'volt', 4.5], ['ink', 'hot', 4.5], ['ink', 'caution', 4.5], ['ink', 'gain', 4.5], ['ink', 'white', 4.5],
]

describe('token contrast (spec 3.1)', () => {
  for (const [t, s, min] of PAIRS) {
    it(`--${t} on --${s} >= ${min}:1`, () => { expect(ratio(t, s)).toBeGreaterThanOrEqual(min) })
  }
})

// ── Colour-blind tyre palette (spec 1.6 §10) ──────────────────────────────
const cbStart = css.indexOf(':root[data-palette="cb"]')
const cb = cbStart < 0 ? '' : css.slice(cbStart, css.indexOf('}', cbStart))

function cbHexOf(name: string): string {
  const direct = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(cb)
  if (direct) return direct[1]!
  const rgb = new RegExp(`--${name}-rgb:\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)`).exec(cb)
  if (rgb) return '#' + [rgb[1], rgb[2], rgb[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('')
  throw new Error(`cb token --${name} not found`)
}
const ratioHex = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}
const lstar = (hex: string) => { const Y = lum(hex); return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y }
const TYRES = ['tyre-soft', 'tyre-medium', 'tyre-hard', 'tyre-inter', 'tyre-wet']

describe('high-contrast tyre palette (spec 1.6 §10)', () => {
  it('exists', () => { expect(cbStart, 'tokens.css needs a :root[data-palette="cb"] block').toBeGreaterThan(0) })

  it.each(TYRES)('--%s is at least 3:1 on --ink', t => {
    expect(ratioHex(cbHexOf(t), hexOf('ink'))).toBeGreaterThanOrEqual(3)
  })

  it('separates soft and medium by lightness, not hue alone', () => {
    expect(Math.abs(lstar(cbHexOf('tyre-medium')) - lstar(cbHexOf('tyre-soft')))).toBeGreaterThanOrEqual(20)
  })

  it('OVERRIDES ONLY --tyre-* TOKENS, NEVER --hot', () => {
    const declared = [...cb.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]!)
    expect(declared.length).toBeGreaterThan(0)
    expect(declared.filter(n => !n.startsWith('--tyre-')), 'only tyre tokens may change').toEqual([])
    expect(cbHexOf('tyre-soft').toLowerCase()).not.toBe(hexOf('hot').toLowerCase())
  })

  it('the standard tyre tokens are also at least 3:1 on --ink', () => {
    for (const t of ['hot', 'tyre-medium', 'tyre-hard', 'tyre-inter', 'tyre-wet']) {
      expect(ratioHex(hexOf(t), hexOf('ink')), t).toBeGreaterThanOrEqual(3)
    }
  })

  it('--lilac-rgb matches --lilac', () => {
    const rgb = /--lilac-rgb:\s*(\d+),\s*(\d+),\s*(\d+)/.exec(root)
    expect(rgb, '--lilac-rgb must exist for translucent lilac').not.toBeNull()
    const hex = '#' + [rgb![1], rgb![2], rgb![3]].map(n => Number(n).toString(16).padStart(2, '0')).join('')
    expect(hex.toUpperCase()).toBe(/--lilac:\s*(#[0-9A-Fa-f]{6})/.exec(root)![1]!.toUpperCase())
  })
})

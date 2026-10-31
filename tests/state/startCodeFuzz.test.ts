import { describe, it, expect } from 'vitest'
import { createRng } from '@engine/rng'
import { encodeStart, decodeStart } from '@state/startCode'
import { FULL } from '../fixtures/startPayloads'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

describe('FUZZ: NEVER THROWS, NEVER ACCEPTS A MUTATION', () => {
  const code = encodeStart(FULL)
  it('5,000 random strings never throw and never decode', () => {
    const rng = createRng(2026)
    for (let i = 0; i < 5000; i++) {
      const len = Math.floor(rng() * 600)
      let s = rng() < 0.5 ? 'PW1-' : ''
      for (let k = 0; k < len; k++) s += ALPHABET[Math.floor(rng() * ALPHABET.length)]
      const r = decodeStart(s)
      expect(r.ok, s).toBe(false)
    }
  })
  it('every single-character mutation of a valid code is rejected', () => {
    for (let i = 4; i < code.length; i++) {
      for (const ch of ['A', 'z', '0', '-', '_']) {
        if (code[i] === ch) continue
        const r = decodeStart(code.slice(0, i) + ch + code.slice(i + 1))
        expect(r.ok, `pos ${i} -> ${ch}`).toBe(false)
      }
    }
  })
  it('every truncation is rejected', () => {
    for (let n = 0; n < code.length; n++) expect(decodeStart(code.slice(0, n)).ok, `len ${n}`).toBe(false)
  })
  it('hostile non-string-ish input is rejected, not thrown', () => {
    expect(decodeStart('PW1-' + '\u0000'.repeat(10)).ok).toBe(false)
    expect(decodeStart('<script>alert(1)</script>').ok).toBe(false)
  })
})

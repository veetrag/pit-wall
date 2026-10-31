import { describe, it, expect } from 'vitest'
import { fnv1a, fnv1aBytes, gameDataFingerprint } from '@state/fingerprint'

describe('fnv1a', () => {
  it('matches the published 32-bit test vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('a')).toBe(0xe40c292c)
    expect(fnv1a('foobar')).toBe(0xbf9cf968)
  })
  it('agrees between strings and bytes for ASCII', () => {
    expect(fnv1aBytes(new TextEncoder().encode('foobar'))).toBe(fnv1a('foobar'))
  })
  it('fingerprints the game data stably', () => {
    expect(gameDataFingerprint()).toBe(gameDataFingerprint())
    expect(Number.isInteger(gameDataFingerprint())).toBe(true)
  })
})

import { loadGameData } from '@data/validators'

/** FNV-1a 32-bit over UTF-16 code units (equal to the byte form for ASCII). Unsigned. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

export function fnv1aBytes(bytes: Uint8Array): number {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]!; h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

let cached: number | null = null
/**
 * A fingerprint of everything that decides a race: tuning (minus the test-only
 * bands), compounds, circuits, cars, drivers, strategies, upgrades. Two builds
 * with the same fingerprint race identically. Used to warn on drifted share
 * codes and to key daily bests (spec 2026-10-24 R18, R23).
 */
export function gameDataFingerprint(): number {
  if (cached !== null) return cached
  const d = loadGameData()
  const { _regressionBands: _b, ...tuning } = d.tuning
  cached = fnv1a(JSON.stringify({ tuning, compounds: d.compounds, circuits: d.circuits, cars: d.cars, drivers: d.drivers, strategies: d.strategies, upgrades: d.upgrades }))
  return cached
}

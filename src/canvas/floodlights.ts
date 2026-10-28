/**
 * Where a night circuit's floodlight pools sit, as fractions of the lap
 * (spec 2026-10-24 §2.3). One pool per ~110 px of track, 6-10 pools, evenly
 * spaced from a fixed offset so the layout is stable across resizes. Pure.
 */
export function floodlightPoints(arcLength: number, count: number): number[] {
  const n = Math.max(6, Math.min(10, Math.round(Math.max(count, arcLength / 110))))
  return Array.from({ length: n }, (_, i) => (0.04 + i / n) % 1)
}

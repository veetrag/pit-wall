import { CIRCUIT_PATHS } from '@data/circuitPaths'
/** Per-circuit outline (spec §3.4), fitted into width×height with a stroke inset. */
export function CircuitOutline({ circuitId, width, height, label }: { circuitId: string; width: number; height: number; label: string }) {
  const path = CIRCUIT_PATHS[circuitId]
  if (!path || path.points.length < 2) return null
  const xs = path.points.map(p => p[0] ?? 0), ys = path.points.map(p => p[1] ?? 0)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const pad = 5
  const s = Math.min((width - 2 * pad) / Math.max(1, maxX - minX), (height - 2 * pad) / Math.max(1, maxY - minY))
  const ox = (width - (maxX - minX) * s) / 2, oy = (height - (maxY - minY) * s) / 2
  const d = path.points.map((p, i) => `${i ? 'L' : 'M'}${((p[0] ?? 0) - minX) * s + ox} ${((p[1] ?? 0) - minY) * s + oy}`).join(' ') + ' Z'
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path d={d} fill="none" stroke="var(--volt)" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

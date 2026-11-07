import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { trackGrip, trackPaceDelta } from '@engine/index'
import { useReducedMotion } from '@ui/kit'

const SEGMENTS = 10

export function gripText(grip: number, delta: number): string {
  const pct = Math.round(grip * 100)
  return delta < 0.005 ? `${pct}% · rubbered in` : `${pct}% · +${delta.toFixed(2)}s/lap`
}

/**
 * Spec 2026-10-24 §4.5. One reading per lap: selects lap + timeline only.
 * On a wash the lost segments flash caution once, draining right-to-left
 * (opacity only under reduced motion).
 */
export function TrackGrip() {
  const lap = useRaceStore(s => s.raceState?.lap ?? 0)
  const timeline = useRaceStore(s => s.raceState?.weatherTimeline)
  const tuning = useRaceStore(s => s.config?.tuning)
  const reduced = useReducedMotion()
  const prevLit = useRef<number | null>(null)
  const grip = timeline && tuning ? trackGrip({ lap, weatherTimeline: timeline }, tuning) : 0
  const lit = Math.round(grip * SEGMENTS)
  // Committed after paint, so a double render (StrictMode) reads the same "before".
  useEffect(() => { prevLit.current = lit }, [lit])
  if (!timeline || !tuning) return null
  const st = { lap, weatherTimeline: timeline }
  const delta = trackPaceDelta(st, tuning)
  const pct = Math.round(grip * 100)
  const before = prevLit.current ?? lit
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-body)', fontSize: 12 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--lilac-dim)', letterSpacing: '0.08em' }}>TRACK GRIP</span>
      <div role="meter" aria-label="Track grip" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        aria-valuetext={`Track grip ${pct} percent, plus ${delta.toFixed(2)} seconds a lap`}
        style={{ display: 'grid', gridTemplateColumns: `repeat(${SEGMENTS}, 8px)`, gap: 2 }}>
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const on = i < lit
          const washed = i >= lit && i < before
          return (
            <motion.span key={`${i}-${washed ? lap : 'x'}`} className="slant-sm"
              initial={washed ? { opacity: 1, backgroundColor: 'var(--caution)' } : false}
              animate={{ opacity: on ? 1 : 0.35, backgroundColor: on ? 'var(--lilac)' : 'var(--dusk)' }}
              transition={{ duration: reduced ? 0 : washed ? 0.6 : 0.12, delay: washed && !reduced ? (before - 1 - i) * 0.05 : 0 }}
              style={{ height: 8 }} />
          )
        })}
      </div>
      <span style={{ color: 'var(--lilac)', fontVariantNumeric: 'tabular-nums' }}>{gripText(grip, delta)}</span>
    </div>
  )
}

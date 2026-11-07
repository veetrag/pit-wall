import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'
import { useReducedMotion, snapIn } from '@ui/kit'
import type { IncidentEvent } from '@engine/types'

type Tone = 'caution' | 'hot'

/**
 * The words race control says for one of the player's steward incidents
 * (spec 2026-10-24 §8.3). Warnings and investigations are caution, a penalty
 * is hot; the text always names it, so colour is never the only signal.
 * `warnings` is the player's warning count as of this event.
 */
export function stewardMessage(ev: IncidentEvent, warningsAllowed: number, warnings: number): { text: string; tone: Tone } | null {
  switch (ev.kind) {
    case 'track_limits': return warnings <= warningsAllowed ? { text: `TRACK LIMITS · WARNING ${warnings}/${warningsAllowed}`, tone: 'caution' } : null
    case 'penalty_issued': return { text: `${ev.timeLoss ?? 5}s TIME PENALTY`, tone: 'hot' }
    case 'unsafe_release': return { text: 'UNSAFE RELEASE — UNDER INVESTIGATION', tone: 'caution' }
    case 'penalty_served': return { text: `${ev.timeLoss ?? 5}s PENALTY SERVED`, tone: 'caution' }
    default: return null
  }
}

/** Number of incidents naming the player: a primitive, so a tick without a new one does not re-render. */
function usePlayerIncidentCount(): number {
  return useRaceStore(s => {
    const rs = s.raceState
    const id = s.config?.playerDriverId
    if (!rs || !id) return 0
    let n = 0
    for (const i of rs.incidents) if (i.driverId === id) n++
    return n
  })
}

/** The player's steward decisions, newest first, one at a time (spec §8.3). */
export function StewardToast() {
  const count = usePlayerIncidentCount()
  const seen = useRef(0)
  const [msg, setMsg] = useState<{ text: string; tone: Tone; id: number } | null>(null)
  const { impact } = useHaptics()
  const reduced = useReducedMotion()

  useEffect(() => {
    if (count < seen.current) seen.current = 0 // a new race
    if (count === seen.current) return
    const { raceState, config } = useRaceStore.getState()
    const me = raceState?.cars.find(c => c.isPlayer)
    if (!raceState || !config || !me) return
    const allowed = config.tuning.penalties.trackLimits.warningsAllowed
    const mine = raceState.incidents.filter(i => i.driverId === me.driverId)
    const fresh = mine.slice(seen.current).reverse()
    seen.current = mine.length
    // Walk newest first; the warning count steps back one per track_limits passed.
    let warnings = me.penalty?.warnings ?? 0
    for (const ev of fresh) {
      const m = stewardMessage(ev, allowed, warnings)
      if (ev.kind === 'track_limits') warnings--
      if (m) {
        setMsg(prev => ({ ...m, id: (prev?.id ?? 0) + 1 }))
        impact(m.tone === 'hot' ? ImpactStyle.Heavy : ImpactStyle.Light)
        break
      }
    }
  }, [count]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3500)
    return () => clearTimeout(t)
  }, [msg])

  return (
    <div role="status" aria-live="polite" data-testid="steward-toast" style={{
      position: 'absolute', top: 'calc(var(--safe-top) + 56px)', left: 12, right: 12, zIndex: 20, pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {msg && (
          <motion.div key={msg.id} {...snapIn(reduced)} exit={{ opacity: 0 }} className="slant-md" data-tone={msg.tone}
            style={{
              background: msg.tone === 'hot' ? 'var(--hot)' : 'var(--caution)', color: 'var(--ink)', padding: '8px 14px',
              fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 18,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em',
            }}>
            <span style={{ fontFamily: 'var(--font-body)', fontStyle: 'normal', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', marginRight: 8 }}>
              STEWARDS
            </span>
            {msg.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

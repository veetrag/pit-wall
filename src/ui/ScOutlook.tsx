import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { neutralisationOutlook, type NeutralisationOutlook, type OutlookReason } from '@engine/index'
import { useReducedMotion, snapIn, PRESS } from '@ui/kit'
import { useUiTap } from '@hooks/useUiTap'

export const REASON_TEXT: Record<OutlookReason, string> = {
  street: 'Street circuit — walls punish mistakes',
  wet: 'Wet track — more mistakes',
  worn_tyres: 'Cars running past the cliff',
  sc_used: 'Safety cars used up — VSC or red only',
  all_used: 'Every neutralisation used',
}
const BAND = { low: 'LOW', medium: 'MED', high: 'HIGH' } as const

export function outlookLabel(o: NeutralisationOutlook): string {
  return o.kind === 'out' ? 'SC OUT' : `SC ${Math.round(o.chance * 100)}% · ${BAND[o.band]}`
}

/**
 * Once per lap end, not per sector: the number must not flicker (spec §9.3).
 * Subscribes to `lap` and `safetyCar` only, so sector ticks never re-render.
 */
export function useLapOutlook(): NeutralisationOutlook | null {
  const lap = useRaceStore(s => s.raceState?.lap)
  const sc = useRaceStore(s => s.raceState?.safetyCar)
  const config = useRaceStore(s => s.config)
  return useMemo(() => {
    const st = useRaceStore.getState().raceState
    // Partial states (tests, mid-reset) carry no cars/incidents yet: show nothing rather than throw.
    if (!config || !st || !Array.isArray(st.cars) || !Array.isArray(st.incidents)) return null
    return neutralisationOutlook(config, st)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lap/sc are the recompute triggers
  }, [config, lap, sc])
}

/** The pit panel's line (spec §9.1), or null when OUT / no race. Same once-per-lap cadence as the meter. */
export function useScChanceLine(): string | null {
  const o = useLapOutlook()
  return o && o.kind === 'clear' ? `SC CHANCE NEXT ${o.horizon} LAPS: ${Math.round(o.chance * 100)}%` : null
}

export function ScOutlook() {
  const o = useLapOutlook()
  const [open, setOpen] = useState(false)
  const reduced = useReducedMotion()
  const uiTap = useUiTap()
  if (!o) return null
  const level = o.kind === 'out' ? 3 : o.band === 'high' ? 3 : o.band === 'medium' ? 2 : 1
  const pulse = !reduced && o.kind === 'clear' && o.band === 'high'
  const spoken = o.kind === 'out'
    ? 'Safety car or VSC out now'
    : `Safety car chance next ${o.horizon} laps ${Math.round(o.chance * 100)} percent, ${o.band}`
  return (
    <div style={{ position: 'relative' }}>
      <motion.button type="button" aria-label={spoken} aria-expanded={open} className="slant-sm kit-focus"
        whileTap={reduced ? undefined : { scale: 0.96 }} transition={PRESS}
        onClick={() => { uiTap(); setOpen(v => !v) }}
        style={{ minHeight: 44, minWidth: 44, padding: '0 10px', border: 'none', background: 'var(--grape)', color: 'var(--lilac)',
          display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12,
          fontVariantNumeric: 'tabular-nums', cursor: 'pointer' }}>
        <span aria-hidden style={{ display: 'flex', gap: 2 }}>
          {[1, 2, 3].map(i => (
            <motion.span key={i} className="slant-sm"
              animate={pulse && i === 3 ? { opacity: [1, 0.5, 1] } : { opacity: i <= level ? 1 : 0.25 }}
              transition={pulse && i === 3 ? { duration: 1.2, repeat: Infinity } : { duration: 0 }}
              style={{ width: 14, height: 8, background: 'var(--caution)', opacity: i <= level ? 1 : 0.25 }} />
          ))}
        </span>
        <span>{outlookLabel(o)}</span>
      </motion.button>
      <AnimatePresence>
        {open && o.kind === 'clear' && (
          <motion.div {...snapIn(reduced)} role="dialog" aria-label="Safety car outlook" className="slant-md"
            style={{ position: 'absolute', top: 50, right: 0, zIndex: 20, width: 240, padding: 12, background: 'var(--night)',
              border: '1px solid var(--dusk)', color: 'var(--lilac)', fontFamily: 'var(--font-body)', fontSize: 13,
              display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ color: 'var(--white)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              SC or VSC in the next {o.horizon} laps: {Math.round(o.chance * 100)}%
            </div>
            {o.reasons.length === 0 ? <div>Nothing unusual.</div> : o.reasons.map(r => <div key={r}><span aria-hidden>· </span><span>{REASON_TEXT[r]}</span></div>)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

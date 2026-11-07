import { useEffect, useMemo, useRef, useState } from 'react'
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
/** Spec §9.3: lit segments step 35/65/100% opacity; unlit ones are a faint outline of the scale. */
const SEG_OPACITY = [0.35, 0.65, 1] as const
function segOpacity(i: number, level: number): number {
  return i <= level ? SEG_OPACITY[i - 1] ?? 1 : 0.12
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- lap/sc are the recompute triggers
  return useMemo(() => sharedOutlook(config, lap, sc), [config, lap, sc])
}

/**
 * One computation per (config, lap, safetyCar), shared by every subscriber
 * (top-bar meter and pit panel): a single-entry module cache.
 */
let cache: { config: unknown; lap: unknown; sc: unknown; value: NeutralisationOutlook | null } | null = null
function sharedOutlook(config: RaceConfigOf, lap: number | undefined, sc: unknown): NeutralisationOutlook | null {
  if (cache && cache.config === config && cache.lap === lap && cache.sc === sc) return cache.value
  const st = useRaceStore.getState().raceState
  // Partial states (tests, mid-reset) carry no cars/incidents yet: show nothing rather than throw.
  const value = !config || !st || !Array.isArray(st.cars) || !Array.isArray(st.incidents)
    ? null
    : neutralisationOutlook(config, st)
  cache = { config, lap, sc, value }
  return value
}
type RaceConfigOf = ReturnType<typeof useRaceStore.getState>['config']

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
  const btnRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const lap = useRaceStore(st => st.raceState?.lap)
  const canOpen = o?.kind === 'clear'
  const showCard = open && canOpen

  // Close on lap change (the number under the card just moved) and when OUT.
  useEffect(() => { setOpen(false) }, [lap, canOpen])

  useEffect(() => {
    if (!showCard) return
    cardRef.current?.focus()
    const close = () => { setOpen(false); btnRef.current?.focus() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!cardRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown) }
  }, [showCard])

  if (!o) return null
  const level = o.kind === 'out' ? 3 : o.band === 'high' ? 3 : o.band === 'medium' ? 2 : 1
  const pulse = !reduced && o.kind === 'clear' && o.band === 'high'
  const spoken = o.kind === 'out'
    ? 'Safety car or VSC out now'
    : `Safety car chance next ${o.horizon} laps ${Math.round(o.chance * 100)} percent, ${o.band}`
  return (
    <div style={{ position: 'relative' }}>
      <motion.button ref={btnRef} type="button" aria-label={spoken} aria-expanded={canOpen ? showCard : undefined} className="slant-sm kit-focus"
        whileTap={reduced ? undefined : { scale: 0.96 }} transition={PRESS}
        onClick={() => { uiTap(); if (canOpen) setOpen(v => !v) }}
        style={{ minHeight: 44, minWidth: 44, padding: '0 10px', border: 'none', background: 'var(--grape)', color: 'var(--lilac)',
          display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12,
          fontVariantNumeric: 'tabular-nums', cursor: 'pointer' }}>
        <span aria-hidden style={{ display: 'flex', gap: 2 }}>
          {[1, 2, 3].map(i => (
            <motion.span key={i} className="slant-sm"
              data-testid="sc-seg"
              animate={pulse && i === 3 ? { opacity: [1, 0.5, 1] } : { opacity: segOpacity(i, level) }}
              transition={pulse && i === 3 ? { duration: 1.2, repeat: Infinity } : { duration: 0 }}
              style={{ width: 14, height: 8, background: 'var(--caution)', opacity: segOpacity(i, level) }} />
          ))}
        </span>
        <span>{outlookLabel(o)}</span>
      </motion.button>
      <AnimatePresence>
        {showCard && o.kind === 'clear' && (
          <motion.div ref={cardRef} tabIndex={-1} {...snapIn(reduced)} role="dialog" aria-label="Safety car outlook" className="slant-md"
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

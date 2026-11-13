import { motion } from 'framer-motion'
import type { Compound } from '@engine/types'
import { TyreChip } from './TyreChip'
import { EASE, useReducedMotion } from './motion'

// Segment colours burn volt -> hot with wear (spec §4).
const RAMP = ['var(--volt)', 'var(--volt)', 'var(--volt)', 'var(--caution)', 'var(--caution)', 'var(--hot)', 'var(--hot)', 'var(--hot)', 'var(--hot)', 'var(--hot)']

// Tyre temperature (2.1, spec §5.4). Words carry the zone; colour only
// reinforces it. No degrees anywhere on the HUD (ruling H5).
type ThermalZone = 'cold' | 'window' | 'hot'
const ZONE_LABEL = { cold: 'COLD', window: 'IN WINDOW', hot: 'HOT' } as const satisfies Record<ThermalZone, string>
const ZONE_TEXT = { cold: 'Cold', window: 'In window', hot: 'Overheating' } as const satisfies Record<ThermalZone, string>
const ZONE_COLOR = { cold: 'var(--lilac-dim)', window: 'var(--gain)', hot: 'var(--hot)' } as const satisfies Record<ThermalZone, string>

export interface TyreThermal {
  zone: ThermalZone
  /** Marker position in [0, 1]; the window is the bar's middle half (0.25-0.75). */
  pos: number
  /** Laps of graining left; 0 = none. */
  grainLaps: number
}

export function TyreMeter({ compound, wear, lapsOnTyre, cliffLaps, pastCliff = false, thermal }: {
  compound: Compound; wear: number; lapsOnTyre: number; cliffLaps: number | null; pastCliff?: boolean
  /** Absent while tyre temperature is off: the meter is then exactly the 2.0 one. */
  thermal?: TyreThermal
}) {
  const reduced = useReducedMotion()
  const pct = Math.round(Math.min(1, Math.max(0, wear)) * 100)
  const lit = Math.min(10, Math.round(pct / 10))
  const urgent = pastCliff || (cliffLaps !== null && cliffLaps <= 3)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 14 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TyreChip compound={compound} size={22} />{pct}% worn · {lapsOnTyre} {lapsOnTyre === 1 ? 'lap' : 'laps'}</span>
        <span style={{ color: urgent ? 'var(--hot)' : 'var(--lilac)' }}>{pastCliff ? '⚠ PAST CLIFF' : cliffLaps === null ? '' : `CLIFF ~${cliffLaps}L`}</span>
      </div>
      <div role="meter" aria-label="Tyre wear" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 3 }}>
        {RAMP.map((c, i) => {
          const on = i < lit
          const pulse = on && i === lit - 1 && urgent && !reduced
          return <motion.span key={i} data-lit={on} className="slant-sm"
            animate={pulse ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
            transition={pulse ? { duration: 0.8, repeat: Infinity } : { duration: 0 }}
            style={{ height: 12, background: on ? c : 'var(--dusk)' }} />
        })}
      </div>
      {thermal && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div role="meter" aria-label="Tyre temperature" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round(thermal.pos * 100)} aria-valuetext={ZONE_TEXT[thermal.zone]}
            style={{ position: 'relative', flex: 1, height: 8, display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 2 }}>
            <span className="slant-sm" style={{ background: 'var(--dusk)' }} />
            <span className="slant-sm" style={{ background: 'rgba(var(--gain-rgb), 0.55)' }} />
            <span className="slant-sm" style={{ background: 'rgba(var(--hot-rgb), 0.55)' }} />
            {/* A full-width carrier slides by transform (a % of its own width = the
                track's), so a tick re-composites rather than re-laying out. */}
            <motion.span data-thermal-marker initial={false} animate={{ x: `${thermal.pos * 100}%` }}
              transition={{ duration: reduced ? 0 : 0.2, ease: EASE }}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <span style={{ position: 'absolute', left: 0, top: -3, width: 3, height: 14, marginLeft: -1.5, background: 'var(--white)' }} />
            </motion.span>
          </div>
          {/* Keyed on the zone: a change of zone snaps the word in along the slant (opacity only when reduced). */}
          <motion.span key={thermal.zone}
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.18, ease: EASE }}
            style={{
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, letterSpacing: 0.5,
              minWidth: 44, whiteSpace: 'nowrap', color: ZONE_COLOR[thermal.zone],
            }}>
            {ZONE_LABEL[thermal.zone]}
          </motion.span>
          {thermal.grainLaps > 0 && (
            <span className="slant-sm" style={{
              background: 'var(--caution)', color: 'var(--ink)', fontWeight: 800, fontSize: 11,
              padding: '2px 6px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
            }}>
              GRAINING {thermal.grainLaps}L
            </span>
          )}
        </div>
      )}
    </div>
  )
}

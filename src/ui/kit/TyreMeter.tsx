import { motion } from 'framer-motion'
import type { Compound } from '@engine/types'
import { TyreChip } from './TyreChip'
import { useReducedMotion } from './motion'

// Segment colours burn volt -> hot with wear (spec §4).
const RAMP = ['var(--volt)', 'var(--volt)', 'var(--volt)', 'var(--caution)', 'var(--caution)', 'var(--hot)', 'var(--hot)', 'var(--hot)', 'var(--hot)', 'var(--hot)']

export function TyreMeter({ compound, wear, lapsOnTyre, cliffLaps, pastCliff = false }: {
  compound: Compound; wear: number; lapsOnTyre: number; cliffLaps: number | null; pastCliff?: boolean
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
    </div>
  )
}

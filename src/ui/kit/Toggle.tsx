import { useId } from 'react'
import { motion } from 'framer-motion'
import { useUiTap } from '@hooks/useUiTap'
import { PRESS } from './motion'
/** Slanted switch row (spec §4 Toggle). The whole row is the switch: label, sub and track. */
export function KitToggle({ label, sub, checked, onChange, disabled }: {
  label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  const uiTap = useUiTap()
  const id = useId()
  const labelId = `${id}-l`, subId = `${id}-s`
  return (
    <button type="button" role="switch" aria-checked={checked} aria-labelledby={labelId} aria-describedby={sub ? subId : undefined} disabled={disabled}
      className="slant-row kit-focus" onClick={() => { uiTap(); onChange(!checked) }}
      style={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px 10px 20px',
        border: 'none', background: 'var(--grape)', color: 'var(--white)', textAlign: 'left',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span id={labelId} style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 15 }}>{label}</span>
        {sub && <span id={subId} style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12, color: 'var(--lilac)' }}>{sub}</span>}
      </span>
      <span aria-hidden="true" className="slant-sm" style={{ position: 'relative', width: 52, height: 28, flexShrink: 0,
        background: checked ? 'var(--volt)' : 'var(--dusk)', transition: 'background 0.12s' }}>
        <motion.span animate={{ x: checked ? 26 : 6 }} transition={PRESS}
          style={{ position: 'absolute', top: 4, left: 0, width: 20, height: 20, background: 'var(--ink)', transform: 'skewX(-14deg)' }} />
      </span>
    </button>
  )
}
